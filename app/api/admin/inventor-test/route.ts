import { cookies } from "next/headers";
import { verifyAdminSessionValue } from "@/lib/adminAuth";

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifyAdminSessionValue(cookieStore.get("admin_session")?.value);
}

export async function GET() {
  if (!(await isAdmin())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const base = (process.env.INVENTOR_API_BASE_URL ?? "").replace(/\/+$/, "");
  const key  = process.env.INVENTOR_API_KEY ?? "";

  const envCheck = {
    INVENTOR_API_BASE_URL: base ? `set (${base})` : "MISSING",
    INVENTOR_API_KEY: key ? `set (${key.slice(0, 8)}…)` : "MISSING",
  };

  if (!base || !key) {
    return Response.json({ ok: false, envCheck, error: "One or both env vars are missing in Vercel." });
  }

  const results: Record<string, unknown> = { envCheck };

  // 1. Balance check
  try {
    const r = await fetch(`${base}/api/developer/balance`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    });
    const body = await r.json().catch(() => null);
    results.balance = { status: r.status, ok: r.ok, body };
  } catch (e) {
    results.balance = { error: String(e) };
  }

  // 2. Verify a known MTN test number (0241234567)
  try {
    const r = await fetch(`${base}/api/developer/verify-number`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ phone: "0241234567", is_ported_number: false }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await r.json().catch(() => null);
    results.verifyTest = { status: r.status, ok: r.ok, body };
  } catch (e) {
    results.verifyTest = { error: String(e) };
  }

  return Response.json(results);
}
