import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendAdminAlert, orderApprovalKeyboard } from "@/lib/telegram";
import { sendCustomerSMS } from "@/lib/sms";

const PLATFORM_FEE_RATE = 0.02;

const VOUCHER_LABELS: Record<string, string> = {
  BECE:   "BECE Result Checker",
  WASSCE: "WASSCE Result Checker",
};

const DEFAULT_PRICES: Record<string, { sellPrice: number; costPrice: number }> = {
  BECE:   { sellPrice: 18, costPrice: 15 },
  WASSCE: { sellPrice: 18, costPrice: 15 },
};

async function getVoucherPrices() {
  try {
    const { data } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "voucher_prices")
      .maybeSingle();
    return data?.value
      ? (JSON.parse(data.value) as Record<string, { sellPrice: number; costPrice: number }>)
      : DEFAULT_PRICES;
  } catch {
    return DEFAULT_PRICES;
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return Response.json({ error: "Invalid request." }, { status: 400 });

  const { name, email, phone, voucherType, quantity, paystackRef } = body as Record<string, string | number>;
  const qty = Math.max(1, Math.min(10, Number(quantity) || 1));

  if (!name || !email || !phone || !voucherType || !paystackRef) {
    return Response.json({ error: "Missing required fields." }, { status: 400 });
  }

  const vType = String(voucherType).toUpperCase();
  const label = VOUCHER_LABELS[vType];
  if (!label) return Response.json({ error: "Invalid voucher type. Use BECE or WASSCE." }, { status: 400 });

  // Load prices from DB (falls back to defaults if not set)
  const prices = await getVoucherPrices();
  const vPrice = prices[vType] ?? DEFAULT_PRICES[vType];

  // Bulk discount: buying more than 9 vouchers drops the price from GH₵18 to GH₵17.50 each
  const effectiveSellPrice = qty > 9 ? 17.5 : vPrice.sellPrice;
  const totalSell = effectiveSellPrice * qty;
  const totalCost = vPrice.costPrice * qty;
  const profit = totalSell - totalCost;
  const chargedAmount = parseFloat((totalSell * (1 + PLATFORM_FEE_RATE)).toFixed(2));
  const expectedKobo = Math.round(chargedAmount * 100);

  // Idempotency
  const { data: existing } = await supabase
    .from("orders")
    .select("reference, status")
    .eq("reference", String(paystackRef))
    .maybeSingle();
  if (existing) return Response.json({ success: true, reference: existing.reference, status: existing.status });

  // Verify Paystack
  let psData: Record<string, unknown> = {};
  try {
    const psRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(String(paystackRef))}`,
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
    );
    psData = await psRes.json();
  } catch (err) {
    return Response.json({ error: `Paystack unreachable: ${err instanceof Error ? err.message : String(err)}` }, { status: 502 });
  }

  const txnData = psData.data as Record<string, unknown>;
  const paid = psData.status === true && txnData?.status === "success" && Number(txnData?.amount ?? 0) >= expectedKobo;
  if (!paid) {
    const reason = txnData?.status !== "success"
      ? `Transaction status: ${txnData?.status}`
      : `Amount mismatch: paid ${txnData?.amount} pesewas, expected ${expectedKobo}`;
    await sendAdminAlert(`VOUCHER PAYMENT FAILED\nRef: ${paystackRef}\nReason: ${reason}`).catch(() => {});
    return Response.json({ error: `Payment verification failed — ${reason}.` }, { status: 400 });
  }

  // Save order first
  await supabase.from("orders").insert({
    reference: String(paystackRef),
    paystack_reference: String(paystackRef),
    customer_name: String(name),
    customer_email: String(email),
    phone: String(phone),
    network: "voucher",
    bundle_size: `${label} x${qty}`,
    bundle_size_gb: 0,
    amount: chargedAmount,
    cost_price: totalCost,
    admin_commission: profit,
    agent_commission: 0,
    agent_id: null,
    status: "pending_approval",
  });

  // Voucher order held for admin approval
  await sendAdminAlert(
    `🎟 <b>VOUCHER ORDER — APPROVE TO DELIVER</b>\n${label} x${qty}\n📞 <code>${phone}</code>\n💰 GH₵${chargedAmount}\n📎 <code>${paystackRef}</code>`,
    orderApprovalKeyboard(String(paystackRef))
  ).catch(() => {});

  // SMS customer immediately so they know the order was received
  const firstName = String(name).split(" ")[0] || "Customer";
  const shortRef = String(paystackRef).replace(/[^A-Z0-9]/gi, "").slice(-8).toUpperCase();
  sendCustomerSMS(
    String(phone),
    `Hi ${firstName}! Your ${label} x${qty} order (Ref: ${shortRef}) has been received. Your voucher codes will be sent to you shortly. Thank you for choosing Elite Data!`
  ).catch(() => {});

  return Response.json({ success: true, reference: paystackRef, pendingApproval: true });
}
