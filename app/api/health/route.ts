import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { verifyAdminSessionValue } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

/**
 * Anyone (uptime monitors included) gets a plain healthy or degraded answer.
 * The setup details (which keys are present, database errors) are for a signed-in
 * admin only. No part of any key is ever returned.
 */
export async function GET() {
  let dbOk = false;
  let dbError: string | null = null;
  let bundleCount = 0;

  try {
    const { data, error } = await supabase.from("bundle_prices").select("id").limit(10);
    if (error) dbError = `${error.code || ""} ${error.message}`.trim();
    else { dbOk = true; bundleCount = data?.length ?? 0; }
  } catch (err: unknown) {
    dbError = err instanceof Error ? err.message : String(err);
  }

  const status = dbOk ? "healthy" : "degraded";
  const store = await cookies();
  const isAdmin = await verifyAdminSessionValue(store.get("admin_session")?.value);
  if (!isAdmin) return NextResponse.json({ status }, { status: dbOk ? 200 : 503 });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";
  return NextResponse.json({
    status,
    database: { connected: dbOk, error: dbError, bundleSampleCount: bundleCount },
    env: {
      supabaseUrlConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      serviceKeyConfigured: Boolean(serviceKey),
      anonKeyConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      adminPasswordConfigured: Boolean(process.env.ADMIN_PASSWORD),
      inventorKeyConfigured: Boolean(process.env.INVENTOR_API_KEY),
      yhangMhanyKeyConfigured: Boolean(process.env.YHANGMHANY_API_KEY),
      yebeckKeyConfigured: Boolean(process.env.YEBECK_API_KEY),
    },
  });
}
