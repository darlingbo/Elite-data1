import { NextRequest } from "next/server";
import crypto from "crypto";
import { supabase } from "@/lib/supabase";
import { bundles, type Network } from "@/lib/bundles";
import { sendAdminAlert, orderApprovalKeyboard } from "@/lib/telegram";
import { sendCustomerSMS, orderReceivedSMS } from "@/lib/sms";

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
        // Use admin tier price as wallet deduction, not Inventor cost
        const { data: tierRow } = await supabase.from("custom_tier_prices").select("price").eq("bundle_id", bundleId).maybeSingle();
        const adminTierPrice = tierRow?.price ? Number(tierRow.price) : costPrice;
        agentCommission = parseFloat(Math.max(0, chargedAmount - adminTierPrice).toFixed(2));
        adminCommission = parseFloat(Math.max(0, adminTierPrice - costPrice).toFixed(2));
        // Deduct wallet using admin tier price
        await supabase.from("agents").update({
          wallet_balance: Math.max(0, Number(agent.wallet_balance ?? 0) - adminTierPrice),
          paystack_wallet_balance: Math.max(0, Number(agent.paystack_wallet_balance ?? 0) - adminTierPrice),
        }).eq("id", agent.id);
      } else {
        const profit = Math.max(0, chargedAmount - costPrice);
        agentCommission = parseFloat((profit * 0.8).toFixed(2));
        adminCommission = parseFloat((profit * 0.2).toFixed(2));
      }
    }
  }

  // Save order as pending_approval — do not call Inventor until admin approves
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
    status: "pending_approval",
  }).then(() => {});

  await sendAdminAlert(
    `🔔 <b>Webhook Order — APPROVE TO DELIVER</b>\n📱 ${(network ?? "").toUpperCase()} ${bundleSize} → <code>${phone}</code>\n💰 GH₵${chargedAmount} | ${agentName ? `Agent: ${agentName}` : "Direct"}\n📎 <code>${reference}</code>`,
    orderApprovalKeyboard(reference)
  ).catch(() => {});

  sendCustomerSMS(phone, orderReceivedSMS(name, network, bundleSize, phone, reference)).catch(() => {});

  return Response.json({ ok: true });
}
