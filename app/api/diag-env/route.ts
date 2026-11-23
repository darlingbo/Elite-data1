// TEMPORARY diagnostic for the Cloudflare migration — reports only whether
// each secret is present, its length, and whether the same value is shared by
// several keys (a sign of a Vercel "Sensitive" placeholder). Never returns
// any part of a value. Removed in the next commit.
export const dynamic = "force-dynamic";

const NAMES = [
  "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY",
  "ADMIN_PASSWORD", "ADMIN_SESSION_TOKEN", "CRON_SECRET", "SITE_URL", "NEXT_PUBLIC_SITE_URL",
  "INVENTOR_API_KEY", "INVENTOR_API_BASE_URL", "YEBECK_API_KEY", "MESSAGEPILOT_API_KEY",
  "MESSAGEPILOT_SENDER_ID", "TELEGRAM_ADMIN_BOT_TOKEN", "TELEGRAM_ADMIN_CHAT_ID",
  "TELEGRAM_WEBHOOK_SECRET", "TELEGRAM_BOT_TOKEN", "TELEGRAM_ASSISTANT_BOT_TOKEN",
  "TELEGRAM_ASSISTANT_WEBHOOK_SECRET", "WHATSAPP_API_KEY", "ADMIN_WHATSAPP_NUMBER", "YHANGMHANY_BASE_URL",
];

export async function GET() {
  const values = NAMES.map((n) => process.env[n]);
  const report: Record<string, string> = {};
  NAMES.forEach((name, i) => {
    const v = values[i];
    if (v === undefined) { report[name] = "missing"; return; }
    const shared = values.filter((x) => x === v).length;
    const urlOk = name.endsWith("_URL") ? (/^https:\/\/[^\s]+$/.test(v.trim()) ? " url-ok" : " NOT-A-URL") : "";
    const jwt = v.trim().startsWith("eyJ") ? " jwt" : v.trim().startsWith("sb_secret_") ? " sb_secret" : "";
    report[name] = `len ${v.length}${shared > 1 ? ` SHARED-BY-${shared}` : ""}${urlOk}${jwt}`;
  });
  return Response.json(report);
}
