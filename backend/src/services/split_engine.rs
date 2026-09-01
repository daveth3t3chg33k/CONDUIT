use sqlx::PgPool;
use uuid::Uuid;

use crate::error::{AppError, Result};
use crate::models::*;

pub struct SplitResult {
    pub vendor_credits: Vec<VendorCredit>,
}

pub struct VendorCredit {
    pub vendor_id: Uuid,
    pub amount_cents: i64,
}

/// The core financial logic.
///
/// Given a transaction and its platform, this function:
///   1. Loads active split rules for the platform
///   2. Computes each vendor's share (percentage or fixed)
///   3. Assigns the remainder to the platform
///   4. Writes balanced double-entry ledger entries
///   5. Returns the computed split so callers can queue payouts
pub async fn compute_and_record(
    pool: &PgPool,
    transaction: &Transaction,
    platform: &Platform,
) -> Result<SplitResult> {
    let mut tx = pool.begin().await?;

    let rules = sqlx::query_as::<_, SplitRule>(
        r#"
        SELECT id, platform_id, vendor_id,
               rule_type as "rule_type: SplitRuleType",
               value, priority, is_active
        FROM split_rules
        WHERE platform_id = $1 AND is_active = true
        ORDER BY priority ASC
        "#,
    )
    .bind(platform.id)
    .fetch_all(&mut *tx)
    .await?;

    if rules.is_empty() {
        return Err(AppError::Unprocessable(
            "no active split rules configured for this platform".into(),
        ));
    }

    let total = transaction.amount_cents;
    let mut vendor_credits = Vec::new();
    let mut allocated: i64 = 0;

    // debit side: the incoming payment source
    sqlx::query(
        r#"
        INSERT INTO ledger_entries (id, transaction_id, account_name, entry_type, amount_cents, description)
        VALUES ($1, $2, 'payment_source', 'DEBIT', $3, 'incoming payment')
        "#,
    )
    .bind(Uuid::new_v4())
    .bind(transaction.id)
    .bind(total)
    .execute(&mut *tx)
    .await?;

    // credit side: each vendor's share
    for rule in &rules {
        let share = match rule.rule_type {
            SplitRuleType::Percentage => (total * rule.value) / 10_000,
            SplitRuleType::Fixed => rule.value,
        };

        if share <= 0 {
            continue;
        }

        allocated += share;
        vendor_credits.push(VendorCredit {
            vendor_id: rule.vendor_id,
            amount_cents: share,
        });

        let account_name = format!("vendor:{}", rule.vendor_id);

        sqlx::query(
            r#"
            INSERT INTO ledger_entries (id, transaction_id, account_name, entry_type, amount_cents, description)
            VALUES ($1, $2, $3, 'CREDIT', $4, 'vendor split')
            "#,
        )
        .bind(Uuid::new_v4())
        .bind(transaction.id)
        .bind(&account_name)
        .bind(share)
        .execute(&mut *tx)
        .await?;
    }

    // remainder goes to the platform
    let platform_commission = total - allocated;

    if platform_commission < 0 {
        tx.rollback().await?;
        return Err(AppError::Unprocessable(
            "split rules allocate more than 100% of the transaction amount".into(),
        ));
    }

    if platform_commission > 0 {
        sqlx::query(
            r#"
            INSERT INTO ledger_entries (id, transaction_id, account_name, entry_type, amount_cents, description)
            VALUES ($1, $2, 'platform_pool', 'CREDIT', $3, 'platform commission (remainder)')
            "#,
        )
        .bind(Uuid::new_v4())
        .bind(transaction.id)
        .bind(platform_commission)
        .execute(&mut *tx)
        .await?;
    }

    // verify the ledger is balanced
    let row: (i64, i64) = sqlx::query_as(
        r#"
        SELECT
            COALESCE(SUM(CASE WHEN entry_type = 'DEBIT' THEN amount_cents ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount_cents ELSE 0 END), 0)
        FROM ledger_entries
        WHERE transaction_id = $1
        "#,
    )
    .bind(transaction.id)
    .fetch_one(&mut *tx)
    .await?;

    let total_debits = row.0;
    let total_credits = row.1;

    if total_debits != total_credits {
        tx.rollback().await?;
        tracing::error!(
            tx_id = %transaction.id,
            debits = total_debits,
            credits = total_credits,
            "ledger imbalance detected — rolling back",
        );
        return Err(AppError::Internal(anyhow::anyhow!(
            "ledger imbalance: debits={}, credits={}",
            total_debits,
            total_credits,
        )));
    }

    tx.commit().await?;

    tracing::info!(
        tx_id = %transaction.id,
        total = total,
        platform_commission = platform_commission,
        vendor_count = vendor_credits.len(),
        "splits computed and ledger committed",
    );

    Ok(SplitResult {
        vendor_credits,
    })
}
