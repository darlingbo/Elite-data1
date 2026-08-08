import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/apiKeyAuth";
import { supabase } from "@/lib/supabase";
import { bundles, type Network } from "@/lib/bundles";
import { orderApprovalKeyboard, sendNewOrderAlert, tgEscape } from "@/lib/telegram";
import { maybeAutoApprove } from "@/lib/order-approval";
import { formatCurrency, roundCurrency } from "@/lib/finance";

const NET_MAP: Record<string, Network> = {
  mtn: "mtn", MTN: "mtn",
  telecel: "telecel", TELECEL: "telecel",
  airteltigo: "airteltigo", AIRTELTIGO: "airteltigo",
  "at ishare": "airteltigo", "AT ISHARE": "airteltigo",
  airtel: "airteltigo", tigo: "airteltigo",
};

export async function POST(request: NextRequest) {
  const auth = await authenticateApiKey(request);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: 401 });

  if (!auth.agentId) {
    return NextResponse.json({
      success: false,
      error: "This API key is not linked to an agent account. Use /api/v1/purchase for developer API orders.",
    }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ success: false, error: "Invalid JSON body." }, { status: 400 });

  const { network: rawNetwork, phone, datasize, reference } = body as Record<string, unknown>;

  if (!rawNetwork || !phone || !datasize || !reference) {
    return NextResponse.json({
      success: false,
      error: "Missing required fields: network, phone, datasize, reference",
    }, { status: 400 });
  }

  const network = NET_MAP[String(rawNetwork).trim()];
  if (!network) {
    return NextResponse.json({
      success: false,
      error: `Unknown network "${rawNetwork}". Use: MTN, TELECEL, or AIRTELTIGO`,
    }, { status: 400 });
  }

  const sizeGB = Number(datasize);
  if (!sizeGB || sizeGB <= 0) {
    return NextResponse.json({ success: false, error: "datasize must be a positive number (in GB)." }, { status: 400 });
  }

  const ref = String(reference).trim();
  if (!ref) return NextResponse.json({ success: false, error: "reference is required." }, { status: 400 });

  // Idempotency — already processed?
  const { data: existing } = await supabase.from("orders").select("reference, status").eq("reference", ref).maybeSingle();
  if (existing) {
    return NextResponse.json({ success: true, reference: existing.reference, status: existing.status, message: "Order already exists." });
  }

  // Find bundle cost
  const staticBundle = bundles.find(b => b.network === network && b.sizeGB === sizeGB);
  const { data: dbBundle } = await supabase
    .from("bundle_prices")
    .select("id, network, size_label, size_gb, cost_price, active")
    .eq("network", network)
    .eq("size_gb", sizeGB)
    .eq("active", true)
    .maybeSingle();

  const costPrice = roundCurrency(Number(dbBundle?.cost_price ?? staticBundle?.costPrice ?? 0));
  const sizeLabel = dbBundle?.size_label ?? staticBundle?.size ?? `${sizeGB}GB`;

  if (!costPrice) {
    return NextResponse.json({
      success: false,
      error: `No bundle found for ${String(rawNetwork).toUpperCase()} ${sizeGB}GB.`,
    }, { status: 404 });
  }

  // Get agent wallet balance
  const { data: agent } = await supabase
    .from("agents")
    .select("id, wallet_balance")
    .eq("id", auth.agentId)
    .maybeSingle();

  if (!agent) return NextResponse.json({ success: false, error: "Agent account not found." }, { status: 404 });

  const walletBalance = roundCurrency(Number(agent.wallet_balance ?? 0));
  if (walletBalance < costPrice) {
    return NextResponse.json({
      success: false,
      error: `Insufficient wallet balance. Required: GH₵${costPrice.toFixed(2)}, Available: GH₵${walletBalance.toFixed(2)}. Top up your wallet to continue.`,
      balance: walletBalance,
      required: costPrice,
    }, { status: 402 });
  }

  // Deduct from agent wallet atomically
  const { error: deductErr } = await supabase.rpc("deduct_agent_wallet", {
    p_agent_id: auth.agentId,
    p_amount: costPrice,
  });

  if (deductErr) {
    return NextResponse.json({ success: false, error: "Failed to deduct wallet balance. Try again." }, { status: 500 });
  }
  const newBalance = roundCurrency(walletBalance - costPrice);

  // Log wallet transaction
  const { error: walletLogError } = await supabase.from("agent_wallet_transactions").insert({
    agent_id: auth.agentId,
    type: "order_debit",
    amount: costPrice,
    description: `${String(rawNetwork).toUpperCase()} ${sizeLabel} → ${String(phone)}`,
    paystack_reference: ref,
  });
  if (walletLogError) {
    await supabase.rpc("adjust_agent_wallet", { p_agent_id: auth.agentId, p_amount: costPrice });
    return NextResponse.json({ success: false, error: "Could not record wallet transaction. Wallet was refunded." }, { status: 500 });
  }

  // Save order
  const { error: orderError } = await supabase.from("orders").insert({
    reference: ref,
    customer_name: `Storefront: ${auth.name}`,
    phone: String(phone),
    network,
    bundle_size: sizeLabel,
    bundle_size_gb: sizeGB,
    amount: costPrice,
    cost_price: costPrice,
    admin_commission: 0,
    agent_commission: 0,
    agent_id: auth.agentId,
    payment_method: "agent_wallet",
    status: "pending_approval",
  });
  if (orderError) {
    await supabase.rpc("adjust_agent_wallet", { p_agent_id: auth.agentId, p_amount: costPrice });
    return NextResponse.json({ success: false, error: "Order could not be saved. Wallet was refunded." }, { status: 500 });
  }

  const orderText =
    `🔌 <b>AGENT API ORDER — APPROVE TO DELIVER</b>\n\n` +
    `🎯 Source: <b>Agent API page</b>\n` +
    `👤 Agent: <b>${tgEscape(auth.name)}</b>\n` +
    `📱 ${String(rawNetwork).toUpperCase()} ${sizeLabel} → <code>${tgEscape(String(phone))}</code>\n` +
    `💰 Wallet debit: <b>${formatCurrency(costPrice)}</b>\n` +
    `💳 Wallet after reserve: <b>${formatCurrency(newBalance)}</b>\n` +
    `📎 Ref: <code>${tgEscape(ref)}</code>`;
  await sendNewOrderAlert(orderText, orderApprovalKeyboard(ref)).catch(() => {});

  const autoApproval = await maybeAutoApprove(ref);
  return NextResponse.json({
    success: true,
    reference: ref,
    status: autoApproval.ok ? "processing" : "pending_approval",
    network: String(rawNetwork).toUpperCase(),
    phone: String(phone),
    datasize: `${sizeGB}GB`,
    amount_charged: costPrice,
    wallet_balance: newBalance,
    message: autoApproval.ok ? "Wallet reserved. Order was approved automatically." : "Wallet reserved. Order is awaiting admin approval.",
  });
}
