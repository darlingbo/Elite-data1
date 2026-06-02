-- ══════════════════════════════════════════════════
-- Elite Data 1 — Database Migration
-- Paste this into Supabase SQL Editor and click Run
-- ══════════════════════════════════════════════════

-- Orders table: add missing columns
ALTER TABLE orders ADD COLUMN IF NOT EXISTS admin_commission numeric DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS agent_commission numeric DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cost_price numeric DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS bundle_size_gb numeric DEFAULT 1;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paystack_reference text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS inventor_order_id text;

-- Agents table: add missing columns
ALTER TABLE agents ADD COLUMN IF NOT EXISTS wallet_balance numeric DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS paystack_wallet_balance numeric DEFAULT 0;
ALTER TABLE bundle_prices ADD COLUMN IF NOT EXISTS api_price numeric;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS total_revenue numeric DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS agent_type text DEFAULT 'commission';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS telegram_chat_id text;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS whatsapp text;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS business_name text;

-- Agent wallet transactions
CREATE TABLE IF NOT EXISTS agent_wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid,
  type text NOT NULL,
  amount numeric NOT NULL,
  description text,
  paystack_reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Manual orders (agent-placed)
CREATE TABLE IF NOT EXISTS manual_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid,
  agent_name text,
  agent_code text,
  customer_phone text NOT NULL,
  network text NOT NULL,
  bundle_id text,
  bundle_size text NOT NULL,
  amount_paid numeric NOT NULL,
  cost_price numeric NOT NULL DEFAULT 0,
  agent_commission numeric NOT NULL DEFAULT 0,
  admin_profit numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Commission settings (global split)
CREATE TABLE IF NOT EXISTS commission_settings (
  id text PRIMARY KEY DEFAULT 'global',
  agent_pct numeric NOT NULL DEFAULT 80,
  updated_at timestamptz DEFAULT now()
);
INSERT INTO commission_settings (id, agent_pct) VALUES ('global', 80) ON CONFLICT (id) DO NOTHING;

-- Per-agent commission overrides
CREATE TABLE IF NOT EXISTS agent_commission_overrides (
  agent_id uuid PRIMARY KEY,
  agent_pct numeric NOT NULL,
  note text,
  updated_at timestamptz DEFAULT now()
);

-- Admin base prices for price-mode agents
CREATE TABLE IF NOT EXISTS custom_tier_prices (
  bundle_id text PRIMARY KEY,
  price numeric NOT NULL,
  updated_at timestamptz DEFAULT now()
);

-- Each agent's own selling prices
CREATE TABLE IF NOT EXISTS agent_bundle_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid,
  bundle_id text NOT NULL,
  custom_price numeric NOT NULL,
  active boolean NOT NULL DEFAULT true,
  referral_code text,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (agent_id, bundle_id)
);
-- Add unique constraint if table already exists
ALTER TABLE agent_bundle_prices DROP CONSTRAINT IF EXISTS agent_bundle_prices_agent_id_bundle_id_key;
ALTER TABLE agent_bundle_prices ADD CONSTRAINT agent_bundle_prices_agent_id_bundle_id_key UNIQUE (agent_id, bundle_id);

-- API balance ledger (each row = one balance snapshot/deposit entry)
CREATE TABLE IF NOT EXISTS api_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,         -- snapshot | deposit | deduction
  amount numeric NOT NULL,
  balance_after numeric,
  note text,
  order_reference text,
  recorded_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_ledger_recorded_at_idx ON api_ledger(recorded_at DESC);
CREATE INDEX IF NOT EXISTS api_ledger_type_idx ON api_ledger(type);

-- Announcements
CREATE TABLE IF NOT EXISTS announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message text NOT NULL,
  target text NOT NULL DEFAULT 'all',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Referral credits
CREATE TABLE IF NOT EXISTS referral_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code text NOT NULL,
  order_id text,
  amount numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Loyalty sessions
CREATE TABLE IF NOT EXISTS loyalty_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text UNIQUE NOT NULL,
  points integer NOT NULL DEFAULT 0,
  total_spent numeric NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

-- Admin config
CREATE TABLE IF NOT EXISTS admin_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

-- ── Developer API Wallet System ──────────────────────────────────────────────
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS wallet_balance numeric NOT NULL DEFAULT 0;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS developer_email text;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS developer_phone text;

CREATE TABLE IF NOT EXISTS api_wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid REFERENCES api_keys(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('credit', 'debit')),
  amount numeric NOT NULL,
  description text,
  reference text,
  balance_after numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_wallet_txns_key_idx ON api_wallet_transactions(api_key_id);
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Order Logs (audit trail per order) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL,
  action text NOT NULL,
  note text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_logs_ref_idx ON order_logs(reference);
CREATE INDEX IF NOT EXISTS order_logs_created_idx ON order_logs(created_at DESC);
-- ─────────────────────────────────────────────────────────────────────────────

-- Indexes
CREATE INDEX IF NOT EXISTS orders_agent_id_idx ON orders(agent_id);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(status);
CREATE INDEX IF NOT EXISTS orders_phone_idx ON orders(phone);
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS agents_referral_idx ON agents(referral_code);
CREATE INDEX IF NOT EXISTS manual_orders_agent_idx ON manual_orders(agent_id);
CREATE INDEX IF NOT EXISTS wallet_txns_agent_idx ON agent_wallet_transactions(agent_id);
