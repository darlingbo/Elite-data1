import { beforeAll, describe, expect, it } from "vitest";

let rateLimit: (key: string, max: number, windowMs: number) => boolean;

beforeAll(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://placeholder.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "placeholder";
  ({ rateLimit } = await import("@/lib/rate-limit"));
});

describe("rate limiter", () => {
  it("allows requests up to the configured maximum", () => {
    const key = `allow-${Date.now()}`;
    expect(rateLimit(key, 2, 60_000)).toBe(false);
    expect(rateLimit(key, 2, 60_000)).toBe(false);
  });

  it("blocks requests over the configured maximum", () => {
    const key = `block-${Date.now()}`;
    expect(rateLimit(key, 1, 60_000)).toBe(false);
    expect(rateLimit(key, 1, 60_000)).toBe(true);
  });

  it("keeps independent counters for different security scopes", () => {
    const suffix = Date.now();
    expect(rateLimit(`login-${suffix}`, 1, 60_000)).toBe(false);
    expect(rateLimit(`withdraw-${suffix}`, 1, 60_000)).toBe(false);
  });
});
