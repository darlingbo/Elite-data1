alter table public.orders
  add column if not exists approved_at timestamptz,
  add column if not exists approved_via text,
  add column if not exists provider_used text,
  add column if not exists fulfillment_started_at timestamptz,
  add column if not exists completed_at timestamptz;

create index if not exists orders_approved_at_idx
  on public.orders (approved_at desc)
  where approved_at is not null;

create index if not exists orders_status_created_idx
  on public.orders (status, created_at desc);
