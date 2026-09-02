use axum::extract::{Path, State, Json};
use serde::Serialize;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::error::Result;
use crate::AppState;

#[derive(Debug, Serialize, ToSchema)]
pub struct DailyAggregate {
    /// Date in YYYY-MM-DD format
    pub date: String,
    /// Number of transactions on this day
    pub count: i64,
    /// Total volume in integer cents
    pub volume_cents: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AggregateResponse {
    pub platform_id: Uuid,
    pub days: Vec<DailyAggregate>,
}

/// Get daily transaction stats for a platform.
///
/// Returns daily transaction count and volume for the last 30 days.
#[utoipa::path(
    get,
    path = "/api/v1/platforms/{platform_id}/stats",
    tag = "platforms",
    params(
        ("platform_id" = Uuid, Path, description = "Platform UUID"),
    ),
    responses(
        (status = 200, description = "Daily aggregates", body = AggregateResponse),
    ),
    security(
        ("BearerAuth" = [])
    )
)]
pub async fn platform_stats(
    State(state): State<std::sync::Arc<AppState>>,
    Path(platform_id): Path<Uuid>,
) -> Result<Json<AggregateResponse>> {
    let rows = sqlx::query_as::<_, (String, i64, i64)>(
        r#"
        SELECT
            TO_CHAR(DATE(received_at), 'YYYY-MM-DD') AS date,
            COUNT(*) AS count,
            COALESCE(SUM(amount_cents), 0) AS volume_cents
        FROM transactions
        WHERE platform_id = $1
          AND received_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(received_at)
        ORDER BY date ASC
        "#,
    )
    .bind(platform_id)
    .fetch_all(&state.db)
    .await?;

    let days = rows
        .into_iter()
        .map(|(date, count, volume_cents)| DailyAggregate {
            date,
            count,
            volume_cents,
        })
        .collect();

    Ok(Json(AggregateResponse { platform_id, days }))
}
