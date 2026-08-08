import { NextRequest } from "next/server";
import crypto from "crypto";
import { supabase } from "@/lib/supabase";
import { bundles, type Network } from "@/lib/bundles";
import { sendAdminAlert, sendNewOrderAlert, fmtOrder, orderApprovalKeyboard } from "@/lib/telegram";
import { maybeAutoApprove } from "@/lib/order-approval";
import { sendCustomerSMS, orderReceivedSMS } from "@/lib/sms";
import { resolveAgentCommissionRate } from "@/lib/commission";
import { fromMinorUnits, percentageOf, roundCurrency, subtractCurrency, toMinorUnits } from "@/lib/finance";
import { claimVoucherDiscount, getVoucherDiscountStatus } from "@/lib/voucherDiscount";

const VOUCHER_DEFAULTS: Record<string, { sellPrice: number; costPrice: number }> = {
  BECE: { sellPrice: 19, costPrice: 15 },
  WASSCE: { sellPrice: 19, costPrice: 15 },
};

function normalizeGhanaPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("233") ? `0${digits.slice(3)}` : digits;
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  // Verify Paystack signature
  const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
  if (!paystackSecret) {
    return Response.json({ error: "Webhook is not configured" }, { status: 503 });
  }
  const sig = request.headers.get("x-paystack-signature");
  const expected = crypto
    .createHmac("sha512", paystackSecret)
    .update(rawBody)
    .digest("hex");
  if (!sig || sig !== expected) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: Record<string, unknown>;
  try { event = JSON.parse(rawBody); } catch { return Response.json({ ok: true }); }

  // Only handle successful charges
  if (event.event !== "charge.success") return Response.json({ ok: true });

  const data = event.data as Record<string, unknown>;
  const reference = String(data.reference ?? "");
  if (!reference) return Response.json({ ok: true });

  // Idempotency — if already processed, skip
  const { data: existing } = await supabase
    .from("orders").select("reference, status").eq("reference", reference).maybeSingle();
  if (existing) {
    // The browser callback may have saved the order but stopped before reaching
    // auto-approval. The atomic approval claim makes this retry safe.
    if (existing.status === "pending_approval") await maybeAutoApprove(reference);
    return Response.json({ ok: true });
  }

  const amountKobo = Number(data.amount ?? 0);
  const chargedAmount = fromMinorUnits(amountKobo);
  const customer = data.customer as Record<string, string> ?? {};
  const meta = data.metadata as Record<string, unknown> ?? {};
  const fields = (meta.custom_fields as Array<Record<string, string>>) ?? [];
  const getField = (name: string) => fields.find(f => f.variable_name === name)?.value ?? "";

  const name = getField("name") || customer.first_name || "Customer";
  const phone = getField("phone") ?? "";
  const bundleId = getField("bundle_id") ?? "";
  const agentCode = getField("agent_code") ?? "";
  const email = customer.email ?? `${phone}@elitedata1.com`;

  // Voucher recovery path. The browser callback normally creates the order,
  // but this signed webhook is the reliable fallback if the customer closes
  // the page or loses connectivity immediately after payment.
  const voucherLabel = getField("voucher");
  const voucherType = (getField("voucher_type") || voucherLabel.match(/^(BECE|WASSCE)/i)?.[1] || "").toUpperCase();
  const voucherQuantity = Math.max(
    1,
    Math.min(200, Number(getField("voucher_quantity") || voucherLabel.match(/x(\d+)/i)?.[1] || 1)),
  );
  const isVoucherPayment = getField("purchase_kind") === "voucher" ||
    (!!voucherLabel && voucherType in VOUCHER_DEFAULTS);

  if (isVoucherPayment) {
    const normalizedPhone = normalizeGhanaPhone(phone);
    if (!/^0[2-5][0-9]{8}$/.test(normalizedPhone) || !(voucherType in VOUCHER_DEFAULTS)) {
      await sendAdminAlert(
        `⚠️ <b>Voucher webhook missing valid metadata</b>\nRef: <code>${reference}</code>\nAmount: GH₵${chargedAmount.toFixed(2)}\nPhone: ${phone || "missing"}`,
      ).catch(() => {});
      return Response.json({ ok: true });
    }

    const submittedCode = getField("promo_code").trim().toUpperCase();
    const [priceResult, discountStatus] = await Promise.all([
      supabase.from("system_settings").select("value").eq("key", "voucher_prices").maybeSingle(),
      getVoucherDiscountStatus(submittedCode),
    ]);
    let voucherPrices = VOUCHER_DEFAULTS;
    try {
      if (priceResult.data?.value) {
        voucherPrices = JSON.parse(priceResult.data.value) as typeof VOUCHER_DEFAULTS;
      }
    } catch {
      // Safe defaults keep signed paid webhooks recoverable.
    }
    const configured = voucherPrices[voucherType] ?? VOUCHER_DEFAULTS[voucherType];
    const normalizedAgentCode = agentCode.trim().toUpperCase();
    const { data: sellingAgent } = normalizedAgentCode
      ? await supabase.from("agents").select("id").eq("referral_code", normalizedAgentCode).eq("status", "approved").maybeSingle()
      : { data: null };
    const { data: customVoucherPrice } = sellingAgent
      ? await supabase.from("agent_voucher_prices").select("sell_price").eq("agent_id", sellingAgent.id).eq("voucher_type", voucherType).eq("active", true).maybeSingle()
      : { data: null };
    const discounted = !sellingAgent && (voucherQuantity > 10 || discountStatus.valid);
    const unitPrice = sellingAgent ? Math.max(17, Number(customVoucherPrice?.sell_price ?? 18)) : discounted ? 18 : Number(configured.sellPrice);
    const expectedAmount = roundCurrency(unitPrice * voucherQuantity * 1.02);

    if (amountKobo < toMinorUnits(expectedAmount)) {
      await sendAdminAlert(
        `⚠️ <b>Voucher webhook blocked: underpaid</b>\nRef: <code>${reference}</code>\nPaid: GH₵${chargedAmount.toFixed(2)}\nExpected: GH₵${expectedAmount.toFixed(2)}`,
      ).catch(() => {});
      return Response.json({ ok: true });
    }

    const voucherName = voucherType === "BECE" ? "BECE Result Checker" : "WASSCE Result Checker";
    const totalCost = roundCurrency((sellingAgent ? 17 : Number(configured.costPrice)) * voucherQuantity);
    const agentProfit = sellingAgent ? roundCurrency((unitPrice - 17) * voucherQuantity) : 0;
    const { error: voucherInsertError } = await supabase.from("orders").insert({
      reference,
      paystack_reference: reference,
      customer_name: name,
      customer_email: email,
      phone: normalizedPhone,
      network: "voucher",
      bundle_size: `${voucherName} x${voucherQuantity}`,
      bundle_size_gb: 0,
      amount: chargedAmount,
      cost_price: totalCost,
      admin_commission: roundCurrency(chargedAmount - totalCost - agentProfit),
      agent_commission: agentProfit,
      agent_id: sellingAgent?.id ?? null,
      status: "pending_approval",
    });
    if (voucherInsertError) {
      await sendAdminAlert(
        `🚨 <b>PAID VOUCHER WEBHOOK SAVE FAILED</b>\nRef: <code>${reference}</code>\nError: ${voucherInsertError.message}`,
      ).catch(() => {});
      return Response.json({ ok: true });
    }

    if (!sellingAgent && discountStatus.valid) {
      await claimVoucherDiscount(submittedCode, reference);
    }

    await sendNewOrderAlert(
      `🎟 <b>VOUCHER ORDER RECOVERED FROM PAYSTACK</b>\n${voucherName} x${voucherQuantity}\n📞 <code>${normalizedPhone}</code>\n💰 GH₵${chargedAmount.toFixed(2)}\n📎 <code>${reference}</code>`,
      orderApprovalKeyboard(reference),
    ).catch(() => {});
    sendCustomerSMS(
      normalizedPhone,
      orderReceivedSMS(name, "voucher", `${voucherName} x${voucherQuantity}`, normalizedPhone, reference),
    ).catch(() => {});
    // Use the same approval switch as every other order. When automatic
    // approval is off, the voucher remains pending_approval for the admin;
    // when it is on, the shared atomic approval flow handles delivery.
    await maybeAutoApprove(reference);
    return Response.json({ ok: true });
  }

  if (!phone || !bundleId) {
    await sendAdminAlert(
      `⚠️ <b>Webhook: Payment with missing data</b>\nRef: <code>${reference}</code>\nAmount: GH₵${chargedAmount}\nPhone: ${phone || "missing"}\nBundle ID: ${bundleId || "missing"}\n\nCheck Paystack dashboard and deliver manually if needed.`
    ).catch(() => {});
    return Response.json({ ok: true });
  }

  // Resolve bundle
  const staticBundle = bundles.find(b => b.id === bundleId);
  const { data: dbBundle } = await supabase
    .from("bundle_prices")
    .select("id, network, size_label, size_gb, price, cost_price")
    .eq("id", bundleId).eq("active", true).maybeSingle();

  const network = (dbBundle?.network ?? staticBundle?.network) as Network | undefined;
  const costPrice = roundCurrency(Number(dbBundle?.cost_price ?? staticBundle?.costPrice ?? 0));
  const sellingPrice = Number(dbBundle?.price ?? staticBundle?.price ?? 0);
  const bundleSize = dbBundle?.size_label ?? staticBundle?.size ?? bundleId;
  const sizeGB = dbBundle?.size_gb ?? staticBundle?.sizeGB ?? 1;

  if (!network) {
    await sendAdminAlert(
      `⚠️ <b>Webhook: Unknown bundle</b>\nRef: <code>${reference}</code>\nBundle ID: ${bundleId}\nPhone: ${phone}\nAmount: GH₵${chargedAmount}\n\nDeliver manually.`
    ).catch(() => {});
    return Response.json({ ok: true });
  }

  // Never trust the amount or bundle embedded in webhook metadata. The current
  // server-side catalog remains the source of truth.
  if (sellingPrice <= 0 || chargedAmount + 0.01 < sellingPrice * 0.8) {
    await sendAdminAlert(
      `⚠️ <b>Webhook blocked: underpaid order</b>\nRef: <code>${reference}</code>\nPaid: GH₵${chargedAmount.toFixed(2)}\nExpected: GH₵${sellingPrice.toFixed(2)}\n\nNo order was created.`
    ).catch(() => {});
    return Response.json({ ok: true });
  }

  // Resolve agent
  let agentId: string | null = null;
  let agentName: string | undefined;
  let agentCommission = 0;
  let adminCommission = Math.max(0, subtractCurrency(chargedAmount, costPrice));

  if (agentCode) {
    const { data: agent } = await supabase
      .from("agents").select("id, name, agent_type")
      .eq("referral_code", agentCode.toUpperCase()).eq("status", "approved").maybeSingle();
    if (agent) {
      agentId = agent.id;
      agentName = agent.name;
      if (agent.agent_type === "custom_price") {
        // Use admin tier price as wallet deduction, not Inventor cost
        const { data: tierRow } = await supabase.from("custom_tier_prices").select("price").eq("bundle_id", bundleId).maybeSingle();
        const adminTierPrice = tierRow?.price ? Number(tierRow.price) : costPrice;
        agentCommission = Math.max(0, subtractCurrency(chargedAmount, adminTierPrice));
        adminCommission = Math.max(0, subtractCurrency(adminTierPrice, costPrice));
        // Wallet accounting happens once, after admin approval.
      } else {
        const profit = Math.max(0, subtractCurrency(chargedAmount, costPrice));
        const agentRate = await resolveAgentCommissionRate(agent.id);
        agentCommission = percentageOf(profit, agentRate);
        adminCommission = subtractCurrency(profit, agentCommission);
      }
    }
  }

  // Save order as pending_approval — do not call Inventor until admin approves
  const { error: insertError } = await supabase.from("orders").insert({
    reference,
    paystack_reference: reference,
    customer_name: name,
    customer_email: email,
    phone,
    network,
    bundle_size: bundleSize,
    bundle_size_gb: sizeGB,
    amount: chargedAmount,
    cost_price: costPrice,
    admin_commission: adminCommission,
    agent_commission: agentCommission,
    agent_id: agentId,
    status: "pending_approval",
  });
  if (insertError) {
    await sendAdminAlert(
      `🚨 <b>PAID WEBHOOK ORDER SAVE FAILED</b>\nRef: <code>${reference}</code>\nError: ${insertError.message}`,
    ).catch(() => {});
    return Response.json({ ok: true });
  }

  const sourceLabel = agentName
    ? `Agent sale by ${agentName} (agent storefront)`
    : "Guest / direct customer checkout";
  const orderText =
    `🔔 <b>WEBHOOK ORDER — APPROVE TO DELIVER</b>\n\n` +
    fmtOrder({
      ref: reference,
      network,
      size: bundleSize,
      phone,
      amount: chargedAmount,
      profit: roundCurrency(agentCommission + adminCommission),
      agentName,
      sourceLabel,
    });
  await sendNewOrderAlert(orderText, orderApprovalKeyboard(reference)).catch(() => {});

  sendCustomerSMS(phone, orderReceivedSMS(name, network, bundleSize, phone, reference)).catch(() => {});

  await maybeAutoApprove(reference);
  return Response.json({ ok: true });
}
