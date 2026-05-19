"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";

type Tab = "overview" | "orders" | "agents" | "prices";
type OrderStatus = "ALL" | "COMPLETED" | "PROCESSING" | "PENDING" | "FAILED";

interface Order {
  reference: string; status: string; amount: number; admin_commission: number;
  agent_commission: number; customer_name: string; phone: string; network: string;
  bundle_size: string; created_at: string; agent_id: string | null;
}
interface Agent {
  id: string; name: string; email: string; phone: string; whatsapp?: string; business_name: string;
  referral_code: string; status: string; commission_balance: number; total_sales: number;
  total_revenue: number; created_at: string;
}
interface StatsData {
  orders: { all: Order[]; total: number; completed: number; processing: number; pending: number; failed: number; };
  revenue: { total: number; cost: number };
  profit: { admin: number; agentCommissions: number; gross: number };
  agents: { all: Agent[]; total: number; pending: number; approved: number; rejected: number; };
}
interface BundleRow {
  id: string; network: string; size: string; sizeGB: number; validity: string;
  price: number; costPrice: number; hasOverride: boolean; active: boolean;
}

const PAGE_SIZE = 50;

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning ☀️";
  if (h < 17) return "Good Afternoon 🌤️";
  if (h < 21) return "Good Evening 🌆";
  return "Good Night 🌙";
}

function getThisMonthOrders(orders: Order[]) {
  const now = new Date();
  return orders.filter((o) => {
    const d = new Date(o.created_at);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;
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
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration, active]);
  return value;
}

function getMonthly(orders: Order[]) {
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return { label: d.toLocaleString("en", { month: "short" }), revenue: 0, profit: 0, count: 0 };
  });
  for (const o of orders) {
    const d = new Date(o.created_at);
    const ago = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
    if (ago >= 0 && ago <= 5) {
      const idx = 5 - ago;
      months[idx].revenue += Number(o.amount) || 0;
      months[idx].profit += Number(o.admin_commission) || 0;
      months[idx].count += 1;
    }
  }
  return months;
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const IconHome = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
);
const IconOrders = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
  </svg>
);
const IconAgents = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);
const IconPrices = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
  </svg>
);
const IconCart = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
);
const IconWallet = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
  </svg>
);
const IconTrend = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
  </svg>
);
const IconSignout = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
  </svg>
);
const IconWhatsApp = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.526 5.845L.057 23.882l6.174-1.447A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.797 9.797 0 01-5.003-1.372l-.36-.213-3.664.86.902-3.559-.234-.375A9.797 9.797 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z" />
  </svg>
);

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({ tab, setTab, pendingAgents, onLogout, mobileOpen, onMobileClose }: {
  tab: Tab; setTab: (t: Tab) => void; pendingAgents: number; onLogout: () => void;
  mobileOpen: boolean; onMobileClose: () => void;
}) {
  const nav = [
    { id: "overview" as Tab, label: "Dashboard", icon: <IconHome /> },
    { id: "orders" as Tab, label: "Orders", icon: <IconOrders /> },
    { id: "agents" as Tab, label: "Agents", icon: <IconAgents />, badge: pendingAgents || undefined },
    { id: "prices" as Tab, label: "Bundles", icon: <IconPrices /> },
  ];
  return (
    <aside className={`fixed inset-y-0 left-0 z-50 w-60 flex flex-col border-r border-[#1e3050] transition-transform duration-300 ${mobileOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`} style={{ background: "#0b1120" }}>
      {/* Mobile close button */}
      <button onClick={onMobileClose} className="md:hidden absolute top-4 right-4 text-slate-400 hover:text-white transition-colors">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Logo */}
      <div className="px-5 pt-6 pb-5 border-b border-[#1e3050]">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-white text-sm"
            style={{ background: "linear-gradient(135deg,#3b82f6,#8b5cf6)" }}>E</div>
          <div>
            <p className="font-black text-white text-sm leading-none">EliteData</p>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5">PLATFORM</p>
          </div>
        </div>
      </div>

      {/* Admin profile card */}
      <div className="mx-3 mt-4 rounded-xl p-3 border border-[#1e3050]" style={{ background: "#162032" }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center font-black text-white text-sm shrink-0"
            style={{ background: "linear-gradient(135deg,#3b82f6,#8b5cf6)" }}>A</div>
          <div className="min-w-0">
            <p className="text-white font-bold text-sm leading-none truncate">Admin</p>
            <p className="text-slate-500 text-[11px] mt-0.5 truncate">Elite Data</p>
          </div>
        </div>
        <div className="mt-2">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#1e3a5f", color: "#60a5fa" }}>admin</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {nav.map((n) => {
          const active = tab === n.id;
          return (
            <button key={n.id} onClick={() => { setTab(n.id); onMobileClose(); }}
              className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left"
              style={active ? { background: "linear-gradient(90deg,#3b82f6,#8b5cf6)", color: "#fff" } : { color: "#94a3b8" }}
              onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "#162032"; }}
              onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = ""; }}>
              <span className="flex items-center gap-3">
                {n.icon}
                {n.label}
              </span>
              {n.badge ? (
                <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-amber-400 text-gray-900">{n.badge}</span>
              ) : active ? (
                <svg className="w-4 h-4 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              ) : null}
            </button>
          );
        })}
      </nav>

      {/* Bottom links */}
      <div className="px-3 pb-5 space-y-0.5 border-t border-[#1e3050] pt-4">
        <a href="https://wa.me/233509794503" target="_blank" rel="noreferrer"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 transition-all"
          style={{ color: "#4ade80" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "#162032"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = ""; }}>
          <IconWhatsApp />
          WhatsApp Support
        </a>
        <div className="flex items-center gap-3 px-3 py-2 text-sm text-slate-500">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
          +233 509 794 503
        </div>
        <button onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 transition-all"
          style={{ color: "#f87171" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#1f1212"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = ""; }}>
          <IconSignout />
          Sign Out
        </button>
      </div>
    </aside>
  );
}

// ─── Overview ─────────────────────────────────────────────────────────────────
function Overview({ stats, animated, onNavigate }: { stats: StatsData; animated: boolean; onNavigate: (t: Tab) => void }) {
  const revenue = useCountUp(Math.round(stats.revenue.total), 1200, animated);
  const totalOrders = useCountUp(stats.orders.total, 900, animated);
  const profit = useCountUp(Math.round(stats.profit.admin), 1200, animated);
  const thisMonth = useCountUp(getThisMonthOrders(stats.orders.all), 800, animated);
  const [apiBalance, setApiBalance] = useState<{ balance: number | null; error?: string }>({ balance: null });

  useEffect(() => {
    fetch("/api/admin/inventor-balance")
      .then((r) => r.json())
      .then((d) => setApiBalance(d))
      .catch(() => setApiBalance({ balance: null, error: "Could not fetch balance" }));
  }, []);

  const monthly = getMonthly(stats.orders.all);
  const maxRev = Math.max(...monthly.map((m) => m.revenue), 1);

  return (
    <div className="space-y-5">
      {/* Row 1 — Revenue card + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Revenue hero card */}
        <div className="lg:col-span-3 rounded-2xl p-6 border border-[#1e3050] relative overflow-hidden" style={{ background: "#162032" }}>
          <div className="absolute top-0 right-0 w-48 h-48 rounded-full opacity-10 blur-3xl"
            style={{ background: "linear-gradient(135deg,#3b82f6,#8b5cf6)", transform: "translate(30%,-30%)" }} />
          <div className="flex items-start justify-between mb-4 relative">
            <div>
              <p className="text-slate-400 text-sm font-medium">Total Revenue</p>
              <p className="text-4xl font-black text-white mt-1">GH₵{revenue.toLocaleString()}</p>
              <p className="text-slate-500 text-sm mt-1">Gross profit: GH₵{Math.round(stats.profit.gross).toLocaleString()}</p>
            </div>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center border border-[#1e3050]" style={{ background: "#1e2d45" }}>
              <IconWallet />
            </div>
          </div>
          <div className="relative grid grid-cols-3 gap-3 mt-5">
            {[
              { label: "Cost", value: `GH₵${Math.round(stats.revenue.cost).toLocaleString()}`, color: "#f87171" },
              { label: "Admin Profit", value: `GH₵${Math.round(stats.profit.admin).toLocaleString()}`, color: "#4ade80" },
              { label: "Agent Payouts", value: `GH₵${Math.round(stats.profit.agentCommissions).toLocaleString()}`, color: "#a78bfa" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl p-3 border border-[#1e3050]" style={{ background: "#0e1928" }}>
                <p className="text-xs text-slate-500 mb-1">{s.label}</p>
                <p className="font-black text-sm" style={{ color: s.color }}>{s.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Quick actions */}
        <div className="lg:col-span-2 rounded-2xl p-6 border border-[#1e3050]" style={{ background: "#162032" }}>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg,#3b82f6,#8b5cf6)" }}>
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <p className="text-white font-black text-base">Quick Actions</p>
              <p className="text-slate-500 text-xs">Common admin shortcuts</p>
            </div>
          </div>
          <div className="space-y-2.5 mt-5">
            <button onClick={() => onNavigate("orders")}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-white font-semibold text-sm transition-all hover:opacity-90"
              style={{ background: "linear-gradient(90deg,#3b82f6,#8b5cf6)" }}>
              <span className="flex items-center gap-2"><IconOrders /> View All Orders</span>
              <span>→</span>
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => onNavigate("agents")}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-300 border border-[#1e3050] hover:border-blue-600 hover:text-blue-400 transition-all"
                style={{ background: "#0e1928" }}>
                <IconAgents /> Agents
              </button>
              <button onClick={() => onNavigate("prices")}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-300 border border-[#1e3050] hover:border-purple-500 hover:text-purple-400 transition-all"
                style={{ background: "#0e1928" }}>
                <IconPrices /> Prices
              </button>
            </div>
            {stats.agents.pending > 0 && (
              <button onClick={() => onNavigate("agents")}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-semibold text-amber-300 border border-amber-500/30 hover:border-amber-400 transition-all"
                style={{ background: "#1a1500" }}>
                <span className="flex items-center gap-2">
                  <span className="text-base">⚡</span>
                  {stats.agents.pending} pending agent{stats.agents.pending > 1 ? "s" : ""} to review
                </span>
                <span>→</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Row 2 — Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Orders", value: String(totalOrders), sub: "All time purchases", icon: <IconCart />, iconBg: "#1e3a5f", iconColor: "#3b82f6" },
          { label: "Admin Profit", value: `GH₵${profit.toLocaleString()}`, sub: "Your earnings", icon: <IconWallet />, iconBg: "#14302a", iconColor: "#10b981" },
          { label: "This Month", value: String(thisMonth), sub: "Orders this month", icon: <IconTrend />, iconBg: "#2a1a3a", iconColor: "#a78bfa" },
          { label: "Active Agents", value: String(stats.agents.approved), sub: `${stats.agents.pending} pending approval`, icon: <IconAgents />, iconBg: "#2a200a", iconColor: "#f59e0b" },
        ].map((c, i) => (
          <div key={c.label} className="rounded-2xl p-5 border border-[#1e3050]" style={{ background: "#162032", animation: `slideUp .35s ease both`, animationDelay: `${i * 60}ms` }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">{c.label}</p>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: c.iconBg, color: c.iconColor }}>
                {c.icon}
              </div>
            </div>
            <p className="text-2xl font-black text-white">{c.value}</p>
            <p className="text-xs text-slate-500 mt-1">{c.sub}</p>
          </div>
        ))}
        {/* API Balance card */}
        <div className="rounded-2xl p-5 border border-[#1e3050]" style={{ background: "#162032", animation: `slideUp .35s ease both`, animationDelay: `${4 * 60}ms` }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">API Balance</p>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "#0a2a1f", color: "#34d399" }}>
              <IconWallet />
            </div>
          </div>
          <p className="text-2xl font-black text-white">
            {apiBalance.balance !== null ? `GH₵${Number(apiBalance.balance).toLocaleString()}` : "—"}
          </p>
          <p className="text-xs text-slate-500 mt-1">Inventor DataHub</p>
        </div>
      </div>

      {/* Row 3 — Monthly chart + status breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 rounded-2xl p-5 border border-[#1e3050]" style={{ background: "#162032" }}>
          <p className="font-bold text-white mb-0.5">Monthly Revenue</p>
          <p className="text-xs text-slate-500 mb-5">Last 6 months — revenue vs profit</p>
          <div className="flex items-end gap-3 h-36">
            {monthly.map((m, i) => (
              <div key={m.label} className="flex-1 flex flex-col items-center gap-2">
                <div className="w-full flex items-end gap-0.5 h-28">
                  <div className="flex-1 flex flex-col justify-end rounded-t overflow-hidden">
                    <div className="w-full rounded-t transition-all duration-700"
                      style={{ height: animated ? `${(m.revenue / maxRev) * 100}%` : "0%", background: "linear-gradient(180deg,#3b82f6,#1d4ed8)", transitionDelay: `${i * 80}ms`, minHeight: m.revenue > 0 ? 3 : 0 }} />
                  </div>
                  <div className="flex-1 flex flex-col justify-end rounded-t overflow-hidden">
                    <div className="w-full rounded-t transition-all duration-700"
                      style={{ height: animated ? `${(m.profit / maxRev) * 100}%` : "0%", background: "linear-gradient(180deg,#10b981,#065f46)", transitionDelay: `${i * 80 + 40}ms`, minHeight: m.profit > 0 ? 3 : 0 }} />
                  </div>
                </div>
                <span className="text-[11px] text-slate-500 font-medium">{m.label}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-4 mt-3 pt-3 border-t border-[#1e3050] text-xs font-medium">
            <span className="flex items-center gap-1.5 text-slate-400"><span className="w-3 h-2 rounded-sm inline-block" style={{ background: "#3b82f6" }} />Revenue</span>
            <span className="flex items-center gap-1.5 text-slate-400"><span className="w-3 h-2 rounded-sm inline-block" style={{ background: "#10b981" }} />Profit</span>
          </div>
        </div>

        {/* Status breakdown */}
        <div className="rounded-2xl p-5 border border-[#1e3050]" style={{ background: "#162032" }}>
          <p className="font-bold text-white mb-5">Order Status</p>
          <div className="space-y-4">
            {[
              { label: "Completed", value: stats.orders.completed, total: stats.orders.total, color: "#10b981", bg: "#14302a" },
              { label: "Processing", value: stats.orders.processing, total: stats.orders.total, color: "#3b82f6", bg: "#1e3a5f" },
              { label: "Pending", value: stats.orders.pending, total: stats.orders.total, color: "#f59e0b", bg: "#2a200a" },
              { label: "Failed", value: stats.orders.failed, total: stats.orders.total, color: "#f87171", bg: "#2a0f0f" },
            ].map((s) => (
              <div key={s.label}>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-slate-400 font-medium">{s.label}</span>
                  <span className="font-black text-white">{s.value}</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#0e1928" }}>
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: animated ? `${((s.value / (s.total || 1)) * 100)}%` : "0%", background: s.color }} />
                </div>
              </div>
            ))}
          </div>

          {/* Network split */}
          <p className="font-bold text-white mt-6 mb-4">Network Split</p>
          <div className="space-y-3">
            {[
              { name: "MTN", color: "#facc15", count: stats.orders.all.filter((o) => o.network.toLowerCase() === "mtn").length },
              { name: "Telecel", color: "#f87171", count: stats.orders.all.filter((o) => o.network.toLowerCase() === "telecel").length },
              { name: "AirtelTigo", color: "#fb7185", count: stats.orders.all.filter((o) => o.network.toLowerCase() === "airteltigo").length },
            ].map((n) => {
              const max = stats.orders.total || 1;
              return (
                <div key={n.name}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">{n.name}</span>
                    <span className="text-slate-300 font-semibold">{n.count}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#0e1928" }}>
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: animated ? `${(n.count / max) * 100}%` : "0%", background: n.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Row 4 — Recent orders */}
      <div className="rounded-2xl border border-[#1e3050] overflow-hidden" style={{ background: "#162032" }}>
        <div className="px-5 py-4 border-b border-[#1e3050] flex items-center justify-between">
          <p className="font-bold text-white">Recent Orders</p>
          <button onClick={() => onNavigate("orders")} className="text-xs text-blue-400 hover:text-blue-300 font-semibold transition-colors">View all →</button>
        </div>
        {stats.orders.all.length === 0 ? (
          <p className="text-center text-slate-500 py-10">No orders yet</p>
        ) : (
          <div className="divide-y divide-[#1e3050]">
            {[...stats.orders.all].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 6).map((o) => {
              const dotColor: Record<string, string> = { COMPLETED: "#10b981", PROCESSING: "#3b82f6", PENDING: "#f59e0b", FAILED: "#f87171" };
              return (
                <div key={o.reference} className="flex items-center gap-4 px-5 py-3.5 hover:bg-[#1e3050]/30 transition-colors">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-xs font-black"
                    style={{ background: o.network.toLowerCase() === "mtn" ? "#78350f" : o.network.toLowerCase() === "telecel" ? "#7f1d1d" : "#881337", color: o.network.toLowerCase() === "mtn" ? "#fbbf24" : "#fca5a5" }}>
                    {o.network.toUpperCase().slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{o.customer_name}</p>
                    <p className="text-xs text-slate-500">{o.network.toUpperCase()} {o.bundle_size} · {o.phone}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-black text-white">GH₵{Number(o.amount).toFixed(2)}</p>
                    <p className="text-xs text-slate-500">{new Date(o.created_at).toLocaleDateString("en-GH", { day: "2-digit", month: "short" })}</p>
                  </div>
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor[o.status] ?? "#6b7280" }} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Orders View ──────────────────────────────────────────────────────────────
function OrdersView({ orders, onRefresh }: { orders: Order[]; onRefresh: () => void }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatus>("ALL");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return orders.slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .filter((o) => {
        if (statusFilter !== "ALL" && o.status !== statusFilter) return false;
        if (!q) return true;
        return o.customer_name.toLowerCase().includes(q) || o.phone.includes(q) || o.reference.toLowerCase().includes(q) || o.network.toLowerCase().includes(q);
      });
  }, [orders, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageOrders = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [search, statusFilter]);

  const counts: Record<OrderStatus, number> = {
    ALL: orders.length,
    COMPLETED: orders.filter((o) => o.status === "COMPLETED").length,
    PROCESSING: orders.filter((o) => o.status === "PROCESSING").length,
    PENDING: orders.filter((o) => o.status === "PENDING").length,
    FAILED: orders.filter((o) => o.status === "FAILED").length,
  };

  const tabDefs: { key: OrderStatus; color: string }[] = [
    { key: "ALL", color: "#3b82f6" },
    { key: "COMPLETED", color: "#10b981" },
    { key: "PROCESSING", color: "#3b82f6" },
    { key: "PENDING", color: "#f59e0b" },
    { key: "FAILED", color: "#f87171" },
  ];

  const statusDot: Record<string, string> = { COMPLETED: "#10b981", PROCESSING: "#3b82f6", PENDING: "#f59e0b", FAILED: "#f87171" };
  const statusBg: Record<string, string> = {
    COMPLETED: "rgba(16,185,129,0.1)", PROCESSING: "rgba(59,130,246,0.1)", PENDING: "rgba(245,158,11,0.1)", FAILED: "rgba(248,113,113,0.1)",
  };

  const netBadge: Record<string, { bg: string; color: string }> = {
    mtn: { bg: "#78350f", color: "#fbbf24" },
    telecel: { bg: "#7f1d1d", color: "#fca5a5" },
    airteltigo: { bg: "#881337", color: "#fda4af" },
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-white">All Orders</h1>
          <p className="text-sm text-slate-500">{orders.length.toLocaleString()} total · {filtered.length.toLocaleString()} shown</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">🔍</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, phone, ref…"
              className="pl-9 pr-4 py-2 text-sm rounded-xl border border-[#1e3050] focus:outline-none focus:border-blue-500 w-56 text-white placeholder-slate-600"
              style={{ background: "#162032" }} />
          </div>
          <button onClick={onRefresh} className="flex items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-white border border-[#1e3050] px-3 py-2 rounded-xl transition-colors"
            style={{ background: "#162032" }}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 overflow-x-auto">
        {tabDefs.map(({ key, color }) => {
          const active = statusFilter === key;
          return (
            <button key={key} onClick={() => setStatusFilter(key)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all border"
              style={active
                ? { background: `${color}20`, color, borderColor: `${color}50` }
                : { background: "#162032", color: "#64748b", borderColor: "#1e3050" }}>
              {key === "ALL" ? "All" : key.charAt(0) + key.slice(1).toLowerCase()}
              <span className="text-[11px] px-1.5 py-0.5 rounded-full font-black"
                style={{ background: active ? `${color}30` : "#1e3050", color: active ? color : "#475569" }}>
                {counts[key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-[#1e3050] overflow-hidden" style={{ background: "#162032" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e3050] text-xs text-slate-500 uppercase tracking-wider" style={{ background: "#0e1928" }}>
                {["#", "Customer", "Network", "Phone", "Amount", "Profit", "Source", "Status", "Date"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageOrders.map((o, idx) => {
                const net = o.network.toLowerCase();
                const nb = netBadge[net] ?? { bg: "#1e293b", color: "#94a3b8" };
                return (
                  <tr key={o.reference} className="border-b border-[#1e3050]/50 hover:bg-[#1e3050]/30 transition-colors last:border-0">
                    <td className="px-4 py-3.5 text-slate-600 text-xs font-mono">
                      {((page - 1) * PAGE_SIZE) + idx + 1}
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-white whitespace-nowrap">{o.customer_name}</p>
                      <p className="text-[11px] text-slate-500 font-mono mt-0.5">{o.reference.slice(0, 12)}…</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black px-2 py-0.5 rounded" style={{ background: nb.bg, color: nb.color }}>
                          {o.network.toUpperCase()}
                        </span>
                        <span className="text-slate-400 text-xs">{o.bundle_size}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs text-slate-400">{o.phone}</td>
                    <td className="px-4 py-3.5 font-black text-white">GH₵{Number(o.amount).toFixed(2)}</td>
                    <td className="px-4 py-3.5 font-black" style={{ color: "#4ade80" }}>GH₵{Number(o.admin_commission).toFixed(2)}</td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={o.agent_id
                          ? { background: "rgba(139,92,246,0.15)", color: "#a78bfa", border: "1px solid rgba(139,92,246,0.3)" }
                          : { background: "#1e3050", color: "#64748b" }}>
                        {o.agent_id ? "Agent" : "Direct"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
                        style={{ background: statusBg[o.status] ?? "transparent", color: statusDot[o.status] ?? "#94a3b8" }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusDot[o.status] ?? "#94a3b8" }} />
                        {o.status.charAt(0) + o.status.slice(1).toLowerCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 text-xs whitespace-nowrap">
                      {new Date(o.created_at).toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {pageOrders.length === 0 && (
            <div className="py-20 text-center">
              <p className="text-4xl mb-3">📭</p>
              <p className="font-semibold text-slate-500">No orders match your filter</p>
            </div>
          )}
        </div>
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-[#1e3050] flex items-center justify-between" style={{ background: "#0e1928" }}>
            <p className="text-xs text-slate-500">
              {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length.toLocaleString()}
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#1e3050] text-slate-400 hover:text-white disabled:opacity-40 transition-colors"
                style={{ background: "#162032" }}>← Prev</button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                const pg = totalPages <= 7 ? i + 1 : page <= 4 ? i + 1 : page >= totalPages - 3 ? totalPages - 6 + i : page - 3 + i;
                return (
                  <button key={pg} onClick={() => setPage(pg)}
                    className="w-8 h-8 text-xs font-semibold rounded-lg transition-colors"
                    style={pg === page ? { background: "linear-gradient(90deg,#3b82f6,#8b5cf6)", color: "#fff" } : { background: "#162032", color: "#64748b", border: "1px solid #1e3050" }}>
                    {pg}
                  </button>
                );
              })}
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#1e3050] text-slate-400 hover:text-white disabled:opacity-40 transition-colors"
                style={{ background: "#162032" }}>Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Agents View ──────────────────────────────────────────────────────────────
function AgentsView({ stats, onRefresh }: { stats: StatsData; onRefresh: () => void }) {
  const [agentTab, setAgentTab] = useState<"pending" | "approved">("pending");
  const [agentAction, setAgentAction] = useState<{ id: string; name: string; action: "approve" | "reject" } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  async function handleAction() {
    if (!agentAction) return;
    setActionLoading(true);
    await fetch(`/api/agents/${agentAction.id}/status`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: agentAction.action }),
    });
    setAgentAction(null); setActionLoading(false); onRefresh();
  }

  const shown = stats.agents.all.filter((a) => a.status === agentTab);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-black text-white">Agents</h1>
        <p className="text-sm text-slate-500">{stats.agents.approved} active · {stats.agents.pending} awaiting approval</p>
      </div>

      <div className="flex gap-1">
        {(["pending", "approved"] as const).map((s) => {
          const active = agentTab === s;
          const color = s === "approved" ? "#10b981" : "#f59e0b";
          const count = stats.agents.all.filter((a) => a.status === s).length;
          return (
            <button key={s} onClick={() => setAgentTab(s)}
              className="px-4 py-2 rounded-xl text-sm font-semibold capitalize border transition-all"
              style={active ? { background: `${color}20`, color, borderColor: `${color}50` } : { background: "#162032", color: "#64748b", borderColor: "#1e3050" }}>
              {s === "pending" ? "Pending Approval" : "Approved"} ({count})
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-[#1e3050] overflow-hidden" style={{ background: "#162032" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e3050] text-xs text-slate-500 uppercase tracking-wider" style={{ background: "#0e1928" }}>
                <th className="px-4 py-3 text-left font-semibold">Name</th>
                <th className="px-4 py-3 text-left font-semibold">Email</th>
                <th className="px-4 py-3 text-left font-semibold">Phone</th>
                <th className="px-4 py-3 text-left font-semibold">WhatsApp</th>
                <th className="px-4 py-3 text-left font-semibold">Business</th>
                {agentTab === "approved" && <>
                  <th className="px-4 py-3 text-left font-semibold">Sales</th>
                  <th className="px-4 py-3 text-left font-semibold">Balance</th>
                  <th className="px-4 py-3 text-left font-semibold">Ref Code</th>
                </>}
                {agentTab === "pending" && <th className="px-4 py-3 text-left font-semibold">Applied</th>}
                <th className="px-4 py-3 text-left font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((a) => (
                <tr key={a.id} className="border-b border-[#1e3050]/50 last:border-0 hover:bg-[#1e3050]/30 transition-colors">
                  <td className="px-4 py-3.5 font-semibold text-white">{a.name}</td>
                  <td className="px-4 py-3.5 text-slate-400 text-xs">{a.email}</td>
                  <td className="px-4 py-3.5 font-mono text-xs text-slate-400">{a.phone}</td>
                  <td className="px-4 py-3.5 text-xs">
                    {a.whatsapp ? (
                      <a href={`https://wa.me/${a.whatsapp.replace(/^0/, "233")}`}
                        target="_blank" rel="noreferrer" className="text-green-400 hover:text-green-300 font-mono">
                        {a.whatsapp}
                      </a>
                    ) : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-4 py-3.5 text-slate-500 text-xs">{a.business_name || "—"}</td>
                  {agentTab === "approved" && <>
                    <td className="px-4 py-3.5 font-bold text-white">{a.total_sales}</td>
                    <td className="px-4 py-3.5 font-black" style={{ color: "#4ade80" }}>GH₵{(a.commission_balance ?? 0).toFixed(2)}</td>
                    <td className="px-4 py-3.5 font-mono text-xs font-bold" style={{ color: "#60a5fa" }}>{a.referral_code}</td>
                  </>}
                  {agentTab === "pending" && (
                    <td className="px-4 py-3.5 text-slate-500 text-xs">{new Date(a.created_at).toLocaleDateString("en-GH")}</td>
                  )}
                  <td className="px-4 py-3.5">
                    {agentTab === "pending" && (
                      <div className="flex gap-2">
                        <button onClick={() => setAgentAction({ id: a.id, name: a.name, action: "approve" })}
                          className="text-xs font-bold px-3 py-1.5 rounded-lg text-white transition-colors"
                          style={{ background: "linear-gradient(90deg,#059669,#10b981)" }}>Approve</button>
                        <button onClick={() => setAgentAction({ id: a.id, name: a.name, action: "reject" })}
                          className="text-xs font-bold px-3 py-1.5 rounded-lg text-white transition-colors"
                          style={{ background: "linear-gradient(90deg,#dc2626,#f87171)" }}>Decline</button>
                      </div>
                    )}
                    {agentTab === "approved" && (
                      <button onClick={() => setAgentAction({ id: a.id, name: a.name, action: "reject" })}
                        className="text-xs font-semibold transition-colors" style={{ color: "#f87171" }}>Remove</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && (
            <div className="py-16 text-center">
              <p className="text-4xl mb-3">{agentTab === "pending" ? "📭" : "👥"}</p>
              <p className="text-slate-500 font-semibold">
                {agentTab === "pending" ? "No pending applications" : "No approved agents yet"}
              </p>
            </div>
          )}
        </div>
      </div>

      {agentAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="rounded-2xl shadow-2xl w-full max-w-sm p-6 border border-[#1e3050]" style={{ background: "#162032" }}>
            <h3 className="font-black text-white text-lg mb-2">
              {agentAction.action === "approve" ? "Approve Agent" : "Decline & Remove Agent"}
            </h3>
            <p className="text-sm text-slate-400 mb-5">
              {agentAction.action === "approve"
                ? `Approve ${agentAction.name}? A unique referral code will be generated and they can start selling.`
                : `Remove ${agentAction.name}'s application? They will be permanently deleted and can re-apply.`}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setAgentAction(null)}
                className="flex-1 border border-[#1e3050] text-slate-400 font-semibold py-2.5 rounded-xl text-sm hover:text-white transition-colors">Cancel</button>
              <button onClick={handleAction} disabled={actionLoading}
                className="flex-1 text-white font-bold py-2.5 rounded-xl text-sm disabled:opacity-60"
                style={{ background: agentAction.action === "approve" ? "linear-gradient(90deg,#059669,#10b981)" : "linear-gradient(90deg,#dc2626,#f87171)" }}>
                {actionLoading ? "…" : agentAction.action === "approve" ? "Approve" : "Decline & Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Bundle Management View ───────────────────────────────────────────────────
function PricesView() {
  const [bundles, setBundles] = useState<BundleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<BundleRow | null>(null);
  const [editPrice, setEditPrice] = useState({ price: "", costPrice: "" });
  const [editMeta, setEditMeta] = useState({ sizeLabel: "", sizeGB: "", validity: "" });
  const [editLoading, setEditLoading] = useState(false);
  const [editMsg, setEditMsg] = useState("");
  const [search, setSearch] = useState("");
  const [networkFilter, setNetworkFilter] = useState<"all" | "mtn" | "telecel" | "airteltigo">("all");
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/bundles");
    const data = await res.json();
    setBundles(data.bundles ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { fetch_(); }, [fetch_]);

  async function handleSave() {
    if (!editing) return;
    if (!editPrice.price || !editPrice.costPrice || isNaN(parseFloat(editPrice.price)) || isNaN(parseFloat(editPrice.costPrice))) {
      setEditMsg("Enter valid numbers for both prices.");
      return;
    }
    if (editMeta.sizeGB && (isNaN(parseFloat(editMeta.sizeGB)) || parseFloat(editMeta.sizeGB) <= 0)) {
      setEditMsg("Size (GB) must be a positive number.");
      return;
    }
    setEditLoading(true); setEditMsg("");
    const body: Record<string, unknown> = {
      bundleId: editing.id,
      price: parseFloat(editPrice.price),
      costPrice: parseFloat(editPrice.costPrice),
      active: editing.active,
    };
    if (editMeta.sizeLabel.trim()) body.sizeLabel = editMeta.sizeLabel.trim();
    if (editMeta.sizeGB) body.sizeGB = parseFloat(editMeta.sizeGB);
    if (editMeta.validity.trim()) body.validity = editMeta.validity.trim();
    const res = await fetch("/api/admin/bundles", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.success) {
      setEditMsg(data.warning ? `Saved! Note: ${data.warning}` : "Saved!");
      fetch_();
      setTimeout(() => { setEditing(null); setEditMsg(""); }, 1500);
    }
    else setEditMsg(data.error || "Error");
    setEditLoading(false);
  }

  async function handleToggleActive(b: BundleRow) {
    setTogglingId(b.id);
    await fetch("/api/admin/bundles", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bundleId: b.id, active: !b.active }),
    });
    setBundles((prev) => prev.map((x) => x.id === b.id ? { ...x, active: !b.active } : x));
    setTogglingId(null);
  }

  const shown = bundles.filter((b) => {
    const q = search.toLowerCase();
    const matchNet = networkFilter === "all" || b.network.toLowerCase() === networkFilter;
    return matchNet && (!q || b.size.toLowerCase().includes(q));
  });

  const netBadge: Record<string, { bg: string; color: string }> = {
    mtn: { bg: "#78350f", color: "#fbbf24" },
    telecel: { bg: "#7f1d1d", color: "#fca5a5" },
    airteltigo: { bg: "#881337", color: "#fda4af" },
  };

  const totals = {
    active: bundles.filter((b) => b.active).length,
    inactive: bundles.filter((b) => !b.active).length,
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-white">Bundle Management</h1>
          <p className="text-sm text-slate-500">
            Edit prices, toggle visibility — {totals.active} active, {totals.inactive} hidden
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Network filter */}
          <div className="flex gap-1 rounded-xl p-1 border border-[#1e3050]" style={{ background: "#0e1928" }}>
            {(["all", "mtn", "telecel", "airteltigo"] as const).map((n) => (
              <button key={n} onClick={() => setNetworkFilter(n)}
                className="text-[11px] font-bold px-2.5 py-1 rounded-lg capitalize transition-all"
                style={networkFilter === n ? { background: "linear-gradient(90deg,#3b82f6,#8b5cf6)", color: "#fff" } : { color: "#64748b" }}>
                {n === "all" ? "All" : n === "airteltigo" ? "AT" : n.charAt(0).toUpperCase() + n.slice(1)}
              </button>
            ))}
          </div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">🔍</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…"
              className="pl-9 pr-4 py-2 text-sm rounded-xl border border-[#1e3050] focus:outline-none focus:border-blue-500 w-36 text-white placeholder-slate-600"
              style={{ background: "#162032" }} />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[#1e3050] overflow-hidden" style={{ background: "#162032" }}>
        {loading ? <p className="text-center text-slate-500 py-16">Loading…</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e3050] text-xs text-slate-500 uppercase tracking-wider" style={{ background: "#0e1928" }}>
                  <th className="px-4 py-3 text-left font-semibold">Network</th>
                  <th className="px-4 py-3 text-left font-semibold">Bundle</th>
                  <th className="px-4 py-3 text-left font-semibold">Validity</th>
                  <th className="px-4 py-3 text-left font-semibold">Sell Price</th>
                  <th className="px-4 py-3 text-left font-semibold">Cost</th>
                  <th className="px-4 py-3 text-left font-semibold">Margin</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-left font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((b) => {
                  const nb = netBadge[b.network.toLowerCase()] ?? { bg: "#1e293b", color: "#94a3b8" };
                  const margin = b.price - b.costPrice;
                  const marginPct = ((margin / b.price) * 100).toFixed(0);
                  return (
                    <tr key={b.id} className={`border-b border-[#1e3050]/50 last:border-0 transition-colors ${b.active ? "hover:bg-[#1e3050]/30" : "opacity-50 hover:opacity-70"}`}>
                      <td className="px-4 py-3.5">
                        <span className="text-[10px] font-black px-2 py-0.5 rounded" style={{ background: nb.bg, color: nb.color }}>
                          {b.network.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 font-semibold text-slate-300">
                        {b.size}
                        {b.hasOverride && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ background: "rgba(59,130,246,0.15)", color: "#60a5fa" }}>custom</span>}
                      </td>
                      <td className="px-4 py-3.5 text-slate-500 text-xs">{b.validity}</td>
                      <td className="px-4 py-3.5 font-black text-white">GH₵{b.price.toFixed(2)}</td>
                      <td className="px-4 py-3.5 text-slate-500">GH₵{b.costPrice.toFixed(2)}</td>
                      <td className="px-4 py-3.5">
                        <span className="font-black" style={{ color: "#4ade80" }}>GH₵{margin.toFixed(2)}</span>
                        <span className="text-slate-600 text-xs ml-1">({marginPct}%)</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <button
                          onClick={() => handleToggleActive(b)}
                          disabled={togglingId === b.id}
                          className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-40"
                          style={{ background: b.active ? "#10b981" : "#374151" }}
                          title={b.active ? "Click to hide from store" : "Click to show in store"}
                        >
                          <span className="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out"
                            style={{ transform: b.active ? "translateX(16px)" : "translateX(0)" }} />
                        </button>
                      </td>
                      <td className="px-4 py-3.5">
                        <button onClick={() => { setEditing(b); setEditPrice({ price: String(b.price), costPrice: String(b.costPrice) }); setEditMeta({ sizeLabel: "", sizeGB: "", validity: "" }); setEditMsg(""); }}
                          className="text-xs font-bold px-3 py-1.5 rounded-lg transition-colors text-blue-400 border border-blue-500/30 hover:border-blue-400"
                          style={{ background: "rgba(59,130,246,0.1)" }}>
                          Edit Price
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {shown.length === 0 && <p className="text-center text-slate-500 py-10">No bundles match your filter.</p>}
          </div>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="rounded-2xl shadow-2xl w-full max-w-sm p-6 border border-[#1e3050] max-h-[90vh] overflow-y-auto" style={{ background: "#162032" }}>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[11px] font-black px-2 py-0.5 rounded" style={netBadge[editing.network.toLowerCase()] ? { background: netBadge[editing.network.toLowerCase()].bg, color: netBadge[editing.network.toLowerCase()].color } : {}}>
                {editing.network.toUpperCase()}
              </span>
              <h3 className="font-black text-white text-lg">Edit Bundle</h3>
            </div>

            <p className="text-xs text-slate-500 mb-4">Changes override the defaults. Leave size/validity blank to reset to default.</p>

            <div className="space-y-3">
              {/* Prices */}
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pricing</p>
              {[{ label: "Selling Price (GH₵)", key: "price" as const }, { label: "Cost / Fulfillment (GH₵)", key: "costPrice" as const }].map(({ label, key }) => (
                <div key={key}>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">{label}</label>
                  <input type="number" step="0.01" min="0.01"
                    value={editPrice[key]}
                    onChange={(e) => setEditPrice((p) => ({ ...p, [key]: e.target.value }))}
                    className="w-full rounded-lg px-3 py-2.5 text-sm text-white border border-[#1e3050] focus:outline-none focus:border-blue-500"
                    style={{ background: "#0e1928" }} />
                </div>
              ))}
              {editPrice.price && editPrice.costPrice && !isNaN(parseFloat(editPrice.price)) && !isNaN(parseFloat(editPrice.costPrice)) && (
                <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(16,185,129,0.1)", color: "#4ade80" }}>
                  <span className="font-black">Margin: GH₵{(parseFloat(editPrice.price) - parseFloat(editPrice.costPrice)).toFixed(2)}</span>
                  <span className="opacity-60 ml-1">({(((parseFloat(editPrice.price) - parseFloat(editPrice.costPrice)) / parseFloat(editPrice.price)) * 100).toFixed(0)}% of sale)</span>
                </div>
              )}

              {/* Bundle Metadata */}
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider pt-2">Bundle Details</p>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Display Size Label <span className="text-slate-600">(e.g. 2GB, 500MB)</span></label>
                <input type="text" placeholder={editing.size}
                  value={editMeta.sizeLabel}
                  onChange={(e) => setEditMeta((m) => ({ ...m, sizeLabel: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2.5 text-sm text-white border border-[#1e3050] focus:outline-none focus:border-blue-500"
                  style={{ background: "#0e1928" }} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Data Size in GB <span className="text-slate-600">(for Inventor API — e.g. 2, 0.5)</span></label>
                <input type="number" step="0.01" min="0.01" placeholder={String(editing.sizeGB)}
                  value={editMeta.sizeGB}
                  onChange={(e) => setEditMeta((m) => ({ ...m, sizeGB: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2.5 text-sm text-white border border-[#1e3050] focus:outline-none focus:border-blue-500"
                  style={{ background: "#0e1928" }} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Validity <span className="text-slate-600">(e.g. 30 days, 7 days)</span></label>
                <input type="text" placeholder={editing.validity}
                  value={editMeta.validity}
                  onChange={(e) => setEditMeta((m) => ({ ...m, validity: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2.5 text-sm text-white border border-[#1e3050] focus:outline-none focus:border-blue-500"
                  style={{ background: "#0e1928" }} />
              </div>

              {editMsg && <p className={`text-xs font-semibold ${editMsg === "Saved!" ? "text-green-400" : "text-red-400"}`}>{editMsg}</p>}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => { setEditing(null); setEditMsg(""); }}
                className="flex-1 border border-[#1e3050] text-slate-400 font-semibold py-2.5 rounded-xl text-sm hover:text-white transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={editLoading}
                className="flex-1 text-white font-bold py-2.5 rounded-xl text-sm disabled:opacity-60"
                style={{ background: "linear-gradient(90deg,#3b82f6,#8b5cf6)" }}>
                {editLoading ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
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

  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const res = await fetch("/api/admin/stats");
      if (res.status === 401) { router.push("/admin/login"); return; }
      setStats(await res.json());
      setTimeout(() => setAnimated(true), 80);
    } finally {
      setLoadingStats(false);
    }
  }, [router]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => {
    if (tab === "overview") { setAnimated(false); setTimeout(() => setAnimated(true), 60); }
  }, [tab]);

  async function handleLogout() {
    await fetch("/api/admin/auth", { method: "DELETE" });
    router.push("/admin/login");
  }

  function handleNavigate(t: Tab) { setTab(t); }

  return (
    <div style={{ minHeight: "100vh", background: "#0d1424" }}>
      <Sidebar tab={tab} setTab={setTab} pendingAgents={stats?.agents.pending ?? 0} onLogout={handleLogout} mobileOpen={mobileSidebarOpen} onMobileClose={() => setMobileSidebarOpen(false)} />
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={() => setMobileSidebarOpen(false)} />
      )}

      <div className="md:ml-60 flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="px-6 py-4 flex items-center justify-between sticky top-0 z-30 border-b border-[#1e3050]" style={{ background: "#0d1424" }}>
          <div className="flex items-center">
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="md:hidden mr-3 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-[#1e3050] transition-colors"
              aria-label="Open menu"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div>
              <h2 className="font-black text-white text-lg">{getGreeting()}</h2>
              <p className="text-xs text-slate-500 mt-0.5">Elite Data Admin Console</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {stats && (
              <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border"
                style={{ background: "rgba(16,185,129,0.1)", color: "#4ade80", borderColor: "rgba(16,185,129,0.3)" }}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </span>
            )}
            <button onClick={fetchStats}
              className="text-xs font-medium text-slate-400 hover:text-white border border-[#1e3050] px-3 py-1.5 rounded-xl transition-colors"
              style={{ background: "#162032" }}>
              ↻ Sync
            </button>
            <div className="w-9 h-9 rounded-full flex items-center justify-center font-black text-white text-sm"
              style={{ background: "linear-gradient(135deg,#3b82f6,#8b5cf6)" }}>A</div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 px-3 sm:px-6 py-4 sm:py-6">
          {loadingStats && tab !== "prices" ? (
            <div className="flex flex-col items-center justify-center py-40 gap-4">
              <div className="w-10 h-10 border-4 border-[#3b82f6] border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-500">Loading dashboard…</p>
            </div>
          ) : (
            <>
              {tab === "overview" && stats && <Overview stats={stats} animated={animated} onNavigate={handleNavigate} />}
              {tab === "orders" && stats && <OrdersView orders={stats.orders.all} onRefresh={fetchStats} />}
              {tab === "agents" && stats && <AgentsView stats={stats} onRefresh={fetchStats} />}
              {tab === "prices" && <PricesView />}
            </>
          )}
        </main>
      </div>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
