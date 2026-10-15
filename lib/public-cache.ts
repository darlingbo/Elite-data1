/**
 * Cache-Control for PUBLIC read-only JSON endpoints — same answer for every
 * visitor, no cookies. Vercel's CDN then serves repeat requests without running
 * a function or querying Supabase, which is what the free-plan CPU and
 * invocation limits are counting.
 *
 * `seconds` is how long the answer is fresh; it may be served up to `seconds`
 * more while a fresh copy loads in the background. Keep it short for prices and
 * on/off switches so admin changes show up quickly.
 *
 * Never use this on anything user-specific or admin-only.
 */
export function publicCache(seconds: number) {
  return { "Cache-Control": `public, s-maxage=${seconds}, stale-while-revalidate=${seconds}` };
}
