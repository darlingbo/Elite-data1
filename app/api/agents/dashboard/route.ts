import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { issueAgentSession } from "@/lib/agentAuth";
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

type AgentRow = {
  id: string; name: string; email: string; phone?: string | null; referral_code: string | null;
  commission_balance: number; wallet_balance?: number; paystack_wallet_balance?: number; total_sales: number;
  total_revenue?: number; status: string; agent_type?: string; plan?: string | null;
  registration_ref?: string | null;
  business_name?: string | null; telegram_chat_id?: string | null;
  password_hash?: string;
};

async function lookupAgent(code: string | null, email: string | null): Promise<{ agent: AgentRow | null; hash: string | null }> {
  const q = code
    ? supabase.from("agents").select("id, name, email, phone, referral_code, commission_balance, wallet_balance, paystack_wallet_balance, total_sales, total_revenue, status, agent_type, plan, registration_ref, business_name, telegram_chat_id, password_hash").eq("referral_code", code.toUpperCase())
    : supabase.from("agents").select("id, name, email, phone, referral_code, commission_balance, wallet_balance, paystack_wallet_balance, total_sales, total_revenue, status, agent_type, plan, registration_ref, business_name, telegram_chat_id, password_hash").eq("email", email!.toLowerCase().trim());
  const { data: agent, error } = await q.maybeSingle();
  if (error) {
    const q2 = code
      ? supabase.from("agents").select("id, name, email, phone, referral_code, commission_balance, wallet_balance, paystack_wallet_balance, total_sales, total_revenue, status, agent_type, plan, registration_ref, business_name, telegram_chat_id").eq("referral_code", code.toUpperCase())
      : supabase.from("agents").select("id, name, email, phone, referral_code, commission_balance, wallet_balance, paystack_wallet_balance, total_sales, total_revenue, status, agent_type, plan, registration_ref, business_name, telegram_chat_id").eq("email", email!.toLowerCase().trim());
    const { data: agent2 } = await q2.maybeSingle();
    return { agent: (agent2 as AgentRow | null) ?? null, hash: null };
  }
  const row = agent as AgentRow | null;
  return { agent: row ?? null, hash: row?.password_hash ?? null };
}

// Referral codes are public storefront identifiers, not login credentials.
export async function GET() {
  return Response.json(
    { error: "Sign in with your email and password to access the dashboard." },
    { status: 401 }
  );
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
  agent: { id: string; name: string; email: string; phone?: string | null; referral_code: string | null; commission_balance: number; wallet_balance?: number; paystack_wallet_balance?: number; total_sales: number; total_revenue?: number; status: string; agent_type?: string; plan?: string | null; registration_ref?: string | null; business_name?: string | null; telegram_chat_id?: string | null },
  storedHash: string | null,
  password: string | null
) {
  if (agent.status === "pending") {
    return Response.json({ error: "Your Free Agent application is still under review. Contact admin on WhatsApp: https://wa.me/233509794503", status: "pending" }, { status: 403 });
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

  // Issue a signed, httpOnly session cookie. Password login => "full" (can move
  // money); referral-code login => "code" (view-only, cannot withdraw/spend).
  await issueAgentSession(agent.id, "full");

  const ordersRes = await supabase
    .from("orders")
    .select("reference, bundle_size, network, amount, cost_price, agent_commission, status, created_at, phone")
    .eq("agent_id", agent.id)
    .order("created_at", { ascending: false })
    .limit(1000);
  let orders = ordersRes.data;
  const ordersErr = ordersRes.error;

  // agent_commission or cost_price column may not exist yet — fall back to basic columns
  if (ordersErr) {
    const { data: ordersBasic } = await supabase
      .from("orders")
      .select("reference, bundle_size, network, amount, status, created_at, phone")
      .eq("agent_id", agent.id)
      .order("created_at", { ascending: false })
      .limit(1000);
    orders = (ordersBasic ?? []).map(o => ({ ...o, cost_price: 0, agent_commission: 0 }));
  }

  const allOrders = orders ?? [];
  const pendingCommission = allOrders
    .filter(o => o.status === "pending" || o.status === "processing")
    .reduce((sum, o) => sum + (Number(o.agent_commission) || 0), 0);

  return Response.json({
    success: true,
    agent: {
      id: agent.id,
      name: agent.name,
      email: agent.email,
      phone: agent.phone ?? null,
      referral_code: agent.referral_code,
      commission_balance: agent.commission_balance ?? 0,
      wallet_balance: agent.wallet_balance ?? 0,
      paystack_wallet_balance: agent.paystack_wallet_balance ?? 0,
      pending_commission: parseFloat(pendingCommission.toFixed(2)),
      total_sales: agent.total_sales ?? 0,
      total_revenue: agent.total_revenue ?? 0,
      agent_type: agent.agent_type ?? "commission",
      plan: agent.plan ?? "free",
      registration_ref: agent.registration_ref ?? null,
      business_name: agent.business_name ?? null,
      telegram_chat_id: agent.telegram_chat_id ?? null,
      orders: allOrders,
    },
  });
}
