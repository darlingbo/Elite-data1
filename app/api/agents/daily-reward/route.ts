import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

// ── Reward tiers ──────────────────────────────────────────────────────────────
export const REWARDS = {
  daily:     { label: "Daily Hustle",   threshold: 30,  dataGB: 1, description: "Sell 30+ bundles in a day" },
  weekly:    { label: "Weekly Star",    threshold: 120, dataGB: 3, description: "Sell 120+ bundles in a week" },
  milestone: { label: "Century Mark",  threshold: 300, dataGB: 2, description: "Every 300 total completed sales" },
};

// Pro agents earn rewards faster with more data
export const PRO_REWARDS = {
  daily:     { label: "Daily Hustle",   threshold: 20,  dataGB: 2, description: "Sell 20+ bundles in a day (Pro)" },
  weekly:    { label: "Weekly Star",    threshold: 70,  dataGB: 5, description: "Sell 70+ bundles in a week (Pro)" },
  milestone: { label: "Century Mark",  threshold: 150, dataGB: 3, description: "Every 150 total completed sales (Pro)" },
};

const NETWORK_API_MAP: Record<string, string> = {
  mtn: "MTN", telecel: "TELECEL", airteltigo: "AT ISHARE",
};

// ── Date helpers ──────────────────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().slice(0, 10); }

function weekStartStr() {
  const d = new Date();
  const day = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1)); // Monday
  return d.toISOString().slice(0, 10);
}

// ── Sales counters ────────────────────────────────────────────────────────────
async function countTodaySales(agentId: string): Promise<number> {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end   = new Date(); end.setHours(23, 59, 59, 999);
  const { count } = await supabase.from("orders")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentId).in("status", ["completed", "pending"])
    .gte("created_at", start.toISOString()).lte("created_at", end.toISOString());
  return count ?? 0;
}

async function countWeekSales(agentId: string): Promise<number> {
  const start = new Date(weekStartStr());
  const end   = new Date(); end.setHours(23, 59, 59, 999);
  const { count } = await supabase.from("orders")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentId).in("status", ["completed", "pending"])
    .gte("created_at", start.toISOString()).lte("created_at", end.toISOString());
  return count ?? 0;
}

async function countTotalSales(agentId: string): Promise<number> {
  const { count } = await supabase.from("orders")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentId).eq("status", "completed");
  return count ?? 0;
}

// ── Claim checker (uses single reward_claims table) ──────────────────────────
async function hasClaimed(agentId: string, rewardType: string, period: string): Promise<boolean> {
  const { data, error } = await supabase.from("reward_claims")
    .select("id").eq("agent_id", agentId).eq("reward_type", rewardType).eq("period", period).maybeSingle();
  if (error?.code === "42P01") return false;
  return !!data;
}

// ── Inventor API call ─────────────────────────────────────────────────────────
async function sendDataBundle(network: string, phone: string, sizeGB: number, reference: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(`${process.env.INVENTOR_API_BASE_URL}/api/developer/purchase`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.INVENTOR_API_KEY}` },
      body: JSON.stringify({ network: NETWORK_API_MAP[network] ?? "MTN", Phone: phone, Datasize: sizeGB, reference }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, status: 0, body: { error: String(err) } };
  }
}

async function getAgentIsPro(agentId: string): Promise<boolean> {
  const { data } = await supabase.from("agents").select("registration_ref").eq("id", agentId).maybeSingle();
  return !!(data?.registration_ref && data.registration_ref !== "FREE");
}

// ── GET — return all reward statuses ─────────────────────────────────────────
export async function GET(request: NextRequest) {
  const agentId = request.nextUrl.searchParams.get("agentId");
  if (!agentId) return Response.json({ error: "agentId required" }, { status: 400 });

  const [todaySales, weekSales, totalSales, isPro] = await Promise.all([
    countTodaySales(agentId),
    countWeekSales(agentId),
    countTotalSales(agentId),
    getAgentIsPro(agentId),
  ]);

  const R = isPro ? PRO_REWARDS : REWARDS;
  const today    = todayStr();
  const weekStart = weekStartStr();
  const milestonePeriod = String(Math.floor(totalSales / R.milestone.threshold));

  const [dailyClaimed, weeklyClaimed, milestoneClaimed] = await Promise.all([
    hasClaimed(agentId, "daily", today),
    hasClaimed(agentId, "weekly", weekStart),
    totalSales >= R.milestone.threshold ? hasClaimed(agentId, "milestone", milestonePeriod) : Promise.resolve(false),
  ]);

  // Recent 10 claims
  let history: { reward_type: string; period: string; phone: string; network: string; data_gb: number; created_at: string }[] = [];
  try {
    const { data } = await supabase.from("reward_claims")
      .select("reward_type, period, phone, network, data_gb, created_at")
      .eq("agent_id", agentId).order("created_at", { ascending: false }).limit(10);
    history = data ?? [];
  } catch { /* table may not exist yet */ }

  return Response.json({
    isPro,
    daily:     { sales: todaySales,  threshold: R.daily.threshold,     earned: todaySales >= R.daily.threshold,     claimed: dailyClaimed,     dataGB: R.daily.dataGB,     period: today },
    weekly:    { sales: weekSales,   threshold: R.weekly.threshold,    earned: weekSales >= R.weekly.threshold,     claimed: weeklyClaimed,    dataGB: R.weekly.dataGB,    period: weekStart },
    milestone: { sales: totalSales,  threshold: R.milestone.threshold, earned: totalSales >= R.milestone.threshold, claimed: milestoneClaimed, dataGB: R.milestone.dataGB, period: milestonePeriod, nextAt: (Math.floor(totalSales / R.milestone.threshold) + 1) * R.milestone.threshold },
    history,
  });
}

// ── POST — claim a reward ─────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const { agentId, rewardType, phone, network } = await request.json() as {
    agentId: string; rewardType: "daily" | "weekly" | "milestone"; phone: string; network: string;
  };

  if (!agentId || !rewardType || !phone || !network) {
    return Response.json({ error: "agentId, rewardType, phone and network are required." }, { status: 400 });
  }

  const cleaned = phone.replace(/\s/g, "");
  if (!/^0[2-5][0-9]{8}$/.test(cleaned)) {
    return Response.json({ error: "Enter a valid Ghana phone number (e.g. 0241234567)." }, { status: 400 });
  }

  if (!NETWORK_API_MAP[network]) {
    return Response.json({ error: "Invalid network. Choose MTN, Telecel, or AirtelTigo." }, { status: 400 });
  }

  // Re-check eligibility
  const [todaySales, weekSales, totalSales, isPro] = await Promise.all([
    countTodaySales(agentId), countWeekSales(agentId), countTotalSales(agentId), getAgentIsPro(agentId),
  ]);

  const R = isPro ? PRO_REWARDS : REWARDS;
  const today     = todayStr();
  const weekStart = weekStartStr();

  let period = "";
  let dataGB = 0;
  let tierLabel = "";

  if (rewardType === "daily") {
    if (todaySales < R.daily.threshold) return Response.json({ error: `Need ${R.daily.threshold} sales today. You have ${todaySales}.` }, { status: 400 });
    period = today; dataGB = R.daily.dataGB; tierLabel = R.daily.label;
  } else if (rewardType === "weekly") {
    if (weekSales < R.weekly.threshold) return Response.json({ error: `Need ${R.weekly.threshold} sales this week. You have ${weekSales}.` }, { status: 400 });
    period = weekStart; dataGB = R.weekly.dataGB; tierLabel = R.weekly.label;
  } else if (rewardType === "milestone") {
    if (totalSales < R.milestone.threshold) return Response.json({ error: `Need ${R.milestone.threshold} total sales. You have ${totalSales}.` }, { status: 400 });
    period = String(Math.floor(totalSales / R.milestone.threshold));
    dataGB = R.milestone.dataGB; tierLabel = R.milestone.label;
  } else {
    return Response.json({ error: "Unknown reward type." }, { status: 400 });
  }

  // Check not already claimed
  if (await hasClaimed(agentId, rewardType, period)) {
    return Response.json({ error: "Already claimed this reward. Check back later!" }, { status: 409 });
  }

  // Send via Inventor API
  const reference = `REWARD-${rewardType.toUpperCase()}-${agentId.slice(0, 8)}-${Date.now()}`;
  const result = await sendDataBundle(network, cleaned, dataGB, reference);

  if (!result.ok && result.status !== 409) {
    return Response.json({ error: "Failed to send data. Please try again." }, { status: 502 });
  }

  // Record the claim
  const { error: claimErr } = await supabase.from("reward_claims").insert({
    agent_id: agentId, reward_type: rewardType, period,
    phone: cleaned, network, data_gb: dataGB,
  });

  if (claimErr?.code === "42P01") {
    return Response.json({
      sqlNeeded: true,
      sql: `CREATE TABLE IF NOT EXISTS reward_claims (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  agent_id text NOT NULL,\n  reward_type text NOT NULL,\n  period text NOT NULL,\n  phone text,\n  network text,\n  data_gb numeric DEFAULT 1,\n  created_at timestamptz DEFAULT now(),\n  UNIQUE (agent_id, reward_type, period)\n);`,
      error: "Run the SQL below in Supabase first, then try again.",
    }, { status: 500 });
  }

  return Response.json({ success: true, dataGB, phone: cleaned, network, tierLabel });
}
