use std::sync::Arc;

use axum::http::{HeaderValue, Method, Request, StatusCode};
use axum::response::Response;
use axum::routing::get;
use axum::{routing::post, routing::put, Router};
use sqlx::postgres::PgPoolOptions;
use tower_http::cors::{Any, CorsLayer};
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod config;
mod error;
mod handlers;
mod models;
mod services;

pub use error::{AppError, Result};

use utoipa::OpenApi;

#[derive(Clone)]
pub struct AppState {
    pub db: sqlx::PgPool,
    pub redis: redis::aio::ConnectionManager,
    pub config: config::Config,
}

#[derive(OpenApi)]
#[openapi(
    info(
        title = "Conduit",
        description = "Non-custodial split-payment routing and ledger middleware for East African fintech. Intercepts payment webhooks, computes multi-party splits, records double-entry ledger entries, and dispatches payouts via M-Pesa B2C.",
        version = "0.1.0",
        contact(name = "kam1rah"),
        license(name = "MIT")
    ),
    paths(
        handlers::health::live,
        handlers::health::ready,
        handlers::auth::signup,
        handlers::auth::login,
        handlers::auth::me,
        handlers::platforms::create,
        handlers::platforms::list,
        handlers::platforms::get_one,
        handlers::platforms::update,
        handlers::stats::platform_stats,
        handlers::vendors::create,
        handlers::vendors::list,
        handlers::vendors::update,
        handlers::split_rules::create,
        handlers::split_rules::list,
        handlers::split_rules::update,
        handlers::split_rules::deactivate,
        handlers::transactions::list,
        handlers::transactions::get_one,
        handlers::transactions::ledger_entries,
        handlers::payout_jobs::list,
        handlers::payout_jobs::get_one,
        handlers::webhook::ingress,
        handlers::mpesa_callback::b2c_callback,
        handlers::mpesa_callback::stk_callback,
    ),
    components(schemas(
        error::ErrorResponse,
        models::Platform,
        models::CreatePlatform,
        models::UpdatePlatform,
        models::Vendor,
        models::CreateVendor,
        models::UpdateVendor,
        models::SplitRule,
        models::SplitRuleType,
        models::CreateSplitRule,
        models::UpdateSplitRule,
        models::Transaction,
        models::TransactionStatus,
        models::LedgerEntry,
        models::LedgerEntryType,
        models::PayoutJob,
        models::PayoutStatus,
        models::Admin,
        models::AdminPublic,
        models::SignupRequest,
        models::LoginRequest,
        models::AuthResponse,
        handlers::platforms::PlatformResponse,
        handlers::webhook::WebhookPayload,
        handlers::mpesa_callback::B2CCallbackPayload,
        handlers::mpesa_callback::B2CResult,
        handlers::mpesa_callback::StkCallbackPayload,
        handlers::mpesa_callback::StkCallback,
        handlers::stats::DailyAggregate,
        handlers::stats::AggregateResponse,
    )),
    tags(
        (name = "health", description = "Liveness and readiness probes"),
        (name = "auth", description = "Admin signup, login, and profile"),
        (name = "platforms", description = "Platform CRUD and stats"),
        (name = "vendors", description = "Vendor management under platforms"),
        (name = "split-rules", description = "Percentage and fixed split rule configuration"),
        (name = "transactions", description = "Transaction listing and ledger inspection"),
        (name = "payout-jobs", description = "Payout job monitoring and retry status"),
        (name = "webhooks", description = "Payment gateway webhook ingestion"),
        (name = "m-pesa", description = "M-Pesa Daraja callback receivers"),
    ),
    security(
        ("BearerAuth" = ["read", "write"]),
        ("WebhookSignature" = [])
    )
)]
pub struct ApiDoc;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = dotenvy::dotenv();

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "conduit=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer().json())
        .init();

    let cfg = config::Config::from_env()?;
    tracing::info!("starting conduit on {}:{}", cfg.host, cfg.port);

    let db = PgPoolOptions::new()
        .max_connections(cfg.database_max_connections)
        .test_before_acquire(true)
        .connect(&cfg.database_url)
        .await?;
    tracing::info!("connected to postgres");

    run_migrations(&db).await?;
    tracing::info!("migrations applied");

    let redis_client = redis::Client::open(cfg.redis_url.as_str())?;
    let redis_conn = redis::aio::ConnectionManager::new(redis_client).await?;
    tracing::info!("connected to redis");

    let state: Arc<AppState> = Arc::new(AppState {
        db,
        redis: redis_conn,
        config: cfg.clone(),
    });

    let worker_state = Arc::clone(&state);

    // Spawn the payout worker in the background
    tokio::spawn(services::payout_worker::run(worker_state));

    // CORS — lock down to configured origins (allow all only in dev)
    let cors = if cfg.cors_origins.contains(&"*".to_string()) {
        CorsLayer::new()
            .allow_origin(Any)
            .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE, Method::OPTIONS])
            .allow_headers(Any)
    } else {
        let origins: Vec<HeaderValue> = cfg.cors_origins.iter()
            .filter_map(|o| o.parse().ok())
            .collect();
        CorsLayer::new()
            .allow_origin(origins)
            .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE, Method::OPTIONS])
            .allow_headers(Any)
    };

    // ---- Public routes (no auth) ----
    let public_routes = Router::new()
        .route("/health", get(handlers::health::live))
        .route("/health/ready", get(handlers::health::ready))
        // Auth: signup and login are public
        .route("/api/v1/auth/signup", post(handlers::auth::signup))
        .route("/api/v1/auth/login", post(handlers::auth::login));

    // ---- Webhook & callback routes (no JWT auth) ----
    let webhook_routes = Router::new()
        .route("/api/v1/webhook/ingress", post(handlers::webhook::ingress))
        .route("/api/v1/mpesa/b2c-callback", post(handlers::mpesa_callback::b2c_callback))
        .route("/api/v1/mpesa/stk-callback", post(handlers::mpesa_callback::stk_callback));

    // ---- Protected management routes (JWT required) ----
    let management_routes = Router::new()
        // Auth: /me requires a valid token
        .route("/api/v1/auth/me", get(handlers::auth::me))
        // Platform management
        .route("/api/v1/platforms", get(handlers::platforms::list).post(handlers::platforms::create))
        .route(
            "/api/v1/platforms/:platform_id",
            get(handlers::platforms::get_one)
                .put(handlers::platforms::update),
        )
        .route(
            "/api/v1/platforms/:platform_id/stats",
            get(handlers::stats::platform_stats),
        )
        .route(
            "/api/v1/platforms/:platform_id/vendors",
            post(handlers::vendors::create).get(handlers::vendors::list),
        )
        .route(
            "/api/v1/vendors/:vendor_id",
            put(handlers::vendors::update),
        )
        .route(
            "/api/v1/platforms/:platform_id/split-rules",
            post(handlers::split_rules::create).get(handlers::split_rules::list),
        )
        .route(
            "/api/v1/split-rules/:rule_id",
            put(handlers::split_rules::update)
                .delete(handlers::split_rules::deactivate),
        )
        // Transactions & payouts
        .route("/api/v1/transactions", get(handlers::transactions::list))
        .route(
            "/api/v1/transactions/:transaction_id",
            get(handlers::transactions::get_one),
        )
        .route(
            "/api/v1/transactions/:transaction_id/ledger",
            get(handlers::transactions::ledger_entries),
        )
        .route("/api/v1/payout-jobs", get(handlers::payout_jobs::list))
        .route(
            "/api/v1/payout-jobs/:job_id",
            get(handlers::payout_jobs::get_one),
        );

    // JWT auth layer — extracts Claims and injects them as an Extension
    let jwt_secret = cfg.jwt_secret.clone();
    let authed_management = management_routes.layer(axum::middleware::from_fn({
        let secret = jwt_secret.clone();
        move |req: Request<axum::body::Body>, next: axum::middleware::Next| {
            let secret = secret.clone();
            async move { jwt_auth_middleware(req, next, &secret).await }
        }
    }));

    // ---- Swagger UI ----
    let swagger_ui = utoipa_swagger_ui::SwaggerUi::new("/swagger-ui")
        .url("/api-docs/openapi.json", ApiDoc::openapi());

    let app = public_routes
        .merge(webhook_routes)
        .merge(authed_management)
        .merge(swagger_ui)
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .layer(RequestBodyLimitLayer::new(1024 * 1024))
        .with_state(state);

    let addr = format!("{}:{}", cfg.host, cfg.port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("listening on {addr}");

    // Graceful shutdown on SIGTERM / SIGINT
    let shutdown_signal = async {
        let ctrl_c = tokio::signal::ctrl_c();
        #[cfg(unix)]
        {
            let mut sigterm = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
                .expect("failed to install SIGTERM handler");
            tokio::select! {
                _ = ctrl_c => tracing::info!("received SIGINT"),
                _ = sigterm.recv() => tracing::info!("received SIGTERM"),
            }
        }
        #[cfg(not(unix))]
        {
            ctrl_c.await.ok();
            tracing::info!("received SIGINT");
        }
    };

    tracing::info!("waiting for shutdown signal...");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal)
        .await?;

    tracing::info!("server shut down gracefully");
    Ok(())
}

/// JWT auth middleware — validates the token, decodes Claims, and injects
/// them into the request extensions so handlers can access the current user.
async fn jwt_auth_middleware(
    mut req: Request<axum::body::Body>,
    next: axum::middleware::Next,
    secret: &str,
) -> std::result::Result<Response, StatusCode> {
    let auth_header = req
        .headers()
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "));

    let token = match auth_header {
        Some(t) => t,
        None => {
            return Err(StatusCode::UNAUTHORIZED);
        }
    };

    let validation = jsonwebtoken::Validation::default();
    let token_data = jsonwebtoken::decode::<handlers::auth::Claims>(
        token,
        &jsonwebtoken::DecodingKey::from_secret(secret.as_bytes()),
        &validation,
    );

    match token_data {
        Ok(data) => {
            req.extensions_mut().insert(data.claims);
            Ok(next.run(req).await)
        }
        Err(e) => {
            tracing::warn!(error = %e, "invalid JWT token");
            Err(StatusCode::UNAUTHORIZED)
        }
    }
}

async fn run_migrations(db: &sqlx::PgPool) -> anyhow::Result<()> {
    let migration_001 = include_str!("../migrations/001_initial_schema.sql");
    sqlx::raw_sql(migration_001).execute(db).await?;

    let migration_002 = include_str!("../migrations/002_admins.sql");
    sqlx::raw_sql(migration_002).execute(db).await?;

    Ok(())
}
