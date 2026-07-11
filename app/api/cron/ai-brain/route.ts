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
    supabase
      .from("orders")
      .select("reference, phone, network, bundle_size, bundle_size_gb")
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
    stuckOrders: stuckRes.data ?? [],
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
type AIAction = "retry_failed" | "sync_stuck" | "alert_agents" | "alert_inventor_down" | "daily_report";

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

  // No DeepSeek key — use rule-based fallback
  if (!DEEPSEEK_KEY) {
    const actions: AIAction[] = [];
    if (state.failedOrders.length > 0 && state.inventorHealthy) actions.push("retry_failed");
    if (state.stuckOrders.length > 0) actions.push("sync_stuck");
    if (state.pendingAgents.length > 0) actions.push("alert_agents");
    if (!state.inventorHealthy) actions.push("alert_inventor_down");
    if (isDailyReportTime) actions.push("daily_report");
    return actions;
  }

  const prompt = `You are the autonomous AI manager of Elite Data Ghana, a mobile data bundle reselling platform in Ghana.

Current time (Ghana): ${ghTime}
System state:
- Failed orders needing retry: ${state.failedOrders.length}
- Stuck orders (>15 min, not delivered): ${state.stuckOrders.length}
- New agent applications waiting for approval: ${state.pendingAgents.length}
- Inventor API (the data delivery provider) is healthy: ${state.inventorHealthy}
- Today so far: ${state.today.total} orders | Revenue: GH₵${state.today.revenue.toFixed(2)} | Profit: GH₵${state.today.profit.toFixed(2)} | Failed: ${state.today.failed}

Decide which actions to take RIGHT NOW. Respond with ONLY a JSON array using these exact strings:
- "retry_failed" — auto-retry all failed orders (only when inventor is healthy)
- "sync_stuck" — move stuck orders to failed so they can be retried next cycle
- "alert_agents" — notify admin about new pending agent applications
- "alert_inventor_down" — alert admin that the data provider API is down
- "daily_report" — send morning business summary (only between 07:00 and 07:15 Ghana time)

Return ONLY the JSON array. Example: ["retry_failed","sync_stuck"]
If nothing needs doing: []`;

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
    // DeepSeek failed — safe fallback
    const fallback: AIAction[] = [];
    if (state.failedOrders.length > 0 && state.inventorHealthy) fallback.push("retry_failed");
    if (state.stuckOrders.length > 0) fallback.push("sync_stuck");
    return fallback;
  }
}

// ── Action: retry failed orders ───────────────────────────────────────────────
async function doRetryFailed(orders: State["failedOrders"]) {
  let fixed = 0;
  let stillFailing = 0;
  const fixedLines: string[] = [];

  for (const o of orders) {
    const sizeGb =
      o.bundle_size_gb ??
      (() => {
        const m = (o.bundle_size ?? "").match(/(\d+(?:\.\d+)?)\s*gb/i);
        return m ? parseFloat(m[1]) : 1;
      })();

    try {
      const res = await fetch(`${INVENTOR_BASE}/api/developer/purchase`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${INVENTOR_KEY}` },
        body: JSON.stringify({
          network: networkApiName[o.network as keyof typeof networkApiName] ?? o.network.toUpperCase(),
          Phone: o.phone,
          Datasize: sizeGb,
          reference: `${o.reference}-ai`,
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        await supabase.from("orders").update({ status: "processing" }).eq("reference", o.reference);
        fixedLines.push(`✅ ${(o.network ?? "").toUpperCase()} ${o.bundle_size} → ${o.phone}`);
        fixed++;
      } else {
        stillFailing++;
      }
    } catch {
      stillFailing++;
    }
  }

  return { fixed, stillFailing, fixedLines };
}

// ── Action: move stuck orders to failed so next cycle retries them ─────────────
async function doSyncStuck(orders: State["stuckOrders"]) {
  if (!orders.length) return 0;
  await supabase
    .from("orders")
    .update({ status: "failed" })
    .in("status", ["pending", "processing"])
    .lt("created_at", new Date(Date.now() - 15 * 60 * 1000).toISOString());
  return orders.length;
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
  let tgMsg = `🤖 <b>AI Brain — Auto Action</b>\n`;
  let didSomething = false;

  // Retry failed orders
  if (actions.includes("retry_failed") && state.failedOrders.length > 0) {
    const { fixed, stillFailing, fixedLines } = await doRetryFailed(state.failedOrders);
    if (fixed > 0) {
      tgMsg += `\n🔧 <b>Auto-fixed ${fixed} failed order(s):</b>\n${fixedLines.join("\n")}`;
      didSomething = true;
    }
    if (stillFailing > 0) {
      tgMsg += `\n⚠️ ${stillFailing} order(s) still failing — tap ❌ Failed in the bot to review`;
      didSomething = true;
    }
    logLines.push(`retry_failed: ${fixed} fixed, ${stillFailing} still failing`);
  }

  // Sync stuck orders
  if (actions.includes("sync_stuck") && state.stuckOrders.length > 0) {
    const synced = await doSyncStuck(state.stuckOrders);
    tgMsg += `\n🧹 <b>Cleared ${synced} stuck order(s)</b> — will auto-retry next cycle`;
    logLines.push(`sync_stuck: ${synced} cleared`);
    didSomething = true;
  }

  // Alert about pending agent applications
  if (actions.includes("alert_agents") && state.pendingAgents.length > 0) {
    const names = state.pendingAgents.map((a) => `• ${a.name} (${a.phone})`).join("\n");
    tgMsg += `\n\n👤 <b>${state.pendingAgents.length} agent application(s) waiting:</b>\n${names}\nSend /agents to approve or reject.`;
    logLines.push(`alert_agents: ${state.pendingAgents.length}`);
    didSomething = true;
  }

  // Alert if Inventor API is down
  if (actions.includes("alert_inventor_down")) {
    tgMsg +=
      `\n\n🚨 <b>INVENTOR API IS DOWN!</b>\n` +
      `Data delivery is blocked. New orders will fail until it recovers.\n` +
      `Check your Inventor dashboard.`;
    logLines.push("alert_inventor_down");
    didSomething = true;
  }

  // Morning daily report
  if (actions.includes("daily_report")) {
    tgMsg +=
      `\n\n📊 <b>Good morning! Today's Report</b>\n` +
      `Orders: <b>${state.today.total}</b>\n` +
      `Revenue: <b>GH₵${state.today.revenue.toFixed(2)}</b>\n` +
      `Profit: <b>GH₵${state.today.profit.toFixed(2)}</b>\n` +
      `${state.today.failed > 0 ? `⚠️ ${state.today.failed} failed order(s) need attention` : "✅ No failures — running clean!"}`;
    logLines.push("daily_report");
    didSomething = true;
  }

  if (didSomething) {
    await sendAdminAlert(tgMsg).catch(() => {});
  }

  return Response.json({ status: "ok", actions, log: logLines });
}
