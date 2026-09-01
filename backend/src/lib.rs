use std::sync::Arc;

pub mod config;
pub mod error;
pub mod handlers;
pub mod models;
pub mod services;

pub use error::{AppError, Result};

#[derive(Clone)]
pub struct AppState {
    pub db: sqlx::PgPool,
    pub redis: redis::aio::ConnectionManager,
    pub config: config::Config,
}
