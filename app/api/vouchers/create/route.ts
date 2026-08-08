import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendAdminAlert, sendNewOrderAlert, orderApprovalKeyboard } from "@/lib/telegram";
import { sendCustomerSMS } from "@/lib/sms";
import { maybeAutoApprove } from "@/lib/order-approval";
import { roundCurrency, toMinorUnits } from "@/lib/finance";
import { claimVoucherDiscount, getVoucherDiscountStatus } from "@/lib/voucherDiscount";

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
const AGENT_WHOLESALE_PRICE = 17;
const PAYSTACK_VERIFY_ATTEMPTS = 4;

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("233") ? `0${digits.slice(3)}` : digits;
}

async function verifyPaystackTransaction(reference: string): Promise<Record<string, unknown>> {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new Error("Payment verification is not configured.");

  let payload: Record<string, unknown> = {};
  for (let attempt = 1; attempt <= PAYSTACK_VERIFY_ATTEMPTS; attempt += 1) {
    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: { Authorization: `Bearer ${secret}` },
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      },
    );
    payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    const transaction = payload.data as Record<string, unknown> | undefined;
    if (payload.status === true && transaction?.status === "success") return payload;
    if (attempt < PAYSTACK_VERIFY_ATTEMPTS) {
      await new Promise(resolve => setTimeout(resolve, attempt * 750));
    }
  }
  return payload;
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

  const { name, email, phone, voucherType, quantity, paystackRef, promoCode, agentCode, serviceMode, candidateType, candidateName, indexNumber, confirmIndexNumber, examYear, dateOfBirth, whatsapp, consent } = body as Record<string, string | number | boolean>;
  const isAssisted = serviceMode === "assisted_result";
  const qty = isAssisted ? 1 : Math.max(1, Math.min(200, Number(quantity) || 1));

  if (!name || !email || !phone || !voucherType || !paystackRef) {
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

  const normalizedAgentCode = String(agentCode ?? "").trim().toUpperCase();
  const { data: sellingAgent } = normalizedAgentCode
    ? await supabase.from("agents").select("id,referral_code").eq("referral_code", normalizedAgentCode).eq("status", "approved").maybeSingle()
    : { data: null };
  const { data: customVoucherPrice } = sellingAgent
    ? await supabase.from("agent_voucher_prices").select("sell_price").eq("agent_id", sellingAgent.id).eq("voucher_type", vType).eq("active", true).maybeSingle()
    : { data: null };
  const isAgentSale = Boolean(sellingAgent);

  const promoApplied = !isAssisted && discountStatus.valid;

  // Bulk: qty > 10 → GH₵18. Promo code → GH₵18 regardless of qty.
  const effectiveSellPrice = isAgentSale
    ? Math.max(AGENT_WHOLESALE_PRICE, Number(customVoucherPrice?.sell_price ?? 18))
    : (qty > BULK_THRESHOLD || promoApplied) ? BULK_PRICE : vPrice.sellPrice;
  const totalSell = isAssisted ? 25 : roundCurrency(effectiveSellPrice * qty);
  const totalCost = roundCurrency((isAgentSale ? AGENT_WHOLESALE_PRICE : vPrice.costPrice) * qty);
  const chargedAmount = isAssisted ? 25 : roundCurrency(totalSell * (1 + PLATFORM_FEE_RATE));
  // Include the 2% platform fee in admin profit so stats match what was actually collected
  const agentProfit = isAgentSale && !isAssisted ? roundCurrency((effectiveSellPrice - AGENT_WHOLESALE_PRICE) * qty) : 0;
  const profit = roundCurrency(chargedAmount - totalCost - agentProfit);
  const expectedKobo = toMinorUnits(chargedAmount);

  // Phone blocklist check
  const { data: blocklistData } = await supabase
    .from("system_settings").select("value").eq("key", "phone_blocklist").maybeSingle();
  let blocklist: string[] = [];
  try { blocklist = JSON.parse(blocklistData?.value ?? "[]"); } catch { blocklist = []; }
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
    psData = await verifyPaystackTransaction(String(paystackRef));
  } catch (err) {
    console.error("[vouchers/create] Paystack verification unavailable", {
      reference: String(paystackRef),
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ error: `Paystack unreachable: ${err instanceof Error ? err.message : String(err)}` }, { status: 502 });
  }

  const txnData = psData.data as Record<string, unknown>;
  const paid = psData.status === true &&
    txnData?.status === "success" &&
    String(txnData?.currency ?? "").toUpperCase() === "GHS" &&
    Number(txnData?.amount ?? 0) >= expectedKobo;
  if (!paid) {
    const reason = txnData?.status !== "success"
      ? `Transaction status: ${txnData?.status}`
      : String(txnData?.currency ?? "").toUpperCase() !== "GHS"
        ? `Currency mismatch: ${txnData?.currency ?? "missing"}`
        : `Amount mismatch: paid ${txnData?.amount} pesewas, expected ${expectedKobo}`;
    console.warn("[vouchers/create] Payment not ready or invalid", {
      reference: String(paystackRef),
      status: txnData?.status,
      currency: txnData?.currency,
      paidAmount: txnData?.amount,
      expectedKobo,
    });
    await sendAdminAlert(`VOUCHER PAYMENT FAILED\nRef: ${paystackRef}\nReason: ${reason}`).catch(() => {});
    return Response.json({ error: `Payment verification failed — ${reason}.` }, { status: 400 });
  }

  const paymentMetadata = (txnData.metadata ?? {}) as Record<string, unknown>;
  const paymentFields = (paymentMetadata.custom_fields ?? []) as Array<Record<string, unknown>>;
  const paymentField = (key: string) => String(
    paymentFields.find(field => field.variable_name === key)?.value ?? "",
  );
  const paidPhone = normalizePhone(paymentField("phone"));
  const paidVoucher = paymentField("voucher");
  const paidVoucherType = (
    paymentField("voucher_type") ||
    paidVoucher.match(/^(BECE|WASSCE)/i)?.[1] ||
    ""
  ).toUpperCase();
  const paidQuantity = Number(
    paymentField("voucher_quantity") ||
    paidVoucher.match(/x(\d+)/i)?.[1] ||
    0
  );
  const paidServiceMode = paymentField("service_mode") || "voucher_only";
  const paidAgentCode = paymentField("agent_code").trim().toUpperCase();
  if (paidPhone !== normalizedPhone || paidVoucherType !== vType || paidQuantity !== qty || paidServiceMode !== (isAssisted ? "assisted_result" : "voucher_only") || paidAgentCode !== (isAgentSale ? normalizedAgentCode : "")) {
    console.warn("[vouchers/create] Payment metadata mismatch", {
      reference: String(paystackRef),
      paidVoucherType,
      requestedVoucherType: vType,
      paidQuantity,
      requestedQuantity: qty,
    });
    await sendAdminAlert(
      `⚠️ VOUCHER PAYMENT METADATA MISMATCH\nRef: ${paystackRef}\nPaid for: ${paidVoucherType || "missing"} x${paidQuantity || "missing"}\nRequested: ${vType} x${qty}\nNo order was created.`,
    ).catch(() => {});
    return Response.json(
      { error: "The paid voucher details do not match this order. Contact support with your payment reference." },
      { status: 409 },
    );
  }

  // Save order
  const { error: insertError } = await supabase.from("orders").insert({
    reference: String(paystackRef),
    paystack_reference: String(paystackRef),
    customer_name: String(name),
    customer_email: String(email),
    phone: normalizedPhone,
    network: "voucher",
    bundle_size: `${label}${isAssisted ? " Assisted Check" : ""} x${qty}`,
    bundle_size_gb: 0,
    amount: chargedAmount,
    cost_price: totalCost,
    admin_commission: profit,
    agent_commission: agentProfit,
    agent_id: sellingAgent?.id ?? null,
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

  if (isAssisted) {
    const { error: requestError } = await supabase.from("result_checker_requests").insert({
      order_reference: String(paystackRef), exam_type: vType, candidate_type: String(candidateType),
      candidate_name: String(candidateName).trim(), index_number: String(indexNumber).replace(/\s/g, ""),
      exam_year: year, date_of_birth: needsDob ? String(dateOfBirth) : null,
      whatsapp: normalizedWhatsApp, consented_at: new Date().toISOString(),
    });
    if (requestError) {
      await sendAdminAlert(`🚨 RESULT CHECKER DETAILS SAVE FAILED\nRef: ${paystackRef}\nIndex: ${indexNumber}\nWhatsApp: ${normalizedWhatsApp}\nCustomer paid GH₵25. Recover manually.`).catch(() => {});
      return Response.json({ error: "Payment was received, but the result-checking details need manual recovery. Contact support with your reference." }, { status: 500 });
    }
  }

  if (promoApplied && !isAgentSale) {
    const claimed = await claimVoucherDiscount(promoCodeStr, String(paystackRef));
    if (!claimed) {
      console.warn("[vouchers/create] Discount limit reached after checkout", {
        reference: String(paystackRef),
      });
    }
  }

  // Voucher order held for admin approval
  const voucherText = isAssisted
    ? `📋 <b>RESULT CHECKER SERVICE — APPROVE</b>\n${label} · GH₵25 total\nCandidate: ${candidateName}\nIndex: <code>${indexNumber}</code>\nYear: ${year}\nType: ${String(candidateType).toUpperCase()}\nWhatsApp: <code>${normalizedWhatsApp}</code>\n📎 <code>${paystackRef}</code>\n\nOn approval, a stored voucher and these details will be sent to you for manual checking.`
    : `🎟 <b>VOUCHER ORDER — APPROVE TO DELIVER</b>\n${label} x${qty}\n🎯 Source: <b>Guest / direct customer checkout</b>\n📞 <code>${phone}</code>\n💰 GH₵${chargedAmount.toFixed(2)}\n📎 <code>${paystackRef}</code>`;
  const alertPromise = sendNewOrderAlert(voucherText, orderApprovalKeyboard(String(paystackRef))).catch(() => {});

  // Await so Vercel doesn't kill the function before the SMS fetch completes
  const firstName = String(name).split(" ")[0] || "Customer";
  const shortRef = String(paystackRef).replace(/[^A-Z0-9]/gi, "").slice(-8).toUpperCase();
  const smsPromise = sendCustomerSMS(
    normalizedPhone,
    isAssisted
      ? `Hi ${firstName}! Your ${label} result-checking request (Ref: ${shortRef}) has been received. After approval, your result will be sent to your WhatsApp number.`
      : `Hi ${firstName}! Your ${label} x${qty} order (Ref: ${shortRef}) has been received. Your voucher codes will be sent to you shortly. Thank you for choosing Elite Data!`
  ).catch(() => {});

  await Promise.allSettled([alertPromise, smsPromise]);
  const autoApproval = await maybeAutoApprove(String(paystackRef));
  return Response.json({
    success: true,
    reference: paystackRef,
    pendingApproval: !autoApproval.ok,
    autoApproved: autoApproval.attempted && autoApproval.ok,
    autoApprovalMessage: autoApproval.message,
  });
}
