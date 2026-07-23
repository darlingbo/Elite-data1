import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  generateReconciliationSnapshot,
  reconciliationDayRange,
} from "@/lib/reconciliationServer";
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

function previousUtcDate() {
  return new Date(Date.now() - 24 * 60 * 60_000).toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reportDate = previousUtcDate();
  const { start, end } = reconciliationDayRange(reportDate);
  const reconciliationPromise = generateReconciliationSnapshot(reportDate);
  const ordersPromise = supabase
    .from("orders")
    .select("status,amount,cost_price,admin_commission,agent_commission,bundle_size,network,agent_id")
    .is("archived_at", null)
    .gte("created_at", start)
    .lt("created_at", end);

  const [{ data: orders, error: ordersError }, balance, reconciliationResult] = await Promise.all([
    ordersPromise,
    fetchInventorBalance(),
    reconciliationPromise.then(
      (value) => ({ value, error: null }),
      (error: unknown) => ({
        value: null,
        error: error instanceof Error ? error.message : "Unknown reconciliation error",
      }),
    ),
  ]);

  if (ordersError) {
    return Response.json({ error: ordersError.message }, { status: 500 });
  }

  const rows = orders ?? [];
  const completedOrders = rows.filter((order) => order.status === "completed");
  const total = rows.length;
  const completed = completedOrders.length;
  const processing = rows.filter((order) => order.status === "processing").length;
  const failed = rows.filter((order) => order.status === "failed").length;
  const rejected = rows.filter((order) => order.status === "rejected").length;
  const pending = rows.filter((order) => order.status === "pending_approval").length;
  const revenue = completedOrders.reduce((sum, order) => sum + Number(order.amount ?? 0), 0);
  const profit = completedOrders.reduce((sum, order) => {
    if (order.admin_commission !== null) return sum + Number(order.admin_commission);
    return sum + Number(order.amount ?? 0) -
      Number(order.cost_price ?? 0) -
      Number(order.agent_commission ?? 0);
  }, 0);
  const commissions = completedOrders.reduce(
    (sum, order) => sum + Number(order.agent_commission ?? 0),
    0,
  );

  const bundleCounts: Record<string, number> = {};
  for (const order of completedOrders) {
    const key = `${String(order.network ?? "").toUpperCase()} ${order.bundle_size ?? ""}`.trim();
    bundleCounts[key] = (bundleCounts[key] ?? 0) + 1;
  }
  const topBundle = Object.entries(bundleCounts).sort((a, b) => b[1] - a[1])[0] ?? null;

  const agentEarned: Record<string, number> = {};
  for (const order of completedOrders) {
    if (order.agent_id) {
      agentEarned[order.agent_id] =
        (agentEarned[order.agent_id] ?? 0) + Number(order.agent_commission ?? 0);
    }
  }
  const topAgentEntry = Object.entries(agentEarned).sort((a, b) => b[1] - a[1])[0] ?? null;
  let topAgentName = "";
  if (topAgentEntry) {
    const { data: agent } = await supabase
      .from("agents")
      .select("name")
      .eq("id", topAgentEntry[0])
      .maybeSingle();
    topAgentName = agent?.name ?? "";
  }

  const lowBalance = Number(process.env.INVENTOR_LOW_BALANCE_GHS ?? 50);
  const balanceLine = balance !== null
    ? `Inventor balance: <b>GHS ${balance.toFixed(2)}</b>${balance < lowBalance ? " - LOW, top up now." : ""}`
    : "Inventor balance: <i>unavailable</i>";

  const reconciliationLine = reconciliationResult.value
    ? `Reconciliation: <b>${reconciliationResult.value.snapshot.status.toUpperCase()}</b>` +
      ` | Risk: <b>GHS ${Number(reconciliationResult.value.snapshot.risk_amount).toFixed(2)}</b>` +
      ` | Warnings: ${reconciliationResult.value.snapshot.issue_count}`
    : `Reconciliation: <b>FAILED TO RUN</b> - ${e(reconciliationResult.error ?? "Unknown error")}`;

  const dateLabel = new Date(`${reportDate}T00:00:00Z`).toLocaleDateString(
    "en-GH",
    { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" },
  );

  const msg =
    `<b>Daily Financial Report</b> - ${dateLabel}\n\n` +
    `Total orders: <b>${total}</b>\n` +
    `Delivered: ${completed} | Processing: ${processing} | Failed: ${failed} | Rejected: ${rejected} | Pending approval: ${pending}\n\n` +
    `Delivered revenue: <b>GHS ${revenue.toFixed(2)}</b>\n` +
    `Recorded admin profit: <b>GHS ${profit.toFixed(2)}</b>\n` +
    `Agent commissions: GHS ${commissions.toFixed(2)}\n` +
    (topBundle ? `\nTop bundle: <b>${e(topBundle[0])}</b> x ${topBundle[1]}\n` : "") +
    (topAgentName ? `Top agent: <b>${e(topAgentName)}</b> - GHS ${topAgentEntry![1].toFixed(2)} earned\n` : "") +
    `\n${reconciliationLine}\n` +
    `Open Admin &gt; Reconciliation before retrying or refunding flagged orders.\n\n` +
    balanceLine;

  await Promise.all([sendAdminAlert(msg), sendSwiftAlert(msg)]);

  if (balance !== null && balance < lowBalance) {
    await sendAdminAlert(
      `<b>Inventor balance is critically low.</b>\n\n` +
      `Current: <b>GHS ${balance.toFixed(2)}</b> (threshold: GHS ${lowBalance.toFixed(2)})\n\n` +
      "Top up now to avoid delivery failures.",
    );
  }

  return Response.json({
    success: true,
    reportDate,
    total,
    completed,
    processing,
    failed,
    rejected,
    pending,
    revenue,
    profit,
    balance,
    reconciliation: reconciliationResult.value?.snapshot ?? null,
    reconciliationError: reconciliationResult.error,
  });
}
