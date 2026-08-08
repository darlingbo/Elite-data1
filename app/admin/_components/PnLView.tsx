"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { FinanceAnalyticsResponse } from "@/lib/finance-analytics";
import styles from "./FinanceDashboard.module.css";

type Preset = "today" | "yesterday" | "7d" | "30d" | "month" | "lastMonth" | "custom";
type ReportTab = "daily" | "weekly" | "monthly" | "agents" | "customers";
type SortKey = "date" | "sellingPrice" | "actualCost" | "profit" | "agentCommission";
type ChartDatum = { label: string; value: number; secondary?: number };

const MONEY = new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", minimumFractionDigits: 2 });
const INTEGER = new Intl.NumberFormat("en-GH");
const DATE = new Intl.DateTimeFormat("en-GH", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const COLORS = ["#635bff", "#00d4ff", "#34d399", "#f59e0b", "#f472b6", "#a78bfa", "#fb7185", "#22d3ee", "#84cc16", "#f97316"];

function isoDate(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function presetDates(preset: Preset) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === "today") return { from: isoDate(today), to: isoDate(today) };
  if (preset === "yesterday") {
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    return { from: isoDate(yesterday), to: isoDate(yesterday) };
  }
  if (preset === "7d" || preset === "30d") {
    const from = new Date(today); from.setDate(from.getDate() - (preset === "7d" ? 6 : 29));
    return { from: isoDate(from), to: isoDate(today) };
  }
  if (preset === "month") return { from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: isoDate(today) };
  if (preset === "lastMonth") {
    return {
      from: isoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      to: isoDate(new Date(now.getFullYear(), now.getMonth(), 0)),
    };
  }
  return { from: "", to: "" };
}

function Icon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    orders: <><path d="M6 3h12v18H6z" /><path d="M9 7h6M9 11h6M9 15h4" /></>,
    revenue: <><circle cx="12" cy="12" r="9" /><path d="M15 8.5c-.7-.6-1.6-1-2.7-1-1.5 0-2.6.8-2.6 2 0 3 5.7 1.4 5.7 4.7 0 1.3-1.2 2.3-3 2.3-1.3 0-2.5-.5-3.3-1.3M12 5.5v13" /></>,
    profit: <><path d="M4 18 10 12l4 4 6-8" /><path d="M15 8h5v5" /></>,
    pending: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    completed: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>,
    failed: <><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6m0-6-6 6" /></>,
    wallet: <><path d="M4 6h15v13H4z" /><path d="M4 9h15m-4 4h4" /></>,
    agents: <><circle cx="9" cy="8" r="3" /><path d="M3 19c.5-4 2.5-6 6-6s5.5 2 6 6m1-10h5m-2.5-2.5v5" /></>,
    customers: <><circle cx="8" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M2.5 19c.5-4 2.5-6 5.5-6s5 2 5.5 6m1-5c3 0 5 1.5 5.5 5" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 10h18" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name] ?? paths.profit}</svg>;
}

function Trend({ value }: { value?: number }) {
  const number = Number(value ?? 0);
  const positive = number >= 0;
  return <span className={`${styles.trend} ${positive ? styles.up : styles.down}`}>
    {positive ? "↗" : "↘"} {Math.abs(number).toFixed(1)}%
  </span>;
}

function MetricCard({ label, value, icon, trend, tone = "violet", detail }: {
  label: string; value: string; icon: string; trend?: number; tone?: string; detail?: string;
}) {
  return <article className={`${styles.metricCard} ${styles[tone]}`}>
    <div className={styles.metricTop}>
      <span className={styles.metricIcon}><Icon name={icon} /></span>
      {trend !== undefined ? <Trend value={trend} /> : null}
    </div>
    <p className={styles.metricLabel}>{label}</p>
    <p className={styles.metricValue}>{value}</p>
    {detail ? <p className={styles.metricDetail}>{detail}</p> : null}
  </article>;
}

function LineChart({ data, color = "#635bff", secondaryColor, money = true, title, subtitle }: {
  data: ChartDatum[]; color?: string; secondaryColor?: string; money?: boolean; title: string; subtitle: string;
}) {
  const width = 640;
  const height = 220;
  const values = data.flatMap((point) => [point.value, point.secondary ?? 0]);
  const max = Math.max(...values, 1);
  const x = (index: number) => data.length <= 1 ? width / 2 : (index / (data.length - 1)) * width;
  const y = (value: number) => height - (value / max) * (height - 28) - 12;
  const line = (key: "value" | "secondary") => data.map((point, index) =>
    `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(Number(point[key] ?? 0)).toFixed(1)}`).join(" ");
  return <section className={styles.chartCard}>
    <header><div><h3>{title}</h3><p>{subtitle}</p></div><span className={styles.liveDot}>Live</span></header>
    <div className={styles.chartCanvas}>
      <svg role="img" aria-label={title} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id={`fill-${title.replace(/\W/g, "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity=".28" /><stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((position) => <line key={position} x1="0" x2={width} y1={height * position} y2={height * position} className={styles.gridLine} />)}
        <path d={`${line("value")} L${width},${height} L0,${height} Z`} fill={`url(#fill-${title.replace(/\W/g, "")})`} />
        <path d={line("value")} fill="none" stroke={color} strokeWidth="3" vectorEffect="non-scaling-stroke" />
        {secondaryColor ? <path d={line("secondary")} fill="none" stroke={secondaryColor} strokeWidth="2" strokeDasharray="7 5" vectorEffect="non-scaling-stroke" /> : null}
      </svg>
      <div className={styles.chartLabels}>
        {data.filter((_, index) => index % Math.max(1, Math.ceil(data.length / 6)) === 0).map((point) => <span key={point.label}>{point.label}</span>)}
      </div>
    </div>
    <div className={styles.chartLegend}><span><i style={{ background: color }} />{money ? MONEY.format(data.at(-1)?.value ?? 0) : INTEGER.format(data.at(-1)?.value ?? 0)}</span>
      {secondaryColor ? <span><i style={{ background: secondaryColor }} />Profit {MONEY.format(data.at(-1)?.secondary ?? 0)}</span> : null}</div>
  </section>;
}

function BarRanking({ title, subtitle, rows, valueLabel = "revenue" }: {
  title: string; subtitle: string; rows: Array<{ name: string; value: number; orders?: number; revenue?: number; commission?: number }>; valueLabel?: "revenue" | "orders" | "commission";
}) {
  const max = Math.max(...rows.map((row) => valueLabel === "orders" ? Number(row.orders ?? row.value) : Number(row[valueLabel] ?? row.value)), 1);
  return <section className={styles.rankingCard}>
    <header><div><h3>{title}</h3><p>{subtitle}</p></div></header>
    <div className={styles.rankingList}>{rows.slice(0, 6).map((row, index) => {
      const value = valueLabel === "orders" ? Number(row.orders ?? row.value) : Number(row[valueLabel] ?? row.value);
      return <div className={styles.rankRow} key={`${row.name}-${index}`}>
        <span className={styles.rankNumber}>{index + 1}</span>
        <div className={styles.rankBody}><div><strong>{row.name}</strong><span>{valueLabel === "orders" ? `${value} orders` : MONEY.format(value)}</span></div>
          <div className={styles.progress}><i style={{ width: `${Math.max(4, (value / max) * 100)}%`, background: COLORS[index % COLORS.length] }} /></div></div>
      </div>;
    })}</div>
  </section>;
}

function ReportMetric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return <div className={styles.reportMetric}><span>{label}</span><strong className={accent ? styles.accentValue : ""}>{value}</strong></div>;
}

function ReportList({ title, rows, money = true }: {
  title: string;
  rows: Array<{ name: string; value: number }>;
  money?: boolean;
}) {
  return <div className={styles.reportList}>
    <h3>{title}</h3>
    <ol>{rows.length ? rows.map((row) => <li key={row.name}>
      <span>{row.name}</span>
      <strong>{money ? MONEY.format(row.value) : INTEGER.format(row.value)}</strong>
    </li>) : <li><span>No completed sales</span><strong>—</strong></li>}</ol>
  </div>;
}

const EMPTY_ARRAY: never[] = [];

export default function PnLView() {
  const router = useRouter();
  const [data, setData] = useState<FinanceAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [preset, setPreset] = useState<Preset>("30d");
  const initialDates = presetDates("30d");
  const [from, setFrom] = useState(initialDates.from);
  const [to, setTo] = useState(initialDates.to);
  const [agent, setAgent] = useState("all");
  const [network, setNetwork] = useState("all");
  const [status, setStatus] = useState("all");
  const [paymentMethod, setPaymentMethod] = useState("all");
  const [reportTab, setReportTab] = useState<ReportTab>("daily");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [sort, setSort] = useState<SortKey>("date");
  const [ascending, setAscending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const query = new URLSearchParams({ from, to, agent, network, status, paymentMethod });
    try {
      const response = await fetch(`/api/admin/finance?${query}`, { cache: "no-store" });
      if (response.status === 401) { router.push("/admin/login"); return; }
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load finance analytics.");
      setData(body as FinanceAnalyticsResponse);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load finance analytics.");
    } finally {
      setLoading(false);
    }
  }, [agent, from, network, paymentMethod, router, status, to]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    const refresh = window.setInterval(() => void load(), 60_000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(refresh);
    };
  }, [load]);

  function selectPreset(value: Preset) {
    setPreset(value);
    if (value !== "custom") {
      const dates = presetDates(value);
      setFrom(dates.from);
      setTo(dates.to);
    }
  }

  const visibleTransactions = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    const rows = (data?.transactions ?? EMPTY_ARRAY).filter((row) =>
      !query || [row.reference, row.customer, row.phone, row.network, row.bundle, row.agent, row.paymentMethod, row.status]
        .some((value) => String(value).toLowerCase().includes(query)));
    return rows.toSorted((left, right) => {
      const leftValue = sort === "date" ? new Date(left.date).getTime() : Number(left[sort]);
      const rightValue = sort === "date" ? new Date(right.date).getTime() : Number(right[sort]);
      return (leftValue - rightValue) * (ascending ? 1 : -1);
    });
  }, [ascending, data?.transactions, deferredSearch, sort]);

  function exportTransactions(format: "csv" | "excel") {
    if (!visibleTransactions.length) return;
    const headers = ["Order ID", "Customer", "Phone", "Network", "Bundle", "Gross Sale", "Net Revenue", "Provider Cost", "Admin Profit", "Agent Commission", "Agent", "Payment Method", "Status", "Date"];
    const rows = visibleTransactions.map((row) => [
      row.reference, row.customer, row.phone, row.network, row.bundle, row.sellingPrice, row.netRevenue, row.actualCost,
      row.profit, row.agentCommission, row.agent, row.paymentMethod, row.status, row.date,
    ]);
    const separator = format === "csv" ? "," : "\t";
    const escaped = [headers, ...rows].map((row) => row.map((value) => {
      const text = String(value ?? "");
      return format === "csv" ? `"${text.replaceAll('"', '""')}"` : text.replaceAll("\t", " ");
    }).join(separator)).join("\n");
    const blob = new Blob([`\uFEFF${escaped}`], { type: format === "csv" ? "text/csv;charset=utf-8" : "application/vnd.ms-excel;charset=utf-8" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `elite-data-finance-${from}-${to}.${format === "csv" ? "csv" : "xls"}`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  if (!data && loading) return <div className={styles.loading}><span /><strong>Building your finance dashboard…</strong><p>Validating completed orders and calculating performance.</p></div>;
  if (!data) return <div className={styles.errorState}><strong>Finance dashboard unavailable</strong><p>{error}</p><button onClick={() => void load()}>Try again</button></div>;

  const summaryCards = [
    ["Your Admin Profit", MONEY.format(data.periods.selected.profit), "profit", undefined, "green", "Selected period · after refunds, provider cost and agent commission"],
    ["Net Revenue", MONEY.format(data.periods.selected.revenue), "revenue", undefined, "blue", "Selected completed orders after refunds"],
    ["Provider Cost", MONEY.format(data.periods.selected.cost), "wallet", undefined, "amber", "Selected completed-order delivery cost"],
    ["Direct-Sale Profit", MONEY.format(data.periods.selected.directProfit), "profit", undefined, "violet", "Your profit from orders without an agent"],
    ["Admin Profit via Agents", MONEY.format(data.periods.selected.agentSaleProfit), "profit", undefined, "cyan", "Your share from agent-linked orders"],
    ["Agent Commissions", MONEY.format(data.periods.selected.commission), "agents", undefined, "pink", "Secondary · agent earnings on selected orders"],
    ["Selected Completed", INTEGER.format(data.periods.selected.orders), "completed", undefined, "green", "Completed orders in the selected period"],
    ["Today's Admin Profit", MONEY.format(data.summary.todayProfit), "profit", data.summary.trends.profit, "green", "Today · after cost and commission"],
    ["Pending Orders", INTEGER.format(data.summary.pendingOrders), "pending", undefined, "amber", "Awaiting action or delivery"],
    ["Failed Orders", INTEGER.format(data.summary.failedOrders), "failed", undefined, "red", "Failed and rejected"],
    ["Total Customers", INTEGER.format(data.summary.totalCustomers), "customers", undefined, "blue", "Unique completed buyers"],
    ["Wallet Liability", MONEY.format(data.summary.walletBalance), "wallet", undefined, "cyan", "Money held for agent + developer wallets"],
  ] as const;

  const dailyChart = data.charts.daily.map((point) => ({ label: point.label, value: point.revenue, secondary: point.profit }));
  const weeklyChart = data.charts.weekly.map((point) => ({ label: point.label, value: point.revenue }));
  const monthlyChart = data.charts.monthly.map((point) => ({ label: point.label, value: point.revenue, secondary: point.profit }));
  const orderTrend = data.charts.daily.map((point) => ({ label: point.label, value: point.orders }));
  const customerGrowth = data.charts.customerGrowth.map((point) => ({ label: point.label, value: point.value }));

  return <div className={`${styles.finance} ${theme === "light" ? styles.light : ""}`}>
    <section className={styles.hero}>
      <div>
        <span className={styles.eyebrow}>Admin profit center</span>
        <h2>Your money comes first.</h2>
        <p>Admin profit is completed-order net revenue minus provider cost and agent commission. Agent figures stay separate and secondary. Updated {DATE.format(new Date(data.generatedAt))}.</p>
      </div>
      <div className={styles.heroActions}>
        <button className={styles.themeButton} onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")} aria-label="Toggle finance dashboard theme">
          {theme === "dark" ? "☀" : "◐"} <span>{theme === "dark" ? "Light" : "Dark"}</span>
        </button>
        <button className={styles.refreshButton} onClick={() => void load()} disabled={loading}>↻ <span>{loading ? "Refreshing" : "Refresh data"}</span></button>
      </div>
    </section>

    <section className={styles.filterPanel}>
      <div className={styles.presets}>
        {([["today", "Today"], ["yesterday", "Yesterday"], ["7d", "7 days"], ["30d", "30 days"], ["month", "This month"], ["lastMonth", "Last month"], ["custom", "Custom"]] as const)
          .map(([value, label]) => <button key={value} className={preset === value ? styles.activePreset : ""} onClick={() => selectPreset(value)}>{label}</button>)}
      </div>
      <div className={styles.filterGrid}>
        <label><span>From</span><input type="date" value={from} onChange={(event) => { setPreset("custom"); setFrom(event.target.value); }} /></label>
        <label><span>To</span><input type="date" value={to} onChange={(event) => { setPreset("custom"); setTo(event.target.value); }} /></label>
        <label><span>Agent</span><select value={agent} onChange={(event) => setAgent(event.target.value)}><option value="all">All agents</option>{data.options.agents.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
        <label><span>Network</span><select value={network} onChange={(event) => setNetwork(event.target.value)}><option value="all">All networks</option>{data.options.networks.map((option) => <option key={option ?? ""}>{option}</option>)}</select></label>
        <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{data.options.statuses.map((option) => <option key={option}>{option}</option>)}</select></label>
        <label><span>Payment</span><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="all">All methods</option>{data.options.paymentMethods.map((option) => <option key={option}>{option}</option>)}</select></label>
      </div>
    </section>

    {error ? <div className={styles.inlineError}>{error}</div> : null}
    {data.alerts.length ? <section className={styles.alertStrip}>{data.alerts.map((alert) => <article key={alert.title} className={styles[alert.level]}><span>{alert.level === "critical" ? "!" : "↘"}</span><div><strong>{alert.title}</strong><p>{alert.detail}</p></div></article>)}</section> : null}

    <section className={styles.metricGrid}>{summaryCards.map(([label, value, icon, trend, tone, detail]) =>
      <MetricCard key={label} label={label} value={value} icon={icon} trend={trend} tone={tone} detail={detail} />)}</section>

    <section className={styles.periodSection}>
      <div className={styles.sectionHeading}><div><span>Admin profit analytics</span><h2>Your earnings across every horizon</h2></div><p>Only completed orders contribute. Refunds, provider cost and agent commission are deducted.</p></div>
      <div className={styles.periodGrid}>
        {([
          ["Today", data.periods.today],
          ["This week", data.periods.week],
          ["This month", data.periods.month],
          ["This year", data.periods.year],
          ["Lifetime", data.periods.lifetime],
        ] as const).map(([label, period]) => <article key={label} className={styles.periodCard}>
          <span>{label}</span><strong>{MONEY.format(period.profit)}</strong><small>Admin profit</small>
          <div><p><span>Net revenue</span><b>{MONEY.format(period.revenue)}</b></p><p><span>Provider cost</span><b>{MONEY.format(period.cost)}</b></p><p><span>Agent commission</span><b>{MONEY.format(period.commission)}</b></p><p><span>Margin</span><b>{period.margin.toFixed(1)}%</b></p></div>
        </article>)}
      </div>
    </section>

    <section className={styles.chartsGrid}>
      <LineChart title="Daily revenue & profit" subtitle="30-day financial movement" data={dailyChart} secondaryColor="#34d399" />
      <LineChart title="Weekly revenue" subtitle="Trailing 12-week performance" data={weeklyChart} color="#00b8d9" />
      <LineChart title="Monthly revenue & profit" subtitle="Year-long business trajectory" data={monthlyChart} color="#8b5cf6" secondaryColor="#f472b6" />
      <LineChart title="Orders trend" subtitle="Completed orders by day" data={orderTrend} color="#f59e0b" money={false} />
      <LineChart title="Customers growth" subtitle="Unique completed buyers by month" data={customerGrowth} color="#22c55e" money={false} />
      <LineChart title="Profit trend" subtitle="Net profit after cost and commission" data={data.charts.daily.map((point) => ({ label: point.label, value: point.profit }))} color="#34d399" />
    </section>

    <section className={styles.rankingsGrid}>
      <BarRanking title="Top selling bundles" subtitle="Products customers choose most" rows={data.charts.topBundles} valueLabel="orders" />
      <BarRanking title="Top customers" subtitle="Completed customer spend" rows={data.reports.monthly.topCustomers} />
      <BarRanking title="Agent contribution" subtitle="Secondary view of agent-linked revenue" rows={data.charts.topAgents} />
    </section>

    <section className={styles.reports}>
      <div className={styles.sectionHeading}><div><span>Business reports</span><h2>From daily pulse to lifetime value</h2></div></div>
      <div className={styles.reportTabs}>{(["daily", "weekly", "monthly", "agents", "customers"] as const).map((tab) =>
        <button key={tab} onClick={() => setReportTab(tab)} className={reportTab === tab ? styles.activeReport : ""}>{tab}</button>)}</div>
      <div className={styles.reportBody}>
        {reportTab === "daily" ? <>
          <ReportMetric label="Revenue" value={MONEY.format(data.reports.daily.revenue)} />
          <ReportMetric label="Expenses" value={MONEY.format(data.reports.daily.expenses)} />
          <ReportMetric label="Admin profit" value={MONEY.format(data.reports.daily.profit)} accent />
          <ReportMetric label="Agent commission" value={MONEY.format(data.reports.daily.commission)} />
          <ReportMetric label="Average order value" value={MONEY.format(data.reports.daily.averageOrderValue)} />
          <ReportMetric label="Best selling bundle" value={data.reports.daily.bestSellingBundle} />
          <ReportMetric label="Most active agent" value={data.reports.daily.mostActiveAgent} />
          <ReportMetric label="Best customer" value={data.reports.daily.bestCustomer} />
          <ReportMetric label="Completion rate" value={`${data.reports.daily.completionRate.toFixed(1)}%`} />
          <ReportMetric label="Success rate" value={`${data.reports.daily.successRate.toFixed(1)}%`} />
        </> : null}
        {reportTab === "weekly" ? <>
          <ReportMetric label="Weekly revenue" value={MONEY.format(data.reports.weekly.revenue)} />
          <ReportMetric label="Weekly admin profit" value={MONEY.format(data.reports.weekly.profit)} accent />
          <ReportMetric label="Weekly growth" value={`${data.reports.weekly.growth.toFixed(1)}%`} />
          <ReportMetric label="Orders completed" value={INTEGER.format(data.reports.weekly.orders)} />
          <ReportMetric label="Orders failed" value={INTEGER.format(data.reports.weekly.failed)} />
          <ReportMetric label="Refunds" value={INTEGER.format(data.reports.weekly.refunds)} />
          <ReportMetric label="Top agent" value={data.reports.weekly.topAgent} />
          <ReportMetric label="Top customer" value={data.reports.weekly.topCustomer} />
        </> : null}
        {reportTab === "monthly" ? <>
          <ReportMetric label="Revenue" value={MONEY.format(data.reports.monthly.revenue)} />
          <ReportMetric label="Admin profit" value={MONEY.format(data.reports.monthly.profit)} accent />
          <ReportMetric label="Growth" value={`${data.reports.monthly.growth.toFixed(1)}%`} />
          <ReportMetric label="Agent commission" value={MONEY.format(data.reports.monthly.commission)} />
          <ReportMetric label="Best product" value={data.reports.monthly.bestSellingProducts[0]?.name ?? "No sales"} />
          <ReportMetric label="Top agent" value={data.reports.monthly.topAgents[0]?.name ?? "No agent sales"} />
          <ReportMetric label="Top customer" value={data.reports.monthly.topCustomers[0]?.name ?? "No customers"} />
        </> : null}
        {reportTab === "agents" ? <>
          <ReportMetric label="Total agents" value={INTEGER.format(data.agents.total)} />
          <ReportMetric label="Active agents" value={INTEGER.format(data.agents.active)} />
          <ReportMetric label="Inactive agents" value={INTEGER.format(data.agents.inactive)} />
          <ReportMetric label="Highest earning agent" value={data.agents.highestEarning?.name ?? "No agent sales"} />
          <ReportMetric label="Commission paid" value={MONEY.format(data.agents.commissionPaid)} accent />
          <ReportMetric label="Top agent orders" value={INTEGER.format(data.agents.rows[0]?.orders ?? 0)} />
          <ReportMetric label="Top agent revenue" value={MONEY.format(data.agents.rows[0]?.revenue ?? 0)} />
          <ReportMetric label="Profit generated" value={MONEY.format(data.agents.rows[0]?.profit ?? 0)} />
        </> : null}
        {reportTab === "customers" ? <>
          <ReportMetric label="New customers" value={INTEGER.format(data.customers.newCustomers)} />
          <ReportMetric label="Returning customers" value={INTEGER.format(data.customers.returningCustomers)} />
          <ReportMetric label="Orders per customer" value={data.customers.ordersPerCustomer.toFixed(2)} />
          <ReportMetric label="Highest spending customer" value={data.customers.highestSpending?.name ?? "No customers"} />
          <ReportMetric label="Highest customer spend" value={MONEY.format(data.customers.highestSpending?.spend ?? 0)} accent />
          <ReportMetric label="Customer lifetime value" value={MONEY.format(data.customers.lifetimeValue)} />
        </> : null}
      </div>
      {reportTab === "monthly" ? <div className={styles.reportRankings}>
        <ReportList title="Top 10 agents" rows={data.reports.monthly.topAgents.slice(0, 10)} />
        <ReportList title="Top customers" rows={data.reports.monthly.topCustomers.slice(0, 10)} />
        <ReportList title="Best selling products" rows={data.reports.monthly.bestSellingProducts.slice(0, 10)} />
      </div> : null}
      {reportTab === "agents" ? <div className={styles.reportRankings}>
        <ReportList title="Revenue per agent" rows={data.agents.rows.slice(0, 10).map((row) => ({ name: row.name, value: row.revenue }))} />
        <ReportList title="Profit per agent" rows={data.agents.rows.slice(0, 10).map((row) => ({ name: row.name, value: row.profit }))} />
        <ReportList title="Orders per agent" rows={data.agents.rows.slice(0, 10).map((row) => ({ name: row.name, value: row.orders }))} money={false} />
      </div> : null}
      {reportTab === "customers" ? <div className={styles.reportRankings}>
        <ReportList title="Top customers by spend" rows={data.reports.monthly.topCustomers.slice(0, 10)} />
      </div> : null}
    </section>

    <section className={styles.transactions}>
      <div className={styles.transactionHeader}><div><span>Admin transaction ledger</span><h2>Every order behind your profit</h2><p>Admin profit is net revenue after refunds minus provider cost and agent commission. Only completed orders count.</p></div>
        <div className={styles.exportButtons}><button onClick={() => exportTransactions("csv")}>Export CSV</button><button onClick={() => exportTransactions("excel")}>Export Excel</button></div></div>
      <div className={styles.tableTools}>
        <label className={styles.searchBox}><span>⌕</span><input type="search" placeholder="Search order, customer, phone, bundle…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <label>Sort by <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}><option value="date">Date</option><option value="sellingPrice">Selling price</option><option value="actualCost">Actual cost</option><option value="profit">Profit</option><option value="agentCommission">Commission</option></select></label>
        <button onClick={() => setAscending((current) => !current)}>{ascending ? "Oldest / lowest" : "Newest / highest"} ↕</button>
      </div>
      <div className={styles.tableWrap}><table><thead><tr><th>Order ID</th><th>Customer</th><th>Network / bundle</th><th>Gross sale</th><th>Net revenue</th><th>Provider cost</th><th>Admin profit</th><th>Agent commission</th><th>Payment</th><th>Status</th><th>Date</th></tr></thead>
        <tbody>{visibleTransactions.slice(0, 200).map((row) => <tr key={row.reference}><td><code>{row.reference}</code></td><td><strong>{row.customer}</strong><span>{row.phone}</span></td><td><strong>{row.network}</strong><span>{row.bundle}</span></td><td>{MONEY.format(row.sellingPrice)}</td><td>{MONEY.format(row.netRevenue)}</td><td>{MONEY.format(row.actualCost)}</td><td className={styles.profitCell}>{MONEY.format(row.profit)}</td><td>{MONEY.format(row.agentCommission)}<span>{row.agent}</span></td><td><span className={styles.method}>{row.paymentMethod.replaceAll("_", " ")}</span></td><td><span className={`${styles.status} ${styles[row.status.replaceAll("_", "")] ?? ""}`}>{row.status.replaceAll("_", " ")}</span></td><td>{DATE.format(new Date(row.date))}</td></tr>)}</tbody></table>
        {!visibleTransactions.length ? <div className={styles.emptyTable}>No transactions match your filters.</div> : null}</div>
      <footer className={styles.tableFooter}>Showing {Math.min(200, visibleTransactions.length)} of {visibleTransactions.length} filtered transactions</footer>
    </section>
  </div>;
}
