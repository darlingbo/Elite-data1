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
  BECE:   { sellPrice: 19, costPrice: 15 },
  WASSCE: { sellPrice: 19, costPrice: 15 },
};

const BULK_THRESHOLD = 10; // qty > 10 gets bulk price
const BULK_PRICE     = 18;

async function getVoucherDiscountCode(): Promise<string> {
  try {
    const { data } = await supabase.from("system_settings").select("value").eq("key", "voucher_discount_code").maybeSingle();
    return (data?.value ?? "").trim();
  } catch { return ""; }
}

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

  const { name, email, phone, voucherType, quantity, paystackRef, promoCode } = body as Record<string, string | number>;
  const qty = Math.max(1, Math.min(200, Number(quantity) || 1));

  if (!name || !email || !phone || !voucherType || !paystackRef) {
    return Response.json({ error: "Missing required fields." }, { status: 400 });
  }

  const vType = String(voucherType).toUpperCase();
  const label = VOUCHER_LABELS[vType];
  if (!label) return Response.json({ error: "Invalid voucher type. Use BECE or WASSCE." }, { status: 400 });

  // Load prices + validate promo code in parallel
  const [prices, validDiscountCode] = await Promise.all([
    getVoucherPrices(),
    getVoucherDiscountCode(),
  ]);
  const vPrice = prices[vType] ?? DEFAULT_PRICES[vType];

  const promoCodeStr = String(promoCode ?? "").trim();
  const promoApplied = !!(promoCodeStr && validDiscountCode && promoCodeStr === validDiscountCode);

  // Bulk: qty > 10 → GH₵18. Promo code → GH₵18 regardless of qty.
  const effectiveSellPrice = (qty > BULK_THRESHOLD || promoApplied) ? BULK_PRICE : vPrice.sellPrice;
  const totalSell = effectiveSellPrice * qty;
  const totalCost = vPrice.costPrice * qty;
  const chargedAmount = parseFloat((totalSell * (1 + PLATFORM_FEE_RATE)).toFixed(2));
  // Include the 2% platform fee in admin profit so stats match what was actually collected
  const profit = parseFloat((chargedAmount - totalCost).toFixed(2));
  const expectedKobo = Math.round(chargedAmount * 100);

  // Phone blocklist check
  const { data: blocklistData } = await supabase
    .from("system_settings").select("value").eq("key", "phone_blocklist").maybeSingle();
  let blocklist: string[] = [];
  try { blocklist = JSON.parse(blocklistData?.value ?? "[]"); } catch { blocklist = []; }
  const normalizePhone = (p: string) => String(p).trim().replace(/\s/g, "").replace(/^\+233/, "0").replace(/^233/, "0");
  const normalizedPhone = normalizePhone(String(phone));
  if (blocklist.some((b: string) => normalizePhone(b) === normalizedPhone)) {
    await sendAdminAlert(`🚫 BLOCKED VOUCHER ATTEMPT\nPhone: ${phone}\nVoucher: ${label} x${qty}\nRef: ${paystackRef}`).catch(() => {});
    return Response.json({ error: "👀 I SEE WHAT YOU ARE DOING" }, { status: 403 });
  }

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

  // Save order
  const { error: insertError } = await supabase.from("orders").insert({
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

  if (insertError) {
    await sendAdminAlert(
      `🚨 VOUCHER ORDER SAVE FAILED\nRef: ${paystackRef}\nPhone: ${phone}\n${label} x${qty}\nGH₵${chargedAmount}\nError: ${insertError.message} (${insertError.code})\n\nCustomer paid but order NOT saved — deliver manually!`
    ).catch(() => {});
    return Response.json(
      { error: `Order could not be saved: ${insertError.message}. Screenshot this and contact support on WhatsApp.` },
      { status: 500 }
    );
  }

  // Voucher order held for admin approval
  await sendAdminAlert(
    `🎟 <b>VOUCHER ORDER — APPROVE TO DELIVER</b>\n${label} x${qty}\n📞 <code>${phone}</code>\n💰 GH₵${chargedAmount}\n📎 <code>${paystackRef}</code>`,
    orderApprovalKeyboard(String(paystackRef))
  ).catch(() => {});

  // Await so Vercel doesn't kill the function before the SMS fetch completes
  const firstName = String(name).split(" ")[0] || "Customer";
  const shortRef = String(paystackRef).replace(/[^A-Z0-9]/gi, "").slice(-8).toUpperCase();
  await sendCustomerSMS(
    String(phone),
    `Hi ${firstName}! Your ${label} x${qty} order (Ref: ${shortRef}) has been received. Your voucher codes will be sent to you shortly. Thank you for choosing Elite Data!`
  );

  return Response.json({ success: true, reference: paystackRef, pendingApproval: true });
}
