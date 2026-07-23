"use client";
import { useMemo, useState } from "react";

const BG    = "#080f1e";
const CARD  = "#0d1b2e";
const BORDER = "#1e3a5f";

type Period = "today" | "week" | "month" | "year" | "all";

interface Order {
  reference?: string;
  status: string;
  amount: number;
  admin_commission?: number;
  cost_price?: number;
  bundle_size: string;
  network: string;
  created_at: string;
  agent_id: string | null;
  phone?: string;
}

// ── helpers ────────────────────────────────────────────────────────────────────

function periodStart(p: Period): Date {
  const d = new Date();
  if (p === "today")  { d.setHours(0, 0, 0, 0); return d; }
  if (p === "week")   { d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1)); d.setHours(0, 0, 0, 0); return d; }
  if (p === "month")  { d.setDate(1); d.setHours(0, 0, 0, 0); return d; }
  if (p === "year")   { d.setMonth(0, 1); d.setHours(0, 0, 0, 0); return d; }
  return new Date(0);
}

function parseGB(bundleSize: string): number {
  const raw = (bundleSize ?? "").replace(/^(mtn|telecel|at ishare|airteltigo|airtel)\s+/i, "").trim();
  const m = raw.match(/^([\d.]+)\s*(gb|tb|mb)?/i);
  if (!m) return 0;
  const val = parseFloat(m[1]), unit = (m[2] ?? "GB").toUpperCase();
  return unit === "TB" ? val * 1024 : unit === "MB" ? val / 1024 : val;
}

function fmtGB(gb: number): string {
  return gb >= 1024 ? `${(gb / 1024).toFixed(2)} TB` : `${gb.toFixed(0)} GB`;
}

// ── SVG Charts ─────────────────────────────────────────────────────────────────

function LineChart({ data }: { data: { label: string; revenue: number }[] }) {
  const W = 500, H = 120, pad = { t: 10, r: 8, b: 26, l: 8 };
  const iW = W - pad.l - pad.r, iH = H - pad.t - pad.b;
  const max = Math.max(...data.map(d => d.revenue), 1);
  const pts = data.map((d, i) => ({
    x: pad.l + (data.length > 1 ? (i / (data.length - 1)) * iW : iW / 2),
    y: pad.t + iH - (d.revenue / max) * iH,
  }));
  const linePath = pts.reduce((acc, p, i) => {
    if (i === 0) return `M ${p.x} ${p.y}`;
    const prev = pts[i - 1], cx = (prev.x + p.x) / 2;
    return `${acc} C ${cx} ${prev.y} ${cx} ${p.y} ${p.x} ${p.y}`;
  }, "");
  const areaPath = pts.length
    ? `${linePath} L ${pts[pts.length - 1].x} ${H - pad.b} L ${pts[0].x} ${H - pad.b} Z`
    : "";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 150 }}>
      <defs>
        <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map((t, i) => (
        <line key={i} x1={pad.l} y1={pad.t + iH * (1 - t)} x2={W - pad.r} y2={pad.t + iH * (1 - t)} stroke="#1e3a5f" strokeWidth={0.8} />
      ))}
      {areaPath && <path d={areaPath} fill="url(#revGrad)" />}
      {linePath && <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
      {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3.5} fill="#3b82f6" stroke={BG} strokeWidth={1.5} />)}
      {data.map((d, i) => <text key={i} x={pts[i].x} y={H - pad.b + 14} textAnchor="middle" fontSize={8} fill="#475569">{d.label}</text>)}
    </svg>
  );
}

function DonutChart({ slices, total }: { slices: { pct: number; color: string }[]; total: number }) {
  const R = 52, r = 36, cx = 70, cy = 70;
  const starts = slices.reduce<number[]>((acc, _s, i) => {
    acc.push(i === 0 ? -90 : acc[i - 1] + (slices[i - 1].pct / 100) * 360);
    return acc;
  }, []);
  function arc(start: number, pct: number) {
    if (pct >= 100) pct = 99.99;
    const sweep = (pct / 100) * 360;
    const end = start + sweep;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const x1 = cx + R * Math.cos(toRad(start)), y1 = cy + R * Math.sin(toRad(start));
    const x2 = cx + R * Math.cos(toRad(end)),   y2 = cy + R * Math.sin(toRad(end));
    const ix1 = cx + r * Math.cos(toRad(end)),  iy1 = cy + r * Math.sin(toRad(end));
    const ix2 = cx + r * Math.cos(toRad(start)),iy2 = cy + r * Math.sin(toRad(start));
    const lg = sweep > 180 ? 1 : 0;
    return `M${x1} ${y1} A${R} ${R} 0 ${lg} 1 ${x2} ${y2} L${ix1} ${iy1} A${r} ${r} 0 ${lg} 0 ${ix2} ${iy2}Z`;
  }
  return (
    <svg viewBox="0 0 140 140" width={130} height={130}>
      {slices.map((s, i) => <path key={i} d={arc(starts[i], s.pct)} fill={s.color} />)}
      {slices.length === 0 && <circle cx={cx} cy={cy} r={R} fill="#1e3a5f" />}
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize={14} fontWeight="800" fill="white">{total.toLocaleString()}</text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize={8} fill="#64748b">sold</text>
    </svg>
  );
}

function HBarChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="admin-section space-y-2">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-slate-400 w-14 shrink-0 text-right">{d.label}</span>
          <div className="flex-1 h-4 rounded-full overflow-hidden" style={{ background: "#1e3a5f" }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${(d.value / max) * 100}%`, background: d.color }} />
          </div>
          <span className="text-[10px] font-bold text-white w-6 shrink-0">{d.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function AnalyticsAdmin({ orders }: { orders: Order[] }) {
  const [period, setPeriod] = useState<Period>("week");

  const filtered = useMemo(() => {
    const start = periodStart(period);
    return orders.filter(o => new Date(o.created_at) >= start);
  }, [orders, period]);

  const completed = useMemo(() => filtered.filter(o => o.status?.toLowerCase() === "completed"), [filtered]);
  const allCompleted = useMemo(() => orders.filter(o => o.status?.toLowerCase() === "completed"), [orders]);

  // KPIs
  const totalRevenue   = completed.reduce((s, o) => s + Number(o.amount), 0);
  const totalOrders    = filtered.length;
  const avgOrderVal    = completed.length ? totalRevenue / completed.length : 0;
  const totalDataGB    = completed.reduce((s, o) => s + parseGB(o.bundle_size), 0);
  const completionRate = totalOrders ? (completed.length / totalOrders) * 100 : 0;
  const totalProfit    = completed.reduce((s, o) => s + Number(o.admin_commission ?? 0), 0);
  const uniqueCustomers = new Set(filtered.filter(o => o.phone).map(o => o.phone)).size;

  // Revenue chart data
  const revenueChart = useMemo(() => {
    if (period === "today") {
      return Array.from({ length: 24 }, (_, h) => {
        const rev = completed.filter(o => new Date(o.created_at).getHours() === h).reduce((s, o) => s + Number(o.amount), 0);
        return { label: `${h}h`, revenue: rev };
      }).filter((_, i) => i % 3 === 0);
    }
    if (period === "week") {
      const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      const start = periodStart("week");
      return labels.map((label, i) => {
        const s = new Date(start); s.setDate(start.getDate() + i);
        const e = new Date(s);     e.setDate(s.getDate() + 1);
        return { label, revenue: completed.filter(o => { const d = new Date(o.created_at); return d >= s && d < e; }).reduce((sum, o) => sum + Number(o.amount), 0) };
      });
    }
    if (period === "month") {
      const now = new Date(), daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      return Array.from({ length: daysInMonth }, (_, i) => {
        const day = i + 1;
        const rev = completed.filter(o => new Date(o.created_at).getDate() === day).reduce((s, o) => s + Number(o.amount), 0);
        return { label: `${day}`, revenue: rev };
      }).filter((_, i) => i % 5 === 0 || i === daysInMonth - 1);
    }
    if (period === "year") {
      const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      return months.map((label, i) => ({
        label,
        revenue: completed.filter(o => new Date(o.created_at).getMonth() === i).reduce((s, o) => s + Number(o.amount), 0),
      }));
    }
    // all time — monthly last 6
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return {
        label: months[d.getMonth()],
        revenue: allCompleted.filter(o => {
          const od = new Date(o.created_at);
          return od.getFullYear() === d.getFullYear() && od.getMonth() === d.getMonth();
        }).reduce((s, o) => s + Number(o.amount), 0),
      };
    });
  }, [period, completed, allCompleted]);

  // Top products
  const topProducts = useMemo(() => {
    const map: Record<string, { count: number; revenue: number; network: string }> = {};
    for (const o of completed) {
      const net = (o.network ?? "").toUpperCase();
      const raw = (o.bundle_size ?? "").replace(/^(mtn|telecel|at ishare|airteltigo|airtel)\s+/i, "").trim();
      const key = `${raw}||${net}`;
      if (!map[key]) map[key] = { count: 0, revenue: 0, network: net };
      map[key].count++;
      map[key].revenue += Number(o.amount) || 0;
    }
    const COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#f87171", "#06b6d4"];
    const sorted = Object.entries(map).sort((a, b) => b[1].count - a[1].count);
    const top5 = sorted.slice(0, 5);
    const others = sorted.slice(5).reduce((s, [, v]) => ({ count: s.count + v.count, revenue: s.revenue + v.revenue }), { count: 0, revenue: 0 });
    const total = completed.length || 1;
    const result = top5.map(([key, v], i) => {
      const [size, net] = key.split("||");
      return { label: size, net, count: v.count, revenue: v.revenue, pct: (v.count / total) * 100, color: COLORS[i] };
    });
    if (others.count > 0) result.push({ label: "Others", net: "", count: others.count, revenue: others.revenue, pct: (others.count / total) * 100, color: COLORS[5] });
    return result;
  }, [completed]);

  // Network breakdown
  const byNetwork = useMemo(() => {
    const map: Record<string, { count: number; revenue: number }> = {};
    for (const o of completed) {
      const n = (o.network ?? "other").toUpperCase();
      if (!map[n]) map[n] = { count: 0, revenue: 0 };
      map[n].count++;
      map[n].revenue += Number(o.amount);
    }
    const NET_COLORS: Record<string, string> = { MTN: "#f59e0b", TELECEL: "#ef4444", AIRTELTIGO: "#3b82f6" };
    const total = completed.length || 1;
    return Object.entries(map).sort((a, b) => b[1].count - a[1].count).map(([net, v]) => ({
      net, count: v.count, revenue: v.revenue, pct: (v.count / total) * 100,
      color: NET_COLORS[net] ?? "#6b7280",
    }));
  }, [completed]);

  // Peak hours
  const peakHours = useMemo(() => {
    const hours: number[] = Array(24).fill(0);
    for (const o of completed) hours[new Date(o.created_at).getHours()]++;
    const HOUR_COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b"];
    const max = Math.max(...hours, 1);
    return hours.map((v, h) => ({
      label: `${h.toString().padStart(2, "0")}:00`,
      value: v,
      color: HOUR_COLORS[Math.floor((v / max) * (HOUR_COLORS.length - 1))],
    })).filter((_, i) => i % 2 === 0);
  }, [completed]);

  // Order status breakdown
  const byStatus = useMemo(() => {
    const c: Record<string, number> = { completed: 0, processing: 0, pending: 0, failed: 0 };
    for (const o of filtered) c[o.status?.toLowerCase() as keyof typeof c] = (c[o.status?.toLowerCase() as keyof typeof c] ?? 0) + 1;
    return c;
  }, [filtered]);

  const PERIOD_LABELS: Record<Period, string> = { today: "Today", week: "This Week", month: "This Month", year: "This Year", all: "All Time" };
  const NET_BADGE: Record<string, { bg: string; color: string }> = {
    MTN: { bg: "#78350f", color: "#fbbf24" }, TELECEL: { bg: "#7f1d1d", color: "#fca5a5" },
    AIRTELTIGO: { bg: "#4c1d95", color: "#c4b5fd" },
  };

  return (
    <div className="space-y-5">

      {/* Header + period tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-white">Product Analytics</h1>
          <p className="text-xs text-slate-500 mt-0.5">Sales performance and bundle insights</p>
        </div>
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: BG, border: `1px solid ${BORDER}` }}>
          {(["today","week","month","year","all"] as Period[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
              style={period === p
                ? { background: "#1e3a5f", color: "#60a5fa" }
                : { color: "#475569" }}>
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Revenue",        value: `GH₵${totalRevenue.toFixed(2)}`,    color: "#60a5fa", icon: "💰" },
          { label: "Orders",         value: totalOrders.toLocaleString(),         color: "#4ade80", icon: "🛒" },
          { label: "Avg Order",      value: `GH₵${avgOrderVal.toFixed(2)}`,      color: "#a78bfa", icon: "📊" },
          { label: "Data Sold",      value: fmtGB(totalDataGB),                   color: "#fb923c", icon: "📡" },
          { label: "Completion",     value: `${completionRate.toFixed(1)}%`,      color: "#34d399", icon: "✅" },
          { label: "Admin Profit",   value: `GH₵${totalProfit.toFixed(2)}`,      color: "#f472b6", icon: "📈" },
          { label: "Customers",      value: uniqueCustomers.toLocaleString(),     color: "#fbbf24", icon: "👥" },
          { label: "Failed Orders",  value: (byStatus.failed ?? 0).toLocaleString(), color: "#f87171", icon: "❌" },
        ].map(k => (
          <div key={k.label} className="rounded-2xl border p-4" style={{ background: CARD, borderColor: BORDER }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">{k.icon}</span>
              <p className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">{k.label}</p>
            </div>
            <p className="text-xl font-black" style={{ color: k.color }}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Revenue chart */}
      <div className="rounded-2xl border p-5" style={{ background: CARD, borderColor: BORDER }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="font-bold text-white">Revenue Trend</p>
            <p className="text-xs text-slate-500">{PERIOD_LABELS[period]}</p>
          </div>
          <p className="text-lg font-black text-white">GH₵{totalRevenue.toFixed(2)}</p>
        </div>
        <LineChart data={revenueChart} />
      </div>

      {/* Top Products */}
      <div className="rounded-2xl border p-5" style={{ background: CARD, borderColor: BORDER }}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="font-bold text-white">Top Products</p>
            <p className="text-xs text-slate-500">Best-selling bundles — {PERIOD_LABELS[period].toLowerCase()}</p>
          </div>
          <p className="text-xs font-semibold text-slate-400">{completed.length} sales</p>
        </div>
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Donut */}
          <div className="shrink-0 flex flex-col items-center">
            <DonutChart slices={topProducts.map(p => ({ pct: p.pct, color: p.color }))} total={completed.length} />
          </div>
          {/* Table */}
          <div className="flex-1 min-w-0">
            <div className="space-y-2">
              {topProducts.length === 0 && (
                <p className="text-sm text-slate-600 text-center py-6">No sales data for this period</p>
              )}
              {topProducts.map((p, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl p-3" style={{ background: BG }}>
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-bold text-white truncate">{p.label}</p>
                      {p.net && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded shrink-0"
                          style={{ background: NET_BADGE[p.net]?.bg ?? "#1e3050", color: NET_BADGE[p.net]?.color ?? "#94a3b8" }}>
                          {p.net}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-1 rounded-full" style={{ background: "#1e3a5f" }}>
                        <div className="h-full rounded-full" style={{ width: `${Math.min(p.pct, 100)}%`, background: p.color }} />
                      </div>
                      <span className="text-[10px] font-bold text-slate-400 w-8 text-right shrink-0">{p.pct.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-black text-white">{p.count}</p>
                    <p className="text-[9px] text-slate-500">GH₵{p.revenue.toFixed(0)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Network breakdown + Peak hours */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Network */}
        <div className="rounded-2xl border p-5" style={{ background: CARD, borderColor: BORDER }}>
          <p className="font-bold text-white mb-4">Network Breakdown</p>
          <div className="space-y-3">
            {byNetwork.length === 0 && <p className="text-sm text-slate-600 text-center py-4">No data</p>}
            {byNetwork.map(n => (
              <div key={n.net}>
                <div className="flex justify-between text-sm mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: n.color }} />
                    <span className="font-semibold text-white">{n.net}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-black text-white text-xs">{n.pct.toFixed(1)}%</span>
                    <span className="text-[10px] text-slate-500 ml-2">{n.count} orders</span>
                  </div>
                </div>
                <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: BORDER }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.min(n.pct, 100)}%`, background: n.color }} />
                </div>
                <p className="text-[10px] text-slate-500 mt-1">GH₵{n.revenue.toFixed(2)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Peak Hours */}
        <div className="rounded-2xl border p-5" style={{ background: CARD, borderColor: BORDER }}>
          <p className="font-bold text-white mb-1">Peak Hours</p>
          <p className="text-xs text-slate-500 mb-4">When customers buy most</p>
          {peakHours.every(h => h.value === 0)
            ? <p className="text-sm text-slate-600 text-center py-8">No data for this period</p>
            : <HBarChart data={peakHours} />}
        </div>
      </div>

      {/* Order status */}
      <div className="rounded-2xl border p-5" style={{ background: CARD, borderColor: BORDER }}>
        <p className="font-bold text-white mb-4">Order Status — {PERIOD_LABELS[period]}</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Completed",  key: "completed",  color: "#4ade80" },
            { label: "Processing", key: "processing", color: "#60a5fa" },
            { label: "Pending",    key: "pending",    color: "#fbbf24" },
            { label: "Failed",     key: "failed",     color: "#f87171" },
          ].map(s => {
            const val = byStatus[s.key] ?? 0;
            const pct = totalOrders ? (val / totalOrders) * 100 : 0;
            return (
              <div key={s.label} className="rounded-xl border p-4 text-center" style={{ background: BG, borderColor: BORDER }}>
                <p className="text-3xl font-black mb-1" style={{ color: s.color }}>{val.toLocaleString()}</p>
                <p className="text-sm font-semibold text-white">{s.label}</p>
                <p className="text-xs text-slate-500">{pct.toFixed(1)}% of total</p>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
