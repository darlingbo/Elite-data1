import { describe, expect, it, vi } from "vitest";

// proxy.ts imports the database client; this test only reads the matcher.
vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import { config } from "@/proxy";

// The matcher decides which requests run proxy.ts at all. Vercel bills each run,
// so static files and cached public endpoints skip it — but pages, admin and
// mutating API routes must still go through (CSP, admin gate, origin check).
const matcher = new RegExp(`^${config.matcher[0]}$`);
const runsProxy = (path: string) => matcher.test(path);

describe("proxy matcher", () => {
  it("runs for pages", () => {
    for (const p of ["/", "/buy", "/vouchers", "/track", "/order/ELT-123", "/admin", "/admin/login"]) {
      expect(runsProxy(p), p).toBe(true);
    }
  });

  it("still runs for every API route that is not on the cached list (origin check, etc.)", () => {
    for (const p of [
      "/api/orders/create", "/api/orders/ELT-123", "/api/orders/by-phone", "/api/vouchers/create",
      "/api/admin/store-status", "/api/admin/orders/approve", "/api/yebeck/charge", "/api/yebeck/status",
      "/api/yebeck/webhook", "/api/telegram/webhook", "/api/cron/backup", "/api/health",
    ]) {
      expect(runsProxy(p), p).toBe(true);
    }
  });

  it("skips the six cached public endpoints", () => {
    for (const p of ["/api/announcements", "/api/orders/recent", "/api/promo-banner", "/api/bundles", "/api/mashup-bundles", "/api/network-status"]) {
      expect(runsProxy(p), p).toBe(false);
    }
  });

  it("does not skip sub-paths or look-alikes of those endpoints", () => {
    for (const p of ["/api/bundles/other", "/api/orders/recent/x", "/api/announcements-admin", "/api/admin/announcements", "/api/admin/bundles"]) {
      expect(runsProxy(p), p).toBe(true);
    }
  });

  it("skips static files", () => {
    for (const p of ["/logo.png", "/icon-192.svg", "/manifest.json", "/robots.txt", "/sitemap.xml", "/google7e04fb657a00be25.html", "/_next/static/chunks/a.js", "/favicon.ico", "/icon.png"]) {
      expect(runsProxy(p), p).toBe(false);
    }
  });
});
