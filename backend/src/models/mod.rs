use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

// ---------------------------------------------------------------------------
// Platform
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Platform {
    pub id: Uuid,
    pub name: String,
    pub webhook_secret: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreatePlatform {
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePlatform {
    pub name: Option<String>,
}

// ---------------------------------------------------------------------------
// Vendor
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Vendor {
    pub id: Uuid,
    pub platform_id: Uuid,
    pub name: String,
    pub phone_number: Option<String>,
    pub bank_account: Option<String>,
    pub email: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateVendor {
    pub name: String,
    pub phone_number: Option<String>,
    pub bank_account: Option<String>,
    pub email: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateVendor {
    pub name: Option<String>,
    pub phone_number: Option<String>,
    pub bank_account: Option<String>,
    pub email: Option<String>,
}

// ---------------------------------------------------------------------------
// Split Rule
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "split_rule_type", rename_all = "lowercase")]
pub enum SplitRuleType {
    Percentage,
    Fixed,
}

impl std::fmt::Display for SplitRuleType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SplitRuleType::Percentage => write!(f, "percentage"),
            SplitRuleType::Fixed => write!(f, "fixed"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct SplitRule {
    pub id: Uuid,
    pub platform_id: Uuid,
    pub vendor_id: Uuid,
    pub rule_type: SplitRuleType,
    pub value: i64,
    pub priority: i32,
    pub is_active: bool,
}

#[derive(Debug, Deserialize)]
pub struct CreateSplitRule {
    pub vendor_id: Uuid,
    pub rule_type: SplitRuleType,
    pub value: i64,
    pub priority: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSplitRule {
    pub value: Option<i64>,
    pub priority: Option<i32>,
    pub is_active: Option<bool>,
}

// ---------------------------------------------------------------------------
// Transaction
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "transaction_status", rename_all = "snake_case")]
pub enum TransactionStatus {
    Received,
    SplitComputed,
    PaidOut,
    Failed,
}

impl std::fmt::Display for TransactionStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TransactionStatus::Received => write!(f, "received"),
            TransactionStatus::SplitComputed => write!(f, "split_computed"),
            TransactionStatus::PaidOut => write!(f, "paid_out"),
            TransactionStatus::Failed => write!(f, "failed"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Transaction {
    pub id: Uuid,
    pub platform_id: Uuid,
    pub external_ref: String,
    pub amount_cents: i64,
    pub currency: String,
    pub status: TransactionStatus,
    pub raw_payload: Option<String>,
    pub received_at: DateTime<Utc>,
    pub processed_at: Option<DateTime<Utc>>,
}

// ---------------------------------------------------------------------------
// Ledger Entry
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "ledger_entry_type", rename_all = "lowercase")]
pub enum LedgerEntryType {
    Debit,
    Credit,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct LedgerEntry {
    pub id: Uuid,
    pub transaction_id: Uuid,
    pub account_name: String,
    pub entry_type: LedgerEntryType,
    pub amount_cents: i64,
    pub description: Option<String>,
    pub created_at: DateTime<Utc>,
}

// ---------------------------------------------------------------------------
// Payout Job
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "payout_status", rename_all = "snake_case")]
pub enum PayoutStatus {
    Queued,
    Dispatching,
    Completed,
    Failed,
    ManualReview,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct PayoutJob {
    pub id: Uuid,
    pub transaction_id: Uuid,
    pub vendor_id: Uuid,
    pub amount_cents: i64,
    pub status: PayoutStatus,
    pub attempts: i32,
    pub next_retry_at: Option<DateTime<Utc>>,
    pub last_error: Option<String>,
    pub dispatched_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

// ---------------------------------------------------------------------------
// Admin (authentication)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Admin {
    pub id: Uuid,
    pub email: String,
    pub name: String,
    /// The argon2 password hash — never serialized to JSON responses.
    #[serde(skip_serializing)]
    pub password_hash: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct SignupRequest {
    pub email: String,
    pub name: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub token: String,
    pub admin: AdminPublic,
}

/// Public admin profile returned in API responses — no password hash.
#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct AdminPublic {
    pub id: Uuid,
    pub email: String,
    pub name: String,
    pub created_at: DateTime<Utc>,
}
