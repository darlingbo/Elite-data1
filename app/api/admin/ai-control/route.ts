import { cookies } from "next/headers";
import { verifyAdminSessionValue } from "@/lib/adminAuth";
import { supabase } from "@/lib/supabase";

async function isAdmin() {
  const store = await cookies();
  return verifyAdminSessionValue(store.get("admin_session")?.value);
}

const SETTING_KEYS = ["agent_ai_auto_approve_enabled", "agent_ai_min_score", "ai_daily_request_limit", "customer_ai_enabled"] as const;

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const [settings, activity, escalations, agents, daily] = await Promise.all([
    supabase.from("system_settings").select("key,value").in("key", [...SETTING_KEYS]),
    supabase.from("ai_activity").select("id,scope,role,content_redacted,status,latency_ms,estimated_tokens,estimated_cost_usd,feedback,created_at").order("created_at", { ascending: false }).limit(80),
    supabase.from("ai_escalations").select("id,summary_redacted,status,created_at,resolved_at").order("created_at", { ascending: false }).limit(30),
    supabase.from("agents").select("id,name,email,phone,status,plan,application_answers,ai_screening_decision,ai_screening_reason,ai_screening_score,ai_screening_confidence,ai_screened_at,approved_via").not("ai_screened_at", "is", null).order("ai_screened_at", { ascending: false }).limit(50),
    supabase.from("ai_activity").select("estimated_tokens,estimated_cost_usd,status,latency_ms").gte("created_at", since),
  ]);
  const rows = daily.data ?? [];
  return Response.json({
    provider: { name: process.env.GEMINI_API_KEY ? "Google Gemini" : process.env.DEEPSEEK_API_KEY ? "DeepSeek fallback" : "Vercel AI Gateway", ready: Boolean(process.env.GEMINI_API_KEY || process.env.DEEPSEEK_API_KEY || process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN), lastError: activity.data?.find(row => row.status === "error")?.created_at ?? null },
    settings: Object.fromEntries((settings.data ?? []).map(row => [row.key, row.value])),
    usage: { requests: rows.length, tokens: rows.reduce((sum, row) => sum + Number(row.estimated_tokens ?? 0), 0), cost: rows.reduce((sum, row) => sum + Number(row.estimated_cost_usd ?? 0), 0), averageLatency: rows.length ? Math.round(rows.reduce((sum, row) => sum + Number(row.latency_ms ?? 0), 0) / rows.length) : 0, errors: rows.filter(row => row.status === "error").length },
    activity: activity.data ?? [], escalations: escalations.data ?? [], agents: agents.data ?? [],
  });
}

export async function PATCH(request: Request) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (body.action === "resolve_escalation" && typeof body.id === "string") {
    await supabase.from("ai_escalations").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", body.id);
    return Response.json({ success: true });
  }
  const updates: Array<{ key: string; value: string }> = [];
  if ("agentAutoApprove" in body) updates.push({ key: "agent_ai_auto_approve_enabled", value: body.agentAutoApprove ? "1" : "0" });
  if ("customerAi" in body) updates.push({ key: "customer_ai_enabled", value: body.customerAi ? "1" : "0" });
  if ("minScore" in body) updates.push({ key: "agent_ai_min_score", value: String(Math.min(100, Math.max(0, Number(body.minScore) || 70))) });
  if ("dailyLimit" in body) updates.push({ key: "ai_daily_request_limit", value: String(Math.min(5000, Math.max(10, Number(body.dailyLimit) || 500))) });
  if (updates.length) await supabase.from("system_settings").upsert(updates, { onConflict: "key" });
  return Response.json({ success: true });
}
