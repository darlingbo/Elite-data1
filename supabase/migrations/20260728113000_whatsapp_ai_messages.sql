create table if not exists public.whatsapp_ai_messages (
  id bigint generated always as identity primary key,
  message_id text not null unique,
  phone text not null,
  direction text not null check (direction in ('incoming', 'outgoing')),
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.whatsapp_ai_messages enable row level security;

create index if not exists whatsapp_ai_messages_phone_created_idx
  on public.whatsapp_ai_messages (phone, created_at desc);

comment on table public.whatsapp_ai_messages is
  'Deduplicates Whapi callbacks and records AI support conversations. Server service-role access only.';

create table if not exists public.whatsapp_ai_opt_outs (
  phone text primary key,
  created_at timestamptz not null default now()
);

alter table public.whatsapp_ai_opt_outs enable row level security;

comment on table public.whatsapp_ai_opt_outs is
  'WhatsApp senders who disabled automated AI replies. Server service-role access only.';
