import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { verifyAdminSessionValue } from "@/lib/adminAuth";
import { yhangMhanyBalance } from "@/lib/yhangmhany";
import { swiftdataBalance, isSwiftDataConfigured } from "@/lib/swiftdata";

const MTN_PROVIDERS = ["inventor", "yhangmhany", "swiftdata", "auto"] as const;
type MtnProvider = (typeof MTN_PROVIDERS)[number];
function toMtnProvider(v: unknown): MtnProvider {
  return MTN_PROVIDERS.includes(v as MtnProvider) ? (v as MtnProvider) : "inventor";
}

async function isAdmin() {
  const s = await cookies();
  return verifyAdminSessionValue(s.get("admin_session")?.value);
}

async function getInventorBalance(): Promise<number | null> {
  try {
    const r = await fetch(`${process.env.INVENTOR_API_BASE_URL}/api/developer/balance`, {
      headers: { Authorization: `Bearer ${process.env.INVENTOR_API_KEY}` },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!r.ok) return null;
    const d = await r.json();
    const raw = d?.balance ?? d?.data?.balance ?? d?.wallet_balance ?? d?.data?.wallet_balance ?? null;
    return raw !== null ? Number(raw) : null;
  } catch { return null; }
}

/** Which provider handles new MTN orders. Telecel/AirtelTigo always use
 * Inventor -- there is no switch for those (yet). */
export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [inventorBalance, yhangMhanyBal, swiftDataBal, setting] = await Promise.all([
    getInventorBalance(),
    yhangMhanyBalance(),
    swiftdataBalance(),
    supabase.from("system_settings").select("value").eq("key", "mtn_provider").maybeSingle(),
  ]);

  return Response.json({
    inventorBalance,
    yhangMhanyBalance: yhangMhanyBal,
    swiftDataBalance: swiftDataBal,
    swiftDataConfigured: isSwiftDataConfigured(),
    mtnProvider: toMtnProvider(setting.data?.value),
    checkedAt: new Date().toISOString(),
  });
}

export async function PATCH(req: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const provider = toMtnProvider(body.mtnProvider);
  if (provider === "swiftdata" && !isSwiftDataConfigured()) {
    return Response.json({ error: "Add SWIFTDATA_API_KEY in Cloudflare before switching MTN to SwiftData." }, { status: 400 });
  }
  await supabase.from("system_settings").upsert({ key: "mtn_provider", value: provider }, { onConflict: "key" });
  return Response.json({ success: true, mtnProvider: provider });
}
