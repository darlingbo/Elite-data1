create unique index if not exists payments_reference_unique_idx
  on public.payments (reference)
  where reference is not null;
