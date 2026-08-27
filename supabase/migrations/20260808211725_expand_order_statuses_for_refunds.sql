alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check check (
  status in (
    'pending',
    'pending_approval',
    'processing',
    'completed',
    'failed',
    'rejected',
    'refunded',
    'not_on_list',
    'duplicate_blocked',
    'fraud'
  )
);
