create table if not exists public.sms_scheduled (
  id uuid primary key default gen_random_uuid(),
  audience text not null default 'individual',
  phones text[] not null,
  message text not null,
  send_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed', 'cancelled')),
  requested_by text,
  provider_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.sms_scheduled enable row level security;
revoke all on table public.sms_scheduled from public, anon, authenticated;
grant select, insert, update, delete on table public.sms_scheduled to service_role;

create index if not exists sms_scheduled_due_idx
  on public.sms_scheduled (send_at)
  where status = 'pending';

alter table public.sms_drafts
  add column if not exists scheduled_for timestamptz;

alter table public.sms_drafts drop constraint if exists sms_drafts_status_check;
alter table public.sms_drafts add constraint sms_drafts_status_check
  check (status in ('pending', 'sending', 'sent', 'failed', 'cancelled', 'scheduled'));
