import { PLATFORM_FEE_RATE } from "@/lib/pricing";
import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendAdminAlert, sendNewOrderAlert, orderApprovalKeyboard } from "@/lib/telegram";
import { sendCustomerSMS } from "@/lib/sms";
import { maybeAutoApprove } from "@/lib/order-approval";
import { roundCurrency, toMinorUnits } from "@/lib/finance";
import { claimVoucherDiscount, getVoucherDiscountStatus } from "@/lib/voucherDiscount";


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

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("233") ? `0${digits.slice(3)}` : digits;
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

  const { name, email, phone, voucherType, quantity, paymentRef, promoCode, serviceMode, candidateType, candidateName, indexNumber, confirmIndexNumber, examYear, dateOfBirth, whatsapp, consent } = body as Record<string, string | number | boolean>;
  const isAssisted = serviceMode === "assisted_result";
  const qty = isAssisted ? 1 : Math.max(1, Math.min(200, Number(quantity) || 1));

  if (!name || !email || !phone || !voucherType || !paymentRef) {
    return Response.json({ error: "Missing required fields." }, { status: 400 });
  }

  const vType = String(voucherType).toUpperCase();
  const label = VOUCHER_LABELS[vType];
  if (!label) return Response.json({ error: "Invalid voucher type. Use BECE or WASSCE." }, { status: 400 });
  const normalizedPhone = normalizePhone(String(phone));
  if (!/^0[2-5][0-9]{8}$/.test(normalizedPhone)) {
    return Response.json({ error: "Enter a valid Ghana phone number." }, { status: 400 });
  }
  const normalizedWhatsApp = normalizePhone(String(whatsapp ?? phone));
  const year = Number(examYear);
  const needsDob = isAssisted && ((vType === "WASSCE" && candidateType === "private") || (vType === "BECE" && candidateType === "school"));
  if (isAssisted) {
    if (!String(candidateName ?? "").trim() || !["school", "private"].includes(String(candidateType)) || !/^\d{6,14}$/.test(String(indexNumber ?? "").replace(/\s/g, "")) || String(indexNumber).replace(/\s/g, "") !== String(confirmIndexNumber ?? "").replace(/\s/g, "") || year < 1990 || year > new Date().getFullYear() || !/^0[2-5][0-9]{8}$/.test(normalizedWhatsApp) || consent !== true || (needsDob && !/^\d{4}-\d{2}-\d{2}$/.test(String(dateOfBirth ?? "")))) {
      return Response.json({ error: "Complete all required result-checking details and confirm the index number." }, { status: 400 });
    }
  }

  // Load prices + validate promo code in parallel
  const promoCodeStr = String(promoCode ?? "").trim().toUpperCase();
  const [prices, discountStatus] = await Promise.all([
    getVoucherPrices(),
    getVoucherDiscountStatus(promoCodeStr),
  ]);
  const vPrice = prices[vType] ?? DEFAULT_PRICES[vType];

  const promoApplied = !isAssisted && discountStatus.valid;

  // Bulk: qty > 10 → GH₵18. Promo code → GH₵18 regardless of qty.
  const effectiveSellPrice = (qty > BULK_THRESHOLD || promoApplied) ? BULK_PRICE : vPrice.sellPrice;
  const totalSell = isAssisted ? 25 : roundCurrency(effectiveSellPrice * qty);
  const totalCost = roundCurrency(vPrice.costPrice * qty);
  const chargedAmount = isAssisted ? 25 : roundCurrency(totalSell * (1 + PLATFORM_FEE_RATE));
  // Admin profit is what was collected minus cost, so stats match the money received
  const profit = roundCurrency(chargedAmount - totalCost);
  const expectedKobo = toMinorUnits(chargedAmount);

  // Phone blocklist check
  const { data: blocklistData } = await supabase
    .from("system_settings").select("value").eq("key", "phone_blocklist").maybeSingle();
  let blocklist: string[] = [];
  try { blocklist = JSON.parse(blocklistData?.value ?? "[]"); } catch { blocklist = []; }
  if (blocklist.some((b: string) => normalizePhone(b) === normalizedPhone)) {
    await sendAdminAlert(`🚫 BLOCKED VOUCHER ATTEMPT\nPhone: ${phone}\nVoucher: ${label} x${qty}\nRef: ${paymentRef}`).catch(() => {});
    return Response.json({ error: "👀 I SEE WHAT YOU ARE DOING" }, { status: 403 });
  }

  // Idempotency
  const { data: existing } = await supabase
    .from("orders")
    .select("reference, status")
    .eq("reference", String(paymentRef))
    .maybeSingle();
  if (existing) return Response.json({ success: true, reference: existing.reference, status: existing.status });

  // Payment is Mobile Money through Yebeck only. Yebeck (not the browser) says what was paid.
  let paid = false;
  let reason = "";

  try {
    const { verifyYebeckPayment } = await import("@/lib/payment-attempt");
    const ybk = await verifyYebeckPayment(String(paymentRef), "voucher_order");
    paid = ybk.status === "success" && ybk.attempt.amount_pesewas >= expectedKobo;
    if (!paid) {
      reason = ybk.status !== "success" ? `Status: ${ybk.status}` : `Amount: paid ${ybk.attempt.amount_pesewas}, expected ${expectedKobo}`;
    }
  } catch (err) {
    return Response.json({ error: `Yebeck unreachable: ${err instanceof Error ? err.message : String(err)}` }, { status: 502 });
  }

  if (!paid) {
    console.warn("[vouchers/create] Payment not ready or invalid", {
      reference: String(paymentRef),
      reason,
      expectedKobo,
    });
    await sendAdminAlert(`VOUCHER PAYMENT FAILED\nRef: ${paymentRef}\nReason: ${reason}`).catch(() => {});
    return Response.json({ error: `Payment verification failed — ${reason}.` }, { status: 400 });
  }

  // Save order
  const { error: insertError } = await supabase.from("orders").insert({
    reference: String(paymentRef),
    paystack_reference: String(paymentRef),
    payment_method: "yebeck",
    customer_name: String(name),
    customer_email: String(email),
    phone: normalizedPhone,
    network: "voucher",
    bundle_size: `${label}${isAssisted ? " Assisted Check" : ""} x${qty}`,
    bundle_size_gb: 0,
    amount: chargedAmount,
    cost_price: totalCost,
    admin_commission: profit,
    agent_commission: 0,
    status: "pending_approval",
  });

  if (insertError) {
    await sendAdminAlert(
      `🚨 VOUCHER ORDER SAVE FAILED\nRef: ${paymentRef}\nPhone: ${phone}\n${label} x${qty}\nGH₵${chargedAmount}\nError: ${insertError.message} (${insertError.code})\n\nCustomer paid but order NOT saved — deliver manually!`
    ).catch(() => {});
    return Response.json(
      { error: `Order could not be saved: ${insertError.message}. Screenshot this and contact support on WhatsApp.` },
      { status: 500 }
    );
  }

  if (isAssisted) {
    const { error: requestError } = await supabase.from("result_checker_requests").insert({
      order_reference: String(paymentRef), exam_type: vType, candidate_type: String(candidateType),
      candidate_name: String(candidateName).trim(), index_number: String(indexNumber).replace(/\s/g, ""),
      exam_year: year, date_of_birth: needsDob ? String(dateOfBirth) : null,
      whatsapp: normalizedWhatsApp, consented_at: new Date().toISOString(),
    });
    if (requestError) {
      await sendAdminAlert(`🚨 RESULT CHECKER DETAILS SAVE FAILED\nRef: ${paymentRef}\nIndex: ${indexNumber}\nWhatsApp: ${normalizedWhatsApp}\nCustomer paid GH₵25. Recover manually.`).catch(() => {});
      return Response.json({ error: "Payment was received, but the result-checking details need manual recovery. Contact support with your reference." }, { status: 500 });
    }
  }

  if (promoApplied) {
    const claimed = await claimVoucherDiscount(promoCodeStr, String(paymentRef));
    if (!claimed) {
      console.warn("[vouchers/create] Discount limit reached after checkout", {
        reference: String(paymentRef),
      });
    }
  }

  // Voucher order held for admin approval
  const voucherText = isAssisted
    ? `📋 <b>RESULT CHECKER SERVICE — APPROVE</b>\n${label} · GH₵25 total\nCandidate: ${candidateName}\nIndex: <code>${indexNumber}</code>\nYear: ${year}\nType: ${String(candidateType).toUpperCase()}\nWhatsApp: <code>${normalizedWhatsApp}</code>\n📎 <code>${paymentRef}</code>\n\nOn approval, a stored voucher and these details will be sent to you for manual checking.`
    : `🎟 <b>VOUCHER ORDER — APPROVE TO DELIVER</b>\n${label} x${qty}\n🎯 Source: <b>Guest / direct customer checkout</b>\n📞 <code>${phone}</code>\n💰 GH₵${chargedAmount.toFixed(2)}\n📎 <code>${paymentRef}</code>`;
  const alertPromise = sendNewOrderAlert(voucherText, orderApprovalKeyboard(String(paymentRef))).catch(() => {});

  // Await so Vercel doesn't kill the function before the SMS fetch completes
  const firstName = String(name).split(" ")[0] || "Customer";
  const shortRef = String(paymentRef).replace(/[^A-Z0-9]/gi, "").slice(-8).toUpperCase();
  const smsPromise = sendCustomerSMS(
    normalizedPhone,
    isAssisted
      ? `Hi ${firstName}! ${label} request received (Ref ${shortRef}). After approval, your result goes to your WhatsApp. - Elite Data`
      : `Hi ${firstName}! ${label} x${qty} order received (Ref ${shortRef}). Your voucher code${qty > 1 ? "s" : ""} will be sent shortly. - Elite Data`
  ).catch(() => {});

  await Promise.allSettled([alertPromise, smsPromise]);
  const autoApproval = await maybeAutoApprove(String(paymentRef));
  return Response.json({
    success: true,
    reference: paymentRef,
    pendingApproval: !autoApproval.ok,
    autoApproved: autoApproval.attempted && autoApproval.ok,
    autoApprovalMessage: autoApproval.message,
  });
}
