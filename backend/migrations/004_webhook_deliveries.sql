-- ============================================================================
-- Webhook Deliveries
-- Tracks every webhook ingress attempt with full payload, response, and
-- retry status. Failed deliveries that exhaust retries land in dead-letter.
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE webhook_delivery_status AS ENUM ('received', 'processing', 'completed', 'failed', 'dead_letter');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    platform_id     UUID NOT NULL REFERENCES platforms(id),
    transaction_id  UUID REFERENCES transactions(id),   -- NULL if processing failed before transaction creation
    external_ref    VARCHAR(255) NOT NULL,
    status          webhook_delivery_status NOT NULL DEFAULT 'received',
    request_body    JSONB NOT NULL,
    response_body   JSONB,
    status_code     SMALLINT,
    error_message   TEXT,
    attempts        INTEGER NOT NULL DEFAULT 0,
    max_attempts    INTEGER NOT NULL DEFAULT 3,
    next_retry_at   TIMESTAMPTZ,
    source_ip       VARCHAR(45),
    received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_platform ON webhook_deliveries (platform_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries (status);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_received ON webhook_deliveries (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_external_ref ON webhook_deliveries (external_ref);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_dead_letter ON webhook_deliveries (status, received_at DESC) WHERE status = 'dead_letter';
