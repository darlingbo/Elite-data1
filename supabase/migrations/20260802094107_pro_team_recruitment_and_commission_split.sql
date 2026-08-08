-- Unlimited Pro teams. Platform admin margin remains unchanged; the selling
-- agent's commission is split 80/20 between seller and Pro master.
alter table public.sub_admins alter column master_commission_rate set default 20;
update public.sub_admins set master_commission_rate = 20 where agent_id is not null and master_commission_rate = 0;

create or replace function public.credit_master_agent_commission(p_reference text)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_order public.orders%rowtype; v_sub_agent public.agents%rowtype; v_master public.sub_admins%rowtype; v_amount numeric(12,2);
begin
  select * into v_order from public.orders where reference = p_reference and status in ('processing','completed');
  if v_order.agent_id is null then return 0; end if;
  select * into v_sub_agent from public.agents where id = v_order.agent_id;
  if v_sub_agent.sub_admin_id is null then return 0; end if;
  select * into v_master from public.sub_admins where id = v_sub_agent.sub_admin_id and status = 'active';
  if v_master.agent_id is null or v_master.master_commission_rate <= 0 then return 0; end if;
  v_amount := round(greatest(coalesce(v_order.agent_commission, 0), 0) * v_master.master_commission_rate / 100, 2);
  if v_amount <= 0 then return 0; end if;
  insert into public.master_commission_ledger(sub_admin_id, master_agent_id, sub_agent_id, order_reference, rate, amount)
  values(v_master.id, v_master.agent_id, v_sub_agent.id, p_reference, v_master.master_commission_rate, v_amount)
  on conflict(order_reference) do nothing;
  if found then
    update public.agents set commission_balance = greatest(coalesce(commission_balance,0) - v_amount, 0) where id = v_sub_agent.id;
    update public.agents set commission_balance = coalesce(commission_balance,0) + v_amount where id = v_master.agent_id;
    return v_amount;
  end if;
  return 0;
end;
$$;
revoke all on function public.credit_master_agent_commission(text) from public, anon, authenticated;
grant execute on function public.credit_master_agent_commission(text) to service_role;
