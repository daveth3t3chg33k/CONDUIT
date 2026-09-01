use std::sync::Arc;

use chrono::Utc;
use redis::AsyncCommands;
use uuid::Uuid;

use crate::AppState;

const MAX_ATTEMPTS: i32 = 3;
const BACKOFF_DELAYS: [i64; 3] = [30, 300, 1800];

/// Starts the payout worker loop.
pub async fn run(state: Arc<AppState>) {
    tracing::info!("payout worker started");

    loop {
        let result: Option<(String, String)> = {
            let mut conn = state.redis.clone();
            conn.brpop("conduit:payout_queue", 5.0_f64).await.ok()
        };

        let Some((_queue, payload)) = result else {
            continue;
        };

        let job: serde_json::Value = match serde_json::from_str(&payload) {
            Ok(v) => v,
            Err(e) => {
                tracing::error!(error = ?e, "failed to deserialize payout job payload");
                continue;
            }
        };

        let job_id = match job["job_id"].as_str().and_then(|s| Uuid::parse_str(s).ok()) {
            Some(id) => id,
            None => {
                tracing::error!("missing or invalid job_id in payload");
                continue;
            }
        };

        let vendor_id = match job["vendor_id"].as_str().and_then(|s| Uuid::parse_str(s).ok()) {
            Some(id) => id,
            None => {
                tracing::error!(job_id = %job_id, "missing vendor_id");
                continue;
            }
        };

        let amount_cents = job["amount_cents"].as_i64().unwrap_or(0);

        tracing::info!(job_id = %job_id, vendor_id = %vendor_id, amount = amount_cents, "processing payout job");

        let _ = sqlx::query("UPDATE payout_jobs SET status = 'dispatching' WHERE id = $1")
            .bind(job_id)
            .execute(&state.db)
            .await;

        let vendor_name: Option<String> = sqlx::query_scalar(
            "SELECT name FROM vendors WHERE id = $1",
        )
        .bind(vendor_id)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten();

        match vendor_name {
            Some(name) => {
                tracing::info!(job_id = %job_id, vendor = %name, "payout dispatched (simulated)");
                let _ = sqlx::query(
                    "UPDATE payout_jobs SET status = 'completed', dispatched_at = NOW(), attempts = attempts + 1 WHERE id = $1",
                )
                .bind(job_id)
                .execute(&state.db)
                .await;
            }
            None => {
                tracing::warn!(job_id = %job_id, vendor_id = %vendor_id, "vendor not found");
                handle_failure(&state, job_id, "vendor not found in database").await;
            }
        }
    }
}

async fn handle_failure(state: &AppState, job_id: Uuid, error: &str) {
    let attempts: i32 = sqlx::query_scalar::<_, i32>(
        "SELECT attempts FROM payout_jobs WHERE id = $1",
    )
    .bind(job_id)
    .fetch_optional(&state.db)
    .await
    .ok()
    .flatten()
    .unwrap_or(0)
        + 1;

    if attempts >= MAX_ATTEMPTS {
        tracing::warn!(job_id = %job_id, attempts = attempts, "max retries exceeded");
        let _ = sqlx::query(
            "UPDATE payout_jobs SET status = 'manual_review', attempts = $1, last_error = $2 WHERE id = $3",
        )
        .bind(attempts)
        .bind(error)
        .bind(job_id)
        .execute(&state.db)
        .await;
    } else {
        let delay_seconds = BACKOFF_DELAYS[(attempts as usize).min(BACKOFF_DELAYS.len() - 1)];
        let next_retry = Utc::now() + chrono::Duration::seconds(delay_seconds);

        tracing::info!(job_id = %job_id, attempts = attempts, retry_in = delay_seconds, "requeuing with backoff");

        let _ = sqlx::query(
            "UPDATE payout_jobs SET status = 'queued', attempts = $1, last_error = $2, next_retry_at = $3 WHERE id = $4",
        )
        .bind(attempts)
        .bind(error)
        .bind(next_retry)
        .bind(job_id)
        .execute(&state.db)
        .await;

        let payload = serde_json::json!({ "job_id": job_id, "retry": true });
        let mut redis = state.redis.clone();
        let _ = redis::cmd("LPUSH")
            .arg("conduit:payout_queue")
            .arg(serde_json::to_string(&payload).unwrap_or_default())
            .query_async::<_, ()>(&mut redis)
            .await;
    }
}
