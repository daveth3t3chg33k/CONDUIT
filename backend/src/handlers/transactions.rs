use axum::extract::{Path, State, Json};
use uuid::Uuid;

use crate::error::{AppError, Result};
use crate::models::{LedgerEntry, LedgerEntryType, Transaction};
use crate::AppState;

/// List all transactions.
///
/// Optionally filter by platform_id. Results ordered by received_at descending.
#[utoipa::path(
    get,
    path = "/api/v1/transactions",
    tag = "transactions",
    params(
        ("platform_id" = Option<Uuid>, Query, description = "Filter by platform UUID"),
        ("limit" = Option<u32>, Query, description = "Max results (default 50, max 200)"),
        ("offset" = Option<u32>, Query, description = "Pagination offset"),
    ),
    responses(
        (status = 200, description = "List of transactions", body = Vec<Transaction>),
    ),
    security(
        ("BearerAuth" = [])
    )
)]
pub async fn list(
    State(state): State<std::sync::Arc<AppState>>,
    axum::extract::Query(params): axum::extract::Query<ListParams>,
) -> Result<Json<Vec<Transaction>>> {
    let limit = params.limit.unwrap_or(50).min(200) as i64;
    let offset = params.offset.unwrap_or(0) as i64;

    let transactions = if let Some(platform_id) = params.platform_id {
        sqlx::query_as::<_, Transaction>(
            r#"
            SELECT id, platform_id, external_ref, amount_cents, currency,
                   status as "status: TransactionStatus",
                   raw_payload, received_at, processed_at
            FROM transactions
            WHERE platform_id = $1
            ORDER BY received_at DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(platform_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(&state.db)
        .await?
    } else {
        sqlx::query_as::<_, Transaction>(
            r#"
            SELECT id, platform_id, external_ref, amount_cents, currency,
                   status as "status: TransactionStatus",
                   raw_payload, received_at, processed_at
            FROM transactions
            ORDER BY received_at DESC
            LIMIT $1 OFFSET $2
            "#,
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(&state.db)
        .await?
    };

    Ok(Json(transactions))
}

#[derive(Debug, serde::Deserialize)]
pub struct ListParams {
    pub platform_id: Option<Uuid>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

/// Get a single transaction by ID.
#[utoipa::path(
    get,
    path = "/api/v1/transactions/{transaction_id}",
    tag = "transactions",
    params(
        ("transaction_id" = Uuid, Path, description = "Transaction UUID"),
    ),
    responses(
        (status = 200, description = "Transaction details", body = Transaction),
        (status = 404, description = "Transaction not found", body = crate::error::ErrorResponse),
    ),
    security(
        ("BearerAuth" = [])
    )
)]
pub async fn get_one(
    State(state): State<std::sync::Arc<AppState>>,
    Path(transaction_id): Path<Uuid>,
) -> Result<Json<Transaction>> {
    let transaction = sqlx::query_as::<_, Transaction>(
        r#"
        SELECT id, platform_id, external_ref, amount_cents, currency,
               status as "status: TransactionStatus",
               raw_payload, received_at, processed_at
        FROM transactions
        WHERE id = $1
        "#,
    )
    .bind(transaction_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(transaction))
}

/// Get ledger entries for a transaction.
///
/// Returns all double-entry bookkeeping entries with a balance summary.
#[utoipa::path(
    get,
    path = "/api/v1/transactions/{transaction_id}/ledger",
    tag = "transactions",
    params(
        ("transaction_id" = Uuid, Path, description = "Transaction UUID"),
    ),
    responses(
        (status = 200, description = "Ledger entries with balance summary", body = serde_json::Value),
        (status = 404, description = "Transaction not found", body = crate::error::ErrorResponse),
    ),
    security(
        ("BearerAuth" = [])
    )
)]
pub async fn ledger_entries(
    State(state): State<std::sync::Arc<AppState>>,
    Path(transaction_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>> {
    let tx_exists: Option<(Uuid,)> = sqlx::query_as(
        "SELECT id FROM transactions WHERE id = $1",
    )
    .bind(transaction_id)
    .fetch_optional(&state.db)
    .await?;

    if tx_exists.is_none() {
        return Err(AppError::NotFound);
    }

    let entries = sqlx::query_as::<_, LedgerEntry>(
        r#"
        SELECT id, transaction_id, account_name,
               entry_type as "entry_type: LedgerEntryType",
               amount_cents, description, created_at
        FROM ledger_entries
        WHERE transaction_id = $1
        ORDER BY created_at ASC
        "#,
    )
    .bind(transaction_id)
    .fetch_all(&state.db)
    .await?;

    let total_debits: i64 = entries
        .iter()
        .filter(|e| matches!(e.entry_type, LedgerEntryType::Debit))
        .map(|e| e.amount_cents)
        .sum();

    let total_credits: i64 = entries
        .iter()
        .filter(|e| matches!(e.entry_type, LedgerEntryType::Credit))
        .map(|e| e.amount_cents)
        .sum();

    Ok(Json(serde_json::json!({
        "transaction_id": transaction_id,
        "entries": entries,
        "summary": {
            "total_debits": total_debits,
            "total_credits": total_credits,
            "balanced": total_debits == total_credits,
        }
    })))
}
