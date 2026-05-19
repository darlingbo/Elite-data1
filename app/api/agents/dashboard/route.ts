import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const email = request.nextUrl.searchParams.get("email");

  if (!code && !email) {
    return Response.json({ error: "Referral code or email required" }, { status: 400 });
  }

  // Build query — match by code OR email
  const query = supabase
    .from("agents")
    .select("id, name, email, referral_code, commission_balance, total_sales, total_revenue, status");

  const { data: agent, error } = await (
    code
      ? query.eq("referral_code", code.toUpperCase())
      : query.eq("email", email!.toLowerCase().trim())
  ).maybeSingle();

  if (error || !agent) {
    return Response.json({ error: "Agent not found. Check your referral code or email and try again." }, { status: 404 });
  }

  if (agent.status === "pending") {
    return Response.json({ error: "Your application is still under review. We will contact you once approved." }, { status: 403 });
  }
  if (agent.status === "rejected") {
    return Response.json({ error: "Your application was not approved. Please contact support on WhatsApp." }, { status: 403 });
  }
  if (agent.status !== "approved") {
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
