import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendAdminAlert } from "@/lib/telegram";
import { networkApiName } from "@/lib/bundles";

const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const INVENTOR_BASE = process.env.INVENTOR_API_BASE_URL;
const INVENTOR_KEY = process.env.INVENTOR_API_KEY;

function isAuthorized(req: NextRequest): boolean {
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  return isVercelCron || !secret || auth === `Bearer ${secret}`;
}

// ── Collect live system state ─────────────────────────────────────────────────
async function collectState() {
  const cutoff15 = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

  const [failedRes, stuckRes, pendingAgentsRes, todayRes, inventorCheck] = await Promise.all([
    supabase
      .from("orders")
      .select("reference, phone, network, bundle_size, bundle_size_gb, agent_id, agent_commission, amount")
      .eq("status", "failed"),
    // Only count stuck orders — never touch them (sync-orders handles that safely via Inventor check)
    supabase
      .from("orders")
      .select("id")
      .in("status", ["pending", "processing"])
      .lt("created_at", cutoff15),
    supabase
      .from("agents")
      .select("id, name, phone")
      .eq("status", "pending"),
    supabase
      .from("orders")
      .select("status, amount, admin_commission")
      .gte("created_at", todayStart),
    fetch(`${INVENTOR_BASE}/api/developer/orders?limit=1`, {
      headers: { Authorization: `Bearer ${INVENTOR_KEY}` },
      signal: AbortSignal.timeout(5000),
    })
      .then((r) => ({ healthy: [200, 201, 404, 422].includes(r.status) }))
      .catch(() => ({ healthy: false })),
  ]);

  const today = todayRes.data ?? [];
  return {
    failedOrders: failedRes.data ?? [],
    stuckOrderCount: (stuckRes.data ?? []).length,
    pendingAgents: pendingAgentsRes.data ?? [],
    inventorHealthy: inventorCheck.healthy,
    today: {
      total: today.length,
      revenue: today.reduce((s, o) => s + (Number(o.amount) || 0), 0),
      profit: today.reduce((s, o) => s + (Number(o.admin_commission) || 0), 0),
      failed: today.filter((o) => o.status === "failed").length,
    },
  };
}

type State = Awaited<ReturnType<typeof collectState>>;
type AIAction = "retry_failed" | "alert_stuck" | "alert_agents" | "alert_inventor_down" | "daily_report";

// ── Ask DeepSeek what to do ───────────────────────────────────────────────────
async function decideActions(state: State): Promise<AIAction[]> {
  const ghTime = new Date().toLocaleString("en-GH", {
    timeZone: "Africa/Accra",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const [ghHour, ghMin] = ghTime.split(":").map(Number);
  const isDailyReportTime = ghHour === 7 && ghMin < 15;

  // No DeepSeek key — rule-based fallback
  if (!DEEPSEEK_KEY) {
    const actions: AIAction[] = [];
    if (state.failedOrders.length > 0 && state.inventorHealthy) actions.push("retry_failed");
    if (state.stuckOrderCount > 0) actions.push("alert_stuck");
    if (state.pendingAgents.length > 0) actions.push("alert_agents");
    if (!state.inventorHealthy) actions.push("alert_inventor_down");
    if (isDailyReportTime) actions.push("daily_report");
    return actions;
  }

  const prompt = `You are the autonomous AI manager of Elite Data Ghana, a mobile data bundle reselling platform in Ghana.

Current time (Ghana): ${ghTime}
System state:
- Failed orders needing retry: ${state.failedOrders.length}
- Stuck orders (>15 min, still processing): ${state.stuckOrderCount}
- New agent applications waiting: ${state.pendingAgents.length}
- Inventor API (data delivery provider) healthy: ${state.inventorHealthy}
- Today: ${state.today.total} orders | Revenue: GH₵${state.today.revenue.toFixed(2)} | Profit: GH₵${state.today.profit.toFixed(2)} | Failed: ${state.today.failed}

Choose actions. Respond with ONLY a JSON array:
- "retry_failed" — retry failed orders (only if inventor healthy)
- "alert_stuck" — warn admin about stuck orders (do NOT touch them yourself)
- "alert_agents" — notify admin of new agent applications
- "alert_inventor_down" — alert admin that data provider is down
- "daily_report" — morning summary (only 07:00–07:15 Ghana time)

Return ONLY the JSON array. Example: ["retry_failed","alert_agents"]
If nothing to do: []`;

  try {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${DEEPSEEK_KEY}` },
      body: JSON.stringify({
        model: "deepseek-chat",
        max_tokens: 80,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) throw new Error(`DeepSeek ${res.status}`);
    const json = await res.json();
    const text = String(json.choices?.[0]?.message?.content ?? "").trim();
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    const match = start !== -1 && end !== -1 ? [text.slice(start, end + 1)] : null;
    if (!match) return [];
    const actions = JSON.parse(match[0]) as AIAction[];
    return Array.isArray(actions) ? (actions.filter((a) => typeof a === "string") as AIAction[]) : [];
  } catch {
    const fallback: AIAction[] = [];
    if (state.failedOrders.length > 0 && state.inventorHealthy) fallback.push("retry_failed");
    return fallback;
  }
}

// ── Ask admin before retrying failed orders ───────────────────────────────────
async function askRetryApproval(orders: State["failedOrders"]) {
  const lines = orders.slice(0, 8).map(
    (o) => `• ${(o.network ?? "").toUpperCase()} ${o.bundle_size} → ${o.phone}`
  ).join("\n");
  const extra = orders.length > 8 ? `\n...and ${orders.length - 8} more` : "";

  await sendAdminAlert(
    `🤖 <b>AI Brain — Action Required</b>\n\n` +
    `❌ <b>${orders.length} failed order(s) found:</b>\n${lines}${extra}\n\n` +
    `Should I retry them now?`,
    {
      inline_keyboard: [[
        { text: "✅ Yes — Retry All", callback_data: "ai_retry:confirm" },
        { text: "❌ No — Skip", callback_data: "ai_retry:skip" },
      ]],
    }
  );
}

// ── Main cron handler ─────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const state = await collectState();
  const actions = await decideActions(state);

  if (actions.length === 0) {
    return Response.json({ status: "idle", message: "All clear — nothing to do" });
  }

  const logLines: string[] = [];
  const alertParts: string[] = [];

  // Ask admin before retrying failed orders (sends its own Telegram message with buttons)
  if (actions.includes("retry_failed") && state.failedOrders.length > 0) {
    await askRetryApproval(state.failedOrders);
    logLines.push(`retry_failed: asked admin to approve ${state.failedOrders.length} orders`);
  }

  // Alert about stuck orders — DO NOT touch them, sync-orders handles that safely
  if (actions.includes("alert_stuck") && state.stuckOrderCount > 0) {
    alertParts.push(`⏳ <b>${state.stuckOrderCount} order(s) stuck >15 min</b>\nSync-orders cron is checking them. Send /pending to review.`);
    logLines.push(`alert_stuck: ${state.stuckOrderCount}`);
  }

  // Alert about pending agent applications
  if (actions.includes("alert_agents") && state.pendingAgents.length > 0) {
    const names = state.pendingAgents.map((a) => `• ${a.name} (${a.phone})`).join("\n");
    alertParts.push(`👤 <b>${state.pendingAgents.length} agent application(s) waiting:</b>\n${names}\nSend /agents to approve or reject.`);
    logLines.push(`alert_agents: ${state.pendingAgents.length}`);
  }

  // Alert if Inventor API is down
  if (actions.includes("alert_inventor_down")) {
    alertParts.push(
      `🚨 <b>INVENTOR API IS DOWN!</b>\n` +
      `Data delivery is blocked. New orders will fail until it recovers.\n` +
      `Check your Inventor dashboard.`
    );
    logLines.push("alert_inventor_down");
  }

  // Morning daily report
  if (actions.includes("daily_report")) {
    alertParts.push(
      `📊 <b>Good morning! Daily Report</b>\n` +
      `Orders: <b>${state.today.total}</b>\n` +
      `Revenue: <b>GH₵${state.today.revenue.toFixed(2)}</b>\n` +
      `Profit: <b>GH₵${state.today.profit.toFixed(2)}</b>\n` +
      `${state.today.failed > 0 ? `⚠️ ${state.today.failed} failed order(s) need attention` : "✅ No failures — running clean!"}`
    );
    logLines.push("daily_report");
  }

  if (alertParts.length > 0) {
    await sendAdminAlert(`🤖 <b>AI Brain</b>\n\n${alertParts.join("\n\n")}`).catch(() => {});
  }

  return Response.json({ status: "ok", actions, log: logLines });
}
