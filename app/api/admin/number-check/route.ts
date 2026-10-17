import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { verifyAdminSessionValue } from "@/lib/adminAuth";
import { auditLog } from "@/lib/audit";
import { rateLimitDb } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";
import {
  getNumberCheckSettings,
  providerHealth,
  saveNumberCheckSettings,
  testNumber,
  type NumberCheckSettings,
} from "@/lib/number-check";

async function isAdmin() {
  const s = await cookies();
  return verifyAdminSessionValue(s.get("admin_session")?.value);
}

type BlockedRow = { created_at: string; details: { phone?: string; status?: string } | null };

/** Settings, provider health, and the numbers the check has turned away lately. */
export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [settings, health, blockedRes] = await Promise.all([
    getNumberCheckSettings(),
    providerHealth(),
    supabase
      .from("audit_log")
      .select("created_at, details")
      .eq("action", "number_check_blocked")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const byPhone = new Map<string, { phone: string; tries: number; last: string; status: string }>();
  for (const row of ((blockedRes.data as BlockedRow[] | null) ?? [])) {
    const phone = row.details?.phone;
    if (!phone) continue;
    const entry = byPhone.get(phone);
    if (entry) entry.tries += 1;
    else byPhone.set(phone, { phone, tries: 1, last: row.created_at, status: row.details?.status ?? "not_verified" });
  }

  const blocked = [...byPhone.values()];
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const blockedToday = blocked.filter((b) => new Date(b.last) >= todayStart).length;

  return Response.json({ settings, health, blocked: blocked.slice(0, 100), blockedToday, checkedAt: new Date().toISOString() });
}

/** Change a setting. Only the fields sent are changed. */
export async function PATCH(request: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Partial<NumberCheckSettings>;
  try {
    const settings = await saveNumberCheckSettings({
      enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
      order: body.order,
      onUnreachable: body.onUnreachable,
      cacheHours: body.cacheHours,
      verifyUrl: typeof body.verifyUrl === "string" ? body.verifyUrl : undefined,
    });
    void auditLog("number_check_settings", { changed: Object.keys(body) }, clientIp(request));
    return Response.json({ success: true, settings });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Could not save." }, { status: 400 });
  }
}

/** Test one number against both providers. */
export async function POST(request: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (await rateLimitDb(`admin-number-test:${clientIp(request)}`, 30, 5 * 60_000)) {
    return Response.json({ error: "Too many tests. Wait a few minutes." }, { status: 429 });
  }
  const body = await request.json().catch(() => ({})) as { phone?: unknown };
  const result = await testNumber(String(body.phone ?? ""));
  if (!result) return Response.json({ error: "Enter a valid 10-digit Ghana number." }, { status: 400 });
  return Response.json(result);
}
