
-- ==========================================
-- CocoX Mining Database Schema
-- ==========================================

CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL,
    username TEXT,
    first_name TEXT,
    balance NUMERIC(20, 8) NOT NULL DEFAULT 0,
    mining_started_at TIMESTAMPTZ,
    last_claim_at TIMESTAMPTZ,
    referred_by BIGINT,
    channel_joined BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
    id BIGSERIAL PRIMARY KEY,
    telegram_id BIGINT NOT NULL,
    type TEXT NOT NULL,
    amount NUMERIC(20, 8) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referrals (
    id BIGSERIAL PRIMARY KEY,
    referrer_telegram_id BIGINT NOT NULL,
    referred_telegram_id BIGINT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    reward_paid BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS withdrawals (
    id BIGSERIAL PRIMARY KEY,
    telegram_id BIGINT NOT NULL,
    amount NUMERIC(20, 8) NOT NULL,
    wallet_address TEXT NOT NULL,
    network TEXT NOT NULL DEFAULT 'BEP20',
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Database-managed tasks
CREATE TABLE IF NOT EXISTS tasks (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    network TEXT NOT NULL,
    reward NUMERIC(20, 8) NOT NULL,
    task_url TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

-- Existing database task completion records
CREATE TABLE IF NOT EXISTS task_completions (
    id BIGSERIAL PRIMARY KEY,
    telegram_id BIGINT NOT NULL,
    task_id BIGINT NOT NULL REFERENCES tasks(id),
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (telegram_id, task_id)
);

-- Static website and Monetag task claims
CREATE TABLE IF NOT EXISTS task_claims (
    id BIGSERIAL PRIMARY KEY,
    telegram_id BIGINT NOT NULL REFERENCES users(telegram_id),
    task_id TEXT NOT NULL,
    network TEXT NOT NULL,
    reward NUMERIC(20, 8) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (telegram_id, task_id)
);

-- Monetag server-side postback records
CREATE TABLE IF NOT EXISTS monetag_postbacks (
    id BIGSERIAL PRIMARY KEY,
    event_id TEXT NOT NULL UNIQUE,
    telegram_id BIGINT NOT NULL,
    zone_id TEXT NOT NULL,
    reward NUMERIC(20, 8) NOT NULL DEFAULT 0,
    event_type TEXT NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Default settings
INSERT INTO settings (key, value)
VALUES
    ('mining_daily_rate', '50'),
    ('daily_bonus', '10'),
    ('conversion_rate', '500'),
    ('minimum_withdrawal', '500')
ON CONFLICT (key) DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_transactions_telegram
ON transactions(telegram_id);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer
ON referrals(referrer_telegram_id);

CREATE INDEX IF NOT EXISTS idx_withdrawals_telegram
ON withdrawals(telegram_id);

CREATE INDEX IF NOT EXISTS idx_task_completions_telegram
ON task_completions(telegram_id);

CREATE INDEX IF NOT EXISTS idx_task_claims_telegram
ON task_claims(telegram_id);

CREATE INDEX IF NOT EXISTS idx_monetag_postbacks_telegram
ON monetag_postbacks(telegram_id);
