import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { inventorVerifyNumber } from "@/lib/inventor";
import { isNotOnListError } from "@/lib/sms";

async function getSetting(key: string): Promise<string | null> {
  try {
    const { data } = await supabase.from("system_settings").select("value").eq("key", key).maybeSingle();
    return data?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * Checkout gate for MTN numbers. Called before the customer is sent to pay.
 *
 * - Verification is a real check against Inventor's beneficiary list, so it
 *   only applies when Inventor is (part of) the MTN provider: modes
 *   "inventor" and "auto". In "yhangmhany" mode there is nothing to check
 *   against (Yhang Mhany has no verify endpoint), so it's skipped.
 * - A definite "not on the list" answer BLOCKS checkout (verified: false).
 *   An unclear API error (anything that doesn't read as not-on-list) fails
 *   open, so an Inventor hiccup never blocks a paying customer.
 * - Admin can still disable verification site-wide (mtn_verification_enabled
 *   = "false"). `force: true` (trusted server-to-server callers, e.g. Silent
 *   Echo) bypasses both that toggle and the mode skip.
 */
export async function POST(request: NextRequest) {
  const { phone, force } = await request.json().catch(() => ({}));
  if (!phone) return Response.json({ verified: false, error: "Phone number required." }, { status: 400 });

  if (!force) {
    const [verifyEnabled, mode] = await Promise.all([
      getSetting("mtn_verification_enabled"),
      getSetting("mtn_provider"),
    ]);
    if (verifyEnabled === "false") return Response.json({ verified: true, skipped: true });
    if (mode === "yhangmhany") return Response.json({ verified: true, skipped: true });
  }

  // If Inventor isn't configured, allow through — purchase will handle it
  if (!process.env.INVENTOR_API_KEY || !process.env.INVENTOR_API_BASE_URL) {
    return Response.json({ verified: true, skipped: true });
  }

  const { verified, error } = await inventorVerifyNumber(String(phone).replace(/\s/g, ""));
  if (verified) return Response.json({ verified: true });

  if (isNotOnListError(error ?? "")) {
    return Response.json({
      verified: false,
      error: "This MTN number isn't registered to receive data yet, so we can't take payment for it. Please register the number as a data beneficiary with MTN, or use a different number.",
    });
  }

  // Couldn't tell (unexpected API response) — don't block a paying customer on that.
  return Response.json({ verified: true, skipped: true, inventorError: error });
}
