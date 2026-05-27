import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const agentId = request.nextUrl.searchParams.get("agentId");
  if (!agentId) return Response.json({ error: "agentId required" }, { status: 400 });

  const { data, error } = await supabase
    .from("agent_wallet_transactions")
    .select("id, type, amount, description, created_at")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ transactions: data ?? [] });
}
