import { NextRequest } from "next/server";
import { requireAgentSession } from "@/lib/agentAuth";
import { supabase } from "@/lib/supabase";
import { approveOrder } from "@/lib/order-approval";
import { sendAgentNotification } from "@/lib/telegram";

async function access(request: NextRequest, agentId: string) {
  const auth = requireAgentSession(request, agentId, { requireFull: true });
  if (!auth.ok) return { response: Response.json({ error: auth.error }, { status: auth.status }) };
  const { data: agent } = await supabase.from("agents").select("id,plan,status,sub_admin_id").eq("id", agentId).maybeSingle();
  if (!agent || agent.plan !== "pro" || agent.status !== "approved" || !agent.sub_admin_id) return { response: Response.json({ error: "Pro sub-admin access is not active." }, { status: 403 }) };
  return { agent };
}

export async function GET(request: NextRequest) {
  const agentId = request.nextUrl.searchParams.get("agentId") ?? "";
  const result = await access(request, agentId);
  if (result.response) return result.response;
  const subAdminId = result.agent!.sub_admin_id;
  const [{ data: subAdmin }, { data: agents, error }, { data: availableAgents }, { data: commissionLedger }] = await Promise.all([
    supabase.from("sub_admins").select("can_approve_orders").eq("id", subAdminId).single(),
    supabase.from("agents").select("id,name,email,phone,status,total_sales").eq("sub_admin_id", subAdminId).neq("id", agentId).order("name"),
    supabase.from("agents").select("id,name,email,phone,status,total_sales,sub_admin_id").or(`sub_admin_id.is.null,sub_admin_id.neq.${subAdminId}`).neq("id", agentId).eq("status", "approved").order("name"),
    supabase.from("master_commission_ledger").select("order_reference,sub_agent_id,rate,amount,admin_rate,admin_amount,reversed_at,created_at").eq("sub_admin_id", subAdminId).order("created_at", { ascending: false }).limit(200),
  ]);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const ids = (agents ?? []).map(agent => agent.id);
  const ordersResult = ids.length ? await supabase.from("orders").select("reference,agent_id,phone,network,bundle_size,amount,status,created_at").in("agent_id", ids).order("created_at", { ascending: false }).limit(100) : { data: [], error: null };
  if (ordersResult.error) return Response.json({ error: ordersResult.error.message }, { status: 500 });
  const { data: otherMasters } = await supabase.from("sub_admins").select("agent_id").not("agent_id", "is", null);
  const masterIds = new Set((otherMasters ?? []).map(master => master.agent_id));
  const activeCommissions = (commissionLedger ?? []).filter(row => !row.reversed_at);
  return Response.json({ agents: agents ?? [], availableAgents: (availableAgents ?? []).filter(agent => !masterIds.has(agent.id)), orders: ordersResult.data ?? [], canApproveOrders: Boolean(subAdmin?.can_approve_orders), commissionLedger: commissionLedger ?? [], commissionSummary: { subAdminEarnings: activeCommissions.reduce((sum, row) => sum + Number(row.amount ?? 0), 0), adminEarnings: activeCommissions.reduce((sum, row) => sum + Number(row.admin_amount ?? 0), 0), transactions: activeCommissions.length } });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { agentId?: string; assignedAgentIds?: string[] };
  const result = await access(request, body.agentId ?? "");
  if (result.response) return result.response;
  if (!Array.isArray(body.assignedAgentIds)) return Response.json({ error: "Agent list is required." }, { status: 400 });
  const subAdminId = result.agent!.sub_admin_id;
  const requestedIds = [...new Set(body.assignedAgentIds.filter(id => id && id !== body.agentId))];
  const { data: masters } = await supabase.from("sub_admins").select("agent_id").not("agent_id", "is", null);
  const masterIds = new Set((masters ?? []).map(master => master.agent_id));
  if (requestedIds.some(id => masterIds.has(id))) return Response.json({ error: "Another Pro master agent cannot be added to your team." }, { status: 400 });

  const { data: alreadyOwned } = await supabase.from("agents").select("id").in("id", requestedIds.length ? requestedIds : [body.agentId!]).eq("sub_admin_id", subAdminId);
  const ownedIds = new Set((alreadyOwned ?? []).map(row => row.id));
  const inviteIds = requestedIds.filter(id => !ownedIds.has(id));
  let invited = 0;
  for (const targetId of inviteIds) {
    const { data: target } = await supabase.from("agents").select("id,name,telegram_chat_id,sub_admin_id").eq("id", targetId).eq("status", "approved").maybeSingle();
    if (!target) continue;
    const { error } = await supabase.from("team_membership_requests").insert({
      sub_admin_id: subAdminId, agent_id: target.id, from_sub_admin_id: target.sub_admin_id,
      request_type: target.sub_admin_id ? "transfer" : "invitation", status: "pending_agent",
      requested_by_agent_id: body.agentId,
    });
    if (error?.code === "23505") continue;
    if (error) return Response.json({ error: error.message }, { status: 500 });
    invited++;
    if (target.telegram_chat_id) void sendAgentNotification(target.telegram_chat_id, "A Pro agent invited you to join their sales team. Log in to accept or decline. Split: 70% you, 20% Pro sub-admin, 10% platform admin.");
  }
  await supabase.from("sub_admin_activity").insert({ sub_admin_id: subAdminId, action: "team_invitations_sent", details: { invited } });
  return Response.json({ success: true, invited, message: `${invited} invitation(s) sent. Agents must accept before joining.` });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { agentId?: string; reference?: string };
  const result = await access(request, body.agentId ?? "");
  if (result.response) return result.response;
  if (!body.reference) return Response.json({ error: "Reference is required." }, { status: 400 });
  const subAdminId = result.agent!.sub_admin_id;
  const { data: subAdmin } = await supabase.from("sub_admins").select("can_approve_orders").eq("id", subAdminId).single();
  if (!subAdmin?.can_approve_orders) return Response.json({ error: "Approval permission is disabled." }, { status: 403 });
  const { data: order } = await supabase.from("orders").select("agent_id").eq("reference", body.reference).maybeSingle();
  const { data: managed } = order?.agent_id ? await supabase.from("agents").select("id").eq("id", order.agent_id).eq("sub_admin_id", subAdminId).maybeSingle() : { data: null };
  if (!managed) return Response.json({ error: "You cannot manage this order." }, { status: 403 });
  const approval = await approveOrder(body.reference, "admin_dashboard");
  await supabase.from("sub_admin_activity").insert({ sub_admin_id: subAdminId, action: approval.ok ? "order_approved" : "order_approval_failed", target: body.reference, details: { message: approval.message } });
  return Response.json(approval, { status: approval.ok ? 200 : 409 });
}
