import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/apiKeyAuth";
import { supabase } from "@/lib/supabase";
import { bundles, networkApiName, type Network } from "@/lib/bundles";

// API price = costPrice * 1.06 (admin earns 6% markup over cost on every API order)
function apiPrice(costPrice: number): number {
  return parseFloat((costPrice * 1.06).toFixed(2));
}

const NET_MAP: Record<string, Network> = {
  mtn: "mtn", MTN: "mtn",
  telecel: "telecel", TELECEL: "telecel",
  airteltigo: "airteltigo", AIRTELTIGO: "airteltigo",
  "at ishare": "airteltigo", "AT ISHARE": "airteltigo",
  airtel: "airteltigo", tigo: "airteltigo",
};

export async function POST(request: NextRequest) {
  const auth = await authenticateApiKey(request);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ success: false, error: "Invalid JSON body." }, { status: 400 });

  const { network: rawNetwork, phone, datasize, reference } = body as Record<string, unknown>;

  if (!rawNetwork || !phone || !datasize || !reference) {
    return NextResponse.json({
      success: false,
      error: "Missing required fields: network, phone, datasize, reference",
    }, { status: 400 });
  }

  const network = NET_MAP[String(rawNetwork).trim()];
  if (!network) {
    return NextResponse.json({
      success: false,
      error: `Unknown network "${rawNetwork}". Use: MTN, TELECEL, or AIRTELTIGO`,
    }, { status: 400 });
  }

  const sizeGB = Number(datasize);
  if (!sizeGB || sizeGB <= 0) {
    return NextResponse.json({ success: false, error: "datasize must be a positive number (in GB)." }, { status: 400 });
  }

  const ref = String(reference).trim();
  if (!ref) return NextResponse.json({ success: false, error: "reference is required." }, { status: 400 });

  // Idempotency — already processed?
  const { data: existing } = await supabase.from("orders").select("reference, status").eq("reference", ref).maybeSingle();
  if (existing) {
    return NextResponse.json({ success: true, reference: existing.reference, status: existing.status, message: "Order already exists." });
  }

  // Find matching bundle
  const staticBundle = bundles.find(b => b.network === network && b.sizeGB === sizeGB);
  const { data: dbBundle } = await supabase
    .from("bundle_prices")
    .select("id, network, size_label, size_gb, cost_price, active")
    .eq("network", network)
    .eq("size_gb", sizeGB)
    .eq("active", true)
    .maybeSingle();

  const costPrice = dbBundle?.cost_price ?? staticBundle?.costPrice;
  const sizeLabel = dbBundle?.size_label ?? staticBundle?.size ?? `${sizeGB}GB`;

  if (!costPrice) {
    return NextResponse.json({
      success: false,
      error: `No bundle found for ${String(rawNetwork).toUpperCase()} ${sizeGB}GB. Use GET /api/v1/bundles to see available options.`,
    }, { status: 404 });
  }

  const price = apiPrice(costPrice);

  // Check wallet balance
  if (auth.walletBalance < price) {
    return NextResponse.json({
      success: false,
      error: `Insufficient wallet balance. Required: GH₵${price.toFixed(2)}, Available: GH₵${auth.walletBalance.toFixed(2)}. Top up your wallet to continue.`,
      balance: auth.walletBalance,
      required: price,
    }, { status: 402 });
  }

  // Deduct from wallet atomically
  const newBalance = parseFloat((auth.walletBalance - price).toFixed(2));
  const { error: deductErr } = await supabase
    .from("api_keys")
    .update({ wallet_balance: newBalance })
    .eq("id", auth.keyId)
    .gte("wallet_balance", price); // safety: only deduct if still enough

  if (deductErr) {
    return NextResponse.json({ success: false, error: "Failed to deduct wallet balance. Try again." }, { status: 500 });
  }

  // Log wallet transaction
  await supabase.from("api_wallet_transactions").insert({
    api_key_id: auth.keyId,
    type: "debit",
    amount: price,
    description: `${String(rawNetwork).toUpperCase()} ${sizeLabel} → ${String(phone)}`,
    reference: ref,
    balance_after: newBalance,
  });

  // Save order to DB
  const profit = parseFloat((price - costPrice).toFixed(2));
  await supabase.from("orders").insert({
    reference: ref,
    customer_name: `API: ${auth.name}`,
    phone: String(phone),
    network,
    bundle_size: sizeLabel,
    bundle_size_gb: sizeGB,
    amount: price,
    cost_price: costPrice,
    admin_commission: profit,
    agent_commission: 0,
    status: "pending",
  });

  // Deliver via Inventor
  let deliveryOk = false;
  let deliveryStatus = "failed";
  let inventorError = "";

  try {
    const invRes = await fetch(`${process.env.INVENTOR_API_BASE_URL}/api/developer/purchase`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.INVENTOR_API_KEY}` },
      body: JSON.stringify({
        network: networkApiName[network],
        Phone: String(phone),
        Datasize: sizeGB,
        reference: ref,
      }),
      signal: AbortSignal.timeout(20000),
    });

    const invBody = await invRes.json().catch(() => ({})) as Record<string, unknown>;
    const invData = (invBody.data as Record<string, unknown>) ?? {};
    const rawStatus = String(invData.status ?? invBody.status ?? "").toLowerCase();

    const isCompleted = invRes.ok && (
      rawStatus.includes("complet") || rawStatus.includes("success") ||
      rawStatus.includes("deliver") || rawStatus === "00" ||
      invBody.success === true
    );
    const isProcessing = rawStatus.includes("process") || rawStatus.includes("progress") ||
      rawStatus.includes("dispatch") || rawStatus.includes("pending");

    if (isCompleted) { deliveryOk = true; deliveryStatus = "completed"; }
    else if (isProcessing) { deliveryOk = true; deliveryStatus = "processing"; }
    else if (!invRes.ok) { inventorError = JSON.stringify(invBody).slice(0, 200); }

  } catch (e) {
    inventorError = String(e);
  }

  await supabase.from("orders").update({ status: deliveryStatus }).eq("reference", ref);

  if (!deliveryOk) {
    // Refund wallet on delivery failure
    await supabase.from("api_keys").update({ wallet_balance: auth.walletBalance }).eq("id", auth.keyId);
    await supabase.from("api_wallet_transactions").insert({
      api_key_id: auth.keyId,
      type: "credit",
      amount: price,
      description: `Refund: delivery failed for ${ref}`,
      reference: ref,
      balance_after: auth.walletBalance,
    });
    await supabase.from("orders").update({ status: "failed" }).eq("reference", ref);

    return NextResponse.json({
      success: false,
      reference: ref,
      status: "failed",
      error: "Delivery failed. Wallet refunded. " + (inventorError ? `Details: ${inventorError}` : "Try again or contact support."),
    }, { status: 502 });
  }

  return NextResponse.json({
    success: true,
    reference: ref,
    status: deliveryStatus,
    network: String(rawNetwork).toUpperCase(),
    phone: String(phone),
    datasize: `${sizeGB}GB`,
    amount_charged: price,
    wallet_balance: newBalance,
  });
}
