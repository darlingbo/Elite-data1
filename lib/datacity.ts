import { supabase } from "@/lib/supabase";

const BASE = "https://mydatacity.com/api";

export async function isDatacityEnabled(): Promise<boolean> {
  try {
    const { data } = await supabase.from("system_settings").select("value").eq("key", "datacity_enabled").maybeSingle();
    return (data?.value ?? "1") === "1";
  } catch {
    return true; // default on if DB unreachable
  }
}

const NET_MAP: Record<string, string> = {
  mtn: "mtn",
  telecel: "telecel",
  airteltigo: "at",
  at: "at",
};

function key() {
  return process.env.DATACITY_API_KEY ?? "";
}

export async function datacityVerify(
  network: string,
  phone: string
): Promise<{ verified: boolean; error?: string }> {
  const net = NET_MAP[network.toLowerCase()];
  if (!net || !key()) return { verified: true }; // skip check if not configured

  try {
    const res = await fetch(`${BASE}/verify`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ network: net, msisdn: phone }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (data.status === "success" && (data.data as Record<string, unknown>)?.verified) {
      return { verified: true };
    }
    return { verified: false, error: String(data.message ?? "Verification failed") };
  } catch (err) {
    // If verify call fails (network issue), allow through — purchase will handle it
    return { verified: true, error: String(err) };
  }
}

export async function datacityPurchase(
  network: string,
  phone: string,
  sizeGB: number
): Promise<{ success: boolean; reference?: string; error?: string }> {
  const net = NET_MAP[network.toLowerCase()];
  if (!net) return { success: false, error: `Network "${network}" not supported by DataCity` };
  if (!key()) return { success: false, error: "DATACITY_API_KEY not configured" };

  const volumeMB = Math.round(sizeGB * 1000);

  try {
    const res = await fetch(`${BASE}/purchase`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ network: net, volume: volumeMB, msisdn: phone }),
      signal: AbortSignal.timeout(25000),
    });
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (data.status === "success") {
      const d = data.data as Record<string, unknown>;
      return { success: true, reference: String(d?.reference ?? "") };
    }
    return { success: false, error: String(data.message ?? "Purchase failed") };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function datacityBalance(): Promise<number | null> {
  if (!key()) return null;
  try {
    const res = await fetch(`${BASE}/balance`, {
      headers: { Authorization: `Bearer ${key()}` },
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    return data.status === "success" ? Number((data.data as Record<string, unknown>)?.balance ?? 0) : null;
  } catch {
    return null;
  }
}

export async function datacityStatus(reference: string): Promise<"completed" | "processing" | "failed" | null> {
  if (!key()) return null;
  try {
    const res = await fetch(`${BASE}/status?reference=${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${key()}` },
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    const d = data.data as Record<string, unknown>;
    const raw = String(d?.status ?? "").toLowerCase();
    if (raw.includes("complet") || raw.includes("success")) return "completed";
    if (raw.includes("process") || raw.includes("pending")) return "processing";
    if (raw.includes("fail") || raw.includes("error")) return "failed";
    return null;
  } catch {
    return null;
  }
}
