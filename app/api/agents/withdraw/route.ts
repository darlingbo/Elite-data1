import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendSwiftAlert } from "@/lib/telegram";
import { requireAgentSession } from "@/lib/agentAuth";
import { withdrawSchema, parseBody } from "@/lib/validation";

// Ghana is UTC+0 year-round
function getGhanaTime() {
  const now = new Date();
  const ghHour = now.getUTCHours();
  const ghDay  = now.getUTCDay(); // 0=Sun, 1=Mon … 6=Sat
  return { ghHour, ghDay };
}

export async function POST(request: NextRequest) {
  const parsed = parseBody(withdrawSchema, await request.json().catch(() => null));
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }
  const { agentId, referralCode, name, amount, method, accountNumber, accountName } = parsed.data;

  // Money leaves the platform here -> require a password-level session bound to
  // this agent. A public referral-code session is not enough.
  const auth = requireAgentSession(request, agentId, { requireFull: true });
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const amt = amount;

  const { data: agent } = await supabase
    .from("agents")
    .select("commission_balance, paystack_wallet_balance, wallet_balance, agent_type, plan, name, referral_code, status")
    .eq("id", agentId)
    .maybeSingle();

  if (!agent) return Response.json({ error: "Agent not found." }, { status: 404 });
  if (agent.status !== "approved") return Response.json({ error: "Only approved agents can withdraw." }, { status: 403 });

  if (!referralCode || agent.referral_code?.toUpperCase() !== String(referralCode).toUpperCase()) {
    return Response.json({ error: "Unauthorized." }, { status: 403 });
  }

  // ── Withdrawal rules by plan ──────────────────────────────────────────────
  // Pro plan: Mon–Sun 6AM–6PM, min GH₵40
  // Free plan: Mon–Fri 6AM–6PM, min GH₵20
  const agentType = (agent as { agent_type?: string }).agent_type ?? "commission";
  const isPro = (agent as { plan?: string }).plan === "pro";

  const { ghHour, ghDay } = getGhanaTime();

  if (ghHour < 6 || ghHour >= 18) {
    return Response.json({ error: "Withdrawals are only available between 6:00 AM and 6:00 PM Ghana time." }, { status: 400 });
  }

  if (!isPro && (ghDay === 0 || ghDay === 6)) {
    return Response.json({ error: "Free agents can only withdraw Monday to Friday. Upgrade to Pro for weekend withdrawals." }, { status: 400 });
  }

  const minWithdraw = 20;
  if (amt < minWithdraw) {
    return Response.json({ error: `Minimum withdrawal is GH₵${minWithdraw}.` }, { status: 400 });
  }

  const commissionBal = Number(agent.commission_balance ?? 0);
  const paystackBal = agentType === "custom_price" ? Number(agent.paystack_wallet_balance ?? 0) : 0;
  const withdrawable = parseFloat((commissionBal + paystackBal).toFixed(2));

  if (withdrawable < amt) {
    const msg = agent.agent_type === "custom_price"
      ? `Insufficient balance. Withdrawable: GH₵${withdrawable.toFixed(2)} (Profit: GH₵${commissionBal.toFixed(2)} + Paystack deposits: GH₵${paystackBal.toFixed(2)})`
      : `Insufficient balance. Available: GH₵${commissionBal.toFixed(2)}`;
    return Response.json({ error: msg }, { status: 400 });
  }

  // Deduct balance immediately so the dashboard shows the correct available amount.
  // If admin rejects, the balance is refunded.
  const fromCommission = Math.min(amt, commissionBal);
  const fromPaystack   = parseFloat((amt - fromCommission).toFixed(2));
  const balanceUpdate: Record<string, number> = {
    commission_balance: parseFloat((commissionBal - fromCommission).toFixed(2)),
  };
  if (agentType === "custom_price" && fromPaystack > 0) {
    balanceUpdate.paystack_wallet_balance = Math.max(0, paystackBal - fromPaystack);
    balanceUpdate.wallet_balance = Math.max(0, Number(agent.wallet_balance ?? 0) - fromPaystack);
  }
  const { error: balErr } = await supabase.from("agents").update(balanceUpdate).eq("id", agentId);
  if (balErr) {
    return Response.json({ error: "Failed to reserve balance. Try again." }, { status: 500 });
  }

  // Save as PENDING — admin must approve before money is sent
  const { data: txn, error: txnError } = await supabase
    .from("agent_wallet_transactions")
    .insert({
      agent_id: agentId,
      type: "withdrawal",
      amount: -amt,
      description: `Withdrawal via ${method} to ${accountNumber} (${accountName})`,
      status: "pending",
    })
    .select("id")
    .single();

  if (txnError || !txn) {
    // Roll back the balance deduction
    await supabase.from("agents").update({
      commission_balance: commissionBal,
      ...(agentType === "custom_price" && fromPaystack > 0 ? {
        paystack_wallet_balance: paystackBal,
        wallet_balance: Number(agent.wallet_balance ?? 0),
      } : {}),
    }).eq("id", agentId);
    return Response.json({ error: "Failed to create withdrawal request. Try again." }, { status: 500 });
  }

  // Alert admin on swaftdatagh_bot
  await sendSwiftAlert(
    `💰 <b>WITHDRAWAL REQUEST</b>\n\n` +
    `👤 ${name} (${referralCode ?? "—"})\n` +
    `💵 GH₵${amt.toFixed(2)} via ${method}\n` +
    `📞 ${accountNumber} (${accountName})\n` +
    `💳 Balance: GH₵${withdrawable.toFixed(2)}\n\n` +
    `➡️ Go to Admin → Withdrawal Requests to approve or reject.`
  ).catch(() => {});

  return Response.json({ success: true, status: "pending", message: "Withdrawal request submitted. Admin will process it within 24 hours." });
}
