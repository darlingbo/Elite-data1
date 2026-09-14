import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/apiKeyAuth";
import { supabase } from "@/lib/supabase";
import { deliverVoucherFromInventory } from "@/lib/voucher-inventory";
import { sendNewOrderAlert, tgEscape } from "@/lib/telegram";
import { roundCurrency } from "@/lib/finance";

/**
 * POST /api/v1/vouchers/purchase — WASSCE/BECE result-checker voucher, for a
 * wallet-funded API key (same auth as /api/v1/purchase). Unlike data bundles,
 * this is FAST and synchronous: vouchers come from local stock
 * (voucher_inventory), not an upstream aggregator round-trip, and delivery
 * (SMS with the code, via MessagePilot's ELITEGHA Sender ID) happens inline
 * before the response — no Telegram admin-approval wait, since an
 * authenticated wallet-funded API call is already a trusted source (same
 * tier as auto-approval on the data-bundle side).
 *
 * Body: { exam_type: "WASSCE"|"BECE", phone, reference, quantity? (1-20, default 1) }
 * Idempotent on `reference`. On success the voucher code has ALREADY been
 * texted to `phone` by Elite Data — the caller does not need to (and is not
 * given) the raw code.
 */

const DEFAULT_PRICES: Record<string, { sellPrice: number; costPrice: number; apiPrice?: number }> = {
  BECE: { sellPrice: 19, costPrice: 15 },
  WASSCE: { sellPrice: 19, costPrice: 15 },
};

async function getVoucherPrices() {
  try {
    const { data } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "voucher_prices")
      .maybeSingle();
    return data?.value
      ? (JSON.parse(data.value) as Record<string, { sellPrice: number; costPrice: number; apiPrice?: number }>)
      : DEFAULT_PRICES;
  } catch {
    return DEFAULT_PRICES;
  }
}

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("233") ? `0${digits.slice(3)}` : digits;
}

export async function POST(request: NextRequest) {
  const auth = await authenticateApiKey(request);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ success: false, error: "Invalid JSON body." }, { status: 400 });

  const { exam_type: rawExamType, phone, reference, quantity: rawQuantity } = body as Record<string, unknown>;

  const examType = String(rawExamType ?? "").toUpperCase();
  if (examType !== "WASSCE" && examType !== "BECE") {
    return NextResponse.json({ success: false, error: 'exam_type must be "WASSCE" or "BECE".' }, { status: 400 });
  }
  if (!phone || !reference) {
    return NextResponse.json({ success: false, error: "Missing required fields: phone, reference" }, { status: 400 });
  }
  const normalizedPhone = normalizePhone(String(phone));
  if (!/^0[2-5][0-9]{8}$/.test(normalizedPhone)) {
    return NextResponse.json({ success: false, error: "Enter a valid Ghana phone number." }, { status: 400 });
  }
  const quantity = Math.max(1, Math.min(20, Number.parseInt(String(rawQuantity ?? "1"), 10) || 1));
  const ref = String(reference).trim();
  if (!ref) return NextResponse.json({ success: false, error: "reference is required." }, { status: 400 });

  // Idempotency check and price lookup don't depend on each other — run them
  // concurrently instead of one after another to shave off a round-trip.
  const [{ data: existing }, prices] = await Promise.all([
    supabase.from("orders").select("reference, status").eq("reference", ref).maybeSingle(),
    getVoucherPrices(),
  ]);
  if (existing) {
    return NextResponse.json({ success: true, reference: existing.reference, status: existing.status, message: "Order already exists." });
  }

  const vPrice = prices[examType] ?? DEFAULT_PRICES[examType];
  // API buyers get the admin-set apiPrice tier (falls back to sellPrice if
  // never configured) — deliberately separate from the web-checkout price,
  // no bulk-threshold logic here since that's a web-checkout concept.
  const unitPrice = vPrice.apiPrice ?? vPrice.sellPrice;
  const price = roundCurrency(unitPrice * quantity);
  const costTotal = roundCurrency(vPrice.costPrice * quantity);

  if (auth.walletBalance < price) {
    return NextResponse.json({
      success: false,
      error: `Insufficient wallet balance. Required: GH₵${price.toFixed(2)}, Available: GH₵${auth.walletBalance.toFixed(2)}. Top up your wallet to continue.`,
      balance: auth.walletBalance,
      required: price,
    }, { status: 402 });
  }

  const { data: reservedBalance, error: deductErr } = await supabase.rpc("reserve_api_wallet_order", {
    p_api_key_id: auth.keyId,
    p_reference: ref,
    p_amount: price,
    p_description: `${examType} voucher x${quantity} → ${normalizedPhone}`,
  });
  if (deductErr || reservedBalance == null) {
    return NextResponse.json({ success: false, error: "Failed to deduct wallet balance. Try again." }, { status: 500 });
  }
  const newBalance = roundCurrency(Number(reservedBalance));

  const bundleSize = `${examType} x${quantity}`;
  const customerName = `API: ${auth.name}`;
  const profit = Math.max(0, roundCurrency(price - costTotal));
  const { error: orderError } = await supabase.from("orders").insert({
    reference: ref,
    customer_name: customerName,
    phone: normalizedPhone,
    network: "voucher",
    bundle_size: bundleSize,
    bundle_size_gb: 0,
    amount: price,
    cost_price: costTotal,
    admin_commission: profit,
    agent_commission: 0,
    payment_method: "api_wallet",
    status: "processing",
  });
  if (orderError) {
    await supabase.rpc("refund_api_wallet_order", { p_reference: ref });
    return NextResponse.json({ success: false, error: "Order could not be saved. Wallet was refunded." }, { status: 500 });
  }

  // No Telegram approval wait — deliver immediately (local stock + SMS).
  const delivery = await deliverVoucherFromInventory({
    reference: ref,
    phone: normalizedPhone,
    customer_name: customerName,
    bundle_size: bundleSize,
  });

  if (delivery.ok) {
    await supabase.from("orders").update({ status: "completed", completed_at: new Date().toISOString() }).eq("reference", ref);
    sendNewOrderAlert(
      `🔌🎟 <b>API WALLET VOUCHER — DELIVERED</b>\n\n🎯 Source: <b>Developer API wallet (${tgEscape(auth.name)})</b>\n${tgEscape(examType)} x${quantity} → <code>${tgEscape(normalizedPhone)}</code>\n💰 Charged: GH₵${price.toFixed(2)}\n📎 Ref: <code>${tgEscape(ref)}</code>`,
    ).catch(() => {});
    return NextResponse.json({
      success: true,
      reference: ref,
      status: "completed",
      exam_type: examType,
      quantity,
      phone: normalizedPhone,
      amount_charged: price,
      wallet_balance: newBalance,
      message: `${quantity} ${examType} voucher${quantity > 1 ? "s" : ""} delivered by SMS to ${normalizedPhone}.`,
    });
  }

  // Delivery failed (usually out of stock) — refund and fail fast so the
  // caller can refund their own customer immediately instead of leaving them
  // stuck in "processing".
  await supabase.from("orders").update({ status: "failed" }).eq("reference", ref);
  await supabase.rpc("refund_api_wallet_order", { p_reference: ref });
  sendNewOrderAlert(
    `🔌🎟 <b>API WALLET VOUCHER — FAILED</b>\n\n🎯 Source: <b>Developer API wallet (${tgEscape(auth.name)})</b>\n${tgEscape(examType)} x${quantity} → <code>${tgEscape(normalizedPhone)}</code>\n📎 Ref: <code>${tgEscape(ref)}</code>\n❌ ${tgEscape(delivery.message)}\n\nWallet refunded automatically.`,
  ).catch(() => {});
  return NextResponse.json({
    success: false,
    reference: ref,
    status: "failed",
    error: delivery.fallbackToInventor
      ? `Out of stock: no ${examType} vouchers available right now.`
      : delivery.message,
    wallet_balance: auth.walletBalance,
  }, { status: delivery.fallbackToInventor ? 409 : 500 });
}
