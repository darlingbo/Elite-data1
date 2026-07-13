import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";
import { bundles, networkApiName, sizeLabel, type Network } from "@/lib/bundles";
import { sendAdminAlert, sendAdminBotMessage, sendAgentNotification, sendSwiftAlert, fmtOrder, fmtDelivered, fmtFailed, retryKeyboard } from "@/lib/telegram";
import { sendCustomerSMS, orderReceivedSMS } from "@/lib/sms";
import { sendAdminWhatsApp } from "@/lib/whatsapp";
import { sendAlert as mpAlert } from "@/lib/messagepilot";
import { datacityPurchase, isDatacityEnabled, isInventorEnabled } from "@/lib/datacity";
import { datifyPurchase, isDatifyEnabled } from "@/lib/datify";
import { getRoutingRules, matchPhone } from "@/lib/phone-routing";
import { getSurcharge, clearSurcharge } from "@/lib/surcharge";

const PLATFORM_FEE_RATE = 0.02;
const LOYALTY_WINDOW_HOURS = 7;
const LOYALTY_REQUIRED = 4;

async function appendToRefundLog(entry: Record<string, unknown>) {
  const { data } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", "refund_log")
    .maybeSingle();
  let existing: Record<string, unknown>[] = [];
  try { existing = JSON.parse(data?.value ?? "[]"); } catch { existing = []; }
  // Don't duplicate — update if same reference already exists
  const idx = existing.findIndex(e => e.id === entry.id || e.reference === entry.reference);
  if (idx >= 0) {
    existing[idx] = { ...existing[idx], ...entry };
  } else {
    existing.push({ ...entry, saved_at: new Date().toISOString() });
  }
  await supabase
    .from("system_settings")
    .upsert({ key: "refund_log", value: JSON.stringify(existing) }, { onConflict: "key" });
}

// Inventor must respond within this time — AT ISHARE can be slow, give it 25s
const INVENTOR_TIMEOUT_MS = 25_000;

type BundleMeta = { id: string; network: Network; size: string; sizeGB: number };
type BundlePricing = { price: number; costPrice: number; sizeGB: number };
type BundleInfo = { meta: BundleMeta; pricing: BundlePricing; isMashup: boolean } | null;

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

  const [bundlePriceResult, mashupResult] = await Promise.all([
    supabase.from("bundle_prices").select("id, network, size_label, size_gb, price, cost_price")
      .eq("id", bundleId).eq("active", true).maybeSingle(),
    supabase.from("mashup_bundles").select("id, name, data_value, data_unit, minutes, price, cost_price, network")
      .eq("id", bundleId).eq("active", true).maybeSingle(),
  ]);

  const data = bundlePriceResult.data;
  if (data) {
    const network = (data.network as Network | null) ?? staticBundle?.network;
    if (network) {
      const sizeGB = data.size_gb ?? parseSizeGbFromLabel(data.size_label) ?? staticBundle?.sizeGB ?? 1;
      const size = data.size_label ?? (data.size_gb != null ? sizeLabel(sizeGB) : (staticBundle?.size ?? bundleId));
      return {
        meta: { id: data.id, network, size, sizeGB },
        pricing: { price: data.price, costPrice: data.cost_price, sizeGB },
        isMashup: false,
      };
    }
  }

  // Check mashup bundles — manually fulfilled by admin
  const mashup = mashupResult.data;
  if (mashup) {
    const sizeGB = mashup.data_unit === "MB" ? mashup.data_value / 1024 : Number(mashup.data_value);
    const size = mashup.minutes > 0
      ? `${mashup.data_value}${mashup.data_unit} + ${mashup.minutes}min`
      : `${mashup.data_value}${mashup.data_unit}`;
    const mashupNetwork = (mashup.network as Network | null) ?? "mtn";
    return {
      meta: { id: mashup.id, network: mashupNetwork, size, sizeGB },
      pricing: { price: mashup.price, costPrice: mashup.cost_price, sizeGB },
      isMashup: true,
    };
  }

  // Fall back to static bundle
  if (staticBundle) {
    return {
      meta: staticBundle,
      pricing: { price: staticBundle.price, costPrice: staticBundle.costPrice, sizeGB: staticBundle.sizeGB },
      isMashup: false,
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
    refund_phone: fields.refund_phone ?? null,
    refund_network: fields.refund_network ?? null,
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
      refund_phone: fields.refund_phone ?? null,
      refund_network: fields.refund_network ?? null,
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
    refund_phone: fields.refund_phone ?? null,
    refund_network: fields.refund_network ?? null,
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
    await fetch(`${(process.env.INVENTOR_API_BASE_URL ?? "").replace(/\/+$/, "")}/api/developer/purchase`, {
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

async function creditAgent(agentId: string, commission: number, revenue: number) {
  if (!agentId || !commission) return;
  const { data: agent } = await supabase
    .from("agents")
    .select("commission_balance, total_sales, total_revenue")
    .eq("id", agentId)
    .maybeSingle();
  if (!agent) return;
  await supabase.from("agents").update({
    commission_balance: (Number(agent.commission_balance) || 0) + commission,
    total_sales: (Number(agent.total_sales) || 0) + 1,
    total_revenue: (Number(agent.total_revenue) || 0) + revenue,
    updated_at: new Date().toISOString(),
  }).eq("id", agentId);
}

// Inventor API call — single attempt with tight timeout
// If it doesn't respond in time, order stays "pending" and the monitor delivers it
async function callInventorAPI(
  payload: Record<string, unknown>
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INVENTOR_TIMEOUT_MS);

  try {
    const res = await fetch(`${(process.env.INVENTOR_API_BASE_URL ?? "").replace(/\/+$/, "")}/api/developer/purchase`, {
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
  // Rate limit: 10 order attempts per IP per minute
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimit(`orders:${ip}`, 10, 60_000)) {
    return Response.json({ error: "Too many requests. Please wait a moment." }, { status: 429 });
  }

  const body = await request.json();
  const { name, email, phone, bundleId, paystackRef, agentCode, applyReferralCredit, referralVia, fastDelivery, refundPhone, refundNetwork, surcharge: clientSurcharge } = body;

  if (!name || !email || !phone || !bundleId || !paystackRef) {
    return Response.json({ error: "Missing required fields." }, { status: 400 });
  }

  // ─── OPTIMISATION 1: one DB call instead of two ─────────────────────────
  const bundleInfo = await getBundleInfo(bundleId);
  if (!bundleInfo) {
    return Response.json({ error: "Invalid bundle." }, { status: 400 });
  }
  const { meta: bundleMeta, pricing, isMashup } = bundleInfo;

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
          .select("id, name, status, agent_type, plan, telegram_chat_id, registration_ref")
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
  let agentPlan: string = "free";
  let agentTelegramChatId: string | null = null;
  let agentRegistrationRef: string | null = null;
  const agent = agentResult.data;
  if (agent) {
    agentId = agent.id;
    agentName = agent.name;
    agentType = (agent as { agent_type?: string }).agent_type ?? "commission";
    agentPlan = (agent as { plan?: string }).plan ?? "free";
    agentTelegramChatId = (agent as { telegram_chat_id?: string | null }).telegram_chat_id ?? null;
    agentRegistrationRef = (agent as { registration_ref?: string | null }).registration_ref ?? null;
  }

  // Referral credit
  let creditAmount = 0;
  let referralCreditId: string | null = null;
  const credit = creditResult.data;
  if (credit) {
    creditAmount = Number(credit.credit_ghc);
    referralCreditId = credit.id;
  }

  // adminTierPrice = what the agent pays per sale (deducted from wallet for free plan, or used for profit calc)
  // pro plan → custom_tier_prices (or admin price fallback); free plan custom_price → admin price × 0.96
  let adminTierPrice = pricing.costPrice; // fallback
  let tierPrice = pricing.price;
  if (agentId && agentType === "custom_price") {
    const [tierResult, agentPriceResult, adminPriceResult] = await Promise.all([
      agentPlan === "pro"
        ? supabase.from("custom_tier_prices").select("price").eq("bundle_id", bundleId).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("agent_bundle_prices")
        .select("custom_price")
        .eq("agent_id", agentId)
        .eq("bundle_id", bundleId)
        .eq("active", true)
        .maybeSingle(),
      supabase.from("bundle_prices").select("price, active").eq("id", bundleId).maybeSingle(),
    ]);

    // Resolve admin selling price (what customer pays admin)
    const adminSellingPrice = (adminPriceResult.data?.active !== false && adminPriceResult.data?.price != null)
      ? Number(adminPriceResult.data.price)
      : bundles.find(b => b.id === bundleId)?.price ?? pricing.price;

    if (agentPlan === "pro") {
      // Pro plan: tier price if set, otherwise admin selling price
      adminTierPrice = tierResult.data?.price ? Number(tierResult.data.price) : adminSellingPrice;
    } else {
      // Free plan: admin selling price minus 4%
      adminTierPrice = parseFloat((adminSellingPrice * 0.96).toFixed(2));
    }

    tierPrice = agentPriceResult.data?.custom_price
      ? Number(agentPriceResult.data.custom_price)
      : adminTierPrice;
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

  // Hard floor: no bundle can ever cost less than GH₵1.00 — catches zero-priced DB entries
  const ABSOLUTE_MIN_GHC = 1.00;

  // Check phone blocklist before any further processing
  const { data: blocklistData } = await supabase
    .from("system_settings").select("value").eq("key", "phone_blocklist").maybeSingle();
  let blocklist: string[] = [];
  try { blocklist = JSON.parse(blocklistData?.value ?? "[]"); } catch { blocklist = []; }
  const normalizedPhone = phone.replace(/\s/g, "").replace(/^\+233/, "0").replace(/^233/, "0");
  const normalize = (p: string) => String(p).trim().replace(/\s/g, "").replace(/^\+233/, "0").replace(/^233/, "0");

  if (blocklist.some((b: string) => normalize(b) === normalize(normalizedPhone))) {
    await sendAdminAlert(`🚫 BLOCKED ORDER ATTEMPT\nPhone: ${phone}\nBundle: ${bundleMeta.network.toUpperCase()} ${bundleMeta.size}\nRef: ${paystackRef}`).catch(() => {});
    return Response.json({ error: "👀 I SEE WHAT YOU ARE DOING" }, { status: 403 });
  }

  // Floor: customer must pay at least 80% of the selling price + any surcharge.
  const pendingSurcharge = await getSurcharge(phone);
  const surchargeKobo = Math.round(pendingSurcharge * 100);
  const minKobo = Math.max(
    Math.round(ABSOLUTE_MIN_GHC * 100),
    Math.round(pricing.price * 0.80 * 100)
  ) + surchargeKobo;
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

    // Auto-block numbers that try to pay suspiciously low amounts (under GH₵1.00)
    if (txnStatus === "success" && txnAmount < 100) {
      const updatedList = [...new Set([...blocklist, normalizedPhone])];
      await supabase.from("system_settings").upsert(
        { key: "phone_blocklist", value: JSON.stringify(updatedList), updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
      await sendAdminAlert(`🚫 AUTO-BLOCKED: ${phone}\nPaid only GH₵${(txnAmount / 100).toFixed(2)} for ${bundleMeta.network.toUpperCase()} ${bundleMeta.size}\nRef: ${paystackRef}`).catch(() => {});
      return Response.json({ error: "👀 I SEE WHAT YOU ARE DOING" }, { status: 400 });
    }

    await sendAdminAlert(`PAYMENT VERIFY FAILED\nRef: ${paystackRef}\nReason: ${reason}`).catch(() => {});
    return Response.json(
      { error: `Payment verification failed — ${reason}. Contact support on WhatsApp.` },
      { status: 400 }
    );
  }

  // For free-plan price-mode agents: verify wallet has enough to cover cost before proceeding.
  // Pro plan agents don't use a wallet — customer pays Paystack directly.
  if (agentId && agentType === "custom_price" && agentPlan === "free") {
    const { data: walletAgent } = await supabase
      .from("agents")
      .select("wallet_balance")
      .eq("id", agentId)
      .maybeSingle();
    if (walletAgent && Number(walletAgent.wallet_balance) < adminTierPrice) {
      await sendAdminAlert(
        `⚠️ PRICE-MODE AGENT WALLET INSUFFICIENT\nRef: ${paystackRef}\nAgent: ${agentName ?? agentId}\nWallet: GH₵${Number(walletAgent.wallet_balance).toFixed(2)}\nAmount needed: GH₵${adminTierPrice.toFixed(2)}\n\nCustomer was charged but order NOT delivered. Manual refund required.`
      ).catch(() => {});
      return Response.json(
        { error: "The agent's account does not have enough credit to fulfill this order. Please contact them. A refund will be issued." },
        { status: 402 }
      );
    }
  }

  // Use Paystack as source of truth for the charged amount.
  // Strip fast delivery fee before commission calc — it goes entirely to admin.
  const chargedAmount = parseFloat((txnAmount / 100).toFixed(2));
  const fastDeliveryFee = fastDelivery === true ? 0.50 : 0;
  const chargedForCommission = parseFloat((chargedAmount - fastDeliveryFee).toFixed(2));
  const effectivePriceFromPayment = parseFloat(
    ((chargedForCommission + creditAmount) / (1 + PLATFORM_FEE_RATE)).toFixed(2)
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
    // Both free and pro plan: agent profit = charged minus their buy price (adminTierPrice)
    agentCommission = parseFloat(Math.max(0, chargedForCommission - adminTierPrice).toFixed(2));
    adminCommission = parseFloat(Math.max(0, adminTierPrice - pricing.costPrice).toFixed(2)) + fastDeliveryFee;
  } else {
    // commission type: old percentage split — do not change
    const profit = Math.max(0, effectivePriceFromPayment - pricing.costPrice);
    agentCommission = parseFloat((profit * agentSplitRate).toFixed(2));
    // Fast delivery fee goes entirely to admin, not split with agent
    adminCommission = parseFloat((profit * (1 - agentSplitRate) + fastDeliveryFee).toFixed(2));
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
    refund_phone: refundPhone ?? null,
    refund_network: refundNetwork ?? null,
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

  // Append every new order to the permanent refund log immediately
  appendToRefundLog({
    id: paystackRef,
    reference: paystackRef,
    customer_name: name,
    customer_phone: phone,
    network: bundleMeta.network,
    bundle_size: bundleMeta.size,
    amount: chargedAmount,
    refund_phone: refundPhone ?? null,
    refund_name: null,
  }).catch(() => {});

  await sendAdminAlert(
    (fastDelivery ? "⚡ FAST DELIVERY\n" : "") +
    fmtOrder({ ref: paystackRef, network: bundleMeta.network, size: bundleMeta.size, phone, amount: chargedAmount, profit, agentName })
  );
  mpAlert("🛒 New Order", `${bundleMeta.network.toUpperCase()} ${bundleMeta.size} → ${phone} | GH₵${chargedAmount.toFixed(2)}${agentName ? ` | Agent: ${agentName}` : ""} | Ref: ${paystackRef.slice(-8)}`).catch(() => {});

  // SMS to customer immediately after purchase — fire and forget
  sendCustomerSMS(phone, orderReceivedSMS(name, bundleMeta.network, bundleMeta.size, phone, paystackRef)).catch(() => {});

  // Mark referral credit as used — MUST be awaited so the same credit can't be reused
  if (referralCreditId) {
    const { error: creditErr } = await supabase
      .from("referral_credits")
      .update({ used: true, used_at: new Date().toISOString(), used_on_reference: paystackRef })
      .eq("id", referralCreditId)
      .eq("used", false);
    if (creditErr) {
      sendAdminAlert(
        `⚠️ REFERRAL CREDIT NOT MARKED USED\nRef: ${paystackRef}\nPhone: ${phone}\nCredit ID: ${referralCreditId}\nError: ${creditErr.message}\n\nGo to Supabase → referral_credits → set this ID to used=true manually.`
      ).catch(() => {});
    }
  }

  // Clear surcharge now that it has been paid
  if (pendingSurcharge > 0) {
    clearSurcharge(phone).catch(() => {});
  }

  // Award referral credit to referrer (fire and forget)
  const safeVia = typeof referralVia === "string" ? referralVia.trim() : "";
  // Validate referralVia is a plausible Ghana phone number before awarding credit
  const viaIsValid = /^0[2-5][0-9]{8}$/.test(safeVia);
  if (safeVia && safeVia !== phone && viaIsValid) {
    (async () => {
      // Rate-limit: max 5 credits per referrer per day (prevents bulk promo code farming)
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const { count: todayCount } = await supabase.from("referral_credits")
        .select("id", { count: "exact", head: true })
        .eq("phone", safeVia)
        .not("from_phone", "like", "MILESTONE:%")
        .gte("created_at", todayStart.toISOString());
      if ((todayCount ?? 0) >= 5) return; // silently skip — abuse prevention

      // Count how many regular credits this referrer has already earned
      const { count: totalUses } = await supabase
        .from("referral_credits")
        .select("id", { count: "exact", head: true })
        .eq("phone", safeVia)
        .not("from_phone", "like", "MILESTONE:%");

      const epochPos = (totalUses ?? 0) % 10; // 0–9 position in current 10-use cycle

      // Award GH₵0.20 per referral (down from GH₵1)
      await supabase.from("referral_credits").insert({ phone: safeVia, credit_ghc: 0.20, from_phone: phone });

      // On the 10th use of each cycle: generate a 20% off promo code for the referrer
      if (epochPos === 9) {
        const milestoneCode = `BONUS20-${safeVia.slice(-6)}-${Date.now()}`;
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        try {
          await supabase.from("promo_codes").insert({
            code: milestoneCode,
            discount_type: "percent",
            discount_value: 20,
            max_uses: 1,
            used_count: 0,
            active: true,
            expires_at: expiresAt,
          });
        } catch { /* promo_codes table may not exist yet */ }
        try {
          await supabase.from("referral_credits").insert({
            phone: safeVia, credit_ghc: 0, from_phone: `MILESTONE:${milestoneCode}`,
          });
        } catch { /* ignore */ }
      }
    })().catch(() => {});
  }

  // ─── MASHUP: skip Inventor — admin fulfils manually ─────────────────────
  if (isMashup) {
    await supabase
      .from("orders")
      .update({ status: "processing", bundle_size: bundleMeta.size, network: bundleMeta.network, customer_name: name })
      .eq("reference", paystackRef);

    const mashupAlert =
      `🟡 <b>MASHUP ORDER — SEND DATA MANUALLY</b>\n\n` +
      `👤 <b>Customer:</b> ${name}\n` +
      `📱 <b>Phone:</b> <code>${phone}</code>\n` +
      `📦 <b>Bundle:</b> ${bundleMeta.size}\n` +
      `💰 <b>Amount Paid:</b> GH₵${chargedAmount.toFixed(2)}\n` +
      `📎 <b>Ref:</b> <code>${paystackRef}</code>\n\n` +
      `➡️ Send the bundle to the customer's number then mark the order as completed in the admin panel.`;

    await sendAdminAlert(mashupAlert);
    await sendAdminBotMessage(mashupAlert, retryKeyboard(paystackRef));

    // WhatsApp alert to admin
    const waMsg =
      `🟡 MASHUP ORDER - SEND DATA MANUALLY\n\n` +
      `Customer: ${name}\n` +
      `Phone: ${phone}\n` +
      `Bundle: ${bundleMeta.size}\n` +
      `Amount Paid: GH${chargedAmount.toFixed(2)}\n` +
      `Ref: ${paystackRef}\n\n` +
      `Send the bundle to the customer's number then mark order as completed.`;
    sendAdminWhatsApp(waMsg).catch(() => {});

    // SMS customer so they know it's being processed
    sendCustomerSMS(phone, orderReceivedSMS(name, bundleMeta.network, bundleMeta.size, phone, paystackRef)).catch(() => {});

    if (agentTelegramChatId) {
      sendAgentNotification(
        agentTelegramChatId,
        `🛒 <b>New Mashup Sale!</b>\n\n` +
        `📱 ${bundleMeta.size} → <code>${phone}</code>\n` +
        `💰 Sold for: GH₵${chargedAmount.toFixed(2)}\n` +
        `💵 Your commission: GH₵${agentCommission.toFixed(2)}\n` +
        `🔄 Status: Processing (manual delivery)\n` +
        `📎 Ref: <code>${paystackRef}</code>`
      ).catch(() => {});
    }

    processLoyalty(phone, bundleMeta.network, paystackRef).catch(() => {});
    return Response.json({ success: true, reference: paystackRef, status: "PROCESSING" });
  }

  // ─── Number routing: check if this phone is pinned to a specific provider ──
  // If a rule matches, call ONLY that provider — no fallback chain.
  const [routingRules, inventorOnRaw, datacityOnRaw, datifyOnRaw] = await Promise.all([
    getRoutingRules(),
    isInventorEnabled(),
    isDatacityEnabled(),
    isDatifyEnabled(),
  ]);
  const pinnedProvider = matchPhone(phone, routingRules);

  // When pinned: override enabled flags so only the pinned provider is called.
  const inventorOn = pinnedProvider ? pinnedProvider === "inventor" && inventorOnRaw : inventorOnRaw;
  const datacityOn = pinnedProvider ? pinnedProvider === "datacity" && datacityOnRaw : datacityOnRaw;
  const datifyOn   = pinnedProvider ? pinnedProvider === "datify"   && datifyOnRaw   : datifyOnRaw;

  if (pinnedProvider) {
    sendSwiftAlert(`📍 Routing ${phone} → ${pinnedProvider.toUpperCase()} (pinned rule)\nRef: ${paystackRef}`).catch(() => {});
  }

  const { ok: invOkRaw, status: inventorHttpStatus, body: inventorBody } = inventorOn
    ? await callInventorAPI({
        network: networkApiName[bundleMeta.network],
        Phone: phone,
        Datasize: pricing.sizeGB,
        reference: paystackRef,
      })
    : { ok: false, status: -1, body: { error: "Inventor disabled" } as Record<string, unknown> };

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

  // 409 = Inventor already has this order (webhook + client both fired) — treat as processing
  const inventorDuplicate = inventorHttpStatus === 409;

  const invIsProcessing =
    inventorDuplicate ||
    rawInvStatus.includes("process") ||
    rawInvStatus.includes("progress") ||
    rawInvStatus.includes("dispatch") ||
    rawInvStatus.includes("pending");

  // status -1 = Inventor disabled by admin toggle; status 0 = timed out
  const inventorDisabled = inventorHttpStatus === -1;
  const inventorTimedOut = inventorHttpStatus === 0;
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
      if (agentType === "custom_price" && agentPlan === "free") {
        // Free plan price-mode: deduct cost from wallet, credit agent only their markup profit
        const { data: ag } = await supabase
          .from("agents")
          .select("wallet_balance, paystack_wallet_balance, commission_balance, total_sales")
          .eq("id", agentId)
          .maybeSingle();
        if (ag) {
          const agentProfit = parseFloat(Math.max(0, chargedAmount - adminTierPrice).toFixed(2));
          await supabase.from("agents").update({
            wallet_balance: Math.max(0, Number(ag.wallet_balance ?? 0) - adminTierPrice),
            paystack_wallet_balance: Math.max(0, Number(ag.paystack_wallet_balance ?? 0) - adminTierPrice),
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

    await sendAdminAlert(`${fmtDelivered(paystackRef, phone, bundleMeta.network, actualSize)}\n📡 Provider: Inventor\n${inventorLog}`);
    mpAlert("✅ Delivered", `${bundleMeta.network.toUpperCase()} ${actualSize} → ${phone} | Ref: ${paystackRef.slice(-8)}`).catch(() => {});


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

  // Extract Inventor error message — needed for fallback alerts
  const inventorErrorMsg = String(
    (inventorBody.message as string) ??
    (inventorBody.error as string) ??
    (inventorBody.description as string) ??
    (inventorDisabled ? "Inventor disabled" : "")
  );

  // ── Check ALL fallback providers BEFORE the processing branch ───────────
  // This ensures that if DataCity or Datify delivered while Inventor was
  // still in-flight or disabled, we complete immediately rather than waiting.

  // Inventor failed → try DataCity
  const dcRes = datacityOn
    ? await datacityPurchase(bundleMeta.network, phone, pricing.sizeGB)
    : { success: false as const, error: "DataCity disabled" };

  if (dcRes.success) {
    await supabase.from("orders").update({
      status: "completed",
      bundle_size: bundleMeta.size,
      network: bundleMeta.network,
      customer_name: name,
    }).eq("reference", paystackRef);

    if (agentId && agentCommission > 0) await creditAgent(agentId, agentCommission, chargedAmount);

    sendAdminAlert(
      `✅ <b>DELIVERED VIA DATACITY</b>\n\n` +
      `👤 ${name} · <code>${phone}</code>\n` +
      `📦 ${bundleMeta.network.toUpperCase()} ${bundleMeta.size} · GH₵${chargedAmount.toFixed(2)}\n` +
      `📡 Provider: DataCity\n` +
      `📎 Paystack: <code>${paystackRef}</code>\n` +
      `🔗 DataCity ref: <code>${dcRes.reference}</code>\n` +
      `⚠️ Inventor: ${inventorErrorMsg || `HTTP ${inventorHttpStatus}`}`
    ).catch(() => {});


    if (agentTelegramChatId) {
      sendAgentNotification(agentTelegramChatId,
        `🛒 <b>New Sale!</b>\n\n📱 ${bundleMeta.network.toUpperCase()} ${bundleMeta.size} → <code>${phone}</code>\n` +
        `💰 GH₵${chargedAmount.toFixed(2)} · Commission: GH₵${agentCommission.toFixed(2)}\n✅ Delivered via DataCity\n📎 <code>${paystackRef}</code>`
      ).catch(() => {});
    }

    return Response.json({ success: true, reference: paystackRef, status: "COMPLETED" });
  }

  // DataCity timed out → stop here, don't try Datify (might still deliver)
  if (dcRes.timedOut) {
    await supabase.from("orders").update({ status: "processing", bundle_size: bundleMeta.size, network: bundleMeta.network, customer_name: name }).eq("reference", paystackRef);
    await sendAdminAlert(`⏳ ORDER PROCESSING\nRef: ${paystackRef}\nPhone: ${phone}\n${bundleMeta.network.toUpperCase()} ${bundleMeta.size}\n⚠️ DataCity timed out — order left as processing`);
    return Response.json({ success: true, reference: paystackRef, status: "PROCESSING" });
  }

  // DataCity also rejected → try Datify
  const dtRes = datifyOn
    ? await datifyPurchase(bundleMeta.network, phone, pricing.sizeGB)
    : { success: false as const, error: "Datify disabled" };

  if (dtRes.success) {
    await supabase.from("orders").update({
      status: "completed",
      bundle_size: bundleMeta.size,
      network: bundleMeta.network,
      customer_name: name,
    }).eq("reference", paystackRef);

    if (agentId && agentCommission > 0) await creditAgent(agentId, agentCommission, chargedAmount);

    sendAdminAlert(
      `✅ <b>DELIVERED VIA DATIFY</b>\n\n` +
      `👤 ${name} · <code>${phone}</code>\n` +
      `📦 ${bundleMeta.network.toUpperCase()} ${bundleMeta.size} · GH₵${chargedAmount.toFixed(2)}\n` +
      `📡 Provider: Datify\n` +
      `📎 Paystack: <code>${paystackRef}</code>\n` +
      `🔗 Datify ref: <code>${dtRes.reference}</code>\n` +
      `⚠️ Inventor: ${inventorErrorMsg || `HTTP ${inventorHttpStatus}`}\n` +
      `⚠️ DataCity: ${dcRes.error ?? "failed"}`
    ).catch(() => {});


    if (agentTelegramChatId) {
      sendAgentNotification(agentTelegramChatId,
        `🛒 <b>New Sale!</b>\n\n📱 ${bundleMeta.network.toUpperCase()} ${bundleMeta.size} → <code>${phone}</code>\n` +
        `💰 GH₵${chargedAmount.toFixed(2)} · Commission: GH₵${agentCommission.toFixed(2)}\n✅ Delivered via Datify\n📎 <code>${paystackRef}</code>`
      ).catch(() => {});
    }

    return Response.json({ success: true, reference: paystackRef, status: "COMPLETED" });
  }

  // All 3 failed — check if Inventor is still in-flight
  if (!inventorDisabled && (invIsProcessing || inventorTimedOut)) {
    await supabase
      .from("orders")
      .update({ status: "processing", bundle_size: actualSize, network: bundleMeta.network, customer_name: name })
      .eq("reference", paystackRef);
    await sendAdminAlert(
      `⏳ ORDER PROCESSING\nRef: ${paystackRef}\nPhone: ${phone}\n${bundleMeta.network.toUpperCase()} ${actualSize}\n${inventorTimedOut ? "⚠️ Inventor timed out — order left as processing for monitor to sync" : inventorLog}`
    );

    // Deduct wallet for free-plan price-mode agents — pro plan agents don't use wallet
    if (agentId && agentType === "custom_price" && agentPlan === "free") {
      const { data: ag } = await supabase
        .from("agents")
        .select("wallet_balance, paystack_wallet_balance")
        .eq("id", agentId)
        .maybeSingle();
      if (ag) {
        await supabase.from("agents").update({
          wallet_balance: Math.max(0, Number(ag.wallet_balance ?? 0) - adminTierPrice),
          paystack_wallet_balance: Math.max(0, Number(ag.paystack_wallet_balance ?? 0) - adminTierPrice),
        }).eq("id", agentId);
      }
    }

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

  // All APIs failed — check reason
  const isBeneficiary = inventorErrorMsg.toLowerCase().includes("beneficiary");
  const finalStatus = isBeneficiary ? "not_on_list" : "failed";

  await supabase.from("orders")
    .update({ status: finalStatus, bundle_size: bundleMeta.size, network: bundleMeta.network, customer_name: name })
    .eq("reference", paystackRef);

  const bothFailedMsg =
    `🔴 <b>${isBeneficiary ? "ALL APIS BLOCKED — NOT ON LIST" : "ALL APIS FAILED"}</b>\n\n` +
    `👤 ${name} · <code>${phone}</code>\n` +
    `📦 ${bundleMeta.network.toUpperCase()} ${bundleMeta.size} · GH₵${chargedAmount.toFixed(2)}\n` +
    `📎 <code>${paystackRef}</code>\n\n` +
    `❌ Inventor: ${inventorErrorMsg || `HTTP ${inventorHttpStatus}`}\n` +
    `❌ DataCity: ${dcRes.error ?? "failed"}\n` +
    `❌ Datify: ${dtRes.error ?? "failed"}\n\n` +
    `➡️ Deliver manually then mark completed in admin panel.`;

  await sendAdminAlert(bothFailedMsg);
  await sendAdminBotMessage(bothFailedMsg, retryKeyboard(paystackRef));
  sendAdminWhatsApp(bothFailedMsg.replace(/<[^>]*>/g, "")).catch(() => {});
  mpAlert("🔴 Order Failed", `${bundleMeta.network.toUpperCase()} ${bundleMeta.size} → ${phone} | GH₵${chargedAmount.toFixed(2)} | Ref: ${paystackRef.slice(-8)} | Deliver manually`).catch(() => {});

  return Response.json({ success: true, failed: true, reference: paystackRef, network: bundleMeta.network, bundleSize: bundleMeta.size, status: "PROCESSING" });
}
