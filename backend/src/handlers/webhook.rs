use axum::extract::{State, Json};
use axum::http::HeaderMap;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::{AppError, Result};
use crate::models::{Platform, Transaction, TransactionStatus};
use crate::services::split_engine;
use crate::AppState;

/// Payload we expect from payment gateways.
#[derive(Debug, Deserialize, Serialize)]
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

/// POST /api/v1/webhook/ingress
pub async fn ingress(
    State(state): State<std::sync::Arc<AppState>>,
    headers: HeaderMap,
    Json(payload): Json<WebhookPayload>,
) -> Result<Json<serde_json::Value>> {
    let platform = extract_and_verify_platform(&state, &headers, &payload).await?;

    let existing: Option<(uuid::Uuid,)> = sqlx::query_as(
        "SELECT id FROM transactions WHERE external_ref = $1 AND platform_id = $2",
    )
    .bind(&payload.transaction_id)
    .bind(platform.id)
    .fetch_optional(&state.db)
    .await?;

    if existing.is_some() {
        tracing::info!(tx_ref = %payload.transaction_id, "duplicate webhook — skipping");
        return Ok(Json(serde_json::json!({
            "status": "ignored",
            "reason": "duplicate",
        })));
    }

    let raw_payload_json = payload
        .metadata
        .as_ref()
        .map(|m| serde_json::to_string(m).unwrap_or_default());

    let status_str = TransactionStatus::Received.to_string();

    let transaction = sqlx::query_as::<_, Transaction>(
        r#"
        INSERT INTO transactions (platform_id, external_ref, amount_cents, currency, status, raw_payload)
        VALUES ($1, $2, $3, $4, $5::transaction_status, $6)
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
    .fetch_one(&state.db)
    .await?;

    tracing::info!(
        tx_id = %transaction.id,
        tx_ref = %payload.transaction_id,
        amount = payload.amount,
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
        let _ = redis::cmd("LPUSH")
            .arg("conduit:payout_queue")
            .arg(serde_json::to_string(&job_payload)?)
            .query_async::<_, ()>(&mut redis)
            .await;

        tracing::info!(job_id = %payout_id, vendor_id = %entry.vendor_id, amount = entry.amount_cents, "payout job queued");
    }

    let status_str = TransactionStatus::SplitComputed.to_string();
    sqlx::query(
        "UPDATE transactions SET status = $1::transaction_status, processed_at = NOW() WHERE id = $2",
    )
    .bind(&status_str)
    .bind(transaction.id)
    .execute(&state.db)
    .await?;

    Ok(Json(serde_json::json!({
        "status": "processed",
        "transaction_id": transaction.id,
        "splits_computed": split_result.vendor_credits.len() + 1,
    })))
}

async fn extract_and_verify_platform(
    state: &AppState,
    headers: &HeaderMap,
    payload: &WebhookPayload,
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

    let body_bytes = serde_json::to_vec(payload)?;

    use hmac::{Hmac, Mac};
    use sha2::Sha256;
    type HmacSha256 = Hmac<Sha256>;

    let mut mac = HmacSha256::new_from_slice(platform.webhook_secret.as_bytes())
        .map_err(|e| AppError::Internal(anyhow::anyhow!("hmac init error: {e}")))?;
    mac.update(&body_bytes);
    let computed = hex::encode(mac.finalize().into_bytes());

    if signature_header != computed {
        return Err(AppError::Unauthorized);
    }

    Ok(platform)
}
