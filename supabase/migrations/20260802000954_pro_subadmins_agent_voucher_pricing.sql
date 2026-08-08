create table if not exists public.agent_voucher_prices (
  agent_id uuid not null references public.agents(id) on delete cascade,
  voucher_type text not null check (voucher_type in ('BECE', 'WASSCE')),
  sell_price numeric(12,2) not null check (sell_price >= 17),
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (agent_id, voucher_type)
);

alter table public.agent_voucher_prices enable row level security;
revoke all on table public.agent_voucher_prices from public, anon, authenticated;
grant select, insert, update, delete on table public.agent_voucher_prices to service_role;

create or replace function public.sync_pro_agent_sub_admin()
returns trigger language plpgsql security invoker set search_path = public as $$
declare v_sub_admin_id uuid;
begin
  if new.status = 'approved' and coalesce(new.plan, '') = 'pro' and new.password_hash is not null then
    update public.sub_admins set
      name = new.name, email = lower(new.email), password_hash = new.password_hash,
      status = 'active', agent_id = new.id, master_commission_rate = 20, updated_at = now()
    where id = new.sub_admin_id or lower(email) = lower(new.email)
    returning id into v_sub_admin_id;
    if not found then
      insert into public.sub_admins (
        name, email, password_hash, status, can_approve_orders, permissions, agent_id, master_commission_rate
      ) values (
        new.name, lower(new.email), new.password_hash, 'active', false,
        '{"view_agents":true,"view_orders":true,"view_finance":false,"view_customer_contacts":true,"approve_orders":false,"download_reports":false}'::jsonb,
        new.id, 20
      ) returning id into v_sub_admin_id;
    end if;
    update public.agents set sub_admin_id = v_sub_admin_id where id = new.id and sub_admin_id is distinct from v_sub_admin_id;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_pro_agent_sub_admin_trigger on public.agents;
create trigger sync_pro_agent_sub_admin_trigger
after insert or update of plan, status, password_hash, name, email on public.agents
for each row execute function public.sync_pro_agent_sub_admin();

update public.sub_admins sa set
  name = a.name, email = lower(a.email), password_hash = a.password_hash,
  status = 'active', agent_id = a.id, master_commission_rate = 20, updated_at = now()
from public.agents a
where (sa.id = a.sub_admin_id or lower(sa.email) = lower(a.email))
  and a.status = 'approved' and coalesce(a.plan, '') = 'pro' and a.password_hash is not null;

with created as (
  insert into public.sub_admins (name, email, password_hash, status, can_approve_orders, permissions, agent_id, master_commission_rate)
  select a.name, lower(a.email), a.password_hash, 'active', false,
    '{"view_agents":true,"view_orders":true,"view_finance":false,"view_customer_contacts":true,"approve_orders":false,"download_reports":false}'::jsonb,
    a.id, 20
  from public.agents a
  where a.status = 'approved' and coalesce(a.plan, '') = 'pro' and a.password_hash is not null
    and not exists (select 1 from public.sub_admins sa where sa.id = a.sub_admin_id or lower(sa.email) = lower(a.email))
  returning id, email
)
update public.agents a set sub_admin_id = c.id
from created c where lower(a.email) = lower(c.email);

update public.agents a set sub_admin_id = sa.id
from public.sub_admins sa
where lower(a.email) = lower(sa.email) and a.status = 'approved' and coalesce(a.plan, '') = 'pro';
