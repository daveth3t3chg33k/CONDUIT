use axum::extract::{Path, State, Json};
use uuid::Uuid;

use crate::error::{AppError, Result};
use crate::models::{CreatePlatform, Platform, UpdatePlatform};
use crate::AppState;

/// POST /api/v1/platforms
pub async fn create(
    State(state): State<std::sync::Arc<AppState>>,
    Json(body): Json<CreatePlatform>,
) -> Result<Json<Platform>> {
    let id = Uuid::new_v4();
    let webhook_secret = hex::encode(rand_bytes(32));

    let platform = sqlx::query_as::<_, Platform>(
        r#"
        INSERT INTO platforms (id, name, webhook_secret)
        VALUES ($1, $2, $3)
        RETURNING id, name, webhook_secret, created_at, updated_at
        "#,
    )
    .bind(id)
    .bind(&body.name)
    .bind(&webhook_secret)
    .fetch_one(&state.db)
    .await?;

    tracing::info!(platform_id = %platform.id, "platform created");
    Ok(Json(platform))
}

/// GET /api/v1/platforms/:platform_id
pub async fn get_one(
    State(state): State<std::sync::Arc<AppState>>,
    Path(platform_id): Path<Uuid>,
) -> Result<Json<Platform>> {
    let platform = sqlx::query_as::<_, Platform>(
        "SELECT id, name, webhook_secret, created_at, updated_at FROM platforms WHERE id = $1",
    )
    .bind(platform_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(platform))
}

/// PUT /api/v1/platforms/:platform_id
pub async fn update(
    State(state): State<std::sync::Arc<AppState>>,
    Path(platform_id): Path<Uuid>,
    Json(body): Json<UpdatePlatform>,
) -> Result<Json<Platform>> {
    let platform = sqlx::query_as::<_, Platform>(
        r#"
        UPDATE platforms
        SET name = COALESCE($2, name),
            webhook_secret = COALESCE($3, webhook_secret),
            updated_at = NOW()
        WHERE id = $1
        RETURNING id, name, webhook_secret, created_at, updated_at
        "#,
    )
    .bind(platform_id)
    .bind(&body.name)
    .bind(&body.webhook_secret)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(platform))
}

fn rand_bytes(n: usize) -> Vec<u8> {
    use std::collections::hash_map::RandomState;
    use std::hash::{BuildHasher, Hasher};
    let s = RandomState::new();
    (0..n).map(|_| (s.build_hasher().finish() & 0xFF) as u8).collect()
}
