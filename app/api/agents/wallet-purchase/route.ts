import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendAgentNotification, sendAdminAlert, orderApprovalKeyboard } from "@/lib/telegram";
import { getAgentBundleCost } from "@/lib/agent-pricing";
import { requireAgentSession } from "@/lib/agentAuth";
import { walletPurchaseSchema, parseBody } from "@/lib/validation";

export async function POST(request: NextRequest) {
  const parsed = parseBody(walletPurchaseSchema, await request.json().catch(() => null));
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }
  const { agentId, referralCode, phone, bundleId, network, bundleSize, sizeGB } = parsed.data;
  const cleaned = phone; // already normalized + validated by the schema

  // Auth: the caller must hold a valid session cookie for THIS agent.
  // referralCode + agentId are both public, so they are not sufficient on their own.
  const auth = requireAgentSession(request, agentId, { requireFull: true });
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  // Load agent
  const agentRes = await supabase
    .from("agents")
    .select("id, name, wallet_balance, status, telegram_chat_id, registration_ref, agent_type")
    .eq("id", agentId)
    .eq("referral_code", referralCode.toUpperCase())
    .eq("status", "approved")
    .maybeSingle();

  const agent = agentRes.data;
  if (!agent) {
    return Response.json({ error: "Agent account not found or not approved." }, { status: 403 });
  }

  const [costPrice, bundleRes] = await Promise.all([
    getAgentBundleCost(bundleId, agent.registration_ref, agent.agent_type),
    supabase.from("bundle_prices").select("size_label, size_gb").eq("id", bundleId).maybeSingle(),
  ]);

  if (costPrice == null) {
    return Response.json({ error: "Bundle not found or no longer active." }, { status: 400 });
  }

  const walletBalance = Number(agent.wallet_balance ?? 0);
  if (walletBalance < costPrice) {
    return Response.json({
      error: `Insufficient wallet balance. You need GH₵${costPrice.toFixed(2)} but only have GH₵${walletBalance.toFixed(2)}.`,
      walletBalance,
      required: costPrice,
    }, { status: 400 });
  }

  // Deduplication: if an identical pending order was created in the last 2 min, return it
  const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data: existingOrder } = await supabase
    .from("orders")
    .select("reference, bundle_size, amount")
    .eq("agent_id", agentId)
    .eq("phone", cleaned)
    .eq("network", network)
    .eq("status", "pending_approval")
    .gte("created_at", twoMinAgo)
    .maybeSingle();

  if (existingOrder) {
    return Response.json({
      success: true,
      pending: true,
      awaitingApproval: true,
      reference: existingOrder.reference,
      network,
      bundleSize: existingOrder.bundle_size,
      phone: cleaned,
      costDeducted: 0,
      newWalletBalance: walletBalance,
      message: "Order already submitted and awaiting approval.",
    });
  }

  // Atomically deduct from wallet. The RPC does a single conditional UPDATE
  // (WHERE wallet_balance >= cost) so two concurrent requests can never both
  // succeed -> no double-spend. Falls back to a best-effort update only if the
  // RPC has not been installed yet (see migration.sql: deduct_agent_wallet).
  const rpc = await supabase.rpc("deduct_agent_wallet", { p_agent_id: agentId, p_amount: costPrice });
  if (rpc.error && rpc.error.code !== "42883") {
    return Response.json({ error: "Failed to deduct from wallet. Try again." }, { status: 500 });
  }
  if (!rpc.error) {
    // RPC returns the new balance, or null when funds were insufficient.
    if (rpc.data == null) {
      return Response.json({ error: "Insufficient wallet balance." }, { status: 400 });
    }
  } else {
    // Fallback path (RPC not installed): non-atomic check-then-update.
    const { error: deductError } = await supabase
      .from("agents")
      .update({ wallet_balance: walletBalance - costPrice })
      .eq("id", agentId)
      .gte("wallet_balance", costPrice);
    if (deductError) {
      return Response.json({ error: "Failed to deduct from wallet. Try again." }, { status: 500 });
    }
  }

  const reference = `AGTWALLET-${referralCode.toUpperCase()}-${Date.now()}`;
  const numericSizeGB = sizeGB ?? bundleRes.data?.size_gb ?? 1;
  const label = bundleSize ?? bundleRes.data?.size_label ?? `${numericSizeGB}GB`;

  // Save as pending_approval — admin must approve before delivery
  const { error: insertError } = await supabase.from("orders").insert({
    reference,
    customer_name: agent.name,
    phone: cleaned,
    network,
    bundle_size: label,
    bundle_size_gb: numericSizeGB,
    amount: costPrice,
    cost_price: costPrice,
    admin_commission: 0,
    agent_commission: 0,
    agent_id: agentId,
    status: "pending_approval",
  });

  if (insertError) {
    // Refund wallet if order couldn't be saved (atomic increment, no clobber).
    const refund = await supabase.rpc("adjust_agent_wallet", { p_agent_id: agentId, p_amount: costPrice });
    if (refund.error && refund.error.code === "42883") {
      await supabase.from("agents").update({ wallet_balance: walletBalance }).eq("id", agentId);
    }
    return Response.json({ error: "Order could not be saved. Your wallet has been refunded." }, { status: 500 });
  }

  // Alert admin with Approve / Reject keyboard
  sendAdminAlert(
    `🟡 <b>WALLET ORDER — APPROVE TO DELIVER</b>\n\n` +
    `👤 ${agent.name} · <code>${referralCode.toUpperCase()}</code>\n` +
    `📱 ${network.toUpperCase()} ${label} → <code>${cleaned}</code>\n` +
    `💰 GH₵${costPrice.toFixed(2)} deducted from wallet\n` +
    `📎 <code>${reference}</code>`,
    orderApprovalKeyboard(reference)
  ).catch(() => {});

  // Notify agent that order is awaiting approval
  if (agent.telegram_chat_id) {
    sendAgentNotification(
      agent.telegram_chat_id,
      `✅ <b>Order Placed!</b>\n\n` +
      `📱 ${network.toUpperCase()} ${label} → <code>${cleaned}</code>\n` +
      `💰 GH₵${costPrice.toFixed(2)} deducted from wallet\n` +
      `📎 <code>${reference}</code>\n\n` +
      `Your order is being processed. You will receive an SMS once your bundle is delivered.`
    ).catch(() => {});
  }

  return Response.json({
    success: true,
    pending: true,
    awaitingApproval: true,
    reference,
    network,
    bundleSize: label,
    phone: cleaned,
    costDeducted: costPrice,
    newWalletBalance: parseFloat((walletBalance - costPrice).toFixed(2)),
    message: "Order placed successfully! Your bundle is being processed. You will receive an SMS once delivered.",
  });
}
