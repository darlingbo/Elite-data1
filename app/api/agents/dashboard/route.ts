import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return Response.json({ error: "Referral code required" }, { status: 400 });
  }

  const { data: agent, error } = await supabase
    .from("agents")
    .select("id, name, email, referral_code, commission_balance, total_sales, total_revenue, status")
    .eq("referral_code", code.toUpperCase())
    .eq("status", "approved")
    .maybeSingle();

  if (error || !agent) {
    return Response.json({ error: "Agent not found or not yet approved." }, { status: 404 });
  }

  const { data: orders } = await supabase
    .from("orders")
    .select("reference, bundle_size, network, amount, agent_commission, status, created_at, phone")
    .eq("agent_id", agent.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return Response.json({ success: true, agent: { ...agent, orders: orders ?? [] } });
}
