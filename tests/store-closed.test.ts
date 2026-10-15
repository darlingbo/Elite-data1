import { describe, expect, it } from "vitest";
import { isStoreGatedPath } from "@/lib/store-closed";

describe("isStoreGatedPath — which pages close when the store is closed", () => {
  it("closes the shopping pages and agent storefronts", () => {
    for (const path of ["/", "/buy", "/buy/preview/2", "/prices", "/vouchers", "/checkout", "/business", "/leaderboard", "/store/ABC123", "/shop/ABC123"]) {
      expect(isStoreGatedPath(path), path).toBe(true);
    }
  });

  it("closes unknown/new public pages by default", () => {
    expect(isStoreGatedPath("/some-new-page")).toBe(true);
  });

  it("keeps staff, agent and order-tracking areas open", () => {
    for (const path of ["/admin", "/admin/login", "/subadmin", "/agent", "/agent/dashboard", "/agent-agreement", "/track", "/order/ELT-123", "/privacy", "/refund-policy", "/store-closed", "/maintenance"]) {
      expect(isStoreGatedPath(path), path).toBe(false);
    }
  });

  it("never touches APIs, webhooks or crons", () => {
    for (const path of ["/api", "/api/orders/create", "/api/webhooks/paystack", "/api/cron/sync-orders", "/api/telegram/webhook", "/api/admin/store-status"]) {
      expect(isStoreGatedPath(path), path).toBe(false);
    }
  });

  it("keeps static files and metadata images loading", () => {
    for (const path of ["/logo.png", "/manifest.json", "/robots.txt", "/sitemap.xml", "/favicon.ico", "/icon-192.svg", "/opengraph-image"]) {
      expect(isStoreGatedPath(path), path).toBe(false);
    }
  });

  it("does not confuse look-alike prefixes", () => {
    // "/orders-info" is not "/order", "/agentsomething" is not "/agent"
    expect(isStoreGatedPath("/orders-info")).toBe(true);
    expect(isStoreGatedPath("/agentsomething")).toBe(true);
  });
});
