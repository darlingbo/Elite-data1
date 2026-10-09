import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";

  let dbOk = false;
  let dbError: string | null = null;
  let bundleCount = 0;

  try {
    const { data, error } = await supabase
      .from("bundle_prices")
      .select("id, price, network, active")
      .limit(10);
    if (error) {
      dbError = `${error.code || ""} ${error.message}`;
    } else {
      dbOk = true;
      bundleCount = data?.length ?? 0;
    }
  } catch (err: unknown) {
    dbError = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json({
    status: dbOk ? "healthy" : "degraded",
    database: {
      connected: dbOk,
      error: dbError,
      bundleSampleCount: bundleCount,
    },
    env: {
      supabaseUrlConfigured: Boolean(url),
      serviceKeyConfigured: Boolean(serviceKey),
      serviceKeyPrefix: serviceKey ? `${serviceKey.slice(0, 6)}...` : "(none)",
      serviceKeyLength: serviceKey.length,
      anonKeyConfigured: Boolean(anonKey),
      adminPasswordConfigured: Boolean(process.env.ADMIN_PASSWORD),
    },
  });
}
