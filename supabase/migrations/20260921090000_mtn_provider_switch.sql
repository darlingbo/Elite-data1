-- MTN-only provider switch: Inventor (default) or Yhang Mhany. Telecel and
-- AirtelTigo always stay on Inventor. Replaces the old inventor/datacity/
-- datify "sequential fallback" UI, which was never actually wired into real
-- fulfillment (order-approval.ts only ever called Inventor) -- this one is.

alter table public.orders add column if not exists yhangmhany_order_id text;
create index if not exists orders_yhangmhany_order_id_idx on public.orders (yhangmhany_order_id) where yhangmhany_order_id is not null;

insert into public.system_settings (key, value)
values ('mtn_provider', 'inventor')
on conflict (key) do nothing;
