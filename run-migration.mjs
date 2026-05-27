// Run this once: node run-migration.mjs
// Applies all missing columns and tables to your Supabase database

const SUPABASE_URL = "https://ycgtybmkqrmmlkelwtvq.supabase.co";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljZ3R5Ym1rcXJtbWxrZWx3dHZxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODM2NDAzNSwiZXhwIjoyMDkzOTQwMDM1fQ.sVLAe9WdwRYnBPxl-pbNMCJWVqMsmcLKWydRMLlr9O8";

const statements = [
  // Orders table — missing columns
  "ALTER TABLE orders ADD COLUMN IF NOT EXISTS admin_commission numeric DEFAULT 0",
  "ALTER TABLE orders ADD COLUMN IF NOT EXISTS agent_commission numeric DEFAULT 0",
  "ALTER TABLE orders ADD COLUMN IF NOT EXISTS cost_price numeric DEFAULT 0",
  "ALTER TABLE orders ADD COLUMN IF NOT EXISTS bundle_size_gb numeric DEFAULT 1",
  "ALTER TABLE orders ADD COLUMN IF NOT EXISTS paystack_reference text",
  "ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email text",
  "ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name text",
  "ALTER TABLE orders ADD COLUMN IF NOT EXISTS inventor_order_id text",

  // Agent wallet — prevent double top-up
  "ALTER TABLE agent_wallet_transactions ADD COLUMN IF NOT EXISTS paystack_reference text",

  // Agents table — missing columns
  "ALTER TABLE agents ADD COLUMN IF NOT EXISTS wallet_balance numeric DEFAULT 0",
  "ALTER TABLE agents ADD COLUMN IF NOT EXISTS total_revenue numeric DEFAULT 0",
  "ALTER TABLE agents ADD COLUMN IF NOT EXISTS agent_type text DEFAULT 'commission'",
  "ALTER TABLE agents ADD COLUMN IF NOT EXISTS password_hash text",
  "ALTER TABLE agents ADD COLUMN IF NOT EXISTS telegram_chat_id text",
  "ALTER TABLE agents ADD COLUMN IF NOT EXISTS whatsapp text",
  "ALTER TABLE agents ADD COLUMN IF NOT EXISTS business_name text",

  // Commission settings seed
  `INSERT INTO commission_settings (id, agent_pct) VALUES ('global', 80) ON CONFLICT (id) DO NOTHING`,

  // API ledger (admin balance log)
  `CREATE TABLE IF NOT EXISTS api_ledger (
    id integer PRIMARY KEY DEFAULT 1,
    balance numeric NOT NULL DEFAULT 0,
    last_topped_up numeric DEFAULT 0,
    updated_at timestamptz DEFAULT now()
  )`,
  "INSERT INTO api_ledger (id, balance) VALUES (1, 0) ON CONFLICT (id) DO NOTHING",

  // Manual orders table
  `CREATE TABLE IF NOT EXISTS manual_orders (
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
  )`,

  // Agent wallet transactions table
  `CREATE TABLE IF NOT EXISTS agent_wallet_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id uuid,
    type text NOT NULL,
    amount numeric NOT NULL,
    description text,
    paystack_reference text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  // Commission settings table
  `CREATE TABLE IF NOT EXISTS commission_settings (
    id text PRIMARY KEY DEFAULT 'global',
    agent_pct numeric NOT NULL DEFAULT 80,
    updated_at timestamptz DEFAULT now()
  )`,

  // Agent commission overrides
  `CREATE TABLE IF NOT EXISTS agent_commission_overrides (
    agent_id uuid PRIMARY KEY,
    agent_pct numeric NOT NULL,
    note text,
    updated_at timestamptz DEFAULT now()
  )`,

  // Custom tier prices
  `CREATE TABLE IF NOT EXISTS custom_tier_prices (
    bundle_id text PRIMARY KEY,
    price numeric NOT NULL,
    updated_at timestamptz DEFAULT now()
  )`,

  // Agent bundle prices
  `CREATE TABLE IF NOT EXISTS agent_bundle_prices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id uuid,
    bundle_id text NOT NULL,
    custom_price numeric NOT NULL,
    active boolean NOT NULL DEFAULT true,
    referral_code text,
    updated_at timestamptz DEFAULT now()
  )`,

  // Announcements
  `CREATE TABLE IF NOT EXISTS announcements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    message text NOT NULL,
    target text NOT NULL DEFAULT 'all',
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  // Referral credits
  `CREATE TABLE IF NOT EXISTS referral_credits (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    referral_code text NOT NULL,
    order_id text,
    amount numeric NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  // Loyalty sessions
  `CREATE TABLE IF NOT EXISTS loyalty_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    phone text UNIQUE NOT NULL,
    points integer NOT NULL DEFAULT 0,
    total_spent numeric NOT NULL DEFAULT 0,
    updated_at timestamptz DEFAULT now()
  )`,

  // Admin config
  `CREATE TABLE IF NOT EXISTS admin_config (
    key text PRIMARY KEY,
    value text NOT NULL,
    updated_at timestamptz DEFAULT now()
  )`,

  // Indexes
  "CREATE INDEX IF NOT EXISTS orders_agent_id_idx ON orders(agent_id)",
  "CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(status)",
  "CREATE INDEX IF NOT EXISTS orders_phone_idx ON orders(phone)",
  "CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders(created_at DESC)",
  "CREATE INDEX IF NOT EXISTS agents_referral_idx ON agents(referral_code)",
  "CREATE INDEX IF NOT EXISTS manual_orders_agent_idx ON manual_orders(agent_id)",
  "CREATE INDEX IF NOT EXISTS wallet_txns_agent_idx ON agent_wallet_transactions(agent_id)",
];

console.log(`Running ${statements.length} migration statements...\n`);

let passed = 0, failed = 0;

for (const sql of statements) {
  const label = sql.slice(0, 60).replace(/\n/g, " ").trim() + "...";
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SERVICE_KEY,
        "Authorization": `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ query: sql }),
    });

    if (res.ok) {
      console.log(`✅ ${label}`);
      passed++;
    } else {
      const err = await res.json().catch(() => ({}));
      // If exec_sql function doesn't exist, fall back to direct approach
      if (res.status === 404 || (err.message || "").includes("exec_sql")) {
        console.log(`⚠️  exec_sql not found — see instructions below`);
        break;
      }
      console.log(`❌ ${label}\n   → ${err.message || res.status}`);
      failed++;
    }
  } catch (e) {
    console.log(`❌ ${label}\n   → ${e.message}`);
    failed++;
  }
}

console.log(`\n✅ ${passed} passed  ❌ ${failed} failed`);

if (passed === 0) {
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The exec_sql function is not enabled on your Supabase project.
Do this instead — takes 30 seconds:

1. Go to: https://supabase.com/dashboard/project/ycgtybmkqrmmlkelwtvq/sql/new
2. Copy the contents of: supabase-schema.sql  (in your project folder)
3. Paste it in and click RUN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}
