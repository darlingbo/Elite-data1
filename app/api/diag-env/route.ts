// TEMPORARY diagnostic for the Cloudflare migration — reports the database
// error and the SHAPE of the Supabase settings (never any part of a value).
// Removed in the next commit.
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function shape(v: string | undefined) {
  if (v === undefined) return "missing";
  const t = v.trim();
  let ref: string | null = null;
  let role: string | null = null;
  if (t.startsWith("eyJ") && t.split(".").length === 3) {
    try {
      const p = JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      ref = p.ref ?? null;
      role = p.role ?? null;
    } catch {
      /* not decodable */
    }
  }
  const kind = t.startsWith("eyJ") ? "jwt" : t.startsWith("sb_secret_") ? "sb_secret" : t.startsWith("sb_publishable_") ? "sb_publishable" : "other";
  return `len ${v.length} ${kind}${ref ? ` ref=${ref}` : ""}${role ? ` role=${role}` : ""}${/\s/.test(v) ? " HAS-WHITESPACE" : ""}${/["']/.test(v) ? " HAS-QUOTES" : ""}`;
}

export async function GET() {
  let dbError: string | null = null;
  try {
    const { error } = await supabase.from("bundle_prices").select("id").limit(1);
    if (error) dbError = `${error.code || ""} ${error.message}`.trim();
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
  }
  return Response.json({
    dbError,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? null,
    serviceRole: shape(process.env.SUPABASE_SERVICE_ROLE_KEY),
    serviceKeyAlt: shape(process.env.SUPABASE_SERVICE_KEY),
    anon: shape(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  });
}
