use std::env;

/// App configuration pulled from environment variables.
///
/// Intentionally kept flat — no nested config structs until we actually
/// need them. Keeps things simple during early development.
#[derive(Debug, Clone)]
pub struct Config {
    pub host: String,
    pub port: u16,
    pub database_url: String,
    pub database_max_connections: u32,
    pub redis_url: String,
    pub jwt_secret: String,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        Ok(Self {
            host: env::var("CONDUIT_HOST").unwrap_or_else(|_| "0.0.0.0".into()),
            port: env::var("CONDUIT_PORT")
                .unwrap_or_else(|_| "8080".into())
                .parse()?,
            database_url: env::var("DATABASE_URL")
                .expect("DATABASE_URL must be set"),
            database_max_connections: env::var("DATABASE_MAX_CONNECTIONS")
                .unwrap_or_else(|_| "10".into())
                .parse()?,
            redis_url: env::var("REDIS_URL")
                .unwrap_or_else(|_| "redis://127.0.0.1:6379".into()),
            jwt_secret: env::var("JWT_SECRET")
                .expect("JWT_SECRET must be set"),
        })
    }
}
