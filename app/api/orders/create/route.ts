import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { bundles, networkApiName } from "@/lib/bundles";
import { sendAdminAlert, sendAdminBotMessage, fmtOrder, fmtDelivered, fmtFailed, retryKeyboard } from "@/lib/telegram";

async function getEffectivePrice(bundleId: string): Promise<{ price: number; costPrice: number } | null> {
  const { data } = await supabase
    .from("bundle_prices")
    .select("price, cost_price")
    .eq("id", bundleId)
    .eq("active", true)
    .maybeSingle();

  if (data) return { price: data.price, costPrice: data.cost_price };

  const b = bundles.find((b) => b.id === bundleId);
  return b ? { price: b.price, costPrice: b.costPrice } : null;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, email, phone, bundleId, paystackRef, agentCode } = body;

  if (!name || !email || !phone || !bundleId || !paystackRef) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  const bundleMeta = bundles.find((b) => b.id === bundleId);
  if (!bundleMeta) {
    return Response.json({ error: "Invalid bundle" }, { status: 400 });
  }

  // Idempotency check
  const { data: existing } = await supabase
    .from("orders")
    .select("reference, status")
    .eq("paystack_reference", paystackRef)
    .maybeSingle();

  if (existing) {
    return Response.json({ success: true, reference: existing.reference, status: existing.status });
  }

  // Get current prices (admin may have overridden them)
  const pricing = await getEffectivePrice(bundleId);
  if (!pricing) {
    return Response.json({ error: "Bundle pricing not found" }, { status: 400 });
  }

  // Verify Paystack payment
  const psRes = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(paystackRef)}`,
    { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
  );
  const psData = await psRes.json();

  const paid =
    psData.status === true &&
    psData.data?.status === "success" &&
    psData.data?.amount === Math.round(pricing.price * 100);

  if (!paid) {
    return Response.json({ error: "Payment verification failed" }, { status: 400 });
  }

  // Resolve agent if referral code provided
  let agentId: string | null = null;
  let agentName: string | undefined;

  if (agentCode) {
    const { data: agent } = await supabase
      .from("agents")
      .select("id, name, status")
      .eq("referral_code", agentCode.toUpperCase())
      .eq("status", "approved")
      .maybeSingle();

    if (agent) {
      agentId = agent.id;
      agentName = agent.name;
    }
  }

  // Commission calculation
  const profit = pricing.price - pricing.costPrice;
  const agentCommission = agentId ? parseFloat((profit * 0.8).toFixed(2)) : 0;
  const adminCommission = agentId
    ? parseFloat((profit * 0.2).toFixed(2))
    : parseFloat(profit.toFixed(2));

  // Save order as PENDING
  const { error: insertError } = await supabase.from("orders").insert({
    reference: paystackRef,
    paystack_reference: paystackRef,
    customer_name: name,
    customer_email: email,
    phone,
    network: bundleMeta.network,
    bundle_size: bundleMeta.size,
    bundle_size_gb: bundleMeta.sizeGB,
    amount: pricing.price,
    cost_price: pricing.costPrice,
    admin_commission: adminCommission,
    agent_commission: agentCommission,
    agent_id: agentId,
    status: "PENDING",
  });

  if (insertError) {
    return Response.json({ error: "Failed to save order" }, { status: 500 });
  }

  // Notify admin via Telegram
  await sendAdminAlert(fmtOrder({
    ref: paystackRef,
    network: bundleMeta.network,
    size: bundleMeta.size,
    phone,
    amount: pricing.price,
    profit,
    agentName,
  }));

  // Call Inventor DataHub
  let inventorData: { success: boolean; data?: { order?: { id?: string } } } = { success: false };

  try {
    const invRes = await fetch(
      `${process.env.INVENTOR_API_BASE_URL}/api/developer/purchase`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.INVENTOR_API_KEY}`,
        },
        body: JSON.stringify({
          network: networkApiName[bundleMeta.network],
          Phone: phone,
          Datasize: bundleMeta.sizeGB,
          reference: paystackRef,
        }),
      }
    );
    inventorData = await invRes.json();
  } catch {
    // Network failure — mark FAILED
  }

  if (inventorData.success) {
    await supabase
      .from("orders")
      .update({
        status: "PROCESSING",
        inventor_order_id: inventorData.data?.order?.id ?? null,
      })
      .eq("reference", paystackRef);

    // Update agent balance and stats
    if (agentId) {
      await supabase.rpc("increment_agent_stats", {
        p_agent_id: agentId,
        p_commission: agentCommission,
        p_revenue: pricing.price,   // ignored if your function doesn't update total_revenue
      });
    }

    await sendAdminAlert(fmtDelivered(paystackRef, phone, bundleMeta.network, bundleMeta.size));

    return Response.json({ success: true, reference: paystackRef, status: "PROCESSING" });
  } else {
    await supabase
      .from("orders")
      .update({ status: "FAILED" })
      .eq("reference", paystackRef);

    const failMsg = fmtFailed(paystackRef, phone, bundleMeta.network, bundleMeta.size, pricing.price);
    await sendAdminAlert(failMsg);
    await sendAdminBotMessage(failMsg, retryKeyboard(paystackRef));

    return Response.json({ error: "Bundle delivery failed. Support has been notified." }, { status: 502 });
  }
}
