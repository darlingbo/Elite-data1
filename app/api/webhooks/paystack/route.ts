import { NextRequest } from "next/server";
import crypto from "crypto";
import { supabase } from "@/lib/supabase";
import { bundles, networkApiName, sizeLabel, type Network } from "@/lib/bundles";
import { sendAdminAlert, fmtDelivered, fmtFailed } from "@/lib/telegram";

const INVENTOR_TIMEOUT_MS = 15_000;

async function callInventor(payload: Record<string, unknown>) {
  try {
    const res = await fetch(`${process.env.INVENTOR_API_BASE_URL}/api/developer/purchase`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.INVENTOR_API_KEY}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(INVENTOR_TIMEOUT_MS),
    });
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    return { ok: false, status: 0, body: { error: String(err) } };
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  // Verify Paystack signature
  const sig = request.headers.get("x-paystack-signature");
  const expected = crypto
    .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY ?? "")
    .update(rawBody)
    .digest("hex");
  if (!sig || sig !== expected) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: Record<string, unknown>;
  try { event = JSON.parse(rawBody); } catch { return Response.json({ ok: true }); }

  // Only handle successful charges
  if (event.event !== "charge.success") return Response.json({ ok: true });

  const data = event.data as Record<string, unknown>;
  const reference = String(data.reference ?? "");
  if (!reference) return Response.json({ ok: true });

  // Idempotency — if already processed, skip
  const { data: existing } = await supabase
    .from("orders").select("reference, status").eq("reference", reference).maybeSingle();
  if (existing) return Response.json({ ok: true }); // already handled by client callback

  const amountKobo = Number(data.amount ?? 0);
  const chargedAmount = parseFloat((amountKobo / 100).toFixed(2));
  const customer = data.customer as Record<string, string> ?? {};
  const meta = data.metadata as Record<string, unknown> ?? {};
  const fields = (meta.custom_fields as Array<Record<string, string>>) ?? [];
  const getField = (name: string) => fields.find(f => f.variable_name === name)?.value ?? "";

  const name = getField("name") || customer.first_name || "Customer";
  const phone = getField("phone") ?? "";
  const bundleId = getField("bundle_id") ?? "";
  const agentCode = getField("agent_code") ?? "";
  const email = customer.email ?? `${phone}@elitedata1.com`;

  if (!phone || !bundleId) {
    await sendAdminAlert(
      `⚠️ <b>Webhook: Payment with missing data</b>\nRef: <code>${reference}</code>\nAmount: GH₵${chargedAmount}\nPhone: ${phone || "missing"}\nBundle ID: ${bundleId || "missing"}\n\nCheck Paystack dashboard and deliver manually if needed.`
    ).catch(() => {});
    return Response.json({ ok: true });
  }

  // Resolve bundle
  const staticBundle = bundles.find(b => b.id === bundleId);
  const { data: dbBundle } = await supabase
    .from("bundle_prices")
    .select("id, network, size_label, size_gb, price, cost_price")
    .eq("id", bundleId).eq("active", true).maybeSingle();

  const network = (dbBundle?.network ?? staticBundle?.network) as Network | undefined;
  const costPrice = dbBundle?.cost_price ?? staticBundle?.costPrice ?? 0;
  const bundleSize = dbBundle?.size_label ?? staticBundle?.size ?? bundleId;
  const sizeGB = dbBundle?.size_gb ?? staticBundle?.sizeGB ?? 1;

  if (!network) {
    await sendAdminAlert(
      `⚠️ <b>Webhook: Unknown bundle</b>\nRef: <code>${reference}</code>\nBundle ID: ${bundleId}\nPhone: ${phone}\nAmount: GH₵${chargedAmount}\n\nDeliver manually.`
    ).catch(() => {});
    return Response.json({ ok: true });
  }

  // Resolve agent
  let agentId: string | null = null;
  let agentName: string | undefined;
  let agentCommission = 0;
  let adminCommission = parseFloat(Math.max(0, chargedAmount - costPrice).toFixed(2));

  if (agentCode) {
    const { data: agent } = await supabase
      .from("agents").select("id, name, agent_type, commission_balance, wallet_balance, paystack_wallet_balance")
      .eq("referral_code", agentCode.toUpperCase()).eq("status", "approved").maybeSingle();
    if (agent) {
      agentId = agent.id;
      agentName = agent.name;
      if (agent.agent_type === "custom_price") {
        agentCommission = parseFloat(Math.max(0, chargedAmount - costPrice).toFixed(2));
        adminCommission = 0;
        // Deduct wallet
        await supabase.from("agents").update({
          wallet_balance: Math.max(0, Number(agent.wallet_balance ?? 0) - costPrice),
          paystack_wallet_balance: Math.max(0, Number(agent.paystack_wallet_balance ?? 0) - costPrice),
        }).eq("id", agent.id);
      } else {
        const profit = Math.max(0, chargedAmount - costPrice);
        agentCommission = parseFloat((profit * 0.8).toFixed(2));
        adminCommission = parseFloat((profit * 0.2).toFixed(2));
      }
    }
  }

  // Save order as pending first
  await supabase.from("orders").insert({
    reference,
    paystack_reference: reference,
    customer_name: name,
    customer_email: email,
    phone,
    network,
    bundle_size: bundleSize,
    bundle_size_gb: sizeGB,
    amount: chargedAmount,
    cost_price: costPrice,
    admin_commission: adminCommission,
    agent_commission: agentCommission,
    agent_id: agentId,
    status: "pending",
  }).then(() => {});

  await sendAdminAlert(
    `🔔 <b>Webhook Order</b> (browser may have closed)\n📱 ${(network ?? "").toUpperCase()} ${bundleSize} → <code>${phone}</code>\n💰 GH₵${chargedAmount} | ${agentName ? `Agent: ${agentName}` : "Direct"}\n📎 <code>${reference}</code>`
  ).catch(() => {});

  // Deliver via Inventor
  const { ok: invOk, body: invBody } = await callInventor({
    network: networkApiName[network],
    Phone: phone,
    Datasize: sizeGB,
    reference,
  });

  const invData = (invBody.data as Record<string, unknown>) ?? {};
  const invOrder = (invData.order as Record<string, unknown>) ?? invData;
  const rawStatus = String(invOrder.status ?? invData.status ?? invBody.status ?? "").toLowerCase();
  const isProcessing = rawStatus.includes("process") || rawStatus.includes("progress") || rawStatus.includes("dispatch") || rawStatus.includes("pending");
  const isCompleted = invOk && !isProcessing && (rawStatus.includes("complet") || rawStatus.includes("success") || rawStatus.includes("deliver") || rawStatus === "00");
  const deliveryStatus = isCompleted ? "completed" : isProcessing ? "processing" : "failed";

  await supabase.from("orders").update({ status: deliveryStatus }).eq("reference", reference);

  if (isCompleted) {
    if (agentId && agentCommission > 0) {
      const { data: ag } = await supabase.from("agents").select("commission_balance, total_sales, total_revenue").eq("id", agentId).maybeSingle();
      if (ag) {
        await supabase.from("agents").update({
          commission_balance: Number(ag.commission_balance ?? 0) + agentCommission,
          total_sales: Number(ag.total_sales ?? 0) + 1,
          total_revenue: Number(ag.total_revenue ?? 0) + chargedAmount,
        }).eq("id", agentId);
      }
    }
    await sendAdminAlert(`${fmtDelivered(reference, phone, network, bundleSize)} [via webhook]`).catch(() => {});
  } else if (!isProcessing) {
    await sendAdminAlert(
      `${fmtFailed(reference, phone, network, bundleSize, chargedAmount)}\n\n[via webhook — Inventor: ${JSON.stringify(invBody).slice(0, 200)}]`
    ).catch(() => {});
  }

  return Response.json({ ok: true });
}
