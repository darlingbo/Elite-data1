import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/apiKeyAuth";
import { supabase } from "@/lib/supabase";
import { bundles, type Network } from "@/lib/bundles";
import { fmtOrder, orderApprovalKeyboard, sendNewOrderAlert } from "@/lib/telegram";
import { addCurrency, percentageOf, roundCurrency, toMinorUnits } from "@/lib/finance";
import { maybeAutoApprove } from "@/lib/order-approval";

const PLATFORM_FEE_RATE = 0.02;

export async function POST(request: NextRequest) {
  const auth = await authenticateApiKey(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });

  const { name, email, phone, bundleId, paymentRef } = body as Record<string, string>;
  if (!name || !email || !phone || !bundleId || !paymentRef) {
    return NextResponse.json({ error: "Missing fields: name, email, phone, bundleId, paymentRef are required." }, { status: 400 });
  }

  // Idempotency
  const { data: existing } = await supabase
    .from("orders")
    .select("reference, status")
    .eq("reference", paymentRef)
    .maybeSingle();
  if (existing) return NextResponse.json({ success: true, reference: existing.reference, status: existing.status });

  // Resolve bundle
  const staticBundle = bundles.find((b) => b.id === bundleId);
  const { data: dbBundle } = await supabase
    .from("bundle_prices")
    .select("id, network, size_label, size_gb, price, cost_price")
    .eq("id", bundleId)
    .eq("active", true)
    .maybeSingle();

  const bundleMeta = dbBundle
    ? { id: dbBundle.id, network: dbBundle.network as Network, size: dbBundle.size_label ?? bundleId, sizeGB: dbBundle.size_gb ?? 1 }
    : staticBundle
    ? { id: staticBundle.id, network: staticBundle.network, size: staticBundle.size, sizeGB: staticBundle.sizeGB }
    : null;

  if (!bundleMeta) return NextResponse.json({ error: "Invalid bundleId." }, { status: 400 });

  const price = dbBundle?.price ?? staticBundle?.price ?? 0;
  const costPrice = dbBundle?.cost_price ?? staticBundle?.costPrice ?? 0;

  // Verify the Mobile Money payment (Yebeck) for this reference.
  const chargedAmount = addCurrency(Number(price), percentageOf(Number(price), PLATFORM_FEE_RATE));
  const expectedKobo = toMinorUnits(chargedAmount);
  let paid = false;
  try {
    const { verifyYebeckPayment } = await import("@/lib/payment-attempt");
    const ybk = await verifyYebeckPayment(String(paymentRef), "data_order");
    paid = ybk.status === "success" && ybk.attempt.amount_pesewas >= expectedKobo;
  } catch (err) {
    return NextResponse.json({ error: `Payment check unavailable: ${err instanceof Error ? err.message : String(err)}` }, { status: 502 });
  }
  if (!paid) {
    return NextResponse.json({ error: "Payment verification failed. Check paymentRef and amount." }, { status: 400 });
  }

  const profit = Math.max(0, roundCurrency(Number(price) - Number(costPrice)));

  // Save order
  const { error: dbErr } = await supabase.from("orders").insert({
    reference: paymentRef,
    paystack_reference: paymentRef,
    payment_method: "yebeck",
    customer_name: name,
    customer_email: email,
    phone,
    network: bundleMeta.network,
    bundle_size: bundleMeta.size,
    bundle_size_gb: bundleMeta.sizeGB,
    amount: chargedAmount,
    cost_price: costPrice,
    admin_commission: profit,
    agent_commission: 0,
    agent_id: null,
    status: "pending_approval",
  });
  if (dbErr) return NextResponse.json({ error: `DB error: ${dbErr.message}` }, { status: 500 });

  await sendNewOrderAlert(
    `🔌 <b>API ORDER — APPROVE TO DELIVER</b>\n\n` +
    fmtOrder({
      ref: paymentRef,
      network: bundleMeta.network,
      size: bundleMeta.size,
      phone,
      amount: chargedAmount,
      profit,
      sourceLabel: `API customer: ${auth.name}`,
    }),
    orderApprovalKeyboard(paymentRef),
  ).catch(() => {});

  const autoApproval = await maybeAutoApprove(paymentRef);
  return NextResponse.json({
    success: true,
    reference: paymentRef,
    status: autoApproval.ok ? "processing" : "pending_approval",
    message: autoApproval.ok ? "Payment verified. Order was approved automatically." : "Payment verified. Order is awaiting admin approval.",
  });
}
