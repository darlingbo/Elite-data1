create unique index if not exists api_wallet_transactions_order_event_uidx
  on public.api_wallet_transactions (reference, type)
  where reference is not null;

create or replace function public.reserve_api_wallet_order(
  p_api_key_id uuid,
  p_reference text,
  p_amount numeric,
  p_description text
)
returns numeric
language plpgsql
set search_path = public
as $$
declare
  v_balance numeric;
begin
  if p_amount <= 0 or nullif(trim(p_reference), '') is null then
    raise exception 'invalid API wallet order';
  end if;

  update public.api_keys
  set wallet_balance = round((coalesce(wallet_balance, 0) - round(p_amount, 2))::numeric, 2)
  where id = p_api_key_id
    and coalesce(wallet_balance, 0) >= round(p_amount, 2)
  returning wallet_balance into v_balance;

  if v_balance is null then
    raise exception 'API key not found or insufficient wallet balance';
  end if;

  insert into public.api_wallet_transactions
    (api_key_id, type, amount, description, reference, balance_after)
  values
    (p_api_key_id, 'debit', round(p_amount, 2), p_description, p_reference, v_balance);

  return v_balance;
end;
$$;

create or replace function public.refund_api_wallet_order(
  p_reference text
)
returns numeric
language plpgsql
set search_path = public
as $$
declare
  v_debit public.api_wallet_transactions%rowtype;
  v_balance numeric;
begin
  select *
  into v_debit
  from public.api_wallet_transactions
  where reference = p_reference and type = 'debit'
  for update;

  if not found then
    raise exception 'API wallet debit not found';
  end if;

  if exists (
    select 1
    from public.api_wallet_transactions
    where api_key_id = v_debit.api_key_id
      and reference = p_reference
      and type = 'credit'
  ) then
    select wallet_balance into v_balance
    from public.api_keys
    where id = v_debit.api_key_id;
    return v_balance;
  end if;

  update public.api_keys
  set wallet_balance = round((coalesce(wallet_balance, 0) + abs(v_debit.amount))::numeric, 2)
  where id = v_debit.api_key_id
  returning wallet_balance into v_balance;

  insert into public.api_wallet_transactions
    (api_key_id, type, amount, description, reference, balance_after)
  values
    (v_debit.api_key_id, 'credit', abs(v_debit.amount),
     'Refund for rejected or failed order ' || p_reference, p_reference, v_balance);

  return v_balance;
end;
$$;

revoke execute on function public.reserve_api_wallet_order(uuid, text, numeric, text)
  from public, anon, authenticated;
revoke execute on function public.refund_api_wallet_order(text)
  from public, anon, authenticated;

grant execute on function public.reserve_api_wallet_order(uuid, text, numeric, text)
  to service_role;
grant execute on function public.refund_api_wallet_order(text)
  to service_role;

create or replace function public.reject_reserved_wallet_order(
  p_reference text
)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_debit public.api_wallet_transactions%rowtype;
  v_balance numeric;
begin
  select *
  into v_order
  from public.orders
  where reference = p_reference
  for update;

  if not found then return 'not_found'; end if;
  if v_order.status <> 'pending_approval' then return 'already_processed'; end if;

  if coalesce(v_order.payment_method, '') = 'api_wallet' then
    select *
    into v_debit
    from public.api_wallet_transactions
    where reference = p_reference and type = 'debit'
    for update;

    if not found then raise exception 'API wallet debit not found'; end if;

    update public.api_keys
    set wallet_balance = round((coalesce(wallet_balance, 0) + abs(v_debit.amount))::numeric, 2)
    where id = v_debit.api_key_id
    returning wallet_balance into v_balance;

    insert into public.api_wallet_transactions
      (api_key_id, type, amount, description, reference, balance_after)
    values
      (v_debit.api_key_id, 'credit', abs(v_debit.amount),
       'Refund for rejected order ' || p_reference, p_reference, v_balance);

    update public.orders set status = 'rejected' where reference = p_reference;
    return 'api_wallet_refunded';
  end if;

  if (coalesce(v_order.payment_method, '') = 'agent_wallet'
      or p_reference like 'AGTWALLET-%')
     and v_order.agent_id is not null then
    update public.agents
    set wallet_balance = round((coalesce(wallet_balance, 0) + coalesce(v_order.amount, 0))::numeric, 2)
    where id = v_order.agent_id;

    update public.orders set status = 'rejected' where reference = p_reference;
    return 'agent_wallet_refunded';
  end if;

  return 'not_wallet';
end;
$$;

revoke execute on function public.reject_reserved_wallet_order(text)
  from public, anon, authenticated;
grant execute on function public.reject_reserved_wallet_order(text)
  to service_role;

create or replace function public.credit_api_wallet(
  p_api_key_id uuid,
  p_reference text,
  p_amount numeric,
  p_description text
)
returns numeric
language plpgsql
set search_path = public
as $$
declare
  v_balance numeric;
begin
  if p_amount <= 0 or nullif(trim(p_reference), '') is null then
    raise exception 'invalid API wallet credit';
  end if;

  begin
    insert into public.api_wallet_transactions
      (api_key_id, type, amount, description, reference)
    values
      (p_api_key_id, 'credit', round(p_amount, 2), p_description, p_reference);
  exception when unique_violation then
    select wallet_balance into v_balance
    from public.api_keys
    where id = p_api_key_id;
    return v_balance;
  end;

  update public.api_keys
  set wallet_balance = round((coalesce(wallet_balance, 0) + round(p_amount, 2))::numeric, 2)
  where id = p_api_key_id
  returning wallet_balance into v_balance;

  if v_balance is null then raise exception 'API key not found'; end if;

  update public.api_wallet_transactions
  set balance_after = v_balance
  where api_key_id = p_api_key_id
    and reference = p_reference
    and type = 'credit';

  return v_balance;
end;
$$;

revoke execute on function public.credit_api_wallet(uuid, text, numeric, text)
  from public, anon, authenticated;
grant execute on function public.credit_api_wallet(uuid, text, numeric, text)
  to service_role;
