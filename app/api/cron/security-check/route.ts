import { cronAuthorized } from "@/lib/cron-auth";
import { supabase } from "@/lib/supabase";
import { sendAdminAlert, tgEscape } from "@/lib/telegram";

export const maxDuration = 60;

type Check = { name: string; ok: boolean; detail: string };

function envCheck(name: string, minimum = 20): Check {
  const value = process.env[name] ?? "";
  return { name, ok: value.length >= minimum, detail: value.length >= minimum ? "configured" : "missing or too short" };
}

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const since = new Date(Date.now() - 12 * 60 * 60_000).toISOString();
  const checks: Check[] = [
    envCheck("ADMIN_SESSION_TOKEN", 24), envCheck("SUPABASE_SERVICE_ROLE_KEY", 30),
    envCheck("YEBECK_API_KEY", 8), envCheck("TELEGRAM_ADMIN_BOT_TOKEN", 20),
    envCheck("TELEGRAM_WEBHOOK_SECRET", 24), envCheck("CRON_SECRET", 24),
    envCheck("ADMIN_RESET_TOKEN", 32),
    envCheck("INVENTOR_WEBHOOK_SECRET", 24), envCheck("WHATSAPP_WEBHOOK_SECRET", 24),
    envCheck("DEEPSEEK_API_KEY", 20),
  ];

  const [aiErrors, openEscalations, recentOrders, settings, adminProbe, aiProbe, siteProbe] = await Promise.all([
    supabase.from("ai_activity").select("id", { count: "exact", head: true }).eq("status", "error").gte("created_at", since),
    supabase.from("ai_escalations").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("orders").select("reference,status,phone").gte("created_at", since).limit(2000),
    supabase.from("system_settings").select("key,value").in("key", ["ai_daily_request_limit","customer_ai_enabled"]),
    fetch(`${process.env.SITE_URL ?? "https://elitedata1.com"}/api/admin/stats`, { redirect: "manual", signal: AbortSignal.timeout(10_000) }).catch(() => null),
    fetch(`${process.env.SITE_URL ?? "https://elitedata1.com"}/api/admin/ai-control`, { redirect: "manual", signal: AbortSignal.timeout(10_000) }).catch(() => null),
    fetch(process.env.SITE_URL ?? "https://elitedata1.com", { redirect: "manual", signal: AbortSignal.timeout(10_000) }).catch(() => null),
  ]);

  checks.push(
    { name: "Admin stats access", ok: adminProbe?.status === 401, detail: adminProbe ? `anonymous HTTP ${adminProbe.status}` : "unreachable" },
    { name: "AI control access", ok: aiProbe?.status === 401, detail: aiProbe ? `anonymous HTTP ${aiProbe.status}` : "unreachable" },
    { name: "HTTPS security headers", ok: Boolean(siteProbe?.headers.get("strict-transport-security") && siteProbe?.headers.get("x-frame-options") === "DENY" && siteProbe?.headers.get("content-security-policy")), detail: "HSTS, frame protection and CSP" },
    { name: "AI provider errors", ok: (aiErrors.count ?? 0) === 0, detail: `${aiErrors.count ?? 0} in last 12 hours` },
    { name: "Human escalations", ok: (openEscalations.count ?? 0) === 0, detail: `${openEscalations.count ?? 0} open` },
  );

  const orders = recentOrders.data ?? [];
  const duplicateReferences = orders.length - new Set(orders.map(order => order.reference)).size;
  checks.push({ name: "Duplicate order references", ok: duplicateReferences === 0, detail: `${duplicateReferences} detected` });

  const configured = Object.fromEntries((settings.data ?? []).map(row => [row.key, row.value]));
  checks.push({ name: "AI safety configuration", ok: Boolean(configured.ai_daily_request_limit), detail: `daily limit ${configured.ai_daily_request_limit ?? "missing"}` });

  const failures = checks.filter(check => !check.ok);
  const ghTime = new Date().toLocaleString("en-GH", { timeZone: "Africa/Accra", dateStyle: "medium", timeStyle: "short" });
  const lines = checks.map(check => `${check.ok ? "✅" : "⚠️"} <b>${tgEscape(check.name)}</b>: ${tgEscape(check.detail)}`).join("\n");
  await sendAdminAlert(
    `🛡️ <b>EliteData Security Check</b>\n${tgEscape(ghTime)}\n\n${lines}\n\n${failures.length ? `⚠️ <b>${failures.length} item(s) need review.</b>` : "✅ <b>All security checks passed.</b>"}\nRead-only scan · no automatic changes`
  ).catch(() => {});

  return Response.json({ ok: failures.length === 0, checks: checks.length, warnings: failures.length, durationMs: Date.now() - started });
}
