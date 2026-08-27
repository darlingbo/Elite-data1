create or replace function public.refund_agent_wallet_order(p_reference text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_amount numeric;
  v_balance numeric;
  v_transaction_id uuid;
begin
  select * into v_order
  from public.orders
  where reference = p_reference
  for update;

  if not found then return jsonb_build_object('result', 'not_found'); end if;
  if v_order.agent_id is null or v_order.reference not like 'AGTWALLET-%' then
    return jsonb_build_object('result', 'not_agent_wallet');
  end if;
  if v_order.status = 'completed' then
    return jsonb_build_object('result', 'completed');
  end if;
  if v_order.refunded then
    select wallet_balance into v_balance from public.agents where id = v_order.agent_id;
    return jsonb_build_object('result', 'already_refunded', 'amount', coalesce(v_order.refund_amount, v_order.amount), 'balance', v_balance);
  end if;
  -- 'not_on_list' is a manual-delivery delay (up to 72h), never a refund case.
  if v_order.status not in ('failed', 'rejected') then
    return jsonb_build_object('result', 'not_refundable', 'status', v_order.status);
  end if;

  v_amount := round(coalesce(v_order.amount, v_order.cost_price, 0)::numeric, 2);
  if v_amount <= 0 then return jsonb_build_object('result', 'invalid_amount'); end if;

  insert into public.agent_wallet_transactions
    (agent_id, type, amount, description, idempotency_key)
  values
    (v_order.agent_id, 'order_refund', v_amount,
     'Wallet refund for failed order ' || p_reference,
     'order-refund:' || p_reference)
  on conflict (idempotency_key) where idempotency_key is not null do nothing
  returning id into v_transaction_id;

  if v_transaction_id is not null then
    update public.agents
    set wallet_balance = round((coalesce(wallet_balance, 0) + v_amount)::numeric, 2),
        updated_at = now()
    where id = v_order.agent_id
    returning wallet_balance into v_balance;
    if v_balance is null then raise exception 'agent not found'; end if;
  else
    select wallet_balance into v_balance from public.agents where id = v_order.agent_id;
  end if;

  update public.orders
  set refunded = true,
      refunded_at = coalesce(refunded_at, now()),
      refund_amount = v_amount,
      status = 'refunded'
  where reference = p_reference;

  return jsonb_build_object('result', 'refunded', 'amount', v_amount, 'balance', v_balance, 'agent_id', v_order.agent_id);
end;
$$;

revoke execute on function public.refund_agent_wallet_order(text) from public, anon, authenticated;
grant execute on function public.refund_agent_wallet_order(text) to service_role;
