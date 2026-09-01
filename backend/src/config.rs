use std::env;

/// App configuration pulled from environment variables.
#[derive(Debug, Clone)]
pub struct Config {
    pub host: String,
    pub port: u16,
    pub database_url: String,
    pub database_max_connections: u32,
    pub redis_url: String,
    pub jwt_secret: String,
    /// Comma-separated list of allowed CORS origins. Use "*" for dev.
    pub cors_origins: Vec<String>,

    // M-Pesa Daraja
    pub daraja_consumer_key: String,
    pub daraja_consumer_secret: String,
    pub daraja_base_url: String,
    /// Public URL where Daraja sends async B2C results (e.g. https://your-domain.com/api/v1/mpesa/b2c-callback)
    pub daraja_callback_url: String,
    pub daraja_passkey: String,
    pub daraja_short_code: String,
    pub daraja_initiator_name: String,
    /// When true, the payout worker simulates M-Pesa calls instead of hitting the real API.
    pub daraja_sim_mode: bool,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let cors_raw = env::var("CORS_ORIGINS")
            .unwrap_or_else(|_| "http://localhost:3000".into());
        let cors_origins: Vec<String> = cors_raw
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();

        let daraja_sim_mode = env::var("DARAJA_SIM_MODE")
            .unwrap_or_else(|_| "true".into())
            .to_lowercase()
            == "true";

        let daraja_base_url = if daraja_sim_mode {
            env::var("DARAJA_BASE_URL")
                .unwrap_or_else(|_| "https://sandbox.safaricom.co.ke".into())
        } else {
            env::var("DARAJA_BASE_URL")
                .unwrap_or_else(|_| "https://api.safaricom.co.ke".into())
        };

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
            cors_origins,
            daraja_consumer_key: env::var("DARAJA_CONSUMER_KEY")
                .unwrap_or_else(|_| "".into()),
            daraja_consumer_secret: env::var("DARAJA_CONSUMER_SECRET")
                .unwrap_or_else(|_| "".into()),
            daraja_base_url,
            daraja_callback_url: env::var("DARAJA_CALLBACK_URL")
                .unwrap_or_else(|_| "http://localhost:8080/api/v1/mpesa/b2c-callback".into()),
            daraja_passkey: env::var("DARAJA_PASSKEY")
                .unwrap_or_else(|_| "".into()),
            daraja_short_code: env::var("DARAJA_SHORT_CODE")
                .unwrap_or_else(|_| "174379".into()),
            daraja_initiator_name: env::var("DARAJA_INITIATOR_NAME")
                .unwrap_or_else(|_| "conduit".into()),
            daraja_sim_mode,
        })
    }
}
