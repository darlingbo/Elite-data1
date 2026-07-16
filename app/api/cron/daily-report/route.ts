import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendAdminAlert, sendSwiftAlert } from "@/lib/telegram";

function e(text: string): string {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function fetchInventorBalance(): Promise<number | null> {
  try {
    const res = await fetch(`${process.env.INVENTOR_API_BASE_URL}/api/developer/balance`, {
      headers: { Authorization: `Bearer ${process.env.INVENTOR_API_KEY}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json() as Record<string, unknown>;
    const inner = (data?.data as Record<string, unknown>) ?? {};
    const raw =
      data?.balance ?? inner?.balance ??
      data?.wallet_balance ?? inner?.wallet_balance ??
      data?.amount ?? inner?.amount ?? null;
    return raw !== null ? Number(raw) : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: orders } = await supabase
    .from("orders")
    .select("status, amount, profit, agent_commission, bundle_size, network, agent_id")
    .gte("created_at", since);

  const LOW = Number(process.env.INVENTOR_LOW_BALANCE_GHS ?? 50);
  const balance = await fetchInventorBalance();

  if (!orders || orders.length === 0) {
    const balanceLine = balance !== null
      ? `💳 Inventor Balance: <b>GH₵${balance.toFixed(2)}</b>${balance < LOW ? " ⚠️ LOW — top up now!" : ""}`
      : `💳 Inventor Balance: <i>unavailable</i>`;

    const msg =
      `📊 <b>Daily Report</b>\n\n` +
      `😴 No orders in the last 24 hours.\n\n${balanceLine}`;
    await Promise.all([sendAdminAlert(msg), sendSwiftAlert(msg)]);
    return Response.json({ success: true, orders: 0, balance });
  }

  const total      = orders.length;
  const completed  = orders.filter(o => o.status === "completed" || o.status === "processing").length;
  const failed     = orders.filter(o => o.status === "failed").length;
  const rejected   = orders.filter(o => o.status === "rejected").length;
  const pending    = orders.filter(o => o.status === "pending_approval").length;
  const revenue    = orders.reduce((s, o) => s + Number(o.amount ?? 0), 0);
  const profit     = orders.reduce((s, o) => s + Number(o.profit ?? 0), 0);
  const commissions = orders.reduce((s, o) => s + Number(o.agent_commission ?? 0), 0);

  // Top bundle by order count
  const bundleCounts: Record<string, number> = {};
  for (const o of orders) {
    const key = `${String(o.network ?? "").toUpperCase()} ${o.bundle_size}`;
    bundleCounts[key] = (bundleCounts[key] ?? 0) + 1;
  }
  const topBundle = Object.entries(bundleCounts).sort((a, b) => b[1] - a[1])[0] ?? null;

  // Top agent by total commission earned
  const agentEarned: Record<string, number> = {};
  for (const o of orders) {
    if (o.agent_id) {
      agentEarned[o.agent_id] = (agentEarned[o.agent_id] ?? 0) + Number(o.agent_commission ?? 0);
    }
  }
  const topAgentEntry = Object.entries(agentEarned).sort((a, b) => b[1] - a[1])[0] ?? null;
  let topAgentName = "";
  if (topAgentEntry) {
    const { data: ag } = await supabase.from("agents").select("name").eq("id", topAgentEntry[0]).maybeSingle();
    topAgentName = ag?.name ?? "";
  }

  const balanceLine = balance !== null
    ? `💳 Inventor Balance: <b>GH₵${balance.toFixed(2)}</b>${balance < LOW ? " ⚠️ LOW — top up now!" : ""}`
    : `💳 Inventor Balance: <i>unavailable</i>`;

  const dateLabel = new Date().toLocaleDateString("en-GH", { weekday: "short", day: "numeric", month: "short" });

  const msg =
    `📊 <b>Daily Report</b> — ${dateLabel}\n\n` +
    `📦 Total Orders: <b>${total}</b>\n` +
    `   ✅ Delivered: ${completed}  ❌ Failed: ${failed}  ⛔ Rejected: ${rejected}  ⏳ Pending: ${pending}\n\n` +
    `💰 Revenue: <b>GH₵${revenue.toFixed(2)}</b>\n` +
    `📈 Profit: <b>GH₵${profit.toFixed(2)}</b>\n` +
    `🤝 Agent Commissions: GH₵${commissions.toFixed(2)}\n` +
    (topBundle ? `\n🏆 Top Bundle: <b>${e(topBundle[0])}</b> × ${topBundle[1]}\n` : "") +
    (topAgentName ? `⭐ Top Agent: <b>${e(topAgentName)}</b> — GH₵${(topAgentEntry![1]).toFixed(2)} earned\n` : "") +
    `\n${balanceLine}`;

  await Promise.all([sendAdminAlert(msg), sendSwiftAlert(msg)]);

  if (balance !== null && balance < LOW) {
    await sendAdminAlert(
      `⚠️ <b>Inventor balance is critically low!</b>\n\n` +
      `Current: <b>GH₵${balance.toFixed(2)}</b> (threshold: GH₵${LOW.toFixed(2)})\n\n` +
      `Top up now to avoid delivery failures.`
    );
  }

  return Response.json({ success: true, total, completed, failed, rejected, pending, revenue, profit, balance });
}
