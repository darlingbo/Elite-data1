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

  // Find matching bundle
  const staticBundle = bundles.find(b => b.network === network && b.sizeGB === sizeGB);
  const { data: dbBundle } = await supabase
    .from("bundle_prices")
    .select("id, network, size_label, size_gb, price, cost_price, api_price, active")
    .eq("network", network)
    .eq("size_gb", sizeGB)
    .eq("active", true)
    .maybeSingle();

  const costPrice = dbBundle?.cost_price ?? staticBundle?.costPrice;
  const sellingPrice = dbBundle?.price ?? staticBundle?.price ?? costPrice;
  const sizeLabel = dbBundle?.size_label ?? staticBundle?.size ?? `${sizeGB}GB`;

  if (!costPrice || !sellingPrice) {
    return NextResponse.json({
      success: false,
      error: `No bundle found for ${String(rawNetwork).toUpperCase()} ${sizeGB}GB. Use GET /api/v1/bundles to see available options.`,
    }, { status: 404 });
  }

  // Use admin-set API price; fall back to selling price if not set
  const price = roundCurrency(Number(dbBundle?.api_price ?? sellingPrice));

  // Check wallet balance
  if (auth.walletBalance < price) {
    return NextResponse.json({
      success: false,
      error: `Insufficient wallet balance. Required: GH₵${price.toFixed(2)}, Available: GH₵${auth.walletBalance.toFixed(2)}. Top up your wallet to continue.`,
      balance: auth.walletBalance,
      required: price,
    }, { status: 402 });
  }

  // Reserve the wallet amount and write its ledger entry in one transaction.
  const { data: reservedBalance, error: deductErr } = await supabase.rpc("reserve_api_wallet_order", {
    p_api_key_id: auth.keyId,
    p_reference: ref,
    p_amount: price,
    p_description: `${String(rawNetwork).toUpperCase()} ${sizeLabel} → ${String(phone)}`,
  });
  if (deductErr || reservedBalance == null) {
    return NextResponse.json({ success: false, error: "Failed to deduct wallet balance. Try again." }, { status: 500 });
  }
  const newBalance = roundCurrency(Number(reservedBalance));

  // Save order to DB
  const profit = Math.max(0, roundCurrency(price - Number(costPrice)));
  const { error: orderError } = await supabase.from("orders").insert({
    reference: ref,
    customer_name: `API: ${auth.name}`,
    phone: String(phone),
    network,
    bundle_size: sizeLabel,
    bundle_size_gb: sizeGB,
    amount: price,
    cost_price: costPrice,
    admin_commission: profit,
    agent_commission: 0,
    payment_method: "api_wallet",
    status: "pending_approval",
  });
  if (orderError) {
    await supabase.rpc("refund_api_wallet_order", { p_reference: ref });
    return NextResponse.json({ success: false, error: "Order could not be saved. Wallet was refunded." }, { status: 500 });
  }

  const orderText =
    `🔌 <b>API WALLET ORDER — APPROVE TO DELIVER</b>\n\n` +
    `🎯 Source: <b>Developer API wallet (${tgEscape(auth.name)})</b>\n` +
    `📱 ${String(rawNetwork).toUpperCase()} ${sizeLabel} → <code>${tgEscape(String(phone))}</code>\n` +
    `💰 Charged: <b>${formatCurrency(price)}</b>\n` +
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
    amount_charged: price,
    wallet_balance: newBalance,
    message: autoApproval.ok ? "Wallet reserved. Order was approved automatically." : "Wallet reserved. Order is awaiting admin approval.",
  });
}
