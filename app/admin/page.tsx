"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

const PricesView = dynamic(() => import("./_components/PricesView"), { loading: () => <Spinner /> });
const AgentPriceModal = dynamic(() => import("./_components/AgentPriceModal"));
const AgentPricesAdmin = dynamic(() => import("./_components/AgentPricesAdmin"), { loading: () => <Spinner /> });
const PnLView = dynamic(() => import("./_components/PnLView"), { loading: () => <Spinner /> });
const ApiKeysAdmin = dynamic(() => import("./_components/ApiKeysAdmin"), { loading: () => <Spinner /> });
const AnnouncementsAdmin = dynamic(() => import("./_components/AnnouncementsAdmin"), { loading: () => <Spinner /> });
const PromoBannerAdmin = dynamic(() => import("./_components/PromoBannerAdmin"), { loading: () => <Spinner /> });
const ManualOrdersAdmin = dynamic(() => import("./_components/ManualOrdersAdmin"), { loading: () => <Spinner /> });
const CommissionAdmin = dynamic(() => import("./_components/CommissionAdmin"), { loading: () => <Spinner /> });
const AgentWalletsAdmin = dynamic(() => import("./_components/AgentWalletsAdmin"), { loading: () => <Spinner /> });
const SMSAdmin = dynamic(() => import("./_components/SMSAdmin"), { loading: () => <Spinner /> });
const CustomersAdmin = dynamic(() => import("./_components/CustomersAdmin"), { loading: () => <Spinner /> });
const MashupBundlesAdmin = dynamic(() => import("./_components/MashupBundlesAdmin"), { loading: () => <Spinner /> });
const NetworkProvidersAdmin = dynamic(() => import("./_components/NetworkProvidersAdmin"), { loading: () => <Spinner /> });
const CouponsAdmin = dynamic(() => import("./_components/CouponsAdmin"), { loading: () => <Spinner /> });
const WithdrawalsAdmin = dynamic(() => import("./_components/WithdrawalsAdmin"), { loading: () => <Spinner /> });
const AnalyticsAdmin = dynamic(() => import("./_components/AnalyticsAdmin"), { loading: () => <Spinner /> });
const PaystackSplitAdmin = dynamic(() => import("./_components/PaystackSplitAdmin"), { loading: () => <Spinner /> });

type Tab =
  | "overview" | "all-orders" | "pending-orders" | "processing" | "completed" | "failed-orders"
  | "data-bundles" | "bundle-prices" | "all-agents" | "agent-applications" | "agent-wallets" | "leaderboard"
  | "transactions" | "commissions" | "manual" | "compensate" | "announcements" | "promo" | "apikeys" | "sms" | "settings"
  | "customers" | "mashup-bundles" | "network-providers" | "coupons" | "referrals" | "withdrawals" | "agent-ranks" | "analytics" | "developer-api" | "paystack-split" | "notifications";

type OrderStatus = "ALL" | "COMPLETED" | "PROCESSING" | "PENDING" | "FAILED";

interface Order {
  reference: string; status: string; amount: number; admin_commission: number;
  agent_commission: number; cost_price?: number; customer_name: string; phone: string; network: string;
  bundle_size: string; created_at: string; agent_id: string | null;
  agent_name?: string | null; agent_code?: string | null;
}
interface Agent {
  id: string; name: string; email: string; phone: string; whatsapp?: string; business_name: string;
  referral_code: string; status: string; agent_type?: string; commission_balance: number; wallet_balance?: number;
  total_sales: number; total_revenue: number; created_at: string;
}
interface StatsData {
  orders: { all: Order[]; total: number; completed: number; processing: number; pending: number; failed: number };
  revenue: { total: number; cost: number };
  profit: { admin: number; agentCommissions: number; gross: number };
  agents: { all: Agent[]; total: number; pending: number; approved: number; rejected: number };
}

const PAGE_SIZE = 50;
const BG = "#080f1e";
const CARD = "#0d1b2e";
const BORDER = "#1e3a5f";
const BORDER2 = "#1e3050";

// ─── Utilities ────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex items-center justify-center py-32">
      <div className="w-8 h-8 border-4 border-[#3b82f6] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function useCountUp(target: number, duration = 1000, active = true) {
  const [value, setValue] = useState(0);
  const raf = useRef<number>(0);
  useEffect(() => {
    if (!active) return;
    setValue(0);
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      setValue(p < 1 ? target * (1 - Math.pow(1 - p, 3)) : target);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration, active]);
  return value;
}

function get7DayComparison(orders: Order[]) {
  const now = Date.now();
  const D7 = 7 * 86400000;
  const curr = orders.filter(o => now - new Date(o.created_at).getTime() <= D7);
  const prev = orders.filter(o => {
    const age = now - new Date(o.created_at).getTime();
    return age > D7 && age <= 2 * D7;
  });
  function pct(a: number, b: number) {
    if (b === 0) return a > 0 ? 100 : 0;
    return Math.round(((a - b) / b) * 100 * 10) / 10;
  }
  const rev = (arr: Order[]) => arr.filter(o => o.status.toLowerCase() === "completed").reduce((s, o) => s + Number(o.amount), 0);
  return {
    orders:    pct(curr.length, prev.length),
    completed: pct(curr.filter(o => o.status.toLowerCase() === "completed").length, prev.filter(o => o.status.toLowerCase() === "completed").length),
    pending:   pct(curr.filter(o => o.status.toLowerCase() === "pending").length,   prev.filter(o => o.status.toLowerCase() === "pending").length),
    failed:    pct(curr.filter(o => o.status.toLowerCase() === "failed").length,    prev.filter(o => o.status.toLowerCase() === "failed").length),
    revenue:   pct(rev(curr), rev(prev)),
    agents:    0,
  };
}

function getWeeklyRevenue(orders: Order[]) {
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const now = new Date();
  const dow = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
  monday.setHours(0, 0, 0, 0);
  return labels.map((label, i) => {
    const start = new Date(monday); start.setDate(monday.getDate() + i);
    const end   = new Date(start);  end.setDate(start.getDate() + 1);
    const dayOrders = orders.filter(o => {
      const d = new Date(o.created_at);
      return d >= start && d < end && o.status.toLowerCase() === "completed";
    });
    return { label, revenue: dayOrders.reduce((s, o) => s + Number(o.amount), 0), count: dayOrders.length };
  });
}

function getTopBundles(orders: Order[]) {
  const completed = orders.filter(o => o.status.toLowerCase() === "completed");
  const map: Record<string, { count: number; revenue: number; network: string }> = {};
  for (const o of completed) {
    const net = (o.network ?? "").toLowerCase();
    const raw = (o.bundle_size ?? "").replace(/^(mtn|telecel|at ishare|airteltigo|airtel)\s+/i, "").trim();
    const key = `${net}|${raw}`;
    if (!map[key]) map[key] = { count: 0, revenue: 0, network: net };
    map[key].count++;
    map[key].revenue += Number(o.amount) || 0;
  }
  const colors = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#f87171"];
  const sorted = Object.entries(map).sort((a, b) => b[1].count - a[1].count);
  const top4 = sorted.slice(0, 4);
  const otherCount = sorted.slice(4).reduce((s, [, v]) => s + v.count, 0);
  const total = completed.length || 1;
  const result = top4.map(([key, v], i) => {
    const [net, size] = key.split("|");
    return { label: `${size} – ${net.toUpperCase()}`, count: v.count, revenue: v.revenue, pct: (v.count / total) * 100, color: colors[i] };
  });
  if (otherCount > 0) result.push({ label: "Others", count: otherCount, revenue: 0, pct: (otherCount / total) * 100, color: colors[4] });
  return { bundles: result, total: completed.length };
}

function getTodayStats(orders: Order[]) {
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const today = orders.filter(o => new Date(o.created_at) >= todayStart);
  const delivered = today.filter(o => o.status.toLowerCase() === "completed");
  return {
    orders: today.length,
    delivered: delivered.length,
    revenue: delivered.reduce((s, o) => s + Number(o.amount), 0),
    profit: delivered.reduce((s, o) => s + Number(o.admin_commission ?? 0), 0),
    viaAgents: today.filter(o => o.agent_id).length,
  };
}

function getDataSold(orders: Order[]): string {
  const completed = orders.filter(o => o.status.toLowerCase() === "completed");
  let totalGB = 0;
  for (const o of completed) {
    const raw = (o.bundle_size ?? "").replace(/^(mtn|telecel|at ishare|airteltigo|airtel)\s+/i, "").trim();
    const m = raw.match(/^([\d.]+)\s*(gb|tb|mb)?/i);
    if (m) {
      const val = parseFloat(m[1]);
      const unit = (m[2] ?? "GB").toUpperCase();
      totalGB += unit === "TB" ? val * 1024 : unit === "MB" ? val / 1024 : val;
    }
  }
  return totalGB >= 1024 ? `${(totalGB / 1024).toFixed(2)} TB` : `${totalGB.toFixed(0)} GB`;
}

function getRevenueBreakdown(orders: Order[]) {
  const completed = orders.filter(o => o.status.toLowerCase() === "completed");
  const total = completed.reduce((s, o) => s + Number(o.amount), 0) || 1;
  const map: Record<string, number> = {};
  for (const o of completed) {
    const net = (o.network ?? "other").toLowerCase();
    map[net] = (map[net] ?? 0) + Number(o.amount);
  }
  const DOT: Record<string, string> = { mtn: "#f59e0b", telecel: "#ef4444", airteltigo: "#3b82f6" };
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .map(([net, rev]) => ({
      label: net === "mtn" ? "MTN" : net === "telecel" ? "Telecel" : net.includes("airtel") ? "AirtelTigo" : net.toUpperCase(),
      revenue: rev,
      pct: (rev / total) * 100,
      dot: DOT[net] ?? "#6b7280",
    }));
}

function getProfitByPeriod(orders: Order[]) {
  const now = new Date();
  function startOf(period: "day" | "week" | "month" | "year") {
    const d = new Date(now);
    if (period === "day")   { d.setHours(0, 0, 0, 0); }
    if (period === "week")  { const day = d.getDay(); d.setDate(d.getDate() - day); d.setHours(0, 0, 0, 0); }
    if (period === "month") { d.setDate(1); d.setHours(0, 0, 0, 0); }
    if (period === "year")  { d.setMonth(0, 1); d.setHours(0, 0, 0, 0); }
    return d;
  }
  function calc(period: "day" | "week" | "month" | "year") {
    const start = startOf(period);
    const slice = orders.filter(o => o.status.toLowerCase() === "completed" && new Date(o.created_at) >= start);
    return {
      profit:  slice.reduce((s, o) => s + Number(o.admin_commission ?? 0), 0),
      revenue: slice.reduce((s, o) => s + Number(o.amount), 0),
      orders:  slice.length,
    };
  }
  return { day: calc("day"), week: calc("week"), month: calc("month"), year: calc("year") };
}

function getNetBadge(network: string) {
  const net = (network ?? "").toLowerCase();
  if (net === "mtn") return { bg: "#78350f", color: "#fbbf24", label: "MTN" };
  if (net === "telecel") return { bg: "#7f1d1d", color: "#fca5a5", label: "Telecel" };
  if (net.includes("airtel")) return { bg: "#4c1d95", color: "#c4b5fd", label: "AirtelTigo" };
  return { bg: "#1e3050", color: "#94a3b8", label: (network ?? "—").toUpperCase() };
}

// ─── SVG Charts ───────────────────────────────────────────────────────────────

function LineChart({ data }: { data: { label: string; revenue: number }[] }) {
  const W = 500, H = 140;
  const pad = { t: 12, r: 8, b: 28, l: 8 };
  const iW = W - pad.l - pad.r;
  const iH = H - pad.t - pad.b;
  const max = Math.max(...data.map(d => d.revenue), 1);
  const pts = data.map((d, i) => ({
    x: pad.l + (data.length > 1 ? (i / (data.length - 1)) * iW : iW / 2),
    y: pad.t + iH - (d.revenue / max) * iH,
  }));
  const linePath = pts.reduce((acc, p, i) => {
    if (i === 0) return `M ${p.x} ${p.y}`;
    const prev = pts[i - 1];
    const cx = (prev.x + p.x) / 2;
    return `${acc} C ${cx} ${prev.y} ${cx} ${p.y} ${p.x} ${p.y}`;
  }, "");
  const areaPath = `${linePath} L ${pts[pts.length - 1].x} ${H - pad.b} L ${pts[0].x} ${H - pad.b} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 180 }}>
      <defs>
        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map((t, i) => (
        <line key={i} x1={pad.l} y1={pad.t + iH * (1 - t)} x2={W - pad.r} y2={pad.t + iH * (1 - t)} stroke="#1f2937" strokeWidth={0.8} />
      ))}
      <path d={areaPath} fill="url(#chartGrad)" />
      <path d={linePath} fill="none" stroke="#8b5cf6" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={4} fill="#8b5cf6" stroke={BG} strokeWidth={2} />
      ))}
      {data.map((d, i) => (
        <text key={i} x={pts[i].x} y={H - pad.b + 16} textAnchor="middle" fontSize={9} fill="#6b7280">{d.label}</text>
      ))}
    </svg>
  );
}

function DonutChart({ bundles, total }: { bundles: { pct: number; color: string }[]; total: number }) {
  const R = 52, r = 34, cx = 70, cy = 70;
  let angle = -90;
  function arc(start: number, pct: number) {
    const sweep = (pct / 100) * 360;
    const end = start + sweep;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const x1 = cx + R * Math.cos(toRad(start));
    const y1 = cy + R * Math.sin(toRad(start));
    const x2 = cx + R * Math.cos(toRad(end));
    const y2 = cy + R * Math.sin(toRad(end));
    const ix1 = cx + r * Math.cos(toRad(end));
    const iy1 = cy + r * Math.sin(toRad(end));
    const ix2 = cx + r * Math.cos(toRad(start));
    const iy2 = cy + r * Math.sin(toRad(start));
    const lg = sweep > 180 ? 1 : 0;
    return `M${x1} ${y1} A${R} ${R} 0 ${lg} 1 ${x2} ${y2} L${ix1} ${iy1} A${r} ${r} 0 ${lg} 0 ${ix2} ${iy2}Z`;
  }
  return (
    <svg viewBox="0 0 140 140" width={140} height={140}>
      {bundles.map((b, i) => {
        const start = angle;
        angle += (b.pct / 100) * 360;
        return <path key={i} d={arc(start, b.pct)} fill={b.color} />;
      })}
      <text x={cx} y={cy - 5} textAnchor="middle" fontSize={16} fontWeight="800" fill="white">{total.toLocaleString()}</text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize={8} fill="#6b7280">Total Sales</text>
    </svg>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const Ic = {
  home:    () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
  orders:  () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>,
  clock:   () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14" /></svg>,
  check:   () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  x:       () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>,
  bundle:  () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>,
  tag:     () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" /></svg>,
  agents:  () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  wallet:  () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>,
  trophy:  () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 21h8m-4-4v4M5 3H3v6c0 3.31 2.69 6 6 6h6c3.31 0 6-2.69 6-6V3h-2M5 3h14M5 3l1 6M19 3l-1 6" /></svg>,
  trend:   () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>,
  cash:    () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" /></svg>,
  edit:    () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>,
  mega:    () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" /></svg>,
  key:     () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>,
  gear:    () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  logout:  () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>,
  sms:     () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>,
  sync:    () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>,
  add:     () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>,
  bell:    () => <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>,
  search:  () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>,
  menu:    () => <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>,
  website: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>,
  up:      () => <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>,
  down:    () => <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>,
};

// ─── Change Password Modal ────────────────────────────────────────────────────
function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState(""); const [next, setNext] = useState(""); const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false); const [msg, setMsg] = useState(""); const [ok, setOk] = useState(false);
  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault(); setMsg("");
    if (next.length < 8) { setMsg("New password must be at least 8 characters."); return; }
    if (next !== confirm) { setMsg("Passwords do not match."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/admin/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: current, newPassword: next }) });
      const d = await res.json();
      if (d.success) { setOk(true); setMsg("Password changed successfully!"); } else setMsg(d.error || "Failed.");
    } catch { setMsg("Network error."); } finally { setLoading(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="rounded-2xl shadow-2xl w-full max-w-sm p-6 border" style={{ background: CARD, borderColor: BORDER }}>
        <h3 className="font-black text-white text-lg mb-1">Change Password</h3>
        <p className="text-xs text-slate-500 mb-5">You&apos;ll use the new password next time you log in.</p>
        {ok ? <div className="text-center py-4"><p className="text-green-400 font-bold text-sm mb-4">✅ Password updated!</p><button onClick={onClose} className="text-sm text-slate-400 hover:text-white">Close</button></div> : (
          <form onSubmit={handleSubmit} className="space-y-3">
            {[["Current Password", current, setCurrent], ["New Password (min 8 chars)", next, setNext], ["Confirm New Password", confirm, setConfirm]].map(([label, val, set]) => (
              <div key={label as string}>
                <label className="block text-xs font-semibold text-slate-400 mb-1">{label as string}</label>
                <input type="password" value={val as string} onChange={e => (set as (v: string) => void)(e.target.value)} required className="w-full rounded-lg px-3 py-2.5 text-sm text-white border focus:outline-none focus:border-blue-500" style={{ background: BG, borderColor: BORDER }} />
              </div>
            ))}
            {msg && <p className="text-xs font-semibold text-red-400">{msg}</p>}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose} className="flex-1 border text-slate-400 font-semibold py-2.5 rounded-xl text-sm hover:text-white" style={{ borderColor: BORDER }}>Cancel</button>
              <button type="submit" disabled={loading} className="flex-1 text-white font-bold py-2.5 rounded-xl text-sm disabled:opacity-60" style={{ background: "linear-gradient(90deg,#3b82f6,#8b5cf6)" }}>{loading ? "Saving…" : "Change Password"}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({ tab, setTab, pendingOrders, pendingAgents, onLogout, onChangePassword, mobileOpen, onMobileClose }: {
  tab: Tab; setTab: (t: Tab) => void; pendingOrders: number; pendingAgents: number;
  onLogout: () => void; onChangePassword: () => void; mobileOpen: boolean; onMobileClose: () => void;
}) {
  const sections = [
    {
      label: "MANAGE",
      items: [
        { id: "customers" as Tab,         icon: <Ic.agents />,  label: "Customers" },
        { id: "data-bundles" as Tab,      icon: <Ic.bundle />,  label: "Data Bundles" },
        { id: "mashup-bundles" as Tab,    icon: <Ic.bundle />,  label: "Mashup Bundles" },
        { id: "all-orders" as Tab,        icon: <Ic.orders />,  label: "Orders" },
        { id: "transactions" as Tab,      icon: <Ic.trend />,   label: "Transactions" },
        { id: "network-providers" as Tab, icon: <Ic.sync />,    label: "Network Providers" },
        { id: "coupons" as Tab,           icon: <Ic.tag />,     label: "Coupons" },
        { id: "commissions" as Tab,       icon: <Ic.cash />,    label: "Commissions" },
        { id: "referrals" as Tab,         icon: <Ic.trophy />,  label: "Referrals" },
        { id: "compensate" as Tab,        icon: <Ic.wallet />,  label: "Compensate" },
      ],
    },
    {
      label: "AGENTS",
      items: [
        { id: "all-agents" as Tab,         icon: <Ic.agents />,  label: "All Agents" },
        { id: "agent-applications" as Tab, icon: <Ic.add />,     label: "Applications", badge: pendingAgents || undefined },
        { id: "agent-wallets" as Tab,      icon: <Ic.wallet />,  label: "Agent Wallets" },
        { id: "withdrawals" as Tab,        icon: <Ic.cash />,    label: "Withdrawals" },
        { id: "agent-ranks" as Tab,        icon: <Ic.trophy />,  label: "Agent Ranks" },
        { id: "bundle-prices" as Tab,      icon: <Ic.tag />,     label: "Agent Prices" },
      ],
    },
    {
      label: "ORDERS",
      items: [
        { id: "pending-orders" as Tab, icon: <Ic.clock />, label: "Pending", badge: pendingOrders || undefined },
        { id: "processing" as Tab,     icon: <Ic.sync />,  label: "Processing" },
        { id: "manual" as Tab,         icon: <Ic.edit />,  label: "Manual Orders" },
      ],
    },
    {
      label: "CONTENT",
      items: [
        { id: "notifications" as Tab, icon: <Ic.mega />,  label: "Notifications" },
        { id: "sms" as Tab,           icon: <Ic.sms />,   label: "SMS Broadcast" },
        { id: "promo" as Tab,         icon: <Ic.mega />,  label: "Promo Banner" },
        { id: "analytics" as Tab,     icon: <Ic.trend />, label: "Analytics" },
      ],
    },
    {
      label: "SETTINGS",
      items: [
        { id: "developer-api" as Tab,  icon: <Ic.key />,  label: "Developer API" },
        { id: "paystack-split" as Tab, icon: <Ic.cash />, label: "Paystack Split" },
        { id: "settings" as Tab,       icon: <Ic.gear />, label: "Settings" },
      ],
    },
  ];

  function NavItem({ item }: { item: typeof sections[0]["items"][0] }) {
    const active = tab === item.id;
    return (
      <button onClick={() => { setTab(item.id); onMobileClose(); }}
        className="w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all text-left"
        style={active
          ? { background: "rgba(59,130,246,0.18)", color: "#60a5fa", borderLeft: "3px solid #3b82f6", paddingLeft: 9 }
          : { color: "#64748b", borderLeft: "3px solid transparent", paddingLeft: 9 }}
        onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; (e.currentTarget as HTMLElement).style.color = "#94a3b8"; } }}
        onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = ""; (e.currentTarget as HTMLElement).style.color = "#64748b"; } }}>
        <span className="flex items-center gap-2.5">{item.icon}{item.label}</span>
        {item.badge ? <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-orange-400 text-gray-900 leading-none">{item.badge}</span> : null}
      </button>
    );
  }

  return (
    <aside className={`fixed inset-y-0 left-0 z-50 w-60 flex flex-col border-r transition-transform duration-300 ${mobileOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
      style={{ background: "#080f1e", borderColor: "#1e3a5f" }}>
      <button onClick={onMobileClose} className="md:hidden absolute top-4 right-4 z-10 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
      </button>

      {/* Brand header */}
      <div className="px-4 pt-5 pb-4 border-b" style={{ borderColor: "#1e3a5f" }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center font-black text-white text-base shadow-lg" style={{ background: "linear-gradient(135deg,#3b82f6,#7c3aed)" }}>E</div>
          <div>
            <p className="font-black text-white text-sm leading-none">Elite Data</p>
            <p className="text-[10px] uppercase tracking-widest mt-0.5" style={{ color: "#3b82f6" }}>Admin Panel</p>
          </div>
        </div>
      </div>

      {/* Dashboard link */}
      <div className="px-3 pt-3 pb-1">
        <button onClick={() => { setTab("overview"); onMobileClose(); }}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all"
          style={tab === "overview"
            ? { background: "rgba(59,130,246,0.18)", color: "#60a5fa", borderLeft: "3px solid #3b82f6", paddingLeft: 9 }
            : { color: "#64748b", borderLeft: "3px solid transparent", paddingLeft: 9 }}
          onMouseEnter={e => { if (tab !== "overview") { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; } }}
          onMouseLeave={e => { if (tab !== "overview") { (e.currentTarget as HTMLElement).style.background = ""; } }}>
          <Ic.home /> Dashboard
        </button>
      </div>

      {/* Nav sections */}
      <nav className="flex-1 px-3 py-2 overflow-y-auto space-y-4">
        {sections.map(sec => (
          <div key={sec.label}>
            <div className="flex items-center gap-2 px-3 mb-1.5">
              <div className="h-px flex-1" style={{ background: "#1e3a5f" }} />
              <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">{sec.label}</p>
              <div className="h-px flex-1" style={{ background: "#1e3a5f" }} />
            </div>
            <div className="space-y-0.5">
              {sec.items.map(item => <NavItem key={item.id} item={item} />)}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom: admin profile + actions */}
      <div className="border-t" style={{ borderColor: "#1e3a5f" }}>
        {/* Admin profile pill */}
        <div className="mx-3 my-3 px-3 py-2.5 rounded-xl flex items-center gap-2.5" style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)" }}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-white text-xs shrink-0" style={{ background: "linear-gradient(135deg,#3b82f6,#7c3aed)" }}>A</div>
          <div className="min-w-0">
            <p className="text-xs font-black text-white leading-none truncate">Administrator</p>
            <p className="text-[10px] mt-0.5" style={{ color: "#3b82f6" }}>Super Admin</p>
          </div>
          <span className="ml-auto text-[8px] font-black px-1.5 py-0.5 rounded-full text-green-900 bg-green-400 shrink-0">LIVE</span>
        </div>
        <div className="px-3 pb-3 space-y-0.5">
          <a href="/" target="_blank" rel="noreferrer"
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-semibold transition-all text-slate-500 hover:text-slate-300 hover:bg-white/5">
            <Ic.website /> View Website
          </a>
          <button onClick={onChangePassword}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-semibold text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-all">
            <Ic.key /> Change Password
          </button>
          <button onClick={onLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-semibold transition-all hover:bg-red-900/20"
            style={{ color: "#f87171" }}>
            <Ic.logout /> Sign Out
          </button>
        </div>
      </div>
    </aside>
  );
}

// ─── Dashboard Overview ────────────────────────────────────────────────────────
function Dashboard({ stats, animated, onNavigate }: { stats: StatsData; animated: boolean; onNavigate: (t: Tab) => void }) {
  const cmp = useMemo(() => get7DayComparison(stats.orders.all), [stats.orders.all]);
  const weekly = useMemo(() => getWeeklyRevenue(stats.orders.all), [stats.orders.all]);
  const { bundles, total: bundleTotal } = useMemo(() => getTopBundles(stats.orders.all), [stats.orders.all]);
  const todayStats = useMemo(() => getTodayStats(stats.orders.all), [stats.orders.all]);
  const revBreakdown = useMemo(() => getRevenueBreakdown(stats.orders.all), [stats.orders.all]);
  const profitPeriods = useMemo(() => getProfitByPeriod(stats.orders.all), [stats.orders.all]);
  const [earningPeriod, setEarningPeriod] = useState<"day" | "week" | "month" | "year">("day");
  const dataSold = useMemo(() => getDataSold(stats.orders.all), [stats.orders.all]);
  const totalCustomers = useMemo(() => new Set(stats.orders.all.map(o => o.phone).filter(Boolean)).size, [stats.orders.all]);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [apiBalance, setApiBalance] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/inventor-balance").then(r => r.json()).then(d => setApiBalance(d.balance !== null ? `GH₵${Number(d.balance).toFixed(2)}` : null)).catch(() => setApiBalance(null));
  }, []);

  const totalRev = useCountUp(stats.revenue.total, 1200, animated);
  const totalProfit = useCountUp(stats.profit.gross, 1200, animated);
  const leaderboard = useMemo(() =>
    [...stats.agents.all].filter(a => a.status === "approved").sort((a, b) => Number(b.total_revenue) - Number(a.total_revenue)).slice(0, 5),
    [stats.agents.all]
  );

  async function handleSync() {
    setSyncing(true); setSyncMsg("");
    try {
      const d = await fetch("/api/admin/sync-orders", { method: "POST" }).then(r => r.json());
      setSyncMsg(d.updated > 0 ? `✓ ${d.updated} orders updated` : "✓ All up to date");
    } catch { setSyncMsg("Sync failed"); }
    finally { setSyncing(false); setTimeout(() => setSyncMsg(""), 3000); }
  }

  const weeklyTotal = weekly.reduce((s, d) => s + d.revenue, 0);
  const weeklyTxns  = weekly.reduce((s, d) => s + d.count, 0);
  const weeklyAvg   = weeklyTxns > 0 ? weeklyTotal / weeklyTxns : 0;
  const avatarColors = ["#f59e0b", "#94a3b8", "#10b981", "#3b82f6", "#8b5cf6"];

  function PctBadge({ val }: { val: number }) {
    return (
      <span className="flex items-center gap-0.5 text-xs font-bold" style={{ color: val >= 0 ? "#10b981" : "#f87171" }}>
        {val >= 0 ? <Ic.up /> : <Ic.down />}
        {Math.abs(val).toFixed(1)}%
      </span>
    );
  }

  const statusStyle: Record<string, { bg: string; color: string }> = {
    COMPLETED:  { bg: "rgba(16,185,129,0.15)",  color: "#34d399" },
    PROCESSING: { bg: "rgba(59,130,246,0.15)",  color: "#60a5fa" },
    PENDING:    { bg: "rgba(245,158,11,0.15)",  color: "#fbbf24" },
    FAILED:     { bg: "rgba(248,113,113,0.15)", color: "#f87171" },
  };

  const recentOrders = useMemo(() =>
    [...stats.orders.all].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5),
    [stats.orders.all]
  );

  return (
    <div className="space-y-4">

      {/* ── Today so far ── */}
      <div className="rounded-2xl border p-4" style={{ background: CARD, borderColor: BORDER }}>
        <p className="font-bold text-white mb-3 text-sm">📅 Today so far</p>
        <div className="grid grid-cols-3 gap-2 mb-2">
          {[
            { label: "Orders",    val: todayStats.orders.toString(),              color: "text-white" },
            { label: "Delivered", val: todayStats.delivered.toString(),           color: "text-green-400" },
            { label: "Revenue",   val: `GH₵${todayStats.revenue.toFixed(2)}`,    color: "text-white", sm: true },
          ].map(s => (
            <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: BG }}>
              <p className={`font-black ${s.color} ${s.sm ? "text-sm" : "text-lg"} leading-tight`}>{s.val}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl p-3 text-center" style={{ background: BG }}>
            <p className="font-black text-sm leading-tight" style={{ background: "linear-gradient(90deg,#3b82f6,#8b5cf6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>GH₵{todayStats.profit.toFixed(2)}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Profit</p>
          </div>
          <div className="rounded-xl p-3 text-center" style={{ background: BG }}>
            <p className="text-lg font-black text-orange-400 leading-tight">{todayStats.viaAgents}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Via Agents</p>
          </div>
        </div>
      </div>

      {/* ── 4 stat cards 2x2 ── */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Total Customers", value: totalCustomers.toLocaleString(),     pct: cmp.agents,   icon: "👥", grad: "linear-gradient(135deg,#1e3a5f,#1e40af)" },
          { label: "Total Orders",    value: stats.orders.total.toLocaleString(), pct: cmp.orders,   icon: "🛒", grad: "linear-gradient(135deg,#2e1065,#4c1d95)" },
          { label: "Total Revenue",   value: `GH₵${totalRev.toFixed(2)}`,        pct: cmp.revenue,  icon: "💰", grad: "linear-gradient(135deg,#064e3b,#065f46)" },
          { label: "Data Sold",       value: dataSold,                            pct: cmp.completed,icon: "📡", grad: "linear-gradient(135deg,#1a2940,#0f2438)" },
        ].map((c, i) => (
          <div key={c.label} className="rounded-2xl p-4 border relative overflow-hidden" style={{ background: CARD, borderColor: BORDER, animation: `slideUp .3s ease both`, animationDelay: `${i * 60}ms` }}>
            <div className="flex items-start justify-between mb-3">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl" style={{ background: c.grad }}>{c.icon}</div>
              <PctBadge val={c.pct} />
            </div>
            <p className="text-xl font-black text-white leading-tight">{c.value}</p>
            <p className="text-xs text-slate-500 mt-1">{c.label}</p>
            <p className="text-[10px] text-blue-500 mt-1.5 font-semibold">vs last 7 days →</p>
          </div>
        ))}
      </div>

      {/* ── Total Profit (full width) ── */}
      <div className="rounded-2xl p-4 border relative overflow-hidden" style={{ background: CARD, borderColor: BORDER }}>
        <div className="flex items-start justify-between mb-3">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl" style={{ background: "linear-gradient(135deg,#450a0a,#7f1d1d)" }}>📈</div>
          <PctBadge val={cmp.revenue} />
        </div>
        <p className="text-2xl font-black text-white">GH₵{totalProfit.toFixed(2)}</p>
        <p className="text-xs text-slate-500 mt-1">Total Profit (all time)</p>
        <p className="text-[10px] text-blue-500 mt-1.5 font-semibold">vs last 7 days →</p>
      </div>

      {/* ── My Earnings by Period ── */}
      <div className="rounded-2xl border overflow-hidden" style={{ background: CARD, borderColor: BORDER }}>
        <div className="px-4 pt-4 pb-3 border-b" style={{ borderColor: BORDER }}>
          <p className="font-bold text-white text-sm mb-3">💰 My Earnings</p>
          {/* Pill tabs */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: 6, background: "#0a0f1a", border: "1px solid #1e3050", borderRadius: 999, boxShadow: "0 1px 1px rgba(0,0,0,0.3), 0 8px 24px -12px rgba(0,0,0,0.5)" }}>
            {(["day", "week", "month", "year"] as const).map(p => (
              <button key={p} onClick={() => setEarningPeriod(p)} style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                height: 32, padding: "0 16px", borderRadius: 999, fontSize: 13, fontWeight: 500,
                border: "none", cursor: "pointer",
                transition: "background 220ms cubic-bezier(.22,1,.36,1), color 220ms cubic-bezier(.22,1,.36,1), box-shadow 220ms cubic-bezier(.22,1,.36,1)",
                background: earningPeriod === p ? "white" : "transparent",
                color: earningPeriod === p ? "#0e1116" : "#64748b",
                boxShadow: earningPeriod === p ? "0 1px 1px rgba(0,0,0,0.1), 0 4px 12px -6px rgba(0,0,0,0.4)" : "none",
              }}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Earnings display */}
        {(() => {
          const p = profitPeriods[earningPeriod];
          const labels: Record<string, string> = { day: "Today", week: "This Week", month: "This Month", year: "This Year" };
          const colors: Record<string, string> = { day: "#f59e0b", week: "#3b82f6", month: "#8b5cf6", year: "#22c55e" };
          const grads: Record<string, string> = {
            day:   "linear-gradient(135deg,#78350f,#d97706)",
            week:  "linear-gradient(135deg,#1e3a8a,#3b82f6)",
            month: "linear-gradient(135deg,#4c1d95,#8b5cf6)",
            year:  "linear-gradient(135deg,#14532d,#22c55e)",
          };
          return (
            <div className="p-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0" style={{ background: grads[earningPeriod] }}>
                  {earningPeriod === "day" ? "☀️" : earningPeriod === "week" ? "📅" : earningPeriod === "month" ? "🗓️" : "🏆"}
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider">{labels[earningPeriod]} · Admin Profit</p>
                  <p className="text-3xl font-black" style={{ color: colors[earningPeriod] }}>GH₵{p.profit.toFixed(2)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl p-3" style={{ background: "#0a0f1a", border: "1px solid #1e3050" }}>
                  <p className="text-[10px] text-slate-500 mb-1">Revenue</p>
                  <p className="font-black text-white text-base">GH₵{p.revenue.toFixed(2)}</p>
                </div>
                <div className="rounded-xl p-3" style={{ background: "#0a0f1a", border: "1px solid #1e3050" }}>
                  <p className="text-[10px] text-slate-500 mb-1">Orders</p>
                  <p className="font-black text-white text-base">{p.orders}</p>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── Revenue Overview chart ── */}
      <div className="rounded-2xl border" style={{ background: CARD, borderColor: BORDER }}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: BORDER }}>
          <p className="font-bold text-white">Revenue Overview</p>
          <span className="text-xs text-slate-400 border px-2.5 py-1 rounded-lg" style={{ borderColor: BORDER }}>This Week ▾</span>
        </div>
        <div className="px-3 pt-2">
          <LineChart data={weekly} />
        </div>
        <div className="grid grid-cols-3 gap-px border-t" style={{ borderColor: BORDER }}>
          {[
            { label: "Total Revenue",        value: `GH₵${weeklyTotal.toFixed(2)}` },
            { label: "Total Transactions",   value: weeklyTxns.toLocaleString() },
            { label: "Average Order Value",  value: `GH₵${weeklyAvg.toFixed(2)}` },
          ].map(s => (
            <div key={s.label} className="px-3 py-3">
              <p className="text-[10px] text-slate-500 mb-0.5">{s.label}</p>
              <p className="font-black text-white text-sm">{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Recent Orders ── */}
      <div className="rounded-2xl border overflow-hidden" style={{ background: CARD, borderColor: BORDER }}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: BORDER }}>
          <p className="font-bold text-white">Recent Orders</p>
          <button onClick={() => onNavigate("all-orders")} className="text-xs text-blue-400 font-semibold">View All Orders</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: BG, borderBottom: `1px solid ${BORDER}` }}>
                {["ORDER ID", "CUSTOMER", "PLAN", "AMOUNT", "STATUS"].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left font-semibold text-slate-500 text-[10px] uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((o, i) => {
                const nb = getNetBadge(o.network);
                const st = statusStyle[(o.status ?? "").toUpperCase()] ?? { bg: "transparent", color: "#94a3b8" };
                const cleanSize = (o.bundle_size ?? "").replace(/^(mtn|telecel|at ishare|airteltigo|airtel)\s+/i, "").trim();
                const shortRef = `#${(o.reference ?? "").replace(/[^A-Z0-9]/gi, "").slice(-6).toUpperCase()}`;
                return (
                  <tr key={i} className="border-b" style={{ borderColor: BORDER }}>
                    <td className="px-3 py-2.5 font-mono font-bold" style={{ color: "#60a5fa" }}>{shortRef}</td>
                    <td className="px-3 py-2.5 text-white font-medium max-w-[70px] truncate">{(o.customer_name || o.phone || "—").slice(0, 10)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded mr-1" style={{ background: nb.bg, color: nb.color }}>{nb.label}</span>
                      <span className="text-slate-400">{cleanSize}</span>
                    </td>
                    <td className="px-3 py-2.5 font-black text-white whitespace-nowrap">GH₵{Number(o.amount).toFixed(2)}</td>
                    <td className="px-3 py-2.5">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: st.bg, color: st.color }}>
                        {(o.status ?? "").toLowerCase()}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Top Data Bundles (table) ── */}
      <div className="rounded-2xl border overflow-hidden" style={{ background: CARD, borderColor: BORDER }}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: BORDER }}>
          <p className="font-bold text-white">Top Data Bundles</p>
          <button onClick={() => onNavigate("data-bundles")} className="text-xs text-blue-400 font-semibold">View All</button>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b" style={{ background: BG, borderColor: BORDER }}>
              {["BUNDLE", "NETWORK", "SOLD", "%"].map(h => (
                <th key={h} className="px-4 py-2.5 text-left font-bold text-slate-500 text-[10px] uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bundles.map((b, i) => {
              const [size, net] = b.label.split(" – ");
              const nb = getNetBadge(net ?? "");
              return (
                <tr key={i} className="border-b" style={{ borderColor: BORDER }}>
                  <td className="px-4 py-3 font-bold text-white">{size}</td>
                  <td className="px-4 py-3">
                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded" style={{ background: nb.bg, color: nb.color }}>{net === "OTHERS" ? "Others" : nb.label}</span>
                  </td>
                  <td className="px-4 py-3 font-bold text-white">{b.count}</td>
                  <td className="px-4 py-3 text-slate-400">{b.pct.toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="px-4 py-3 border-t" style={{ borderColor: BORDER }}>
          <p className="text-xs text-slate-500">Total completed: <span className="font-bold text-white">{bundleTotal}</span></p>
        </div>
      </div>

      {/* ── Revenue Breakdown ── */}
      <div className="rounded-2xl border p-4" style={{ background: CARD, borderColor: BORDER }}>
        <div className="flex items-center justify-between mb-4">
          <p className="font-bold text-white">Revenue Breakdown</p>
          <button onClick={() => onNavigate("transactions")} className="text-xs text-blue-400 font-semibold">View Report</button>
        </div>
        <div className="space-y-4">
          {revBreakdown.slice(0, 5).map((r, i) => (
            <div key={i}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: r.dot }} />
                  <span className="text-sm font-semibold text-white">{r.label}</span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-black text-white">GH₵{r.revenue.toFixed(2)}</span>
                  <span className="text-xs text-slate-500 ml-2">{r.pct.toFixed(1)}%</span>
                </div>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#1e3050" }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(r.pct, 100)}%`, background: r.dot }} />
              </div>
            </div>
          ))}
          {revBreakdown.length === 0 && <p className="text-sm text-slate-600 text-center py-4">No revenue data yet</p>}
        </div>
      </div>

      {/* ── Agent Leaderboard ── */}
      <div className="rounded-2xl border overflow-hidden" style={{ background: CARD, borderColor: BORDER }}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: BORDER }}>
          <p className="font-bold text-white">Agent Leaderboard</p>
          <button onClick={() => onNavigate("leaderboard")} className="text-xs text-blue-400 font-semibold">View All</button>
        </div>
        {leaderboard.length === 0
          ? <p className="text-center text-slate-600 py-8 text-sm">No agents yet</p>
          : leaderboard.map((a, i) => (
            <div key={a.id} className="flex items-center gap-3 px-4 py-3 border-b last:border-0" style={{ borderColor: BORDER }}>
              <span className="text-sm font-black w-5 text-center" style={{ color: i === 0 ? "#f59e0b" : i === 2 ? "#cd7f32" : "#64748b" }}>{i + 1}</span>
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black text-white shrink-0" style={{ background: avatarColors[i % avatarColors.length] }}>
                {(a.name ?? "?").charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{a.name}</p>
                <p className="text-xs text-slate-500">{a.total_sales} sales</p>
              </div>
              <p className="text-sm font-black text-white">GH₵{Number(a.total_revenue).toFixed(0)}</p>
            </div>
          ))}
      </div>

      {/* ── Quick Actions 2×3 ── */}
      <div className="rounded-2xl border p-4" style={{ background: CARD, borderColor: BORDER }}>
        <p className="font-bold text-white mb-3">Quick Actions</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Add Bundle",    emoji: "📦", action: () => onNavigate("data-bundles"),    bg: "#0d1f3c", color: "#60a5fa" },
            { label: "Sync Orders",   emoji: "🔄", action: handleSync,                          bg: "#1a0d3c", color: "#c084fc" },
            { label: "Add Agent",     emoji: "👤", action: () => onNavigate("agent-applications"), bg: "#0d2e1a", color: "#4ade80" },
            { label: "Notification",  emoji: "📢", action: () => onNavigate("notifications"),   bg: "#2a1a00", color: "#fb923c" },
            { label: "View Reports",  emoji: "📊", action: () => onNavigate("analytics"),       bg: "#2a0d0d", color: "#f87171" },
            { label: "API Settings",  emoji: "🔌", action: () => onNavigate("apikeys"),         bg: "#111827", color: "#6b7280" },
          ].map(qa => (
            <button key={qa.label} onClick={qa.action}
              className="flex flex-col items-center gap-2.5 py-5 px-3 rounded-2xl text-center transition-all hover:opacity-90"
              style={{ background: qa.bg, border: `1px solid ${qa.color}22` }}>
              <span className="text-2xl">{qa.emoji}</span>
              <span className="text-xs font-bold" style={{ color: qa.color }}>{qa.label}</span>
            </button>
          ))}
        </div>
        {syncMsg && <p className="mt-3 text-xs font-semibold text-green-400 text-center">{syncMsg}</p>}
        {syncing && <p className="mt-3 text-xs text-slate-500 text-center">Syncing…</p>}
      </div>

      {/* ── System Status 2×2 ── */}
      <div className="rounded-2xl border p-4" style={{ background: CARD, borderColor: BORDER }}>
        <div className="flex items-center justify-between mb-3">
          <p className="font-bold text-white">System Status</p>
          <button onClick={() => onNavigate("network-providers")} className="text-xs text-blue-400 font-semibold">Manage Providers →</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: "📡", label: "Inventor API",  value: apiBalance ?? "Checking…", ok: apiBalance !== null },
            { icon: "✈️", label: "Telegram Bot",  value: "Live ✓",                  ok: true },
            { icon: "🗄️", label: "Database",      value: "Live ✓",                  ok: true },
            { icon: "⏰", label: "Cron Jobs",      value: "Live ✓",                  ok: true },
          ].map(s => (
            <div key={s.label} className="rounded-xl p-3" style={{ background: BG, border: `1px solid ${BORDER}` }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base">{s.icon}</span>
                <span className="text-xs text-slate-400">{s.label}</span>
              </div>
              <p className="text-sm font-black" style={{ color: s.ok ? "#4ade80" : "#94a3b8" }}>{s.value}</p>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

// ─── Orders View ──────────────────────────────────────────────────────────────
function OrdersView({ orders, onRefresh, defaultFilter = "ALL" }: { orders: Order[]; onRefresh: () => void; defaultFilter?: OrderStatus }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatus>(defaultFilter);
  const [agentFilter, setAgentFilter] = useState("");
  const [page, setPage] = useState(1);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [recalculating, setRecalculating] = useState(false);
  const [recalcMsg, setRecalcMsg] = useState("");
  const [retrying, setRetrying] = useState<string | null>(null);
  const [retryMsg, setRetryMsg] = useState<{ ref: string; ok: boolean; text: string } | null>(null);
  const [completing, setCompleting] = useState<string | null>(null);
  const [deletingOne, setDeletingOne] = useState<string | null>(null);
  const [deletingFailed, setDeletingFailed] = useState(false);
  const [deleteFailedMsg, setDeleteFailedMsg] = useState("");
  // AI chat
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMessages, setAiMessages] = useState<{ role: "user" | "ai"; text: string }[]>([]);
  const aiEndRef = useRef<HTMLDivElement>(null);
  // Order logs
  const [logsRef, setLogsRef] = useState<string | null>(null);
  const [logs, setLogs] = useState<{ id: string; action: string; note: string; details: Record<string, unknown>; created_at: string }[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  useEffect(() => { setStatusFilter(defaultFilter); }, [defaultFilter]);

  async function handleRetry(reference: string) {
    setRetrying(reference); setRetryMsg(null);
    try {
      const res = await fetch("/api/admin/orders/retry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference }) });
      const d = await res.json();
      if (d.success) { setRetryMsg({ ref: reference, ok: true, text: `✓ ${d.status === "completed" ? "Delivered!" : "Processing…"}` }); onRefresh(); }
      else setRetryMsg({ ref: reference, ok: false, text: "Retry failed" });
    } catch { setRetryMsg({ ref: reference, ok: false, text: "Network error" }); }
    finally { setRetrying(null); setTimeout(() => setRetryMsg(null), 6000); }
  }

  async function handleDeleteOne(reference: string) {
    setDeletingOne(reference);
    try {
      const res = await fetch("/api/admin/orders/patch", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference }) });
      const d = await res.json();
      if (d.success) onRefresh();
      else setRetryMsg({ ref: reference, ok: false, text: d.error ?? "Delete failed" });
    } catch { setRetryMsg({ ref: reference, ok: false, text: "Network error" }); }
    finally { setDeletingOne(null); }
  }

  async function handleForceComplete(reference: string) {
    setCompleting(reference);
    try {
      const res = await fetch("/api/admin/orders/force-complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference }) });
      const d = await res.json();
      if (d.success) { setRetryMsg({ ref: reference, ok: true, text: "✓ Marked complete" }); onRefresh(); }
      else setRetryMsg({ ref: reference, ok: false, text: d.error ?? "Failed" });
    } catch { setRetryMsg({ ref: reference, ok: false, text: "Network error" }); }
    finally { setCompleting(null); setTimeout(() => setRetryMsg(null), 4000); }
  }

  async function handleSync() {
    setSyncing(true); setSyncMsg("");
    try {
      const res = await fetch("/api/admin/sync-orders", { method: "POST" });
      const d = await res.json();
      setSyncMsg(d.updated > 0 ? `✓ ${d.updated} updated` : `✓ All up to date`);
      if (d.updated > 0) onRefresh();
    } catch { setSyncMsg("Sync failed"); }
    finally { setSyncing(false); setTimeout(() => setSyncMsg(""), 4000); }
  }

  async function handleDeleteFailed() {
    if (!window.confirm(`Delete ALL failed orders from the database? This cannot be undone.`)) return;
    setDeletingFailed(true); setDeleteFailedMsg("");
    try {
      const res = await fetch("/api/admin/orders/patch", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "failed" }) });
      const d = await res.json();
      if (d.success) { setDeleteFailedMsg(`✓ Deleted ${d.deleted ?? "all"} failed orders`); onRefresh(); }
      else setDeleteFailedMsg(d.error ?? "Delete failed");
    } catch { setDeleteFailedMsg("Network error"); }
    finally { setDeletingFailed(false); setTimeout(() => setDeleteFailedMsg(""), 5000); }
  }

  async function handleRecalculate() {
    setRecalculating(true); setRecalcMsg("");
    try {
      const res = await fetch("/api/admin/recalculate-commissions", { method: "POST" });
      const d = await res.json();
      setRecalcMsg(d.updated > 0 ? `✓ ${d.updated} agents credited` : "✓ All commissions up to date");
      onRefresh();
    } catch { setRecalcMsg("Failed"); }
    finally { setRecalculating(false); setTimeout(() => setRecalcMsg(""), 5000); }
  }

  async function handleAiSend() {
    if (!aiInput.trim() || aiLoading) return;
    const msg = aiInput.trim();
    setAiInput("");
    setAiMessages(m => [...m, { role: "user", text: msg }]);
    setAiLoading(true);
    try {
      const res = await fetch("/api/admin/ai-orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: msg }) });
      const d = await res.json();
      setAiMessages(m => [...m, { role: "ai", text: d.reply ?? "No response." }]);
      if (d.action && d.action !== "lookup" && d.action !== "unknown") onRefresh();
    } catch {
      setAiMessages(m => [...m, { role: "ai", text: "Network error. Please try again." }]);
    } finally {
      setAiLoading(false);
      setTimeout(() => aiEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  async function openLogs(reference: string) {
    setLogsRef(reference);
    setLogsLoading(true);
    setLogs([]);
    try {
      const res = await fetch(`/api/admin/order-logs?reference=${encodeURIComponent(reference)}`);
      const d = await res.json();
      setLogs(d.logs ?? []);
    } catch { setLogs([]); }
    finally { setLogsLoading(false); }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const aq = agentFilter.toLowerCase().trim();
    return orders.slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).filter(o => {
      if (statusFilter !== "ALL" && o.status.toUpperCase() !== statusFilter) return false;
      if (aq && !(o.agent_name ?? "").toLowerCase().includes(aq) && !(o.agent_code ?? "").toLowerCase().includes(aq)) return false;
      if (!q) return true;
      return (o.customer_name ?? "").toLowerCase().includes(q) || (o.phone ?? "").includes(q) || (o.reference ?? "").toLowerCase().includes(q) || (o.network ?? "").toLowerCase().includes(q) || (o.agent_name ?? "").toLowerCase().includes(q);
    });
  }, [orders, search, statusFilter, agentFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageOrders = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [search, statusFilter, agentFilter]);

  const counts: Record<OrderStatus, number> = {
    ALL: orders.length,
    COMPLETED: orders.filter(o => o.status.toUpperCase() === "COMPLETED").length,
    PROCESSING: orders.filter(o => o.status.toUpperCase() === "PROCESSING").length,
    PENDING: orders.filter(o => o.status.toUpperCase() === "PENDING").length,
    FAILED: orders.filter(o => o.status.toUpperCase() === "FAILED").length,
  };

  const tabDefs: { key: OrderStatus; color: string }[] = [
    { key: "ALL", color: "#3b82f6" }, { key: "COMPLETED", color: "#10b981" }, { key: "PROCESSING", color: "#3b82f6" },
    { key: "PENDING", color: "#f59e0b" }, { key: "FAILED", color: "#f87171" },
  ];

  const statusStyle: Record<string, { bg: string; color: string }> = {
    COMPLETED: { bg: "rgba(16,185,129,0.1)", color: "#10b981" }, PROCESSING: { bg: "rgba(59,130,246,0.1)", color: "#3b82f6" },
    PENDING:   { bg: "rgba(245,158,11,0.1)", color: "#f59e0b"}, FAILED: { bg: "rgba(248,113,113,0.1)", color: "#f87171" },
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-white">All Orders</h1>
          <p className="text-sm text-slate-500">{orders.length.toLocaleString()} total · {filtered.length.toLocaleString()} shown</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"><Ic.search /></span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
              className="pl-9 pr-4 py-2 text-sm rounded-xl border focus:outline-none focus:border-blue-500 w-44 text-white placeholder-slate-600" style={{ background: CARD, borderColor: BORDER }} />
          </div>
          <input value={agentFilter} onChange={e => setAgentFilter(e.target.value)} placeholder="Filter by agent…"
            className="px-3 py-2 text-sm rounded-xl border focus:outline-none w-36 text-white placeholder-slate-600"
            style={{ background: agentFilter ? "rgba(139,92,246,0.12)" : CARD, borderColor: agentFilter ? "rgba(139,92,246,0.5)" : BORDER }} />
          <button onClick={onRefresh} className="text-sm font-medium text-slate-400 hover:text-white border px-3 py-2 rounded-xl transition-colors" style={{ background: CARD, borderColor: BORDER }}>↻ Refresh</button>
          <button onClick={handleSync} disabled={syncing} className="text-sm font-medium disabled:opacity-60 border px-3 py-2 rounded-xl transition-colors" style={{ background: "rgba(59,130,246,0.1)", borderColor: "#3b82f660", color: "#60a5fa" }}>{syncing ? "Syncing…" : "⚡ Sync"}</button>
          <button onClick={handleRecalculate} disabled={recalculating} className="text-sm font-medium disabled:opacity-60 border px-3 py-2 rounded-xl" style={{ background: "rgba(34,197,94,0.1)", borderColor: "#22c55e60", color: "#4ade80" }}>{recalculating ? "Fixing…" : "💰 Fix Commissions"}</button>
          <button onClick={handleDeleteFailed} disabled={deletingFailed} className="text-sm font-medium disabled:opacity-60 border px-3 py-2 rounded-xl" style={{ background: "rgba(239,68,68,0.1)", borderColor: "#ef444460", color: "#f87171" }}>{deletingFailed ? "Deleting…" : "🗑️ Delete Failed"}</button>
          <button onClick={() => setAiOpen(v => !v)} className="text-sm font-bold border px-3 py-2 rounded-xl transition-all" style={{ background: aiOpen ? "rgba(139,92,246,0.2)" : "rgba(139,92,246,0.1)", borderColor: "rgba(139,92,246,0.5)", color: "#a78bfa" }}>🤖 Ask AI</button>
          {syncMsg && <span className="text-xs font-semibold text-green-400">{syncMsg}</span>}
          {recalcMsg && <span className="text-xs font-semibold text-green-400">{recalcMsg}</span>}
          {deleteFailedMsg && <span className="text-xs font-semibold" style={{ color: deleteFailedMsg.startsWith("✓") ? "#4ade80" : "#f87171" }}>{deleteFailedMsg}</span>}
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto">
        {tabDefs.map(({ key, color }) => {
          const active = statusFilter === key;
          return (
            <button key={key} onClick={() => setStatusFilter(key)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap border transition-all"
              style={active ? { background: `${color}20`, color, borderColor: `${color}50` } : { background: CARD, color: "#64748b", borderColor: BORDER }}>
              {key === "ALL" ? "All" : key.charAt(0) + key.slice(1).toLowerCase()}
              <span className="text-[11px] px-1.5 py-0.5 rounded-full font-black" style={{ background: active ? `${color}30` : BORDER2, color: active ? color : "#475569" }}>{counts[key]}</span>
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border overflow-hidden" style={{ background: CARD, borderColor: BORDER }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-slate-500 uppercase tracking-wider" style={{ background: BG, borderColor: BORDER }}>
                {["#", "Customer", "Network", "Phone", "Amount", "Profit", "Source", "Status", "Date", ""].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageOrders.map((o, idx) => {
                const nb = getNetBadge(o.network);
                const st = statusStyle[o.status.toUpperCase()] ?? { bg: "transparent", color: "#94a3b8" };
                const cleanSize = (o.bundle_size ?? "").replace(/^(mtn|telecel|at ishare|airteltigo|airtel)\s+/i, "").trim();
                return (
                  <tr key={o.reference ?? idx} className="border-b hover:bg-white/[0.02] transition-colors last:border-0" style={{ borderColor: BORDER }}>
                    <td className="px-4 py-3.5 text-slate-600 text-xs font-mono">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-white whitespace-nowrap">{o.customer_name || o.phone || "—"}</p>
                      <a href={`/track?ref=${encodeURIComponent(o.reference ?? "")}`} target="_blank" rel="noreferrer" className="text-[11px] text-blue-400 hover:text-blue-300 font-mono mt-0.5 underline underline-offset-2">{o.reference ? o.reference.slice(0, 14) + "…" : "—"}</a>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black px-2 py-0.5 rounded" style={{ background: nb.bg, color: nb.color }}>{nb.label}</span>
                        <span className="text-slate-400 text-xs">{cleanSize}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs text-slate-400">{o.phone}</td>
                    <td className="px-4 py-3.5 font-black text-white">GH₵{Number(o.amount).toFixed(2)}</td>
                    <td className="px-4 py-3.5 font-black" style={{ color: "#4ade80" }}>GH₵{Number(o.admin_commission).toFixed(2)}</td>
                    <td className="px-4 py-3.5">
                      {o.agent_name ? (
                        <button onClick={() => setAgentFilter(o.agent_name!)} className="text-xs font-semibold px-2 py-0.5 rounded-full truncate max-w-[100px]" style={{ background: "rgba(139,92,246,0.15)", color: "#a78bfa", border: "1px solid rgba(139,92,246,0.3)" }} title={o.agent_name}>{o.agent_name}</button>
                      ) : (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: BORDER2, color: "#64748b" }}>Direct</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: st.bg, color: st.color }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.color }} />
                        {(o.status ?? "").charAt(0) + (o.status ?? "").slice(1).toLowerCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 text-xs whitespace-nowrap">{new Date(o.created_at).toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" })}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5">
                        {["pending", "processing", "failed"].includes((o.status ?? "").toLowerCase()) && o.reference && (
                          retryMsg?.ref === o.reference ? (
                            <span className={`text-xs font-bold ${retryMsg.ok ? "text-green-400" : "text-red-400"}`}>{retryMsg.text}</span>
                          ) : (
                            <>
                              <button onClick={() => handleRetry(o.reference)} disabled={retrying === o.reference || completing === o.reference || deletingOne === o.reference}
                                className="text-xs font-bold px-2.5 py-1.5 rounded-lg disabled:opacity-50" style={{ background: "rgba(251,146,60,0.15)", color: "#fb923c", border: "1px solid rgba(251,146,60,0.3)" }}>
                                {retrying === o.reference ? "…" : "🔄"}
                              </button>
                              <button onClick={() => handleForceComplete(o.reference)} disabled={completing === o.reference || retrying === o.reference || deletingOne === o.reference}
                                title="Force complete" className="text-xs font-bold px-2.5 py-1.5 rounded-lg disabled:opacity-50" style={{ background: "rgba(16,185,129,0.12)", color: "#34d399", border: "1px solid rgba(16,185,129,0.3)" }}>
                                {completing === o.reference ? "…" : "✓"}
                              </button>
                              <button
                                onClick={() => { if (window.confirm("Delete this failed order? This cannot be undone.")) handleDeleteOne(o.reference); }}
                                disabled={deletingOne === o.reference || retrying === o.reference || completing === o.reference}
                                title="Delete order"
                                className="text-xs font-bold px-2.5 py-1.5 rounded-lg disabled:opacity-50"
                                style={{ background: "rgba(248,113,113,0.12)", color: "#f87171", border: "1px solid rgba(248,113,113,0.3)" }}>
                                {deletingOne === o.reference ? "…" : "🗑"}
                              </button>
                            </>
                          )
                        )}
                        <button onClick={() => openLogs(o.reference)} title="View logs"
                          className="text-xs font-bold px-2.5 py-1.5 rounded-lg" style={{ background: "rgba(99,102,241,0.12)", color: "#818cf8", border: "1px solid rgba(99,102,241,0.3)" }}>
                          📋
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {pageOrders.length === 0 && <div className="py-20 text-center"><p className="text-4xl mb-3">📭</p><p className="font-semibold text-slate-500">No orders match your filter</p></div>}
        </div>
        {/* AI Chat Panel */}
        {aiOpen && (
          <div className="border-t" style={{ borderColor: BORDER, background: "#0a0f1e" }}>
            <div className="px-4 py-2 flex items-center gap-2 border-b" style={{ borderColor: BORDER }}>
              <span className="text-xs font-black text-purple-400">🤖 AI Order Assistant</span>
              <span className="text-xs text-slate-600">Type a command — e.g. "retry order TRX-1234" or "mark REF-5678 as completed"</span>
            </div>
            <div className="px-4 py-3 space-y-2 max-h-52 overflow-y-auto">
              {aiMessages.length === 0 && <p className="text-xs text-slate-600 italic">No messages yet. Type a command below.</p>}
              {aiMessages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] px-3 py-2 rounded-xl text-xs font-medium whitespace-pre-wrap ${m.role === "user" ? "text-white" : "text-slate-200"}`}
                    style={{ background: m.role === "user" ? "linear-gradient(90deg,#3b82f6,#8b5cf6)" : "#162032" }}>
                    {m.text}
                  </div>
                </div>
              ))}
              {aiLoading && <div className="flex justify-start"><div className="px-3 py-2 rounded-xl text-xs text-slate-500 animate-pulse" style={{ background: "#162032" }}>AI is thinking…</div></div>}
              <div ref={aiEndRef} />
            </div>
            <div className="px-4 py-3 border-t flex gap-2" style={{ borderColor: BORDER }}>
              <input value={aiInput} onChange={e => setAiInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleAiSend()}
                placeholder="e.g. 'retry order TRX-1234' or 'mark order REF-9876 as completed'…"
                className="flex-1 px-3 py-2 text-sm rounded-xl border focus:outline-none focus:border-purple-500 text-white placeholder-slate-600"
                style={{ background: CARD, borderColor: BORDER }} />
              <button onClick={handleAiSend} disabled={aiLoading || !aiInput.trim()}
                className="px-4 py-2 text-sm font-bold rounded-xl disabled:opacity-40 text-white"
                style={{ background: "linear-gradient(90deg,#7c3aed,#8b5cf6)" }}>
                {aiLoading ? "…" : "Send"}
              </button>
            </div>
          </div>
        )}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t flex items-center justify-between" style={{ background: BG, borderColor: BORDER }}>
            <p className="text-xs text-slate-500">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length.toLocaleString()}</p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 text-xs font-semibold rounded-lg border text-slate-400 hover:text-white disabled:opacity-40" style={{ background: CARD, borderColor: BORDER }}>← Prev</button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                const pg = totalPages <= 7 ? i + 1 : page <= 4 ? i + 1 : page >= totalPages - 3 ? totalPages - 6 + i : page - 3 + i;
                return <button key={pg} onClick={() => setPage(pg)} className="w-8 h-8 text-xs font-semibold rounded-lg transition-colors" style={pg === page ? { background: "linear-gradient(90deg,#3b82f6,#8b5cf6)", color: "#fff" } : { background: CARD, color: "#64748b", border: `1px solid ${BORDER}` }}>{pg}</button>;
              })}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1.5 text-xs font-semibold rounded-lg border text-slate-400 hover:text-white disabled:opacity-40" style={{ background: CARD, borderColor: BORDER }}>Next →</button>
            </div>
          </div>
        )}
      </div>
      {/* Order Logs Modal */}
      {logsRef && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={() => setLogsRef(null)}>
          <div className="rounded-2xl shadow-2xl w-full max-w-lg border max-h-[80vh] flex flex-col" style={{ background: "#0e1928", borderColor: BORDER2 }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: BORDER }}>
              <div>
                <p className="font-black text-white">Order Logs</p>
                <p className="text-xs text-slate-500 font-mono mt-0.5">{logsRef}</p>
              </div>
              <button onClick={() => setLogsRef(null)} className="text-slate-500 hover:text-white">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-2">
              {logsLoading && <p className="text-sm text-slate-500 text-center py-8">Loading…</p>}
              {!logsLoading && logs.length === 0 && <p className="text-sm text-slate-600 text-center py-8 italic">No logs yet for this order.</p>}
              {logs.map(log => (
                <div key={log.id} className="rounded-xl p-3 border" style={{ background: "#162032", borderColor: BORDER }}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-black px-2 py-0.5 rounded" style={{ background: "rgba(139,92,246,0.15)", color: "#a78bfa" }}>{log.action}</span>
                    <span className="text-[11px] text-slate-600">{new Date(log.created_at).toLocaleString("en-GH")}</span>
                  </div>
                  {log.note && <p className="text-xs text-slate-300">{log.note}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Agents View ──────────────────────────────────────────────────────────────
function AgentsView({ stats, onRefresh, defaultTab = "pending" }: { stats: StatsData; onRefresh: () => void; defaultTab?: "pending" | "approved" }) {
  const [agentTab, setAgentTab] = useState<"pending" | "approved">(defaultTab);
  const [agentAction, setAgentAction] = useState<{ id: string; name: string; action: "approve" | "reject" } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [pricesAgent, setPricesAgent] = useState<{ id: string; name: string } | null>(null);
  const [switchModal, setSwitchModal] = useState<{ id: string; name: string; currentType: string } | null>(null);
  const [switching, setSwitching] = useState(false);
  const [switchMsg, setSwitchMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => { setAgentTab(defaultTab); }, [defaultTab]);

  async function handleSwitchMode() {
    if (!switchModal) return;
    setSwitching(true);
    const newType = switchModal.currentType === "custom_price" ? "commission" : "custom_price";
    try {
      const res = await fetch("/api/admin/agents/switch-mode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId: switchModal.id, agentType: newType }) });
      const d = await res.json();
      if (d.success) { setSwitchMsg({ text: `✓ ${switchModal.name} switched to ${newType === "custom_price" ? "Price Mode" : "Commission Mode"}`, ok: true }); onRefresh(); }
      else setSwitchMsg({ text: d.error ?? "Failed", ok: false });
    } catch { setSwitchMsg({ text: "Network error", ok: false }); }
    finally { setSwitching(false); setSwitchModal(null); setTimeout(() => setSwitchMsg(null), 5000); }
  }

  async function handleAction() {
    if (!agentAction) return;
    setActionLoading(true);
    await fetch(`/api/agents/${agentAction.id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: agentAction.action }) });
    setAgentAction(null); setActionLoading(false); onRefresh();
  }

  const shown = stats.agents.all.filter(a => a.status === agentTab);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-black text-white">Agents</h1>
        <p className="text-sm text-slate-500">{stats.agents.approved} active · {stats.agents.pending} awaiting approval</p>
      </div>
      <div className="flex gap-1">
        {(["pending", "approved"] as const).map(s => {
          const active = agentTab === s;
          const color = s === "approved" ? "#10b981" : "#f59e0b";
          const count = stats.agents.all.filter(a => a.status === s).length;
          return <button key={s} onClick={() => setAgentTab(s)} className="px-4 py-2 rounded-xl text-sm font-semibold capitalize border transition-all"
            style={active ? { background: `${color}20`, color, borderColor: `${color}50` } : { background: CARD, color: "#64748b", borderColor: BORDER }}>
            {s === "pending" ? "Pending Approval" : "Approved"} ({count})
          </button>;
        })}
      </div>
      <div className="rounded-2xl border overflow-hidden" style={{ background: CARD, borderColor: BORDER }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-slate-500 uppercase tracking-wider" style={{ background: BG, borderColor: BORDER }}>
                <th className="px-4 py-3 text-left font-semibold">Name</th>
                <th className="px-4 py-3 text-left font-semibold">Email</th>
                <th className="px-4 py-3 text-left font-semibold">Phone</th>
                <th className="px-4 py-3 text-left font-semibold">WhatsApp</th>
                <th className="px-4 py-3 text-left font-semibold">Business</th>
                {agentTab === "approved" && <>
                  <th className="px-4 py-3 text-left font-semibold">Type</th>
                  <th className="px-4 py-3 text-left font-semibold">Sales</th>
                  <th className="px-4 py-3 text-left font-semibold">Balance</th>
                  <th className="px-4 py-3 text-left font-semibold">Ref Code</th>
                </>}
                {agentTab === "pending" && <th className="px-4 py-3 text-left font-semibold">Applied</th>}
                <th className="px-4 py-3 text-left font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(a => (
                <tr key={a.id} className="border-b last:border-0 hover:bg-white/[0.02] transition-colors" style={{ borderColor: BORDER }}>
                  <td className="px-4 py-3.5 font-semibold text-white">{a.name}</td>
                  <td className="px-4 py-3.5 text-slate-400 text-xs">{a.email}</td>
                  <td className="px-4 py-3.5 font-mono text-xs text-slate-400">{a.phone}</td>
                  <td className="px-4 py-3.5 text-xs">{a.whatsapp ? <a href={`https://wa.me/${a.whatsapp.replace(/^0/, "233")}`} target="_blank" rel="noreferrer" className="text-green-400 hover:text-green-300 font-mono">{a.whatsapp}</a> : <span className="text-slate-600">—</span>}</td>
                  <td className="px-4 py-3.5 text-slate-500 text-xs">{a.business_name || "—"}</td>
                  {agentTab === "approved" && <>
                    <td className="px-4 py-3.5">
                      <button onClick={() => setSwitchModal({ id: a.id, name: a.name, currentType: a.agent_type ?? "commission" })} title="Click to switch" className="hover:opacity-70 transition-opacity">
                        {a.agent_type === "custom_price" ? <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(139,92,246,0.15)", color: "#a78bfa", border: "1px solid rgba(139,92,246,0.3)" }}>Price Mode ⇄</span> : <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(16,185,129,0.1)", color: "#4ade80", border: "1px solid rgba(16,185,129,0.25)" }}>Commission ⇄</span>}
                      </button>
                    </td>
                    <td className="px-4 py-3.5 font-bold text-white">{a.total_sales}</td>
                    <td className="px-4 py-3.5 font-black" style={{ color: "#4ade80" }}>GH₵{(a.commission_balance ?? 0).toFixed(2)}</td>
                    <td className="px-4 py-3.5 font-mono text-xs font-bold" style={{ color: "#60a5fa" }}>{a.referral_code}</td>
                  </>}
                  {agentTab === "pending" && <td className="px-4 py-3.5 text-slate-500 text-xs">{new Date(a.created_at).toLocaleDateString("en-GH")}</td>}
                  <td className="px-4 py-3.5">
                    {agentTab === "pending" && (
                      <div className="flex gap-2">
                        <button onClick={() => setAgentAction({ id: a.id, name: a.name, action: "approve" })} className="text-xs font-bold px-3 py-1.5 rounded-lg text-white" style={{ background: "linear-gradient(90deg,#059669,#10b981)" }}>Approve</button>
                        <button onClick={() => setAgentAction({ id: a.id, name: a.name, action: "reject" })}  className="text-xs font-bold px-3 py-1.5 rounded-lg text-white" style={{ background: "linear-gradient(90deg,#dc2626,#f87171)" }}>Decline</button>
                      </div>
                    )}
                    {agentTab === "approved" && (
                      <div className="flex items-center gap-3">
                        {a.agent_type === "custom_price" && <button onClick={() => setPricesAgent({ id: a.id, name: a.name })} className="text-xs font-bold px-2.5 py-1 rounded-lg" style={{ background: "rgba(139,92,246,0.15)", color: "#a78bfa", border: "1px solid rgba(139,92,246,0.3)" }}>Set Prices</button>}
                        <button onClick={() => setAgentAction({ id: a.id, name: a.name, action: "reject" })} className="text-xs font-semibold" style={{ color: "#f87171" }}>Remove</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && <div className="py-16 text-center"><p className="text-4xl mb-3">{agentTab === "pending" ? "📭" : "👥"}</p><p className="text-slate-500 font-semibold">{agentTab === "pending" ? "No pending applications" : "No approved agents yet"}</p></div>}
        </div>
      </div>

      {agentAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="rounded-2xl shadow-2xl w-full max-w-sm p-6 border" style={{ background: CARD, borderColor: BORDER }}>
            <h3 className="font-black text-white text-lg mb-2">{agentAction.action === "approve" ? "Approve Agent" : "Decline & Remove Agent"}</h3>
            <p className="text-sm text-slate-400 mb-5">{agentAction.action === "approve" ? `Approve ${agentAction.name}?` : `Remove ${agentAction.name}? They can re-apply.`}</p>
            <div className="flex gap-3">
              <button onClick={() => setAgentAction(null)} className="flex-1 border text-slate-400 font-semibold py-2.5 rounded-xl text-sm hover:text-white" style={{ borderColor: BORDER }}>Cancel</button>
              <button onClick={handleAction} disabled={actionLoading} className="flex-1 text-white font-bold py-2.5 rounded-xl text-sm disabled:opacity-60" style={{ background: agentAction.action === "approve" ? "linear-gradient(90deg,#059669,#10b981)" : "linear-gradient(90deg,#dc2626,#f87171)" }}>{actionLoading ? "…" : agentAction.action === "approve" ? "Approve" : "Decline"}</button>
            </div>
          </div>
        </div>
      )}
      {pricesAgent && <AgentPriceModal agentId={pricesAgent.id} agentName={pricesAgent.name} onClose={() => setPricesAgent(null)} />}
      {switchMsg && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl text-sm font-bold shadow-xl border" style={switchMsg.ok ? { background: "rgba(16,185,129,0.15)", color: "#4ade80", borderColor: "rgba(16,185,129,0.3)" } : { background: "rgba(248,113,113,0.15)", color: "#f87171", borderColor: "rgba(248,113,113,0.3)" }}>{switchMsg.text}</div>}
      {switchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="rounded-2xl shadow-2xl w-full max-w-sm p-6 border" style={{ background: CARD, borderColor: BORDER }}>
            <h3 className="font-black text-white text-lg mb-2">Switch Agent Mode</h3>
            <p className="text-sm text-slate-400 mb-5">Switch <span className="text-white font-bold">{switchModal.name}</span> to <span className="font-bold" style={{ color: switchModal.currentType === "custom_price" ? "#4ade80" : "#a78bfa" }}>{switchModal.currentType === "custom_price" ? "Commission Mode" : "Price Mode"}</span>?</p>
            <div className="flex gap-3">
              <button onClick={() => setSwitchModal(null)} disabled={switching} className="flex-1 border text-slate-400 font-semibold py-2.5 rounded-xl text-sm" style={{ borderColor: BORDER }}>Cancel</button>
              <button onClick={handleSwitchMode} disabled={switching} className="flex-1 text-white font-bold py-2.5 rounded-xl text-sm disabled:opacity-60" style={{ background: switchModal.currentType === "custom_price" ? "linear-gradient(90deg,#059669,#10b981)" : "linear-gradient(90deg,#7c3aed,#8b5cf6)" }}>{switching ? "Switching…" : "Confirm"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Leaderboard View ────────────────────────────────────────────────────────
function LeaderboardView({ stats }: { stats: StatsData }) {
  const agents = useMemo(() =>
    [...stats.agents.all].filter(a => a.status === "approved")
      .sort((a, b) => Number(b.total_revenue) - Number(a.total_revenue)),
    [stats.agents.all]
  );

  const avatarColors = ["#f59e0b", "#94a3b8", "#cd7f32", "#3b82f6", "#8b5cf6", "#10b981", "#f87171"];
  const medals = ["🥇", "🥈", "🥉"];
  const totalRevenue = agents.reduce((s, a) => s + Number(a.total_revenue), 0);
  const totalSales   = agents.reduce((s, a) => s + Number(a.total_sales), 0);
  const totalBal     = agents.reduce((s, a) => s + Number(a.commission_balance ?? 0), 0);

  const topThree = agents.length >= 3 ? [agents[1], agents[0], agents[2]] : [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-black text-white">Agent Leaderboard</h1>
        <p className="text-sm text-slate-500">{agents.length} approved agents · GH₵{totalRevenue.toFixed(2)} total revenue generated</p>
      </div>

      {/* Podium — top 3 */}
      {topThree.length === 3 && (
        <div className="grid grid-cols-3 gap-3">
          {topThree.map((a, i) => {
            const rank = i === 0 ? 2 : i === 1 ? 1 : 3;
            const isFirst = rank === 1;
            const share = totalRevenue > 0 ? (Number(a.total_revenue) / totalRevenue) * 100 : 0;
            return (
              <div key={a.id} className="rounded-2xl border p-5 text-center" style={{ background: CARD, borderColor: isFirst ? "#78350f" : BORDER, boxShadow: isFirst ? "0 0 0 1px #78350f40" : undefined }}>
                <div className="text-3xl mb-3">{medals[rank - 1]}</div>
                <div className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-black text-white mx-auto mb-2" style={{ background: avatarColors[rank - 1] }}>
                  {(a.name ?? "?").charAt(0).toUpperCase()}
                </div>
                <p className="font-black text-white truncate">{a.name}</p>
                <p className="text-[11px] text-slate-500 mb-2">@{(a.referral_code ?? "").toLowerCase()}</p>
                <p className="font-black text-lg" style={{ color: "#4ade80" }}>GH₵{Number(a.total_revenue).toFixed(2)}</p>
                <p className="text-xs text-slate-500">{Number(a.total_sales).toLocaleString()} sales · {share.toFixed(1)}% share</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Full table */}
      <div className="rounded-2xl border overflow-hidden" style={{ background: CARD, borderColor: BORDER }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-slate-500 uppercase tracking-wider" style={{ background: BG, borderColor: BORDER }}>
                <th className="px-4 py-3 text-left font-semibold w-12">Rank</th>
                <th className="px-4 py-3 text-left font-semibold">Agent</th>
                <th className="px-4 py-3 text-left font-semibold">Code</th>
                <th className="px-4 py-3 text-left font-semibold">Mode</th>
                <th className="px-4 py-3 text-right font-semibold">Sales</th>
                <th className="px-4 py-3 text-right font-semibold">Revenue</th>
                <th className="px-4 py-3 text-right font-semibold">Comm. Balance</th>
                <th className="px-4 py-3 text-right font-semibold">Revenue Share</th>
                <th className="px-4 py-3 text-left font-semibold">Joined</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a, i) => {
                const share = totalRevenue > 0 ? (Number(a.total_revenue) / totalRevenue) * 100 : 0;
                return (
                  <tr key={a.id} className="border-b last:border-0 hover:bg-white/[0.02] transition-colors" style={{ borderColor: BORDER }}>
                    <td className="px-4 py-3.5 text-center">
                      {i < 3
                        ? <span className="text-xl">{medals[i]}</span>
                        : <span className="text-slate-600 font-black text-sm">#{i + 1}</span>}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0" style={{ background: avatarColors[i % avatarColors.length] }}>
                          {(a.name ?? "?").charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-white leading-none">{a.name}</p>
                          <p className="text-[10px] text-slate-500 mt-0.5 font-mono">{a.phone}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs font-bold" style={{ color: "#60a5fa" }}>{a.referral_code}</td>
                    <td className="px-4 py-3.5">
                      {a.agent_type === "custom_price"
                        ? <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(139,92,246,0.15)", color: "#a78bfa", border: "1px solid rgba(139,92,246,0.3)" }}>Price Mode</span>
                        : <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(16,185,129,0.1)", color: "#4ade80", border: "1px solid rgba(16,185,129,0.25)" }}>Commission</span>}
                    </td>
                    <td className="px-4 py-3.5 text-right font-bold text-white">{Number(a.total_sales).toLocaleString()}</td>
                    <td className="px-4 py-3.5 text-right font-black" style={{ color: "#4ade80" }}>GH₵{Number(a.total_revenue).toFixed(2)}</td>
                    <td className="px-4 py-3.5 text-right font-bold text-white">GH₵{Number(a.commission_balance ?? 0).toFixed(2)}</td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: BORDER }}>
                          <div className="h-full rounded-full" style={{ width: `${Math.min(share, 100)}%`, background: avatarColors[i % avatarColors.length] }} />
                        </div>
                        <span className="text-xs text-slate-400 w-10 text-right">{share.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-500">{new Date(a.created_at).toLocaleDateString("en-GH")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {agents.length === 0 && (
            <div className="py-16 text-center">
              <p className="text-4xl mb-3">🏆</p>
              <p className="text-slate-500 font-semibold">No approved agents yet</p>
            </div>
          )}
        </div>
        {agents.length > 0 && (
          <div className="grid grid-cols-3 border-t divide-x" style={{ borderColor: BORDER, '--tw-divide-opacity': 1 } as React.CSSProperties}>
            {[
              { label: "Approved Agents", value: agents.length.toString() },
              { label: "Total Sales", value: totalSales.toLocaleString() },
              { label: "Total Revenue", value: `GH₵${totalRevenue.toFixed(2)}`, green: true },
            ].map(s => (
              <div key={s.label} className="px-5 py-3 border-r last:border-r-0" style={{ borderColor: BORDER }}>
                <p className="text-xs text-slate-500 mb-0.5">{s.label}</p>
                <p className="font-black text-sm" style={{ color: s.green ? "#4ade80" : "white" }}>{s.value}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Commission balances summary */}
      {agents.length > 0 && (
        <div className="rounded-2xl border p-5" style={{ background: CARD, borderColor: BORDER }}>
          <p className="font-bold text-white mb-4">Outstanding Commission Balances</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {agents.filter(a => Number(a.commission_balance) > 0).sort((a, b) => Number(b.commission_balance) - Number(a.commission_balance)).map((a, i) => (
              <div key={a.id} className="rounded-xl border p-3" style={{ background: BG, borderColor: BORDER }}>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-white" style={{ background: avatarColors[i % avatarColors.length] }}>
                    {(a.name ?? "?").charAt(0).toUpperCase()}
                  </div>
                  <p className="text-xs font-semibold text-white truncate">{a.name}</p>
                </div>
                <p className="font-black text-sm" style={{ color: "#fbbf24" }}>GH₵{Number(a.commission_balance).toFixed(2)}</p>
                <p className="text-[10px] text-slate-600">pending payout</p>
              </div>
            ))}
            {agents.filter(a => Number(a.commission_balance) > 0).length === 0 && (
              <p className="col-span-full text-sm text-slate-600 py-2">All commission balances are at zero</p>
            )}
          </div>
          {totalBal > 0 && (
            <div className="mt-4 pt-3 border-t flex items-center justify-between" style={{ borderColor: BORDER }}>
              <span className="text-sm text-slate-400">Total outstanding commissions</span>
              <span className="font-black text-lg" style={{ color: "#fbbf24" }}>GH₵{totalBal.toFixed(2)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Biometric Settings ───────────────────────────────────────────────────────
function base64urlToBuffer(base64url: string): ArrayBuffer {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const b64 = (base64url + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}
function bufferToBase64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function BiometricSettings({ showToast }: { showToast: (msg: string, ok?: boolean) => void }) {
  const [status, setStatus] = useState<"loading" | "unsupported" | "none" | "registered">("loading");
  const [registering, setRegistering] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [credentials, setCredentials] = useState<{ id: string; createdAt: string }[]>([]);

  useEffect(() => {
    if (!window.PublicKeyCredential) { setStatus("unsupported"); return; }
    fetch("/api/admin/biometric?action=has-credentials")
      .then(r => r.json())
      .then(d => {
        if (d.registered) {
          setStatus("registered");
          fetch("/api/admin/biometric?action=list").then(r => r.json()).then(d => setCredentials(d.credentials ?? [])).catch(() => {});
        } else {
          setStatus("none");
        }
      })
      .catch(() => setStatus("none"));
  }, []);

  async function register() {
    setRegistering(true);
    try {
      const optRes = await fetch("/api/admin/biometric?action=registration-options");
      if (!optRes.ok) { showToast("❌ Could not start registration", false); setRegistering(false); return; }
      const options = await optRes.json();

      const publicKey: PublicKeyCredentialCreationOptions = {
        ...options,
        challenge: base64urlToBuffer(options.challenge),
        user: { ...options.user, id: base64urlToBuffer(options.user.id) },
        excludeCredentials: (options.excludeCredentials ?? []).map((c: { id: string; type: string; transports?: string[] }) => ({
          ...c, id: base64urlToBuffer(c.id),
        })),
      };

      const credential = await navigator.credentials.create({ publicKey }) as PublicKeyCredential;
      if (!credential) { showToast("❌ Registration cancelled", false); setRegistering(false); return; }

      const attestation = credential.response as AuthenticatorAttestationResponse;
      const body = {
        id: credential.id,
        rawId: bufferToBase64url(credential.rawId),
        type: credential.type,
        response: {
          clientDataJSON: bufferToBase64url(attestation.clientDataJSON),
          attestationObject: bufferToBase64url(attestation.attestationObject),
          transports: attestation.getTransports?.() ?? [],
        },
      };

      const verifyRes = await fetch("/api/admin/biometric?action=registration-verify", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const result = await verifyRes.json();
      if (result.success) {
        showToast("✓ Biometric registered! You can now log in without a password.");
        setStatus("registered");
        fetch("/api/admin/biometric?action=list").then(r => r.json()).then(d => setCredentials(d.credentials ?? [])).catch(() => {});
      } else {
        showToast(`❌ ${result.error ?? "Registration failed"}`, false);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("cancel") || msg.includes("abort") || msg.includes("NotAllowed")) {
        showToast("Cancelled — try again when ready");
      } else {
        showToast("❌ Registration error — try again", false);
      }
    } finally {
      setRegistering(false);
    }
  }

  async function remove() {
    if (!confirm("Remove biometric login? You will need your password to sign in.")) return;
    setRemoving(true);
    const r = await fetch("/api/admin/biometric?action=remove", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }).then(r => r.json());
    setRemoving(false);
    if (r.success) { setStatus("none"); setCredentials([]); showToast("Biometric removed. Use password to log in."); }
    else showToast("❌ Could not remove — try again", false);
  }

  if (status === "unsupported") return null;

  return (
    <div className="rounded-2xl border p-5" style={{ background: CARD, borderColor: BORDER }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="font-bold text-white">🔐 Fingerprint / Face ID Login</p>
          <p className="text-xs text-slate-500">Log in with your fingerprint, Face ID, or phone PIN — no password needed</p>
        </div>
        {status === "loading" && <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />}
        {status === "registered" && <span className="text-xs font-black text-green-400 border border-green-800 bg-green-950 px-2.5 py-1 rounded-full">Active ✓</span>}
        {status === "none" && <span className="text-xs font-bold text-slate-500 border border-slate-700 px-2.5 py-1 rounded-full">Not set up</span>}
      </div>

      {status === "registered" && credentials.length > 0 && (
        <div className="mb-4 space-y-1.5">
          {credentials.map((c, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-slate-400 bg-green-950/30 rounded-lg px-3 py-2 border border-green-900/40">
              <span>📱</span>
              <span>Device {i + 1}: <span className="font-mono text-slate-300">{c.id}</span></span>
              <span className="ml-auto text-slate-600">{new Date(c.createdAt).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3">
        {status !== "loading" && (
          <button
            onClick={register}
            disabled={registering}
            className="flex-1 py-3 rounded-xl text-sm font-black text-white disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ background: "linear-gradient(135deg,#2563eb,#7c3aed)" }}>
            {registering
              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Setting up…</>
              : status === "registered" ? "👆 Re-register Biometric" : "👆 Set Up Fingerprint / Face ID"}
          </button>
        )}
        {status === "registered" && (
          <button
            onClick={remove}
            disabled={removing}
            className="px-4 py-3 rounded-xl text-sm font-bold text-red-400 border border-red-900 hover:bg-red-950 disabled:opacity-60">
            {removing ? "…" : "Remove"}
          </button>
        )}
      </div>

      {status === "none" && (
        <p className="text-xs text-slate-600 mt-3 text-center">
          Works with any phone — fingerprint sensor, Face ID, face unlock, or screen PIN
        </p>
      )}
    </div>
  );
}

// ─── Settings View ────────────────────────────────────────────────────────────
function SettingsView({ onChangePassword }: { onChangePassword: () => void }) {
  const [net, setNet] = useState<{ mtn: boolean; telecel: boolean; at: boolean; autoHours: boolean; autoStart: string; autoEnd: string } | null>(null);
  const [netError, setNetError] = useState("");
  const [netSaving, setNetSaving] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [toastOk, setToastOk] = useState(true);
  const [checkingInt, setCheckingInt] = useState(false);
  const [intStatus, setIntStatus] = useState<Record<string, { value: string; ok: boolean }> | null>(null);
  const [hoursSaving, setHoursSaving] = useState(false);

  function showToast(msg: string, ok = true) { setToast(msg); setToastOk(ok); setTimeout(() => setToast(""), 3500); }

  useEffect(() => {
    fetch("/api/admin/network-settings")
      .then(r => r.json())
      .then(d => {
        if (d.error) { setNetError("Could not load settings. Run the SQL below in Supabase first."); return; }
        setNet(d);
      })
      .catch(() => setNetError("Network error loading settings."));
  }, []);

  async function toggleNet(key: "mtn" | "telecel" | "at", value: boolean) {
    if (!net) return;
    setNet(prev => prev ? { ...prev, [key]: value } : prev);
    setNetSaving(key);
    const r = await fetch("/api/admin/network-settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [key]: value }) }).then(r => r.json());
    setNetSaving(null);
    if (r.success) showToast(`✓ ${key.toUpperCase()} ${value ? "enabled" : "disabled"}`);
    else { showToast("❌ Save failed — check Supabase SQL below", false); setNet(prev => prev ? { ...prev, [key]: !value } : prev); }
  }

  async function toggleAutoHours(value: boolean) {
    if (!net) return;
    setNet(prev => prev ? { ...prev, autoHours: value } : prev);
    setNetSaving("autoHours");
    const r = await fetch("/api/admin/network-settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ autoHours: value }) }).then(r => r.json());
    setNetSaving(null);
    if (r.success) showToast(`✓ Auto hours ${value ? "enabled" : "disabled"}`);
    else showToast("❌ Save failed", false);
  }

  async function saveStoreHours() {
    if (!net) return;
    setHoursSaving(true);
    const r = await fetch("/api/admin/network-settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ autoStart: net.autoStart, autoEnd: net.autoEnd }) }).then(r => r.json());
    setHoursSaving(false);
    if (r.success) showToast("✓ Store hours saved!");
    else showToast("❌ Save failed", false);
  }

  async function checkIntegrations() {
    setCheckingInt(true); setIntStatus(null);
    const results: Record<string, { value: string; ok: boolean }> = {};
    try {
      const d = await fetch("/api/admin/inventor-balance").then(r => r.json());
      results["Inventor API"] = d.balance !== null ? { value: `✓ Balance: GH₵${Number(d.balance).toFixed(2)}`, ok: true } : { value: "✗ Unreachable", ok: false };
    } catch { results["Inventor API"] = { value: "✗ Error", ok: false }; }
    const atKey = !!process.env.AT_API_KEY; // won't work client-side but shows intent
    results["Africa's Talking SMS"] = { value: "Check Vercel env: AT_API_KEY + AT_USERNAME", ok: false };
    results["Supabase DB"] = net ? { value: "✓ Connected", ok: true } : { value: "✗ Not connected — run SQL below", ok: false };
    setIntStatus(results);
    setCheckingInt(false);
  }

  function SettingToggle({ checked, onChange, saving }: { checked: boolean; onChange: (v: boolean) => void; saving?: boolean }) {
    return (
      <button onClick={() => !saving && onChange(!checked)} disabled={saving}
        className="relative inline-flex items-center h-7 rounded-full w-12 transition-colors shrink-0 disabled:opacity-60"
        style={{ background: checked ? "#16a34a" : "#374151" }}>
        {saving ? <span className="absolute inset-0 flex items-center justify-center"><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /></span>
          : <span className="inline-block w-5 h-5 transform rounded-full bg-white shadow transition-transform" style={{ transform: checked ? "translateX(26px)" : "translateX(2px)" }} />}
      </button>
    );
  }

  const SQL = `-- Run this ONCE in Supabase SQL Editor:\nCREATE TABLE IF NOT EXISTS system_settings (\n  key text PRIMARY KEY,\n  value text NOT NULL,\n  updated_at timestamptz DEFAULT now()\n);\n\nCREATE TABLE IF NOT EXISTS admin_config (\n  key text PRIMARY KEY,\n  value text NOT NULL,\n  updated_at timestamptz DEFAULT now()\n);`;

  return (
    <div className="max-w-xl space-y-5">
      <div><h1 className="text-xl font-black text-white">Settings</h1><p className="text-sm text-slate-500">Store availability, hours, and account settings</p></div>

      {/* SQL banner if table missing */}
      {netError && (
        <div className="rounded-2xl border p-4" style={{ background: "#120a00", borderColor: "#92400e" }}>
          <p className="text-sm font-bold text-amber-400 mb-2">⚠️ {netError}</p>
          <pre className="text-xs text-blue-300 font-mono whitespace-pre-wrap">{SQL}</pre>
        </div>
      )}

      {/* Network Availability */}
      <div className="rounded-2xl border p-5" style={{ background: CARD, borderColor: BORDER }}>
        <h2 className="font-bold text-white mb-1">Network Availability</h2>
        <p className="text-xs text-slate-500 mb-4">Switch a network off to hide it from customers when it has issues</p>
        {!net && !netError && <div className="flex items-center gap-2 text-sm text-slate-500"><div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /> Loading…</div>}
        <div className="space-y-4">
          {net && [
            { key: "mtn" as const, label: "MTN",        dot: "#f59e0b" },
            { key: "telecel" as const, label: "Telecel", dot: "#ef4444" },
            { key: "at" as const, label: "AirtelTigo",  dot: "#3b82f6" },
          ].map(n => (
            <div key={n.key} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: n.dot }} />
                <div>
                  <p className="font-semibold text-white text-sm">{n.label}</p>
                  <p className="text-xs font-bold" style={{ color: net[n.key] ? "#4ade80" : "#f87171" }}>
                    {net[n.key] ? "Available" : "Disabled"}
                  </p>
                </div>
              </div>
              <SettingToggle checked={net[n.key]} saving={netSaving === n.key} onChange={v => toggleNet(n.key, v)} />
            </div>
          ))}
        </div>
      </div>

      {/* Auto Store Hours */}
      {net && (
        <div className="rounded-2xl border p-5" style={{ background: CARD, borderColor: BORDER }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-bold text-white">⏰ Auto Store Hours</p>
              <p className="text-xs text-slate-500">Store auto-closes outside these times (Ghana time)</p>
            </div>
            <SettingToggle checked={net.autoHours} saving={netSaving === "autoHours"} onChange={toggleAutoHours} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Open Time</label>
              <input type="time" value={net.autoStart}
                onChange={e => setNet(s => s ? { ...s, autoStart: e.target.value } : s)}
                className="w-full rounded-xl px-3 py-2.5 text-sm text-white border focus:outline-none focus:border-blue-500"
                style={{ background: BG, borderColor: BORDER }} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Close Time</label>
              <input type="time" value={net.autoEnd}
                onChange={e => setNet(s => s ? { ...s, autoEnd: e.target.value } : s)}
                className="w-full rounded-xl px-3 py-2.5 text-sm text-white border focus:outline-none focus:border-blue-500"
                style={{ background: BG, borderColor: BORDER }} />
            </div>
          </div>
          <button onClick={saveStoreHours} disabled={hoursSaving}
            className="mt-4 w-full py-2.5 rounded-xl text-sm font-black text-white disabled:opacity-60"
            style={{ background: "linear-gradient(90deg,#3b82f6,#8b5cf6)" }}>
            {hoursSaving ? "Saving…" : "Save Store Hours"}
          </button>
          {!net.autoHours && <p className="text-xs text-slate-600 mt-2 text-center">Enable the toggle above to activate auto hours</p>}
        </div>
      )}

      {/* Integrations */}
      <div className="rounded-2xl border p-5" style={{ background: CARD, borderColor: BORDER }}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="font-bold text-white">🔌 Integrations Status</p>
            <p className="text-xs text-slate-500">Check API connections</p>
          </div>
          <button onClick={checkIntegrations} disabled={checkingInt}
            className="text-xs border px-3 py-1.5 rounded-lg font-bold text-blue-400 border-blue-900 hover:bg-blue-900/20 disabled:opacity-50">
            {checkingInt ? "Checking…" : "Check Now"}
          </button>
        </div>
        {intStatus && (
          <div className="mt-3 space-y-2.5">
            {Object.entries(intStatus).map(([k, v]) => (
              <div key={k} className="flex items-start justify-between gap-3">
                <span className="text-sm text-slate-400 shrink-0">{k}</span>
                <span className="text-xs font-semibold text-right" style={{ color: v.ok ? "#4ade80" : "#fbbf24" }}>{v.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Fingerprint / Face ID Login */}
      <BiometricSettings showToast={showToast} />

      {/* Admin Account */}
      <div className="rounded-2xl border p-5" style={{ background: CARD, borderColor: BORDER }}>
        <p className="font-bold text-white mb-1">Admin Account</p>
        <p className="text-xs text-slate-500 mb-4">Logged in as <span className="text-white font-semibold">Super Admin</span></p>
        <button onClick={onChangePassword}
          className="flex items-center gap-3 px-4 py-3 rounded-xl border w-full text-left transition-all hover:border-blue-500"
          style={{ background: BG, borderColor: BORDER }}>
          <span className="text-2xl">🔑</span>
          <div>
            <p className="text-sm font-bold text-white">Change Password</p>
            <p className="text-xs text-slate-500">Update your admin login password</p>
          </div>
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl text-sm font-bold shadow-xl"
          style={{ background: toastOk ? "#14532d" : "#7f1d1d", color: toastOk ? "#4ade80" : "#f87171", border: `1px solid ${toastOk ? "#166534" : "#991b1b"}` }}>
          {toast}
        </div>
      )}

    </div>
  );
}

// ─── Placeholder ─────────────────────────────────────────────────────────────
function ComingSoon({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-40 gap-3">
      <span className="text-5xl">🚧</span>
      <p className="text-lg font-bold text-white">{label}</p>
      <p className="text-sm text-slate-500">Coming soon</p>
    </div>
  );
}

// ─── Compensate View ─────────────────────────────────────────────────────────
function CompensateView() {
  const [phone, setPhone] = useState(""); const [network, setNetwork] = useState("mtn"); const [sizeGB, setSizeGB] = useState("2");
  const [agentCode, setAgentCode] = useState(""); const [commission, setCommission] = useState(""); const [originalRef, setOriginalRef] = useState(""); const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; agentCredited: boolean; deliveryLog: string; ref: string } | null>(null);
  const [error, setError] = useState("");
  async function handleSubmit() {
    setLoading(true); setResult(null); setError("");
    try {
      const res = await fetch("/api/admin/compensate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, network, sizeGB: parseFloat(sizeGB), agentCode: agentCode || undefined, commission: parseFloat(commission) || undefined, note: note || undefined, originalRef: originalRef || undefined }) });
      const j = await res.json();
      if (res.ok) setResult(j); else setError(j.error ?? "Failed");
    } catch (e) { setError(String(e)); }
    setLoading(false);
  }
  const inp = "w-full rounded-xl px-3 py-2.5 text-sm text-white border focus:outline-none focus:border-blue-500";
  return (
    <div className="max-w-lg">
      <div className="rounded-2xl border p-6" style={{ background: CARD, borderColor: BORDER }}>
        <h2 className="text-lg font-black text-white mb-1">Compensate Delivery</h2>
        <p className="text-xs text-slate-500 mb-5">Deliver missing data to a customer and credit the agent commission.</p>
        {result && <div className="rounded-xl p-3 mb-4 border" style={{ background: result.success ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", borderColor: result.success ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)" }}><p className="text-sm font-bold" style={{ color: result.success ? "#4ade80" : "#f87171" }}>{result.success ? "✅ Delivered!" : "❌ Failed"} {result.agentCredited ? "· Agent credited" : ""}</p><p className="text-xs text-slate-500 mt-1 break-all">Ref: {result.ref}</p><p className="text-xs text-slate-500 mt-0.5 break-all">{result.deliveryLog}</p></div>}
        {error && <div className="rounded-xl p-3 mb-4 border text-red-400 text-sm" style={{ background: "rgba(239,68,68,0.1)", borderColor: "rgba(239,68,68,0.3)" }}>{error}</div>}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div><label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Phone</label><input className={inp} style={{ background: BG, borderColor: BORDER }} value={phone} onChange={e => setPhone(e.target.value)} placeholder="0556153736" /></div>
          <div><label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Network</label><select className={inp} style={{ background: BG, borderColor: BORDER }} value={network} onChange={e => setNetwork(e.target.value)}><option value="mtn">MTN</option><option value="telecel">Telecel</option><option value="airteltigo">AirtelTigo</option></select></div>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div><label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Missing GB</label><input type="number" min="0.5" step="0.5" className={inp} style={{ background: BG, borderColor: BORDER }} value={sizeGB} onChange={e => setSizeGB(e.target.value)} /></div>
          <div><label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Commission (GH₵)</label><input type="number" min="0" step="0.01" className={inp} style={{ background: BG, borderColor: BORDER }} value={commission} onChange={e => setCommission(e.target.value)} /></div>
        </div>
        <div className="mb-3"><label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Agent Code</label><input className={inp} style={{ background: BG, borderColor: BORDER }} value={agentCode} onChange={e => setAgentCode(e.target.value)} placeholder="Leave blank to skip" /></div>
        <div className="mb-3"><label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Original Order Ref</label><input className={inp} style={{ background: BG, borderColor: BORDER }} value={originalRef} onChange={e => setOriginalRef(e.target.value)} /></div>
        <div className="mb-5"><label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Note</label><input className={inp} style={{ background: BG, borderColor: BORDER }} value={note} onChange={e => setNote(e.target.value)} placeholder="Reason for compensation" /></div>
        <button onClick={handleSubmit} disabled={loading} className="w-full text-white font-bold py-3 rounded-xl text-sm disabled:opacity-60" style={{ background: loading ? "#334155" : "linear-gradient(90deg,#3b82f6,#8b5cf6)" }}>{loading ? "Sending…" : `🔧 Deliver ${sizeGB}GB to ${phone || "customer"}`}</button>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [animated, setAnimated] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [showChangePw, setShowChangePw] = useState(false);

  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const res = await fetch("/api/admin/stats");
      if (res.status === 401) { router.push("/admin/login"); return; }
      setStats(await res.json());
      setTimeout(() => setAnimated(true), 80);
    } finally { setLoadingStats(false); }
  }, [router]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { if (tab === "overview") { setAnimated(false); setTimeout(() => setAnimated(true), 60); } }, [tab]);

  async function handleLogout() {
    await fetch("/api/admin/auth", { method: "DELETE" });
    router.push("/admin/login");
  }

  const tabToOrderFilter: Record<string, OrderStatus> = {
    "all-orders": "ALL", "pending-orders": "PENDING", "processing": "PROCESSING", "completed": "COMPLETED", "failed-orders": "FAILED",
  };
  const isOrderTab = (t: Tab) => t in tabToOrderFilter;
  const isAgentTab = (t: Tab) => t === "all-agents" || t === "agent-applications";

  const pageTitle: Record<Tab, string> = {
    "overview": "Dashboard", "all-orders": "All Orders", "pending-orders": "Pending Orders", "processing": "Processing",
    "completed": "Completed", "failed-orders": "Failed Orders", "data-bundles": "Data Bundles", "bundle-prices": "Agent Prices",
    "all-agents": "All Agents", "agent-applications": "Agent Applications", "agent-wallets": "Agent Wallets",
    "leaderboard": "Referrals & Leaderboard", "referrals": "Referrals & Leaderboard", "transactions": "Transactions", "commissions": "Commissions",
    "manual": "Manual Orders", "compensate": "Compensate", "announcements": "Notifications", "notifications": "Notifications", "promo": "Promo Banner",
    "sms": "SMS Messaging", "apikeys": "API Keys", "settings": "Settings",
    "customers": "Customers", "mashup-bundles": "Mashup Bundles", "network-providers": "Network Providers",
    "coupons": "Coupons", "withdrawals": "Withdrawal Requests", "agent-ranks": "Agent Ranks",
    "analytics": "Analytics", "developer-api": "Developer API", "paystack-split": "Paystack Split Payments",
  };

  return (
    <div style={{ minHeight: "100vh", background: BG }}>
      <Sidebar tab={tab} setTab={setTab} pendingOrders={stats?.orders.pending ?? 0} pendingAgents={stats?.agents.pending ?? 0} onLogout={handleLogout} onChangePassword={() => setShowChangePw(true)} mobileOpen={mobileSidebarOpen} onMobileClose={() => setMobileSidebarOpen(false)} />
      {showChangePw && <ChangePasswordModal onClose={() => setShowChangePw(false)} />}
      {mobileSidebarOpen && <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={() => setMobileSidebarOpen(false)} />}

      <div className="md:ml-60 flex flex-col min-h-screen">
        {/* Header */}
        <header className="px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 z-30 border-b backdrop-blur-sm" style={{ background: "rgba(8,15,30,0.92)", borderColor: BORDER }}>
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileSidebarOpen(true)} className="md:hidden p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
              <Ic.menu />
            </button>
            {/* Breadcrumb */}
            <div className="hidden sm:flex items-center gap-2">
              <span className="text-xs text-slate-600 font-semibold">Elite Data</span>
              <span className="text-slate-700">/</span>
              <span className="text-xs font-bold text-white">{pageTitle[tab] ?? "Dashboard"}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"><Ic.bell /></button>
              {(stats?.agents.pending ?? 0) > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-red-900" />}
            </div>
            <div className="flex items-center gap-2.5 border rounded-xl px-3 py-1.5" style={{ background: "rgba(30,58,95,0.4)", borderColor: BORDER }}>
              <div className="w-7 h-7 rounded-full flex items-center justify-center font-black text-white text-xs" style={{ background: "linear-gradient(135deg,#3b82f6,#7c3aed)" }}>A</div>
              <div className="hidden sm:block text-right">
                <p className="text-xs font-bold text-white leading-none">Admin</p>
                <p className="text-[10px] text-slate-500">Super Admin</p>
              </div>
            </div>
          </div>
        </header>

        {/* Page header */}
        <div className="px-4 sm:px-6 py-4 border-b flex items-center justify-between gap-4" style={{ borderColor: BORDER }}>
          <div>
            <h1 className="text-lg font-black text-white leading-none">{pageTitle[tab] ?? "Dashboard"}</h1>
            {tab === "overview" && <p className="text-sm mt-1" style={{ color: "#64748b" }}>Welcome back, Admin 👋</p>}
          </div>
          {tab === "overview" && (
            <div className="hidden sm:flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-xl" style={{ background: "rgba(16,185,129,0.1)", color: "#34d399", border: "1px solid rgba(16,185,129,0.2)" }}>
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              System Live
            </div>
          )}
        </div>

        {/* Content */}
        <main className="flex-1 px-3 sm:px-6 py-5 pb-24 md:pb-5">
          {loadingStats && !stats ? (
            <div className="flex flex-col items-center justify-center py-40 gap-4">
              <div className="w-10 h-10 border-4 border-[#3b82f6] border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-500">Loading dashboard…</p>
            </div>
          ) : stats ? (
            <>
              {tab === "overview"          && <Dashboard stats={stats} animated={animated} onNavigate={setTab} />}
              {isOrderTab(tab)             && <OrdersView orders={stats.orders.all} onRefresh={fetchStats} defaultFilter={tabToOrderFilter[tab]} />}
              {tab === "data-bundles"      && <PricesView />}
              {tab === "bundle-prices"     && <AgentPricesAdmin allAgents={stats.agents.all} />}
              {isAgentTab(tab)             && <AgentsView stats={stats} onRefresh={fetchStats} defaultTab={tab === "agent-applications" ? "pending" : "approved"} />}
              {tab === "agent-wallets"     && <AgentWalletsAdmin />}
              {(tab === "leaderboard" || tab === "referrals") && <LeaderboardView stats={stats} />}
              {tab === "agent-ranks"       && <LeaderboardView stats={stats} />}
              {tab === "transactions"      && <PnLView orders={stats.orders.all} agents={stats.agents.all} />}
              {tab === "commissions"       && <CommissionAdmin />}
              {tab === "manual"            && <ManualOrdersAdmin />}
              {tab === "compensate"        && <CompensateView />}
              {(tab === "announcements" || tab === "notifications") && <AnnouncementsAdmin />}
              {tab === "promo"             && <PromoBannerAdmin />}
              {tab === "sms"               && <SMSAdmin agents={stats.agents.all} />}
              {tab === "apikeys"           && <ApiKeysAdmin />}
              {tab === "developer-api"     && <ApiKeysAdmin />}
              {tab === "settings"          && <SettingsView onChangePassword={() => setShowChangePw(true)} />}
              {tab === "customers"         && <CustomersAdmin />}
              {tab === "mashup-bundles"    && <MashupBundlesAdmin />}
              {tab === "network-providers" && <NetworkProvidersAdmin />}
              {tab === "coupons"           && <CouponsAdmin />}
              {tab === "withdrawals"       && <WithdrawalsAdmin />}
              {tab === "analytics"         && <AnalyticsAdmin orders={stats.orders.all as never} />}
              {tab === "paystack-split"    && <PaystackSplitAdmin />}
            </>
          ) : null}
        </main>
      </div>

      {/* Mobile bottom nav — expanding pill style */}
      <nav className="md:hidden" style={{ position: "fixed", bottom: 14, left: 0, right: 0, display: "flex", justifyContent: "center", zIndex: 50, pointerEvents: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 10px", borderRadius: 999, background: "rgba(6,12,28,0.97)", boxShadow: "0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.07)", backdropFilter: "blur(24px)", pointerEvents: "all" }}>
          {([
            { id: "overview" as Tab,     label: "Home",    badge: 0,                          svg: <svg width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg> },
            { id: "all-orders" as Tab,   label: "Orders",  badge: stats?.orders.pending ?? 0, svg: <svg width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg> },
            { id: "all-agents" as Tab,   label: "Agents",  badge: stats?.agents.pending ?? 0, svg: <svg width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
            { id: "transactions" as Tab, label: "Finance", badge: 0,                          svg: <svg width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg> },
            { id: "__more__" as Tab,     label: "More",    badge: 0,                          svg: <svg width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg> },
          ] as { id: Tab; label: string; svg: React.ReactNode; badge: number }[]).map(item => {
            const isMore = item.id === ("__more__" as Tab);
            const active = !isMore && tab === item.id;
            return (
              <button key={item.id}
                onClick={() => isMore ? setMobileSidebarOpen(true) : setTab(item.id)}
                style={{
                  position: "relative", display: "flex", alignItems: "center", gap: 7,
                  height: 44, padding: active ? "0 14px 0 6px" : "0 6px",
                  borderRadius: 999,
                  background: active ? "rgba(59,130,246,0.18)" : "transparent",
                  boxShadow: active ? "0 0 18px rgba(59,130,246,0.25)" : "none",
                  border: "none", cursor: "pointer", overflow: "hidden", flexShrink: 0,
                  color: active ? "#fff" : "#4b5563",
                  transition: "background .35s ease, box-shadow .35s ease, padding .4s cubic-bezier(.22,1,.36,1)",
                }}>
                <span style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: active ? "rgba(255,255,255,0.18)" : "transparent", transition: "background .3s ease" }}>
                  {item.svg}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", maxWidth: active ? 72 : 0, opacity: active ? 1 : 0, overflow: "hidden", transform: active ? "translateX(0)" : "translateX(-6px)", transition: "max-width .45s cubic-bezier(.22,1,.36,1), opacity .25s ease, transform .35s ease" }}>
                  {item.label}
                </span>
                {item.badge > 0 && <span style={{ position: "absolute", top: 4, right: active ? 8 : 2, minWidth: 16, height: 16, borderRadius: 999, background: "#f97316", color: "#fff", fontSize: 9, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>{item.badge}</span>}
              </button>
            );
          })}
        </div>
      </nav>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
