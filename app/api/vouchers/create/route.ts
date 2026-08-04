import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendAdminAlert } from "@/lib/telegram";
import { sendCustomerSMS } from "@/lib/sms";

const PLATFORM_FEE_RATE = 0.02;
const VOUCHER_LABELS: Record<string, string> = {
  BECE: "BECE Result Checker",
  WASSCE: "WASSCE Result Checker",
};
const DEFAULT_PRICES: Record<string, { sellPrice: number; costPrice: number }> = {
  BECE: { sellPrice: 19, costPrice: 15 },
  WASSCE: { sellPrice: 19, costPrice: 15 },
};
const BULK_THRESHOLD = 10;
const BULK_PRICE = 18;

async function getVoucherDiscountCode(): Promise<string> {
  try {
    const { data } = await supabase.from("system_settings").select("value").eq("key", "voucher_discount_code").maybeSingle();
    return String(data?.value ?? "").trim();
  } catch { return ""; }
}

async function getVoucherPrices() {
  try {
    const { data } = await supabase.from("system_settings").select("value").eq("key", "voucher_prices").maybeSingle();
    return data?.value ? JSON.parse(data.value) as Record<string, { sellPrice: number; costPrice: number }> : DEFAULT_PRICES;
  } catch { return DEFAULT_PRICES; }
}

function normalizePhone(value: string) {
  return value.trim().replace(/\s/g, "").replace(/^\+233/, "0").replace(/^233/, "0");
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

  const [prices, validDiscountCode] = await Promise.all([getVoucherPrices(), getVoucherDiscountCode()]);
  const vPrice = prices[vType] ?? DEFAULT_PRICES[vType];
  const promo = String(promoCode ?? "").trim();
  const promoApplied = Boolean(promo && validDiscountCode && promo === validDiscountCode);
  const effectiveSellPrice = qty > BULK_THRESHOLD || promoApplied ? BULK_PRICE : vPrice.sellPrice;
  const totalSell = effectiveSellPrice * qty;
  const totalCost = vPrice.costPrice * qty;
  const chargedAmount = Number((totalSell * (1 + PLATFORM_FEE_RATE)).toFixed(2));
  const profit = Number((chargedAmount - totalCost).toFixed(2));
  const expectedKobo = Math.round(chargedAmount * 100);
  const reference = String(paystackRef);

  const { data: blocklistData } = await supabase.from("system_settings").select("value").eq("key", "phone_blocklist").maybeSingle();
  let blocklist: string[] = [];
  try { blocklist = JSON.parse(blocklistData?.value ?? "[]"); } catch { blocklist = []; }
  if (blocklist.some(item => normalizePhone(item) === normalizePhone(String(phone)))) {
    await sendAdminAlert(`🚫 BLOCKED VOUCHER ATTEMPT\nPhone: ${phone}\nVoucher: ${label} x${qty}\nRef: ${reference}`).catch(() => {});
    return Response.json({ error: "This number cannot place voucher orders." }, { status: 403 });
  }

  const { data: existing } = await supabase.from("orders").select("reference,status").eq("reference", reference).maybeSingle();
  if (existing) {
    const { data: existingCodes } = await supabase.from("voucher_inventory").select("code").eq("order_reference", reference).order("id");
    return Response.json({
      success: true,
      reference,
      status: existing.status,
      voucherCodes: (existingCodes ?? []).map(row => row.code),
    });
  }

  let verification: Record<string, unknown>;
  try {
    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
      cache: "no-store",
    });
    verification = await response.json();
  } catch (error) {
    return Response.json({ error: `Paystack unreachable: ${error instanceof Error ? error.message : String(error)}` }, { status: 502 });
  }

  const transaction = verification.data as Record<string, unknown> | undefined;
  const paid = verification.status === true && transaction?.status === "success" && Number(transaction?.amount ?? 0) >= expectedKobo;
  if (!paid) return Response.json({ error: "Payment verification failed." }, { status: 400 });

  const { error: insertError } = await supabase.from("orders").insert({
    reference,
    paystack_reference: reference,
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
    status: "processing",
  });
  if (insertError) return Response.json({ error: `Order could not be saved: ${insertError.message}` }, { status: 500 });

  const { data: assigned, error: assignError } = await supabase.rpc("assign_vouchers_from_inventory", {
    p_voucher_type: vType,
    p_quantity: qty,
    p_order_reference: reference,
  });

  if (assignError || !assigned || assigned.length !== qty) {
    await supabase.from("orders").update({ status: "pending_approval" }).eq("reference", reference);
    await sendAdminAlert(`⚠️ VOUCHER STOCK ATTENTION\n${label} x${qty}\nPhone: ${phone}\nRef: ${reference}\nPayment verified, but stored stock could not be assigned. Please review manually.`).catch(() => {});
    await sendCustomerSMS(String(phone), `Your ${label} order was received, but stock needs admin attention. Ref: ${reference.slice(-8).toUpperCase()}. You will not be charged twice.`);
    return Response.json({ success: true, reference, pendingApproval: true, error: "Stored voucher stock needs admin attention." });
  }

  const codes = assigned.map((row: { code: string }) => row.code);
  const firstName = String(name).split(" ")[0] || "Customer";
  const codeText = codes.map((code: string, index: number) => `${index + 1}. ${code}`).join("\n");
  await sendCustomerSMS(String(phone), `Hi ${firstName}! Your ${label} voucher${qty > 1 ? "s" : ""}:\n${codeText}\nRef: ${reference.slice(-8).toUpperCase()}\nThank you for choosing Elite Data.`);

  const now = new Date().toISOString();
  await Promise.all([
    supabase.from("voucher_inventory").update({ status: "sent", sent_at: now }).eq("order_reference", reference),
    supabase.from("orders").update({ status: "completed", completed_at: now }).eq("reference", reference),
  ]);

  await sendAdminAlert(`✅ STORED VOUCHER DELIVERED\n${label} x${qty}\nPhone: ${phone}\nRef: ${reference}\nInventory delivery used — no external voucher API.`).catch(() => {});
  return Response.json({ success: true, reference, status: "completed", voucherCodes: codes, automaticInventoryDelivery: true });
}
