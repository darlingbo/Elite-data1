import { describe, expect, it, vi } from "vitest";

// lib/sms imports the Supabase client at module load; these helpers never touch it.
vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import { isNotOnListError, orderNotOnListSMS, orderNotOnListApologySMS } from "@/lib/sms";

describe("not-on-list SMS handling", () => {
  it("recognises Inventor's beneficiary / new-number rejections", () => {
    for (const message of [
      "0541234567 is not added to our beneficiary list",
      "Phone number not verified",
      "Not on beneficiary list",
      "Number is new to the system",
      "recipient not eligible for this bundle",
    ]) {
      expect(isNotOnListError(message)).toBe(true);
    }
  });

  it("does not treat a generic provider failure as a not-on-list case", () => {
    for (const message of [
      "insufficient balance",
      "provider timeout",
      "invalid bundle size",
      "",
    ]) {
      expect(isNotOnListError(message)).toBe(false);
    }
  });

  it("promises up to 72 hours and no refund in the customer notice", () => {
    const text = orderNotOnListSMS("Kofi Mensah", "mtn", "5GB", "elite-1712345678");
    expect(text).toContain("Kofi");
    expect(text).toContain("MTN 5GB");
    expect(text).toContain("72 hours");
    expect(text.toLowerCase()).toContain("no refund");
  });

  it("apologises without promising a refund after 72 hours", () => {
    const text = orderNotOnListApologySMS("Ama", "telecel", "10GB", "elite-1712345678");
    expect(text.toLowerCase()).toContain("apolog");
    expect(text.toLowerCase()).not.toContain("refund");
  });
});
