alter table public.agents
  add column if not exists team_terms_accepted_at timestamptz,
  add column if not exists team_terms_version text;

create table if not exists public.team_membership_requests (
  id uuid primary key default gen_random_uuid(),
  sub_admin_id uuid not null references public.sub_admins(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  from_sub_admin_id uuid references public.sub_admins(id) on delete set null,
  request_type text not null check (request_type in ('invitation', 'transfer')),
  status text not null default 'pending_agent' check (status in ('pending_agent', 'pending_admin', 'accepted', 'declined', 'cancelled')),
  requested_by_agent_id uuid references public.agents(id) on delete set null,
  agent_consented_at timestamptz,
  admin_decided_at timestamptz,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists team_membership_requests_one_open_idx
  on public.team_membership_requests(agent_id)
  where status in ('pending_agent', 'pending_admin');
create index if not exists team_membership_requests_sub_admin_idx
  on public.team_membership_requests(sub_admin_id, created_at desc);
alter table public.team_membership_requests enable row level security;
revoke all on table public.team_membership_requests from public, anon, authenticated;
grant select, insert, update, delete on table public.team_membership_requests to service_role;

create or replace function public.accept_team_membership_request(p_request_id uuid, p_agent_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_request public.team_membership_requests%rowtype; v_current uuid;
begin
  select * into v_request from public.team_membership_requests
  where id = p_request_id and agent_id = p_agent_id and status = 'pending_agent' for update;
  if v_request.id is null then return 'not_pending'; end if;
  select sub_admin_id into v_current from public.agents where id = p_agent_id for update;
  if v_current is null then
    update public.agents set sub_admin_id = v_request.sub_admin_id,
      team_terms_accepted_at = now(), team_terms_version = '2026-08-02-70-20-10'
    where id = p_agent_id;
    update public.team_membership_requests set status = 'accepted', agent_consented_at = now(), updated_at = now()
    where id = p_request_id;
    return 'accepted';
  end if;
  if v_current = v_request.sub_admin_id then
    update public.team_membership_requests set status = 'accepted', agent_consented_at = now(), updated_at = now()
    where id = p_request_id;
    return 'accepted';
  end if;
  update public.team_membership_requests set status = 'pending_admin', request_type = 'transfer',
    from_sub_admin_id = v_current, agent_consented_at = now(), updated_at = now()
  where id = p_request_id;
  return 'pending_admin';
end;
$$;
revoke all on function public.accept_team_membership_request(uuid, uuid) from public, anon, authenticated;
grant execute on function public.accept_team_membership_request(uuid, uuid) to service_role;

create or replace function public.admin_decide_team_transfer(p_request_id uuid, p_approve boolean, p_note text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_request public.team_membership_requests%rowtype;
begin
  select * into v_request from public.team_membership_requests
  where id = p_request_id and status = 'pending_admin' for update;
  if v_request.id is null then return false; end if;
  if p_approve then
    update public.agents set sub_admin_id = v_request.sub_admin_id,
      team_terms_accepted_at = coalesce(team_terms_accepted_at, now()),
      team_terms_version = '2026-08-02-70-20-10'
    where id = v_request.agent_id;
  end if;
  update public.team_membership_requests
  set status = case when p_approve then 'accepted' else 'declined' end,
      admin_decided_at = now(), admin_note = p_note, updated_at = now()
  where id = p_request_id;
  return true;
end;
$$;
revoke all on function public.admin_decide_team_transfer(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.admin_decide_team_transfer(uuid, boolean, text) to service_role;
