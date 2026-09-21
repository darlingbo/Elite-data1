import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { inventorVerifyNumber } from "@/lib/inventor";
import { yhangmhanyVerifyNumber, type VerifyStatus } from "@/lib/yhangmhany";
import { isNotOnListError } from "@/lib/sms";

async function getSetting(key: string): Promise<string | null> {
  try {
    const { data } = await supabase.from("system_settings").select("value").eq("key", key).maybeSingle();
    return data?.value ?? null;
  } catch {
    return null;
  }
}

async function inventorStatus(phone: string): Promise<VerifyStatus> {
  if (!process.env.INVENTOR_API_KEY || !process.env.INVENTOR_API_BASE_URL) return "unknown";
  const { verified, error } = await inventorVerifyNumber(phone);
  if (verified) return "verified";
  return isNotOnListError(error ?? "") ? "not_verified" : "unknown";
}

const BLOCKED = {
  verified: false,
  error:
    "This MTN number isn't registered to receive data yet, so we can't take payment for it. Please register the number as a data beneficiary with MTN, or use a different number.",
};

/**
 * Checkout gate for MTN numbers. Called before the customer is sent to pay.
 *
 * Which list counts depends on the MTN provider mode (Admin -> Network
 * Providers):
 *   inventor   -> Inventor's beneficiary list
 *   yhangmhany -> Yhang Mhany's verify-number
 *   auto       -> verified on EITHER (blocked only if both say no)
 *
 * A definite "not verified" BLOCKS checkout. Anything unclear (API error,
 * timeout, unexpected response) fails open, so a provider hiccup never
 * blocks a paying customer. Admin can still disable the whole check
 * (mtn_verification_enabled = "false"). `force: true` (trusted server-to-
 * server callers, e.g. Silent Echo) bypasses that toggle and always checks
 * Inventor's list, regardless of mode.
 */
export async function POST(request: NextRequest) {
  const { phone, force } = await request.json().catch(() => ({}));
  if (!phone) return Response.json({ verified: false, error: "Phone number required." }, { status: 400 });
  const number = String(phone).replace(/\s/g, "");

  let mode = "inventor";
  if (!force) {
    const [verifyEnabled, setMode] = await Promise.all([
      getSetting("mtn_verification_enabled"),
      getSetting("mtn_provider"),
    ]);
    if (verifyEnabled === "false") return Response.json({ verified: true, skipped: true });
    if (setMode === "yhangmhany" || setMode === "auto") mode = setMode;
  }

  if (mode === "yhangmhany") {
    const status = await yhangmhanyVerifyNumber(number);
    if (status === "not_verified") return Response.json(BLOCKED);
    return Response.json(status === "verified" ? { verified: true } : { verified: true, skipped: true });
  }

  if (mode === "auto") {
    const [inv, ym] = await Promise.all([inventorStatus(number), yhangmhanyVerifyNumber(number)]);
    if (inv === "verified" || ym === "verified") return Response.json({ verified: true });
    if (inv === "not_verified" && ym === "not_verified") return Response.json(BLOCKED);
    return Response.json({ verified: true, skipped: true }); // unclear — don't block
  }

  const inv = await inventorStatus(number);
  if (inv === "not_verified") return Response.json(BLOCKED);
  return Response.json(inv === "verified" ? { verified: true } : { verified: true, skipped: true });
}
