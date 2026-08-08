import { describe, expect, it } from "vitest";
import { calculateExpectedOrderCharge, isSeverelyUnderpaid } from "@/lib/payment-validation";

describe("order payment validation", () => {
  it("requires the complete server price plus the platform fee", () => {
    expect(calculateExpectedOrderCharge({ sellingPrice: 4.70 })).toBe(4.79);
  });

  it("applies only server-verified credits and fees", () => {
    expect(calculateExpectedOrderCharge({
      sellingPrice: 10,
      referralCredit: 1,
      promoDiscount: 0.50,
      surcharge: 0.25,
      fastDelivery: true,
    })).toBe(9.45);
  });

  it("classifies a two-pesewa payment as severe underpayment", () => {
    expect(isSeverelyUnderpaid(2, 4.79)).toBe(true);
  });
});
