import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get("admin_session")?.value === process.env.ADMIN_SESSION_TOKEN;
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

  const newBalance = parseFloat((Number(key.wallet_balance) + amount).toFixed(2));

  const { error: updateErr } = await supabase
    .from("api_keys")
    .update({ wallet_balance: newBalance })
    .eq("id", keyId);

  if (updateErr) return Response.json({ error: updateErr.message }, { status: 500 });

  // Log the credit
  await supabase.from("api_wallet_transactions").insert({
    api_key_id: keyId,
    type: "credit",
    amount,
    description: note || `Manual top-up by admin`,
    balance_after: newBalance,
  });

  return Response.json({
    success: true,
    name: key.name,
    amount_added: amount,
    new_balance: newBalance,
  });
}
