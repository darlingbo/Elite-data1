-- ══════════════════════════════════════════════════════════════════
-- Elite Data 1 — Security hardening migration
-- Run this in the Supabase SQL Editor AFTER migration.sql.
-- Everything here is optional-but-recommended: the app code falls back
-- gracefully if these objects are missing, but installing them enables
-- atomic wallet deductions, distributed rate limiting, and DB-backed
-- admin sessions/passwords.
-- ══════════════════════════════════════════════════════════════════

-- 1) admin_config: single key/value store for admin password hash + session hash.
CREATE TABLE IF NOT EXISTS admin_config (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

-- 2) Atomic wallet deduction. Returns the new balance, or NULL if the agent
--    did not have enough funds. A single UPDATE means two concurrent purchases
--    can never both pass the balance check (no double-spend).
CREATE OR REPLACE FUNCTION deduct_agent_wallet(p_agent_id uuid, p_amount numeric)
RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
  new_balance numeric;
BEGIN
  UPDATE agents
     SET wallet_balance = wallet_balance - p_amount
   WHERE id = p_agent_id
     AND wallet_balance >= p_amount
  RETURNING wallet_balance INTO new_balance;

  RETURN new_balance; -- NULL when the WHERE clause matched no row (insufficient funds)
END;
$$;

-- 3) Wallet adjustment (used to refund atomically when an order fails to save).
CREATE OR REPLACE FUNCTION adjust_agent_wallet(p_agent_id uuid, p_amount numeric)
RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
  new_balance numeric;
BEGIN
  UPDATE agents
     SET wallet_balance = wallet_balance + p_amount
   WHERE id = p_agent_id
  RETURNING wallet_balance INTO new_balance;

  RETURN new_balance;
END;
$$;

-- 4) Distributed rate limiter. Keeps counters in one table shared by every
--    serverless instance. Returns the current count within the window.
CREATE TABLE IF NOT EXISTS rate_limits (
  key       text PRIMARY KEY,
  count     integer NOT NULL DEFAULT 0,
  reset_at  timestamptz NOT NULL
);

CREATE OR REPLACE FUNCTION increment_rate_limit(p_key text, p_window_ms bigint)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  now_ts   timestamptz := now();
  new_count integer;
BEGIN
  INSERT INTO rate_limits (key, count, reset_at)
  VALUES (p_key, 1, now_ts + make_interval(secs => p_window_ms / 1000.0))
  ON CONFLICT (key) DO UPDATE
    SET count = CASE
                  WHEN rate_limits.reset_at < now_ts THEN 1
                  ELSE rate_limits.count + 1
                END,
        reset_at = CASE
                     WHEN rate_limits.reset_at < now_ts
                       THEN now_ts + make_interval(secs => p_window_ms / 1000.0)
                     ELSE rate_limits.reset_at
                   END
  RETURNING count INTO new_count;

  RETURN new_count;
END;
$$;

-- Optional housekeeping: drop the old, unused system_settings password row so
-- there is only one source of truth (admin_config). Safe to skip.
-- DELETE FROM system_settings WHERE key = 'admin_password_hash';
