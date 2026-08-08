import { isAdmin } from "@/lib/adminAuth";
import { supabase } from "@/lib/supabase";
import { sendAgentNotification } from "@/lib/telegram";

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await supabase.from("team_membership_requests")
    .select("id,agent_id,sub_admin_id,from_sub_admin_id,status,agent_consented_at,created_at,agents(name,email,phone),sub_admins(name,email)")
    .eq("status", "pending_admin").order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ transfers: data ?? [] });
}

export async function POST(request: Request) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { requestId?: string; action?: "approve" | "decline"; note?: string } | null;
  if (!body?.requestId || !["approve", "decline"].includes(body.action ?? "")) return Response.json({ error: "Invalid request." }, { status: 400 });
  const { data: row } = await supabase.from("team_membership_requests").select("agent_id").eq("id", body.requestId).eq("status", "pending_admin").maybeSingle();
  if (!row) return Response.json({ error: "Transfer is no longer pending." }, { status: 409 });
  const { data: decided, error } = await supabase.rpc("admin_decide_team_transfer", { p_request_id: body.requestId, p_approve: body.action === "approve", p_note: body.note ?? null });
  if (error || !decided) return Response.json({ error: error?.message ?? "Transfer is no longer pending." }, { status: error ? 500 : 409 });
  const { data: agent } = await supabase.from("agents").select("telegram_chat_id").eq("id", row.agent_id).maybeSingle();
  if (agent?.telegram_chat_id) void sendAgentNotification(agent.telegram_chat_id, `Your team transfer was ${body.action === "approve" ? "approved" : "declined"} by the platform admin.`);
  return Response.json({ success: true });
}
