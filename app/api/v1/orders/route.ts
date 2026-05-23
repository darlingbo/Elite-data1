import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/apiKeyAuth";
import { supabase } from "@/lib/supabase";
import { bundles, networkApiName, type Network } from "@/lib/bundles";
import { sendAdminAlert } from "@/lib/telegram";

const PLATFORM_FEE_RATE = 0.02;

export async function POST(request: NextRequest) {
  const auth = await authenticateApiKey(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });

  const { name, email, phone, bundleId, paystackRef } = body as Record<string, string>;
  if (!name || !email || !phone || !bundleId || !paystackRef) {
    return NextResponse.json({ error: "Missing fields: name, email, phone, bundleId, paystackRef are required." }, { status: 400 });
  }

  // Idempotency
  const { data: existing } = await supabase
    .from("orders")
    .select("reference, status")
    .eq("reference", paystackRef)
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

  // Verify Paystack
  const expectedKobo = Math.round(price * (1 + PLATFORM_FEE_RATE) * 100);
  let psData: Record<string, unknown> = {};
  try {
    const psRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(paystackRef)}`,
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
    );
    psData = await psRes.json();
  } catch (err) {
    return NextResponse.json({ error: `Paystack unreachable: ${err instanceof Error ? err.message : String(err)}` }, { status: 502 });
  }

  const txnData = psData.data as Record<string, unknown>;
  const paid = psData.status === true && txnData?.status === "success" && Number(txnData?.amount ?? 0) >= expectedKobo;
  if (!paid) {
    return NextResponse.json({ error: "Payment verification failed. Check paystackRef and amount." }, { status: 400 });
  }

  const chargedAmount = parseFloat((price * (1 + PLATFORM_FEE_RATE)).toFixed(2));
  const profit = parseFloat((price - costPrice).toFixed(2));

  // Save order
  const { error: dbErr } = await supabase.from("orders").insert({
    reference: paystackRef,
    paystack_reference: paystackRef,
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
    status: "pending",
  });
  if (dbErr) return NextResponse.json({ error: `DB error: ${dbErr.message}` }, { status: 500 });

  await sendAdminAlert(`[API KEY] New order\nRef: ${paystackRef}\n${bundleMeta.network.toUpperCase()} ${bundleMeta.size}\nPhone: ${phone}`).catch(() => {});

  // Deliver via Inventor
  let inventorBody: Record<string, unknown> = {};
  let inventorOk = false;
  try {
    const invRes = await fetch(`${process.env.INVENTOR_API_BASE_URL}/api/developer/purchase`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.INVENTOR_API_KEY}` },
      body: JSON.stringify({ network: networkApiName[bundleMeta.network], Phone: phone, Datasize: bundleMeta.sizeGB, reference: paystackRef }),
    });
    inventorBody = await invRes.json().catch(() => ({}));
    inventorOk = invRes.ok || inventorBody.success === true || inventorBody.status === "success" || inventorBody.status === "00";
  } catch (err) {
    inventorBody = { error: String(err) };
  }

  const invData = (inventorBody.data as Record<string, unknown>) ?? {};
  const rawInvStatus = String(invData.status ?? invData.delivery_status ?? inventorBody.status ?? "").toLowerCase();
  const isProcessing = rawInvStatus.includes("process") || rawInvStatus.includes("progress") || rawInvStatus.includes("dispatch") || rawInvStatus.includes("pending");
  if (isProcessing) inventorOk = false;

  if (inventorOk) {
    await supabase.from("orders").update({ status: "completed" }).eq("reference", paystackRef);
    return NextResponse.json({ success: true, reference: paystackRef, status: "completed" });
  }
  if (isProcessing) {
    await supabase.from("orders").update({ status: "processing" }).eq("reference", paystackRef);
    return NextResponse.json({ success: true, reference: paystackRef, status: "processing" });
  }

  await supabase.from("orders").update({ status: "failed" }).eq("reference", paystackRef);
  return NextResponse.json({ success: false, reference: paystackRef, status: "failed", error: "Delivery failed. Contact support." }, { status: 502 });
}
