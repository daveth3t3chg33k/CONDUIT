use axum::extract::ConnectInfo;
use axum::http::{HeaderMap, HeaderValue, StatusCode};
use axum::response::IntoResponse;
use serde::Serialize;
use std::net::SocketAddr;
use tower_governor::key_extractor::KeyExtractor;
use tower_governor::GovernorError;
use utoipa::ToSchema;

use crate::handlers::auth::Claims;

/// Custom key extractor for rate limiting.
///
/// Priority:
/// 1. Platform admin ID from JWT Claims (set by auth middleware)
/// 2. Client IP address (from ConnectInfo or X-Forwarded-For header)
/// 3. Fallback to "anonymous" for unauthenticated requests
#[derive(Clone, Copy, Debug)]
pub struct ConduitKeyExtractor;

impl KeyExtractor for ConduitKeyExtractor {
    type Key = String;

    fn extract<T>(&self, req: &axum::http::Request<T>) -> Result<Self::Key, GovernorError> {
        // Try JWT claims first — authenticated users get per-admin rate limits
        if let Some(claims) = req.extensions().get::<Claims>() {
            return Ok(format!("admin:{}", claims.sub));
        }

        // Try ConnectInfo (from into_make_service_with_connect_info)
        if let Some(ConnectInfo(addr)) = req.extensions().get::<ConnectInfo<SocketAddr>>() {
            return Ok(format!("ip:{}", addr.ip()));
        }

        // Try X-Forwarded-For header (common behind reverse proxies)
        if let Some(forwarded) = req.headers().get("x-forwarded-for") {
            if let Ok(ip_str) = forwarded.to_str() {
                if let Some(first_ip) = ip_str.split(',').next() {
                    return Ok(format!("ip:{}", first_ip.trim()));
                }
            }
        }

        // Try X-Real-IP header
        if let Some(real_ip) = req.headers().get("x-real-ip") {
            if let Ok(ip_str) = real_ip.to_str() {
                return Ok(format!("ip:{}", ip_str));
            }
        }

        // Fallback — all anonymous requests share a bucket
        Ok("anonymous".to_string())
    }
}

/// Rate limit error response body.
#[derive(Debug, Serialize, ToSchema)]
pub struct RateLimitError {
    pub error: String,
    pub retry_after: u64,
}

/// Custom 429 response with Retry-After header and JSON body.
pub fn rate_limit_response(e: GovernorError) -> axum::http::Response<axum::body::Body> {
    let (status, message, retry_after) = match e {
        GovernorError::TooManyRequests {
            wait_time,
            ..
        } => {
            (
                StatusCode::TOO_MANY_REQUESTS,
                "rate limit exceeded — slow down".to_string(),
                wait_time,
            )
        }
        GovernorError::UnableToExtractKey => (
            StatusCode::INTERNAL_SERVER_ERROR,
            "rate limiter failed to extract key".to_string(),
            0,
        ),
        GovernorError::Other {
            code,
            msg,
            ..
        } => (
            code,
            msg.unwrap_or_else(|| "rate limiter error".to_string()),
            0,
        ),
    };

    tracing::warn!(
        retry_after = retry_after,
        error = %message,
        "rate limit triggered"
    );

    let body = RateLimitError {
        error: message,
        retry_after,
    };

    let json = serde_json::to_string(&body).unwrap_or_default();

    let mut headers = HeaderMap::new();
    headers.insert(
        "Retry-After",
        HeaderValue::from_str(&retry_after.to_string()).unwrap(),
    );
    headers.insert(
        "X-RateLimit-Retry-After",
        HeaderValue::from_str(&retry_after.to_string()).unwrap(),
    );
    headers.insert(
        "Content-Type",
        HeaderValue::from_static("application/json"),
    );

    (status, headers, json).into_response()
}
