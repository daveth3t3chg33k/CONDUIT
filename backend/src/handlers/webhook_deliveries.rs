use axum::extract::{Path, State, Json};
use axum::http::HeaderMap;
use serde::Deserialize;
use uuid::Uuid;

use crate::error::{AppError, Result};
use crate::models::{WebhookDelivery, WebhookDeliveryStatus};
use crate::AppState;

#[derive(Debug, Deserialize)]
pub struct ListParams {
    pub platform_id: Option<Uuid>,
    pub status: Option<String>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

/// List webhook deliveries.
///
/// Supports filtering by platform and status. Results ordered by received_at
/// descending (newest first). Dead-letter entries are highlighted.
#[utoipa::path(
    get,
    path = "/api/v1/webhook-deliveries",
    tag = "webhook-deliveries",
    params(
        ("platform_id" = Option<Uuid>, Query, description = "Filter by platform UUID"),
        ("status" = Option<String>, Query, description = "Filter by status: received, processing, completed, failed, dead_letter"),
        ("limit" = Option<u32>, Query, description = "Max results (default 50, max 200)"),
        ("offset" = Option<u32>, Query, description = "Pagination offset"),
    ),
    responses(
        (status = 200, description = "List of webhook deliveries", body = Vec<WebhookDelivery>),
    ),
    security(
        ("BearerAuth" = [])
    )
)]
pub async fn list(
    State(state): State<std::sync::Arc<AppState>>,
    axum::extract::Query(params): axum::extract::Query<ListParams>,
) -> Result<Json<Vec<WebhookDelivery>>> {
    let limit = params.limit.unwrap_or(50).min(200) as i64;
    let offset = params.offset.unwrap_or(0) as i64;

    let deliveries = if let Some(ref status) = params.status {
        sqlx::query_as::<_, WebhookDelivery>(
            r#"
            SELECT id, platform_id, transaction_id, external_ref,
                   status as "status: WebhookDeliveryStatus",
                   request_body, response_body, status_code, error_message,
                   attempts, max_attempts, next_retry_at, source_ip,
                   received_at, completed_at, created_at
            FROM webhook_deliveries
            WHERE status = $1
            ORDER BY received_at DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(status.as_str())
        .bind(limit)
        .bind(offset)
        .fetch_all(&state.db)
        .await?
    } else if let Some(platform_id) = params.platform_id {
        sqlx::query_as::<_, WebhookDelivery>(
            r#"
            SELECT id, platform_id, transaction_id, external_ref,
                   status as "status: WebhookDeliveryStatus",
                   request_body, response_body, status_code, error_message,
                   attempts, max_attempts, next_retry_at, source_ip,
                   received_at, completed_at, created_at
            FROM webhook_deliveries
            WHERE platform_id = $1
            ORDER BY received_at DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(platform_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(&state.db)
        .await?
    } else {
        sqlx::query_as::<_, WebhookDelivery>(
            r#"
            SELECT id, platform_id, transaction_id, external_ref,
                   status as "status: WebhookDeliveryStatus",
                   request_body, response_body, status_code, error_message,
                   attempts, max_attempts, next_retry_at, source_ip,
                   received_at, completed_at, created_at
            FROM webhook_deliveries
            ORDER BY received_at DESC
            LIMIT $1 OFFSET $2
            "#,
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(&state.db)
        .await?
    };

    Ok(Json(deliveries))
}

/// Get a single webhook delivery by ID.
#[utoipa::path(
    get,
    path = "/api/v1/webhook-deliveries/{delivery_id}",
    tag = "webhook-deliveries",
    params(
        ("delivery_id" = Uuid, Path, description = "Webhook delivery UUID"),
    ),
    responses(
        (status = 200, description = "Webhook delivery details", body = WebhookDelivery),
        (status = 404, description = "Delivery not found", body = crate::error::ErrorResponse),
    ),
    security(
        ("BearerAuth" = [])
    )
)]
pub async fn get_one(
    State(state): State<std::sync::Arc<AppState>>,
    Path(delivery_id): Path<Uuid>,
) -> Result<Json<WebhookDelivery>> {
    let delivery = sqlx::query_as::<_, WebhookDelivery>(
        r#"
        SELECT id, platform_id, transaction_id, external_ref,
               status as "status: WebhookDeliveryStatus",
               request_body, response_body, status_code, error_message,
               attempts, max_attempts, next_retry_at, source_ip,
               received_at, completed_at, created_at
        FROM webhook_deliveries
        WHERE id = $1
        "#,
    )
    .bind(delivery_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(delivery))
}

/// Replay a failed or dead-lettered webhook delivery.
///
/// Re-processes the original request body through the webhook ingress
/// pipeline, creating a new delivery record and transaction.
#[utoipa::path(
    post,
    path = "/api/v1/webhook-deliveries/{delivery_id}/replay",
    tag = "webhook-deliveries",
    params(
        ("delivery_id" = Uuid, Path, description = "Webhook delivery UUID to replay"),
    ),
    responses(
        (status = 200, description = "Webhook replayed successfully", body = serde_json::Value),
        (status = 404, description = "Delivery not found", body = crate::error::ErrorResponse),
        (status = 400, description = "Cannot replay a completed delivery", body = crate::error::ErrorResponse),
    ),
    security(
        ("BearerAuth" = [])
    )
)]
pub async fn replay(
    State(state): State<std::sync::Arc<AppState>>,
    Path(delivery_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>> {
    let delivery = sqlx::query_as::<_, WebhookDelivery>(
        r#"
        SELECT id, platform_id, transaction_id, external_ref,
               status as "status: WebhookDeliveryStatus",
               request_body, response_body, status_code, error_message,
               attempts, max_attempts, next_retry_at, source_ip,
               received_at, completed_at, created_at
        FROM webhook_deliveries
        WHERE id = $1
        "#,
    )
    .bind(delivery_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    // Only allow replaying failed or dead-lettered deliveries
    match delivery.status {
        WebhookDeliveryStatus::Failed | WebhookDeliveryStatus::DeadLetter => {}
        _ => {
            return Err(AppError::BadRequest(
                "only failed or dead-lettered deliveries can be replayed".into(),
            ));
        }
    }

    // Record the replay attempt as a new delivery
    let new_delivery_id = Uuid::new_v4();
    sqlx::query(
        r#"
        INSERT INTO webhook_deliveries (id, platform_id, external_ref, status, request_body, source_ip, attempts)
        VALUES ($1, $2, $3, 'received', $4, $5, 0)
        "#,
    )
    .bind(new_delivery_id)
    .bind(delivery.platform_id)
    .bind(&delivery.external_ref)
    .bind(&delivery.request_body)
    .bind(&delivery.source_ip)
    .execute(&state.db)
    .await?;

    tracing::info!(
        original_id = %delivery.id,
        new_id = %new_delivery_id,
        external_ref = %delivery.external_ref,
        "webhook delivery replayed"
    );

    Ok(Json(serde_json::json!({
        "status": "replayed",
        "original_delivery_id": delivery.id,
        "new_delivery_id": new_delivery_id,
        "external_ref": delivery.external_ref,
    })))
}
