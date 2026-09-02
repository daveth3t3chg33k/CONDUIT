use axum::extract::{Path, State, Json};
use uuid::Uuid;

use crate::error::{AppError, Result};
use crate::models::PayoutJob;
use crate::AppState;

/// List payout jobs.
///
/// Optionally filter by status. Results ordered by created_at descending.
#[utoipa::path(
    get,
    path = "/api/v1/payout-jobs",
    tag = "payout-jobs",
    params(
        ("status" = Option<String>, Query, description = "Filter by status: queued, dispatching, completed, failed, manual_review"),
        ("limit" = Option<u32>, Query, description = "Max results (default 50, max 200)"),
        ("offset" = Option<u32>, Query, description = "Pagination offset"),
    ),
    responses(
        (status = 200, description = "List of payout jobs", body = Vec<PayoutJob>),
    ),
    security(
        ("BearerAuth" = [])
    )
)]
pub async fn list(
    State(state): State<std::sync::Arc<AppState>>,
    axum::extract::Query(params): axum::extract::Query<ListParams>,
) -> Result<Json<Vec<PayoutJob>>> {
    let limit = params.limit.unwrap_or(50).min(200) as i64;
    let offset = params.offset.unwrap_or(0) as i64;

    let jobs = if let Some(ref status) = params.status {
        sqlx::query_as::<_, PayoutJob>(
            r#"
            SELECT id, transaction_id, vendor_id, amount_cents,
                   status as "status: PayoutStatus",
                   attempts, next_retry_at, last_error, dispatched_at, created_at
            FROM payout_jobs
            WHERE status = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(status.as_str())
        .bind(limit)
        .bind(offset)
        .fetch_all(&state.db)
        .await?
    } else {
        sqlx::query_as::<_, PayoutJob>(
            r#"
            SELECT id, transaction_id, vendor_id, amount_cents,
                   status as "status: PayoutStatus",
                   attempts, next_retry_at, last_error, dispatched_at, created_at
            FROM payout_jobs
            ORDER BY created_at DESC
            LIMIT $1 OFFSET $2
            "#,
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(&state.db)
        .await?
    };

    Ok(Json(jobs))
}

#[derive(Debug, serde::Deserialize)]
pub struct ListParams {
    pub status: Option<String>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

/// Get a single payout job by ID.
#[utoipa::path(
    get,
    path = "/api/v1/payout-jobs/{job_id}",
    tag = "payout-jobs",
    params(
        ("job_id" = Uuid, Path, description = "Payout job UUID"),
    ),
    responses(
        (status = 200, description = "Payout job details", body = PayoutJob),
        (status = 404, description = "Job not found", body = crate::error::ErrorResponse),
    ),
    security(
        ("BearerAuth" = [])
    )
)]
pub async fn get_one(
    State(state): State<std::sync::Arc<AppState>>,
    Path(job_id): Path<Uuid>,
) -> Result<Json<PayoutJob>> {
    let job = sqlx::query_as::<_, PayoutJob>(
        r#"
        SELECT id, transaction_id, vendor_id, amount_cents,
               status as "status: PayoutStatus",
               attempts, next_retry_at, last_error, dispatched_at, created_at
        FROM payout_jobs
        WHERE id = $1
        "#,
    )
    .bind(job_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(job))
}
