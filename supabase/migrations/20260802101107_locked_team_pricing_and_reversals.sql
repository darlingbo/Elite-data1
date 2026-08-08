alter table public.agent_bundle_prices
  add column if not exists locked_by_sub_admin_id uuid references public.sub_admins(id) on delete set null,
  add column if not exists locked_at timestamptz;

alter table public.agent_voucher_prices
  add column if not exists locked_by_sub_admin_id uuid references public.sub_admins(id) on delete set null,
  add column if not exists locked_at timestamptz;

create table if not exists public.agent_price_history (
  id bigint generated always as identity primary key,
  target_agent_id uuid not null references public.agents(id) on delete cascade,
  sub_admin_id uuid references public.sub_admins(id) on delete set null,
  actor_type text not null check (actor_type in ('agent', 'sub_admin', 'admin')),
  price_kind text not null check (price_kind in ('bundle', 'voucher')),
  item_key text not null,
  old_price numeric(12,2),
  new_price numeric(12,2),
  action text not null check (action in ('set_and_lock', 'set', 'unlock')),
  created_at timestamptz not null default now()
);
create index if not exists agent_price_history_target_created_idx
  on public.agent_price_history(target_agent_id, created_at desc);
alter table public.agent_price_history enable row level security;
revoke all on table public.agent_price_history from public, anon, authenticated;
grant select, insert, update, delete on table public.agent_price_history to service_role;
grant usage, select on sequence public.agent_price_history_id_seq to service_role;

alter table public.master_commission_ledger
  add column if not exists reversed_at timestamptz,
  add column if not exists reversal_reason text;

create or replace function public.reverse_team_commission(p_reference text, p_reason text default 'order_refunded')
returns boolean language plpgsql security definer set search_path = public as $$
declare v_ledger public.master_commission_ledger%rowtype;
begin
  select * into v_ledger
  from public.master_commission_ledger
  where order_reference = p_reference
  for update;

  if v_ledger.id is null or v_ledger.reversed_at is not null then return false; end if;

  update public.agents
  set commission_balance = coalesce(commission_balance, 0) - v_ledger.amount
  where id = v_ledger.master_agent_id;

  update public.agents
  set commission_balance = coalesce(commission_balance, 0) + v_ledger.amount + v_ledger.admin_amount
  where id = v_ledger.sub_agent_id;

  update public.master_commission_ledger
  set reversed_at = now(), reversal_reason = coalesce(nullif(p_reason, ''), 'order_refunded')
  where id = v_ledger.id;
  return true;
end;
$$;
revoke all on function public.reverse_team_commission(text, text) from public, anon, authenticated;
grant execute on function public.reverse_team_commission(text, text) to service_role;
