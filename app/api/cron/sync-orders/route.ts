import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendCompletedOrderAlert, sendStuckOrderAlert } from "@/lib/telegram";
import { sendAdminDeliverySMS, sendCustomerSMS, orderDeliveredSMS, orderFailedSMS } from "@/lib/sms";

const networkApiMap: Record<string, string> = {
  mtn: "MTN",
  telecel: "TELECEL",
  airteltigo: "AT ISHARE",
};

async function checkInventorOrder(reference: string): Promise<"completed" | "processing" | "failed" | null> {
  try {
    const res = await fetch(
      `${process.env.INVENTOR_API_BASE_URL}/api/developer/orders/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${process.env.INVENTOR_API_KEY}` }, signal: AbortSignal.timeout(8000) }
    );
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    const invData = (body.data as Record<string, unknown>) ?? {};
    const invOrder = (invData.order as Record<string, unknown>) ?? (body.order as Record<string, unknown>) ?? invData;
    const raw = String(invOrder.status ?? invData.status ?? invData.delivery_status ?? body.status ?? "").toLowerCase();
    if (!raw) return null;
    if (raw.includes("complet") || raw.includes("success") || raw.includes("deliver") || raw === "00") return "completed";
    if (raw.includes("process") || raw.includes("progress") || raw.includes("dispatch")) return "processing";
    if (raw.includes("fail") || raw.includes("error") || raw.includes("cancel")) return "failed";
    return null;
  } catch {
    return null;
  }
}

async function creditAgent(agentId: string, commission: number, revenue: number) {
  if (!agentId || !commission) return;
  const { data: agent } = await supabase
    .from("agents")
    .select("commission_balance, total_sales, total_revenue")
    .eq("id", agentId)
    .maybeSingle();
  if (!agent) return;
  await supabase.from("agents").update({
    commission_balance: (Number(agent.commission_balance) || 0) + commission,
    total_sales: (Number(agent.total_sales) || 0) + 1,
    total_revenue: (Number(agent.total_revenue) || 0) + revenue,
    updated_at: new Date().toISOString(),
  }).eq("id", agentId);
}


export async function GET(request: NextRequest) {
  // Vercel Cron automatically sends `Authorization: Bearer ${CRON_SECRET}`.
  // Never trust a caller-controlled x-vercel-cron header as authentication.
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || cronSecret.length < 24) return Response.json({ error: "Cron is not configured" }, { status: 503 });
  if (authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const stuckCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  type OrderRow = { reference: string; inventor_order_id: string | null; status: string; phone: string; network: string; bundle_size: string; bundle_size_gb: number | null; created_at: string; agent_id: string | null; agent_commission: number | null; amount: number | null; cost_price: number | null; customer_name: string | null };

  let orders: OrderRow[] | null = null;
  const { data: full, error: fullErr } = await supabase
    .from("orders")
    .select("reference, inventor_order_id, status, phone, network, bundle_size, bundle_size_gb, created_at, agent_id, agent_commission, amount, cost_price, customer_name")
    .in("status", ["pending", "processing"])
    .gte("created_at", cutoff48h)
    .neq("network", "voucher");

  if (!fullErr) {
    orders = full as OrderRow[];
  } else {
    const { data: basic } = await supabase
      .from("orders")
      .select("reference, status, phone, network, bundle_size, created_at, agent_id, customer_name")
      .in("status", ["pending", "processing"])
      .gte("created_at", cutoff48h)
      .neq("network", "voucher");
    orders = (basic ?? []).map(o => ({ ...o, inventor_order_id: null, bundle_size_gb: null, agent_commission: null, amount: null })) as OrderRow[];
  }

  if (!orders?.length) return Response.json({ updated: 0, retried: 0, checked: 0 });

  const chunks: OrderRow[][] = [];
  for (let i = 0; i < orders.length; i += 10) chunks.push(orders.slice(i, i + 10));

  let updated = 0, retried = 0;
  const retriedOrders: string[] = [];
  const completedOrders: string[] = [];

  for (const chunk of chunks) {
    await Promise.all(chunk.map(async (order) => {
      const invStatus = await checkInventorOrder(order.inventor_order_id || order.reference);

      // Wallet purchases are auto-fulfilled — never notify admin, just handle silently
      const isWalletOrder = order.reference.startsWith("AGTWALLET-");

      if (invStatus === "completed") {
        const { data: completedOrder } = await supabase
          .from("orders")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("reference", order.reference)
          .eq("status", order.status)
          .select("reference")
          .maybeSingle();
        if (!completedOrder) return;
        sendAdminDeliverySMS({
          reference: order.reference,
          phone: order.phone,
          network: order.network,
          bundleSize: order.bundle_size,
        }).catch(() => {});
        // Commission is already credited at approval time — do NOT credit again here
        if (!isWalletOrder) {
          const profit = (order.amount && order.cost_price) ? (Number(order.amount) - Number(order.cost_price)).toFixed(2) : null;
          completedOrders.push(
            `✅ ${(order.network ?? "").toUpperCase()} ${order.bundle_size} → ${order.phone}` +
            (profit ? ` | Profit: GH₵${profit}` : "")
          );
          sendCustomerSMS(
            order.phone,
            orderDeliveredSMS(order.customer_name ?? "Customer", order.network ?? "", order.bundle_size ?? "", order.phone, order.reference)
          ).catch(() => {});
        }
        updated++;
        return;
      }

      if (invStatus === "failed") {
        await supabase.from("orders").update({ status: "failed" }).eq("reference", order.reference);
        sendCustomerSMS(
          order.phone,
          orderFailedSMS(order.customer_name ?? "Customer", order.network ?? "", order.bundle_size ?? "", order.reference)
        ).catch(() => {});
        updated++;
        return;
      }

      const sizeGb = order.bundle_size_gb ?? (() => {
        const m = (order.bundle_size ?? "").match(/(\d+(?:\.\d+)?)\s*gb/i);
        return m ? parseFloat(m[1]) : 1;
      })();

      const isStuck = order.created_at < stuckCutoff;
      if (isStuck && order.phone && order.network && sizeGb) {
        // All orders — alert admin to deliver manually. Never auto-retry.
        await sendStuckOrderAlert(
          `⚠️ <b>STUCK ORDER</b>${isWalletOrder ? " (Agent Wallet)" : ""}\n\n` +
          `📱 ${(order.network ?? "").toUpperCase()} ${order.bundle_size} → <code>${order.phone}</code>\n` +
          `📎 Ref: <code>${order.reference}</code>\n\n` +
          `This order has been processing for 15+ min. Please deliver manually or retry.`
        );
        retried++;
        retriedOrders.push(`⚠️ ${order.phone} — ${(order.network ?? "").toUpperCase()} ${order.bundle_size} (stuck, alerted)`);
      }
    }));
  }

  if (completedOrders.length > 0) {
    await sendCompletedOrderAlert(
      `📦 ORDER UPDATE: ${completedOrders.length} order(s) completed\n\n${completedOrders.join("\n")}`
    ).catch(() => {});
  }

  if (retriedOrders.length > 0) {
    await sendStuckOrderAlert(
      `⚠️ STUCK ORDERS: ${retriedOrders.length} order(s) need manual delivery\n\n${retriedOrders.join("\n")}`
    ).catch(() => {});
  }

  return Response.json({ updated, retried, checked: orders.length });
}
