use axum::extract::{Path, State, Json};
use serde::Serialize;
use uuid::Uuid;

use crate::error::{AppError, Result};
use crate::models::{CreatePlatform, UpdatePlatform};
use crate::AppState;

/// Response that masks the webhook secret — never return it in full after creation.
#[derive(Debug, Serialize)]
pub struct PlatformResponse {
    pub id: Uuid,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub webhook_secret: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

impl From<crate::models::Platform> for PlatformResponse {
    fn from(p: crate::models::Platform) -> Self {
        Self {
            id: p.id,
            name: p.name,
            webhook_secret: None, // masked by default
            created_at: p.created_at,
            updated_at: p.updated_at,
        }
    }
}

/// POST /api/v1/platforms
pub async fn create(
    State(state): State<std::sync::Arc<AppState>>,
    Json(body): Json<CreatePlatform>,
) -> Result<Json<serde_json::Value>> {
    // Input validation
    if body.name.trim().is_empty() {
        return Err(AppError::BadRequest("name must not be empty".into()));
    }
    if body.name.len() > 255 {
        return Err(AppError::BadRequest("name must be 255 characters or fewer".into()));
    }

    let id = Uuid::new_v4();
    let webhook_secret = generate_secure_secret(32);

    let platform = sqlx::query_as::<_, crate::models::Platform>(
        r#"
        INSERT INTO platforms (id, name, webhook_secret)
        VALUES ($1, $2, $3)
        RETURNING id, name, webhook_secret, created_at, updated_at
        "#,
    )
    .bind(id)
    .bind(body.name.trim())
    .bind(&webhook_secret)
    .fetch_one(&state.db)
    .await?;

    tracing::info!(platform_id = %platform.id, "platform created");

    // Return the secret only on creation — it won't be visible in GET responses
    let mut response: PlatformResponse = platform.into();
    response.webhook_secret = Some(webhook_secret);

    Ok(Json(serde_json::to_value(response)?))
}

/// GET /api/v1/platforms/:platform_id
pub async fn get_one(
    State(state): State<std::sync::Arc<AppState>>,
    Path(platform_id): Path<Uuid>,
) -> Result<Json<PlatformResponse>> {
    let platform = sqlx::query_as::<_, crate::models::Platform>(
        "SELECT id, name, webhook_secret, created_at, updated_at FROM platforms WHERE id = $1",
    )
    .bind(platform_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    // webhook_secret is masked (None) in GET responses
    Ok(Json(platform.into()))
}

/// PUT /api/v1/platforms/:platform_id
pub async fn update(
    State(state): State<std::sync::Arc<AppState>>,
    Path(platform_id): Path<Uuid>,
    Json(body): Json<UpdatePlatform>,
) -> Result<Json<PlatformResponse>> {
    if let Some(ref name) = body.name {
        if name.trim().is_empty() {
            return Err(AppError::BadRequest("name must not be empty".into()));
        }
        if name.len() > 255 {
            return Err(AppError::BadRequest("name must be 255 characters or fewer".into()));
        }
    }

    let platform = sqlx::query_as::<_, crate::models::Platform>(
        r#"
        UPDATE platforms
        SET name = COALESCE($2, name),
            updated_at = NOW()
        WHERE id = $1
        RETURNING id, name, webhook_secret, created_at, updated_at
        "#,
    )
    .bind(platform_id)
    .bind(body.name.as_deref().map(str::trim))
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(platform.into()))
}

/// Cryptographically secure random bytes for webhook secrets.
fn generate_secure_secret(byte_length: usize) -> String {
    use rand::RngCore;
    let mut bytes = vec![0u8; byte_length];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    hex::encode(bytes)
}
