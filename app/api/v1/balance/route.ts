import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/apiKeyAuth";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const auth = await authenticateApiKey(request);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: 401 });

  // Get recent transactions
  const { data: txns } = await supabase
    .from("api_wallet_transactions")
    .select("type, amount, description, reference, balance_after, created_at")
    .eq("api_key_id", auth.keyId)
    .order("created_at", { ascending: false })
    .limit(10);

  return NextResponse.json({
    success: true,
    balance: auth.walletBalance,
    currency: "GHS",
    recent_transactions: (txns ?? []).map(t => ({
      type: t.type,
      amount: Number(t.amount),
      description: t.description,
      reference: t.reference,
      balance_after: Number(t.balance_after),
      date: t.created_at,
    })),
  });
}
