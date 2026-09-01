use std::sync::Arc;

use chrono::Utc;
use redis::AsyncCommands;
use uuid::Uuid;

use crate::services::mpesa::DarajaClient;
use crate::AppState;

const MAX_ATTEMPTS: i32 = 3;
const BACKOFF_DELAYS: [i64; 3] = [30, 300, 1800];

/// Starts the payout worker loop.
pub async fn run(state: Arc<AppState>) {
    tracing::info!("payout worker started (sim_mode={})", state.config.daraja_sim_mode);

    let daraja = Arc::new(DarajaClient::new(state.config.clone()));

    loop {
        // Poll for jobs from Redis
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

        // Check if this job is still in 'queued' status and respects its retry delay
        let job_record: Option<(String, Option<chrono::DateTime<Utc>>)> = sqlx::query_as(
            "SELECT status::text, next_retry_at FROM payout_jobs WHERE id = $1",
        )
        .bind(job_id)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten();

        if let Some((status, next_retry_at)) = job_record {
            if status == "completed" || status == "manual_review" {
                tracing::debug!(job_id = %job_id, status = %status, "skipping already-terminal job");
                continue;
            }

            if let Some(retry_at) = next_retry_at {
                if Utc::now() < retry_at {
                    let delay_secs = (retry_at - Utc::now()).num_seconds().max(1);
                    tracing::info!(
                        job_id = %job_id,
                        retry_in = delay_secs,
                        "job not ready for retry — re-enqueuing"
                    );
                    let mut redis = state.redis.clone();
                    if let Err(e) = redis::cmd("LPUSH")
                        .arg("conduit:payout_queue")
                        .arg(&payload)
                        .query_async::<_, ()>(&mut redis)
                        .await
                    {
                        tracing::error!(job_id = %job_id, error = ?e, "failed to re-enqueue delayed job");
                    }
                    let sleep_secs = delay_secs.min(5).max(0) as u64;
                    tokio::time::sleep(tokio::time::Duration::from_secs(sleep_secs)).await;
                    continue;
                }
            }
        }

        tracing::info!(job_id = %job_id, vendor_id = %vendor_id, amount = amount_cents, "processing payout job");

        // Mark as dispatching
        let update_result = sqlx::query(
            "UPDATE payout_jobs SET status = 'dispatching' WHERE id = $1 AND status = 'queued'",
        )
        .bind(job_id)
        .execute(&state.db)
        .await;

        if let Err(e) = update_result {
            tracing::error!(job_id = %job_id, error = ?e, "failed to mark job as dispatching");
            continue;
        }

        // Look up vendor phone number
        let vendor_data: Option<(String, Option<String>)> = sqlx::query_as(
            "SELECT name, phone_number FROM vendors WHERE id = $1",
        )
        .bind(vendor_id)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten();

        let (vendor_name, phone_number) = match vendor_data {
            Some((name, phone)) => (name, phone),
            None => {
                tracing::warn!(job_id = %job_id, vendor_id = %vendor_id, "vendor not found");
                handle_failure(&state, job_id, "vendor not found in database").await;
                continue;
            }
        };

        let phone = match phone_number {
            Some(p) if !p.is_empty() => p,
            _ => {
                tracing::warn!(job_id = %job_id, vendor = %vendor_name, "vendor has no phone number");
                handle_failure(&state, job_id, "vendor has no phone number configured").await;
                continue;
            }
        };

        // Dispatch the payout — dispatch_payment handles the actual M-Pesa call
        let dispatch_result = dispatch_payment(&daraja, &state.config, job_id, &vendor_name, &phone, amount_cents).await;

        match dispatch_result {
            Ok(()) => {
                tracing::info!(
                    job_id = %job_id,
                    vendor = %vendor_name,
                    phone = %phone,
                    amount = amount_cents,
                    "payout dispatched successfully"
                );
                if let Err(e) = sqlx::query(
                    "UPDATE payout_jobs SET status = 'completed', dispatched_at = NOW(), attempts = attempts + 1 WHERE id = $1",
                )
                .bind(job_id)
                .execute(&state.db)
                .await
                {
                    tracing::error!(job_id = %job_id, error = ?e, "failed to mark job as completed");
                }
            }
            Err(e) => {
                tracing::error!(job_id = %job_id, error = %e, "payout dispatch failed");
                handle_failure(&state, job_id, &e.to_string()).await;
            }
        }
    }
}

/// Route the payout through real Daraja or simulation based on config.
async fn dispatch_payment(
    daraja: &DarajaClient,
    config: &crate::config::Config,
    job_id: Uuid,
    vendor_name: &str,
    phone: &str,
    amount_cents: i64,
) -> anyhow::Result<()> {
    if config.daraja_sim_mode {
        simulate_b2c(job_id, vendor_name, phone, amount_cents).await
    } else {
        let resp = daraja
            .b2c_payment(phone, amount_cents, &format!("payout:{job_id}"))
            .await?;
        if resp.response_code.as_deref() == Some("0") {
            Ok(())
        } else {
            anyhow::bail!(
                "M-Pesa B2C rejected: {}",
                resp.response_description.unwrap_or_default()
            );
        }
    }
}

/// Simulate a B2C payout — logs the attempt and pretends it succeeded.
/// Used in DARAJA_SIM_MODE=true for local testing without Safaricom credentials.
async fn simulate_b2c(
    job_id: Uuid,
    vendor_name: &str,
    phone: &str,
    amount_cents: i64,
) -> anyhow::Result<()> {
    let amount_kes = (amount_cents as f64) / 100.0;

    // Simulate network latency
    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

    tracing::info!(
        job_id = %job_id,
        vendor = vendor_name,
        phone = phone,
        amount_kes = amount_kes,
        "SIMULATED B2C: M-Pesa would send KES {amount_kes:.2} to {phone}"
    );

    Ok(())
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
        tracing::warn!(job_id = %job_id, attempts = attempts, "max retries exceeded — flagging for manual review");
        if let Err(e) = sqlx::query(
            "UPDATE payout_jobs SET status = 'manual_review', attempts = $1, last_error = $2 WHERE id = $3",
        )
        .bind(attempts)
        .bind(error)
        .bind(job_id)
        .execute(&state.db)
        .await
        {
            tracing::error!(job_id = %job_id, error = ?e, "failed to flag job for manual review");
        }
    } else {
        let delay_seconds = BACKOFF_DELAYS[(attempts as usize).min(BACKOFF_DELAYS.len() - 1)];
        let next_retry = Utc::now() + chrono::Duration::seconds(delay_seconds);

        tracing::info!(job_id = %job_id, attempts = attempts, retry_in = delay_seconds, "requeuing with backoff");

        if let Err(e) = sqlx::query(
            "UPDATE payout_jobs SET status = 'queued', attempts = $1, last_error = $2, next_retry_at = $3 WHERE id = $4",
        )
        .bind(attempts)
        .bind(error)
        .bind(next_retry)
        .bind(job_id)
        .execute(&state.db)
        .await
        {
            tracing::error!(job_id = %job_id, error = ?e, "failed to update job for retry");
            return;
        }

        let payload = serde_json::json!({ "job_id": job_id, "retry": true });
        let mut redis = state.redis.clone();
        if let Err(e) = redis::cmd("LPUSH")
            .arg("conduit:payout_queue")
            .arg(serde_json::to_string(&payload).unwrap_or_default())
            .query_async::<_, ()>(&mut redis)
            .await
        {
            tracing::error!(job_id = %job_id, error = ?e, "failed to re-enqueue job to Redis");
        }
    }
}
