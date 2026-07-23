alter table public.orders
  add column if not exists archived_at timestamptz,
  add column if not exists archived_reason text,
  add column if not exists archived_by text;

alter table public.agent_wallet_transactions
  add column if not exists idempotency_key text;

create unique index if not exists agent_wallet_transactions_idempotency_key_idx
  on public.agent_wallet_transactions (idempotency_key)
  where idempotency_key is not null;

create index if not exists orders_active_status_created_idx
  on public.orders (status, created_at desc)
  where archived_at is null;

create or replace function public.admin_complete_order(p_reference text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order
  from public.orders
  where reference = p_reference
  for update;

  if not found then raise exception 'order not found'; end if;
  if lower(v_order.status) = 'completed' then return false; end if;
  if lower(v_order.status) not in ('processing', 'failed', 'pending', 'pending_approval', 'not_on_list') then
    raise exception 'order cannot be completed from status %', v_order.status;
  end if;

  update public.orders
  set status = 'processing'
  where reference = p_reference;

  perform public.apply_agent_order_accounting(p_reference);

  update public.orders
  set status = 'completed',
      completed_at = coalesce(completed_at, now())
  where reference = p_reference;

  return true;
end;
$$;

create or replace function public.admin_adjust_agent_wallet(
  p_agent_id uuid,
  p_delta numeric,
  p_idempotency_key text,
  p_description text
)
returns numeric
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_balance numeric;
  v_inserted uuid;
begin
  if p_delta = 0 then raise exception 'amount must not be zero'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then
    raise exception 'idempotency key required';
  end if;

  insert into public.agent_wallet_transactions
    (agent_id, type, amount, description, idempotency_key)
  values
    (p_agent_id,
     case when p_delta > 0 then 'admin_credit' else 'admin_debit' end,
     abs(p_delta),
     p_description,
     p_idempotency_key)
  on conflict (idempotency_key) where idempotency_key is not null do nothing
  returning id into v_inserted;

  if v_inserted is null then
    select wallet_balance into v_balance from public.agents where id = p_agent_id;
    return v_balance;
  end if;

  update public.agents
  set wallet_balance = coalesce(wallet_balance, 0) + p_delta,
      updated_at = now()
  where id = p_agent_id
    and coalesce(wallet_balance, 0) + p_delta >= 0
  returning wallet_balance into v_balance;

  if v_balance is null then raise exception 'agent not found or insufficient wallet balance'; end if;
  return v_balance;
end;
$$;

create or replace function public.admin_credit_agent_commission(
  p_agent_id uuid,
  p_amount numeric,
  p_idempotency_key text,
  p_description text
)
returns numeric
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_balance numeric;
  v_inserted uuid;
begin
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;

  insert into public.agent_wallet_transactions
    (agent_id, type, amount, description, idempotency_key)
  values
    (p_agent_id, 'order_profit', p_amount, p_description, p_idempotency_key)
  on conflict (idempotency_key) where idempotency_key is not null do nothing
  returning id into v_inserted;

  if v_inserted is null then
    select commission_balance into v_balance from public.agents where id = p_agent_id;
    return v_balance;
  end if;

  update public.agents
  set commission_balance = coalesce(commission_balance, 0) + p_amount,
      updated_at = now()
  where id = p_agent_id
  returning commission_balance into v_balance;

  if v_balance is null then raise exception 'agent not found'; end if;
  return v_balance;
end;
$$;

revoke execute on function public.admin_complete_order(text) from public, anon, authenticated;
revoke execute on function public.admin_adjust_agent_wallet(uuid, numeric, text, text) from public, anon, authenticated;
revoke execute on function public.admin_credit_agent_commission(uuid, numeric, text, text) from public, anon, authenticated;

grant execute on function public.admin_complete_order(text) to service_role;
grant execute on function public.admin_adjust_agent_wallet(uuid, numeric, text, text) to service_role;
grant execute on function public.admin_credit_agent_commission(uuid, numeric, text, text) to service_role;
