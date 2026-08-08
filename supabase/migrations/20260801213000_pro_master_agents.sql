alter table public.sub_admins
  add column if not exists agent_id uuid unique references public.agents(id) on delete cascade,
  add column if not exists master_commission_rate numeric(5,2) not null default 0 check (master_commission_rate between 0 and 100);

create table if not exists public.master_commission_ledger (
  id bigint generated always as identity primary key,
  sub_admin_id uuid not null references public.sub_admins(id) on delete cascade,
  master_agent_id uuid not null references public.agents(id) on delete cascade,
  sub_agent_id uuid not null references public.agents(id) on delete cascade,
  order_reference text not null unique references public.orders(reference) on delete cascade,
  rate numeric(5,2) not null,
  amount numeric(12,2) not null check (amount >= 0),
  created_at timestamptz not null default now()
);
create index if not exists master_commission_ledger_admin_created_idx on public.master_commission_ledger(sub_admin_id, created_at desc);
alter table public.master_commission_ledger enable row level security;
revoke all on table public.master_commission_ledger from public, anon, authenticated;
grant select, insert, update, delete on table public.master_commission_ledger to service_role;
grant usage, select on sequence public.master_commission_ledger_id_seq to service_role;

create or replace function public.enforce_pro_master_agent()
returns trigger language plpgsql security invoker set search_path = public as $$
declare candidate public.agents%rowtype;
begin
  if new.agent_id is null then raise exception 'A master account must be linked to a Pro agent'; end if;
  select * into candidate from public.agents where id = new.agent_id;
  if candidate.id is null or candidate.status <> 'approved' or coalesce(candidate.plan, '') <> 'pro' then
    raise exception 'Only an approved Pro agent can become a master agent';
  end if;
  new.name := candidate.name;
  new.email := lower(candidate.email);
  return new;
end;
$$;
drop trigger if exists enforce_pro_master_agent_trigger on public.sub_admins;
create trigger enforce_pro_master_agent_trigger before insert or update of agent_id on public.sub_admins for each row execute function public.enforce_pro_master_agent();

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
  if found then update public.agents set commission_balance = coalesce(commission_balance,0) + v_amount where id = v_master.agent_id; return v_amount; end if;
  return 0;
end;
$$;
revoke all on function public.credit_master_agent_commission(text) from public, anon, authenticated;
grant execute on function public.credit_master_agent_commission(text) to service_role;
