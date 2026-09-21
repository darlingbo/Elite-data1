import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendCompletedOrderAlert, sendAgentNotification, sendOrderFailedAlert } from "@/lib/telegram";
import { sendAdminDeliverySMS, sendCustomerSMS, orderFailedSMS } from "@/lib/sms";

/**
 * Inbound webhook FROM Yhang Mhany reporting an MTN order's final status.
 * Every Yhang Mhany order starts PROCESSING (fulfilled by hand on their
 * end), so this webhook is the primary way one ever resolves — mirrors
 * app/api/webhooks/inventor/route.ts's shape, keyed by
 * orders.yhangmhany_order_id (their orderId) instead of our own reference,
 * since Yhang Mhany has no idea what our reference is.
 *
 * Register this URL in the Yhang Mhany dashboard's webhook settings.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.YHANGMHANY_WEBHOOK_SECRET;
  if (!secret || secret.length < 24) {
    return Response.json({ error: "Webhook is not configured" }, { status: 503 });
  }
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? request.headers.get("x-webhook-token");
  if (token !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const orderId = String(body.orderId ?? "").trim();
  const status = String(body.status ?? "").toUpperCase();
  if (!orderId) return Response.json({ ok: true }); // ignore malformed pings

  const { data: target } = await supabase
    .from("orders")
    .select("reference, status, phone, network, bundle_size, amount, cost_price, agent_id, admin_commission, customer_name")
    .eq("yhangmhany_order_id", orderId)
    .maybeSingle();

  if (!target) return Response.json({ ok: true }); // unknown order — still 200 so they don't keep retrying
  if (target.status === "completed" || target.status === "failed") return Response.json({ ok: true }); // already settled

  const isWallet = target.reference.startsWith("AGTWALLET-");

  if (status === "DELIVERED") {
    const { data: completedOrder } = await supabase
      .from("orders")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("reference", target.reference)
      .eq("status", target.status)
      .select("reference")
      .maybeSingle();
    if (!completedOrder) return Response.json({ ok: true });

    sendAdminDeliverySMS({
      reference: target.reference,
      phone: target.phone,
      network: target.network ?? "mtn",
      bundleSize: target.bundle_size ?? "bundle",
    }).catch(() => {});

    // Commission is already credited at approval time — do NOT credit again here.
    if (isWallet && target.agent_id) {
      const { data: ag } = await supabase.from("agents").select("telegram_chat_id").eq("id", target.agent_id).maybeSingle();
      if (ag?.telegram_chat_id) {
        const cost = Number(target.cost_price) || 0;
        sendAgentNotification(
          ag.telegram_chat_id,
          `✅ Data Delivered!\n\n📱 ${(target.network ?? "").toUpperCase()} ${target.bundle_size} → ${target.phone}\n💰 GH₵${cost.toFixed(2)} deducted`,
        ).catch(() => {});
      }
    } else {
      const profit = (Number(target.amount) - Number(target.cost_price)).toFixed(2);
      sendCompletedOrderAlert(
        `✅ <b>ORDER COMPLETED (Yhang Mhany)</b>\n\n📱 ${(target.network ?? "").toUpperCase()} ${target.bundle_size} → <code>${target.phone}</code>\n📎 Ref: <code>${target.reference}</code>\n💰 Profit: GH₵${profit}`,
      ).catch(() => {});
    }
    return Response.json({ ok: true });
  }

  if (status === "REJECTED") {
    await supabase.from("orders").update({ status: "failed" }).eq("reference", target.reference);
    sendCustomerSMS(
      target.phone,
      orderFailedSMS(target.customer_name ?? "Customer", target.network ?? "", target.bundle_size ?? "", target.reference),
    ).catch(() => {});

    if (isWallet && target.agent_id) {
      const { data: walletRefund } = await supabase.rpc("refund_agent_wallet_order", { p_reference: target.reference });
      const refund = walletRefund as { amount?: number; balance?: number } | null;
      const cost = Number(refund?.amount ?? target.amount ?? target.cost_price ?? 0);
      const { data: agent } = await supabase.from("agents").select("telegram_chat_id").eq("id", target.agent_id).maybeSingle();
      if (agent?.telegram_chat_id) {
        sendAgentNotification(
          agent.telegram_chat_id,
          `❌ Order Failed — Refunded\n\n📱 ${(target.network ?? "").toUpperCase()} ${target.bundle_size} → ${target.phone}\n💰 GH₵${cost.toFixed(2)} refunded to your wallet\nNew balance: GH₵${Number(refund?.balance ?? 0).toFixed(2)}`,
        ).catch(() => {});
      }
    }

    sendOrderFailedAlert({
      reference: target.reference,
      phone: target.phone,
      network: target.network,
      bundleSize: target.bundle_size,
      reason: isWallet ? "Yhang Mhany rejected the order (agent wallet auto-refunded)" : "Yhang Mhany rejected the order — refund it from Admin → Refunds",
    }).catch(() => {});
    return Response.json({ ok: true });
  }

  // PROCESSING or unrecognized — nothing to do yet.
  return Response.json({ ok: true });
}
