use std::sync::Arc;

use axum::{routing::get, routing::post, routing::put, Router};
use sqlx::postgres::PgPoolOptions;
use tower_http::cors::{Any, CorsLayer};
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

    // clone before state gets moved into the router
    let worker_state = Arc::clone(&state);

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/health", get(handlers::health::live))
        .route("/health/ready", get(handlers::health::ready))
        .route("/api/v1/webhook/ingress", post(handlers::webhook::ingress))
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
        )
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr = format!("{}:{}", cfg.host, cfg.port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("listening on {addr}");

    // spawn the payout worker in the background
    tokio::spawn(services::payout_worker::run(worker_state));

    axum::serve(listener, app).await?;
    Ok(())
}

async fn run_migrations(db: &sqlx::PgPool) -> anyhow::Result<()> {
    let migration_sql = include_str!("../migrations/001_initial_schema.sql");
    sqlx::raw_sql(migration_sql).execute(db).await?;
    Ok(())
}
