import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabase";

// In-memory rate limiter: max 8 attempts per IP per 15 minutes
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return false;
  }
  entry.count++;
  return entry.count > 8;
}

async function lookupAgent(code: string | null, email: string | null) {
  const { data: agent, error } = await (
    code
      ? supabase.from("agents").select("id, name, email, referral_code, commission_balance, total_sales, total_revenue, status, agent_type, password_hash").eq("referral_code", code.toUpperCase()).maybeSingle()
      : supabase.from("agents").select("id, name, email, referral_code, commission_balance, total_sales, total_revenue, status, agent_type, password_hash").eq("email", email!.toLowerCase().trim()).maybeSingle()
  );
  if (error) {
    const { data: agent2 } = await (
      code
        ? supabase.from("agents").select("id, name, email, referral_code, commission_balance, total_sales, total_revenue, status, agent_type").eq("referral_code", code.toUpperCase()).maybeSingle()
        : supabase.from("agents").select("id, name, email, referral_code, commission_balance, total_sales, total_revenue, status, agent_type").eq("email", email!.toLowerCase().trim()).maybeSingle()
    );
    return { agent: agent2 ?? null, hash: null };
  }
  return { agent: agent ?? null, hash: (agent as { password_hash?: string } | null)?.password_hash ?? null };
}

// GET: referral-code-only login (no password required — public dashboard)
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return Response.json({ error: "Referral code required." }, { status: 400 });
  }
  const { agent, hash } = await lookupAgent(code, null);
  if (!agent) return Response.json({ error: "Agent not found. Check your referral code." }, { status: 404 });
  return handleAgentResponse(agent, hash, null);
}

// POST: email + password login (credentials sent securely in request body)
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (checkRateLimit(ip)) {
    return Response.json({ error: "Too many login attempts. Try again in 15 minutes." }, { status: 429 });
  }

  const body = await request.json().catch(() => ({})) as Record<string, string>;
  const { email, password } = body;

  if (!email?.trim() || !password) {
    return Response.json({ error: "Email and password are required." }, { status: 400 });
  }

  const { agent, hash } = await lookupAgent(null, email.trim());
  if (!agent) return Response.json({ error: "Agent not found. Check your details and try again." }, { status: 404 });
  return handleAgentResponse(agent, hash, password);
}

async function handleAgentResponse(
  agent: { id: string; name: string; email: string; referral_code: string | null; commission_balance: number; total_sales: number; total_revenue?: number; status: string; agent_type?: string },
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
      agent_type: agent.agent_type ?? "commission",
      orders: orders ?? [],
    },
  });
}
