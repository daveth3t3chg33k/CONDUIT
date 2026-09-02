use axum::extract::{Path, State, Json};
use uuid::Uuid;

use crate::error::{AppError, Result};
use crate::models::{CreateSplitRule, SplitRule, UpdateSplitRule};
use crate::AppState;

/// Create a split rule for a platform.
///
/// Percentage rules use basis points (10000 = 100%).
/// Fixed rules use integer cents.
#[utoipa::path(
    post,
    path = "/api/v1/platforms/{platform_id}/split-rules",
    tag = "split-rules",
    params(
        ("platform_id" = Uuid, Path, description = "Platform UUID"),
    ),
    request_body = CreateSplitRule,
    responses(
        (status = 201, description = "Split rule created", body = SplitRule),
        (status = 400, description = "Validation error", body = crate::error::ErrorResponse),
    ),
    security(
        ("BearerAuth" = [])
    )
)]
pub async fn create(
    State(state): State<std::sync::Arc<AppState>>,
    Path(platform_id): Path<Uuid>,
    Json(body): Json<CreateSplitRule>,
) -> Result<Json<SplitRule>> {
    // Validate value is positive
    if body.value <= 0 {
        return Err(AppError::BadRequest(
            "split rule value must be greater than zero".into(),
        ));
    }

    // Validate percentage rules don't exceed 100% (10000 basis points)
    if matches!(body.rule_type, crate::models::SplitRuleType::Percentage) && body.value > 10_000 {
        return Err(AppError::BadRequest(
            "percentage split cannot exceed 100% (10000 basis points)".into(),
        ));
    }

    let vendor_exists: Option<(Uuid,)> = sqlx::query_as(
        "SELECT id FROM vendors WHERE id = $1 AND platform_id = $2",
    )
    .bind(body.vendor_id)
    .bind(platform_id)
    .fetch_optional(&state.db)
    .await?;

    if vendor_exists.is_none() {
        return Err(AppError::BadRequest(
            "vendor not found on this platform".into(),
        ));
    }

    let priority = match body.priority {
        Some(p) => p,
        None => {
            let row: Option<(i32,)> = sqlx::query_as(
                "SELECT COALESCE(MAX(priority), 0) FROM split_rules WHERE platform_id = $1",
            )
            .bind(platform_id)
            .fetch_optional(&state.db)
            .await?
            .or_else(|| Some((0,)));
            row.map(|r| r.0 + 1).unwrap_or(1)
        }
    };

    let id = Uuid::new_v4();
    let rule_type_str = body.rule_type.to_string();

    let rule = sqlx::query_as::<_, SplitRule>(
        r#"
        INSERT INTO split_rules (id, platform_id, vendor_id, rule_type, value, priority, is_active)
        VALUES ($1, $2, $3, $4::split_rule_type, $5, $6, true)
        RETURNING id, platform_id, vendor_id, rule_type as "rule_type: SplitRuleType", value, priority, is_active
        "#,
    )
    .bind(id)
    .bind(platform_id)
    .bind(body.vendor_id)
    .bind(&rule_type_str)
    .bind(body.value)
    .bind(priority)
    .fetch_one(&state.db)
    .await?;

    tracing::info!(rule_id = %rule.id, platform_id = %platform_id, "split rule created");
    Ok(Json(rule))
}

/// List split rules for a platform.
///
/// Rules are returned ordered by priority ascending.
#[utoipa::path(
    get,
    path = "/api/v1/platforms/{platform_id}/split-rules",
    tag = "split-rules",
    params(
        ("platform_id" = Uuid, Path, description = "Platform UUID"),
    ),
    responses(
        (status = 200, description = "List of split rules", body = Vec<SplitRule>),
    ),
    security(
        ("BearerAuth" = [])
    )
)]
pub async fn list(
    State(state): State<std::sync::Arc<AppState>>,
    Path(platform_id): Path<Uuid>,
) -> Result<Json<Vec<SplitRule>>> {
    let rules = sqlx::query_as::<_, SplitRule>(
        r#"
        SELECT id, platform_id, vendor_id, rule_type as "rule_type: SplitRuleType",
               value, priority, is_active
        FROM split_rules
        WHERE platform_id = $1
        ORDER BY priority ASC
        "#,
    )
    .bind(platform_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(rules))
}

/// Update a split rule's value, priority, or active status.
#[utoipa::path(
    put,
    path = "/api/v1/split-rules/{rule_id}",
    tag = "split-rules",
    params(
        ("rule_id" = Uuid, Path, description = "Split rule UUID"),
    ),
    request_body = UpdateSplitRule,
    responses(
        (status = 200, description = "Updated split rule", body = SplitRule),
        (status = 404, description = "Rule not found", body = crate::error::ErrorResponse),
    ),
    security(
        ("BearerAuth" = [])
    )
)]
pub async fn update(
    State(state): State<std::sync::Arc<AppState>>,
    Path(rule_id): Path<Uuid>,
    Json(body): Json<UpdateSplitRule>,
) -> Result<Json<SplitRule>> {
    if let Some(value) = body.value {
        if value <= 0 {
            return Err(AppError::BadRequest(
                "split rule value must be greater than zero".into(),
            ));
        }
    }

    let rule = sqlx::query_as::<_, SplitRule>(
        r#"
        UPDATE split_rules
        SET value = COALESCE($2, value),
            priority = COALESCE($3, priority),
            is_active = COALESCE($4, is_active)
        WHERE id = $1
        RETURNING id, platform_id, vendor_id, rule_type as "rule_type: SplitRuleType", value, priority, is_active
        "#,
    )
    .bind(rule_id)
    .bind(body.value)
    .bind(body.priority)
    .bind(body.is_active)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(rule))
}

/// Deactivate a split rule (soft delete).
///
/// Sets `is_active` to false without removing the record.
#[utoipa::path(
    delete,
    path = "/api/v1/split-rules/{rule_id}",
    tag = "split-rules",
    params(
        ("rule_id" = Uuid, Path, description = "Split rule UUID"),
    ),
    responses(
        (status = 200, description = "Rule deactivated", body = serde_json::Value),
        (status = 404, description = "Rule not found", body = crate::error::ErrorResponse),
    ),
    security(
        ("BearerAuth" = [])
    )
)]
pub async fn deactivate(
    State(state): State<std::sync::Arc<AppState>>,
    Path(rule_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>> {
    let result = sqlx::query("UPDATE split_rules SET is_active = false WHERE id = $1")
        .bind(rule_id)
        .execute(&state.db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    tracing::info!(rule_id = %rule_id, "split rule deactivated");
    Ok(Json(serde_json::json!({ "status": "deactivated" })))
}
