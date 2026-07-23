-- Security hardening for agent money flows.
-- All functions in this migration are server-only: the application uses the
-- service-role client after authenticating the caller itself.

revoke execute on function public.adjust_agent_wallet(uuid, numeric) from public, anon, authenticated;
revoke execute on function public.deduct_agent_wallet(uuid, numeric) from public, anon, authenticated;
revoke execute on function public.increment_agent_stats(uuid, numeric, numeric) from public, anon, authenticated;
revoke execute on function public.bk_credit_agent(uuid, numeric, numeric) from public, anon, authenticated;

grant execute on function public.adjust_agent_wallet(uuid, numeric) to service_role;
grant execute on function public.deduct_agent_wallet(uuid, numeric) to service_role;
grant execute on function public.increment_agent_stats(uuid, numeric, numeric) to service_role;
grant execute on function public.bk_credit_agent(uuid, numeric, numeric) to service_role;

alter function public.adjust_agent_wallet(uuid, numeric) set search_path = public;
alter function public.deduct_agent_wallet(uuid, numeric) set search_path = public;
alter function public.increment_agent_stats(uuid, numeric, numeric) set search_path = public;
alter function public.bk_credit_agent(uuid, numeric, numeric) set search_path = public;

alter table public.agent_wallet_transactions
  add column if not exists withdrawal_commission_amount numeric not null default 0,
  add column if not exists withdrawal_paystack_amount numeric not null default 0;

alter table public.orders
  add column if not exists agent_accounting_applied_at timestamptz;

alter table public.reward_claims
  add column if not exists status text not null default 'completed';

create unique index if not exists agent_wallet_transactions_paystack_reference_uidx
  on public.agent_wallet_transactions (paystack_reference)
  where paystack_reference is not null;

create or replace function public.credit_agent_wallet_topup(
  p_agent_id uuid,
  p_reference text,
  p_amount numeric
) returns numeric
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_balance numeric;
begin
  if p_amount <= 0 or nullif(trim(p_reference), '') is null then
    raise exception 'invalid wallet top-up';
  end if;

  insert into public.agent_wallet_transactions
    (agent_id, type, amount, description, status, paystack_reference)
  values
    (p_agent_id, 'deposit', p_amount, 'Wallet top-up via Paystack', 'completed', p_reference);

  update public.agents
  set wallet_balance = coalesce(wallet_balance, 0) + p_amount,
      paystack_wallet_balance = coalesce(paystack_wallet_balance, 0) + p_amount
  where id = p_agent_id
  returning wallet_balance into v_balance;

  if not found then
    raise exception 'agent not found';
  end if;

  return v_balance;
end;
$$;

create or replace function public.reserve_agent_withdrawal(
  p_agent_id uuid,
  p_amount numeric,
  p_description text
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_agent public.agents%rowtype;
  v_from_commission numeric;
  v_from_paystack numeric;
  v_transaction_id uuid;
begin
  if p_amount <= 0 then
    raise exception 'invalid withdrawal amount';
  end if;

  select * into v_agent
  from public.agents
  where id = p_agent_id
  for update;

  if not found then raise exception 'agent not found'; end if;
  if v_agent.status <> 'approved' then raise exception 'agent not approved'; end if;

  v_from_commission := least(p_amount, coalesce(v_agent.commission_balance, 0));
  v_from_paystack := p_amount - v_from_commission;

  if v_from_paystack > 0 and coalesce(v_agent.agent_type, 'commission') <> 'custom_price' then
    raise exception 'insufficient balance';
  end if;
  if v_from_paystack > coalesce(v_agent.paystack_wallet_balance, 0) then
    raise exception 'insufficient balance';
  end if;

  update public.agents
  set commission_balance = coalesce(commission_balance, 0) - v_from_commission,
      paystack_wallet_balance = coalesce(paystack_wallet_balance, 0) - v_from_paystack,
      wallet_balance = coalesce(wallet_balance, 0) - v_from_paystack
  where id = p_agent_id;

  insert into public.agent_wallet_transactions
    (agent_id, type, amount, description, status,
     withdrawal_commission_amount, withdrawal_paystack_amount)
  values
    (p_agent_id, 'withdrawal', -p_amount, p_description, 'pending',
     v_from_commission, v_from_paystack)
  returning id into v_transaction_id;

  return v_transaction_id;
end;
$$;

create or replace function public.reject_agent_withdrawal(p_transaction_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_tx public.agent_wallet_transactions%rowtype;
begin
  select * into v_tx
  from public.agent_wallet_transactions
  where id = p_transaction_id
  for update;

  if not found then raise exception 'transaction not found'; end if;
  if v_tx.type <> 'withdrawal' or v_tx.status <> 'pending' then return false; end if;

  -- Pending withdrawals created before these allocation columns existed were
  -- deducted from commission only. Preserve their refund behavior.
  if v_tx.withdrawal_commission_amount = 0
     and v_tx.withdrawal_paystack_amount = 0 then
    v_tx.withdrawal_commission_amount := abs(v_tx.amount);
  end if;

  update public.agent_wallet_transactions
  set status = 'rejected'
  where id = p_transaction_id;

  update public.agents
  set commission_balance = coalesce(commission_balance, 0) + v_tx.withdrawal_commission_amount,
      paystack_wallet_balance = coalesce(paystack_wallet_balance, 0) + v_tx.withdrawal_paystack_amount,
      wallet_balance = coalesce(wallet_balance, 0) + v_tx.withdrawal_paystack_amount
  where id = v_tx.agent_id;

  return true;
end;
$$;

create or replace function public.apply_agent_order_accounting(p_reference text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_agent public.agents%rowtype;
  v_tier_price numeric;
begin
  select * into v_order
  from public.orders
  where reference = p_reference
  for update;

  if not found then raise exception 'order not found'; end if;
  if v_order.agent_id is null or coalesce(v_order.agent_commission, 0) <= 0 then return false; end if;
  if v_order.agent_accounting_applied_at is not null then return false; end if;
  if v_order.status <> 'processing' then raise exception 'order is not approved'; end if;

  select * into v_agent
  from public.agents
  where id = v_order.agent_id
  for update;

  if not found then raise exception 'agent not found'; end if;

  if v_agent.agent_type = 'custom_price' and v_agent.plan = 'free' then
    v_tier_price := coalesce(v_order.cost_price, 0) + coalesce(v_order.admin_commission, 0);
    if coalesce(v_agent.wallet_balance, 0) < v_tier_price
       or coalesce(v_agent.paystack_wallet_balance, 0) < v_tier_price then
      raise exception 'insufficient agent wallet balance';
    end if;
    update public.agents
    set wallet_balance = wallet_balance - v_tier_price,
        paystack_wallet_balance = paystack_wallet_balance - v_tier_price,
        commission_balance = coalesce(commission_balance, 0) + v_order.agent_commission,
        total_sales = coalesce(total_sales, 0) + 1
    where id = v_order.agent_id;
  else
    update public.agents
    set commission_balance = coalesce(commission_balance, 0) + v_order.agent_commission,
        total_sales = coalesce(total_sales, 0) + 1,
        total_revenue = coalesce(total_revenue, 0) + coalesce(v_order.amount, 0)
    where id = v_order.agent_id;
  end if;

  update public.orders
  set agent_accounting_applied_at = now()
  where reference = p_reference;

  return true;
end;
$$;

revoke execute on function public.credit_agent_wallet_topup(uuid, text, numeric) from public, anon, authenticated;
revoke execute on function public.reserve_agent_withdrawal(uuid, numeric, text) from public, anon, authenticated;
revoke execute on function public.reject_agent_withdrawal(uuid) from public, anon, authenticated;
revoke execute on function public.apply_agent_order_accounting(text) from public, anon, authenticated;

grant execute on function public.credit_agent_wallet_topup(uuid, text, numeric) to service_role;
grant execute on function public.reserve_agent_withdrawal(uuid, numeric, text) to service_role;
grant execute on function public.reject_agent_withdrawal(uuid) to service_role;
grant execute on function public.apply_agent_order_accounting(text) to service_role;
