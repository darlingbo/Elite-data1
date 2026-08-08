import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { randomBytes } from "crypto";
import { addCurrency, formatCurrency, percentageOf, toMinorUnits } from "@/lib/finance";
import { sendFinancialTransactionAlert, tgEscape } from "@/lib/telegram";

const PACKAGES: Record<string, { images: number; price: number; label: string }> = {
  starter:  { images: 5,  price: 5,  label: "Starter (5 images)" },
  standard: { images: 15, price: 12, label: "Standard (15 images)" },
  pro:      { images: 35, price: 25, label: "Pro (35 images)" },
};

const PLATFORM_FEE_RATE = 0.02;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return Response.json({ error: "Invalid request." }, { status: 400 });

  const { packageId, paystackRef, email } = body as Record<string, string>;
  const pkg = PACKAGES[packageId];
  if (!pkg) return Response.json({ error: "Invalid package." }, { status: 400 });
  if (!paystackRef || !email) return Response.json({ error: "Missing paystackRef or email." }, { status: 400 });

  // Idempotency
  const { data: existing } = await supabase
    .from("image_credits")
    .select("token, credits_remaining")
    .eq("paystack_ref", paystackRef)
    .maybeSingle();
  if (existing) return Response.json({ token: existing.token, credits: existing.credits_remaining });

  // Verify Paystack
  const chargedAmount = addCurrency(pkg.price, percentageOf(pkg.price, PLATFORM_FEE_RATE));
  const expectedKobo = toMinorUnits(chargedAmount);
  let psData: Record<string, unknown> = {};
  try {
    const psRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(paystackRef)}`,
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
    );
    psData = await psRes.json();
  } catch {
    return Response.json({ error: "Could not reach Paystack." }, { status: 502 });
  }

  const txn = psData.data as Record<string, unknown>;
  const paid = psData.status === true && txn?.status === "success" && Number(txn?.amount ?? 0) >= expectedKobo;
  if (!paid) return Response.json({ error: "Payment verification failed." }, { status: 400 });

  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

  const { error } = await supabase.from("image_credits").insert({
    token,
    email,
    paystack_ref: paystackRef,
    package_id: packageId,
    package_label: pkg.label,
    credits_total: pkg.images,
    credits_remaining: pkg.images,
    credits_used: 0,
    expires_at: expiresAt,
  });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  await sendFinancialTransactionAlert(
    `🎨 <b>AI IMAGE CREDIT PURCHASE</b>\n\n` +
    `👤 Customer: <code>${tgEscape(email)}</code>\n` +
    `📦 Package: <b>${tgEscape(pkg.label)}</b>\n` +
    `💵 Amount paid: <b>${formatCurrency(chargedAmount)}</b>\n` +
    `🔢 Credits added: <b>${pkg.images}</b>\n` +
    `📎 Paystack ref: <code>${tgEscape(paystackRef)}</code>\n` +
    `✅ Purpose: AI image generation credits`,
  ).catch(() => {});
  return Response.json({ token, credits: pkg.images });
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return Response.json({ error: "Token required." }, { status: 400 });

  const { data } = await supabase
    .from("image_credits")
    .select("credits_remaining, credits_used, credits_total, package_label, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (!data) return Response.json({ error: "Invalid token." }, { status: 404 });

  const expired = data.expires_at && new Date(data.expires_at) < new Date();
  if (expired) return Response.json({ error: "This credit session has expired." }, { status: 410 });

  return Response.json({ credits: data.credits_remaining, used: data.credits_used, total: data.credits_total, package: data.package_label });
}
