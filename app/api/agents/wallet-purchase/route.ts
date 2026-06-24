import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendAgentNotification } from "@/lib/telegram";
import { getAgentBundleCost } from "@/lib/agent-pricing";

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
    .select("id, name, wallet_balance, status, telegram_chat_id, registration_ref")
    .eq("id", agentId)
    .eq("referral_code", referralCode.toUpperCase())
    .eq("status", "approved")
    .maybeSingle();

  const agent = agentRes.data;
  if (!agent) {
    return Response.json({ error: "Agent account not found or not approved." }, { status: 403 });
  }

  // Free agents pay bundle_prices.price × 0.96 — Pro agents pay custom_tier_prices.price
  const [costPrice, bundleRes] = await Promise.all([
    getAgentBundleCost(bundleId, agent.registration_ref),
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

  const result = await callInventor(network, cleaned, numericSizeGB, reference);

  const isSuccess = result.ok && result.status !== 500;
  const isFailed = result.status === 400 || result.status === 422;
  const isDuplicate = result.status === 409;

  if (isSuccess || isDuplicate) {
    await supabase.from("orders").update({ status: "completed" }).eq("reference", reference);

    if (agent.telegram_chat_id) {
      sendAgentNotification(
        agent.telegram_chat_id,
        `✅ Data Sent!\n\n📱 ${network.toUpperCase()} ${label} → ${cleaned}\n💰 GH₵${costPrice.toFixed(2)} deducted\n💳 Wallet left: GH₵${(walletBalance - costPrice).toFixed(2)}`
      ).catch(() => {});
    }

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

  if (isFailed) {
    await supabase.from("agents").update({ wallet_balance: walletBalance }).eq("id", agentId);
    await supabase.from("orders").update({ status: "failed" }).eq("reference", reference);
    return Response.json({
      error: `Delivery failed for ${cleaned}. Your wallet has been refunded.`,
      refunded: true,
    }, { status: 400 });
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
