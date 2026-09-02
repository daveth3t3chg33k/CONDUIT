use axum::body::Body;
use axum::extract::State;
use axum::http::{Method, Request, StatusCode};
use axum::middleware::Next;
use axum::response::Response;
use std::sync::Arc;
use std::time::Instant;

use crate::handlers::auth::Claims;
use crate::AppState;

/// HTTP methods that mutate state and should be audit-logged.
fn is_mutating(method: &Method) -> bool {
    matches!(
        *method,
        Method::POST | Method::PUT | Method::DELETE | Method::PATCH
    )
}

/// Middleware that logs every mutating API action to the audit_logs table.
///
/// Only records POST, PUT, DELETE, and PATCH requests. Reads (GET) are skipped
/// to keep the audit trail focused on state-changing operations.
pub async fn audit_log_middleware(
    State(state): State<Arc<AppState>>,
    mut req: Request<Body>,
    next: Next,
) -> Response {
    let method = req.method().clone();
    let path = req.uri().path().to_string();

    // Only log mutating methods
    if !is_mutating(&method) {
        return next.run(req).await;
    }

    // Extract admin info from JWT claims (set by auth middleware)
    let (admin_id, admin_email) = req
        .extensions()
        .get::<Claims>()
        .map(|c| (Some(c.sub.clone()), Some(c.email.clone())))
        .unwrap_or((None, None));

    // Extract client IP
    let ip_address = extract_ip(&req);

    // Extract user agent
    let user_agent = req
        .headers()
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    // Read the body, parse it as JSON for the audit trail, then reconstruct
    let (parts, body) = req.into_parts();
    let body_bytes = axum::body::to_bytes(body, 10240).await.ok();
    let request_body: Option<serde_json::Value> = body_bytes
        .as_ref()
        .and_then(|b| {
            if b.is_empty() {
                None
            } else {
                serde_json::from_slice(b).ok()
            }
        });

    // Reconstruct the request with a new body from the bytes we read
    let body_for_next = match body_bytes {
        Some(b) => Body::from(b),
        None => Body::empty(),
    };
    let req_for_next = Request::from_parts(parts, body_for_next);

    let start = Instant::now();
    let response = next.run(req_for_next).await;
    let duration_ms = start.elapsed().as_millis() as i64;
    let status_code = response.status().as_u16() as i16;

    // Fire-and-forget: insert the audit log asynchronously.
    // We don't await this — audit logging should never block the response.
    let db = state.db.clone();
    tokio::spawn(async move {
        if let Err(e) = sqlx::query(
            r#"
            INSERT INTO audit_logs (admin_id, admin_email, method, path, status_code, ip_address, user_agent, duration_ms, request_body)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            "#,
        )
        .bind(&admin_id)
        .bind(&admin_email)
        .bind(method.as_str())
        .bind(&path)
        .bind(status_code)
        .bind(&ip_address)
        .bind(&user_agent)
        .bind(duration_ms)
        .bind(&request_body)
        .execute(&db)
        .await
        {
            tracing::error!(error = ?e, "failed to write audit log");
        }
    });

    response
}

/// Extract client IP from various sources.
fn extract_ip(req: &Request<Body>) -> Option<String> {
    // X-Forwarded-For (reverse proxy)
    if let Some(forwarded) = req.headers().get("x-forwarded-for") {
        if let Ok(s) = forwarded.to_str() {
            if let Some(first) = s.split(',').next() {
                return Some(first.trim().to_string());
            }
        }
    }

    // X-Real-IP (nginx)
    if let Some(real_ip) = req.headers().get("x-real-ip") {
        if let Ok(s) = real_ip.to_str() {
            return Some(s.to_string());
        }
    }

    None
}
