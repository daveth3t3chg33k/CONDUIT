-- ============================================================================
-- Audit Logs
-- Records every mutating API action with actor, timestamp, IP, and duration.
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id        UUID,
    admin_email     VARCHAR(255),
    method          VARCHAR(10) NOT NULL,
    path            VARCHAR(500) NOT NULL,
    status_code     SMALLINT NOT NULL,
    ip_address      VARCHAR(45),           -- supports IPv6
    user_agent      VARCHAR(500),
    duration_ms     BIGINT NOT NULL DEFAULT 0,
    request_body    JSONB,                 -- truncated request body for mutations
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_admin ON audit_logs (admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_path ON audit_logs (path);
CREATE INDEX IF NOT EXISTS idx_audit_logs_status ON audit_logs (status_code);
