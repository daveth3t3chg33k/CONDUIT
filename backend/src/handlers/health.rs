use axum::extract::State;
use axum::Json;
use serde_json::json;

use crate::AppState;

/// Liveness probe — just confirms the process is up.
pub async fn live() -> Json<serde_json::Value> {
    Json(json!({ "status": "ok" }))
}

/// Readiness probe — pings postgres and redis to confirm dependencies are alive.
pub async fn ready(State(state): State<std::sync::Arc<AppState>>) -> Json<serde_json::Value> {
    let db_ok = sqlx::query("SELECT 1")
        .execute(&state.db)
        .await
        .is_ok();

    let mut redis = state.redis.clone();
    let redis_ok = redis::cmd("PING")
        .query_async::<_, String>(&mut redis)
        .await
        .is_ok();

    let status = if db_ok && redis_ok { "ok" } else { "degraded" };

    Json(json!({
        "status": status,
        "postgres": db_ok,
        "redis": redis_ok,
    }))
}
