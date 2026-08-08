import { describe, expect, it } from "vitest";
import { reverseTeamCommissionBalances, splitTeamCommission } from "@/lib/team-finance";

describe("team financial lifecycle", () => {
  it("splits commission 70/20/10 without creating money", () => {
    const split = splitTeamCommission(10);
    expect(split).toEqual({ seller: 7, subAdmin: 2, admin: 1, gross: 10 });
    expect(split.seller + split.subAdmin + split.admin).toBe(split.gross);
  });

  it("reverses the Pro and admin deductions and records Pro debt if already withdrawn", () => {
    expect(reverseTeamCommissionBalances(7, 2, 10)).toEqual({ sellerBalance: 10, subAdminBalance: 0 });
    expect(reverseTeamCommissionBalances(7, 0, 10)).toEqual({ sellerBalance: 10, subAdminBalance: -2 });
  });

  it("never creates negative commission from a negative gross input", () => {
    expect(splitTeamCommission(-10)).toEqual({ seller: 0, subAdmin: 0, admin: 0, gross: 0 });
  });
});
