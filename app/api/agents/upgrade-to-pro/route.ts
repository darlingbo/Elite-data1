import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendAssistantAlert } from "@/lib/telegram";
import { requireAgentSession } from "@/lib/agentAuth";
import { syncProAgentSubAdmin } from "@/lib/pro-subadmin";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { agentId, referralCode, paystackRef } = body;

  if (!agentId || !referralCode || !paystackRef) {
    return Response.json({ error: "agentId, referralCode, and paystackRef are required." }, { status: 400 });
  }

  const auth = requireAgentSession(request, agentId, { requireFull: true });
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  // Verify ownership
  const { data: agent } = await supabase
    .from("agents")
    .select("id, name, agent_type, plan, pro_payment_ref, status, referral_code")
    .eq("id", agentId)
    .eq("referral_code", String(referralCode).toUpperCase())
    .maybeSingle();

  if (!agent) return Response.json({ error: "Agent not found." }, { status: 404 });
  if (agent.status !== "approved") return Response.json({ error: "Only approved agents can upgrade." }, { status: 403 });
  if ((agent as { plan?: string }).plan === "pro") return Response.json({ error: "You are already a Pro Agent." }, { status: 409 });

  // Block duplicate payment reference
  const { data: dupCheck } = await supabase
    .from("agents")
    .select("id")
    .eq("pro_payment_ref", paystackRef)
    .maybeSingle();
  if (dupCheck) return Response.json({ error: "This payment has already been used." }, { status: 409 });

  // Verify with Paystack
  let psData: Record<string, unknown> = {};
  try {
    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(paystackRef)}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
      signal: AbortSignal.timeout(8000),
    });
    psData = await res.json();
  } catch (err) {
    return Response.json({ error: `Paystack verification failed: ${String(err)}` }, { status: 502 });
  }

  if (psData.status !== true || (psData.data as Record<string, unknown>)?.status !== "success") {
    return Response.json({ error: "Payment not confirmed by Paystack." }, { status: 400 });
  }

  const amountKobo = Number((psData.data as Record<string, unknown>)?.amount ?? 0);
  const amountGhc = Math.round(amountKobo / 100);

  if (amountGhc < 100) {
    return Response.json({ error: `Payment amount GH₵${amountGhc} is less than the required GH₵100.` }, { status: 400 });
  }

  // Upgrade agent to pro plan; keep agent_type as custom_price (they set own prices)
  const { error: updateErr } = await supabase
    .from("agents")
    .update({
      plan: "pro",
      agent_type: "custom_price",
      pro_payment_ref: paystackRef,
      pro_upgraded_at: new Date().toISOString(),
    })
    .eq("id", agentId);

  if (updateErr) return Response.json({ error: updateErr.message }, { status: 500 });

  const { data: upgradedAgent } = await supabase.from("agents").select("id,name,email,password_hash,plan,status,sub_admin_id").eq("id", agentId).single();
  if (upgradedAgent) await syncProAgentSubAdmin(upgradedAgent);

  // Alert admin
  sendAssistantAlert(
    `⭐ <b>PRO AGENT UPGRADE</b>\n\n` +
    `👤 ${agent.name} (${agent.referral_code})\n` +
    `💰 GH₵${amountGhc} paid\n` +
    `🧾 Ref: <code>${paystackRef}</code>`
  ).catch(() => {});

  return Response.json({ success: true, message: "Welcome to Pro! Your account has been upgraded." });
}
