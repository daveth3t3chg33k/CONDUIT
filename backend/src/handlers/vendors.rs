use axum::extract::{Path, State, Json};
use serde::Deserialize;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::error::{AppError, Result};
use crate::models::{CreateVendor, UpdateVendor, Vendor};
use crate::AppState;

#[derive(Debug, Deserialize, ToSchema)]
pub struct ListParams {
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

/// Create a vendor under a platform.
#[utoipa::path(
    post,
    path = "/api/v1/platforms/{platform_id}/vendors",
    tag = "vendors",
    params(
        ("platform_id" = Uuid, Path, description = "Platform UUID"),
    ),
    request_body = CreateVendor,
    responses(
        (status = 201, description = "Vendor created", body = Vendor),
        (status = 400, description = "Validation error", body = crate::error::ErrorResponse),
        (status = 404, description = "Platform not found", body = crate::error::ErrorResponse),
    ),
    security(
        ("BearerAuth" = [])
    )
)]
pub async fn create(
    State(state): State<std::sync::Arc<AppState>>,
    Path(platform_id): Path<Uuid>,
    Json(body): Json<CreateVendor>,
) -> Result<Json<Vendor>> {
    // Input validation
    if body.name.trim().is_empty() {
        return Err(AppError::BadRequest("vendor name must not be empty".into()));
    }
    if body.name.len() > 255 {
        return Err(AppError::BadRequest("vendor name must be 255 characters or fewer".into()));
    }
    if let Some(ref phone) = body.phone_number {
        if phone.len() > 20 {
            return Err(AppError::BadRequest("phone number must be 20 characters or fewer".into()));
        }
    }
    if let Some(ref email) = body.email {
        if email.len() > 255 {
            return Err(AppError::BadRequest("email must be 255 characters or fewer".into()));
        }
        if !email.contains('@') {
            return Err(AppError::BadRequest("email format is invalid".into()));
        }
    }

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
    .bind(body.name.trim())
    .bind(&body.phone_number)
    .bind(&body.bank_account)
    .bind(&body.email)
    .fetch_one(&state.db)
    .await?;

    tracing::info!(vendor_id = %vendor.id, platform_id = %platform_id, "vendor created");
    Ok(Json(vendor))
}

/// List vendors for a platform.
#[utoipa::path(
    get,
    path = "/api/v1/platforms/{platform_id}/vendors",
    tag = "vendors",
    params(
        ("platform_id" = Uuid, Path, description = "Platform UUID"),
        ("limit" = Option<u32>, Query, description = "Max results (default 50, max 200)"),
        ("offset" = Option<u32>, Query, description = "Pagination offset"),
    ),
    responses(
        (status = 200, description = "List of vendors", body = Vec<Vendor>),
    ),
    security(
        ("BearerAuth" = [])
    )
)]
pub async fn list(
    State(state): State<std::sync::Arc<AppState>>,
    Path(platform_id): Path<Uuid>,
    axum::extract::Query(params): axum::extract::Query<ListParams>,
) -> Result<Json<Vec<Vendor>>> {
    let limit = params.limit.unwrap_or(50).min(200) as i64;
    let offset = params.offset.unwrap_or(0) as i64;

    let vendors = sqlx::query_as::<_, Vendor>(
        r#"
        SELECT id, platform_id, name, phone_number, bank_account, email, created_at
        FROM vendors
        WHERE platform_id = $1
        ORDER BY created_at ASC
        LIMIT $2 OFFSET $3
        "#,
    )
    .bind(platform_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(vendors))
}

/// Update a vendor's details.
#[utoipa::path(
    put,
    path = "/api/v1/vendors/{vendor_id}",
    tag = "vendors",
    params(
        ("vendor_id" = Uuid, Path, description = "Vendor UUID"),
    ),
    request_body = UpdateVendor,
    responses(
        (status = 200, description = "Updated vendor", body = Vendor),
        (status = 404, description = "Vendor not found", body = crate::error::ErrorResponse),
    ),
    security(
        ("BearerAuth" = [])
    )
)]
pub async fn update(
    State(state): State<std::sync::Arc<AppState>>,
    Path(vendor_id): Path<Uuid>,
    Json(body): Json<UpdateVendor>,
) -> Result<Json<Vendor>> {
    if let Some(ref name) = body.name {
        if name.trim().is_empty() {
            return Err(AppError::BadRequest("vendor name must not be empty".into()));
        }
        if name.len() > 255 {
            return Err(AppError::BadRequest("vendor name must be 255 characters or fewer".into()));
        }
    }
    if let Some(ref email) = body.email {
        if email.len() > 255 {
            return Err(AppError::BadRequest("email must be 255 characters or fewer".into()));
        }
        if !email.contains('@') {
            return Err(AppError::BadRequest("email format is invalid".into()));
        }
    }

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
    .bind(body.name.as_deref().map(str::trim))
    .bind(&body.phone_number)
    .bind(&body.bank_account)
    .bind(&body.email)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(vendor))
}
