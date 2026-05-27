import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendAdminAlert } from "@/lib/telegram";

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
    .select("commission_balance, name, referral_code, status")
    .eq("id", agentId)
    .maybeSingle();

  if (!agent) return Response.json({ error: "Agent not found." }, { status: 404 });
  if (agent.status !== "approved") return Response.json({ error: "Only approved agents can withdraw." }, { status: 403 });

  // Verify referralCode matches this agentId — prevents anyone with just an ID from stealing funds
  if (!referralCode || agent.referral_code?.toUpperCase() !== String(referralCode).toUpperCase()) {
    return Response.json({ error: "Unauthorized." }, { status: 403 });
  }

  if (Number(agent.commission_balance) < amt) {
    return Response.json({
      error: `Insufficient balance. Available: GH₵${Number(agent.commission_balance).toFixed(2)}`,
    }, { status: 400 });
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

  // 3. Deduct from agent's commission balance
  const newBalance = parseFloat((Number(agent.commission_balance) - amt).toFixed(2));
  await supabase.from("agents").update({ commission_balance: newBalance }).eq("id", agentId);

  // Log withdrawal transaction
  supabase.from("agent_wallet_transactions").insert({
    agent_id: agentId,
    type: "withdrawal",
    amount: -amt,
    description: `Withdrawal via ${method} to ${accountNumber}`,
  }).then(() => {});

  // 4. Notify admin
  await sendAdminAlert(
    `✅ AUTO WITHDRAWAL SENT\n` +
    `👤 ${name} (${referralCode ?? "—"})\n` +
    `💰 GH₵${amt.toFixed(2)} via ${method}\n` +
    `📞 ${accountNumber} (${accountName})\n` +
    `🏦 Paystack: ${transferCode ?? "—"} [${transferStatus ?? "pending"}]\n` +
    `💳 New agent balance: GH₵${newBalance.toFixed(2)}`
  ).catch(() => {});

  return Response.json({ success: true, transferCode, status: transferStatus });
}
