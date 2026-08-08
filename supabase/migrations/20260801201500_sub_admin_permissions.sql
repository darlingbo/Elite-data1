alter table public.sub_admins
  add column if not exists permissions jsonb not null default '{"view_agents":true,"view_orders":true,"view_finance":false,"view_customer_contacts":true,"approve_orders":false,"download_reports":false}'::jsonb;

create table if not exists public.sub_admin_activity (
  id bigint generated always as identity primary key,
  sub_admin_id uuid not null references public.sub_admins(id) on delete cascade,
  action text not null,
  target text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists sub_admin_activity_admin_created_idx on public.sub_admin_activity(sub_admin_id, created_at desc);
alter table public.sub_admin_activity enable row level security;
revoke all on table public.sub_admin_activity from public, anon, authenticated;
grant select, insert, update, delete on table public.sub_admin_activity to service_role;
grant usage, select on sequence public.sub_admin_activity_id_seq to service_role;

update public.sub_admins
set permissions = jsonb_build_object(
  'view_agents', true,
  'view_orders', true,
  'view_finance', false,
  'view_customer_contacts', true,
  'approve_orders', can_approve_orders,
  'download_reports', false
)
where permissions is null or permissions = '{}'::jsonb;
