import { describe, expect, it } from "vitest";
import {
  addCurrency,
  buildUnifiedTransactions,
  divideCurrency,
  formatCurrency,
  fromMinorUnits,
  multiplyCurrency,
  percentageOf,
  roundCurrency,
  subtractCurrency,
  toMinorUnits,
} from "@/lib/finance";

describe("finance helpers", () => {
  it("rounds money consistently to two decimals", () => {
    expect(roundCurrency(10.005)).toBe(10.01);
    expect(roundCurrency(12.345)).toBe(12.35);
    expect(roundCurrency(0.1 + 0.2)).toBe(0.3);
  });

  it("performs addition and subtraction in integer minor units", () => {
    expect(addCurrency(0.1, 0.2, 10.005)).toBe(10.31);
    expect(subtractCurrency(100, 20.1, 30.2)).toBe(49.7);
    expect(toMinorUnits(12.345)).toBe(1235);
    expect(fromMinorUnits(1235)).toBe(12.35);
  });

  it("rounds multiplication, division, and percentages at the money boundary", () => {
    expect(multiplyCurrency(19.99, 3)).toBe(59.97);
    expect(divideCurrency(10, 3)).toBe(3.33);
    expect(percentageOf(99.99, 0.04)).toBe(4);
    expect(() => divideCurrency(10, 0)).toThrow(RangeError);
  });

  it("formats currency for Telegram and UI messages", () => {
    expect(formatCurrency(50)).toBe("GH₵50.00");
    expect(formatCurrency(12.3)).toBe("GH₵12.30");
  });

  it("builds a unified transaction ledger from mixed financial events", () => {
    const walletTxs = [
      { id: "w1", type: "credit", amount: 100, description: "Wallet top-up", created_at: "2024-01-02T10:00:00Z" },
      { id: "w2", type: "debit", amount: 25, description: "Order debit", created_at: "2024-01-02T11:00:00Z" },
    ];
    const ledgerEntries = [
      { id: "l1", type: "snapshot", amount: 200, note: "Start of Day", recorded_at: "2024-01-02T08:00:00Z" },
      { id: "l2", type: "deposit", amount: 50, note: "Manual", recorded_at: "2024-01-02T12:00:00Z" },
    ];

    const result = buildUnifiedTransactions({
      walletTransactions: walletTxs,
      agentWalletTransactions: [
        { id: "a1", type: "withdrawal", amount: 15, description: "Withdrawal", created_at: "2024-01-02T09:00:00Z" },
      ],
      ledgerEntries,
    });

    expect(result).toHaveLength(5);
    expect(result.map((transaction) => transaction.kind)).toEqual([
      "deposit",
      "wallet-debit",
      "wallet-topup",
      "withdrawal",
      "snapshot",
    ]);
    expect(result[3].direction).toBe("out");
  });
});
