import { describe, expect, it } from "vitest";
import { getOrderReviewSecondsRemaining, orderReviewWaitMessage } from "@/lib/order-review-window";

describe("order review window", () => {
  const created = "2026-08-08T12:00:00.000Z";

  it("holds a new order for 40 seconds", () => {
    expect(getOrderReviewSecondsRemaining(created, Date.parse(created))).toBe(40);
  });

  it("unlocks after 40 seconds", () => {
    expect(getOrderReviewSecondsRemaining(created, Date.parse(created) + 40_000)).toBe(0);
  });

  it("returns a clear admin message", () => {
    expect(orderReviewWaitMessage(1)).toBe("Please review this order for 1 more second before acting");
  });
});
