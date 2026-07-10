import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendSwiftAlert } from "@/lib/telegram";

// Ghana is UTC+0 year-round
function getGhanaTime() {
  const now = new Date();
  const ghHour = now.getUTCHours();
  const ghDay  = now.getUTCDay(); // 0=Sun, 1=Mon … 6=Sat
  return { ghHour, ghDay };
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { agentId, referralCode, name, amount, method, accountNumber, accountName } = body;

  if (!agentId || !amount || !method || !accountNumber || !accountName) {
    return Response.json({ error: "All fields are required." }, { status: 400 });
  }

  const amt = Number(amount);

  const { data: agent } = await supabase
    .from("agents")
    .select("commission_balance, paystack_wallet_balance, wallet_balance, agent_type, name, referral_code, status")
    .eq("id", agentId)
    .maybeSingle();

  if (!agent) return Response.json({ error: "Agent not found." }, { status: 404 });
  if (agent.status !== "approved") return Response.json({ error: "Only approved agents can withdraw." }, { status: 403 });

  if (!referralCode || agent.referral_code?.toUpperCase() !== String(referralCode).toUpperCase()) {
    return Response.json({ error: "Unauthorized." }, { status: 403 });
  }

  // ── Withdrawal rules by agent type ───────────────────────────────────────
  // custom_price agents keep original rules (no time restriction, min GH₵50)
  const agentType = agent.agent_type ?? "commission";

  if (agentType !== "custom_price") {
    const { ghHour, ghDay } = getGhanaTime();
    const isPro = agentType === "pro";

    // Hours: 6AM–6PM Ghana time for both types
    if (ghHour < 6 || ghHour >= 18) {
      return Response.json({ error: "Withdrawals are only available between 6:00 AM and 6:00 PM Ghana time." }, { status: 400 });
    }

    // Days: Pro = Mon–Sun (all days). Free = Mon–Fri only (ghDay 1–5)
    if (!isPro && (ghDay === 0 || ghDay === 6)) {
      return Response.json({ error: "Free agents can only withdraw Monday to Friday. Upgrade to Pro for weekend withdrawals." }, { status: 400 });
    }

    // Minimums: Pro = GH₵40, Free = GH₵20
    const minWithdraw = isPro ? 40 : 20;
    if (amt < minWithdraw) {
      return Response.json({ error: `Minimum withdrawal is GH₵${minWithdraw} for ${isPro ? "Pro" : "Free"} agents.` }, { status: 400 });
    }
  } else {
    // Original rule for custom_price agents
    if (amt < 50) {
      return Response.json({ error: "Minimum withdrawal is GH₵50." }, { status: 400 });
    }
  }

  const commissionBal = Number(agent.commission_balance ?? 0);
  const paystackBal = agent.agent_type === "custom_price" ? Number(agent.paystack_wallet_balance ?? 0) : 0;
  const withdrawable = parseFloat((commissionBal + paystackBal).toFixed(2));

  if (withdrawable < amt) {
    const msg = agent.agent_type === "custom_price"
      ? `Insufficient balance. Withdrawable: GH₵${withdrawable.toFixed(2)} (Profit: GH₵${commissionBal.toFixed(2)} + Paystack deposits: GH₵${paystackBal.toFixed(2)})`
      : `Insufficient balance. Available: GH₵${commissionBal.toFixed(2)}`;
    return Response.json({ error: msg }, { status: 400 });
  }

  // Save as PENDING — admin must approve before money moves
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
