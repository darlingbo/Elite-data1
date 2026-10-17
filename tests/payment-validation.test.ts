import { describe, expect, it } from "vitest";
import { calculateExpectedOrderCharge, isSeverelyUnderpaid } from "@/lib/payment-validation";

describe("order payment validation", () => {
  it("charges exactly the bundle price: there is no processing fee", () => {
    expect(calculateExpectedOrderCharge({ sellingPrice: 4.70 })).toBe(4.70);
    expect(calculateExpectedOrderCharge({ sellingPrice: 5 })).toBe(5);
  });

  it("applies only server-verified credits and fees", () => {
    expect(calculateExpectedOrderCharge({
      sellingPrice: 10,
      referralCredit: 1,
      promoDiscount: 0.50,
      surcharge: 0.25,
      fastDelivery: true,
    })).toBe(9.25);
  });

  it("classifies a two-pesewa payment as severe underpayment", () => {
    expect(isSeverelyUnderpaid(2, 4.7)).toBe(true);
  });
});
