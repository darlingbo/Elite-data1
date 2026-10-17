import { describe, expect, it } from "vitest";
import { isStoreGatedPath } from "@/lib/store-closed";

describe("isStoreGatedPath — which pages close when the store is closed", () => {
  it("closes the shopping pages", () => {
    for (const path of ["/", "/buy", "/buy/preview/2", "/prices", "/vouchers", "/checkout", "/business"]) {
      expect(isStoreGatedPath(path), path).toBe(true);
    }
  });

  it("closes unknown/new public pages by default", () => {
    expect(isStoreGatedPath("/some-new-page")).toBe(true);
  });

  it("keeps the admin and order-tracking areas open", () => {
    for (const path of ["/admin", "/admin/login", "/track", "/order/ELT-123", "/privacy", "/refund-policy", "/store-closed", "/maintenance"]) {
      expect(isStoreGatedPath(path), path).toBe(false);
    }
  });

  it("never touches APIs, webhooks or crons", () => {
    for (const path of ["/api", "/api/orders/create", "/api/yebeck/webhook", "/api/cron/sync-orders", "/api/telegram/webhook", "/api/admin/store-status"]) {
      expect(isStoreGatedPath(path), path).toBe(false);
    }
  });

  it("keeps static files and metadata images loading", () => {
    for (const path of ["/logo.png", "/manifest.json", "/robots.txt", "/sitemap.xml", "/favicon.ico", "/icon-192.svg", "/opengraph-image"]) {
      expect(isStoreGatedPath(path), path).toBe(false);
    }
  });

  it("does not confuse look-alike prefixes", () => {
    // "/orders-info" is not "/order", "/administrator" is not "/admin"
    expect(isStoreGatedPath("/orders-info")).toBe(true);
    expect(isStoreGatedPath("/administrator")).toBe(true);
  });
});
