-- "Not on beneficiary list / new number" orders are a delivery delay (up to
-- 72 hours), NOT a failure and NOT refundable. Track when the order entered the
-- state and whether the 72h apology SMS has already gone out.

alter table public.orders
  add column if not exists not_on_list_at timestamptz;

alter table public.orders
  add column if not exists not_on_list_apology_sent_at timestamptz;

-- Backfill existing rows so the follow-up cron has a reference point.
update public.orders
set not_on_list_at = coalesce(not_on_list_at, approved_at, created_at)
where status = 'not_on_list' and not_on_list_at is null;

create index if not exists orders_not_on_list_followup_idx
  on public.orders (not_on_list_at)
  where status = 'not_on_list' and not_on_list_apology_sent_at is null;
