import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { inventorVerifyNumber } from "@/lib/inventor";

async function isMtnVerificationEnabled(): Promise<boolean> {
  try {
    const { data } = await supabase.from("system_settings").select("value").eq("key", "mtn_verification_enabled").maybeSingle();
    return data?.value !== "false";
  } catch {
    return true;
  }
}

export async function POST(request: NextRequest) {
  const { phone } = await request.json().catch(() => ({}));
  if (!phone) return Response.json({ verified: false, error: "Phone number required." }, { status: 400 });

  // Admin can disable verification — skip entirely and allow all MTN orders through
  const verifyEnabled = await isMtnVerificationEnabled();
  if (!verifyEnabled) return Response.json({ verified: true, skipped: true });

  // If Inventor isn't configured, allow through — purchase will handle it
  if (!process.env.INVENTOR_API_KEY || !process.env.INVENTOR_API_BASE_URL) {
    return Response.json({ verified: true, skipped: true });
  }

  const { verified, error } = await inventorVerifyNumber(String(phone).replace(/\s/g, ""));

  if (verified) return Response.json({ verified: true });

  // Number not on beneficiary list — let the order through with a warning.
  // Admin handles delivery manually. Never block a paying customer at this step.
  return Response.json({
    verified: true,
    pendingManual: true,
    warning: `Your order will be placed and delivered within 24–48 hours. Our team will handle your delivery manually.`,
    inventorError: error,
  });
}
