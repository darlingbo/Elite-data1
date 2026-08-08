import { getSubAdminSession } from "@/lib/subAdminAuth";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const session = await getSubAdminSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const p = session.permissions;
  const { data: agents, error: agentError } = await supabase.from("agents")
    .select("id,name,email,phone,referral_code,status,agent_type,plan,commission_balance,wallet_balance,total_sales,total_revenue,created_at")
    .eq("sub_admin_id", session.id)
    .order("name");
  if (agentError) return Response.json({ error: agentError.message }, { status: 500 });
  const agentIds = (agents ?? []).map(agent => agent.id);
  const { data: orders, error: orderError } = agentIds.length
    ? await supabase.from("orders")
        .select("reference,agent_id,customer_name,phone,network,bundle_size,amount,status,created_at")
        .in("agent_id", agentIds)
        .order("created_at", { ascending: false })
        .limit(250)
    : { data: [], error: null };
  if (orderError) return Response.json({ error: orderError.message }, { status: 500 });
  const safeAgents = p.view_agents ? (agents ?? []).map(agent => ({
    ...agent,
    email: p.view_customer_contacts ? agent.email : null,
    phone: p.view_customer_contacts ? agent.phone : null,
    commission_balance: p.view_finance ? agent.commission_balance : null,
    wallet_balance: p.view_finance ? agent.wallet_balance : null,
    total_revenue: p.view_finance ? agent.total_revenue : null,
  })) : [];
  const safeOrders = p.view_orders ? (orders ?? []).map(order => ({
    ...order,
    phone: p.view_customer_contacts ? order.phone : "Hidden",
    customer_name: p.view_customer_contacts ? order.customer_name : "Customer",
    amount: p.view_finance ? order.amount : null,
  })) : [];
  const { data: activity } = await supabase.from("sub_admin_activity").select("action,target,created_at").eq("sub_admin_id", session.id).order("created_at", { ascending: false }).limit(20);
  const [{ data: masterAgent }, { data: masterLedger }] = await Promise.all([
    supabase.from("agents").select("referral_code,commission_balance,wallet_balance,plan").eq("id", session.agentId).single(),
    supabase.from("master_commission_ledger").select("order_reference,sub_agent_id,rate,amount,created_at").eq("sub_admin_id", session.id).order("created_at", { ascending: false }).limit(100),
  ]);
  return Response.json({
    subAdmin: session,
    agents: safeAgents,
    orders: safeOrders,
    activity: activity ?? [],
    masterAgent,
    masterCommissions: masterLedger ?? [],
  });
}
