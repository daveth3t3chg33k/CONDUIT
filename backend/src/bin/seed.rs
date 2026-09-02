//! Seed the database with sample data for development.
//!
//! Usage:
//!   cargo run --bin seed
//!
//! Requires DATABASE_URL to be set (reads from .env automatically).

use sqlx::postgres::PgPoolOptions;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = dotenvy::dotenv();

    tracing_subscriber::fmt()
        .with_env_filter("info")
        .init();

    let database_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL must be set");

    tracing::info!("connecting to database...");
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await?;

    tracing::info!("running migrations...");
    let migration_001 = include_str!("../../migrations/001_initial_schema.sql");
    sqlx::raw_sql(migration_001).execute(&pool).await?;
    let migration_002 = include_str!("../../migrations/002_admins.sql");
    sqlx::raw_sql(migration_002).execute(&pool).await?;

    tracing::info!("seeding database...");
    let seed_sql = include_str!("../../seed.sql");
    sqlx::raw_sql(seed_sql).execute(&pool).await?;

    // Print summary
    let (admins,): (i64,) = sqlx::query_as("SELECT count(*) FROM admins")
        .fetch_one(&pool).await?;
    let (platforms,): (i64,) = sqlx::query_as("SELECT count(*) FROM platforms")
        .fetch_one(&pool).await?;
    let (vendors,): (i64,) = sqlx::query_as("SELECT count(*) FROM vendors")
        .fetch_one(&pool).await?;
    let (rules,): (i64,) = sqlx::query_as("SELECT count(*) FROM split_rules")
        .fetch_one(&pool).await?;
    let (txns,): (i64,) = sqlx::query_as("SELECT count(*) FROM transactions")
        .fetch_one(&pool).await?;
    let (entries,): (i64,) = sqlx::query_as("SELECT count(*) FROM ledger_entries")
        .fetch_one(&pool).await?;
    let (jobs,): (i64,) = sqlx::query_as("SELECT count(*) FROM payout_jobs")
        .fetch_one(&pool).await?;

    tracing::info!("seed complete!");
    println!("\n=== Conduit Seed Complete ===");
    println!("  Admins:       {}", admins);
    println!("  Platforms:    {}", platforms);
    println!("  Vendors:      {}", vendors);
    println!("  Split Rules:  {}", rules);
    println!("  Transactions: {}", txns);
    println!("  Ledger:       {}", entries);
    println!("  Payout Jobs:  {}", jobs);
    println!("\n  Admin login:  admin@conduit.dev / password123");
    println!("  Dashboard:    http://localhost:3000");
    println!("  Swagger:      http://localhost:8080/swagger-ui/\n");

    Ok(())
}
