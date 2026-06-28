import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

const DAILY_THRESHOLD = 10; // sales needed
const MIN_BUNDLE_GB   = 3;  // free bundle must be above this

// ── helpers ──────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

async function countTodaySales(agentId: string): Promise<number> {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end   = new Date(); end.setHours(23, 59, 59, 999);

  const { count } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentId)
    .in("status", ["completed", "pending"])
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString());

  return count ?? 0;
}

async function hasClaimedToday(agentId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("daily_reward_claims")
    .select("id")
    .eq("agent_id", agentId)
    .eq("claim_date", todayStr())
    .maybeSingle();

  if (error?.code === "42P01") return false; // table doesn't exist yet
  return !!data;
}

async function findFreeBundle(): Promise<{ id: string; label: string; price: number; sizeGB: number } | null> {
  // Get cheapest active bundle above MIN_BUNDLE_GB from bundle_prices table
  const { data } = await supabase
    .from("bundle_prices")
    .select("id, size_label, price, size_gb, active")
    .neq("active", false)
    .gt("size_gb", MIN_BUNDLE_GB)
    .order("price", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return { id: data.id, label: data.size_label ?? `${data.size_gb}GB`, price: Number(data.price), sizeGB: data.size_gb };
}

// ── GET — check daily progress ────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const agentId = request.nextUrl.searchParams.get("agentId");
  if (!agentId) return Response.json({ error: "agentId required" }, { status: 400 });

  const [todaySales, claimed] = await Promise.all([
    countTodaySales(agentId),
    hasClaimedToday(agentId),
  ]);

  const rewardEarned = todaySales >= DAILY_THRESHOLD;

  // Find which bundle would be the reward
  const rewardBundle = rewardEarned ? await findFreeBundle() : null;

  // Recent claim history (last 7 days)
  let history: { claim_date: string; bundle_label: string; credit_amount: number }[] = [];
  try {
    const { data: histData } = await supabase
      .from("daily_reward_claims")
      .select("claim_date, bundle_label, credit_amount")
      .eq("agent_id", agentId)
      .order("claim_date", { ascending: false })
      .limit(7);
    history = histData ?? [];
  } catch { /* table may not exist yet */ }

  return Response.json({
    todaySales,
    threshold: DAILY_THRESHOLD,
    rewardEarned,
    claimed,
    rewardBundle,
    history,
  });
}

// ── POST — claim daily reward ─────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const { agentId } = await request.json();
  if (!agentId) return Response.json({ error: "agentId required" }, { status: 400 });

  // Re-verify sales count
  const todaySales = await countTodaySales(agentId);
  if (todaySales < DAILY_THRESHOLD) {
    return Response.json({ error: `You need ${DAILY_THRESHOLD} sales today to claim. You have ${todaySales}.` }, { status: 400 });
  }

  // Check not already claimed
  if (await hasClaimedToday(agentId)) {
    return Response.json({ error: "You have already claimed your reward today. Come back tomorrow!" }, { status: 409 });
  }

  // Find the free bundle
  const bundle = await findFreeBundle();
  if (!bundle) {
    return Response.json({ error: "No eligible bundle available right now. Contact admin." }, { status: 404 });
  }

  // Credit agent wallet with the bundle's price
  const { data: agent, error: agErr } = await supabase
    .from("agents")
    .select("wallet_balance")
    .eq("id", agentId)
    .maybeSingle();

  if (agErr || !agent) return Response.json({ error: "Agent not found." }, { status: 404 });

  const newBalance = Number(agent.wallet_balance ?? 0) + bundle.price;

  const { error: walletErr } = await supabase
    .from("agents")
    .update({ wallet_balance: newBalance })
    .eq("id", agentId);

  if (walletErr) return Response.json({ error: "Failed to credit wallet." }, { status: 500 });

  // Record the claim
  const { error: claimErr } = await supabase
    .from("daily_reward_claims")
    .insert({
      agent_id:     agentId,
      claim_date:   todayStr(),
      bundle_label: bundle.label,
      credit_amount: bundle.price,
    });

  if (claimErr?.code === "42P01") {
    // Table missing — return SQL to create it
    return Response.json({
      sqlNeeded: true,
      sql: `CREATE TABLE IF NOT EXISTS daily_reward_claims (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  agent_id text NOT NULL,\n  claim_date date NOT NULL,\n  bundle_label text,\n  credit_amount numeric DEFAULT 0,\n  created_at timestamptz DEFAULT now(),\n  UNIQUE (agent_id, claim_date)\n);`,
      error: "Run the SQL below in Supabase first, then try again.",
    }, { status: 500 });
  }

  return Response.json({
    success: true,
    bundle: bundle.label,
    credited: bundle.price,
    newBalance,
  });
}
