create table if not exists public.sms_drafts (
  id uuid primary key default gen_random_uuid(),
  requested_by text not null,
  phone text not null,
  message text not null check (char_length(message) between 1 and 500),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'cancelled')),
  provider_message text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  sent_at timestamptz
);

alter table public.sms_drafts enable row level security;
revoke all on table public.sms_drafts from anon, authenticated;
grant select, insert, update, delete on table public.sms_drafts to service_role;

create index if not exists sms_drafts_pending_expiry_idx
  on public.sms_drafts (status, expires_at)
  where status = 'pending';
