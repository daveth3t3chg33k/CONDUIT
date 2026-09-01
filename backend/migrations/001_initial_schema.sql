-- Conduit initial schema
-- All monetary values stored as BIGINT cents. UUIDs for primary keys.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- platforms
-- ============================================================================
CREATE TABLE IF NOT EXISTS platforms (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name          VARCHAR(255) NOT NULL,
    webhook_secret VARCHAR(255) NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platforms_name ON platforms (name);

-- ============================================================================
-- vendors
-- ============================================================================
CREATE TABLE IF NOT EXISTS vendors (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    platform_id   UUID NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
    name          VARCHAR(255) NOT NULL,
    phone_number  VARCHAR(20),
    bank_account  VARCHAR(100),
    email         VARCHAR(255),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendors_platform ON vendors (platform_id);
CREATE INDEX IF NOT EXISTS idx_vendors_phone ON vendors (phone_number) WHERE phone_number IS NOT NULL;

-- ============================================================================
-- split_rules
-- ============================================================================
DO $$ BEGIN
    CREATE TYPE split_rule_type AS ENUM ('percentage', 'fixed');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS split_rules (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    platform_id   UUID NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
    vendor_id     UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    rule_type     split_rule_type NOT NULL,
    value         BIGINT NOT NULL,  -- percentage in basis points (1500 = 15%), or fixed cents
    priority      INTEGER NOT NULL DEFAULT 0,
    is_active     BOOLEAN NOT NULL DEFAULT true,
    CHECK (value >= 0)
);

CREATE INDEX IF NOT EXISTS idx_split_rules_platform ON split_rules (platform_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_split_rules_vendor ON split_rules (vendor_id);

-- ============================================================================
-- transactions
-- ============================================================================
DO $$ BEGIN
    CREATE TYPE transaction_status AS ENUM ('received', 'split_computed', 'paid_out', 'failed');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS transactions (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    platform_id   UUID NOT NULL REFERENCES platforms(id),
    external_ref  VARCHAR(255) NOT NULL,
    amount_cents  BIGINT NOT NULL,
    currency      VARCHAR(3) NOT NULL DEFAULT 'KES',
    status        transaction_status NOT NULL DEFAULT 'received',
    raw_payload   JSONB,
    received_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at  TIMESTAMPTZ,
    CHECK (amount_cents > 0)
);

-- unique constraint for idempotency — one external ref per platform
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_external_ref
    ON transactions (external_ref, platform_id);

CREATE INDEX IF NOT EXISTS idx_transactions_platform ON transactions (platform_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions (status);
CREATE INDEX IF NOT EXISTS idx_transactions_received ON transactions (received_at DESC);

-- ============================================================================
-- ledger_entries
-- ============================================================================
DO $$ BEGIN
    CREATE TYPE ledger_entry_type AS ENUM ('debit', 'credit');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS ledger_entries (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id  UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    account_name    VARCHAR(100) NOT NULL,
    entry_type      ledger_entry_type NOT NULL,
    amount_cents    BIGINT NOT NULL,
    description     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (amount_cents > 0)
);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_transaction ON ledger_entries (transaction_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_account ON ledger_entries (account_name);

-- ============================================================================
-- payout_jobs
-- ============================================================================
DO $$ BEGIN
    CREATE TYPE payout_status AS ENUM ('queued', 'dispatching', 'completed', 'failed', 'manual_review');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS payout_jobs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id  UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    vendor_id       UUID NOT NULL REFERENCES vendors(id),
    amount_cents    BIGINT NOT NULL,
    status          payout_status NOT NULL DEFAULT 'queued',
    attempts        INTEGER NOT NULL DEFAULT 0,
    next_retry_at   TIMESTAMPTZ,
    last_error      TEXT,
    dispatched_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (amount_cents > 0)
);

CREATE INDEX IF NOT EXISTS idx_payout_jobs_status ON payout_jobs (status);
CREATE INDEX IF NOT EXISTS idx_payout_jobs_transaction ON payout_jobs (transaction_id);
CREATE INDEX IF NOT EXISTS idx_payout_jobs_vendor ON payout_jobs (vendor_id);
CREATE INDEX IF NOT EXISTS idx_payout_jobs_retry ON payout_jobs (next_retry_at)
    WHERE status = 'queued' AND next_retry_at IS NOT NULL;
