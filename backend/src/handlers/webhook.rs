use axum::extract::{State, Json};
use axum::http::HeaderMap;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use utoipa::ToSchema;

use crate::error::{AppError, Result};
use crate::models::{Platform, Transaction, TransactionStatus};
use crate::services::split_engine;
use crate::AppState;

/// Payload we expect from payment gateways.
#[derive(Debug, Deserialize, Serialize, ToSchema)]
pub struct WebhookPayload {
    pub transaction_id: String,
    pub amount: i64,
    pub currency: String,
    pub payer_phone: Option<String>,
    pub payer_name: Option<String>,
    pub status: String,
    pub metadata: Option<Value>,
    pub timestamp: Option<String>,
}

/// Ingest a payment webhook notification.
///
/// Verifies the HMAC signature, deduplicates by external reference,
/// computes split allocations, and enqueues payout jobs.
#[utoipa::path(
    post,
    path = "/api/v1/webhook/ingress",
    tag = "webhooks",
    request_body = WebhookPayload,
    responses(
        (status = 200, description = "Webhook processed or deduplicated", body = serde_json::Value),
        (status = 400, description = "Invalid payload or missing fields", body = crate::error::ErrorResponse),
        (status = 401, description = "Invalid HMAC signature", body = crate::error::ErrorResponse),
    ),
    security(
        ("WebhookSignature" = ["X-Webhook-Signature"])
    )
)]
pub async fn ingress(
    State(state): State<std::sync::Arc<AppState>>,
    headers: HeaderMap,
    body_bytes: axum::body::Bytes,
) -> Result<Json<serde_json::Value>> {
    // Parse payload from the raw bytes so we can store the full body
    let payload: WebhookPayload = serde_json::from_slice(&body_bytes)
        .map_err(|e| AppError::BadRequest(format!("invalid JSON: {e}")))?;

    let platform = extract_and_verify_platform(&state, &headers, &payload, &body_bytes).await?;

    // Record the delivery attempt
    let source_ip = headers.get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.split(',').next().unwrap_or(s).trim().to_string());
    let request_body: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap_or_default();
    let delivery_id = uuid::Uuid::new_v4();
    sqlx::query(
        r#"INSERT INTO webhook_deliveries (id, platform_id, external_ref, status, request_body, source_ip)
           VALUES ($1, $2, $3, 'processing', $4, $5)"#,
    )
    .bind(delivery_id)
    .bind(platform.id)
    .bind(&payload.transaction_id)
    .bind(&request_body)
    .bind(&source_ip)
    .execute(&state.db)
    .await?;

    // Atomic idempotency check — use INSERT ON CONFLICT to handle concurrent delivery
    let raw_payload_json = String::from_utf8_lossy(&body_bytes).to_string();
    let status_str = TransactionStatus::Received.to_string();

    let insert_result = sqlx::query_as::<_, Transaction>(
        r#"
        INSERT INTO transactions (platform_id, external_ref, amount_cents, currency, status, raw_payload)
        VALUES ($1, $2, $3, $4, $5::transaction_status, $6)
        ON CONFLICT (external_ref, platform_id) DO NOTHING
        RETURNING id, platform_id, external_ref, amount_cents, currency,
                  status as "status: TransactionStatus",
                  raw_payload, received_at, processed_at
        "#,
    )
    .bind(platform.id)
    .bind(&payload.transaction_id)
    .bind(payload.amount)
    .bind(&payload.currency)
    .bind(&status_str)
    .bind(&raw_payload_json)
    .fetch_optional(&state.db)
    .await?;

    let transaction = match insert_result {
        Some(tx) => tx,
        None => {
            // Duplicate webhook — the ON CONFLICT did nothing, so this is a repeat
            tracing::info!(tx_ref = %payload.transaction_id, "duplicate webhook — already processed");
            return Ok(Json(serde_json::json!({
                "status": "ignored",
                "reason": "duplicate",
            })));
        }
    };

    tracing::info!(
        tx_id = %transaction.id,
        tx_ref = %payload.transaction_id,
        amount = payload.amount,
        source_ip = headers.get("x-forwarded-for").and_then(|v| v.to_str().ok()).unwrap_or("unknown"),
        "webhook received, computing splits",
    );

    let split_result = split_engine::compute_and_record(&state.db, &transaction, &platform).await?;

    for entry in &split_result.vendor_credits {
        let payout_id = uuid::Uuid::new_v4();

        sqlx::query(
            r#"
            INSERT INTO payout_jobs (id, transaction_id, vendor_id, amount_cents, status, attempts)
            VALUES ($1, $2, $3, $4, 'queued', 0)
            "#,
        )
        .bind(payout_id)
        .bind(transaction.id)
        .bind(entry.vendor_id)
        .bind(entry.amount_cents)
        .execute(&state.db)
        .await?;

        let job_payload = serde_json::json!({
            "job_id": payout_id,
            "transaction_id": transaction.id,
            "vendor_id": entry.vendor_id,
            "amount_cents": entry.amount_cents,
        });

        let mut redis = state.redis.clone();
        if let Err(e) = redis::cmd("LPUSH")
            .arg("conduit:payout_queue")
            .arg(serde_json::to_string(&job_payload)?)
            .query_async::<_, ()>(&mut redis)
            .await
        {
            // Redis is down — log the error and mark the job for retry
            tracing::error!(
                job_id = %payout_id,
                error = ?e,
                "failed to enqueue payout job — will be retried by worker"
            );
            sqlx::query(
                "UPDATE payout_jobs SET last_error = $1 WHERE id = $2",
            )
            .bind(format!("redis enqueue failed: {e}"))
            .bind(payout_id)
            .execute(&state.db)
            .await?;
        } else {
            tracing::info!(job_id = %payout_id, vendor_id = %entry.vendor_id, amount = entry.amount_cents, "payout job queued");
        }
    }

    let status_str = TransactionStatus::SplitComputed.to_string();
    sqlx::query(
        "UPDATE transactions SET status = $1::transaction_status, processed_at = NOW() WHERE id = $2",
    )
    .bind(&status_str)
    .bind(transaction.id)
    .execute(&state.db)
    .await?;

    // Mark delivery as completed
    sqlx::query(
        "UPDATE webhook_deliveries SET status = 'completed', transaction_id = $1, completed_at = NOW() WHERE id = $2",
    )
    .bind(transaction.id)
    .bind(delivery_id)
    .execute(&state.db)
    .await?;

    Ok(Json(serde_json::json!({
        "status": "processed",
        "transaction_id": transaction.id,
        "splits_computed": split_result.vendor_credits.len() + 1,
        "delivery_id": delivery_id,
    })))
}

async fn extract_and_verify_platform(
    state: &AppState,
    headers: &HeaderMap,
    payload: &WebhookPayload,
    body_bytes: &[u8],
) -> Result<Platform> {
    let platform_ref = payload
        .metadata
        .as_ref()
        .and_then(|m| m.get("platform_ref"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::BadRequest("missing metadata.platform_ref".into()))?;

    let platform_id: uuid::Uuid = platform_ref
        .parse()
        .map_err(|_| AppError::BadRequest("invalid platform_ref format".into()))?;

    let platform = sqlx::query_as::<_, Platform>(
        "SELECT id, name, webhook_secret, created_at, updated_at FROM platforms WHERE id = $1",
    )
    .bind(platform_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    let signature_header = headers
        .get("X-Webhook-Signature")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| AppError::BadRequest("missing signature header".into()))?;

    use hmac::{Hmac, Mac};
    use sha2::Sha256;
    type HmacSha256 = Hmac<Sha256>;

    let mut mac = HmacSha256::new_from_slice(platform.webhook_secret.as_bytes())
        .map_err(|e| AppError::Internal(anyhow::anyhow!("hmac init error: {e}")))?;
    mac.update(body_bytes);

    // Parse the expected signature from hex
    let expected_bytes = hex::decode(signature_header)
        .map_err(|_| AppError::BadRequest("invalid signature format (expected hex)".into()))?;

    // Constant-time comparison — prevents timing attacks
    mac.verify_slice(&expected_bytes)
        .map_err(|_| AppError::Unauthorized)?;

    Ok(platform)
}
