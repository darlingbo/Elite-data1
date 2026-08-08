import { NextRequest } from "next/server";
import { requireAgentSession } from "@/lib/agentAuth";
import { supabase } from "@/lib/supabase";
import { sendAdminAlert, sendAgentNotification, tgEscape } from "@/lib/telegram";

export async function GET(request: NextRequest) {
  const agentId = request.nextUrl.searchParams.get("agentId") ?? "";
  const auth = requireAgentSession(request, agentId, { requireFull: true });
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  const { data, error } = await supabase.from("team_membership_requests")
    .select("id,sub_admin_id,request_type,status,created_at,sub_admins(name,email)")
    .eq("agent_id", agentId).in("status", ["pending_agent", "pending_admin"])
    .order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ invitations: data ?? [] });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { agentId?: string; requestId?: string; action?: "accept" | "decline" } | null;
  if (!body?.agentId || !body.requestId || !["accept", "decline"].includes(body.action ?? "")) return Response.json({ error: "Invalid request." }, { status: 400 });
  const auth = requireAgentSession(request, body.agentId, { requireFull: true });
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  const { data: invitation } = await supabase.from("team_membership_requests")
    .select("id,sub_admin_id,status,sub_admins(name,agent_id)").eq("id", body.requestId).eq("agent_id", body.agentId).maybeSingle();
  if (!invitation || invitation.status !== "pending_agent") return Response.json({ error: "Invitation is no longer pending." }, { status: 409 });
  if (body.action === "decline") {
    await supabase.from("team_membership_requests").update({ status: "declined", updated_at: new Date().toISOString() }).eq("id", invitation.id);
    return Response.json({ success: true, status: "declined" });
  }
  const { data: result, error } = await supabase.rpc("accept_team_membership_request", { p_request_id: invitation.id, p_agent_id: body.agentId });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const master = Array.isArray(invitation.sub_admins) ? invitation.sub_admins[0] : invitation.sub_admins;
  const { data: agent } = await supabase.from("agents").select("name,telegram_chat_id").eq("id", body.agentId).single();
  if (master?.agent_id) {
    const { data: masterAgent } = await supabase.from("agents").select("telegram_chat_id").eq("id", master.agent_id).maybeSingle();
    if (masterAgent?.telegram_chat_id) void sendAgentNotification(masterAgent.telegram_chat_id, `New team response: ${agent?.name ?? "An agent"} accepted your invitation. Status: ${result}.`);
  }
  if (result === "pending_admin") await sendAdminAlert(`🔁 <b>TEAM TRANSFER APPROVAL NEEDED</b>\n\nAgent: ${tgEscape(agent?.name ?? body.agentId)}\nNew Pro team: ${tgEscape(master?.name ?? "Unknown")}`).catch(() => {});
  return Response.json({ success: true, status: result });
}
