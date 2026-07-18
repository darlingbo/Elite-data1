import { supabase } from "@/lib/supabase";

// ── Rate limiting ─────────────────────────────────────────────────────────────
// In-memory Maps do NOT work reliably on serverless platforms (Netlify, Vercel):
// each function instance has its own memory, so an attacker's requests are spread
// across instances and the limit barely bites. `rateLimitDb` keeps counters in
// Supabase so the limit is shared across every instance. It falls back to the
// in-memory limiter if the DB helper is not installed yet, so it never hard-fails.

const store = new Map<string, { count: number; resetAt: number }>();

/** Synchronous, per-instance limiter. Returns true when the caller is over the limit. */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count++;
  return entry.count > max;
}

/**
 * Distributed limiter backed by Supabase. Returns true when over the limit.
 * Requires the `increment_rate_limit` RPC and `rate_limits` table (see migration.sql).
 * Falls back to the in-memory limiter when the RPC is missing or errors.
 */
export async function rateLimitDb(key: string, max: number, windowMs: number): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("increment_rate_limit", {
      p_key: key,
      p_window_ms: windowMs,
    });
    if (error) {
      // 42883 = function does not exist -> not installed yet.
      return rateLimit(key, max, windowMs);
    }
    const count = Number(data);
    if (!Number.isFinite(count)) return rateLimit(key, max, windowMs);
    return count > max;
  } catch {
    return rateLimit(key, max, windowMs);
  }
}
