create table if not exists public.financial_reconciliation_snapshots (
  id uuid primary key default gen_random_uuid(),
  report_date date not null unique,
  period_start timestamptz not null,
  period_end timestamptz not null,
  currency text not null default 'GHS',
  metrics jsonb not null default '{}'::jsonb,
  issue_counts jsonb not null default '{}'::jsonb,
  issue_count integer not null default 0,
  risk_amount numeric(14,2) not null default 0,
  status text not null default 'balanced'
    check (status in ('balanced', 'review', 'critical')),
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.financial_reconciliation_snapshots enable row level security;

create index if not exists financial_reconciliation_snapshots_date_idx
  on public.financial_reconciliation_snapshots (report_date desc);

create index if not exists financial_reconciliation_snapshots_status_idx
  on public.financial_reconciliation_snapshots (status, report_date desc)
  where status <> 'balanced';

revoke all on table public.financial_reconciliation_snapshots
  from public, anon, authenticated;
grant select, insert, update on table public.financial_reconciliation_snapshots
  to service_role;
