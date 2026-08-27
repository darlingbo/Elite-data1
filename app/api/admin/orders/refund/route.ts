import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { verifyAdminSessionValue } from "@/lib/adminAuth";
import { formatCurrency, fromMinorUnits, toMinorUnits } from "@/lib/finance";
import { sendAgentNotification, sendRefundRequestAlert, tgEscape } from "@/lib/telegram";
import { orderRefundedSMS, sendCustomerSMS } from "@/lib/sms";

async function isAdmin() {
  const c = await cookies();
  return verifyAdminSessionValue(c.get("admin_session")?.value);
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { reference, amount } = await req.json() as { reference: string; amount?: number };
  if (!reference) return Response.json({ error: "reference required" }, { status: 400 });

  // Fetch the order
  const { data: order } = await supabase
    .from("orders")
    .select("reference, paystack_reference, amount, cost_price, status, refunded, customer_name, phone, agent_id, payment_method")
    .eq("reference", reference)
    .maybeSingle();

  if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
  if (order.refunded) return Response.json({ error: "Order has already been refunded" }, { status: 409 });

  const s = (order.status ?? "").toLowerCase();
  if (s === "duplicate_blocked") {
    return Response.json(
      { error: "This blocked second order must not be refunded." },
      { status: 409 },
    );
  }
  if (s === "completed") {
    return Response.json({ error: "Cannot refund a completed order — the bundle was already delivered." }, { status: 409 });
  }
  if (s === "not_on_list") {
    return Response.json(
      { error: "This is a new number being delivered manually (up to 72h) — it is not refunded. If it truly cannot be delivered, set the order to \"failed\" first." },
      { status: 409 },
    );
  }
  if (s === "processing" || s === "pending_approval" || s === "pending") {
    return Response.json(
      { error: `Cannot refund an order with status "${order.status}". Wait for it to fail first.` },
      { status: 409 }
    );
  }

  const paystackRef = order.paystack_reference ?? reference;
  const refundAmount = amount ? toMinorUnits(amount) : undefined; // Paystack uses kobo (pesewas)

  // Call Paystack Refunds API
  const paystackRes = await fetch("https://api.paystack.co/refund", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      transaction: paystackRef,
      ...(refundAmount ? { amount: refundAmount } : {}),
    }),
  });

  const paystackData = await paystackRes.json() as { status: boolean; message: string; data?: { id: number; status: string; amount: number } };

  if (!paystackRes.ok || !paystackData.status) {
    return Response.json(
      { error: `Paystack refund failed: ${paystackData.message}` },
      { status: 502 }
    );
  }

  // Mark order as refunded in DB
  const refundedAmount = fromMinorUnits(paystackData.data?.amount ?? 0);
  const { error: updateError } = await supabase.from("orders").update({
    refunded: true,
    refunded_at: new Date().toISOString(),
    refund_amount: refundedAmount,
    status: "refunded",
  }).eq("reference", reference);
  if (updateError) {
    return Response.json({ error: `Refund succeeded, but recording it needs attention: ${updateError.message}` }, { status: 500 });
  }

  const isAgentWallet = order.reference.startsWith("AGTWALLET-") && Boolean(order.agent_id);
  if (isAgentWallet) {
    const { data: walletRefund, error: walletError } = await supabase.rpc("refund_agent_wallet_order", {
      p_reference: reference,
    });
    if (walletError) return Response.json({ error: `Agent wallet refund failed: ${walletError.message}` }, { status: 500 });
    const result = walletRefund as { result?: string; amount?: number; balance?: number } | null;
    if (result?.result !== "refunded" && result?.result !== "already_refunded") {
      return Response.json({ error: `Agent wallet refund was not completed (${result?.result ?? "unknown"})` }, { status: 409 });
    }
    const refundedAmount = Number(result.amount ?? order.amount ?? order.cost_price ?? 0);
    const { error: reversalError } = await supabase.rpc("reverse_team_commission", {
      p_reference: reference,
      p_reason: "agent_wallet_refund",
    });
    const { data: agent } = await supabase.from("agents")
      .select("telegram_chat_id")
      .eq("id", order.agent_id)
      .maybeSingle();
    if (agent?.telegram_chat_id) {
      sendAgentNotification(agent.telegram_chat_id,
        `💰 <b>Wallet Refund</b>\n\nGH₵${refundedAmount.toFixed(2)} was credited back to your wallet.\nOrder: <code>${tgEscape(reference)}</code>\nNew balance: GH₵${Number(result.balance ?? 0).toFixed(2)}`,
      ).catch(() => {});
    }
    sendCustomerSMS(order.phone, orderRefundedSMS(order.customer_name ?? "Customer", refundedAmount, reference)).catch(() => {});
    await sendRefundRequestAlert(
      `✅ <b>AGENT WALLET REFUNDED</b>\n\n💵 Amount: <b>${formatCurrency(refundedAmount)}</b>\n📎 Order ref: <code>${tgEscape(reference)}</code>`,
    ).catch(() => {});
    if (reversalError) {
      return Response.json({ error: `Wallet was refunded, but commission reversal needs attention: ${reversalError.message}` }, { status: 500 });
    }
    return Response.json({ success: true, method: "agent_wallet", amount: refundedAmount, walletBalance: result.balance, message: "Agent wallet credited" });
  }
  const { error: reversalError } = await supabase.rpc("reverse_team_commission", {
    p_reference: reference,
    p_reason: "paystack_refund",
  });
  await sendRefundRequestAlert(
    `✅ <b>REFUND SUBMITTED TO PAYSTACK</b>\n\n` +
    `💵 Amount: <b>${formatCurrency(refundedAmount)}</b>\n` +
    `📎 Order ref: <code>${tgEscape(reference)}</code>\n` +
    `📎 Paystack ref: <code>${tgEscape(paystackRef)}</code>\n` +
    `✅ Purpose: Customer order refund`,
  ).catch(() => {});
  sendCustomerSMS(
    order.phone,
    orderRefundedSMS(order.customer_name ?? "Customer", refundedAmount, reference),
  ).catch(() => {});
  if (reversalError) {
    return Response.json({ error: `Refund succeeded and the customer was notified, but team commission reversal needs attention: ${reversalError.message}` }, { status: 500 });
  }

  return Response.json({
    success: true,
    refundId: paystackData.data?.id,
    amount: refundedAmount,
    message: paystackData.message,
  });
}
