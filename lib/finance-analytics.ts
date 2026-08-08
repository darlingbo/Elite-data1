import { addCurrency, roundCurrency, subtractCurrency } from "./finance";

export interface FinanceOrderInput {
  reference: string;
  customer_name?: string | null;
  customer_email?: string | null;
  phone?: string | null;
  network?: string | null;
  bundle_size?: string | null;
  amount?: number | string | null;
  cost_price?: number | string | null;
  agent_commission?: number | string | null;
  admin_commission?: number | string | null;
  agent_id?: string | null;
  payment_method?: string | null;
  status?: string | null;
  refunded?: boolean | null;
  refund_amount?: number | string | null;
  created_at: string;
}

export interface FinanceAgentInput {
  id: string;
  name?: string | null;
  status?: string | null;
  commission_balance?: number | string | null;
  wallet_balance?: number | string | null;
}

export interface FinanceFilters {
  from?: string | null;
  to?: string | null;
  agent?: string | null;
  network?: string | null;
  status?: string | null;
  paymentMethod?: string | null;
}

type MoneyPeriod = {
  revenue: number;
  cost: number;
  profit: number;
  commission: number;
  recordedAdminProfit: number;
  directProfit: number;
  agentSaleProfit: number;
  orders: number;
  margin: number;
};
type ChartPoint = { label: string; revenue: number; profit: number; orders: number; customers?: number };

const DAY = 86_400_000;
const money = (value: unknown) => roundCurrency(Number(value ?? 0));
const statusOf = (order: FinanceOrderInput) => String(order.status ?? "").toLowerCase();
const isCompleted = (order: FinanceOrderInput) => statusOf(order) === "completed";
const customerKey = (order: FinanceOrderInput) =>
  String(order.phone || order.customer_email || order.customer_name || "Unknown").trim().toLowerCase();

function orderRevenue(order: FinanceOrderInput) {
  return subtractCurrency(money(order.amount), order.refunded ? money(order.refund_amount) : 0);
}

function orderProfit(order: FinanceOrderInput) {
  return subtractCurrency(orderRevenue(order), money(order.cost_price), money(order.agent_commission));
}

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function startOfWeek(date: Date) {
  const value = startOfDay(date);
  const day = value.getDay();
  value.setDate(value.getDate() - (day === 0 ? 6 : day - 1));
  return value;
}

function aggregate(orders: FinanceOrderInput[]): MoneyPeriod {
  const completed = orders.filter(isCompleted);
  const values = completed.reduce(
    (result, order) => {
      result.revenue = addCurrency(result.revenue, orderRevenue(order));
      result.cost = addCurrency(result.cost, money(order.cost_price));
      result.commission = addCurrency(result.commission, money(order.agent_commission));
      result.recordedAdminProfit = addCurrency(result.recordedAdminProfit, money(order.admin_commission));
      const profit = orderProfit(order);
      result.profit = addCurrency(result.profit, profit);
      if (order.agent_id) result.agentSaleProfit = addCurrency(result.agentSaleProfit, profit);
      else result.directProfit = addCurrency(result.directProfit, profit);
      return result;
    },
    {
      revenue: 0,
      cost: 0,
      profit: 0,
      commission: 0,
      recordedAdminProfit: 0,
      directProfit: 0,
      agentSaleProfit: 0,
    },
  );
  return {
    ...values,
    orders: completed.length,
    margin: values.revenue > 0 ? roundCurrency((values.profit / values.revenue) * 100) : 0,
  };
}

function percentChange(current: number, previous: number) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return roundCurrency(((current - previous) / Math.abs(previous)) * 100);
}

function inRange(order: FinanceOrderInput, from: Date, to: Date) {
  const time = new Date(order.created_at).getTime();
  return time >= from.getTime() && time < to.getTime();
}

function buildDailySeries(orders: FinanceOrderInput[], now: Date, days = 30): ChartPoint[] {
  const points: ChartPoint[] = [];
  const today = startOfDay(now);
  for (let index = days - 1; index >= 0; index--) {
    const from = new Date(today.getTime() - index * DAY);
    const to = new Date(from.getTime() + DAY);
    const period = aggregate(orders.filter((order) => inRange(order, from, to)));
    points.push({
      label: from.toLocaleDateString("en-GH", { day: "2-digit", month: "short" }),
      revenue: period.revenue,
      profit: period.profit,
      orders: period.orders,
    });
  }
  return points;
}

function buildWeeklySeries(orders: FinanceOrderInput[], now: Date): ChartPoint[] {
  const thisWeek = startOfWeek(now);
  return Array.from({ length: 12 }, (_, position) => {
    const index = 11 - position;
    const from = new Date(thisWeek.getTime() - index * 7 * DAY);
    const to = new Date(from.getTime() + 7 * DAY);
    const period = aggregate(orders.filter((order) => inRange(order, from, to)));
    return {
      label: from.toLocaleDateString("en-GH", { day: "2-digit", month: "short" }),
      revenue: period.revenue,
      profit: period.profit,
      orders: period.orders,
    };
  });
}

function buildMonthlySeries(orders: FinanceOrderInput[], now: Date): ChartPoint[] {
  return Array.from({ length: 12 }, (_, position) => {
    const index = 11 - position;
    const from = new Date(now.getFullYear(), now.getMonth() - index, 1);
    const to = new Date(now.getFullYear(), now.getMonth() - index + 1, 1);
    const periodOrders = orders.filter((order) => inRange(order, from, to));
    const period = aggregate(periodOrders);
    return {
      label: from.toLocaleDateString("en-GH", { month: "short" }),
      revenue: period.revenue,
      profit: period.profit,
      orders: period.orders,
      customers: new Set(periodOrders.filter(isCompleted).map(customerKey)).size,
    };
  });
}

function ranking<T extends { value: number }>(items: T[], limit = 10) {
  return items.toSorted((a, b) => b.value - a.value).slice(0, limit);
}

export function buildFinanceAnalytics(
  orders: FinanceOrderInput[],
  agents: FinanceAgentInput[],
  filters: FinanceFilters = {},
  walletBalance = 0,
  now = new Date(),
) {
  const todayStart = startOfDay(now);
  const tomorrow = new Date(todayStart.getTime() + DAY);
  const yesterdayStart = new Date(todayStart.getTime() - DAY);
  const weekStart = startOfWeek(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const selectedFrom = filters.from ? new Date(`${filters.from}T00:00:00`) : new Date(0);
  const selectedTo = filters.to ? new Date(`${filters.to}T23:59:59.999`) : new Date(8_640_000_000_000_000);

  const filtered = orders.filter((order) => {
    const created = new Date(order.created_at);
    return created >= selectedFrom && created <= selectedTo
      && (!filters.agent || filters.agent === "all" || order.agent_id === filters.agent)
      && (!filters.network || filters.network === "all" || String(order.network).toLowerCase() === filters.network.toLowerCase())
      && (!filters.status || filters.status === "all" || statusOf(order) === filters.status.toLowerCase())
      && (!filters.paymentMethod || filters.paymentMethod === "all"
        || String(order.payment_method ?? "unknown").toLowerCase() === filters.paymentMethod.toLowerCase());
  });

  const todayOrders = orders.filter((order) => inRange(order, todayStart, tomorrow));
  const yesterdayOrders = orders.filter((order) => inRange(order, yesterdayStart, todayStart));
  const weekOrders = orders.filter((order) => inRange(order, weekStart, tomorrow));
  const monthOrders = orders.filter((order) => inRange(order, monthStart, tomorrow));
  const lastMonthOrders = orders.filter((order) => inRange(order, lastMonthStart, monthStart));
  const yearOrders = orders.filter((order) => inRange(order, yearStart, tomorrow));
  const lifetime = aggregate(orders);
  const today = aggregate(todayOrders);
  const yesterday = aggregate(yesterdayOrders);
  const week = aggregate(weekOrders);
  const month = aggregate(monthOrders);
  const lastMonth = aggregate(lastMonthOrders);
  const year = aggregate(yearOrders);
  const selected = aggregate(filtered);

  const agentNames = new Map(agents.map((agent) => [agent.id, agent.name || "Unnamed agent"]));
  const agentStats = new Map<string, { orders: number; revenue: number; commission: number; profit: number }>();
  const bundleStats = new Map<string, { orders: number; revenue: number; profit: number; network: string }>();
  const customerStats = new Map<string, { name: string; phone: string; orders: number; spend: number; first: string; last: string }>();

  for (const order of orders.filter(isCompleted)) {
    if (order.agent_id) {
      const row = agentStats.get(order.agent_id) ?? { orders: 0, revenue: 0, commission: 0, profit: 0 };
      row.orders += 1;
      row.revenue = addCurrency(row.revenue, orderRevenue(order));
      row.commission = addCurrency(row.commission, money(order.agent_commission));
      row.profit = addCurrency(row.profit, orderProfit(order));
      agentStats.set(order.agent_id, row);
    }
    const bundleKey = `${order.network || "Other"} · ${order.bundle_size || "Unknown"}`;
    const bundle = bundleStats.get(bundleKey) ?? { orders: 0, revenue: 0, profit: 0, network: order.network || "Other" };
    bundle.orders += 1;
    bundle.revenue = addCurrency(bundle.revenue, orderRevenue(order));
    bundle.profit = addCurrency(bundle.profit, orderProfit(order));
    bundleStats.set(bundleKey, bundle);

    const key = customerKey(order);
    const customer = customerStats.get(key) ?? {
      name: order.customer_name || "Customer",
      phone: order.phone || "",
      orders: 0,
      spend: 0,
      first: order.created_at,
      last: order.created_at,
    };
    customer.orders += 1;
    customer.spend = addCurrency(customer.spend, orderRevenue(order));
    if (order.created_at < customer.first) customer.first = order.created_at;
    if (order.created_at > customer.last) customer.last = order.created_at;
    customerStats.set(key, customer);
  }

  const topAgents = ranking([...agentStats].map(([id, row]) => ({
    id,
    name: agentNames.get(id) ?? "Unknown agent",
    value: row.revenue,
    ...row,
  })));
  const topBundles = ranking([...bundleStats].map(([name, row]) => ({ name, value: row.orders, ...row })));
  const topCustomers = ranking([...customerStats].map(([id, row]) => ({ id, value: row.spend, ...row })));
  const completedCount = orders.filter(isCompleted).length;
  const failedCount = orders.filter((order) => ["failed", "rejected"].includes(statusOf(order))).length;
  const resolvedCount = completedCount + failedCount;
  const refunds = orders.filter((order) => order.refunded);
  const thisWeekStart = new Date(todayStart.getTime() - 6 * DAY);
  const previousWeekStart = new Date(thisWeekStart.getTime() - 7 * DAY);
  const recent7 = aggregate(orders.filter((order) => inRange(order, thisWeekStart, tomorrow)));
  const previous7 = aggregate(orders.filter((order) => inRange(order, previousWeekStart, thisWeekStart)));

  const alerts: Array<{ level: "critical" | "warning" | "info"; title: string; detail: string }> = [];
  if (recent7.revenue < previous7.revenue) alerts.push({
    level: "warning", title: "Revenue decreased",
    detail: `Last 7 days are ${Math.abs(percentChange(recent7.revenue, previous7.revenue)).toFixed(1)}% below the previous period.`,
  });
  if (recent7.profit < previous7.profit) alerts.push({
    level: "warning", title: "Profit dropped",
    detail: `Profit is ${Math.abs(percentChange(recent7.profit, previous7.profit)).toFixed(1)}% below the previous 7 days.`,
  });
  if (orders.filter((order) => statusOf(order) === "failed" && new Date(order.created_at) >= thisWeekStart).length >= 3) {
    alerts.push({ level: "critical", title: "Repeated order failures", detail: "Three or more orders failed during the last 7 days." });
  }
  if (lifetime.revenue > 0 && lifetime.commission / lifetime.revenue > 0.25) {
    alerts.push({ level: "critical", title: "Abnormal agent commission", detail: "Lifetime commission exceeds 25% of completed revenue." });
  }
  if (walletBalance < 50) alerts.push({ level: "critical", title: "Wallet balance is low", detail: "Combined tracked wallet balance is below GH₵50." });

  const transactionRows = filtered
    .toSorted((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 500)
    .map((order) => ({
      reference: order.reference,
      customer: order.customer_name || "Customer",
      phone: order.phone || "",
      network: order.network || "Other",
      bundle: order.bundle_size || "Unknown",
      sellingPrice: money(order.amount),
      netRevenue: isCompleted(order) ? orderRevenue(order) : 0,
      actualCost: money(order.cost_price),
      profit: isCompleted(order) ? orderProfit(order) : 0,
      recordedAdminProfit: isCompleted(order) ? money(order.admin_commission) : 0,
      agentCommission: money(order.agent_commission),
      agent: order.agent_id ? agentNames.get(order.agent_id) ?? "Agent" : "Direct",
      paymentMethod: order.payment_method || (order.reference.startsWith("AGTWALLET-") ? "agent_wallet" : "paystack"),
      status: statusOf(order),
      date: order.created_at,
    }));

  const returningCustomers = [...customerStats.values()].filter((customer) => customer.orders > 1);
  const newCustomers = [...customerStats.values()].filter((customer) => new Date(customer.first) >= monthStart);

  return {
    generatedAt: now.toISOString(),
    filters,
    summary: {
      todayOrders: todayOrders.length,
      todayRevenue: today.revenue,
      todayProfit: today.profit,
      pendingOrders: orders.filter((order) => ["pending", "pending_approval", "processing"].includes(statusOf(order))).length,
      completedOrders: completedCount,
      failedOrders: failedCount,
      walletBalance: roundCurrency(walletBalance),
      agentCommissionPaid: lifetime.commission,
      adminProfit: lifetime.profit,
      totalCustomers: customerStats.size,
      totalAgents: agents.length,
      monthlyRevenue: month.revenue,
      trends: {
        orders: percentChange(todayOrders.length, yesterdayOrders.length),
        revenue: percentChange(today.revenue, yesterday.revenue),
        profit: percentChange(today.profit, yesterday.profit),
        monthlyRevenue: percentChange(month.revenue, lastMonth.revenue),
      },
    },
    periods: { today, week, month, year, lifetime, selected },
    charts: {
      daily: buildDailySeries(orders, now),
      weekly: buildWeeklySeries(orders, now),
      monthly: buildMonthlySeries(orders, now),
      topAgents,
      topBundles,
      customerGrowth: buildMonthlySeries(orders, now).map(({ label, customers }) => ({ label, value: customers ?? 0 })),
    },
    reports: {
      daily: {
        ...today,
        expenses: addCurrency(today.cost, today.commission),
        averageOrderValue: today.orders ? roundCurrency(today.revenue / today.orders) : 0,
        bestSellingBundle: topBundles[0]?.name ?? "No sales",
        mostActiveAgent: topAgents[0]?.name ?? "No agent sales",
        bestCustomer: topCustomers[0]?.name ?? "No customers",
        completionRate: todayOrders.length ? roundCurrency((today.orders / todayOrders.length) * 100) : 0,
        successRate: resolvedCount ? roundCurrency((completedCount / resolvedCount) * 100) : 0,
      },
      weekly: {
        ...week,
        growth: percentChange(recent7.revenue, previous7.revenue),
        failed: orders.filter((order) => statusOf(order) === "failed" && new Date(order.created_at) >= weekStart).length,
        refunds: refunds.filter((order) => new Date(order.created_at) >= weekStart).length,
        topAgent: topAgents[0]?.name ?? "No agent sales",
        topCustomer: topCustomers[0]?.name ?? "No customers",
      },
      monthly: {
        ...month,
        growth: percentChange(month.revenue, lastMonth.revenue),
        bestSellingProducts: topBundles.slice(0, 5),
        topAgents,
        topCustomers,
      },
    },
    agents: {
      total: agents.length,
      active: agents.filter((agent) => String(agent.status).toLowerCase() === "approved").length,
      inactive: agents.filter((agent) => String(agent.status).toLowerCase() !== "approved").length,
      highestEarning: topAgents.toSorted((a, b) => b.commission - a.commission)[0] ?? null,
      commissionPaid: lifetime.commission,
      rows: topAgents,
    },
    customers: {
      newCustomers: newCustomers.length,
      returningCustomers: returningCustomers.length,
      ordersPerCustomer: customerStats.size ? roundCurrency(completedCount / customerStats.size) : 0,
      highestSpending: topCustomers[0] ?? null,
      lifetimeValue: customerStats.size ? roundCurrency(lifetime.revenue / customerStats.size) : 0,
      rows: topCustomers,
    },
    options: {
      agents: agents.map((agent) => ({ id: agent.id, name: agent.name || "Unnamed agent" })),
      networks: [...new Set(orders.map((order) => order.network).filter(Boolean))].toSorted(),
      statuses: [...new Set(orders.map(statusOf).filter(Boolean))].toSorted(),
      paymentMethods: [...new Set(transactionRows.map((row) => row.paymentMethod))].toSorted(),
    },
    alerts,
    transactions: transactionRows,
  };
}

export type FinanceAnalyticsResponse = ReturnType<typeof buildFinanceAnalytics>;
