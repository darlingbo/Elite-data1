import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendSwiftAlert } from "@/lib/telegram";

const methodToBankCode: Record<string, string> = {
  "MTN MoMo": "MTN",
  "Telecel Cash": "VDF",
  "AirtelTigo": "ATL",
};

async function paystackPost(path: string, body: Record<string, unknown>) {
  const res = await fetch(`https://api.paystack.co${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
    },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<Record<string, unknown>>;
}

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

  // Verify referralCode matches this agentId
  if (!referralCode || agent.referral_code?.toUpperCase() !== String(referralCode).toUpperCase()) {
    return Response.json({ error: "Unauthorized." }, { status: 403 });
  }

  // For custom_price agents: can withdraw commission (profit) + Paystack-deposited wallet funds
  // For commission agents: can only withdraw commission balance
  const commissionBal = Number(agent.commission_balance ?? 0);
  const paystackBal = agent.agent_type === "custom_price" ? Number(agent.paystack_wallet_balance ?? 0) : 0;
  const withdrawable = parseFloat((commissionBal + paystackBal).toFixed(2));

  if (withdrawable < amt) {
    const msg = agent.agent_type === "custom_price"
      ? `Insufficient balance. Withdrawable: GH₵${withdrawable.toFixed(2)} (Profit: GH₵${commissionBal.toFixed(2)} + Paystack deposits: GH₵${paystackBal.toFixed(2)})`
      : `Insufficient balance. Available: GH₵${commissionBal.toFixed(2)}`;
    return Response.json({ error: msg }, { status: 400 });
  }

  const bankCode = methodToBankCode[method];
  if (!bankCode) {
    return Response.json({ error: "Unsupported withdrawal method." }, { status: 400 });
  }

  // 1. Create Paystack transfer recipient
  let recipientCode: string;
  try {
    const recipientRes = await paystackPost("/transferrecipient", {
      type: "mobile_money",
      name: accountName,
      account_number: accountNumber.replace(/\s/g, ""),
      bank_code: bankCode,
      currency: "GHS",
    });
    if (!recipientRes.status) {
      return Response.json({
        error: `Could not set up recipient: ${recipientRes.message ?? "Paystack error"}`,
      }, { status: 502 });
    }
    const data = recipientRes.data as Record<string, unknown>;
    recipientCode = data?.recipient_code as string;
    if (!recipientCode) throw new Error("No recipient_code returned");
  } catch (err) {
    return Response.json({ error: `Recipient setup failed: ${err instanceof Error ? err.message : String(err)}` }, { status: 502 });
  }

  // 2. Initiate Paystack transfer (amount in pesewas)
  let transferCode: string | undefined;
  let transferStatus: string | undefined;
  try {
    const transferRes = await paystackPost("/transfer", {
      source: "balance",
      amount: Math.round(amt * 100),
      recipient: recipientCode,
      reason: `Elite Data withdrawal — Agent ${referralCode ?? name}`,
      currency: "GHS",
    });

    if (!transferRes.status) {
      const msg = String(transferRes.message ?? "");
      // OTP required — admin hasn't disabled transfer OTP in Paystack settings
      if (msg.toLowerCase().includes("otp")) {
        return Response.json({
          error: "Auto-transfer requires OTP to be disabled in your Paystack dashboard (Settings → Transfers → Disable OTP).",
        }, { status: 503 });
      }
      return Response.json({ error: `Transfer failed: ${msg || "Paystack error"}` }, { status: 502 });
    }

    const tData = transferRes.data as Record<string, unknown>;
    transferCode = tData?.transfer_code as string | undefined;
    transferStatus = tData?.status as string | undefined;
  } catch (err) {
    return Response.json({ error: `Transfer error: ${err instanceof Error ? err.message : String(err)}` }, { status: 502 });
  }

  // 3. Deduct from commission first, then from Paystack wallet portion
  const fromCommission = Math.min(amt, commissionBal);
  const fromPaystack = parseFloat((amt - fromCommission).toFixed(2));
  const newCommission = parseFloat((commissionBal - fromCommission).toFixed(2));
  const newPaystackBal = parseFloat(Math.max(0, paystackBal - fromPaystack).toFixed(2));
  const newWalletBal = parseFloat(Math.max(0, Number(agent.wallet_balance ?? 0) - fromPaystack).toFixed(2));

  const updateFields: Record<string, number> = { commission_balance: newCommission };
  if (agent.agent_type === "custom_price" && fromPaystack > 0) {
    updateFields.paystack_wallet_balance = newPaystackBal;
    updateFields.wallet_balance = newWalletBal;
  }
  await supabase.from("agents").update(updateFields).eq("id", agentId);

  // Log withdrawal transaction
  supabase.from("agent_wallet_transactions").insert({
    agent_id: agentId,
    type: "withdrawal",
    amount: -amt,
    description: `Withdrawal via ${method} to ${accountNumber}`,
  }).then(() => {});

  // 4. Notify admin
  await sendSwiftAlert(
    `✅ AUTO WITHDRAWAL SENT\n` +
    `👤 ${name} (${referralCode ?? "—"})\n` +
    `💰 GH₵${amt.toFixed(2)} via ${method}\n` +
    `📞 ${accountNumber} (${accountName})\n` +
    `🏦 Paystack: ${transferCode ?? "—"} [${transferStatus ?? "pending"}]\n` +
    `💳 New commission balance: GH₵${newCommission.toFixed(2)}`
  ).catch(() => {});

  return Response.json({ success: true, transferCode, status: transferStatus });
}
