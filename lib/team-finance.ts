import { roundCurrency } from "@/lib/finance";

export function splitTeamCommission(grossCommission: number) {
  const gross = Math.max(0, roundCurrency(grossCommission));
  const subAdmin = roundCurrency(gross * 0.2);
  const admin = roundCurrency(gross * 0.1);
  return { seller: roundCurrency(gross - subAdmin - admin), subAdmin, admin, gross };
}

export function reverseTeamCommissionBalances(sellerBalance: number, subAdminBalance: number, grossCommission: number) {
  const split = splitTeamCommission(grossCommission);
  return {
    sellerBalance: roundCurrency(sellerBalance + split.subAdmin + split.admin),
    subAdminBalance: roundCurrency(subAdminBalance - split.subAdmin),
  };
}
