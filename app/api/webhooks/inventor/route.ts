import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendCompletedOrderAlert, sendAgentNotification, sendOrderFailedAlert, sendAdminAlert } from "@/lib/telegram";
import { sendAdminDeliverySMS, sendCustomerSMS, isNotOnListError, orderNotOnListSMS } from "@/lib/sms";

export async function POST(request: NextRequest) {
  // Optional shared-secret check — set INVENTOR_WEBHOOK_SECRET in Vercel env vars
  // to match whatever secret Inventor lets you configure on their dashboard.
  const secret = process.env.INVENTOR_WEBHOOK_SECRET;
  if (!secret || secret.length < 24) {
    return Response.json({ error: "Webhook is not configured" }, { status: 503 });
  }
  const sig = request.headers.get("x-webhook-secret") ??
              request.headers.get("x-inventor-secret") ??
              request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (sig !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = String(body.event ?? "");
  const data = (body.data ?? {}) as Record<string, unknown>;
  const reference = String(data.reference ?? "");

  if (!reference) return Response.json({ ok: true }); // ignore malformed pings

  // Load the order
  const { data: order } = await supabase
    .from("orders")
    .select("reference, status, phone, network, bundle_size, amount, cost_price, agent_id, agent_commission, admin_commission, customer_name")
    .eq("reference", reference)
    .maybeSingle();

  const { data: providerOrder } = !order
    ? await supabase
      .from("orders")
      .select("reference, status, phone, network, bundle_size, amount, cost_price, agent_id, agent_commission, admin_commission, customer_name")
      .eq("inventor_order_id", reference)
      .maybeSingle()
    : { data: null };

  // Also check for retry references (sync-orders appends "-rs")
  const baseRef = reference.endsWith("-rs") ? reference.slice(0, -3) : null;
  const { data: baseOrder } = baseRef
    ? await supabase.from("orders").select("reference, status, phone, network, bundle_size, amount, cost_price, agent_id, agent_commission, admin_commission, customer_name").eq("reference", baseRef).maybeSingle()
    : { data: null };

  const target = order ?? providerOrder ?? baseOrder;
  const targetRef = target?.reference ?? reference;

  if (!target) {
    // Unknown reference — still acknowledge so Inventor doesn't keep retrying
    return Response.json({ ok: true });
  }

  // Already in a terminal state — no-op
  if (target.status === "completed" || target.status === "failed") {
    return Response.json({ ok: true });
  }

  // ── order.completed ───────────────────────────────────────────────────────
  if (event === "order.completed") {
    const { data: completedOrder } = await supabase
      .from("orders")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("reference", targetRef)
      .eq("status", target.status)
      .select("reference")
      .maybeSingle();
    if (!completedOrder) return Response.json({ ok: true });

    sendAdminDeliverySMS({
      reference: targetRef,
      phone: target.phone,
      network: target.network ?? "data",
      bundleSize: target.bundle_size ?? "bundle",
    }).catch(() => {});

    // Commission is already credited at admin approval time (approve route / Telegram webhook).
    // Do NOT credit again here — that would double every agent's earnings.

    const isWallet = targetRef.startsWith("AGTWALLET-");

    if (isWallet && target.agent_id) {
      const { data: ag } = await supabase
        .from("agents").select("telegram_chat_id").eq("id", target.agent_id).maybeSingle();
      if (ag?.telegram_chat_id) {
        const cost = Number(target.cost_price) || 0;
        sendAgentNotification(
          ag.telegram_chat_id,
          `✅ Data Delivered!\n\n📱 ${(target.network ?? "").toUpperCase()} ${target.bundle_size} → ${target.phone}\n💰 GH₵${cost.toFixed(2)} deducted`
        ).catch(() => {});
      }
    }

    if (!isWallet) {
      const profit = (Number(target.amount) - Number(target.cost_price)).toFixed(2);
      sendCompletedOrderAlert(
        `✅ <b>ORDER COMPLETED</b>\n\n` +
        `📱 ${(target.network ?? "").toUpperCase()} ${target.bundle_size} → <code>${target.phone}</code>\n` +
        `📎 Ref: <code>${targetRef}</code>\n💰 Profit: GH₵${profit}`
      ).catch(() => {});
    }

    return Response.json({ ok: true });
  }

  // ── order.processing ─────────────────────────────────────────────────────
  if (event === "order.processing") {
    await supabase.from("orders").update({ status: "processing" }).eq("reference", targetRef);
    return Response.json({ ok: true });
  }

  // ── order.failed ─────────────────────────────────────────────────────────
  if (event === "order.failed") {
    const reason = String(
      data.reason ?? data.message ?? data.error ?? body.reason ?? body.message ?? body.error ??
      "Inventor did not provide a failure reason",
    ).slice(0, 300);

    // "Not on beneficiary list / new number" = delivery delay, not a failure.
    // Hold for manual delivery (up to 72h), tell the customer, no refund.
    if (isNotOnListError(reason)) {
      await supabase
        .from("orders")
        .update({ status: "not_on_list", not_on_list_at: new Date().toISOString() })
        .eq("reference", targetRef);
      sendCustomerSMS(
        target.phone,
        orderNotOnListSMS(target.customer_name ?? "Customer", target.network ?? "", target.bundle_size ?? "", targetRef),
      ).catch(() => {});
      sendAdminAlert(
        `🟠 <b>NEW NUMBER — MANUAL DELIVERY (up to 72h)</b>\n<code>${targetRef}</code>\n<code>${target.phone}</code>\n${reason}\n\nDeliver via the Inventor dashboard, then mark the order complete.`,
      ).catch(() => {});
      return Response.json({ ok: true });
    }

    await supabase.from("orders").update({ status: "failed" }).eq("reference", targetRef);

    // Refund wallet orders automatically
    const isWallet = targetRef.startsWith("AGTWALLET-");
    if (isWallet && target.agent_id) {
      const { data: walletRefund } = await supabase.rpc("refund_agent_wallet_order", { p_reference: targetRef });
      const refund = walletRefund as { amount?: number; balance?: number } | null;
      const cost = Number(refund?.amount ?? target.amount ?? target.cost_price ?? 0);

      const { data: agent } = await supabase
        .from("agents")
        .select("telegram_chat_id")
        .eq("id", target.agent_id)
        .maybeSingle();

      if (agent?.telegram_chat_id) {
        sendAgentNotification(
          agent.telegram_chat_id,
          `❌ Order Failed — Refunded\n\n📱 ${(target.network ?? "").toUpperCase()} ${target.bundle_size} → ${target.phone}\n💰 GH₵${cost.toFixed(2)} refunded to your wallet\nNew balance: GH₵${Number(refund?.balance ?? 0).toFixed(2)}`
        ).catch(() => {});
      }
    }

    sendOrderFailedAlert({
      reference: targetRef,
      phone: target.phone,
      network: target.network,
      bundleSize: target.bundle_size,
      reason: isWallet ? `${reason} (wallet auto-refunded)` : reason,
    }).catch(() => {});

    return Response.json({ ok: true });
  }

  // Unknown event — acknowledge anyway
  return Response.json({ ok: true });
}
