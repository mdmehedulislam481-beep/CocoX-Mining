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

CREATE TABLE IF NOT EXISTS tasks (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    network TEXT NOT NULL,
    reward NUMERIC(20, 8) NOT NULL,
    task_url TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS task_completions (
    id BIGSERIAL PRIMARY KEY,
    telegram_id BIGINT NOT NULL,
    task_id BIGINT NOT NULL REFERENCES tasks(id),
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (telegram_id, task_id)
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT INTO settings (key, value)
VALUES
    ('mining_daily_rate', '50'),
    ('daily_bonus', '10'),
    ('conversion_rate', '500'),
    ('minimum_withdrawal', '500')
ON CONFLICT (key) DO NOTHING;
