create table if not exists public.ai_activity (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('admin','customer','agent_screening')),
  session_id text,
  role text not null check (role in ('user','assistant','system')),
  content_redacted text not null,
  status text not null default 'success' check (status in ('success','error','escalated')),
  latency_ms integer not null default 0,
  estimated_tokens integer not null default 0,
  estimated_cost_usd numeric(12,6) not null default 0,
  feedback smallint check (feedback is null or feedback in (-1,1)),
  created_at timestamptz not null default now()
);

create index if not exists ai_activity_created_idx on public.ai_activity(created_at desc);
create index if not exists ai_activity_scope_created_idx on public.ai_activity(scope, created_at desc);
alter table public.ai_activity enable row level security;

create table if not exists public.ai_escalations (
  id uuid primary key default gen_random_uuid(),
  session_id text,
  summary_redacted text not null,
  status text not null default 'open' check (status in ('open','resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists ai_escalations_status_created_idx on public.ai_escalations(status, created_at desc);
alter table public.ai_escalations enable row level security;

alter table public.agents
  add column if not exists ai_screening_score integer,
  add column if not exists ai_screening_confidence text;

alter table public.agents drop constraint if exists agents_ai_screening_score_check;
alter table public.agents add constraint agents_ai_screening_score_check
  check (ai_screening_score is null or ai_screening_score between 0 and 100);

insert into public.system_settings(key,value) values
  ('agent_ai_auto_approve_enabled','1'),
  ('agent_ai_min_score','70'),
  ('ai_daily_request_limit','500'),
  ('customer_ai_enabled','1')
on conflict (key) do nothing;
