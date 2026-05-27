-- ═══════════════════════════════════════════════════════════════════════════
-- Elite Data 1 — Full Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Paste → Run
-- Safe to run on an existing database (uses CREATE TABLE IF NOT EXISTS)
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ─── 1. AGENTS ───────────────────────────────────────────────────────────────
create table if not exists agents (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  email             text unique not null,
  phone             text,
  whatsapp          text,
  business_name     text,
  referral_code     text unique,
  status            text not null default 'pending',  -- pending | approved | rejected
  agent_type        text default 'commission',         -- commission | custom_price
  commission_balance numeric(12,2) not null default 0,
  wallet_balance    numeric(12,2) not null default 0,
  total_sales       integer not null default 0,
  total_revenue     numeric(12,2) not null default 0,
  rejection_reason  text,
  password_hash     text,
  telegram_chat_id  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz
);

-- ─── 2. ORDERS ───────────────────────────────────────────────────────────────
create table if not exists orders (
  id                uuid primary key default gen_random_uuid(),
  reference         text unique not null,
  paystack_reference text,
  customer_name     text,
  customer_email    text,
  phone             text not null,
  network           text not null,
  bundle_size       text not null,
  bundle_size_gb    numeric(6,3),
  amount            numeric(12,2) not null,
  cost_price        numeric(12,2) not null default 0,
  admin_commission  numeric(12,2) not null default 0,
  agent_commission  numeric(12,2) not null default 0,
  agent_id          uuid references agents(id) on delete set null,
  status            text not null default 'PENDING',  -- PENDING | PROCESSING | COMPLETED | FAILED
  inventor_order_id text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz
);

-- ─── 3. BUNDLE PRICES ────────────────────────────────────────────────────────
create table if not exists bundle_prices (
  id          text primary key,        -- e.g. 'mtn-1gb'
  network     text,                    -- mtn | telecel | airteltigo
  size_label  text,                    -- '1GB'
  size_gb     numeric(6,3),
  price       numeric(12,2) not null,
  cost_price  numeric(12,2) not null,
  validity    text,
  active      boolean not null default true,
  updated_at  timestamptz default now()
);

-- ─── 4. MANUAL ORDERS (placed by agents for their customers) ─────────────────
create table if not exists manual_orders (
  id               uuid primary key default gen_random_uuid(),
  agent_id         uuid references agents(id) on delete set null,
  agent_name       text,
  agent_code       text,
  customer_phone   text not null,
  network          text not null,
  bundle_id        text,
  bundle_size      text not null,
  amount_paid      numeric(12,2) not null,
  cost_price       numeric(12,2) not null default 0,
  agent_commission numeric(12,2) not null default 0,
  admin_profit     numeric(12,2) not null default 0,
  status           text not null default 'pending',  -- pending | completed | failed
  notes            text,
  created_at       timestamptz not null default now()
);

-- ─── 5. AGENT WALLET TRANSACTIONS ────────────────────────────────────────────
create table if not exists agent_wallet_transactions (
  id                  uuid primary key default gen_random_uuid(),
  agent_id            uuid references agents(id) on delete cascade,
  type                text not null,    -- paystack_topup | withdrawal | commission
  amount              numeric(12,2) not null,
  description         text,
  paystack_reference  text unique,      -- prevents duplicate Paystack top-up credits
  created_at          timestamptz not null default now()
);

-- ─── 6. COMMISSION SETTINGS (global agent/admin split) ───────────────────────
create table if not exists commission_settings (
  id          text primary key default 'global',
  agent_pct   numeric(5,2) not null default 80,
  updated_at  timestamptz default now()
);
insert into commission_settings (id, agent_pct)
  values ('global', 80)
  on conflict (id) do nothing;

-- ─── 7. AGENT COMMISSION OVERRIDES (per-agent custom %) ──────────────────────
create table if not exists agent_commission_overrides (
  agent_id    uuid primary key references agents(id) on delete cascade,
  agent_pct   numeric(5,2) not null,
  note        text,
  updated_at  timestamptz default now()
);

-- ─── 8. CUSTOM TIER PRICES (admin base price for price-mode agents) ───────────
create table if not exists custom_tier_prices (
  bundle_id   text primary key,
  price       numeric(12,2) not null,
  updated_at  timestamptz default now()
);

-- ─── 9. AGENT BUNDLE PRICES (agent's own markup prices) ──────────────────────
create table if not exists agent_bundle_prices (
  id            uuid primary key default gen_random_uuid(),
  agent_id      uuid references agents(id) on delete cascade,
  bundle_id     text not null,
  custom_price  numeric(12,2) not null,
  active        boolean not null default true,
  referral_code text,
  updated_at    timestamptz default now(),
  unique(agent_id, bundle_id)
);

-- ─── 10. ADMIN CONFIG (admin password hash, settings) ────────────────────────
create table if not exists admin_config (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz default now()
);

-- ─── 11. API KEYS (for external/partner access) ───────────────────────────────
create table if not exists api_keys (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  key         text unique not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ─── 12. API LEDGER (Inventor API balance log — one row per snapshot) ────────
create table if not exists api_ledger (
  id              uuid primary key default gen_random_uuid(),
  type            text not null,       -- snapshot | deposit | deduction
  amount          numeric(12,2) not null,
  balance_after   numeric(12,2),
  note            text,
  order_reference text,
  recorded_at     timestamptz default now()
);
create index if not exists api_ledger_recorded_at_idx on api_ledger(recorded_at desc);
create index if not exists api_ledger_type_idx on api_ledger(type);

-- ─── 13. ANNOUNCEMENTS ───────────────────────────────────────────────────────
create table if not exists announcements (
  id          uuid primary key default gen_random_uuid(),
  message     text not null,
  target      text not null default 'all',  -- all | agents_commission | agents_custom_price | customers
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ─── 14. REFERRAL CREDITS ────────────────────────────────────────────────────
create table if not exists referral_credits (
  id            uuid primary key default gen_random_uuid(),
  referral_code text not null,
  order_id      text,
  amount        numeric(12,2) not null,
  created_at    timestamptz not null default now()
);

-- ─── 15. LOYALTY SESSIONS (repeat-customer points) ───────────────────────────
create table if not exists loyalty_sessions (
  id           uuid primary key default gen_random_uuid(),
  phone        text unique not null,
  points       integer not null default 0,
  total_spent  numeric(12,2) not null default 0,
  updated_at   timestamptz default now()
);

-- ─── 16. IMAGE CREDITS (AI image generation) ─────────────────────────────────
create table if not exists image_credits (
  id          uuid primary key default gen_random_uuid(),
  phone       text unique not null,
  credits     integer not null default 0,
  updated_at  timestamptz default now()
);

-- ─── INDEXES (speed up common queries) ───────────────────────────────────────
create index if not exists orders_agent_id_idx     on orders(agent_id);
create index if not exists orders_status_idx       on orders(status);
create index if not exists orders_phone_idx        on orders(phone);
create index if not exists orders_created_at_idx   on orders(created_at desc);
create index if not exists agents_referral_idx     on agents(referral_code);
create index if not exists agents_status_idx       on agents(status);
create index if not exists manual_orders_agent_idx on manual_orders(agent_id);
create index if not exists wallet_txns_agent_idx   on agent_wallet_transactions(agent_id);
create index if not exists referral_credits_code_idx on referral_credits(referral_code);
