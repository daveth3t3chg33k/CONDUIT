use axum::extract::State;
use axum::Json;
use chrono::Utc;
use jsonwebtoken::{encode, EncodingKey, Header};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::{AppError, Result};
use crate::models::{Admin, AdminPublic, AuthResponse, LoginRequest, SignupRequest};
use crate::AppState;

/// JWT claims embedded in the token.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub: String,
    pub email: String,
    pub name: String,
    pub exp: usize,
}

/// POST /api/v1/auth/signup
pub async fn signup(
    State(state): State<std::sync::Arc<AppState>>,
    Json(body): Json<SignupRequest>,
) -> Result<Json<AuthResponse>> {
    // Validate input
    if body.email.trim().is_empty() || !body.email.contains('@') {
        return Err(AppError::BadRequest("valid email is required".into()));
    }
    if body.name.trim().is_empty() {
        return Err(AppError::BadRequest("name is required".into()));
    }
    if body.password.len() < 8 {
        return Err(AppError::BadRequest("password must be at least 8 characters".into()));
    }

    // Check for existing email
    let existing: Option<(Uuid,)> = sqlx::query_as("SELECT id FROM admins WHERE email = $1")
        .bind(body.email.trim().to_lowercase())
        .fetch_optional(&state.db)
        .await?;

    if existing.is_some() {
        return Err(AppError::BadRequest("an account with this email already exists".into()));
    }

    // Hash password with argon2id
    let password_hash = hash_password(&body.password)?;

    let id = Uuid::new_v4();
    let admin = sqlx::query_as::<_, Admin>(
        r#"
        INSERT INTO admins (id, email, name, password_hash)
        VALUES ($1, $2, $3, $4)
        RETURNING id, email, name, password_hash, created_at
        "#,
    )
    .bind(id)
    .bind(body.email.trim().to_lowercase())
    .bind(body.name.trim())
    .bind(&password_hash)
    .fetch_one(&state.db)
    .await?;

    tracing::info!(admin_id = %admin.id, email = %admin.email, "admin account created");

    let token = create_token(&state.config.jwt_secret, &admin)?;
    let public = AdminPublic {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        created_at: admin.created_at,
    };

    Ok(Json(AuthResponse { token, admin: public }))
}

/// POST /api/v1/auth/login
pub async fn login(
    State(state): State<std::sync::Arc<AppState>>,
    Json(body): Json<LoginRequest>,
) -> Result<Json<AuthResponse>> {
    if body.email.trim().is_empty() || body.password.is_empty() {
        return Err(AppError::BadRequest("email and password are required".into()));
    }

    let admin = sqlx::query_as::<_, Admin>(
        "SELECT id, email, name, password_hash, created_at FROM admins WHERE email = $1",
    )
    .bind(body.email.trim().to_lowercase())
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::BadRequest("invalid email or password".into()))?;

    verify_password(&body.password, &admin.password_hash)?;

    tracing::info!(admin_id = %admin.id, email = %admin.email, "admin logged in");

    let token = create_token(&state.config.jwt_secret, &admin)?;
    let public = AdminPublic {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        created_at: admin.created_at,
    };

    Ok(Json(AuthResponse { token, admin: public }))
}

/// GET /api/v1/auth/me
pub async fn me(
    State(state): State<std::sync::Arc<AppState>>,
    axum::extract::Extension(claims): axum::extract::Extension<Claims>,
) -> Result<Json<AdminPublic>> {
    let admin = sqlx::query_as::<_, Admin>(
        "SELECT id, email, name, password_hash, created_at FROM admins WHERE id = $1",
    )
    .bind(&claims.sub)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(AdminPublic {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        created_at: admin.created_at,
    }))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn hash_password(password: &str) -> Result<String> {
    use argon2::password_hash::{rand_core::OsRng, SaltString};
    use argon2::{Argon2, PasswordHasher};

    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("password hash error: {e}")))?;

    Ok(hash.to_string())
}

fn verify_password(password: &str, hash: &str) -> Result<()> {
    use argon2::password_hash::{PasswordHash, PasswordVerifier};
    use argon2::Argon2;

    let parsed = PasswordHash::new(hash)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("invalid password hash: {e}")))?;

    Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .map_err(|_| AppError::BadRequest("invalid email or password".into()))
}

fn create_token(jwt_secret: &str, admin: &Admin) -> Result<String> {
    let claims = Claims {
        sub: admin.id.to_string(),
        email: admin.email.clone(),
        name: admin.name.clone(),
        exp: (Utc::now() + chrono::Duration::hours(24)).timestamp() as usize,
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(jwt_secret.as_bytes()),
    )
    .map_err(|e| AppError::Internal(anyhow::anyhow!("JWT encode error: {e}")))
}
