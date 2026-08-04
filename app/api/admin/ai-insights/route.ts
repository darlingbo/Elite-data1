import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { verifyAdminSessionValue } from "@/lib/adminAuth";

type OrderRow = {
  reference?: string | null;
  network?: string | null;
  bundle_size?: string | null;
  amount?: number | string | null;
  cost_price?: number | string | null;
  admin_commission?: number | string | null;
  agent_commission?: number | string | null;
  status?: string | null;
  created_at?: string | null;
};

type VoucherRow = { voucher_type?: string | null; status?: string | null };
type AgentRow = { id?: string | null; full_name?: string | null; status?: string | null; created_at?: string | null };

type Summary = {
  orders: number;
  revenue: number;
  profit: number;
  voucherStock: { BECE: number; WASSCE: number };
};

const ALLOWED_MODES = new Set([
  "assistant_chat",
  "business_health",
  "pricing",
  "voucher_forecast",
  "agent_analysis",
  "marketing",
  "customer_reply",
  "twi_translation",
  "complaint_plan",
  "daily_actions",
  "risk_review",
  "campaign_calendar",
  "faq_builder",
]);

async function isAdmin() {
  const store = await cookies();
  return verifyAdminSessionValue(store.get("admin_session")?.value);
}

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number) {
  return `GH₵${value.toFixed(2)}`;
}

function cleanPrompt(value: unknown) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 7_500);
}

function statusCount(orders: OrderRow[], status: string) {
  return orders.filter(order => String(order.status ?? "").toLowerCase() === status).length;
}

function networkSummary(orders: OrderRow[]) {
  const totals = new Map<string, { orders: number; revenue: number; profit: number }>();
  for (const order of orders) {
    const key = String(order.network || "Unknown").toUpperCase();
    const current = totals.get(key) ?? { orders: 0, revenue: 0, profit: 0 };
    current.orders += 1;
    current.revenue += number(order.amount);
    current.profit += number(order.admin_commission) || Math.max(0, number(order.amount) - number(order.cost_price) - number(order.agent_commission));
    totals.set(key, current);
  }
  return [...totals.entries()].sort((a, b) => b[1].revenue - a[1].revenue);
}

function createReport(mode: string, prompt: string, orders: OrderRow[], vouchers: VoucherRow[], agents: AgentRow[], summary: Summary) {
  const completed = statusCount(orders, "completed");
  const pendingApproval = statusCount(orders, "pending_approval");
  const processing = statusCount(orders, "processing");
  const failed = statusCount(orders, "failed");
  const networks = networkSummary(orders);
  const bestNetwork = networks[0];
  const availableBECE = summary.voucherStock.BECE;
  const availableWASSCE = summary.voucherStock.WASSCE;
  const activeAgents = agents.filter(agent => String(agent.status ?? "").toLowerCase() === "approved").length;
  const context = prompt ? `\n\nYour instruction: ${prompt}` : "";

  switch (mode) {
    case "pricing":
      return [
        "PRICING & PROFIT REVIEW",
        `30-day revenue: ${money(summary.revenue)}`,
        `30-day recorded profit: ${money(summary.profit)}`,
        bestNetwork ? `Top network by revenue: ${bestNetwork[0]} (${money(bestNetwork[1].revenue)} from ${bestNetwork[1].orders} orders)` : "No completed network sales were found.",
        "Action: compare each bundle selling price against provider cost and agent commission before changing any price.",
        "Safety: this report does not change prices or money.",
      ].join("\n") + context;
    case "voucher_forecast":
      return [
        "VOUCHER STOCK FORECAST",
        `BECE available: ${availableBECE}`,
        `WASSCE available: ${availableWASSCE}`,
        availableBECE < 10 ? "BECE stock is low. Refill before running a promotion." : "BECE stock is currently healthy.",
        availableWASSCE < 10 ? "WASSCE stock is low. Refill before running a promotion." : "WASSCE stock is currently healthy.",
        "No voucher is assigned or delivered by this report.",
      ].join("\n") + context;
    case "agent_analysis":
      return [
        "AGENT ANALYSIS",
        `Approved agents: ${activeAgents}`,
        `Total agent records checked: ${agents.length}`,
        `Orders in the last 30 days: ${summary.orders}`,
        "Review agent commission and wallet adjustments manually before approving any payment.",
      ].join("\n") + context;
    case "marketing":
      return `ELITEDATA PROMOTION DRAFT\n\nGet affordable MTN, Telecel and AirtelTigo data bundles from EliteData. Fast ordering, secure Paystack payment and easy order tracking. Visit elitedata1.com today.\n\n${prompt || "Add your chosen bundle and price before posting."}`;
    case "customer_reply":
      return `CUSTOMER REPLY DRAFT\n\nHello, thank you for contacting EliteData. We are checking your request. Please send your order reference and the phone number used for the purchase so we can verify it safely. We will not retry or make another charge without confirmation.\n\nCustomer message: ${prompt || "Not provided"}`;
    case "twi_translation":
      return `TWI TRANSLATION HELPER\n\nThe automatic translator is operating in safe offline mode. Please provide the exact message and review the final Twi wording before sending it.\n\nText: ${prompt || "No text provided"}`;
    case "complaint_plan":
      return [
        "CUSTOMER COMPLAINT PLAN",
        "1. Ask for the order reference and purchasing phone number.",
        "2. Check Paystack payment and the order status once.",
        "3. Do not retry delivery automatically.",
        "4. Do not refund or switch provider without admin approval.",
        "5. Record the final action in the audit trail.",
        prompt ? `Complaint: ${prompt}` : "Complaint details were not provided.",
      ].join("\n");
    case "daily_actions":
      return [
        "TODAY'S ACTION PLAN",
        `1. Review ${pendingApproval} paid order(s) awaiting approval.`,
        `2. Check ${processing} processing order(s); do not retry automatically.`,
        `3. Investigate ${failed} failed order(s) one by one.`,
        `4. Confirm voucher stock: BECE ${availableBECE}, WASSCE ${availableWASSCE}.`,
        `5. Review profit and reconciliation before changing prices.`,
      ].join("\n") + context;
    case "risk_review":
      return [
        "RISK REVIEW",
        `Pending approval: ${pendingApproval}`,
        `Processing: ${processing}`,
        `Failed: ${failed}`,
        availableBECE === 0 || availableWASSCE === 0 ? "Risk: one or more voucher types are out of stock." : "Voucher stock is available for both types.",
        "Controls: manual approval, payment-reference idempotency, no AI retries, no AI refunds and no AI wallet changes.",
      ].join("\n") + context;
    case "campaign_calendar":
      return [
        "7-DAY CAMPAIGN PLAN",
        "Day 1: Post your best-value MTN bundle.",
        "Day 2: Share a customer order-tracking guide.",
        "Day 3: Promote BECE/WASSCE vouchers only if stock is sufficient.",
        "Day 4: Recruit agents and explain their benefits.",
        "Day 5: Post a Telecel or AirtelTigo offer.",
        "Day 6: Share customer testimonials without exposing private details.",
        "Day 7: Publish a weekend reminder and support hours.",
      ].join("\n") + context;
    case "faq_builder":
      return [
        "ELITEDATA FAQ DRAFT",
        "Q: How do I buy data? A: Choose a network and bundle, enter the recipient number and pay securely.",
        "Q: How do I track an order? A: Use the Track Order page and your order reference.",
        "Q: When will my order arrive? A: Delivery depends on approval and provider processing.",
        "Q: Can an order be retried automatically? A: No. The admin reviews retries to prevent duplicate charges or delivery.",
        "Q: How do I contact support? A: Use the WhatsApp support link on the website.",
      ].join("\n") + context;
    case "assistant_chat":
      return [
        "ELITEDATA BUSINESS ASSISTANT",
        `In the last 30 days: ${summary.orders} orders, ${money(summary.revenue)} revenue and ${money(summary.profit)} recorded profit.`,
        `Status: ${completed} completed, ${pendingApproval} awaiting approval, ${processing} processing and ${failed} failed.`,
        `Voucher stock: BECE ${availableBECE}, WASSCE ${availableWASSCE}.`,
        `Approved agents: ${activeAgents}.`,
        prompt ? `\nRegarding your message:\n${prompt}\n\nRecommended next step: review the relevant records in the admin dashboard and approve any financial or delivery action yourself.` : "Ask about sales, agents, vouchers, marketing or business risks.",
      ].join("\n");
    case "business_health":
    default:
      return [
        "BUSINESS HEALTH REPORT",
        `Orders: ${summary.orders}`,
        `Revenue: ${money(summary.revenue)}`,
        `Recorded profit: ${money(summary.profit)}`,
        `Completed: ${completed}`,
        `Awaiting approval: ${pendingApproval}`,
        `Processing: ${processing}`,
        `Failed: ${failed}`,
        `Voucher stock: BECE ${availableBECE}, WASSCE ${availableWASSCE}`,
        pendingApproval > 0 ? "Priority: review paid orders awaiting approval." : "No paid orders are currently waiting for approval.",
      ].join("\n") + context;
  }
}

export async function POST(request: Request) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null) as { mode?: unknown; prompt?: unknown } | null;
  const mode = String(body?.mode ?? "business_health");
  const prompt = cleanPrompt(body?.prompt);
  if (!ALLOWED_MODES.has(mode)) return Response.json({ error: "Unsupported AI tool" }, { status: 400 });

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [ordersResult, vouchersResult, agentsResult] = await Promise.all([
    supabase.from("orders").select("reference,network,bundle_size,amount,cost_price,admin_commission,agent_commission,status,created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(2_000),
    supabase.from("voucher_inventory").select("voucher_type,status").limit(5_000),
    supabase.from("agents").select("id,full_name,status,created_at").limit(2_000),
  ]);

  const firstError = ordersResult.error || vouchersResult.error || agentsResult.error;
  if (firstError) return Response.json({ error: firstError.message }, { status: 500 });

  const orders = (ordersResult.data ?? []) as OrderRow[];
  const vouchers = (vouchersResult.data ?? []) as VoucherRow[];
  const agents = (agentsResult.data ?? []) as AgentRow[];
  const summary: Summary = {
    orders: orders.length,
    revenue: orders.reduce((sum, order) => sum + number(order.amount), 0),
    profit: orders.reduce((sum, order) => sum + (number(order.admin_commission) || Math.max(0, number(order.amount) - number(order.cost_price) - number(order.agent_commission))), 0),
    voucherStock: {
      BECE: vouchers.filter(voucher => String(voucher.voucher_type).toUpperCase() === "BECE" && String(voucher.status).toLowerCase() === "available").length,
      WASSCE: vouchers.filter(voucher => String(voucher.voucher_type).toUpperCase() === "WASSCE" && String(voucher.status).toLowerCase() === "available").length,
    },
  };

  const report = createReport(mode, prompt, orders, vouchers, agents, summary);
  return Response.json({ report, summary, readOnly: true });
}
