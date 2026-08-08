create table if not exists public.sub_admins (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  password_hash text not null,
  status text not null default 'active' check (status in ('active', 'disabled')),
  can_approve_orders boolean not null default false,
  session_hash text,
  session_expires_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.agents
  add column if not exists sub_admin_id uuid references public.sub_admins(id) on delete set null;

create index if not exists agents_sub_admin_id_idx on public.agents(sub_admin_id);
create index if not exists orders_agent_id_created_at_idx on public.orders(agent_id, created_at desc);

alter table public.sub_admins enable row level security;
revoke all on table public.sub_admins from anon, authenticated;
grant all on table public.sub_admins to service_role;
