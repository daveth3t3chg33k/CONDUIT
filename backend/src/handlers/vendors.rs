use axum::extract::{Path, State, Json};
use uuid::Uuid;

use crate::error::{AppError, Result};
use crate::models::{CreateVendor, UpdateVendor, Vendor};
use crate::AppState;

/// POST /api/v1/platforms/:platform_id/vendors
pub async fn create(
    State(state): State<std::sync::Arc<AppState>>,
    Path(platform_id): Path<Uuid>,
    Json(body): Json<CreateVendor>,
) -> Result<Json<Vendor>> {
    let exists: Option<(Uuid,)> = sqlx::query_as(
        "SELECT id FROM platforms WHERE id = $1",
    )
    .bind(platform_id)
    .fetch_optional(&state.db)
    .await?;

    if exists.is_none() {
        return Err(AppError::NotFound);
    }

    let id = Uuid::new_v4();

    let vendor = sqlx::query_as::<_, Vendor>(
        r#"
        INSERT INTO vendors (id, platform_id, name, phone_number, bank_account, email)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, platform_id, name, phone_number, bank_account, email, created_at
        "#,
    )
    .bind(id)
    .bind(platform_id)
    .bind(&body.name)
    .bind(&body.phone_number)
    .bind(&body.bank_account)
    .bind(&body.email)
    .fetch_one(&state.db)
    .await?;

    tracing::info!(vendor_id = %vendor.id, platform_id = %platform_id, "vendor created");
    Ok(Json(vendor))
}

/// GET /api/v1/platforms/:platform_id/vendors
pub async fn list(
    State(state): State<std::sync::Arc<AppState>>,
    Path(platform_id): Path<Uuid>,
) -> Result<Json<Vec<Vendor>>> {
    let vendors = sqlx::query_as::<_, Vendor>(
        r#"
        SELECT id, platform_id, name, phone_number, bank_account, email, created_at
        FROM vendors
        WHERE platform_id = $1
        ORDER BY created_at ASC
        "#,
    )
    .bind(platform_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(vendors))
}

/// PUT /api/v1/vendors/:vendor_id
pub async fn update(
    State(state): State<std::sync::Arc<AppState>>,
    Path(vendor_id): Path<Uuid>,
    Json(body): Json<UpdateVendor>,
) -> Result<Json<Vendor>> {
    let vendor = sqlx::query_as::<_, Vendor>(
        r#"
        UPDATE vendors
        SET name = COALESCE($2, name),
            phone_number = COALESCE($3, phone_number),
            bank_account = COALESCE($4, bank_account),
            email = COALESCE($5, email)
        WHERE id = $1
        RETURNING id, platform_id, name, phone_number, bank_account, email, created_at
        "#,
    )
    .bind(vendor_id)
    .bind(&body.name)
    .bind(&body.phone_number)
    .bind(&body.bank_account)
    .bind(&body.email)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(vendor))
}
