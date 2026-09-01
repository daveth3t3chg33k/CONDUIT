//! Integration tests for the webhook → split → ledger → payout flow.
//!
//! These tests run against a real Postgres database. Set `DATABASE_URL` in
//! your environment or create a `.env.test` file pointing at a test database.
//! The tests create isolated data using random UUIDs and clean up after themselves.

use std::sync::Arc;

use hmac::{Hmac, Mac};
use sha2::Sha256;
use uuid::Uuid;

use conduit::models::*;
use conduit::services::split_engine;

type HmacSha256 = Hmac<Sha256>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Spin up a PgPool pointing at the test database and run migrations.
async fn setup_db() -> sqlx::PgPool {
    let db_url = std::env::var("TEST_DATABASE_URL")
        .or_else(|_| std::env::var("DATABASE_URL"))
        .expect("set TEST_DATABASE_URL or DATABASE_URL to run integration tests");

    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(2)
        .connect(&db_url)
        .await
        .expect("failed to connect to test database");

    // Run migrations (idempotent — uses IF NOT EXISTS)
    let m1 = include_str!("../migrations/001_initial_schema.sql");
    sqlx::raw_sql(m1).execute(&pool).await.unwrap();
    let m2 = include_str!("../migrations/002_admins.sql");
    sqlx::raw_sql(m2).execute(&pool).await.unwrap();

    pool
}

/// Insert a platform and return it with its id + secret.
async fn create_test_platform(pool: &sqlx::PgPool, name: &str) -> (Uuid, String) {
    let id = Uuid::new_v4();
    let secret = "test_webhook_secret_for_integration_tests_abc123";

    sqlx::query(
        "INSERT INTO platforms (id, name, webhook_secret) VALUES ($1, $2, $3)",
    )
    .bind(id)
    .bind(name)
    .bind(secret)
    .execute(pool)
    .await
    .unwrap();

    (id, secret.to_string())
}

/// Insert a vendor for a platform and return its id.
async fn create_test_vendor(pool: &sqlx::PgPool, platform_id: Uuid, name: &str, phone: &str) -> Uuid {
    let id = Uuid::new_v4();

    sqlx::query(
        "INSERT INTO vendors (id, platform_id, name, phone_number) VALUES ($1, $2, $3, $4)",
    )
    .bind(id)
    .bind(platform_id)
    .bind(name)
    .bind(phone)
    .execute(pool)
    .await
    .unwrap();

    id
}

/// Insert a split rule and return its id.
async fn create_test_split_rule(
    pool: &sqlx::PgPool,
    platform_id: Uuid,
    vendor_id: Uuid,
    rule_type: &str,
    value: i64,
    priority: i32,
) -> Uuid {
    let id = Uuid::new_v4();

    sqlx::query(
        r#"INSERT INTO split_rules (id, platform_id, vendor_id, rule_type, value, priority)
           VALUES ($1, $2, $3, $4::split_rule_type, $5, $6)"#,
    )
    .bind(id)
    .bind(platform_id)
    .bind(vendor_id)
    .bind(rule_type)
    .bind(value)
    .bind(priority)
    .execute(pool)
    .await
    .unwrap();

    id
}

/// Build an HMAC signature for the given body using the platform's secret.
fn sign_payload(secret: &str, body: &[u8]) -> String {
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).unwrap();
    mac.update(body);
    hex::encode(mac.finalize().into_bytes())
}

// ---------------------------------------------------------------------------
// Tests: Split Engine Unit Tests (pure math, no DB)
// ---------------------------------------------------------------------------

#[test]
fn split_engine_calculate_splits_percentage() {
    let vid = Uuid::new_v4();
    let rules = vec![(vid, SplitRuleType::Percentage, 1500)]; // 15%
    let (credits, commission) = split_engine::calculate_splits(10_000, &rules).unwrap();
    assert_eq!(credits.len(), 1);
    assert_eq!(credits[0].amount_cents, 1_500);
    assert_eq!(commission, 8_500);
}

#[test]
fn split_engine_calculate_splits_fixed() {
    let vid = Uuid::new_v4();
    let rules = vec![(vid, SplitRuleType::Fixed, 3_000)];
    let (credits, commission) = split_engine::calculate_splits(10_000, &rules).unwrap();
    assert_eq!(credits[0].amount_cents, 3_000);
    assert_eq!(commission, 7_000);
}

#[test]
fn split_engine_calculate_splits_mixed() {
    let v1 = Uuid::new_v4();
    let v2 = Uuid::new_v4();
    let rules = vec![
        (v1, SplitRuleType::Percentage, 2000), // 20%
        (v2, SplitRuleType::Fixed, 5_000),     // flat 50 KES
    ];
    let (credits, commission) = split_engine::calculate_splits(50_000, &rules).unwrap();
    assert_eq!(credits[0].amount_cents, 10_000);
    assert_eq!(credits[1].amount_cents, 5_000);
    assert_eq!(commission, 35_000);
}

#[test]
fn split_engine_calculate_splits_overflow_errors() {
    let v1 = Uuid::new_v4();
    let v2 = Uuid::new_v4();
    // 60% + 50% = 110%
    let rules = vec![
        (v1, SplitRuleType::Percentage, 6000),
        (v2, SplitRuleType::Percentage, 5000),
    ];
    assert!(split_engine::calculate_splits(10_000, &rules).is_err());
}

#[test]
fn split_engine_calculate_splits_empty_rules_errors() {
    assert!(split_engine::calculate_splits(10_000, &[]).is_err());
}

#[test]
fn split_engine_calculate_splits_remainder_to_platform() {
    let v1 = Uuid::new_v4();
    let v2 = Uuid::new_v4();
    let rules = vec![
        (v1, SplitRuleType::Percentage, 1500), // 15%
        (v2, SplitRuleType::Percentage, 2500), // 25%
    ];
    let (credits, commission) = split_engine::calculate_splits(50_000, &rules).unwrap();
    assert_eq!(credits[0].amount_cents, 7_500);
    assert_eq!(credits[1].amount_cents, 12_500);
    assert_eq!(commission, 30_000);
}

#[test]
fn split_engine_calculate_splits_rounding_favors_platform() {
    let vid = Uuid::new_v4();
    // 33.33% of 10000 = 3333.33 → integer division gives 3333
    let rules = vec![(vid, SplitRuleType::Percentage, 3333)];
    let (credits, commission) = split_engine::calculate_splits(10_000, &rules).unwrap();
    assert_eq!(credits[0].amount_cents, 3_333);
    assert_eq!(commission, 6_667);
}

#[test]
fn split_engine_calculate_splits_zero_percent_skipped() {
    let v1 = Uuid::new_v4();
    let v2 = Uuid::new_v4();
    let rules = vec![
        (v1, SplitRuleType::Percentage, 0),
        (v2, SplitRuleType::Percentage, 1000),
    ];
    let (credits, commission) = split_engine::calculate_splits(20_000, &rules).unwrap();
    assert_eq!(credits.len(), 1);
    assert_eq!(credits[0].amount_cents, 2_000);
    assert_eq!(commission, 18_000);
}

#[test]
fn split_engine_calculate_splits_large_amount() {
    let v1 = Uuid::new_v4();
    let v2 = Uuid::new_v4();
    let rules = vec![
        (v1, SplitRuleType::Percentage, 1000), // 10%
        (v2, SplitRuleType::Percentage, 500),  // 5%
    ];
    let (credits, commission) = split_engine::calculate_splits(100_000_000, &rules).unwrap();
    assert_eq!(credits[0].amount_cents, 10_000_000);
    assert_eq!(credits[1].amount_cents, 5_000_000);
    assert_eq!(commission, 85_000_000);
}

// ---------------------------------------------------------------------------
// Tests: Integration — Full Webhook Flow
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_webhook_split_ledger_payout_flow() {
    let pool = setup_db().await;

    // 1. Create platform + vendors + split rules
    let (platform_id, secret) = create_test_platform(&pool, "Test Marketplace").await;
    let vendor1 = create_test_vendor(&pool, platform_id, "Alice", "+254700000001").await;
    let vendor2 = create_test_vendor(&pool, platform_id, "Bob", "+254700000002").await;

    create_test_split_rule(&pool, platform_id, vendor1, "percentage", 2000, 1).await; // 20%
    create_test_split_rule(&pool, platform_id, vendor2, "percentage", 3000, 2).await; // 30%

    // 2. Build webhook payload and sign it
    let payload = serde_json::json!({
        "transaction_id": "MPESA_REF_001",
        "amount": 50_000, // KES 500 in cents
        "currency": "KES",
        "status": "completed",
        "metadata": {
            "platform_ref": platform_id.to_string()
        }
    });
    let body = serde_json::to_vec(&payload).unwrap();
    let signature = sign_payload(&secret, &body);

    // 3. Look up platform to load it for the split engine
    let platform = sqlx::query_as::<_, Platform>(
        "SELECT id, name, webhook_secret, created_at, updated_at FROM platforms WHERE id = $1",
    )
    .bind(platform_id)
    .fetch_one(&pool)
    .await
    .unwrap();

    // 4. Simulate the webhook ingestion — insert transaction directly
    let tx_id = Uuid::new_v4();
    let status_str = TransactionStatus::Received.to_string();
    sqlx::query(
        r#"INSERT INTO transactions (id, platform_id, external_ref, amount_cents, currency, status, raw_payload)
           VALUES ($1, $2, 'MPESA_REF_001', 50000, 'KES', $3::transaction_status, $4)"#,
    )
    .bind(tx_id)
    .bind(platform_id)
    .bind(&status_str)
    .bind(&String::from_utf8_lossy(&body))
    .execute(&pool)
    .await
    .unwrap();

    let transaction = sqlx::query_as::<_, Transaction>(
        r#"SELECT id, platform_id, external_ref, amount_cents, currency,
                  status as "status: TransactionStatus",
                  raw_payload, received_at, processed_at
           FROM transactions WHERE id = $1"#,
    )
    .bind(tx_id)
    .fetch_one(&pool)
    .await
    .unwrap();

    // 5. Run the split engine
    let split_result = split_engine::compute_and_record(&pool, &transaction, &platform)
        .await
        .unwrap();

    // 6. Verify splits: 20% + 30% = 50% of 50000 = 25000 total
    assert_eq!(split_result.vendor_credits.len(), 2);
    let v1_share = split_result.vendor_credits.iter().find(|c| c.vendor_id == vendor1).unwrap();
    let v2_share = split_result.vendor_credits.iter().find(|c| c.vendor_id == vendor2).unwrap();
    assert_eq!(v1_share.amount_cents, 10_000); // 20% of 50000
    assert_eq!(v2_share.amount_cents, 15_000); // 30% of 50000

    // 7. Verify ledger entries are balanced
    let entries: Vec<LedgerEntry> = sqlx::query_as::<_, LedgerEntry>(
        r#"SELECT id, transaction_id, account_name,
                  entry_type as "entry_type: LedgerEntryType",
                  amount_cents, description, created_at
           FROM ledger_entries WHERE transaction_id = $1 ORDER BY created_at"#,
    )
    .bind(tx_id)
    .fetch_all(&pool)
    .await
    .unwrap();

    // 1 debit (payment_source) + 2 credits (vendors) + 1 credit (platform commission) = 4 entries
    assert_eq!(entries.len(), 4);

    let total_debits: i64 = entries.iter()
        .filter(|e| matches!(e.entry_type, LedgerEntryType::Debit))
        .map(|e| e.amount_cents)
        .sum();
    let total_credits: i64 = entries.iter()
        .filter(|e| matches!(e.entry_type, LedgerEntryType::Credit))
        .map(|e| e.amount_cents)
        .sum();

    assert_eq!(total_debits, total_credits);
    assert_eq!(total_debits, 50_000); // full transaction amount

    // 8. Verify platform commission
    let platform_entry = entries.iter().find(|e| e.account_name == "platform_pool").unwrap();
    assert_eq!(platform_entry.amount_cents, 25_000); // 50% remainder

    // 9. Create payout jobs (like the webhook handler does)
    for entry in &split_result.vendor_credits {
        sqlx::query(
            "INSERT INTO payout_jobs (id, transaction_id, vendor_id, amount_cents, status, attempts) VALUES ($1, $2, $3, $4, 'queued', 0)",
        )
        .bind(Uuid::new_v4())
        .bind(tx_id)
        .bind(entry.vendor_id)
        .bind(entry.amount_cents)
        .execute(&pool)
        .await
        .unwrap();
    }

    let jobs: Vec<PayoutJob> = sqlx::query_as::<_, PayoutJob>(
        r#"SELECT id, transaction_id, vendor_id, amount_cents,
                  status as "status: PayoutStatus",
                  attempts, next_retry_at, last_error, dispatched_at, created_at
           FROM payout_jobs WHERE transaction_id = $1"#,
    )
    .bind(tx_id)
    .fetch_all(&pool)
    .await
    .unwrap();

    assert_eq!(jobs.len(), 2);
    assert!(jobs.iter().all(|j| j.status == PayoutStatus::Queued));
    assert_eq!(jobs[0].amount_cents + jobs[1].amount_cents, 25_000);

    // Clean up
    sqlx::query("DELETE FROM platforms WHERE id = $1")
        .bind(platform_id)
        .execute(&pool)
        .await
        .unwrap();
}

#[tokio::test]
async fn test_idempotent_webhook_duplicate_ignored() {
    let pool = setup_db().await;

    let (platform_id, _secret) = create_test_platform(&pool, "Idempotency Test").await;
    let vendor = create_test_vendor(&pool, platform_id, "Vendor A", "+254700000010").await;
    create_test_split_rule(&pool, platform_id, vendor, "percentage", 5000, 1).await; // 50%

    // Insert the same external_ref twice
    let status_str = TransactionStatus::Received.to_string();
    let payload_str = r#"{"test": true}"#;

    let insert1 = sqlx::query(
        r#"INSERT INTO transactions (platform_id, external_ref, amount_cents, currency, status, raw_payload)
           VALUES ($1, 'DUP_REF_001', 20000, 'KES', $2::transaction_status, $3)
           ON CONFLICT (external_ref, platform_id) DO NOTHING
           RETURNING id"#,
    )
    .bind(platform_id)
    .bind(&status_str)
    .bind(payload_str)
    .fetch_optional(&pool)
    .await
    .unwrap();

    assert!(insert1.is_some(), "first insert should succeed");

    let insert2 = sqlx::query(
        r#"INSERT INTO transactions (platform_id, external_ref, amount_cents, currency, status, raw_payload)
           VALUES ($1, 'DUP_REF_001', 20000, 'KES', $2::transaction_status, $3)
           ON CONFLICT (external_ref, platform_id) DO NOTHING
           RETURNING id"#,
    )
    .bind(platform_id)
    .bind(&status_str)
    .bind(payload_str)
    .fetch_optional(&pool)
    .await
    .unwrap();

    assert!(insert2.is_none(), "duplicate should be silently ignored");

    // Verify only one row exists
    let count: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM transactions WHERE external_ref = 'DUP_REF_001' AND platform_id = $1",
    )
    .bind(platform_id)
    .fetch_one(&pool)
    .await
    .unwrap();

    assert_eq!(count.0, 1);

    // Clean up
    sqlx::query("DELETE FROM platforms WHERE id = $1")
        .bind(platform_id)
        .execute(&pool)
        .await
        .unwrap();
}

#[tokio::test]
async fn test_ledger_balance_invariant() {
    let pool = setup_db().await;

    let (platform_id, _) = create_test_platform(&pool, "Balance Test").await;
    let vendor = create_test_vendor(&pool, platform_id, "Vendor B", "+254700000020").await;
    create_test_split_rule(&pool, platform_id, vendor, "percentage", 2500, 1).await; // 25%

    let platform = sqlx::query_as::<_, Platform>(
        "SELECT id, name, webhook_secret, created_at, updated_at FROM platforms WHERE id = $1",
    )
    .bind(platform_id)
    .fetch_one(&pool)
    .await
    .unwrap();

    // Insert a transaction
    let tx_id = Uuid::new_v4();
    let status_str = TransactionStatus::Received.to_string();
    sqlx::query(
        r#"INSERT INTO transactions (id, platform_id, external_ref, amount_cents, currency, status)
           VALUES ($1, $2, 'BALANCE_REF_001', 80000, 'KES', $3::transaction_status)"#,
    )
    .bind(tx_id)
    .bind(platform_id)
    .bind(&status_str)
    .execute(&pool)
    .await
    .unwrap();

    let transaction = sqlx::query_as::<_, Transaction>(
        r#"SELECT id, platform_id, external_ref, amount_cents, currency,
                  status as "status: TransactionStatus",
                  raw_payload, received_at, processed_at
           FROM transactions WHERE id = $1"#,
    )
    .bind(tx_id)
    .fetch_one(&pool)
    .await
    .unwrap();

    // Run split engine — should produce balanced ledger
    let _result = split_engine::compute_and_record(&pool, &transaction, &platform)
        .await
        .unwrap();

    // Verify double-entry invariant: SUM(debits) == SUM(credits)
    let row: (i64, i64) = sqlx::query_as(
        r#"SELECT
            COALESCE(SUM(CASE WHEN entry_type = 'DEBIT' THEN amount_cents ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount_cents ELSE 0 END), 0)
        FROM ledger_entries WHERE transaction_id = $1"#,
    )
    .bind(tx_id)
    .fetch_one(&pool)
    .await
    .unwrap();

    assert_eq!(row.0, row.1, "ledger must be balanced: debits={} credits={}", row.0, row.1);
    assert_eq!(row.0, 80_000); // full amount

    // Verify the split: 25% of 80000 = 20000, remainder = 60000
    let credits: Vec<(String, i64)> = sqlx::query_as(
        r#"SELECT account_name, amount_cents FROM ledger_entries
           WHERE transaction_id = $1 AND entry_type = 'CREDIT' ORDER BY account_name"#,
    )
    .bind(tx_id)
    .fetch_all(&pool)
    .await
    .unwrap();

    assert_eq!(credits.len(), 2); // vendor + platform_pool
    assert_eq!(credits[0].0, "platform_pool");
    assert_eq!(credits[0].1, 60_000);
    assert!(credits[1].0.starts_with("vendor:"));
    assert_eq!(credits[1].1, 20_000);

    // Clean up
    sqlx::query("DELETE FROM platforms WHERE id = $1")
        .bind(platform_id)
        .execute(&pool)
        .await
        .unwrap();
}

#[tokio::test]
async fn test_no_split_rules_returns_error() {
    let pool = setup_db().await;

    let (platform_id, _) = create_test_platform(&pool, "No Rules Test").await;
    // Don't create any vendors or split rules

    let platform = sqlx::query_as::<_, Platform>(
        "SELECT id, name, webhook_secret, created_at, updated_at FROM platforms WHERE id = $1",
    )
    .bind(platform_id)
    .fetch_one(&pool)
    .await
    .unwrap();

    let tx_id = Uuid::new_v4();
    let status_str = TransactionStatus::Received.to_string();
    sqlx::query(
        r#"INSERT INTO transactions (id, platform_id, external_ref, amount_cents, currency, status)
           VALUES ($1, $2, 'NORULES_REF', 10000, 'KES', $3::transaction_status)"#,
    )
    .bind(tx_id)
    .bind(platform_id)
    .bind(&status_str)
    .execute(&pool)
    .await
    .unwrap();

    let transaction = sqlx::query_as::<_, Transaction>(
        r#"SELECT id, platform_id, external_ref, amount_cents, currency,
                  status as "status: TransactionStatus",
                  raw_payload, received_at, processed_at
           FROM transactions WHERE id = $1"#,
    )
    .bind(tx_id)
    .fetch_one(&pool)
    .await
    .unwrap();

    let result = split_engine::compute_and_record(&pool, &transaction, &platform).await;
    assert!(result.is_err());

    // Clean up
    sqlx::query("DELETE FROM platforms WHERE id = $1")
        .bind(platform_id)
        .execute(&pool)
        .await
        .unwrap();
}

#[tokio::test]
async fn test_hmac_signature_verification() {
    let secret = "my_super_secret_webhook_key";
    let body = b"{\"transaction_id\": \"TEST_001\", \"amount\": 10000}";

    let signature = sign_payload(secret, body);

    // Verify it matches
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).unwrap();
    mac.update(body);
    let expected_bytes = hex::decode(&signature).unwrap();
    assert!(mac.verify_slice(&expected_bytes).is_ok());

    // Verify wrong secret fails
    let mut mac2 = HmacSha256::new_from_slice(b"wrong_secret").unwrap();
    mac2.update(body);
    assert!(mac2.verify_slice(&expected_bytes).is_err());

    // Verify tampered body fails
    let mut mac3 = HmacSha256::new_from_slice(secret.as_bytes()).unwrap();
    mac3.update(b"{\"transaction_id\": \"TAMPERED\"}");
    assert!(mac3.verify_slice(&expected_bytes).is_err());
}

#[tokio::test]
async fn test_three_way_split_with_fixed_rule() {
    let pool = setup_db().await;

    let (platform_id, _) = create_test_platform(&pool, "Three-Way Split").await;
    let v1 = create_test_vendor(&pool, platform_id, "Driver", "+254700000031").await;
    let v2 = create_test_vendor(&pool, platform_id, "Restaurant", "+254700000032").await;
    let v3 = create_test_vendor(&pool, platform_id, "Platform Fee", "+254700000033").await;

    create_test_split_rule(&pool, platform_id, v1, "percentage", 1500, 1).await; // 15% driver
    create_test_split_rule(&pool, platform_id, v2, "percentage", 2500, 2).await; // 25% restaurant
    create_test_split_rule(&pool, platform_id, v3, "fixed", 500, 3).await;       // flat KES 5

    let platform = sqlx::query_as::<_, Platform>(
        "SELECT id, name, webhook_secret, created_at, updated_at FROM platforms WHERE id = $1",
    )
    .bind(platform_id)
    .fetch_one(&pool)
    .await
    .unwrap();

    let tx_id = Uuid::new_v4();
    let status_str = TransactionStatus::Received.to_string();
    sqlx::query(
        r#"INSERT INTO transactions (id, platform_id, external_ref, amount_cents, currency, status)
           VALUES ($1, $2, 'THREE_WAY_001', 100_000, 'KES', $3::transaction_status)"#,
    )
    .bind(tx_id)
    .bind(platform_id)
    .bind(&status_str)
    .execute(&pool)
    .await
    .unwrap();

    let transaction = sqlx::query_as::<_, Transaction>(
        r#"SELECT id, platform_id, external_ref, amount_cents, currency,
                  status as "status: TransactionStatus",
                  raw_payload, received_at, processed_at
           FROM transactions WHERE id = $1"#,
    )
    .bind(tx_id)
    .fetch_one(&pool)
    .await
    .unwrap();

    let result = split_engine::compute_and_record(&pool, &transaction, &platform)
        .await
        .unwrap();

    // 15% of 100000 = 15000 (driver)
    // 25% of 100000 = 25000 (restaurant)
    // fixed 500 cents (platform fee vendor)
    // remainder = 100000 - 15000 - 25000 - 500 = 59500 (platform commission)
    assert_eq!(result.vendor_credits.len(), 3);

    let driver = result.vendor_credits.iter().find(|c| c.vendor_id == v1).unwrap();
    let restaurant = result.vendor_credits.iter().find(|c| c.vendor_id == v2).unwrap();
    let fee_vendor = result.vendor_credits.iter().find(|c| c.vendor_id == v3).unwrap();

    assert_eq!(driver.amount_cents, 15_000);
    assert_eq!(restaurant.amount_cents, 25_000);
    assert_eq!(fee_vendor.amount_cents, 500);

    // Verify total: debits = credits
    let row: (i64, i64) = sqlx::query_as(
        r#"SELECT
            COALESCE(SUM(CASE WHEN entry_type = 'DEBIT' THEN amount_cents ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount_cents ELSE 0 END), 0)
        FROM ledger_entries WHERE transaction_id = $1"#,
    )
    .bind(tx_id)
    .fetch_one(&pool)
    .await
    .unwrap();

    assert_eq!(row.0, 100_000);
    assert_eq!(row.1, 100_000);

    // Clean up
    sqlx::query("DELETE FROM platforms WHERE id = $1")
        .bind(platform_id)
        .execute(&pool)
        .await
        .unwrap();
}

#[tokio::test]
async fn test_over_allocation_rolls_back() {
    let pool = setup_db().await;

    let (platform_id, _) = create_test_platform(&pool, "Overflow Test").await;
    let v1 = create_test_vendor(&pool, platform_id, "Vendor X", "+254700000041").await;
    let v2 = create_test_vendor(&pool, platform_id, "Vendor Y", "+254700000042").await;

    create_test_split_rule(&pool, platform_id, v1, "percentage", 6000, 1).await; // 60%
    create_test_split_rule(&pool, platform_id, v2, "percentage", 5000, 2).await; // 50% — total 110%

    let platform = sqlx::query_as::<_, Platform>(
        "SELECT id, name, webhook_secret, created_at, updated_at FROM platforms WHERE id = $1",
    )
    .bind(platform_id)
    .fetch_one(&pool)
    .await
    .unwrap();

    let tx_id = Uuid::new_v4();
    let status_str = TransactionStatus::Received.to_string();
    sqlx::query(
        r#"INSERT INTO transactions (id, platform_id, external_ref, amount_cents, currency, status)
           VALUES ($1, $2, 'OVERFLOW_001', 10000, 'KES', $3::transaction_status)"#,
    )
    .bind(tx_id)
    .bind(platform_id)
    .bind(&status_str)
    .execute(&pool)
    .await
    .unwrap();

    let transaction = sqlx::query_as::<_, Transaction>(
        r#"SELECT id, platform_id, external_ref, amount_cents, currency,
                  status as "status: TransactionStatus",
                  raw_payload, received_at, processed_at
           FROM transactions WHERE id = $1"#,
    )
    .bind(tx_id)
    .fetch_one(&pool)
    .await
    .unwrap();

    // Should fail — over-allocation triggers rollback
    let result = split_engine::compute_and_record(&pool, &transaction, &platform).await;
    assert!(result.is_err());

    // Verify no ledger entries were written (rolled back)
    let count: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM ledger_entries WHERE transaction_id = $1",
    )
    .bind(tx_id)
    .fetch_one(&pool)
    .await
    .unwrap();

    assert_eq!(count.0, 0, "ledger entries should have been rolled back");

    // Clean up
    sqlx::query("DELETE FROM platforms WHERE id = $1")
        .bind(platform_id)
        .execute(&pool)
        .await
        .unwrap();
}
