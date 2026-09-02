import crypto from "crypto";
import { NextRequest } from "next/server";
import { rateLimitDb } from "@/lib/rate-limit";
import { supabase } from "@/lib/supabase";
import { bundles } from "@/lib/bundles";
import { percentageOf, roundCurrency } from "@/lib/finance";
import { calculateExpectedOrderCharge } from "@/lib/payment-validation";
import { getSurcharge } from "@/lib/surcharge";

const PROVIDERS = new Set(["mtn", "vod", "atl"]);

function normalizePhone(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.startsWith("233") ? `0${digits.slice(3)}` : digits;
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (await rateLimitDb(`momo-charge:${ip}`, 6, 60_000)) {
    return Response.json({ error: "Too many payment attempts. Please wait a moment." }, { status: 429 });
  }

  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return Response.json({ error: "Payment service is not configured." }, { status: 503 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const customerPhone = normalizePhone(body.phone);
  const paymentPhone = normalizePhone(body.paymentPhone);
  const provider = String(body.provider ?? "").toLowerCase();
  const bundleId = String(body.bundleId ?? "");
  const name = String(body.name ?? "").trim().slice(0, 100);
  const agentCode = String(body.agentCode ?? "").trim().toUpperCase();

  if (!name || !bundleId || !/^0[2-5][0-9]{8}$/.test(customerPhone) || !/^0[2-5][0-9]{8}$/.test(paymentPhone)) {
    return Response.json({ error: "Enter valid customer and Mobile Money details." }, { status: 400 });
  }
  if (!PROVIDERS.has(provider)) {
    return Response.json({ error: "Invalid payment request." }, { status: 400 });
  }

  let subaccount: string | null = null;
  let agentId: string | null = null;
  if (agentCode) {
    const { data: agent } = await supabase
      .from("agents")
      .select("id, paystack_subaccount_code")
      .eq("referral_code", agentCode)
      .eq("status", "approved")
      .maybeSingle();
    subaccount = (agent as { paystack_subaccount_code?: string | null } | null)?.paystack_subaccount_code ?? null;
    agentId = (agent as { id?: string } | null)?.id ?? null;
  }

  const staticBundle = bundles.find(bundle => bundle.id === bundleId);
  const { data: dbBundle } = await supabase
    .from("bundle_prices")
    .select("price")
    .eq("id", bundleId)
    .eq("active", true)
    .maybeSingle();
  let sellingPrice = Number(dbBundle?.price ?? staticBundle?.price ?? 0);
  if (agentId) {
    const { data: agentPrice } = await supabase
      .from("agent_bundle_prices")
      .select("custom_price")
      .eq("agent_id", agentId)
      .eq("bundle_id", bundleId)
      .eq("active", true)
      .maybeSingle();
    const customPrice = Number(agentPrice?.custom_price);
    if (Number.isFinite(customPrice) && customPrice > 0) sellingPrice = customPrice;
  }
  if (!Number.isFinite(sellingPrice) || sellingPrice < 1) {
    return Response.json({ error: "This bundle is not available for payment." }, { status: 400 });
  }

  const promoCode = String(body.promoCode ?? "").trim().toUpperCase();
  const [creditResult, promoResult, surcharge] = await Promise.all([
    body.applyReferralCredit
      ? supabase.from("referral_credits").select("credit_ghc").eq("phone", customerPhone).eq("used", false).order("created_at", { ascending: true }).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
    promoCode
      ? supabase.from("promo_codes").select("discount_type,discount_value,max_uses,used_count,expires_at,active").eq("code", promoCode).eq("active", true).maybeSingle()
      : Promise.resolve({ data: null }),
    getSurcharge(customerPhone),
  ]);
  const promo = promoResult.data;
  const baseCheckoutAmount = roundCurrency(sellingPrice * 1.02);
  const promoValid = Boolean(
    promo && promo.active !== false &&
    (!promo.expires_at || new Date(promo.expires_at) >= new Date()) &&
    (promo.max_uses == null || Number(promo.used_count ?? 0) < Number(promo.max_uses)),
  );
  const promoDiscount = !promoValid ? 0 : promo?.discount_type === "percent"
    ? percentageOf(baseCheckoutAmount, Number(promo?.discount_value ?? 0) / 100)
    : Math.min(roundCurrency(Number(promo?.discount_value ?? 0)), baseCheckoutAmount);
  const amount = calculateExpectedOrderCharge({
    sellingPrice,
    referralCredit: Number(creditResult.data?.credit_ghc ?? 0),
    promoDiscount,
    surcharge,
    fastDelivery: body.fastDelivery === true,
  });

  const reference = `elite-momo-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const metadata = {
    custom_fields: [
      { display_name: "Customer Name", variable_name: "name", value: name },
      { display_name: "Phone Number", variable_name: "phone", value: customerPhone },
      { display_name: "Bundle ID", variable_name: "bundle_id", value: bundleId },
      { display_name: "Agent Code", variable_name: "agent_code", value: agentCode },
      { display_name: "Promo Code", variable_name: "promo_code", value: String(body.promoCode ?? "") },
      { display_name: "Referral Credit", variable_name: "apply_referral_credit", value: body.applyReferralCredit ? "1" : "0" },
      { display_name: "Fast Delivery", variable_name: "fast_delivery", value: body.fastDelivery ? "1" : "0" },
    ],
  };

  try {
    const response = await fetch("https://api.paystack.co/charge", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `${customerPhone}@elitedata1.com`,
        amount: Math.round(amount * 100),
        currency: "GHS",
        reference,
        mobile_money: { phone: paymentPhone, provider },
        metadata,
        ...(subaccount ? { subaccount, bearer: "account" } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const result = await response.json().catch(() => ({})) as Record<string, unknown>;
    const data = (result.data ?? {}) as Record<string, unknown>;
    if (!response.ok || result.status !== true) {
      return Response.json({ error: String(result.message ?? "Mobile Money charge could not be started.") }, { status: 502 });
    }
    return Response.json({
      success: true,
      reference,
      status: String(data.status ?? "pending"),
      message: String(data.display_text ?? result.message ?? "Approve the payment prompt on your phone."),
    });
  } catch {
    return Response.json({ error: "Could not reach the payment service. Please try again." }, { status: 502 });
  }
}

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (await rateLimitDb(`momo-verify:${ip}`, 30, 60_000)) {
    return Response.json({ error: "Too many status checks." }, { status: 429 });
  }
  const secret = process.env.PAYSTACK_SECRET_KEY;
  const reference = request.nextUrl.searchParams.get("reference") ?? "";
  if (!secret || !/^elite-momo-[A-Za-z0-9-]+$/.test(reference)) {
    return Response.json({ error: "Invalid payment reference." }, { status: 400 });
  }

  try {
    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    const result = await response.json().catch(() => ({})) as Record<string, unknown>;
    const data = (result.data ?? {}) as Record<string, unknown>;
    return Response.json({ status: String(data.status ?? "pending") });
  } catch {
    return Response.json({ status: "pending" });
  }
}
