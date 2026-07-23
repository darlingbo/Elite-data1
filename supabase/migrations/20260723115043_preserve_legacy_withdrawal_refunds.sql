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

revoke execute on function public.reject_agent_withdrawal(uuid) from public, anon, authenticated;
grant execute on function public.reject_agent_withdrawal(uuid) to service_role;
