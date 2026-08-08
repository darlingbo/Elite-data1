import { describe, expect, it } from "vitest";
import { buildFinanceAnalytics, type FinanceOrderInput } from "@/lib/finance-analytics";

const NOW = new Date("2026-07-28T12:00:00.000Z");

function order(overrides: Partial<FinanceOrderInput> = {}): FinanceOrderInput {
  return {
    reference: `REF-${Math.random()}`,
    customer_name: "Ama Customer",
    phone: "0240000000",
    network: "mtn",
    bundle_size: "2GB",
    amount: 100,
    cost_price: 70,
    agent_commission: 10,
    admin_commission: 20,
    status: "completed",
    payment_method: "paystack",
    created_at: "2026-07-28T08:00:00.000Z",
    ...overrides,
  };
}

describe("finance analytics", () => {
  it("calculates completed-order profit from selling price minus cost and commission", () => {
    const result = buildFinanceAnalytics([
      order(),
      order({ reference: "FAILED", amount: 500, cost_price: 10, status: "failed" }),
      order({ reference: "PENDING", amount: 300, cost_price: 10, status: "pending_approval" }),
    ], [], {}, 80, NOW);

    expect(result.summary.todayOrders).toBe(3);
    expect(result.summary.todayRevenue).toBe(100);
    expect(result.summary.todayProfit).toBe(20);
    expect(result.periods.lifetime).toMatchObject({
      revenue: 100,
      cost: 70,
      commission: 10,
      profit: 20,
      orders: 1,
      margin: 20,
    });
  });

  it("applies transaction filters without changing trusted lifetime calculations", () => {
    const result = buildFinanceAnalytics([
      order({ reference: "MTN", network: "mtn", amount: 100 }),
      order({ reference: "TC", network: "telecel", amount: 50, cost_price: 30, agent_commission: 5 }),
    ], [], { network: "telecel", status: "completed" }, 0, NOW);

    expect(result.periods.selected.revenue).toBe(50);
    expect(result.transactions.map((row) => row.reference)).toEqual(["TC"]);
    expect(result.periods.lifetime.revenue).toBe(150);
  });

  it("builds agent and customer analytics from completed orders only", () => {
    const result = buildFinanceAnalytics([
      order({ reference: "A1", agent_id: "agent-1", amount: 120, customer_name: "Kojo", phone: "0201" }),
      order({ reference: "A2", agent_id: "agent-1", amount: 80, customer_name: "Kojo", phone: "0201" }),
      order({ reference: "A3", agent_id: "agent-2", amount: 50, customer_name: "Esi", phone: "0202" }),
    ], [
      { id: "agent-1", name: "Agent One", status: "approved" },
      { id: "agent-2", name: "Agent Two", status: "inactive" },
    ], {}, 100, NOW);

    expect(result.agents.rows[0]).toMatchObject({ name: "Agent One", orders: 2, revenue: 200 });
    expect(result.customers.returningCustomers).toBe(1);
    expect(result.customers.highestSpending).toMatchObject({ name: "Kojo", spend: 200 });
    expect(result.summary.totalCustomers).toBe(2);
  });

  it("surfaces negative profit for loss-making completed orders", () => {
    const result = buildFinanceAnalytics([
      order({ amount: 40, cost_price: 50, agent_commission: 10 }),
    ], [], {}, 0, NOW);

    expect(result.summary.todayProfit).toBe(-20);
    expect(result.transactions[0].profit).toBe(-20);
  });

  it("deducts refunds and separates direct profit from agent-sale admin profit", () => {
    const result = buildFinanceAnalytics([
      order({ reference: "DIRECT", amount: 100, cost_price: 60, agent_commission: 0 }),
      order({ reference: "AGENT", amount: 100, cost_price: 60, agent_commission: 10, agent_id: "agent-1" }),
      order({ reference: "PARTIAL-REFUND", amount: 100, cost_price: 60, agent_commission: 10, refunded: true, refund_amount: 20 }),
    ], [{ id: "agent-1", name: "Agent One" }], {}, 0, NOW);

    expect(result.periods.lifetime).toMatchObject({
      revenue: 280,
      cost: 180,
      commission: 20,
      profit: 80,
      directProfit: 50,
      agentSaleProfit: 30,
    });
    expect(result.transactions.find((row) => row.reference === "PARTIAL-REFUND")).toMatchObject({
      netRevenue: 80,
      profit: 10,
    });
  });
});
