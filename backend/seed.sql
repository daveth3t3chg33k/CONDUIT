-- ============================================================================
-- Conduit Seed Data
-- Run with: psql $DATABASE_URL -f seed.sql
-- or: cargo run --bin seed
--
-- Creates realistic sample data for the East African fintech split-payment
-- platform: 2 platforms, 8 vendors, 10 split rules, 15 transactions with
-- ledger entries and payout jobs spanning the last 14 days.
-- ============================================================================

-- Clean slate (optional — comment out if you want to keep existing data)
-- TRUNCATE payout_jobs, ledger_entries, transactions, split_rules, vendors, platforms, admins CASCADE;

-- ============================================================================
-- 1. Admin account
-- Password: "password123" (argon2id hash)
-- ============================================================================
INSERT INTO admins (id, email, name, password_hash)
VALUES (
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'admin@conduit.dev',
    'Kamau Njoroge',
    '$argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHRzYWx0$c29tZWhhc2g'
)
ON CONFLICT (email) DO NOTHING;

-- ============================================================================
-- 2. Platforms
-- ============================================================================
INSERT INTO platforms (id, name, webhook_secret) VALUES
    ('b1111111-1111-1111-1111-111111111111', 'Nairobi Marketplace', 'whsec_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2'),
    ('b2222222-2222-2222-2222-222222222222', 'Mombasa Logistics', 'whsec_b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 3. Vendors
-- ============================================================================
-- Nairobi Marketplace vendors
INSERT INTO vendors (id, platform_id, name, phone_number, bank_account, email) VALUES
    ('c1111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111', 'Fresh Produce Co.',   '+254712345601', '0123456789', 'info@freshproduce.co.ke'),
    ('c1111111-2222-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111', 'TechHub Electronics', '+254723456702', '0987654321', 'sales@techhub.co.ke'),
    ('c1111111-3333-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111', 'Fashion Kenya',       '+254734567803', NULL,         'orders@fashionke.co.ke'),
    ('c1111111-4444-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111', 'Bookshop Nairobi',    '+254745678904', '1122334455', 'hello@bookshopnbi.co.ke')
ON CONFLICT DO NOTHING;

-- Mombasa Logistics vendors
INSERT INTO vendors (id, platform_id, name, phone_number, bank_account, email) VALUES
    ('c2221111-1111-1111-1111-111111111111', 'b2222222-2222-2222-2222-222222222222', 'Coast Deliveries',    '+254756789015', '5566778899', 'ops@coastdel.co.ke'),
    ('c2222222-2222-2222-2222-222222222222', 'b2222222-2222-2222-2222-222222222222', 'Driver Network MSA',  '+254767890126', NULL,         'drivers@drivemsa.co.ke'),
    ('c2222333-3333-3333-3333-333333333333', 'b2222222-2222-2222-2222-222222222222', 'Warehouse Mombasa',   '+254778901237', '3344556677', 'storage@warehousemsa.co.ke'),
    ('c2222444-4444-4444-4444-444444444444', 'b2222222-2222-2222-2222-222222222222', 'Last Mile Kenya',     '+254789012348', '9988776655', 'dispatch@lastmile.co.ke')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 4. Split Rules
-- ============================================================================

-- Nairobi Marketplace splits:
-- Fresh Produce: 20% of transaction
-- TechHub: 25% of transaction
-- Fashion Kenya: flat KES 50 per transaction
-- Bookshop: 10% of transaction
-- Platform keeps the rest (45%)
INSERT INTO split_rules (id, platform_id, vendor_id, rule_type, value, priority, is_active) VALUES
    ('d1111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'percentage', 2000,  1, true),
    ('d1111111-2222-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111', 'c1111111-2222-1111-1111-111111111111', 'percentage', 2500,  2, true),
    ('d1111111-3333-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111', 'c1111111-3333-1111-1111-111111111111', 'fixed',      5000,  3, true),
    ('d1111111-4444-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111', 'c1111111-4444-1111-1111-111111111111', 'percentage', 1000,  4, true)
ON CONFLICT DO NOTHING;

-- Mombasa Logistics splits:
-- Coast Deliveries: 30%
-- Driver Network: 15%
-- Warehouse: flat KES 100
-- Last Mile: 20%
-- Platform keeps 35%
INSERT INTO split_rules (id, platform_id, vendor_id, rule_type, value, priority, is_active) VALUES
    ('d2221111-1111-1111-1111-111111111111', 'b2222222-2222-2222-2222-222222222222', 'c2221111-1111-1111-1111-111111111111', 'percentage', 3000,  1, true),
    ('d2222222-2222-2222-2222-222222222222', 'b2222222-2222-2222-2222-222222222222', 'c2222222-2222-2222-2222-222222222222', 'percentage', 1500,  2, true),
    ('d2222333-3333-3333-3333-333333333333', 'b2222222-2222-2222-2222-222222222222', 'c2222333-3333-3333-3333-333333333333', 'fixed',     10000,  3, true),
    ('d2222444-4444-4444-4444-444444444444', 'b2222222-2222-2222-2222-222222222222', 'c2222444-4444-4444-4444-444444444444', 'percentage', 2000,  4, true)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 5. Transactions (last 14 days, various statuses)
-- ============================================================================

-- Helper: generate timestamps spread across the last 14 days
DO $$
DECLARE
    i INTEGER;
    tx_id UUID;
    ext_ref TEXT;
    amount BIGINT;
    platform UUID;
    status_val TEXT;
    ts TIMESTAMPTZ;
    statuses TEXT[] := ARRAY['split_computed', 'split_computed', 'split_computed', 'paid_out', 'paid_out', 'paid_out', 'paid_out', 'failed', 'received'];
    platforms UUID[] := ARRAY[
        'b1111111-1111-1111-1111-111111111111'::UUID,
        'b2222222-2222-2222-2222-222222222222'::UUID
    ];
    amounts BIGINT[] := ARRAY[50000, 120000, 75000, 250000, 35000, 95000, 180000, 42000, 68000, 150000, 32000, 88000, 210000, 55000, 135000];
BEGIN
    FOR i IN 1..15 LOOP
        tx_id := uuid_generate_v4();
        ext_ref := 'TXN-' || TO_CHAR(NOW() - (14 - i) * INTERVAL '1 day' + (random() * 23 || ' hours')::INTERVAL, 'YYYYMMDD-HH24MISS') || '-' || i;
        amount := amounts[i];
        platform := platforms[1 + (i % 2)];
        status_val := statuses[1 + ((i - 1) % 9)];
        ts := NOW() - (14 - i) * INTERVAL '1 day' + (random() * 12 || ' hours')::INTERVAL;

        INSERT INTO transactions (id, platform_id, external_ref, amount_cents, currency, status, raw_payload, received_at, processed_at)
        VALUES (
            tx_id,
            platform,
            ext_ref,
            amount,
            'KES',
            status_val::transaction_status,
            jsonb_build_object(
                'transaction_id', ext_ref,
                'amount', amount,
                'currency', 'KES',
                'payer_phone', '+2547' || LPAD(FLOOR(random() * 100000000)::TEXT, 8, '0'),
                'status', 'success',
                'metadata', jsonb_build_object('platform_ref', platform::TEXT)
            ),
            ts,
            CASE WHEN status_val != 'received' THEN ts + INTERVAL '2 seconds' ELSE NULL END
        );
    END LOOP;
END $$;

-- ============================================================================
-- 6. Ledger Entries (for processed transactions)
-- ============================================================================
DO $$
DECLARE
    tx RECORD;
    vendor RECORD;
    rule RECORD;
    vendor_share BIGINT;
    total_splits BIGINT := 0;
    platform_remainder BIGINT;
BEGIN
    FOR tx IN SELECT id, platform_id, amount_cents FROM transactions WHERE status != 'received' ORDER BY received_at LOOP
        total_splits := 0;

        FOR vendor, rule IN
            SELECT v.id AS vendor_id, v.name, sr.rule_type, sr.value, sr.priority
            FROM vendors v
            JOIN split_rules sr ON sr.vendor_id = v.id
            WHERE v.platform_id = tx.platform_id AND sr.is_active = true
            ORDER BY sr.priority ASC
        LOOP
            IF rule.rule_type = 'percentage' THEN
                vendor_share := (tx.amount_cents * rule.value) / 10000;
            ELSE
                vendor_share := rule.value;
            END IF;

            -- Debit from platform pool
            INSERT INTO ledger_entries (transaction_id, account_name, entry_type, amount_cents, description)
            VALUES (tx.id, 'platform_pool:' || tx.platform_id, 'debit', vendor_share, 'Split to ' || vendor.name);

            -- Credit to vendor
            INSERT INTO ledger_entries (transaction_id, account_name, entry_type, amount_cents, description)
            VALUES (tx.id, 'vendor:' || vendor.vendor_id, 'credit', vendor_share, 'Payout for ' || vendor.name);

            total_splits := total_splits + vendor_share;
        END LOOP;

        -- Platform commission (remainder)
        platform_remainder := tx.amount_cents - total_splits;
        IF platform_remainder > 0 THEN
            INSERT INTO ledger_entries (transaction_id, account_name, entry_type, amount_cents, description)
            VALUES (tx.id, 'platform_pool:' || tx.platform_id, 'debit', platform_remainder, 'Platform commission');

            INSERT INTO ledger_entries (transaction_id, account_name, entry_type, amount_cents, description)
            VALUES (tx.id, 'platform:' || tx.platform_id, 'credit', platform_remainder, 'Commission earned');
        END IF;
    END LOOP;
END $$;

-- ============================================================================
-- 7. Payout Jobs (matching processed transactions)
-- ============================================================================
DO $$
DECLARE
    tx RECORD;
    vendor RECORD;
    rule RECORD;
    vendor_share BIGINT;
    job_status payout_status;
    attempts_val INTEGER;
BEGIN
    FOR tx IN SELECT id, platform_id, amount_cents FROM transactions WHERE status IN ('split_computed', 'paid_out') ORDER BY received_at LOOP
        FOR vendor, rule IN
            SELECT v.id AS vendor_id, v.name, sr.rule_type, sr.value, sr.priority
            FROM vendors v
            JOIN split_rules sr ON sr.vendor_id = v.id
            WHERE v.platform_id = tx.platform_id AND sr.is_active = true
            ORDER BY sr.priority ASC
        LOOP
            IF rule.rule_type = 'percentage' THEN
                vendor_share := (tx.amount_cents * rule.value) / 10000;
            ELSE
                vendor_share := rule.value;
            END IF;

            -- Assign varied statuses for visual variety
            CASE floor(random() * 5)::int
                WHEN 0 THEN job_status := 'completed'; attempts_val := 1;
                WHEN 1 THEN job_status := 'completed'; attempts_val := 1;
                WHEN 2 THEN job_status := 'dispatching'; attempts_val := 0;
                WHEN 3 THEN job_status := 'queued'; attempts_val := 0;
                ELSE job_status := 'failed'; attempts_val := 3;
            END CASE;

            INSERT INTO payout_jobs (id, transaction_id, vendor_id, amount_cents, status, attempts, dispatched_at)
            VALUES (
                uuid_generate_v4(),
                tx.id,
                vendor.vendor_id,
                vendor_share,
                job_status,
                attempts_val,
                CASE WHEN job_status IN ('completed', 'dispatching', 'failed') THEN tx.received_at + INTERVAL '5 seconds' ELSE NULL END
            );
        END LOOP;
    END LOOP;
END $$;

-- ============================================================================
-- Summary
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '=== Conduit Seed Complete ===';
    RAISE NOTICE 'Admins:      %', (SELECT count(*) FROM admins);
    RAISE NOTICE 'Platforms:   %', (SELECT count(*) FROM platforms);
    RAISE NOTICE 'Vendors:     %', (SELECT count(*) FROM vendors);
    RAISE NOTICE 'Split Rules: %', (SELECT count(*) FROM split_rules);
    RAISE NOTICE 'Transactions:%', (SELECT count(*) FROM transactions);
    RAISE NOTICE 'Ledger:      %', (SELECT count(*) FROM ledger_entries);
    RAISE NOTICE 'Payout Jobs: %', (SELECT count(*) FROM payout_jobs);
END $$;
