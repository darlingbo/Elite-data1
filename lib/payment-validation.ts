import { percentageOf, roundCurrency } from "@/lib/finance";

export function calculateExpectedOrderCharge(input: {
  sellingPrice: number;
  referralCredit?: number;
  promoDiscount?: number;
  surcharge?: number;
  fastDelivery?: boolean;
}): number {
  const base = roundCurrency(input.sellingPrice * 1.02);
  return roundCurrency(Math.max(
    base - roundCurrency(input.referralCredit ?? 0) - roundCurrency(input.promoDiscount ?? 0) +
      roundCurrency(input.surcharge ?? 0) + (input.fastDelivery ? 0.50 : 0),
    0,
  ));
}

export function isSeverelyUnderpaid(paidMinorUnits: number, expectedCharge: number): boolean {
  return paidMinorUnits < Math.round(percentageOf(expectedCharge, 0.5) * 100);
}
