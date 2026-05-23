import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let balance: number | null = null;
  try {
    const res = await fetch(`${process.env.INVENTOR_API_BASE_URL}/api/developer/balance`, {
      headers: { Authorization: `Bearer ${process.env.INVENTOR_API_KEY}` },
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      const raw =
        data?.balance ??
        data?.data?.balance ??
        data?.wallet_balance ??
        data?.data?.wallet_balance ??
        data?.amount ??
        data?.data?.amount ??
        null;
      if (raw !== null) balance = Number(raw);
    }
  } catch { /* silent */ }

  if (balance === null) {
    return Response.json({ error: "Could not fetch Inventor API balance" }, { status: 502 });
  }

  // Midnight UTC = Start of Day Ghana time (Ghana is UTC+0)
  const hourUtc = new Date().getUTCHours();
  const note = hourUtc === 0 ? "Start of Day (auto)" : "End of Day (auto)";

  const { error } = await supabase.from("api_ledger").insert({
    type: "snapshot",
    amount: balance,
    balance_after: balance,
    note,
  });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ success: true, balance, note });
}
