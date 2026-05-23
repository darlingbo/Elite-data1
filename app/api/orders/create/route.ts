import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { bundles, networkApiName, type Network } from "@/lib/bundles";
import { sendAdminAlert, sendAdminBotMessage, fmtOrder, fmtDelivered, fmtFailed, retryKeyboard } from "@/lib/telegram";

const PLATFORM_FEE_RATE = 0.02;
const LOYALTY_WINDOW_HOURS = 7;
const LOYALTY_REQUIRED = 4;

type BundleMeta = { id: string; network: Network; size: string; sizeGB: number };

async function resolveBundleMeta(bundleId: string): Promise<BundleMeta | null> {
  const staticBundle = bundles.find((b) => b.id === bundleId);
  if (staticBundle) return staticBundle;

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
  const { error: e1 } = await supabase.from("orders").insert(fields);
  if (!e1) return { error: false };

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

  const bare = {
    reference: fields.reference,
    phone: fields.phone,
    amount: fields.amount,
    status: String(fields.status).toLowerCase(),
  };
  const { error: e3 } = await supabase.from("orders").insert(bare);
  if (!e3) return { error: false };

  return {
    error: true,
    message: `T1: ${e1.message} (${e1.code}) | T2: ${e2.message} (${e2.code}) | T3: ${e3.message} (${e3.code})`,
  };
}

async function deliverFreeBundle(phone: string, network: string, triggerRef: string): Promise<void> {
  const networkApiMap: Record<string, string> = {
    mtn: "MTN", telecel: "TELECEL", airteltigo: "AT ISHARE",
  };
  try {
    await fetch(`${process.env.INVENTOR_API_BASE_URL}/api/developer/purchase`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.INVENTOR_API_KEY}` },
      body: JSON.stringify({
        network: networkApiMap[network] ?? "MTN",
        Phone: phone,
        Datasize: 1,
        reference: `loyalty-reward-${triggerRef}`,
      }),
    });
  } catch {
    await sendAdminAlert(
      `🎁 LOYALTY REWARD DELIVERY FAILED\nPhone: ${phone}\nNetwork: ${network.toUpperCase()}\nTrigger: ${triggerRef}\n\nPlease deliver 1GB manually.`
    ).catch(() => {});
  }
}

async function processLoyalty(
  phone: string,
  network: string,
  reference: string
): Promise<{ count: number; total: number; windowEndsAt: string | null; rewardEarned: boolean }> {
  const now = new Date();

  try {
    const { data: session } = await supabase
      .from("loyalty_sessions")
      .select("id, bundle_count, window_end")
      .eq("phone", phone)
      .eq("rewarded", false)
      .gt("window_end", now.toISOString())
      .order("window_start", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (session) {
      const newCount = session.bundle_count + 1;
      const rewardEarned = newCount >= LOYALTY_REQUIRED;

      await supabase
        .from("loyalty_sessions")
        .update({
          bundle_count: newCount,
          ...(rewardEarned
            ? { rewarded: true, reward_reference: reference, reward_network: network }
            : {}),
        })
        .eq("id", session.id);

      if (rewardEarned) {
        deliverFreeBundle(phone, network, reference).catch(() => {});
        await sendAdminAlert(
          `🎁 LOYALTY REWARD EARNED\nPhone: ${phone}\nNetwork: ${network.toUpperCase()}\n4 bundles purchased within 7h window — delivering free 1GB.`
        ).catch(() => {});
      }

      return { count: newCount, total: LOYALTY_REQUIRED, windowEndsAt: session.window_end, rewardEarned };
    }

    // No active session — start a new one
    const windowEnd = new Date(now.getTime() + LOYALTY_WINDOW_HOURS * 60 * 60 * 1000);
    await supabase.from("loyalty_sessions").insert({
      phone,
      window_start: now.toISOString(),
      window_end: windowEnd.toISOString(),
      bundle_count: 1,
    });

    return { count: 1, total: LOYALTY_REQUIRED, windowEndsAt: windowEnd.toISOString(), rewardEarned: false };
  } catch {
    return { count: 0, total: LOYALTY_REQUIRED, windowEndsAt: null, rewardEarned: false };
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, email, phone, bundleId, paystackRef, agentCode, applyReferralCredit, referralVia } = body;

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

  // Resolve agent
  let agentId: string | null = null;
  let agentName: string | undefined;
  let agentType: string = "commission";
  if (agentCode) {
    const { data: agent } = await supabase
      .from("agents")
      .select("id, name, status, agent_type")
      .eq("referral_code", agentCode.toUpperCase())
      .eq("status", "approved")
      .maybeSingle();
    if (agent) { agentId = agent.id; agentName = agent.name; agentType = agent.agent_type ?? "commission"; }
  }

  // For custom_price agents: use their personal markup price
  let effectivePrice = pricing.price;
  let tierPrice = pricing.price;
  if (agentId && agentType === "custom_price") {
    const { data: tier } = await supabase
      .from("custom_tier_prices")
      .select("price")
      .eq("bundle_id", bundleId)
      .maybeSingle();
    if (tier?.price) tierPrice = Number(tier.price);

    const { data: agentPrice } = await supabase
      .from("agent_bundle_prices")
      .select("custom_price")
      .eq("agent_id", agentId)
      .eq("bundle_id", bundleId)
      .eq("active", true)
      .maybeSingle();
    effectivePrice = agentPrice?.custom_price ? Number(agentPrice.custom_price) : tierPrice;
  }

  // Referral credit — server independently verifies (don't trust client claim alone)
  let creditAmount = 0;
  let referralCreditId: string | null = null;
  if (applyReferralCredit && phone) {
    try {
      const { data: credit } = await supabase
        .from("referral_credits")
        .select("id, credit_ghc")
        .eq("phone", phone)
        .eq("used", false)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (credit) {
        creditAmount = Number(credit.credit_ghc);
        referralCreditId = credit.id;
      }
    } catch {
      // fail gracefully — no credit applied
    }
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

  const baseTotal = effectivePrice * (1 + PLATFORM_FEE_RATE);
  const expectedKobo = Math.round((baseTotal - creditAmount) * 100);
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

  const chargedAmount = parseFloat((baseTotal - creditAmount).toFixed(2));
  let agentCommission: number;
  let adminCommission: number;
  if (!agentId) {
    agentCommission = 0;
    adminCommission = parseFloat((pricing.price - pricing.costPrice).toFixed(2));
  } else if (agentType === "custom_price") {
    agentCommission = parseFloat(Math.max(0, effectivePrice - tierPrice).toFixed(2));
    adminCommission = parseFloat(Math.max(0, tierPrice - pricing.costPrice).toFixed(2));
  } else {
    const profit = effectivePrice - pricing.costPrice;
    agentCommission = parseFloat((profit * 0.8).toFixed(2));
    adminCommission = parseFloat((profit * 0.2).toFixed(2));
  }
  const profit = agentCommission + adminCommission;

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
    status: "pending",
  });

  if (saved.error) {
    const dbErrMsg = `ORDER SAVE FAILED\nRef: ${paystackRef}\nPhone: ${phone}\nBundle: ${bundleId}\nError: ${saved.message}`;
    await sendAdminAlert(dbErrMsg).catch(() => {});
    return Response.json({
      error: `Order could not be saved: ${saved.message}. Screenshot this and contact support on WhatsApp.`,
    }, { status: 500 });
  }

  await sendAdminAlert(fmtOrder({ ref: paystackRef, network: bundleMeta.network, size: bundleMeta.size, phone, amount: chargedAmount, profit, agentName }));

  // Mark referral credit as used (fire and forget)
  if (referralCreditId) {
    supabase
      .from("referral_credits")
      .update({ used: true, used_at: new Date().toISOString(), used_on_reference: paystackRef })
      .eq("id", referralCreditId)
      .eq("used", false)
      .then(() => {});
  }

  // Award referral credit to the person who shared the link (fire and forget)
  const safeVia = typeof referralVia === "string" ? referralVia.trim() : "";
  if (safeVia && safeVia !== phone) {
    supabase
      .from("referral_credits")
      .insert({ phone: safeVia, credit_ghc: 1, from_phone: phone })
      .then(() => {});
  }

  // Deliver bundle via Inventor DataHub
  let inventorBody: Record<string, unknown> = {};
  let inventorOk = false;
  let inventorHttpStatus = 0;
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
    inventorHttpStatus = invRes.status;
    inventorBody = await invRes.json().catch(() => ({}));
    inventorOk =
      invRes.ok ||
      inventorBody.success === true ||
      inventorBody.status === "success" ||
      inventorBody.status === "00" ||
      (typeof inventorBody.status === "number" && inventorBody.status >= 200 && inventorBody.status < 300);
  } catch (err) {
    inventorBody = { error: String(err) };
  }

  const inventorLog = `Inventor HTTP ${inventorHttpStatus}: ${JSON.stringify(inventorBody).slice(0, 300)}`;

  const invData = (inventorBody.data as Record<string, unknown>) ?? {};
  // Inventor nests order details inside data.order
  const invOrderData = (invData.order as Record<string, unknown>) ?? {};
  const invPlanData = (invOrderData.plan as Record<string, unknown>) ?? {};

  // Correctly read status from nested data.order.status
  const rawInvStatus = String(
    invOrderData.status ?? invData.status ?? invData.delivery_status ?? inventorBody.status ?? ""
  ).toLowerCase();

  // Use Inventor's real plan name so labels are always correct (our DB label may differ).
  // Strip the network prefix (e.g. "MTN ") since formatters add it separately.
  const inventorPlanName = (invPlanData.name as string) ?? null;
  const actualSize = inventorPlanName
    ? inventorPlanName.replace(new RegExp(`^${bundleMeta.network}\\s+`, "i"), "").trim()
    : bundleMeta.size;

  const invIsProcessing =
    rawInvStatus.includes("process") ||
    rawInvStatus.includes("progress") ||
    rawInvStatus.includes("dispatch") ||
    rawInvStatus.includes("pending");

  if (invIsProcessing) inventorOk = false;

  // Process loyalty (await to include in response)
  const loyalty = await processLoyalty(phone, bundleMeta.network, paystackRef);

  if (inventorOk) {
    const orderId: string | null =
      (invOrderData.id as string) ??
      (invData.id as string) ??
      (inventorBody.orderId as string) ??
      null;

    await supabase.from("orders").update({
      status: "completed",
      inventor_order_id: orderId ?? null,
      bundle_size: actualSize,
    }).eq("reference", paystackRef);

    if (agentId) {
      await supabase.rpc("increment_agent_stats", {
        p_agent_id: agentId,
        p_commission: agentCommission,
        p_revenue: pricing.price,
      }).maybeSingle();
    }

    await sendAdminAlert(`${fmtDelivered(paystackRef, phone, bundleMeta.network, actualSize)}\n${inventorLog}`);
    // Auto-log API deduction for this order
    supabase.from("api_ledger").insert({
      type: "deduction",
      amount: pricing.costPrice,
      note: `${bundleMeta.network.toUpperCase()} ${actualSize} → ${phone}`,
      order_reference: paystackRef,
    }).then(() => {});
    return Response.json({ success: true, reference: paystackRef, status: "COMPLETED", loyalty });
  }

  if (invIsProcessing) {
    await supabase.from("orders").update({
      status: "processing",
      bundle_size: actualSize,
    }).eq("reference", paystackRef);
    await sendAdminAlert(`⏳ ORDER PROCESSING\nRef: ${paystackRef}\nPhone: ${phone}\n${bundleMeta.network.toUpperCase()} ${actualSize}\n${inventorLog}`);
    supabase.from("api_ledger").insert({
      type: "deduction",
      amount: pricing.costPrice,
      note: `${bundleMeta.network.toUpperCase()} ${actualSize} → ${phone} (processing)`,
      order_reference: paystackRef,
    }).then(() => {});
    return Response.json({ success: true, reference: paystackRef, status: "PROCESSING", loyalty });
  }

  await supabase.from("orders").update({ status: "failed" }).eq("reference", paystackRef);

  const failMsg = `${fmtFailed(paystackRef, phone, bundleMeta.network, bundleMeta.size, pricing.price)}\n\n${inventorLog}`;
  await sendAdminAlert(failMsg);
  await sendAdminBotMessage(failMsg, retryKeyboard(paystackRef));

  return Response.json({ error: "Bundle delivery failed. Support has been notified. You will be refunded." }, { status: 502 });
}
