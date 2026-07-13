-- ================================================================
-- ELITE DATA — AUDIT LOG TABLE
-- Run this in Supabase → SQL Editor
-- ================================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id          bigserial PRIMARY KEY,
  action      text        NOT NULL,
  ip          text,
  details     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups by action and time
CREATE INDEX IF NOT EXISTS idx_audit_log_action     ON audit_log (action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log (created_at DESC);

-- RLS: only service_role can read/write (anon gets nothing)
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Automatically delete entries older than 90 days to keep table lean
-- (run manually or schedule via pg_cron if available on your Supabase plan)
-- DELETE FROM audit_log WHERE created_at < now() - interval '90 days';
