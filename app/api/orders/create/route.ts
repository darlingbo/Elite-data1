import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { bundles, networkApiName, sizeLabel, type Network } from "@/lib/bundles";
import { sendAdminAlert, sendAdminBotMessage, sendAgentNotification, fmtOrder, fmtDelivered, fmtFailed, retryKeyboard } from "@/lib/telegram";

const PLATFORM_FEE_RATE = 0.02;
const LOYALTY_WINDOW_HOURS = 7;
const LOYALTY_REQUIRED = 4;

// Inventor must respond within this time — if not, order stays "pending" for monitor to pick up
const INVENTOR_TIMEOUT_MS = 7_000;

type BundleMeta = { id: string; network: Network; size: string; sizeGB: number };
type BundlePricing = { price: number; costPrice: number; sizeGB: number };
type BundleInfo = { meta: BundleMeta; pricing: BundlePricing } | null;

// Extract a numeric GB value from a label like "4GB" or "500MB"
function parseSizeGbFromLabel(label: string | null | undefined): number | null {
  if (!label) return null;
  const gb = label.match(/^(\d+(?:\.\d+)?)\s*GB$/i);
  if (gb) return parseFloat(gb[1]);
  const mb = label.match(/^(\d+(?:\.\d+)?)\s*MB$/i);
  if (mb) return parseFloat(mb[1]) / 1000;
  return null;
}

// ─── OPTIMISATION 1: single DB round-trip for both meta + pricing ────────────
async function getBundleInfo(bundleId: string): Promise<BundleInfo> {
  // Check static bundles first (no DB needed)
  const staticBundle = bundles.find((b) => b.id === bundleId);

  const { data } = await supabase
    .from("bundle_prices")
    .select("id, network, size_label, size_gb, price, cost_price")
    .eq("id", bundleId)
    .eq("active", true)
    .maybeSingle();

  if (data) {
    // network is null for default bundles (implied by ID) — fall back to static
    const network = (data.network as Network | null) ?? staticBundle?.network;
    if (network) {
      const sizeGB = data.size_gb ?? parseSizeGbFromLabel(data.size_label) ?? staticBundle?.sizeGB ?? 1;
      const size = data.size_label ?? (data.size_gb != null ? sizeLabel(sizeGB) : (staticBundle?.size ?? bundleId));
      return {
        meta: { id: data.id, network, size, sizeGB },
        pricing: { price: data.price, costPrice: data.cost_price, sizeGB },
      };
    }
  }

  // Fall back to static bundle
  if (staticBundle) {
    return {
      meta: staticBundle,
      pricing: { price: staticBundle.price, costPrice: staticBundle.costPrice, sizeGB: staticBundle.sizeGB },
    };
  }

  return null;
}

async function saveOrder(fields: Record<string, unknown>): Promise<{ error: boolean; partial?: string; message?: string }> {
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
  if (!e2) return { error: false, partial: `T1 failed: ${e1.message} (${e1.code})` };

  // T2.5 — if agent_id FK constraint is the culprit, save without it but keep all other fields
  const isAgentFk = e1.message.includes("agent_id_fkey") || e2.message.includes("agent_id_fkey");
  if (isAgentFk && fields.agent_id) {
    const withoutAgent = {
      reference: fields.reference,
      customer_name: fields.customer_name,
      phone: fields.phone,
      network: fields.network,
      bundle_size: fields.bundle_size,
      amount: fields.amount,
      cost_price: fields.cost_price,
      admin_commission: fields.admin_commission,
      agent_commission: fields.agent_commission,
      status: fields.status,
    };
    const { error: e25 } = await supabase.from("orders").insert(withoutAgent);
    if (!e25) return { error: false, partial: `agent_id FK constraint — saved without agent_id link. Fix: ALTER TABLE orders DROP CONSTRAINT orders_agent_id_fkey; ALTER TABLE orders ADD CONSTRAINT orders_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL;` };
  }

  // T3 — keep network, bundle_size, customer_name so the record is usable
  const bare = {
    reference: fields.reference,
    customer_name: fields.customer_name ?? null,
    phone: fields.phone,
    network: fields.network ?? null,
    bundle_size: fields.bundle_size ?? null,
    amount: fields.amount,
    status: String(fields.status).toLowerCase(),
  };
  const { error: e3 } = await supabase.from("orders").insert(bare);
  if (!e3) return { error: false, partial: `T1+T2 failed: ${e1.message} | ${e2.message}` };

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

// Inventor API call — single attempt with tight timeout
// If it doesn't respond in time, order stays "pending" and the monitor delivers it
async function callInventorAPI(
  payload: Record<string, unknown>
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INVENTOR_TIMEOUT_MS);

  try {
    const res = await fetch(`${process.env.INVENTOR_API_BASE_URL}/api/developer/purchase`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.INVENTOR_API_KEY}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timer);
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, status: 0, body: { error: String(err) } };
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, email, phone, bundleId, paystackRef, agentCode, applyReferralCredit, referralVia } = body;

  if (!name || !email || !phone || !bundleId || !paystackRef) {
    return Response.json({ error: "Missing required fields." }, { status: 400 });
  }

  // ─── OPTIMISATION 1: one DB call instead of two ─────────────────────────
  const bundleInfo = await getBundleInfo(bundleId);
  if (!bundleInfo) {
    return Response.json({ error: "Invalid bundle." }, { status: 400 });
  }
  const { meta: bundleMeta, pricing } = bundleInfo;

  // ─── OPTIMISATION 3: run idempotency check + agent lookup + referral
  //     credit lookup all at the same time instead of one-by-one ──────────
  const [existingResult, agentResult, creditResult, commissionGlobalResult] = await Promise.all([
    // Idempotency — don't process the same Paystack ref twice
    supabase
      .from("orders")
      .select("reference, status")
      .eq("reference", paystackRef)
      .maybeSingle(),

    // Agent lookup (only if agentCode supplied, otherwise resolve to null)
    agentCode
      ? supabase
          .from("agents")
          .select("id, name, status, agent_type, telegram_chat_id")
          .eq("referral_code", agentCode.toUpperCase())
          .eq("status", "approved")
          .maybeSingle()
      : Promise.resolve({ data: null }),

    // Referral credit (only if requested)
    applyReferralCredit && phone
      ? supabase
          .from("referral_credits")
          .select("id, credit_ghc")
          .eq("phone", phone)
          .eq("used", false)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),

    // Global commission setting
    supabase
      .from("commission_settings")
      .select("agent_pct")
      .eq("id", "global")
      .maybeSingle(),
  ]);

  if (existingResult.data) {
    return Response.json({
      success: true,
      reference: existingResult.data.reference,
      status: existingResult.data.status,
    });
  }

  // Resolve agent
  let agentId: string | null = null;
  let agentName: string | undefined;
  let agentType: string = "commission";
  let agentTelegramChatId: string | null = null;
  const agent = agentResult.data;
  if (agent) {
    agentId = agent.id;
    agentName = agent.name;
    agentType = agent.agent_type ?? "commission";
    agentTelegramChatId = (agent as { telegram_chat_id?: string | null }).telegram_chat_id ?? null;
  }

  // Referral credit
  let creditAmount = 0;
  let referralCreditId: string | null = null;
  const credit = creditResult.data;
  if (credit) {
    creditAmount = Number(credit.credit_ghc);
    referralCreditId = credit.id;
  }

  // For custom_price agents: fetch their personal markup price
  let tierPrice = pricing.price;
  if (agentId && agentType === "custom_price") {
    // These two are independent — run in parallel
    const [tierResult, agentPriceResult] = await Promise.all([
      supabase
        .from("custom_tier_prices")
        .select("price")
        .eq("bundle_id", bundleId)
        .maybeSingle(),
      supabase
        .from("agent_bundle_prices")
        .select("custom_price")
        .eq("agent_id", agentId)
        .eq("bundle_id", bundleId)
        .eq("active", true)
        .maybeSingle(),
    ]);

    if (tierResult.data?.price) tierPrice = Number(tierResult.data.price);
    if (agentPriceResult.data?.custom_price) tierPrice = Number(agentPriceResult.data.custom_price);
  }

  // Verify Paystack payment
  if (!process.env.PAYSTACK_SECRET_KEY) {
    return Response.json(
      { error: "PAYSTACK_SECRET_KEY is not set in Vercel environment variables. Add it and redeploy." },
      { status: 500 }
    );
  }

  let psData: Record<string, unknown> = {};
  try {
    const psCtrl = new AbortController();
    const psTimer = setTimeout(() => psCtrl.abort(), 8_000);
    const psRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(paystackRef)}`,
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }, signal: psCtrl.signal }
    );
    clearTimeout(psTimer);
    psData = await psRes.json();
  } catch (err) {
    return Response.json(
      { error: `Could not reach Paystack API: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    );
  }

  const txnStatus = (psData.data as Record<string, unknown>)?.status;
  const txnAmount = Number((psData.data as Record<string, unknown>)?.amount ?? 0);

  // Floor: customer must pay at least cost price (prevents £0 fraud).
  // We do NOT enforce exact match — Paystack already charged what the client showed,
  // and custom-agent prices and referral credits cause legitimate "mismatches".
  const minKobo = Math.round(pricing.costPrice * 100);
  const paid =
    psData.status === true &&
    txnStatus === "success" &&
    txnAmount >= minKobo;

  if (!paid) {
    const reason =
      psData.status !== true
        ? `Paystack API error: ${psData.message ?? "unknown"}`
        : txnStatus !== "success"
        ? `Transaction status: ${txnStatus}`
        : `Amount too low: paid ${txnAmount} pesewas, minimum ${minKobo}`;
    await sendAdminAlert(`PAYMENT VERIFY FAILED\nRef: ${paystackRef}\nReason: ${reason}`).catch(() => {});
    return Response.json(
      { error: `Payment verification failed — ${reason}. Contact support on WhatsApp.` },
      { status: 400 }
    );
  }

  // For price-mode agents: verify wallet has enough to cover cost before proceeding.
  // This is a hard stop — customer has just paid, so we don't deliver if agent can't fund it.
  if (agentId && agentType === "custom_price") {
    const { data: walletAgent } = await supabase
      .from("agents")
      .select("wallet_balance")
      .eq("id", agentId)
      .maybeSingle();
    if (walletAgent && Number(walletAgent.wallet_balance) < pricing.costPrice) {
      await sendAdminAlert(
        `⚠️ PRICE-MODE AGENT WALLET INSUFFICIENT\nRef: ${paystackRef}\nAgent: ${agentName ?? agentId}\nWallet: GH₵${Number(walletAgent.wallet_balance).toFixed(2)}\nCost needed: GH₵${pricing.costPrice.toFixed(2)}\n\nCustomer was charged but order NOT delivered. Manual refund required.`
      ).catch(() => {});
      return Response.json(
        { error: "The agent's account does not have enough credit to fulfill this order. Please contact them. A refund will be issued." },
        { status: 402 }
      );
    }
  }

  // Use Paystack as source of truth for the charged amount.
  // Derive effective selling price by reversing the fee + credit.
  const chargedAmount = parseFloat((txnAmount / 100).toFixed(2));
  const effectivePriceFromPayment = parseFloat(
    ((chargedAmount + creditAmount) / (1 + PLATFORM_FEE_RATE)).toFixed(2)
  );

  // Resolve commission split — global default then per-agent override
  const globalAgentPct = (commissionGlobalResult.data?.agent_pct ?? 80) / 100;
  let agentSplitRate = globalAgentPct;
  if (agentId) {
    const { data: overrideData } = await supabase
      .from("agent_commission_overrides")
      .select("agent_pct")
      .eq("agent_id", agentId)
      .maybeSingle();
    if (overrideData?.agent_pct != null) {
      agentSplitRate = Number(overrideData.agent_pct) / 100;
    }
  }

  let agentCommission: number;
  let adminCommission: number;
  if (!agentId) {
    agentCommission = 0;
    adminCommission = parseFloat(Math.max(0, effectivePriceFromPayment - pricing.costPrice).toFixed(2));
  } else if (agentType === "custom_price") {
    agentCommission = parseFloat(Math.max(0, effectivePriceFromPayment - tierPrice).toFixed(2));
    adminCommission = parseFloat(Math.max(0, tierPrice - pricing.costPrice).toFixed(2));
  } else {
    const profit = Math.max(0, effectivePriceFromPayment - pricing.costPrice);
    agentCommission = parseFloat((profit * agentSplitRate).toFixed(2));
    adminCommission = parseFloat((profit * (1 - agentSplitRate)).toFixed(2));
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

  // Warn silently when fallback save was used (order still saved but with partial data)
  if (saved.partial) {
    sendAdminAlert(`⚠️ ORDER PARTIAL SAVE\nRef: ${paystackRef}\nPhone: ${phone}\nBundle: ${bundleId}\n${saved.partial}\n\nOrder saved with reduced fields — delivery continuing.`).catch(() => {});
  }

  if (saved.error) {
    const dbErrMsg = `ORDER SAVE FAILED\nRef: ${paystackRef}\nPhone: ${phone}\nBundle: ${bundleId}\nError: ${saved.message}`;
    await sendAdminAlert(dbErrMsg).catch(() => {});
    return Response.json(
      { error: `Order could not be saved: ${saved.message}. Screenshot this and contact support on WhatsApp.` },
      { status: 500 }
    );
  }

  await sendAdminAlert(
    fmtOrder({ ref: paystackRef, network: bundleMeta.network, size: bundleMeta.size, phone, amount: chargedAmount, profit, agentName })
  );

  // Mark referral credit as used (fire and forget)
  if (referralCreditId) {
    supabase
      .from("referral_credits")
      .update({ used: true, used_at: new Date().toISOString(), used_on_reference: paystackRef })
      .eq("id", referralCreditId)
      .eq("used", false)
      .then(() => {});
  }

  // Award referral credit to referrer (fire and forget)
  const safeVia = typeof referralVia === "string" ? referralVia.trim() : "";
  if (safeVia && safeVia !== phone) {
    supabase
      .from("referral_credits")
      .insert({ phone: safeVia, credit_ghc: 1, from_phone: phone })
      .then(() => {});
  }

  // ─── OPTIMISATION 2: Inventor API with 20s timeout + 1 auto-retry ───────
  const { ok: invOkRaw, status: inventorHttpStatus, body: inventorBody } = await callInventorAPI({
    network: networkApiName[bundleMeta.network],
    Phone: phone,
    Datasize: pricing.sizeGB,
    reference: paystackRef,
  });

  const inventorLog = `Inventor HTTP ${inventorHttpStatus}: ${JSON.stringify(inventorBody).slice(0, 300)}`;

  const invData = (inventorBody.data as Record<string, unknown>) ?? {};
  const invOrderData = (invData.order as Record<string, unknown>) ?? {};
  const invPlanData = (invOrderData.plan as Record<string, unknown>) ?? {};

  const rawInvStatus = String(
    invOrderData.status ?? invData.status ?? invData.delivery_status ?? inventorBody.status ?? ""
  ).toLowerCase();

  const inventorPlanName = (invPlanData.name as string) ?? null;
  const actualSize = inventorPlanName
    ? inventorPlanName.replace(new RegExp(`^${bundleMeta.network}\\s+`, "i"), "").trim()
    : bundleMeta.size;

  const invIsProcessing =
    rawInvStatus.includes("process") ||
    rawInvStatus.includes("progress") ||
    rawInvStatus.includes("dispatch") ||
    rawInvStatus.includes("pending");

  const inventorOk = invOkRaw && !invIsProcessing;

  // Process loyalty fire-and-forget — doesn't block response
  processLoyalty(phone, bundleMeta.network, paystackRef).catch(() => {});

  if (inventorOk) {
    const orderId: string | null =
      (invOrderData.id as string) ??
      (invData.id as string) ??
      (inventorBody.orderId as string) ??
      null;

    await supabase
      .from("orders")
      .update({ status: "completed", inventor_order_id: orderId ?? null, bundle_size: actualSize, network: bundleMeta.network, customer_name: name })
      .eq("reference", paystackRef);

    if (agentId) {
      if (agentType === "custom_price") {
        // Price mode: deduct cost from wallet, credit agent only their markup profit
        const { data: ag } = await supabase
          .from("agents")
          .select("wallet_balance, paystack_wallet_balance, commission_balance, total_sales")
          .eq("id", agentId)
          .maybeSingle();
        if (ag) {
          const agentProfit = parseFloat(Math.max(0, chargedAmount - pricing.costPrice).toFixed(2));
          await supabase.from("agents").update({
            wallet_balance: Math.max(0, Number(ag.wallet_balance ?? 0) - pricing.costPrice),
            paystack_wallet_balance: Math.max(0, Number(ag.paystack_wallet_balance ?? 0) - pricing.costPrice),
            commission_balance: Number(ag.commission_balance ?? 0) + agentProfit,
            total_sales: Number(ag.total_sales ?? 0) + 1,
          }).eq("id", agentId);
          supabase.from("agent_wallet_transactions").insert([
            {
              agent_id: agentId,
              type: "sale_deduction",
              amount: -pricing.costPrice,
              description: `Cost: ${bundleMeta.network.toUpperCase()} ${actualSize} → ${phone}`,
            },
            {
              agent_id: agentId,
              type: "sale_profit",
              amount: agentProfit,
              description: `Profit: ${bundleMeta.network.toUpperCase()} ${actualSize} → ${phone}`,
            },
          ]).then(() => {});
        }
      } else {
        const { data: ag } = await supabase
          .from("agents")
          .select("commission_balance, total_sales, total_revenue")
          .eq("id", agentId)
          .maybeSingle();
        if (ag) {
          await supabase.from("agents").update({
            commission_balance: (Number(ag.commission_balance) || 0) + agentCommission,
            total_sales: (Number(ag.total_sales) || 0) + 1,
            total_revenue: (Number(ag.total_revenue) || 0) + chargedAmount,
            updated_at: new Date().toISOString(),
          }).eq("id", agentId);
        }
      }
    }

    await sendAdminAlert(`${fmtDelivered(paystackRef, phone, bundleMeta.network, actualSize)}\n${inventorLog}`);

    // Notify agent on Telegram (fire and forget)
    if (agentTelegramChatId) {
      sendAgentNotification(
        agentTelegramChatId,
        `🛒 <b>New Sale!</b>\n\n` +
        `📱 ${bundleMeta.network.toUpperCase()} ${actualSize} → <code>${phone}</code>\n` +
        `💰 Sold for: GH₵${chargedAmount.toFixed(2)}\n` +
        `💵 Your commission: GH₵${agentCommission.toFixed(2)}\n` +
        `✅ Status: Delivered\n` +
        `📎 Ref: <code>${paystackRef}</code>`
      ).catch(() => {});
    }

    supabase
      .from("api_ledger")
      .insert({
        type: "deduction",
        amount: pricing.costPrice,
        note: `${bundleMeta.network.toUpperCase()} ${actualSize} → ${phone}`,
        order_reference: paystackRef,
      })
      .then(() => {});
    return Response.json({ success: true, reference: paystackRef, status: "COMPLETED" });
  }

  if (invIsProcessing) {
    await supabase
      .from("orders")
      .update({ status: "processing", bundle_size: actualSize, network: bundleMeta.network, customer_name: name })
      .eq("reference", paystackRef);
    await sendAdminAlert(
      `⏳ ORDER PROCESSING\nRef: ${paystackRef}\nPhone: ${phone}\n${bundleMeta.network.toUpperCase()} ${actualSize}\n${inventorLog}`
    );

    if (agentTelegramChatId) {
      sendAgentNotification(
        agentTelegramChatId,
        `🛒 <b>New Sale!</b>\n\n` +
        `📱 ${bundleMeta.network.toUpperCase()} ${actualSize} → <code>${phone}</code>\n` +
        `💰 Sold for: GH₵${chargedAmount.toFixed(2)}\n` +
        `💵 Your commission: GH₵${agentCommission.toFixed(2)}\n` +
        `🔄 Status: Processing\n` +
        `📎 Ref: <code>${paystackRef}</code>`
      ).catch(() => {});
    }

    supabase
      .from("api_ledger")
      .insert({
        type: "deduction",
        amount: pricing.costPrice,
        note: `${bundleMeta.network.toUpperCase()} ${actualSize} → ${phone} (processing)`,
        order_reference: paystackRef,
      })
      .then(() => {});
    return Response.json({ success: true, reference: paystackRef, status: "PROCESSING" });
  }

  await supabase.from("orders").update({ status: "failed" }).eq("reference", paystackRef);

  const failMsg = `${fmtFailed(paystackRef, phone, bundleMeta.network, bundleMeta.size, pricing.price)}\n\n${inventorLog}`;
  await sendAdminAlert(failMsg);
  await sendAdminBotMessage(failMsg, retryKeyboard(paystackRef));

  return Response.json(
    { error: "Bundle delivery failed. Support has been notified. You will be refunded." },
    { status: 502 }
  );
}
