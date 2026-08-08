import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { verifyAdminSessionValue } from "@/lib/adminAuth";
import { sendWalletTopupAlert, tgEscape } from "@/lib/telegram";
import { formatCurrency, roundCurrency } from "@/lib/finance";

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifyAdminSessionValue(cookieStore.get("admin_session")?.value);
}

export async function POST(request: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { keyId, amount, note } = await request.json() as { keyId: string; amount: number; note?: string };

  if (!keyId || !amount || amount <= 0) {
    return Response.json({ error: "keyId and a positive amount are required." }, { status: 400 });
  }

  // Get current balance
  const { data: key, error: fetchErr } = await supabase
    .from("api_keys")
    .select("id, name, wallet_balance")
    .eq("id", keyId)
    .maybeSingle();

  if (fetchErr || !key) return Response.json({ error: "API key not found." }, { status: 404 });

  const roundedAmount = roundCurrency(Number(amount));
  const reference = `ADMIN-API-TOPUP-${crypto.randomUUID()}`;
  const { data: creditedBalance, error: updateErr } = await supabase.rpc("credit_api_wallet", {
    p_api_key_id: keyId,
    p_reference: reference,
    p_amount: roundedAmount,
    p_description: note || "Manual top-up by admin",
  });
  if (updateErr || creditedBalance == null) {
    return Response.json({ error: updateErr?.message ?? "Could not credit API wallet." }, { status: 500 });
  }
  const newBalance = roundCurrency(Number(creditedBalance));

  await sendWalletTopupAlert(
    `💳 <b>MANUAL API WALLET TOP-UP</b>\n\n` +
    `👤 Account: <b>${tgEscape(key.name ?? "API customer")}</b>\n` +
    `💵 Amount: <b>${formatCurrency(roundedAmount)}</b>\n` +
    `💰 New balance: <b>${formatCurrency(newBalance)}</b>\n` +
    `📝 Purpose: ${tgEscape(note || "Manual top-up by admin")}\n` +
    `📎 Ref: <code>${reference}</code>`,
  ).catch(() => {});

  return Response.json({
    success: true,
    name: key.name,
    amount_added: roundedAmount,
    new_balance: newBalance,
  });
}
