import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendAgentNotification, sendAdminAlert, orderApprovalKeyboard } from "@/lib/telegram";
import { getAgentBundleCost } from "@/lib/agent-pricing";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { agentId, referralCode, phone, bundleId, network, bundleSize, sizeGB } = body;

  if (!agentId || !referralCode || !phone || !bundleId || !network) {
    return Response.json({ error: "Missing required fields." }, { status: 400 });
  }

  const cleaned = phone.replace(/\s/g, "");
  if (!/^0[2-5][0-9]{8}$/.test(cleaned)) {
    return Response.json({ error: "Enter a valid Ghana phone number (e.g. 0241234567)." }, { status: 400 });
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

  // Deduct from wallet upfront (reserves balance, prevents double-spend)
  const { error: deductError } = await supabase
    .from("agents")
    .update({ wallet_balance: walletBalance - costPrice })
    .eq("id", agentId);

  if (deductError) {
    return Response.json({ error: "Failed to deduct from wallet. Try again." }, { status: 500 });
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
    // Refund wallet if order couldn't be saved
    await supabase.from("agents").update({ wallet_balance: walletBalance }).eq("id", agentId);
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
