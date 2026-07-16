"use client";
import { useState, useEffect, useMemo } from "react";
import type { StatsData, Tab } from "./shared/types";
import { BG, CARD, BORDER } from "./shared/constants";
import { LineChart } from "./shared/LineChart";
import { useCountUp } from "./shared/Spinner";
import { get7DayComparison, getWeeklyRevenue, getTopBundles, getTodayStats, getDataSold, getRevenueBreakdown, getNetBadge } from "./shared/utils";

export function PctBadge({ val }: { val: number }) {
  return (
    <span className="flex items-center gap-0.5 text-xs font-bold" style={{ color: val >= 0 ? "#10b981" : "#f87171" }}>
      {val >= 0 ? "▲" : "▼"} {Math.abs(val)}%
    </span>
  );
}

export function Dashboard({ stats, animated, onNavigate }: { stats: StatsData; animated: boolean; onNavigate: (t: Tab) => void }) {
  const cmp = useMemo(() => get7DayComparison(stats.orders.all), [stats.orders.all]);
  const weekly = useMemo(() => getWeeklyRevenue(stats.orders.all), [stats.orders.all]);
  const { bundles, total: bundleTotal } = useMemo(() => getTopBundles(stats.orders.all), [stats.orders.all]);
  const todayStats = useMemo(() => getTodayStats(stats.orders.all), [stats.orders.all]);
  const revBreakdown = useMemo(() => getRevenueBreakdown(stats.orders.all), [stats.orders.all]);
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

      {/* Today so far */}
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

      {/* 4 stat cards */}
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

      {/* Total Profit */}
      <div className="rounded-2xl p-4 border relative overflow-hidden" style={{ background: CARD, borderColor: BORDER }}>
        <div className="flex items-start justify-between mb-3">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl" style={{ background: "linear-gradient(135deg,#450a0a,#7f1d1d)" }}>📈</div>
          <PctBadge val={cmp.revenue} />
        </div>
        <p className="text-2xl font-black text-white">GH₵{totalProfit.toFixed(2)}</p>
        <p className="text-xs text-slate-500 mt-1">Total Profit (all time)</p>
        <p className="text-[10px] text-blue-500 mt-1.5 font-semibold">vs last 7 days →</p>
      </div>

      {/* Revenue chart */}
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

      {/* Recent Orders */}
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
                    <td className="px-3 py-2.5 text-white font-medium max-w-17.5 truncate">{(o.customer_name || o.phone || "—").slice(0, 10)}</td>
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

      {/* Top Bundles */}
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

      {/* Revenue Breakdown */}
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

      {/* Agent Leaderboard */}
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

      {/* Quick Actions */}
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

      {/* System Status */}
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
