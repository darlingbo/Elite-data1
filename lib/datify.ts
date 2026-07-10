import { supabase } from "@/lib/supabase";

const BASE = "https://datify.handitechlime.com/api/v1";

const NET_MAP: Record<string, string> = {
  mtn: "MTN",
  telecel: "TELECEL",
  airteltigo: "AIRTEL_TIGO",
  at: "AIRTEL_TIGO",
};

function apiKey() {
  return process.env.DATIFY_API_KEY ?? "";
}

export async function isDatifyEnabled(): Promise<boolean> {
  try {
    const { data } = await supabase.from("system_settings").select("value").eq("key", "datify_enabled").maybeSingle();
    return (data?.value ?? "1") === "1";
  } catch {
    return true;
  }
}

interface DatifyPlan {
  id: number;
  network: string;
  plan_name: string;
  data_volume: string;
  validity_days: number;
  price: number;
}

// In-memory plan cache (5 min TTL) — avoids a GET /plans round-trip on every order
const planCache: Record<string, { plans: DatifyPlan[]; ts: number }> = {};
const CACHE_MS = 5 * 60 * 1000;

function parseVolToGB(vol: string): number {
  const mb = /(\d+(?:\.\d+)?)\s*MB/i.exec(vol);
  if (mb) return parseFloat(mb[1]) / 1000;
  const gb = /(\d+(?:\.\d+)?)\s*GB/i.exec(vol);
  if (gb) return parseFloat(gb[1]);
  return 0;
}

async function getPlans(network: string): Promise<DatifyPlan[]> {
  const cached = planCache[network];
  if (cached && Date.now() - cached.ts < CACHE_MS) return cached.plans;

  try {
    const res = await fetch(`${BASE}/plans?network=${encodeURIComponent(network)}`, {
      headers: { Authorization: `Bearer ${apiKey()}` },
      signal: AbortSignal.timeout(10_000),
    });
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (data.success) {
      const plans = ((data.data as Record<string, unknown>)?.plans ?? []) as DatifyPlan[];
      planCache[network] = { plans, ts: Date.now() };
      return plans;
    }
    return [];
  } catch {
    return [];
  }
}

export async function datifyPurchase(
  network: string,
  phone: string,
  sizeGB: number
): Promise<{ success: boolean; reference?: string; error?: string; timedOut?: boolean }> {
  const net = NET_MAP[network.toLowerCase()];
  if (!net) return { success: false, error: `Network "${network}" not supported by Datify` };
  if (!apiKey()) return { success: false, error: "DATIFY_API_KEY not configured" };

  const plans = await getPlans(net);
  const match = plans.find(p => Math.abs(parseVolToGB(p.data_volume) - sizeGB) <= sizeGB * 0.05 + 0.01);
  if (!match) return { success: false, error: `No Datify plan for ${sizeGB}GB on ${net}` };

  try {
    const res = await fetch(`${BASE}/buy`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ phone, plan_id: match.id }),
      signal: AbortSignal.timeout(25_000),
    });
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (data.success) {
      const d = data.data as Record<string, unknown>;
      return { success: true, reference: String(d?.reference ?? "") };
    }
    return { success: false, error: String(data.message ?? "Purchase failed") };
  } catch (err) {
    const isTimeout = String(err).includes("TimeoutError") || String(err).includes("AbortError");
    return { success: false, timedOut: isTimeout, error: String(err) };
  }
}

export async function datifyBalance(): Promise<number | null> {
  if (!apiKey()) return null;
  try {
    const res = await fetch(`${BASE}/balance`, {
      headers: { Authorization: `Bearer ${apiKey()}` },
      signal: AbortSignal.timeout(8_000),
    });
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (data.success) return Number((data.data as Record<string, unknown>)?.balance ?? 0);
    return null;
  } catch {
    return null;
  }
}

export async function datifyStatus(reference: string): Promise<"completed" | "processing" | "failed" | null> {
  if (!apiKey()) return null;
  try {
    const res = await fetch(`${BASE}/status?reference=${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${apiKey()}` },
      signal: AbortSignal.timeout(8_000),
    });
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    const d = data.data as Record<string, unknown>;
    const raw = String(d?.status ?? "").toLowerCase();
    if (raw.includes("complet") || raw.includes("success")) return "completed";
    if (raw.includes("process") || raw.includes("pending") || raw.includes("manual")) return "processing";
    if (raw.includes("fail") || raw.includes("refund") || raw.includes("error")) return "failed";
    return null;
  } catch {
    return null;
  }
}
