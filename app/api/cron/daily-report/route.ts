import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  generateReconciliationSnapshot,
  reconciliationDayRange,
} from "@/lib/reconciliationServer";
import { sendAssistantAlert } from "@/lib/telegram";

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
  const voucherStockPromise = supabase
    .from("voucher_inventory")
    .select("voucher_type,status");
  const approvedAgentsPromise = supabase
    .from("agents")
    .select("id,name")
    .eq("status", "approved")
    .limit(10_000);
  const recentAgentOrdersPromise = supabase
    .from("orders")
    .select("agent_id")
    .not("agent_id", "is", null)
    .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString())
    .limit(10_000);

  const [
    { data: orders, error: ordersError },
    balance,
    reconciliationResult,
    { data: voucherRows },
    { data: approvedAgents },
    { data: recentAgentOrders },
  ] = await Promise.all([
    ordersPromise,
    fetchInventorBalance(),
    reconciliationPromise.then(
      (value) => ({ value, error: null }),
      (error: unknown) => ({
        value: null,
        error: error instanceof Error ? error.message : "Unknown reconciliation error",
      }),
    ),
    voucherStockPromise,
    approvedAgentsPromise,
    recentAgentOrdersPromise,
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
  const failureRate = total > 0 ? (failed / total) * 100 : 0;
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

  const voucherStock = { BECE: 0, WASSCE: 0 };
  for (const voucher of voucherRows ?? []) {
    const type = String(voucher.voucher_type);
    if (voucher.status === "available" && (type === "BECE" || type === "WASSCE")) voucherStock[type] += 1;
  }
  const beceThreshold = Number(process.env.BECE_LOW_STOCK_THRESHOLD ?? 10);
  const wassceThreshold = Number(process.env.WASSCE_LOW_STOCK_THRESHOLD ?? 10);
  const lowVoucherTypes = [
    voucherStock.BECE <= beceThreshold ? `BECE: ${voucherStock.BECE}` : "",
    voucherStock.WASSCE <= wassceThreshold ? `WASSCE: ${voucherStock.WASSCE}` : "",
  ].filter(Boolean);

  const activeAgentIds = new Set((recentAgentOrders ?? []).map(order => String(order.agent_id)));
  const inactiveAgents = (approvedAgents ?? []).filter(agent => !activeAgentIds.has(String(agent.id)));

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
    `Failure rate: <b>${failureRate.toFixed(1)}%</b>${total >= 5 && failureRate >= 10 ? " - HIGH, investigate before retrying anything." : ""}\n` +
    `Voucher stock: <b>BECE ${voucherStock.BECE}</b> | <b>WASSCE ${voucherStock.WASSCE}</b>${lowVoucherTypes.length ? " - LOW STOCK" : ""}\n` +
    `Inactive approved agents (30 days): <b>${inactiveAgents.length}</b>\n\n` +
    `Delivered revenue: <b>GHS ${revenue.toFixed(2)}</b>\n` +
    `Recorded admin profit: <b>GHS ${profit.toFixed(2)}</b>\n` +
    `Agent commissions: GHS ${commissions.toFixed(2)}\n` +
    (topBundle ? `\nTop bundle: <b>${e(topBundle[0])}</b> x ${topBundle[1]}\n` : "") +
    (topAgentName ? `Top agent: <b>${e(topAgentName)}</b> - GHS ${topAgentEntry![1].toFixed(2)} earned\n` : "") +
    `\n${reconciliationLine}\n` +
    `Open Admin &gt; Reconciliation before retrying or refunding flagged orders.\n\n` +
    balanceLine;

  await sendAssistantAlert(msg);

  if (balance !== null && balance < lowBalance) {
    await sendAssistantAlert(
      `<b>Inventor balance is critically low.</b>\n\n` +
      `Current: <b>GHS ${balance.toFixed(2)}</b> (threshold: GHS ${lowBalance.toFixed(2)})\n\n` +
      "Top up now to avoid delivery failures.",
    );
  }

  if (lowVoucherTypes.length > 0) {
    await sendAssistantAlert(
      `<b>Voucher stock warning</b>\n\n${lowVoucherTypes.join(" | ")}\n\nAdd vouchers in Admin &gt; Settings &gt; Voucher Stock. AI has not purchased or changed anything.`,
    );
  }

  if (total >= 5 && failureRate >= 10) {
    await sendAssistantAlert(
      `<b>High order failure rate detected</b>\n\nYesterday: <b>${failed}/${total} (${failureRate.toFixed(1)}%)</b> failed.\n\nReview provider health and failed orders manually. AI will not retry them.`,
    );
  }

  return Response.json({
    success: true,
    reportDate,
    total,
    completed,
    processing,
    failed,
    failureRate,
    rejected,
    pending,
    revenue,
    profit,
    balance,
    voucherStock,
    inactiveAgents: inactiveAgents.length,
    reconciliation: reconciliationResult.value?.snapshot ?? null,
    reconciliationError: reconciliationResult.error,
  });
}
