-- Admins table for platform management authentication
-- Password hashes stored as argon2id strings.

CREATE TABLE IF NOT EXISTS admins (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email         VARCHAR(255) NOT NULL UNIQUE,
    name          VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admins_email ON admins (email);
