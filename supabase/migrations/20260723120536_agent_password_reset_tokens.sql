create table if not exists public.agent_password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists agent_password_reset_tokens_agent_created_idx
  on public.agent_password_reset_tokens (agent_id, created_at desc);

alter table public.agent_password_reset_tokens enable row level security;
revoke all on table public.agent_password_reset_tokens from anon, authenticated;
grant all on table public.agent_password_reset_tokens to service_role;

create or replace function public.consume_agent_password_reset(
  p_token_hash text,
  p_password_hash text
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_reset public.agent_password_reset_tokens%rowtype;
begin
  select * into v_reset
  from public.agent_password_reset_tokens
  where token_hash = p_token_hash
  for update;

  if not found or v_reset.used_at is not null or v_reset.expires_at <= now() then
    return false;
  end if;

  update public.agents
  set password_hash = p_password_hash
  where id = v_reset.agent_id;
  if not found then return false; end if;

  update public.agent_password_reset_tokens
  set used_at = now()
  where id = v_reset.id;
  return true;
end;
$$;

revoke execute on function public.consume_agent_password_reset(text, text) from public, anon, authenticated;
grant execute on function public.consume_agent_password_reset(text, text) to service_role;
