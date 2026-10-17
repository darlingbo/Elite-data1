import { rateLimitDb } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";

/**
 * One line of protection for a public endpoint.
 *
 *   const blocked = await tooMany(request, "track-ref", 60, 10 * 60_000);
 *   if (blocked) return blocked;
 *
 * Counts requests per visitor (by IP) and answers 429 with a plain message once
 * the limit is passed. The counters live in Supabase so every server instance
 * shares them; if that is unavailable it falls back to in-memory counting.
 */
export async function tooMany(
  request: { headers: Headers },
  bucket: string,
  max: number,
  windowMs: number,
  message = "Too many requests. Please wait a few minutes and try again.",
): Promise<Response | null> {
  if (await rateLimitDb(`${bucket}:${clientIp(request)}`, max, windowMs)) {
    return Response.json({ success: false, ok: false, error: message, message }, { status: 429, headers: { "Retry-After": String(Math.ceil(windowMs / 1000)) } });
  }
  return null;
}
