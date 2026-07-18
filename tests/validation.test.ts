import { describe, it, expect } from "vitest";
import {
  isValidGhanaPhone,
  normalizePhone,
  walletPurchaseSchema,
  withdrawSchema,
  parseBody,
} from "@/lib/validation";

describe("Ghana phone validation", () => {
  it("accepts valid MTN/Telecel/AirtelTigo numbers", () => {
    expect(isValidGhanaPhone("0241234567")).toBe(true); // MTN
    expect(isValidGhanaPhone("0201234567")).toBe(true); // Telecel/Voda
    expect(isValidGhanaPhone("0501234567")).toBe(true); // Telecel
    expect(isValidGhanaPhone("0271234567")).toBe(true); // AirtelTigo
  });

  it("strips whitespace before validating", () => {
    expect(isValidGhanaPhone(" 024 123 4567 ")).toBe(true);
    expect(normalizePhone(" 024 123 4567 ")).toBe("0241234567");
  });

  it("rejects malformed numbers", () => {
    expect(isValidGhanaPhone("241234567")).toBe(false);   // no leading 0
    expect(isValidGhanaPhone("0141234567")).toBe(false);  // bad prefix (1)
    expect(isValidGhanaPhone("0611234567")).toBe(false);  // bad prefix (6)
    expect(isValidGhanaPhone("024123456")).toBe(false);   // too short
    expect(isValidGhanaPhone("02412345678")).toBe(false); // too long
    expect(isValidGhanaPhone("024123456x")).toBe(false);  // non-digit
    expect(isValidGhanaPhone("")).toBe(false);
  });
});

describe("walletPurchaseSchema", () => {
  const base = { agentId: "a1", referralCode: "ELITE1", phone: "0241234567", bundleId: "b1", network: "mtn" };

  it("accepts a valid body and normalizes the phone", () => {
    const r = parseBody(walletPurchaseSchema, { ...base, phone: " 024 123 4567 " });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.phone).toBe("0241234567");
  });

  it("rejects a missing agentId", () => {
    const r = parseBody(walletPurchaseSchema, { ...base, agentId: "" });
    expect(r.ok).toBe(false);
  });

  it("rejects an invalid phone", () => {
    const r = parseBody(walletPurchaseSchema, { ...base, phone: "12345" });
    expect(r.ok).toBe(false);
  });

  it("rejects a non-object body", () => {
    expect(parseBody(walletPurchaseSchema, null).ok).toBe(false);
  });
});

describe("withdrawSchema", () => {
  const base = { agentId: "a1", referralCode: "ELITE1", name: "Ama", amount: 50, method: "momo", accountNumber: "0241234567", accountName: "Ama" };

  it("accepts a valid withdrawal", () => {
    expect(parseBody(withdrawSchema, base).ok).toBe(true);
  });

  it("coerces a numeric string amount", () => {
    const r = parseBody(withdrawSchema, { ...base, amount: "50" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.amount).toBe(50);
  });

  it("rejects a zero or negative amount", () => {
    expect(parseBody(withdrawSchema, { ...base, amount: 0 }).ok).toBe(false);
    expect(parseBody(withdrawSchema, { ...base, amount: -10 }).ok).toBe(false);
  });
});
