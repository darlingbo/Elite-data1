import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const email = request.nextUrl.searchParams.get("email");
  const password = request.nextUrl.searchParams.get("password");

  if (!code && !email) {
    return Response.json({ error: "Referral code or email required." }, { status: 400 });
  }

  const { data: agent, error } = await (
    code
      ? supabase.from("agents").select("id, name, email, referral_code, commission_balance, total_sales, total_revenue, status, password_hash").eq("referral_code", code.toUpperCase()).maybeSingle()
      : supabase.from("agents").select("id, name, email, referral_code, commission_balance, total_sales, total_revenue, status, password_hash").eq("email", email!.toLowerCase().trim()).maybeSingle()
  );

  if (error) {
    // password_hash column may not exist yet — retry without it
    const { data: agent2, error: err2 } = await (
      code
        ? supabase.from("agents").select("id, name, email, referral_code, commission_balance, total_sales, total_revenue, status").eq("referral_code", code.toUpperCase()).maybeSingle()
        : supabase.from("agents").select("id, name, email, referral_code, commission_balance, total_sales, total_revenue, status").eq("email", email!.toLowerCase().trim()).maybeSingle()
    );

    if (err2 || !agent2) {
      return Response.json({ error: "Agent not found. Check your details and try again." }, { status: 404 });
    }

    return handleAgentResponse(agent2, null, password);
  }

  if (!agent) {
    return Response.json({ error: "Agent not found. Check your details and try again." }, { status: 404 });
  }

  return handleAgentResponse(agent, agent.password_hash ?? null, password);
}

async function handleAgentResponse(
  agent: { id: string; name: string; email: string; referral_code: string | null; commission_balance: number; total_sales: number; total_revenue?: number; status: string },
  storedHash: string | null,
  password: string | null
) {
  if (agent.status === "pending") {
    return Response.json({ error: "Your application is still under review. Contact admin on WhatsApp." }, { status: 403 });
  }
  if (agent.status !== "approved") {
    return Response.json({ error: "Agent not found or not yet approved." }, { status: 404 });
  }

  // If logging in with email+password, verify password
  if (password !== null) {
    if (!storedHash) {
      return Response.json({ error: "No password set for this account. Log in with your referral code, or contact admin." }, { status: 401 });
    }
    const ok = await bcrypt.compare(password, storedHash);
    if (!ok) {
      return Response.json({ error: "Incorrect password. Please try again." }, { status: 401 });
    }
  }

  const { data: orders } = await supabase
    .from("orders")
    .select("reference, bundle_size, network, amount, agent_commission, status, created_at, phone")
    .eq("agent_id", agent.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return Response.json({
    success: true,
    agent: {
      id: agent.id,
      name: agent.name,
      email: agent.email,
      referral_code: agent.referral_code,
      commission_balance: agent.commission_balance ?? 0,
      total_sales: agent.total_sales ?? 0,
      total_revenue: agent.total_revenue ?? 0,
      orders: orders ?? [],
    },
  });
}
