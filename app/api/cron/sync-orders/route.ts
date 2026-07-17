import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendAdminAlert } from "@/lib/telegram";
import { sendCustomerSMS, orderDeliveredSMS, orderFailedSMS } from "@/lib/sms";

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

async function retryDelivery(order: {
  reference: string;
  phone: string;
  network: string;
  bundle_size_gb: number;
  bundle_size: string;
}): Promise<"sent" | "already_processing" | "failed"> {
  try {
    const retryRef = `${order.reference}-rs`;
    const res = await fetch(`${process.env.INVENTOR_API_BASE_URL}/api/developer/purchase`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.INVENTOR_API_KEY}` },
      body: JSON.stringify({
        network: networkApiMap[order.network] ?? order.network.toUpperCase(),
        Phone: order.phone,
        Datasize: order.bundle_size_gb,
        reference: retryRef,
      }),
      signal: AbortSignal.timeout(15000),
    });

    // 409 = Inventor already has this order in-flight — don't retry, just mark processing
    if (res.status === 409) return "already_processing";

    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    const ok = res.ok || body.success === true || body.status === "success" || body.status === "00";
    return ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}

export async function GET(request: NextRequest) {
  // Allow Vercel cron (x-vercel-cron header) OR matching Bearer token OR no auth (external cron-job.org)
  const authHeader = request.headers.get("authorization");
  const isVercelCron = request.headers.get("x-vercel-cron") === "1";
  const cronSecret = process.env.CRON_SECRET;
  const hasValidAuth = isVercelCron || !cronSecret || authHeader === `Bearer ${cronSecret}`;
  if (!hasValidAuth) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const stuckCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  type OrderRow = { reference: string; status: string; phone: string; network: string; bundle_size: string; bundle_size_gb: number | null; created_at: string; agent_id: string | null; agent_commission: number | null; amount: number | null; cost_price: number | null; customer_name: string | null };

  let orders: OrderRow[] | null = null;
  const { data: full, error: fullErr } = await supabase
    .from("orders")
    .select("reference, status, phone, network, bundle_size, bundle_size_gb, created_at, agent_id, agent_commission, amount, cost_price, customer_name")
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
    orders = (basic ?? []).map(o => ({ ...o, bundle_size_gb: null, agent_commission: null, amount: null })) as OrderRow[];
  }

  if (!orders?.length) return Response.json({ updated: 0, retried: 0, checked: 0 });

  const chunks: OrderRow[][] = [];
  for (let i = 0; i < orders.length; i += 10) chunks.push(orders.slice(i, i + 10));

  let updated = 0, retried = 0;
  const retriedOrders: string[] = [];
  const completedOrders: string[] = [];

  for (const chunk of chunks) {
    await Promise.all(chunk.map(async (order) => {
      const invStatus = await checkInventorOrder(order.reference);

      // Wallet purchases are auto-fulfilled — never notify admin, just handle silently
      const isWalletOrder = order.reference.startsWith("AGTWALLET-");

      if (invStatus === "completed") {
        await supabase.from("orders").update({ status: "completed" }).eq("reference", order.reference);
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
        if (isWalletOrder) {
          // Wallet orders: auto-retry without asking admin
          const retryResult = await retryDelivery({ ...order, bundle_size_gb: sizeGb });
          if (retryResult === "sent" || retryResult === "already_processing") {
            await supabase.from("orders").update({ status: "processing" }).eq("reference", order.reference);
          } else {
            await supabase.from("orders").update({ status: "failed" }).eq("reference", order.reference);
          }
          retried++;
        } else {
          // Normal orders: ask admin for approval before sending
          await supabase.from("orders").update({ status: "pending_approval" }).eq("reference", order.reference);
          await sendAdminAlert(
            `⚠️ <b>STUCK ORDER — Approve Send?</b>\n\n` +
            `📱 ${(order.network ?? "").toUpperCase()} ${order.bundle_size} → <code>${order.phone}</code>\n` +
            `📎 Ref: <code>${order.reference}</code>\n\n` +
            `This order has been stuck for 15+ min. Did you already send this manually?\n` +
            `Tap <b>YES</b> to send now, or <b>NO</b> if already done.`,
            {
              inline_keyboard: [[
                { text: "✅ YES — Send Now", callback_data: `approve_retry:${order.reference}` },
                { text: "❌ NO — Already Done", callback_data: `skip_retry:${order.reference}` },
              ]],
            }
          );
          retried++;
          retriedOrders.push(`⚠️ ${order.phone} — ${(order.network ?? "").toUpperCase()} ${order.bundle_size} (awaiting approval)`);
        }
      }
    }));
  }

  if (completedOrders.length > 0) {
    await sendAdminAlert(
      `📦 ORDER UPDATE: ${completedOrders.length} order(s) completed\n\n${completedOrders.join("\n")}`
    ).catch(() => {});
  }

  if (retriedOrders.length > 0) {
    await sendAdminAlert(
      `🔁 AUTO-RETRY: ${retried} stuck order(s) resent\n\n${retriedOrders.join("\n")}`
    ).catch(() => {});
  }

  return Response.json({ updated, retried, checked: orders.length });
}
