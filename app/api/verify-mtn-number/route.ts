import { NextRequest } from "next/server";
import { rateLimitDb } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";
import { normalizeGhPhone } from "@/lib/phone";
import { inventorNumberStatus } from "@/lib/inventor";
import { isNotOnListError } from "@/lib/sms";
import {
  checkNumber,
  getNumberCheckSettings,
  NOT_VERIFIED_MESSAGE,
  UNREACHABLE_MESSAGE,
} from "@/lib/number-check";

/**
 * Checkout number check. Called as soon as the customer finishes typing the
 * data number, and again by the server right before a payment starts
 * (see /api/yebeck/charge).
 *
 * Order: the first provider chosen in Admin -> Number check, then the second
 * only if the first does not have the number. A number on neither list is
 * blocked. If neither provider answers, the admin's setting decides.
 *
 * Response (kept compatible with the old contract):
 *   { verified: boolean, status, error?, verifyUrl?, skipped? }
 *
 * `force: true` is for trusted server-to-server callers (Silent Echo). It
 * keeps its old meaning: ask Inventor only, ignore the admin switch, and let
 * the number through when Inventor cannot be reached.
 */
export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  const body = await request.json().catch(() => ({})) as { phone?: unknown; force?: unknown; network?: unknown };

  // Browsers get 40 checks a minute each. Trusted server callers (Silent Echo) send many
  // customers' numbers from one address, so they get their own, much larger allowance.
  const trusted = body.force === true;
  if (await rateLimitDb(trusted ? `number-check-server:${ip}` : `number-check:${ip}`, trusted ? 1200 : 40, 60_000)) {
    return Response.json({ verified: false, status: "rate_limited", error: "Too many checks. Please wait a moment and try again." }, { status: 429 });
  }

  const number = String(body.phone ?? "").replace(/\s/g, "");
  if (!number) return Response.json({ verified: false, status: "invalid", error: "Phone number required." }, { status: 400 });
  if (!normalizeGhPhone(number)) return Response.json({ verified: false, status: "invalid", error: "Enter a valid 10-digit Ghana phone number." }, { status: 400 });

  if (body.force === true) {
    const status = await inventorNumberStatus(number, isNotOnListError);
    if (status === "not_verified") {
      return Response.json({ verified: false, status: "not_verified", error: NOT_VERIFIED_MESSAGE });
    }
    return Response.json(status === "verified" ? { verified: true, status: "verified" } : { verified: true, status: "skipped", skipped: true });
  }

  const outcome = await checkNumber(number, { network: typeof body.network === "string" ? body.network : "mtn", ip });

  if (outcome.status === "skipped") return Response.json({ verified: true, status: "skipped", skipped: true });
  if (outcome.status === "verified") return Response.json({ verified: true, status: "verified" });

  const settings = await getNumberCheckSettings();
  if (outcome.status === "not_verified") {
    return Response.json({ verified: false, status: "not_verified", error: NOT_VERIFIED_MESSAGE, verifyUrl: settings.verifyUrl || null });
  }
  // unreachable
  if (outcome.allowed) return Response.json({ verified: true, status: "skipped", skipped: true });
  return Response.json({ verified: false, status: "unreachable", error: UNREACHABLE_MESSAGE });
}
