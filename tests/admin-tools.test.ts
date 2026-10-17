import { afterEach, describe, expect, it } from "vitest";
import { cronAuthorized } from "@/lib/cron-auth";
import { isRejectReason, rejectionSms, shortRef, smsTemplate } from "@/lib/admin-sms-templates";

const SECRET = "a-long-enough-cron-secret-1234567890";
const original = process.env.CRON_SECRET;

function req(authorization?: string, extra: Record<string, string> = {}) {
  const headers = new Headers(extra);
  if (authorization) headers.set("authorization", authorization);
  return { headers };
}

afterEach(() => {
  if (original === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = original;
});

describe("cronAuthorized", () => {
  it("accepts the exact bearer secret", () => {
    process.env.CRON_SECRET = SECRET;
    expect(cronAuthorized(req(`Bearer ${SECRET}`))).toBe(true);
  });

  it("refuses a wrong or missing header", () => {
    process.env.CRON_SECRET = SECRET;
    expect(cronAuthorized(req(`Bearer ${SECRET}x`))).toBe(false);
    expect(cronAuthorized(req(SECRET))).toBe(false);
    expect(cronAuthorized(req())).toBe(false);
  });

  it("refuses everything when the secret is not set", () => {
    delete process.env.CRON_SECRET;
    expect(cronAuthorized(req("Bearer undefined"))).toBe(false);
    expect(cronAuthorized(req("Bearer "))).toBe(false);
    expect(cronAuthorized(req())).toBe(false);
  });

  it("refuses a secret that is too short", () => {
    process.env.CRON_SECRET = "short";
    expect(cronAuthorized(req("Bearer short"))).toBe(false);
  });

  it("does not trust the x-vercel-cron header on its own", () => {
    process.env.CRON_SECRET = SECRET;
    expect(cronAuthorized(req(undefined, { "x-vercel-cron": "1" }))).toBe(false);
  });
});

describe("admin SMS templates", () => {
  it("knows the reject reasons", () => {
    expect(isRejectReason("wrong_number")).toBe(true);
    expect(isRejectReason("because I said so")).toBe(false);
    expect(isRejectReason(undefined)).toBe(false);
  });

  it("keeps short references and shortens long ones", () => {
    expect(shortRef("YBK-482131")).toBe("YBK-482131");
    expect(shortRef("yebeck_1699999999999_abcdef12")).toBe("ABCDEF12");
  });

  it("says a refund is coming only when one is", () => {
    const base = { reference: "YBK-482131", reason: "wrong_number" as const, amount: 5 };
    const refunded = rejectionSms({ ...base, willRefund: true });
    const notRefunded = rejectionSms({ ...base, willRefund: false });
    expect(refunded).toContain("GH₵5.00 is being refunded");
    expect(notRefunded).not.toContain("refunded");
    expect(refunded).toContain("YBK-482131");
    expect(refunded).toContain("could not receive data");
  });

  it("greets by first name only when there is a real name", () => {
    const order = { reference: "YBK-1", network: "mtn", bundle_size: "2GB", phone: "0241234567" };
    expect(smsTemplate("delivered", { ...order, customer_name: "Kofi Mensah" })).toContain("Hi Kofi,");
    expect(smsTemplate("delivered", { ...order, customer_name: "0241234567" })).not.toContain("Hi ");
    expect(smsTemplate("delivered", order)).toContain("MTN 2GB");
  });
});
