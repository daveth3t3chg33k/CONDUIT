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

#[derive(Clone)]
pub struct AppState {
    pub db: sqlx::PgPool,
    pub redis: redis::aio::ConnectionManager,
    pub config: config::Config,
}

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

    // Routes that do NOT require authentication
    let public_routes = Router::new()
        .route("/health", get(handlers::health::live))
        .route("/health/ready", get(handlers::health::ready));

    // Webhook ingress — authenticated by HMAC signature, not JWT
    // M-Pesa callback routes — no auth (Safaricom calls these directly)
    let webhook_routes = Router::new()
        .route("/api/v1/webhook/ingress", post(handlers::webhook::ingress))
        .route("/api/v1/mpesa/b2c-callback", post(handlers::mpesa_callback::b2c_callback))
        .route("/api/v1/mpesa/stk-callback", post(handlers::mpesa_callback::stk_callback));

    // Management API routes — all require JWT auth
    let management_routes = Router::new()
        .route("/api/v1/platforms", post(handlers::platforms::create))
        .route(
            "/api/v1/platforms/:platform_id",
            get(handlers::platforms::get_one)
                .put(handlers::platforms::update),
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

    // JWT auth layer — applied only to management routes
    let jwt_secret = cfg.jwt_secret.clone();
    let authed_management = management_routes.layer(axum::middleware::from_fn({
        let secret = jwt_secret.clone();
        move |req: Request<axum::body::Body>, next: axum::middleware::Next| {
            let secret = secret.clone();
            async move { jwt_auth_middleware(req, next, &secret).await }
        }
    }));

    let app = public_routes
        .merge(webhook_routes)
        .merge(authed_management)
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        // 1MB body limit for webhook payloads
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

async fn jwt_auth_middleware(
    req: Request<axum::body::Body>,
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
    let token_data = jsonwebtoken::decode::<Claims>(
        token,
        &jsonwebtoken::DecodingKey::from_secret(secret.as_bytes()),
        &validation,
    );

    match token_data {
        Ok(_) => Ok(next.run(req).await),
        Err(e) => {
            tracing::warn!(error = %e, "invalid JWT token");
            Err(StatusCode::UNAUTHORIZED)
        }
    }
}

#[derive(Debug, serde::Deserialize)]
struct Claims {
    #[allow(dead_code)]
    sub: String,
    #[allow(dead_code)]
    exp: usize,
}

async fn run_migrations(db: &sqlx::PgPool) -> anyhow::Result<()> {
    let migration_sql = include_str!("../migrations/001_initial_schema.sql");
    sqlx::raw_sql(migration_sql).execute(db).await?;
    Ok(())
}
