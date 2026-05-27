import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

// Pings the DB every few days to prevent Supabase free-tier from pausing due to inactivity
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { count, error } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true });

  return Response.json({
    ok: !error,
    orders: count ?? 0,
    ts: new Date().toISOString(),
    ...(error ? { error: error.message } : {}),
  });
}
