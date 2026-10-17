import { timingSafeEqual } from "node:crypto";

/**
 * Scheduled jobs are called by Vercel Cron with `Authorization: Bearer <CRON_SECRET>`.
 * The secret must be set and at least 24 characters. If it is missing, every call is
 * refused (a missing secret must never turn into "Bearer undefined" matching itself).
 * The x-vercel-cron header is not trusted: anyone can send it.
 */
export function cronAuthorized(request: { headers: Headers }): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  if (secret.length < 24) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
