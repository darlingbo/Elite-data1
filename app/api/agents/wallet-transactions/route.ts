import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const agentId      = request.nextUrl.searchParams.get("agentId");
  const referralCode = request.nextUrl.searchParams.get("referralCode");
  if (!agentId || !referralCode) return Response.json({ error: "agentId and referralCode required" }, { status: 400 });

  // Verify ownership before returning financial data
  const { data: agent } = await supabase
    .from("agents")
    .select("id")
    .eq("id", agentId)
    .eq("referral_code", referralCode.toUpperCase())
    .maybeSingle();
  if (!agent) return Response.json({ error: "Unauthorized." }, { status: 403 });

  const { data, error } = await supabase
    .from("agent_wallet_transactions")
    .select("id, type, amount, description, created_at")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ transactions: data ?? [] });
}
