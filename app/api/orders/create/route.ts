import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { bundles, networkApiName, type Network } from "@/lib/bundles";
import { sendAdminAlert, sendAdminBotMessage, fmtOrder, fmtDelivered, fmtFailed, retryKeyboard } from "@/lib/telegram";

const PLATFORM_FEE_RATE = 0.02;

type BundleMeta = { id: string; network: Network; size: string; sizeGB: number };

async function resolveBundleMeta(bundleId: string): Promise<BundleMeta | null> {
  // Check static bundles first
  const staticBundle = bundles.find((b) => b.id === bundleId);
  if (staticBundle) return staticBundle;

  // Fall back to custom bundles in bundle_prices
  const { data } = await supabase
    .from("bundle_prices")
    .select("id, network, size_label, size_gb")
    .eq("id", bundleId)
    .eq("active", true)
    .maybeSingle();

  if (!data?.network) return null;

  return {
    id: data.id,
    network: data.network as Network,
    size: data.size_label ?? bundleId,
    sizeGB: data.size_gb ?? 1,
  };
}

async function getEffectiveBundle(bundleId: string): Promise<{ price: number; costPrice: number; sizeGB: number } | null> {
  const b = bundles.find((b) => b.id === bundleId);

  const { data, error } = await supabase
    .from("bundle_prices")
    .select("price, cost_price, size_gb")
    .eq("id", bundleId)
    .eq("active", true)
    .maybeSingle();

  if (!error && data) {
    return { price: data.price, costPrice: data.cost_price, sizeGB: data.size_gb ?? (b?.sizeGB ?? 1) };
  }

  // Fallback without size_gb column
  const { data: data2 } = await supabase
    .from("bundle_prices")
    .select("price, cost_price")
    .eq("id", bundleId)
    .eq("active", true)
    .maybeSingle();

  if (data2) {
    return { price: data2.price, costPrice: data2.cost_price, sizeGB: b?.sizeGB ?? 1 };
  }

  if (b) return { price: b.price, costPrice: b.costPrice, sizeGB: b.sizeGB };
  return null;
}

async function saveOrder(fields: Record<string, unknown>): Promise<{ error: boolean; message?: string }> {
  // Tier 1: full insert
  const { error: e1 } = await supabase.from("orders").insert(fields);
  if (!e1) return { error: false };

  // Tier 2: only columns confirmed to exist (matches admin stats query)
  const minimal = {
    reference: fields.reference,
    customer_name: fields.customer_name,
    phone: fields.phone,
    network: fields.network,
    bundle_size: fields.bundle_size,
    amount: fields.amount,
    cost_price: fields.cost_price,
    admin_commission: fields.admin_commission,
    agent_commission: fields.agent_commission,
    agent_id: fields.agent_id,
    status: fields.status,
  };
  const { error: e2 } = await supabase.from("orders").insert(minimal);
  if (!e2) return { error: false };

  // Tier 3: bare minimum
  const bare = {
    reference: fields.reference,
    phone: fields.phone,
    network: fields.network,
    amount: fields.amount,
    status: fields.status,
  };
  const { error: e3 } = await supabase.from("orders").insert(bare);
  if (!e3) return { error: false };

  return {
    error: true,
    message: `T1: ${e1.message} (${e1.code}) | T2: ${e2.message} (${e2.code}) | T3: ${e3.message} (${e3.code})`,
  };
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, email, phone, bundleId, paystackRef, agentCode } = body;

  if (!name || !email || !phone || !bundleId || !paystackRef) {
    return Response.json({ error: "Missing required fields." }, { status: 400 });
  }

  const bundleMeta = await resolveBundleMeta(bundleId);
  if (!bundleMeta) {
    return Response.json({ error: "Invalid bundle." }, { status: 400 });
  }

  // Idempotency — don't process the same Paystack ref twice
  const { data: existing } = await supabase
    .from("orders")
    .select("reference, status")
    .eq("reference", paystackRef)
    .maybeSingle();

  if (existing) {
    return Response.json({ success: true, reference: existing.reference, status: existing.status });
  }

  const pricing = await getEffectiveBundle(bundleId);
  if (!pricing) {
    return Response.json({ error: "Bundle not found." }, { status: 400 });
  }

  // Verify Paystack payment
  if (!process.env.PAYSTACK_SECRET_KEY) {
    return Response.json({ error: "PAYSTACK_SECRET_KEY is not set in Vercel environment variables. Add it and redeploy." }, { status: 500 });
  }

  let psData: Record<string, unknown> = {};
  try {
    const psRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(paystackRef)}`,
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
    );
    psData = await psRes.json();
  } catch (err) {
    return Response.json({ error: `Could not reach Paystack API: ${err instanceof Error ? err.message : String(err)}` }, { status: 502 });
  }

  const expectedKobo = Math.round(pricing.price * (1 + PLATFORM_FEE_RATE) * 100);
  const txnStatus = (psData.data as Record<string, unknown>)?.status;
  const txnAmount = Number((psData.data as Record<string, unknown>)?.amount ?? 0);
  const paid =
    psData.status === true &&
    txnStatus === "success" &&
    txnAmount >= expectedKobo;

  if (!paid) {
    const reason = !process.env.PAYSTACK_SECRET_KEY
      ? "Secret key missing"
      : psData.status !== true
      ? `Paystack API error: ${psData.message ?? "unknown"}`
      : txnStatus !== "success"
      ? `Transaction status: ${txnStatus}`
      : `Amount mismatch: paid ${txnAmount} pesewas, expected ${expectedKobo}`;
    await sendAdminAlert(`PAYMENT VERIFY FAILED\nRef: ${paystackRef}\nReason: ${reason}`).catch(() => {});
    return Response.json({ error: `Payment verification failed — ${reason}. Contact support on WhatsApp.` }, { status: 400 });
  }

  // Resolve agent
  let agentId: string | null = null;
  let agentName: string | undefined;
  if (agentCode) {
    const { data: agent } = await supabase
      .from("agents")
      .select("id, name, status")
      .eq("referral_code", agentCode.toUpperCase())
      .eq("status", "approved")
      .maybeSingle();
    if (agent) { agentId = agent.id; agentName = agent.name; }
  }

  const chargedAmount = parseFloat((pricing.price * (1 + PLATFORM_FEE_RATE)).toFixed(2));
  const profit = pricing.price - pricing.costPrice;
  const agentCommission = agentId ? parseFloat((profit * 0.8).toFixed(2)) : 0;
  const adminCommission = agentId ? parseFloat((profit * 0.2).toFixed(2)) : parseFloat(profit.toFixed(2));

  const saved = await saveOrder({
    reference: paystackRef,
    paystack_reference: paystackRef,
    customer_name: name,
    customer_email: email,
    phone,
    network: bundleMeta.network,
    bundle_size: bundleMeta.size,
    bundle_size_gb: bundleMeta.sizeGB,
    amount: chargedAmount,
    cost_price: pricing.costPrice,
    admin_commission: adminCommission,
    agent_commission: agentCommission,
    agent_id: agentId,
    status: "PENDING",
  });

  if (saved.error) {
    const dbErrMsg = `ORDER SAVE FAILED\nRef: ${paystackRef}\nPhone: ${phone}\nBundle: ${bundleId}\nError: ${saved.message}`;
    await sendAdminAlert(dbErrMsg).catch(() => {});
    return Response.json({
      error: `Order could not be saved: ${saved.message}. Screenshot this and contact support on WhatsApp.`,
    }, { status: 500 });
  }

  await sendAdminAlert(fmtOrder({ ref: paystackRef, network: bundleMeta.network, size: bundleMeta.size, phone, amount: chargedAmount, profit, agentName }));

  // Deliver bundle via Inventor DataHub
  let inventorData: { success: boolean; data?: { order?: { id?: string } } } = { success: false };
  try {
    const invRes = await fetch(`${process.env.INVENTOR_API_BASE_URL}/api/developer/purchase`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.INVENTOR_API_KEY}` },
      body: JSON.stringify({
        network: networkApiName[bundleMeta.network],
        Phone: phone,
        Datasize: pricing.sizeGB,
        reference: paystackRef,
      }),
    });
    inventorData = await invRes.json();
  } catch { /* network failure */ }

  if (inventorData.success) {
    await supabase.from("orders").update({
      status: "COMPLETED",
      inventor_order_id: inventorData.data?.order?.id ?? null,
    }).eq("reference", paystackRef);

    if (agentId) {
      await supabase.rpc("increment_agent_stats", {
        p_agent_id: agentId,
        p_commission: agentCommission,
        p_revenue: pricing.price,
      }).maybeSingle();
    }

    await sendAdminAlert(fmtDelivered(paystackRef, phone, bundleMeta.network, bundleMeta.size));
    return Response.json({ success: true, reference: paystackRef, status: "COMPLETED" });
  }

  await supabase.from("orders").update({ status: "FAILED" }).eq("reference", paystackRef);

  const failMsg = fmtFailed(paystackRef, phone, bundleMeta.network, bundleMeta.size, pricing.price);
  await sendAdminAlert(failMsg);
  await sendAdminBotMessage(failMsg, retryKeyboard(paystackRef));

  return Response.json({ error: "Bundle delivery failed. Support has been notified. You will be refunded." }, { status: 502 });
}
