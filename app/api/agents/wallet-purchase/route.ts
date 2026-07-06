import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendAgentNotification, sendAdminAlert } from "@/lib/telegram";
import { sendAdminWhatsApp } from "@/lib/whatsapp";
import { getAgentBundleCost } from "@/lib/agent-pricing";
import { datacityPurchase, isDatacityEnabled, isInventorEnabled } from "@/lib/datacity";
import { datifyPurchase, isDatifyEnabled } from "@/lib/datify";

const INVENTOR_TIMEOUT_MS = 10_000;

const NETWORK_API_MAP: Record<string, string> = {
  mtn: "MTN",
  telecel: "TELECEL",
  airteltigo: "AT ISHARE",
};

async function callInventor(network: string, phone: string, sizeGB: number, reference: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INVENTOR_TIMEOUT_MS);
  try {
    const res = await fetch(`${process.env.INVENTOR_API_BASE_URL}/api/developer/purchase`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.INVENTOR_API_KEY}`,
      },
      body: JSON.stringify({
        network: NETWORK_API_MAP[network] ?? "MTN",
        Phone: phone,
        Datasize: sizeGB,
        reference,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, status: 0, body: { error: String(err) } };
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { agentId, referralCode, phone, bundleId, network, bundleSize, sizeGB } = body;

  if (!agentId || !referralCode || !phone || !bundleId || !network) {
    return Response.json({ error: "Missing required fields." }, { status: 400 });
  }

  const cleaned = phone.replace(/\s/g, "");
  if (!/^0[2-5][0-9]{8}$/.test(cleaned)) {
    return Response.json({ error: "Enter a valid Ghana phone number (e.g. 0241234567)." }, { status: 400 });
  }

  // Load agent (including registration_ref to determine Free vs Pro pricing)
  const agentRes = await supabase
    .from("agents")
    .select("id, name, wallet_balance, status, telegram_chat_id, registration_ref, agent_type")
    .eq("id", agentId)
    .eq("referral_code", referralCode.toUpperCase())
    .eq("status", "approved")
    .maybeSingle();

  const agent = agentRes.data;
  if (!agent) {
    return Response.json({ error: "Agent account not found or not approved." }, { status: 403 });
  }

  // Commission/Free agents pay bundle_prices.price × 0.96 — Price-mode/Pro agents pay custom_tier_prices.price
  const [costPrice, bundleRes] = await Promise.all([
    getAgentBundleCost(bundleId, agent.registration_ref, agent.agent_type),
    supabase.from("bundle_prices").select("size_label, size_gb").eq("id", bundleId).maybeSingle(),
  ]);

  if (costPrice == null) {
    return Response.json({ error: "Bundle not found or no longer active." }, { status: 400 });
  }

  const walletBalance = Number(agent.wallet_balance ?? 0);
  if (walletBalance < costPrice) {
    return Response.json({
      error: `Insufficient wallet balance. You need GH₵${costPrice.toFixed(2)} but only have GH₵${walletBalance.toFixed(2)}.`,
      walletBalance,
      required: costPrice,
    }, { status: 400 });
  }

  // Deduct from wallet upfront
  const { error: deductError } = await supabase
    .from("agents")
    .update({ wallet_balance: walletBalance - costPrice })
    .eq("id", agentId);

  if (deductError) {
    return Response.json({ error: "Failed to deduct from wallet. Try again." }, { status: 500 });
  }

  const reference = `AGTWALLET-${referralCode.toUpperCase()}-${Date.now()}`;
  const numericSizeGB = sizeGB ?? bundleRes.data?.size_gb ?? 1;
  const label = bundleSize ?? bundleRes.data?.size_label ?? `${numericSizeGB}GB`;

  await supabase.from("orders").insert({
    reference,
    customer_name: agent.name,
    phone: cleaned,
    network,
    bundle_size: label,
    amount: costPrice,
    cost_price: costPrice,
    admin_commission: 0,
    agent_commission: 0,
    agent_id: agentId,
    status: "processing",
  });

  // Sequential fallback: Inventor → DataCity → Datify
  // Each provider is only called if the previous one definitively failed.
  const [inventorOn, datacityOn, datifyOn] = await Promise.all([isInventorEnabled(), isDatacityEnabled(), isDatifyEnabled()]);

  const result = inventorOn
    ? await callInventor(network, cleaned, numericSizeGB, reference)
    : { ok: false, status: -1, body: { error: "Inventor disabled" } as Record<string, unknown> };

  const isSuccess = result.ok && result.status !== 500;
  const isFailed = result.status === 400 || result.status === 422 || result.status === -1;
  const isDuplicate = result.status === 409;

  const errMsg = String(
    (result.body.message as string) ??
    (result.body.error as string) ??
    (result.body.description as string) ??
    (result.status === -1 ? "Inventor disabled" : "")
  );

  // ── Inventor delivered ────────────────────────────────────────────────────
  if (isSuccess || isDuplicate) {
    await supabase.from("orders").update({ status: "completed" }).eq("reference", reference);

    if (agent.telegram_chat_id) {
      sendAgentNotification(
        agent.telegram_chat_id,
        `✅ <b>Delivered!</b>\n\n📱 ${network.toUpperCase()} ${label} → <code>${cleaned}</code>\n💰 GH₵${costPrice.toFixed(2)} deducted\n📡 Provider: Inventor\n📎 <code>${reference}</code>`
      ).catch(() => {});
    }

    sendAdminAlert(
      `✅ <b>DELIVERED VIA INVENTOR (Agent Wallet)</b>\n\n` +
      `👤 ${agent.name} · <code>${cleaned}</code>\n📦 ${network.toUpperCase()} ${label}\n` +
      `📡 Provider: Inventor · Ref: <code>${reference}</code>`
    ).catch(() => {});

    return Response.json({
      success: true,
      reference,
      network,
      bundleSize: label,
      phone: cleaned,
      costDeducted: costPrice,
      newWalletBalance: parseFloat((walletBalance - costPrice).toFixed(2)),
    });
  }

  // ── Inventor failed → try DataCity ───────────────────────────────────────
  const dcRes = datacityOn
    ? await datacityPurchase(network, cleaned, numericSizeGB)
    : { success: false as const, error: "DataCity disabled" };

  if (dcRes.success) {
    await supabase.from("orders").update({ status: "completed" }).eq("reference", reference);

    if (agent.telegram_chat_id) {
      sendAgentNotification(
        agent.telegram_chat_id,
        `✅ <b>Delivered!</b>\n\n📱 ${network.toUpperCase()} ${label} → <code>${cleaned}</code>\n💰 GH₵${costPrice.toFixed(2)} deducted\n📡 Provider: DataCity\n📎 <code>${reference}</code>`
      ).catch(() => {});
    }

    sendAdminAlert(
      `✅ <b>DELIVERED VIA DATACITY (Agent Wallet)</b>\n\n` +
      `👤 ${agent.name} · <code>${cleaned}</code>\n📦 ${network.toUpperCase()} ${label}\n` +
      `📡 Provider: DataCity · 🔗 <code>${dcRes.reference}</code>\n❌ Inventor: ${errMsg}`
    ).catch(() => {});

    return Response.json({
      success: true,
      reference,
      message: "Data delivered successfully.",
      costDeducted: costPrice,
      newWalletBalance: parseFloat((walletBalance - costPrice).toFixed(2)),
    });
  }

  // DataCity timed out → stop, don't try Datify (might still deliver)
  if (dcRes.timedOut) {
    await supabase.from("orders").update({ status: "processing" }).eq("reference", reference);
    sendAdminAlert(`⏳ ORDER PROCESSING (Agent Wallet)\n👤 ${agent.name} · ${cleaned}\n📦 ${network.toUpperCase()} ${label}\n⚠️ DataCity timed out — awaiting confirmation`).catch(() => {});
    return Response.json({ success: true, pending: true, reference, message: "Order placed. Delivery in 1–5 minutes.", costDeducted: costPrice, newWalletBalance: parseFloat((walletBalance - costPrice).toFixed(2)) });
  }

  // ── DataCity rejected → try Datify ────────────────────────────────────────
  const dtRes = datifyOn
    ? await datifyPurchase(network, cleaned, numericSizeGB)
    : { success: false as const, error: "Datify disabled" };

  if (dtRes.success) {
    await supabase.from("orders").update({ status: "completed" }).eq("reference", reference);

    if (agent.telegram_chat_id) {
      sendAgentNotification(
        agent.telegram_chat_id,
        `✅ <b>Delivered!</b>\n\n📱 ${network.toUpperCase()} ${label} → <code>${cleaned}</code>\n💰 GH₵${costPrice.toFixed(2)} deducted\n📡 Provider: Datify\n📎 <code>${reference}</code>`
      ).catch(() => {});
    }

    sendAdminAlert(
      `✅ <b>DELIVERED VIA DATIFY (Agent Wallet)</b>\n\n` +
      `👤 ${agent.name} · <code>${cleaned}</code>\n📦 ${network.toUpperCase()} ${label}\n` +
      `📡 Provider: Datify · 🔗 <code>${dtRes.reference}</code>\n❌ Inventor: ${errMsg}\n❌ DataCity: ${dcRes.error ?? "failed"}`
    ).catch(() => {});

    return Response.json({
      success: true,
      reference,
      message: "Data delivered successfully.",
      costDeducted: costPrice,
      newWalletBalance: parseFloat((walletBalance - costPrice).toFixed(2)),
    });
  }

  // ── All APIs failed ───────────────────────────────────────────────────────
  if (isFailed) {
    const isBeneficiary = errMsg.toLowerCase().includes("beneficiary");
    await supabase.from("orders").update({ status: isBeneficiary ? "not_on_list" : "failed" }).eq("reference", reference);

    const manualAlert =
      `🔴 <b>${isBeneficiary ? "ALL APIS BLOCKED" : "ALL APIS FAILED"} (Agent Wallet)</b>\n\n` +
      `👤 ${agent.name} · <code>${cleaned}</code>\n📦 ${network.toUpperCase()} ${label}\n` +
      `💰 GH₵${costPrice.toFixed(2)} deducted · Ref: <code>${reference}</code>\n\n` +
      `❌ Inventor: ${errMsg}\n❌ DataCity: ${dcRes.error ?? "failed"}\n❌ Datify: ${dtRes.error ?? "failed"}\n\n` +
      `➡️ Send manually then mark completed.`;

    sendAdminAlert(manualAlert).catch(() => {});
    sendAdminWhatsApp(manualAlert.replace(/<[^>]*>/g, "")).catch(() => {});

    if (agent.telegram_chat_id) {
      sendAgentNotification(
        agent.telegram_chat_id,
        `⏳ Order queued for manual delivery\n\n📱 ${network.toUpperCase()} ${label} → ${cleaned}\n💰 GH₵${costPrice.toFixed(2)} deducted\nAdmin will deliver shortly.\n📎 <code>${reference}</code>`
      ).catch(() => {});
    }

    if (!isBeneficiary) {
      await supabase.from("agents").update({ wallet_balance: walletBalance }).eq("id", agentId);
    }

    return Response.json({
      success: true,
      pending: true,
      reference,
      message: "Order queued for manual delivery. Admin has been notified.",
      costDeducted: costPrice,
      newWalletBalance: parseFloat((walletBalance - costPrice).toFixed(2)),
    });
  }

  // Timeout — monitor will retry
  await supabase.from("orders").update({ status: "pending" }).eq("reference", reference);

  return Response.json({
    success: true,
    pending: true,
    reference,
    message: "Order placed. Delivery in 1–5 minutes.",
    costDeducted: costPrice,
    newWalletBalance: parseFloat((walletBalance - costPrice).toFixed(2)),
  });
}
