import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendSwiftAlert } from "@/lib/telegram";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { agentId, referralCode, name, amount, method, accountNumber, accountName } = body;

  if (!agentId || !amount || !method || !accountNumber || !accountName) {
    return Response.json({ error: "All fields are required." }, { status: 400 });
  }

  const amt = Number(amount);
  if (!amt || amt < 50) {
    return Response.json({ error: "Minimum withdrawal is GH₵50." }, { status: 400 });
  }

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
