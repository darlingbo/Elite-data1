-- ================================================================
-- ELITE DATA — ROW LEVEL SECURITY SETUP
-- ================================================================
-- BEFORE running this SQL:
--   1. Go to Supabase Dashboard → Project Settings → API
--   2. Copy the "service_role" secret key (starts with sb_secret_)
--   3. Add it to Vercel as SUPABASE_SERVICE_ROLE_KEY
--   4. Wait for Vercel to redeploy and confirm the site still works
--   5. THEN run this SQL in Supabase → SQL Editor
--
-- HOW THIS WORKS:
--   The service_role key bypasses RLS entirely (used by your backend).
--   The anon key is now locked down so if anyone tries to query
--   Supabase directly they only see what they're supposed to see.
-- ================================================================


-- ── STEP 1: Enable RLS on every table ───────────────────────────

ALTER TABLE orders                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_bundle_prices       ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_commission_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bundle_prices             ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_settings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_tier_prices        ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_sessions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_orders             ENABLE ROW LEVEL SECURITY;
ALTER TABLE mashup_bundles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_logs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_codes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_credits          ENABLE ROW LEVEL SECURITY;
ALTER TABLE reward_claims             ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_logs                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_scheduled             ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_config              ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_ledger                ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_wallet_transactions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements             ENABLE ROW LEVEL SECURITY;
ALTER TABLE image_credits             ENABLE ROW LEVEL SECURITY;

-- ── STEP 2: Drop old policies (clean slate) ──────────────────────

DO $$ DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
  END LOOP;
END $$;


-- ── STEP 3: Public read-only policies (anon key) ─────────────────
-- These are the ONLY things the anon key can read.
-- All writes and sensitive reads go through the service_role key.

-- Customers need to see active bundles to buy them
CREATE POLICY "anon_read_active_bundles" ON bundle_prices
  FOR SELECT TO anon
  USING (active = true);

CREATE POLICY "anon_read_active_mashup_bundles" ON mashup_bundles
  FOR SELECT TO anon
  USING (active = true);

-- Public announcement banners
CREATE POLICY "anon_read_announcements" ON announcements
  FOR SELECT TO anon
  USING (true);

-- Promo code validation (checkout page checks codes before payment)
CREATE POLICY "anon_read_promo_codes" ON promo_codes
  FOR SELECT TO anon
  USING (true);

-- System settings — only safe public keys (store open/closed, helpline toggle)
-- Blocks: admin_password_hash, phone_blocklist, mtn_verification_enabled, refund_log
CREATE POLICY "anon_read_public_settings" ON system_settings
  FOR SELECT TO anon
  USING (key IN ('store_open', 'store_closed_message', 'helpline_enabled', 'announcement_text', 'announcement_enabled'));


-- ── STEP 4: All other tables — NO anon access ───────────────────
-- RLS enabled + no policy = denied by default. This means:
--   orders            → private (only service_role can read/write)
--   agents            → private
--   commission_*      → private
--   api_keys          → private
--   sms_logs          → private
--   order_logs        → private
--   agent_*           → private
--   admin_config      → private
--   loyalty_sessions  → private
--   referral_credits  → private
--   reward_claims     → private
-- No policy needed — silence = deny.


-- ── STEP 5: Verify ──────────────────────────────────────────────
-- Run this to confirm RLS is ON for all tables:
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
