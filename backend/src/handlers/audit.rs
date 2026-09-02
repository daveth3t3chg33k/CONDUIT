use axum::extract::{Path, State, Json};
use serde::Deserialize;
use uuid::Uuid;

use crate::error::{AppError, Result};
use crate::models::AuditLog;
use crate::AppState;

#[derive(Debug, Deserialize)]
pub struct ListParams {
    pub limit: Option<u32>,
    pub offset: Option<u32>,
    pub method: Option<String>,
    pub status_code: Option<i16>,
    pub admin_id: Option<Uuid>,
}

/// List audit log entries.
///
/// Supports filtering by method, status code, and admin. Results ordered by
/// created_at descending (newest first).
#[utoipa::path(
    get,
    path = "/api/v1/audit-logs",
    tag = "audit-logs",
    params(
        ("method" = Option<String>, Query, description = "Filter by HTTP method (GET, POST, PUT, DELETE)"),
        ("status_code" = Option<i16>, Query, description = "Filter by HTTP status code"),
        ("admin_id" = Option<Uuid>, Query, description = "Filter by admin UUID"),
        ("limit" = Option<u32>, Query, description = "Max results (default 50, max 200)"),
        ("offset" = Option<u32>, Query, description = "Pagination offset"),
    ),
    responses(
        (status = 200, description = "List of audit log entries", body = Vec<AuditLog>),
    ),
    security(
        ("BearerAuth" = [])
    )
)]
pub async fn list(
    State(state): State<std::sync::Arc<AppState>>,
    axum::extract::Query(params): axum::extract::Query<ListParams>,
) -> Result<Json<Vec<AuditLog>>> {
    let limit = params.limit.unwrap_or(50).min(200) as i64;
    let offset = params.offset.unwrap_or(0) as i64;

    let logs = if let Some(ref method) = params.method {
        sqlx::query_as::<_, AuditLog>(
            r#"
            SELECT id, admin_id, admin_email, method, path, status_code,
                   ip_address, user_agent, duration_ms, request_body, created_at
            FROM audit_logs
            WHERE method = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(method.as_str())
        .bind(limit)
        .bind(offset)
        .fetch_all(&state.db)
        .await?
    } else if let Some(status) = params.status_code {
        sqlx::query_as::<_, AuditLog>(
            r#"
            SELECT id, admin_id, admin_email, method, path, status_code,
                   ip_address, user_agent, duration_ms, request_body, created_at
            FROM audit_logs
            WHERE status_code = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(status)
        .bind(limit)
        .bind(offset)
        .fetch_all(&state.db)
        .await?
    } else if let Some(admin) = params.admin_id {
        sqlx::query_as::<_, AuditLog>(
            r#"
            SELECT id, admin_id, admin_email, method, path, status_code,
                   ip_address, user_agent, duration_ms, request_body, created_at
            FROM audit_logs
            WHERE admin_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(admin)
        .bind(limit)
        .bind(offset)
        .fetch_all(&state.db)
        .await?
    } else {
        sqlx::query_as::<_, AuditLog>(
            r#"
            SELECT id, admin_id, admin_email, method, path, status_code,
                   ip_address, user_agent, duration_ms, request_body, created_at
            FROM audit_logs
            ORDER BY created_at DESC
            LIMIT $1 OFFSET $2
            "#,
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(&state.db)
        .await?
    };

    Ok(Json(logs))
}

/// Get a single audit log entry by ID.
#[utoipa::path(
    get,
    path = "/api/v1/audit-logs/{log_id}",
    tag = "audit-logs",
    params(
        ("log_id" = Uuid, Path, description = "Audit log UUID"),
    ),
    responses(
        (status = 200, description = "Audit log entry", body = AuditLog),
        (status = 404, description = "Entry not found", body = crate::error::ErrorResponse),
    ),
    security(
        ("BearerAuth" = [])
    )
)]
pub async fn get_one(
    State(state): State<std::sync::Arc<AppState>>,
    Path(log_id): Path<Uuid>,
) -> Result<Json<AuditLog>> {
    let log = sqlx::query_as::<_, AuditLog>(
        r#"
        SELECT id, admin_id, admin_email, method, path, status_code,
               ip_address, user_agent, duration_ms, request_body, created_at
        FROM audit_logs
        WHERE id = $1
        "#,
    )
    .bind(log_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(log))
}
