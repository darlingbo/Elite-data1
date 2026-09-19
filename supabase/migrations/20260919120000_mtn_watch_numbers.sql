-- Numbers manually added for MTN beneficiary tracking, in addition to
-- whatever the orders table already surfaces. Lets the admin add a lead's
-- number and get it verified before their first order ever happens.

create table if not exists public.mtn_watch_numbers (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  note text,
  added_at timestamptz not null default now()
);

create index if not exists mtn_watch_numbers_added_idx on public.mtn_watch_numbers (added_at desc);
