use sqlx::PgPool;
use uuid::Uuid;

use crate::error::{AppError, Result};
use crate::models::*;

pub struct SplitResult {
    pub vendor_credits: Vec<VendorCredit>,
}

#[derive(Debug)]
pub struct VendorCredit {
    pub vendor_id: Uuid,
    pub amount_cents: i64,
}

/// Pure calculation: compute vendor shares from split rules and total amount.
/// Returns (vendor_credits, platform_commission). Does NOT touch the database.
pub fn calculate_splits(
    total_cents: i64,
    rules: &[(Uuid, SplitRuleType, i64)], // (vendor_id, rule_type, value)
) -> std::result::Result<(Vec<VendorCredit>, i64), String> {
    if rules.is_empty() {
        return Err("no active split rules configured".into());
    }

    let mut vendor_credits = Vec::new();
    let mut allocated: i64 = 0;

    for (vendor_id, rule_type, value) in rules {
        let share = match rule_type {
            SplitRuleType::Percentage => (total_cents * value) / 10_000,
            SplitRuleType::Fixed => *value,
        };

        if share <= 0 {
            continue;
        }

        allocated += share;
        vendor_credits.push(VendorCredit {
            vendor_id: *vendor_id,
            amount_cents: share,
        });
    }

    let platform_commission = total_cents - allocated;
    if platform_commission < 0 {
        return Err("split rules allocate more than 100% of the transaction amount".into());
    }

    Ok((vendor_credits, platform_commission))
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

#[cfg(test)]
mod tests {
    use super::*;
    use SplitRuleType::{Percentage, Fixed};

    fn v() -> Uuid {
        Uuid::new_v4()
    }

    #[test]
    fn single_percentage_split() {
        let vid = v();
        let rules = vec![(vid, Percentage, 3000)]; // 30%
        let (credits, commission) = calculate_splits(10_000, &rules).unwrap();
        assert_eq!(credits.len(), 1);
        assert_eq!(credits[0].amount_cents, 3_000);
        assert_eq!(commission, 7_000);
    }

    #[test]
    fn multiple_percentage_splits_with_remainder() {
        let v1 = v();
        let v2 = v();
        // 15% + 25% = 40%, remainder 60% to platform
        let rules = vec![(v1, Percentage, 1500), (v2, Percentage, 2500)];
        let (credits, commission) = calculate_splits(50_000, &rules).unwrap();
        assert_eq!(credits.len(), 2);
        assert_eq!(credits[0].amount_cents, 7_500);  // 15% of 50000
        assert_eq!(credits[1].amount_cents, 12_500); // 25% of 50000
        assert_eq!(commission, 30_000);               // remainder
    }

    #[test]
    fn fixed_split() {
        let vid = v();
        let rules = vec![(vid, Fixed, 2_000)]; // flat KES 20
        let (credits, commission) = calculate_splits(10_000, &rules).unwrap();
        assert_eq!(credits[0].amount_cents, 2_000);
        assert_eq!(commission, 8_000);
    }

    #[test]
    fn mixed_percentage_and_fixed() {
        let v1 = v();
        let v2 = v();
        let rules = vec![
            (v1, Percentage, 2000), // 20%
            (v2, Fixed, 5_000),     // flat 50 KES
        ];
        let (credits, commission) = calculate_splits(50_000, &rules).unwrap();
        assert_eq!(credits[0].amount_cents, 10_000); // 20% of 50000
        assert_eq!(credits[1].amount_cents, 5_000);  // fixed
        assert_eq!(commission, 35_000);               // 50000 - 10000 - 5000
    }

    #[test]
    fn overflow_returns_error() {
        let vid = v();
        // 60% + 50% = 110% — should fail
        let rules = vec![(vid, Percentage, 6000), (v(), Percentage, 5000)];
        let result = calculate_splits(10_000, &rules);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("more than 100%"));
    }

    #[test]
    fn empty_rules_returns_error() {
        let result = calculate_splits(10_000, &[]);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("no active split rules"));
    }

    #[test]
    fn zero_percent_rule_is_skipped() {
        let v1 = v();
        let v2 = v();
        let rules = vec![(v1, Percentage, 0), (v2, Percentage, 1000)]; // 0% + 10%
        let (credits, commission) = calculate_splits(20_000, &rules).unwrap();
        assert_eq!(credits.len(), 1); // only the 10% rule
        assert_eq!(credits[0].amount_cents, 2_000);
        assert_eq!(commission, 18_000);
    }

    #[test]
    fn rounding_favors_platform() {
        // 33.33% of 10000 = 3333.33 → integer division gives 3333
        let vid = v();
        let rules = vec![(vid, Percentage, 3333)];
        let (credits, commission) = calculate_splits(10_000, &rules).unwrap();
        assert_eq!(credits[0].amount_cents, 3_333);
        assert_eq!(commission, 6_667); // remainder includes rounding fraction
    }

    #[test]
    fn large_amount_percentage() {
        let v1 = v();
        let v2 = v();
        // 10% of 1,000,000 KES (100M cents)
        let rules = vec![(v1, Percentage, 1000), (v2, Percentage, 500)];
        let (credits, commission) = calculate_splits(100_000_000, &rules).unwrap();
        assert_eq!(credits[0].amount_cents, 10_000_000);
        assert_eq!(credits[1].amount_cents, 5_000_000);
        assert_eq!(commission, 85_000_000);
    }

    #[test]
    fn fixed_larger_than_total_fails() {
        let vid = v();
        let rules = vec![(vid, Fixed, 50_000)];
        let result = calculate_splits(10_000, &rules);
        assert!(result.is_err());
    }
}
