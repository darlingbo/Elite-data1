create or replace function public.admin_dashboard_order_totals()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'total', count(*),
    'completed', count(*) filter (where lower(status) = 'completed'),
    'processing', count(*) filter (where lower(status) = 'processing'),
    'pending', count(*) filter (where lower(status) = 'pending'),
    'failed', count(*) filter (where lower(status) = 'failed'),
    'pendingApproval', count(*) filter (where lower(status) = 'pending_approval'),
    'revenue', coalesce(sum(amount), 0),
    'cost', coalesce(sum(cost_price), 0),
    'adminProfit', coalesce(sum(admin_commission), 0),
    'agentCommissions', coalesce(sum(agent_commission), 0)
  )
  from public.orders
  where archived_at is null;
$$;

revoke execute on function public.admin_dashboard_order_totals() from public, anon, authenticated;
grant execute on function public.admin_dashboard_order_totals() to service_role;
