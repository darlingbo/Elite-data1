import { describe, expect, it } from "vitest";
import {
  paymentEvidence,
  reconcileOrders,
  type ReconciliationOrder,
} from "@/lib/reconciliation";

function order(
  overrides: Partial<ReconciliationOrder> = {},
): ReconciliationOrder {
  return {
    reference: "ELITE-001",
    status: "completed",
    amount: 100,
    cost_price: 70,
    agent_commission: 10,
    admin_commission: 20,
    payment_method: "paystack",
    paystack_reference: "PS-001",
    refunded: false,
    refund_amount: 0,
    agent_id: null,
    agent_accounting_applied_at: null,
    fulfillment_started_at: null,
    completed_at: "2026-07-23T08:10:00.000Z",
    created_at: "2026-07-23T08:00:00.000Z",
    updated_at: "2026-07-23T08:10:00.000Z",
    phone: "0241234567",
    network: "mtn",
    bundle_size: "1 GB",
    ...overrides,
  };
}

describe("payment evidence", () => {
  it("recognises Paystack and internal wallet/manual/API orders", () => {
    expect(paymentEvidence(order())).toBe("paystack");
    expect(paymentEvidence(order({
      reference: "AGTWALLET-001",
      payment_method: "wallet",
      paystack_reference: null,
    }))).toBe("internal");
    expect(paymentEvidence(order({
      reference: "MNL-001",
      payment_method: null,
      paystack_reference: null,
    }))).toBe("internal");
    expect(paymentEvidence(order({
      reference: "elite-bulk-1784810000000-01",
      payment_method: null,
      paystack_reference: null,
    }))).toBe("paystack");
  });

  it("flags a positive-value order with no recognised payment evidence", () => {
    expect(paymentEvidence(order({
      reference: "UNKNOWN-001",
      payment_method: null,
      paystack_reference: null,
    }))).toBe("missing");
  });
});

describe("financial reconciliation", () => {
  it("balances a correctly accounted completed order", () => {
    const result = reconcileOrders([order()]);

    expect(result.status).toBe("balanced");
    expect(result.riskAmount).toBe(0);
    expect(result.issueCount).toBe(0);
    expect(result.metrics.completedRevenue).toBe(100);
    expect(result.metrics.providerCost).toBe(70);
    expect(result.metrics.agentCommissions).toBe(10);
    expect(result.metrics.expectedProfit).toBe(20);
    expect(result.metrics.recordedAdminProfit).toBe(20);
  });

  it("does not double-count one order that has multiple critical warnings", () => {
    const result = reconcileOrders([
      order({
        reference: "UNKNOWN-FAILED",
        status: "failed",
        amount: 50,
        payment_method: null,
        paystack_reference: null,
        completed_at: null,
      }),
    ]);

    expect(result.issueCounts.missing_payment_evidence).toBe(1);
    expect(result.issueCounts.refund_exposure).toBe(1);
    expect(result.riskAmount).toBe(50);
    expect(result.status).toBe("critical");
  });

  it("detects a duplicate Paystack reference without counting the first order as risk", () => {
    const result = reconcileOrders([
      order(),
      order({ reference: "ELITE-002", amount: 80, cost_price: 60, admin_commission: 10 }),
    ]);

    expect(result.issueCounts.duplicate_payment_reference).toBe(1);
    expect(result.riskAmount).toBe(80);
    expect(result.issues.find((issue) => issue.type === "duplicate_payment_reference")?.reference)
      .toBe("ELITE-002");
  });

  it("allows several bulk-order children to share one verified Paystack payment", () => {
    const result = reconcileOrders([
      order({
        reference: "elite-bulk-1784810000000-01",
        payment_method: "paystack_bulk",
        paystack_reference: "elite-bulk-1784810000000",
      }),
      order({
        reference: "elite-bulk-1784810000000-02",
        payment_method: "paystack_bulk",
        paystack_reference: "elite-bulk-1784810000000",
      }),
    ]);

    expect(result.issueCounts.duplicate_payment_reference).toBe(0);
    expect(result.riskAmount).toBe(0);
    expect(result.status).toBe("balanced");
  });

  it("flags a claimed payment that has no safely recorded orders", () => {
    const result = reconcileOrders([], {
      payments: [{
        id: "payment-1",
        amount: 204,
        reference: "elite-bulk-1784810000000",
        status: "failed",
        created_at: "2026-07-23T08:00:00.000Z",
      }],
      now: new Date("2026-07-23T08:05:00.000Z"),
    });

    expect(result.issueCounts.orphan_payment).toBe(1);
    expect(result.riskAmount).toBe(204);
    expect(result.status).toBe("critical");
  });

  it("calculates only the unfinished value of a stuck bulk payment", () => {
    const paymentReference = "elite-bulk-1784810000000";
    const result = reconcileOrders([
      order({
        reference: `${paymentReference}-01`,
        amount: 102,
        cost_price: 70,
        agent_commission: 10,
        admin_commission: 20,
        payment_method: "paystack_bulk",
        paystack_reference: paymentReference,
      }),
      order({
        reference: `${paymentReference}-02`,
        status: "pending",
        amount: 102,
        payment_method: "paystack_bulk",
        paystack_reference: paymentReference,
        completed_at: null,
      }),
    ], {
      payments: [{
        id: "payment-1",
        amount: 204,
        reference: paymentReference,
        status: "processing",
        created_at: "2026-07-23T08:00:00.000Z",
      }],
      now: new Date("2026-07-23T09:00:00.000Z"),
    });

    expect(result.issueCounts.stuck_payment_claim).toBe(1);
    expect(result.riskAmount).toBe(102);
  });

  it("blocks approval review when a bulk payment and queued order total differ", () => {
    const paymentReference = "elite-bulk-1784810000000";
    const result = reconcileOrders([
      order({
        reference: `${paymentReference}-01`,
        status: "pending_approval",
        amount: 102,
        payment_method: "paystack_bulk",
        paystack_reference: paymentReference,
        completed_at: null,
      }),
    ], {
      payments: [{
        id: "payment-1",
        amount: 204,
        reference: paymentReference,
        status: "partial",
        created_at: "2026-07-23T08:00:00.000Z",
      }],
    });

    expect(result.issueCounts.payment_order_mismatch).toBe(1);
    expect(result.riskAmount).toBe(102);
    expect(result.status).toBe("critical");
  });

  it("detects negative margin using only the actual loss as exposure", () => {
    const result = reconcileOrders([
      order({ amount: 100, cost_price: 95, agent_commission: 10, admin_commission: -5 }),
    ]);

    expect(result.issueCounts.negative_margin).toBe(1);
    expect(result.riskAmount).toBe(5);
  });

  it("allows normal Paystack fee variance but flags a material profit mismatch", () => {
    const normalFee = reconcileOrders([
      order({ amount: 102, cost_price: 70, agent_commission: 10, admin_commission: 20 }),
    ]);
    const materialMismatch = reconcileOrders([
      order({
        reference: "MNL-MISMATCH",
        payment_method: "manual",
        paystack_reference: null,
        admin_commission: 5,
      }),
    ]);

    expect(normalFee.issueCounts.profit_mismatch).toBe(0);
    expect(materialMismatch.issueCounts.profit_mismatch).toBe(1);
  });

  it("marks processing older than 30 minutes for review without inventing money risk", () => {
    const result = reconcileOrders([
      order({
        status: "processing",
        completed_at: null,
        fulfillment_started_at: "2026-07-23T08:00:00.000Z",
      }),
    ], { now: new Date("2026-07-23T09:00:00.000Z") });

    expect(result.issueCounts.stuck_processing).toBe(1);
    expect(result.riskAmount).toBe(0);
    expect(result.status).toBe("review");
  });

  it("flags modern completed agent orders when accounting was not applied", () => {
    const result = reconcileOrders([
      order({ agent_id: "agent-1", agent_accounting_applied_at: null }),
    ]);

    expect(result.issueCounts.completed_missing_accounting).toBe(1);
    expect(result.status).toBe("review");
  });
});
