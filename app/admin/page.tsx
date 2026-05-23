"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

const PricesView = dynamic(() => import("./_components/PricesView"), {
  loading: () => <div style={{ textAlign: "center", color: "#475569", padding: "60px 0" }}>Loading bundles…</div>,
});
const AgentPriceModal = dynamic(() => import("./_components/AgentPriceModal"));
const AgentPricesAdmin = dynamic(() => import("./_components/AgentPricesAdmin"), {
  loading: () => <div style={{ textAlign: "center", color: "#475569", padding: "60px 0" }}>Loading…</div>,
});
const PnLView = dynamic(() => import("./_components/PnLView"), {
  loading: () => <div style={{ textAlign: "center", color: "#475569", padding: "60px 0" }}>Loading…</div>,
});
const ApiKeysAdmin = dynamic(() => import("./_components/ApiKeysAdmin"), {
  loading: () => <div style={{ textAlign: "center", color: "#475569", padding: "60px 0" }}>Loading…</div>,
});
const AnnouncementsAdmin = dynamic(() => import("./_components/AnnouncementsAdmin"), {
  loading: () => <div style={{ textAlign: "center", color: "#475569", padding: "60px 0" }}>Loading…</div>,
});

type Tab = "overview" | "orders" | "agents" | "prices" | "agentprices" | "pnl" | "apikeys" | "announcements";
type OrderStatus = "ALL" | "COMPLETED" | "PROCESSING" | "PENDING" | "FAILED";

interface Order {
  reference: string; status: string; amount: number; admin_commission: number;
  agent_commission: number; cost_price?: number; customer_name: string; phone: string; network: string;
  bundle_size: string; created_at: string; agent_id: string | null;
}
interface Agent {
  id: string; name: string; email: string; phone: string; whatsapp?: string; business_name: string;
  referral_code: string; status: string; agent_type?: string; commission_balance: number; total_sales: number;
  total_revenue: number; created_at: string;
}
interface StatsData {
  orders: { all: Order[]; total: number; completed: number; processing: number; pending: number; failed: number; };
  revenue: { total: number; cost: number };
  profit: { admin: number; agentCommissions: number; gross: number };
  agents: { all: Agent[]; total: number; pending: number; approved: number; rejected: number; };
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

function getTodayStats(orders: Order[]) {
  const now = new Date();
  const todayOrders = orders.filter((o) => {
    const d = new Date(o.created_at);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  });
  // Only count completed orders for profit (failed = refund needed, pending = not delivered yet)
  const done = todayOrders.filter((o) => (o.status ?? "").toLowerCase() === "completed");
  const agentDone = done.filter((o) => o.agent_id);
  const directDone = done.filter((o) => !o.agent_id);
  return {
    count: todayOrders.length,
    revenue: done.reduce((s, o) => s + (Number(o.amount) || 0), 0),
    profit: done.reduce((s, o) => s + (Number(o.admin_commission) || 0), 0),
    completed: done.length,
    agentProfit: agentDone.reduce((s, o) => s + (Number(o.admin_commission) || 0), 0),
    directProfit: directDone.reduce((s, o) => s + (Number(o.admin_commission) || 0), 0),
    agentCount: agentDone.length,
  };
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
      const v = target * (1 - Math.pow(1 - p, 3));
      setValue(p < 1 ? Math.round(v * 100) / 100 : target);
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
    if ((o.status ?? "").toLowerCase() !== "completed") continue; // only completed orders
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
const IconKey = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
  </svg>
);
const IconMegaphone = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
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

// ─── Change Password Modal ────────────────────────────────────────────────────
function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState(false);

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg("");
    if (next.length < 8) { setMsg("New password must be at least 8 characters."); return; }
    if (next !== confirm) { setMsg("Passwords do not match."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/admin/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json();
      if (data.success) { setOk(true); setMsg("Password changed successfully!"); }
      else setMsg(data.error || "Failed to change password.");
    } catch { setMsg("Network error. Please try again."); }
    finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="rounded-2xl shadow-2xl w-full max-w-sm p-6 border border-[#1e3050]" style={{ background: "#162032" }}>
        <h3 className="font-black text-white text-lg mb-1">Change Password</h3>
        <p className="text-xs text-slate-500 mb-5">You&apos;ll use the new password to log in next time.</p>
        {ok ? (
          <div className="text-center py-4">
            <p className="text-green-400 font-bold text-sm mb-4">✅ Password updated!</p>
            <button onClick={onClose} className="text-sm text-slate-400 hover:text-white transition-colors">Close</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            {[
              { label: "Current Password", val: current, set: setCurrent },
              { label: "New Password (min 8 chars)", val: next, set: setNext },
              { label: "Confirm New Password", val: confirm, set: setConfirm },
            ].map(({ label, val, set }) => (
              <div key={label}>
                <label className="block text-xs font-semibold text-slate-400 mb-1">{label}</label>
                <input type="password" value={val} onChange={(e) => set(e.target.value)} required
                  className="w-full rounded-lg px-3 py-2.5 text-sm text-white border border-[#1e3050] focus:outline-none focus:border-blue-500"
                  style={{ background: "#0e1928" }} />
              </div>
            ))}
            {msg && <p className="text-xs font-semibold text-red-400 whitespace-pre-wrap">{msg}</p>}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose}
                className="flex-1 border border-[#1e3050] text-slate-400 font-semibold py-2.5 rounded-xl text-sm hover:text-white transition-colors">Cancel</button>
              <button type="submit" disabled={loading}
                className="flex-1 text-white font-bold py-2.5 rounded-xl text-sm disabled:opacity-60"
                style={{ background: "linear-gradient(90deg,#3b82f6,#8b5cf6)" }}>
                {loading ? "Saving…" : "Change Password"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({ tab, setTab, pendingAgents, onLogout, onChangePassword, mobileOpen, onMobileClose }: {
  tab: Tab; setTab: (t: Tab) => void; pendingAgents: number; onLogout: () => void;
  onChangePassword: () => void; mobileOpen: boolean; onMobileClose: () => void;
}) {
  const nav = [
    { id: "overview" as Tab, label: "Dashboard", icon: <IconHome /> },
    { id: "orders" as Tab, label: "Orders", icon: <IconOrders /> },
    { id: "agents" as Tab, label: "Agents", icon: <IconAgents />, badge: pendingAgents || undefined },
    { id: "prices" as Tab, label: "Bundles & Prices", icon: <IconPrices /> },
    { id: "agentprices" as Tab, label: "Agent Pricing", icon: <IconAgents /> },
    { id: "pnl" as Tab, label: "Profit & Loss", icon: <IconTrend /> },
    { id: "apikeys" as Tab, label: "API Keys", icon: <IconKey /> },
    { id: "announcements" as Tab, label: "Announcements", icon: <IconMegaphone /> },
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
        <button onClick={onChangePassword}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all"
          style={{ color: "#94a3b8" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#162032"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = ""; }}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
          Change Password
        </button>
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
  const today = getTodayStats(stats.orders.all);
  const todayRevenue = useCountUp(Math.round(today.revenue * 100) / 100, 1200, animated);
  const todayProfit = useCountUp(Math.round(today.profit * 100) / 100, 1200, animated);
  const todayOrders = useCountUp(today.count, 900, animated);
  const [apiBalance, setApiBalance] = useState<{ balance: number | null; error?: string; raw?: unknown }>({ balance: null });
  const [balanceLoading, setBalanceLoading] = useState(true);

  const fetchBalance = useCallback(() => {
    setBalanceLoading(true);
    fetch("/api/admin/inventor-balance")
      .then((r) => r.json())
      .then((d) => { setApiBalance(d); setBalanceLoading(false); })
      .catch(() => { setApiBalance({ balance: null, error: "Network error" }); setBalanceLoading(false); });
  }, []);

  useEffect(() => { fetchBalance(); }, [fetchBalance]);

  const monthly = getMonthly(stats.orders.all);
  const maxRev = Math.max(...monthly.map((m) => m.revenue), 1);

  return (
    <div className="space-y-5">
      {/* Row 1 — Revenue card + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Today hero card */}
        <div className="lg:col-span-3 rounded-2xl p-6 border border-[#1e3050] relative overflow-hidden" style={{ background: "#162032" }}>
          <div className="absolute top-0 right-0 w-48 h-48 rounded-full opacity-10 blur-3xl"
            style={{ background: "linear-gradient(135deg,#10b981,#3b82f6)", transform: "translate(30%,-30%)" }} />
          <div className="flex items-start justify-between mb-4 relative">
            <div>
              <p className="text-slate-400 text-sm font-medium">Today's Revenue</p>
              <p className="text-4xl font-black text-white mt-1">GH₵{todayRevenue.toFixed(2)}</p>
              <p className="text-slate-500 text-sm mt-1">{new Date().toLocaleDateString("en-GH", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</p>
            </div>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center border border-[#1e3050]" style={{ background: "#0a2a1f" }}>
              <IconWallet />
            </div>
          </div>
          <div className="relative grid grid-cols-3 gap-3 mt-5">
            <div className="rounded-xl p-3 border border-[#1e3050]" style={{ background: "#0e1928" }}>
              <p className="text-xs text-slate-500 mb-1">Today&apos;s Profit</p>
              <p className="font-black text-sm" style={{ color: "#4ade80" }}>GH₵{todayProfit.toFixed(2)}</p>
              {(today.agentCount > 0 || today.directProfit > 0) && (
                <p className="text-[10px] text-slate-600 mt-1 leading-tight">
                  GH₵{today.directProfit.toFixed(2)} direct
                  {today.agentCount > 0 && <> + GH₵{today.agentProfit.toFixed(2)} from {today.agentCount} agent {today.agentCount === 1 ? "sale" : "sales"}</>}
                </p>
              )}
            </div>
            <div className="rounded-xl p-3 border border-[#1e3050]" style={{ background: "#0e1928" }}>
              <p className="text-xs text-slate-500 mb-1">Orders Today</p>
              <p className="font-black text-sm" style={{ color: "#60a5fa" }}>{todayOrders}</p>
            </div>
            <div className="rounded-xl p-3 border border-[#1e3050]" style={{ background: "#0e1928" }}>
              <p className="text-xs text-slate-500 mb-1">Completed</p>
              <p className="font-black text-sm" style={{ color: "#a78bfa" }}>{today.completed}</p>
            </div>
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
          { label: "Today's Orders", value: String(todayOrders), sub: `${stats.orders.total} total all time`, icon: <IconCart />, iconBg: "#1e3a5f", iconColor: "#3b82f6" },
          { label: "Today's Profit", value: `GH₵${todayProfit.toFixed(2)}`, sub: "Your earnings today", icon: <IconWallet />, iconBg: "#14302a", iconColor: "#10b981" },
          { label: "This Month", value: String(getThisMonthOrders(stats.orders.all)), sub: "Orders this month", icon: <IconTrend />, iconBg: "#2a1a3a", iconColor: "#a78bfa" },
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
        {(() => {
          const bal = apiBalance.balance;
          const low = bal !== null && bal < 20;
          const critical = bal !== null && bal < 5;
          return (
            <div className="rounded-2xl p-5 border col-span-2 lg:col-span-1"
              style={{ background: "#162032", borderColor: critical ? "#7f1d1d" : low ? "#78350f" : "#1e3050", animation: `slideUp .35s ease both`, animationDelay: `${4 * 60}ms` }}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium uppercase tracking-wider" style={{ color: critical ? "#f87171" : low ? "#fbbf24" : "#94a3b8" }}>
                  {critical ? "⚠️ Critical" : low ? "⚠️ Low Balance" : "API Balance"}
                </p>
                <div className="flex items-center gap-1.5">
                  <button onClick={fetchBalance} title="Refresh balance"
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white transition-colors"
                    style={{ background: "#0e1928" }}>
                    <svg className={`w-3.5 h-3.5 ${balanceLoading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ background: critical ? "#450a0a" : low ? "#431407" : "#0a2a1f", color: critical ? "#f87171" : low ? "#fbbf24" : "#34d399" }}>
                    <IconWallet />
                  </div>
                </div>
              </div>
              <p className="text-2xl font-black" style={{ color: critical ? "#f87171" : low ? "#fbbf24" : "#fff" }}>
                {balanceLoading ? <span className="text-slate-500 text-lg">Loading…</span>
                  : bal !== null ? `GH₵${bal.toFixed(2)}`
                  : <span className="text-slate-500 text-base">{apiBalance.error ?? "Unavailable"}</span>}
              </p>
              <p className="text-xs mt-1" style={{ color: critical ? "#fca5a5" : low ? "#fde68a" : "#64748b" }}>
                {critical ? "Top up now — deliveries may fail!" : low ? "Top up soon" : "Inventor DataHub"}
              </p>
            </div>
          );
        })()}
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
              { name: "MTN", color: "#facc15", count: stats.orders.all.filter((o) => o.network?.toLowerCase() === "mtn").length },
              { name: "Telecel", color: "#f87171", count: stats.orders.all.filter((o) => o.network?.toLowerCase() === "telecel").length },
              { name: "AirtelTigo", color: "#fb7185", count: stats.orders.all.filter((o) => o.network?.toLowerCase() === "airteltigo").length },
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
            {[...stats.orders.all].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 6).map((o, i) => {
              const dotColor: Record<string, string> = { COMPLETED: "#10b981", PROCESSING: "#3b82f6", PENDING: "#f59e0b", FAILED: "#f87171" };
              return (
                <div key={o.reference ?? o.created_at ?? i} className="flex items-center gap-4 px-5 py-3.5 hover:bg-[#1e3050]/30 transition-colors">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-xs font-black"
                    style={{ background: o.network?.toLowerCase() === "mtn" ? "#78350f" : o.network?.toLowerCase() === "telecel" ? "#7f1d1d" : "#881337", color: o.network?.toLowerCase() === "mtn" ? "#fbbf24" : "#fca5a5" }}>
                    {(o.network ?? "?").toUpperCase().slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{o.customer_name || o.phone || "—"}</p>
                    <p className="text-xs text-slate-500">{(o.network ?? "—").toUpperCase()} {(o.bundle_size ?? "").replace(/^(mtn|telecel|at ishare|airteltigo|airtel)\s+/i, "").trim()} · {o.phone}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-black text-white">GH₵{Number(o.amount).toFixed(2)}</p>
                    <p className="text-xs text-slate-500">{new Date(o.created_at).toLocaleDateString("en-GH", { day: "2-digit", month: "short" })}</p>
                  </div>
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor[o.status.toUpperCase()] ?? "#6b7280" }} />
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
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [retrying, setRetrying] = useState<string | null>(null);
  const [retryMsg, setRetryMsg] = useState<{ ref: string; ok: boolean; text: string } | null>(null);

  async function handleRetry(reference: string) {
    setRetrying(reference);
    setRetryMsg(null);
    try {
      const res = await fetch("/api/admin/orders/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference }),
      });
      const d = await res.json();
      if (d.success) {
        setRetryMsg({ ref: reference, ok: true, text: `✓ ${d.status === "completed" ? "Delivered!" : "Processing…"}` });
        onRefresh();
      } else {
        setRetryMsg({ ref: reference, ok: false, text: "Retry failed — check Telegram for details" });
      }
    } catch {
      setRetryMsg({ ref: reference, ok: false, text: "Network error" });
    } finally {
      setRetrying(null);
      setTimeout(() => setRetryMsg(null), 6000);
    }
  }

  async function handleSync() {
    setSyncing(true); setSyncMsg("");
    try {
      const res = await fetch("/api/admin/sync-orders", { method: "POST" });
      const d = await res.json();
      setSyncMsg(d.updated > 0 ? `✓ ${d.updated} order${d.updated !== 1 ? "s" : ""} updated` : `✓ All ${d.checked} orders up to date`);
      if (d.updated > 0) onRefresh();
    } catch { setSyncMsg("Sync failed"); }
    finally { setSyncing(false); setTimeout(() => setSyncMsg(""), 4000); }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return orders.slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .filter((o) => {
        if (statusFilter !== "ALL" && o.status.toUpperCase() !== statusFilter) return false;
        if (!q) return true;
        return (o.customer_name ?? "").toLowerCase().includes(q) || (o.phone ?? "").includes(q) || (o.reference ?? "").toLowerCase().includes(q) || (o.network ?? "").toLowerCase().includes(q);
      });
  }, [orders, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageOrders = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [search, statusFilter]);

  const counts: Record<OrderStatus, number> = {
    ALL: orders.length,
    COMPLETED: orders.filter((o) => o.status.toUpperCase() === "COMPLETED").length,
    PROCESSING: orders.filter((o) => o.status.toUpperCase() === "PROCESSING").length,
    PENDING: orders.filter((o) => o.status.toUpperCase() === "PENDING").length,
    FAILED: orders.filter((o) => o.status.toUpperCase() === "FAILED").length,
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
          <button onClick={handleSync} disabled={syncing}
            className="flex items-center gap-1.5 text-sm font-medium disabled:opacity-60 border px-3 py-2 rounded-xl transition-colors"
            style={{ background: syncing ? "#162032" : "rgba(59,130,246,0.1)", borderColor: "#3b82f660", color: "#60a5fa" }}>
            {syncing ? "Syncing…" : "⚡ Sync Status"}
          </button>
          {syncMsg && <span className="text-xs font-semibold text-green-400">{syncMsg}</span>}
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
                {["#", "Customer", "Network", "Phone", "Amount", "Profit", "Source", "Status", "Date", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageOrders.map((o, idx) => {
                const net = (o.network ?? "").toLowerCase();
                const nb = netBadge[net] ?? { bg: "#1e293b", color: "#94a3b8" };
                return (
                  <tr key={o.reference ?? o.created_at ?? idx} className="border-b border-[#1e3050]/50 hover:bg-[#1e3050]/30 transition-colors last:border-0">
                    <td className="px-4 py-3.5 text-slate-600 text-xs font-mono">
                      {((page - 1) * PAGE_SIZE) + idx + 1}
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-white whitespace-nowrap">{o.customer_name || o.phone || "—"}</p>
                      <a href={`/track?ref=${encodeURIComponent(o.reference ?? "")}`} target="_blank" rel="noreferrer"
                        className="text-[11px] text-blue-400 hover:text-blue-300 font-mono mt-0.5 underline underline-offset-2">
                        {o.reference ? o.reference.slice(0, 14) + "…" : "—"}
                      </a>
                    </td>
                    <td className="px-4 py-3.5">
                      {(() => {
                        const bs = o.bundle_size ?? "";
                        const rawNet = o.network || (bs.toLowerCase().startsWith("mtn") ? "mtn" : bs.toLowerCase().startsWith("telecel") ? "telecel" : bs.toLowerCase().startsWith("at ") || bs.toLowerCase().includes("airtel") ? "airteltigo" : "");
                        const displayNet = rawNet ? rawNet.toUpperCase() : "—";
                        const displayBadge = netBadge[rawNet] ?? { bg: "#1e293b", color: "#64748b" };
                        const cleanSize = bs.replace(/^(mtn|telecel|at ishare|airteltigo|airtel)\s+/i, "").trim() || "—";
                        return (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black px-2 py-0.5 rounded" style={{ background: displayBadge.bg, color: displayBadge.color }}>
                              {displayNet}
                            </span>
                            <span className="text-slate-400 text-xs">{cleanSize}</span>
                          </div>
                        );
                      })()}
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
                        style={{ background: statusBg[o.status.toUpperCase()] ?? "transparent", color: statusDot[o.status.toUpperCase()] ?? "#94a3b8" }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusDot[o.status.toUpperCase()] ?? "#94a3b8" }} />
                        {o.status.charAt(0) + o.status.slice(1).toLowerCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 text-xs whitespace-nowrap">
                      {new Date(o.created_at).toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3.5">
                      {["pending", "processing", "failed"].includes((o.status ?? "").toLowerCase()) && o.reference && (
                        retryMsg?.ref === o.reference ? (
                          <span className={`text-xs font-bold ${retryMsg.ok ? "text-green-400" : "text-red-400"}`}>{retryMsg.text}</span>
                        ) : (
                          <button
                            onClick={() => handleRetry(o.reference)}
                            disabled={retrying === o.reference}
                            className="text-xs font-bold px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
                            style={{ background: "rgba(251,146,60,0.15)", color: "#fb923c", border: "1px solid rgba(251,146,60,0.3)" }}>
                            {retrying === o.reference ? "…" : "🔄 Retry"}
                          </button>
                        )
                      )}
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
  const [pricesAgent, setPricesAgent] = useState<{ id: string; name: string } | null>(null);

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
                    <td className="px-4 py-3.5">
                      {a.agent_type === "custom_price" ? (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(139,92,246,0.15)", color: "#a78bfa", border: "1px solid rgba(139,92,246,0.3)" }}>Custom Price</span>
                      ) : (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(16,185,129,0.1)", color: "#4ade80", border: "1px solid rgba(16,185,129,0.25)" }}>Commission</span>
                      )}
                    </td>
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
                      <div className="flex items-center gap-3">
                        {a.agent_type === "custom_price" && (
                          <button onClick={() => setPricesAgent({ id: a.id, name: a.name })}
                            className="text-xs font-bold px-2.5 py-1 rounded-lg transition-colors"
                            style={{ background: "rgba(139,92,246,0.15)", color: "#a78bfa", border: "1px solid rgba(139,92,246,0.3)" }}>
                            Set Prices
                          </button>
                        )}
                        <button onClick={() => setAgentAction({ id: a.id, name: a.name, action: "reject" })}
                          className="text-xs font-semibold transition-colors" style={{ color: "#f87171" }}>Remove</button>
                      </div>
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

      {pricesAgent && (
        <AgentPriceModal agentId={pricesAgent.id} agentName={pricesAgent.name} onClose={() => setPricesAgent(null)} />
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
  const [showChangePw, setShowChangePw] = useState(false);

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
      <Sidebar tab={tab} setTab={setTab} pendingAgents={stats?.agents.pending ?? 0} onLogout={handleLogout} onChangePassword={() => setShowChangePw(true)} mobileOpen={mobileSidebarOpen} onMobileClose={() => setMobileSidebarOpen(false)} />
      {showChangePw && <ChangePasswordModal onClose={() => setShowChangePw(false)} />}
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
              <span className="hidden sm:flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border"
                style={{ background: "rgba(16,185,129,0.1)", color: "#4ade80", borderColor: "rgba(16,185,129,0.3)" }}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </span>
            )}
            <button onClick={fetchStats}
              className="hidden sm:block text-xs font-medium text-slate-400 hover:text-white border border-[#1e3050] px-3 py-1.5 rounded-xl transition-colors"
              style={{ background: "#162032" }}>
              ↻ Sync
            </button>
            <button onClick={handleLogout}
              className="md:hidden flex items-center gap-1.5 text-xs font-bold text-red-400 border border-red-500/30 hover:bg-red-500/10 px-3 py-1.5 rounded-xl transition-colors"
              style={{ background: "#1a0f0f" }}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Logout
            </button>
            <div className="hidden md:flex w-9 h-9 rounded-full items-center justify-center font-black text-white text-sm"
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
              {tab === "agentprices" && stats && <AgentPricesAdmin allAgents={stats.agents.all} />}
              {tab === "pnl" && stats && <PnLView orders={stats.orders.all} />}
              {tab === "apikeys" && <ApiKeysAdmin />}
              {tab === "announcements" && <AnnouncementsAdmin />}
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
