"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { Tab, OrderStatus, StatsData, Order } from "./_components/shared/types";
import { BG, BORDER } from "./_components/shared/constants";
import { Spinner } from "./_components/shared/Spinner";
import { Ic } from "./_components/shared/Icons";
import { Sidebar } from "./_components/Sidebar";
import { ChangePasswordModal } from "./_components/ChangePasswordModal";
import { CompensateView } from "./_components/CompensateView";
import { SettingsView } from "./_components/SettingsView";
import { AgentsView } from "./_components/AgentsView";
import { LeaderboardView } from "./_components/LeaderboardView";
import { OrdersView } from "./_components/OrdersView";
import { Dashboard } from "./_components/OverviewDashboard";

const PricesView         = dynamic(() => import("./_components/PricesView"),          { loading: () => <Spinner /> });
const AgentPricesAdmin   = dynamic(() => import("./_components/AgentPricesAdmin"),    { loading: () => <Spinner /> });
const PnLView            = dynamic(() => import("./_components/PnLView"),             { loading: () => <Spinner /> });
const ApiKeysAdmin       = dynamic(() => import("./_components/ApiKeysAdmin"),        { loading: () => <Spinner /> });
const AnnouncementsAdmin = dynamic(() => import("./_components/AnnouncementsAdmin"),  { loading: () => <Spinner /> });
const PromoBannerAdmin   = dynamic(() => import("./_components/PromoBannerAdmin"),    { loading: () => <Spinner /> });
const ManualOrdersAdmin  = dynamic(() => import("./_components/ManualOrdersAdmin"),   { loading: () => <Spinner /> });
const CommissionAdmin    = dynamic(() => import("./_components/CommissionAdmin"),      { loading: () => <Spinner /> });
const AgentWalletsAdmin  = dynamic(() => import("./_components/AgentWalletsAdmin"),   { loading: () => <Spinner /> });
const SMSAdmin           = dynamic(() => import("./_components/SMSAdmin"),            { loading: () => <Spinner /> });
const CustomersAdmin     = dynamic(() => import("./_components/CustomersAdmin"),      { loading: () => <Spinner /> });
const MashupBundlesAdmin = dynamic(() => import("./_components/MashupBundlesAdmin"),  { loading: () => <Spinner /> });
const NetworkProvidersAdmin = dynamic(() => import("./_components/NetworkProvidersAdmin"), { loading: () => <Spinner /> });
const CouponsAdmin       = dynamic(() => import("./_components/CouponsAdmin"),        { loading: () => <Spinner /> });
const WithdrawalsAdmin   = dynamic(() => import("./_components/WithdrawalsAdmin"),    { loading: () => <Spinner /> });
const AnalyticsAdmin     = dynamic(() => import("./_components/AnalyticsAdmin"),      { loading: () => <Spinner /> });
const PaystackSplitAdmin = dynamic(() => import("./_components/PaystackSplitAdmin"),  { loading: () => <Spinner /> });
const RefundNumbers      = dynamic(() => import("./_components/RefundNumbers"),       { loading: () => <Spinner /> });
const OperationsCenter   = dynamic(() => import("./_components/OperationsCenter"),   { loading: () => <Spinner /> });

const tabToOrderFilter: Record<string, OrderStatus> = {
  "all-orders": "ALL", "pending-orders": "PENDING", "processing": "PROCESSING",
  "completed": "COMPLETED", "failed-orders": "FAILED", "approval-queue": "PENDING_APPROVAL",
};
const isOrderTab = (t: Tab) => t in tabToOrderFilter;
const isAgentTab = (t: Tab) => t === "all-agents" || t === "agent-applications";

const pageTitle: Record<Tab, string> = {
  "overview": "Dashboard", "all-orders": "All Orders", "approval-queue": "Approval Queue",
  "pending-orders": "Pending Orders", "processing": "Processing", "completed": "Completed",
  "failed-orders": "Failed Orders", "data-bundles": "Data Bundles", "bundle-prices": "Agent Prices",
  "all-agents": "All Agents", "agent-applications": "Agent Applications", "agent-wallets": "Agent Wallets",
  "leaderboard": "Referrals & Leaderboard", "referrals": "Referrals & Leaderboard",
  "transactions": "Transactions", "commissions": "Commissions", "manual": "Manual Orders",
  "refund-numbers": "MoMo Refund Numbers", "compensate": "Compensate",
  "announcements": "Notifications", "notifications": "Notifications", "promo": "Promo Banner",
  "sms": "SMS Messaging", "apikeys": "API Keys", "settings": "Settings",
  "customers": "Customers", "mashup-bundles": "Mashup Bundles", "network-providers": "Network Providers",
  "coupons": "Coupons", "withdrawals": "Withdrawal Requests", "agent-ranks": "Agent Ranks",
  "analytics": "Analytics", "developer-api": "Developer API", "paystack-split": "Paystack Split Payments",
  "operations": "Operations & Audit",
};

export default function AdminDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [animated, setAnimated] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [showChangePw, setShowChangePw] = useState(false);

  const [pendingOrders, setPendingOrders] = useState<Order[]>([]);

  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const res = await fetch("/api/admin/stats");
      if (res.status === 401) { router.push("/admin/login"); return; }
      const data = await res.json() as Record<string, unknown>;
      if (!res.ok) { setStatsError((data.error as string) ?? `Server error (${res.status})`); return; }
      setStatsError(null);
      setStats(data as unknown as StatsData);
      setTimeout(() => setAnimated(true), 80);
    } catch (err) {
      setStatsError(String(err));
    } finally { setLoadingStats(false); }
  }, [router]);

  const fetchPendingApproval = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/orders/pending-approval");
      if (res.ok) {
        const data = await res.json() as { orders: Order[] };
        setPendingOrders(data.orders ?? []);
        // Keep the sidebar count in sync
        setStats(prev => prev ? { ...prev, orders: { ...prev.orders, pendingApproval: data.orders?.length ?? 0 } } : prev);
      }
    } catch { /* silent — next interval will retry */ }
  }, []);

  useEffect(() => { const t = setTimeout(() => void fetchStats(), 0); return () => clearTimeout(t); }, [fetchStats]);
  useEffect(() => { if (tab === "overview") { setTimeout(() => setAnimated(false), 0); setTimeout(() => setAnimated(true), 60); } }, [tab]);

  // Full stats every 30s; live approval-queue refresh every 8s when on that tab
  useEffect(() => {
    const id = setInterval(() => void fetchStats(), 30_000);
    return () => clearInterval(id);
  }, [fetchStats]);

  useEffect(() => {
    if (tab !== "approval-queue") return;
    void fetchPendingApproval();
    const id = setInterval(() => void fetchPendingApproval(), 8_000);
    return () => clearInterval(id);
  }, [tab, fetchPendingApproval]);

  useEffect(() => {
    const IDLE_MS = 30 * 60 * 1000;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        await fetch("/api/admin/auth", { method: "DELETE" });
        router.push("/admin/login");
      }, IDLE_MS);
    };
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"] as const;
    events.forEach(e => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => { clearTimeout(timer); events.forEach(e => window.removeEventListener(e, reset)); };
  }, [router]);

  async function handleLogout() {
    await fetch("/api/admin/auth", { method: "DELETE" });
    router.push("/admin/login");
  }

  return (
    <div className="admin-shell min-w-0 overflow-x-hidden" style={{ minHeight: "100vh", background: BG }}>
      <Sidebar
        tab={tab} setTab={setTab}
        pendingOrders={stats?.orders.pending ?? 0}
        pendingAgents={stats?.agents.pending ?? 0}
        pendingApproval={stats?.orders.pendingApproval ?? 0}
        onLogout={handleLogout}
        onChangePassword={() => setShowChangePw(true)}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />
      {showChangePw && <ChangePasswordModal onClose={() => setShowChangePw(false)} />}
      {mobileSidebarOpen && <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={() => setMobileSidebarOpen(false)} />}

      <div className="md:ml-60 flex min-w-0 flex-col min-h-screen">
        <header className="px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 z-30 border-b backdrop-blur-sm" style={{ background: "rgba(8,15,30,0.92)", borderColor: BORDER }}>
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileSidebarOpen(true)} className="md:hidden p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
              <Ic.menu />
            </button>
            <div className="hidden sm:flex items-center gap-2">
              <span className="text-xs text-slate-600 font-semibold">Elite Data</span>
              <span className="text-slate-700">/</span>
              <span className="text-xs font-bold text-white">{pageTitle[tab] ?? "Dashboard"}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button aria-label="Open operations alerts" onClick={() => setTab("operations")} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"><Ic.bell /></button>
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

        {stats && stats.orders.pendingApproval > 0 && tab !== "approval-queue" && (
          <button onClick={() => setTab("approval-queue")} className="w-full flex items-center gap-3 px-4 sm:px-6 py-2.5 text-left transition-opacity hover:opacity-90" style={{ background: "rgba(245,158,11,0.12)", borderBottom: "1px solid rgba(245,158,11,0.3)" }}>
            <span className="w-2 h-2 rounded-full flex-shrink-0 animate-pulse" style={{ background: "#f59e0b" }} />
            <span className="text-sm font-bold" style={{ color: "#fbbf24" }}>
              {stats.orders.pendingApproval} order{stats.orders.pendingApproval > 1 ? "s" : ""} awaiting your approval
            </span>
            <span className="ml-auto text-xs font-semibold" style={{ color: "#f59e0b" }}>Review →</span>
          </button>
        )}

        <main className="min-w-0 flex-1 px-3 sm:px-6 py-4 sm:py-5 pb-28 md:pb-5">
          {statsError && (
            <div style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 12, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ color: "#f87171", fontSize: 13, fontWeight: 700, flex: 1 }}>Dashboard error: {statsError}</span>
              <button onClick={() => void fetchStats()} style={{ background: "rgba(239,68,68,0.2)", color: "#f87171", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 8, padding: "4px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Retry</button>
            </div>
          )}
          {loadingStats && !stats ? (
            <div className="flex flex-col items-center justify-center py-40 gap-4">
              <div className="w-10 h-10 border-4 border-[#3b82f6] border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-500">Loading dashboard…</p>
            </div>
          ) : stats ? (
            <>
              {tab === "overview"          && <Dashboard stats={stats} animated={animated} onNavigate={setTab} />}
              {isOrderTab(tab)             && <OrdersView key={tab} orders={tab === "approval-queue" ? pendingOrders : stats.orders.all} onRefresh={tab === "approval-queue" ? fetchPendingApproval : fetchStats} defaultFilter={tabToOrderFilter[tab]} />}
              {tab === "data-bundles"      && <PricesView />}
              {tab === "bundle-prices"     && <AgentPricesAdmin allAgents={stats.agents.all} />}
              {isAgentTab(tab)             && <AgentsView key={tab === "agent-applications" ? "pending" : "approved"} stats={stats} onRefresh={fetchStats} defaultTab={tab === "agent-applications" ? "pending" : "approved"} />}
              {tab === "agent-wallets"     && <AgentWalletsAdmin />}
              {(tab === "leaderboard" || tab === "referrals" || tab === "agent-ranks") && <LeaderboardView stats={stats} />}
              {tab === "transactions"      && <PnLView orders={stats.orders.all} agents={stats.agents.all} />}
              {tab === "commissions"       && <CommissionAdmin />}
              {tab === "manual"            && <ManualOrdersAdmin />}
              {tab === "refund-numbers"    && <RefundNumbers />}
              {tab === "compensate"        && <CompensateView />}
              {(tab === "announcements" || tab === "notifications") && <AnnouncementsAdmin />}
              {tab === "promo"             && <PromoBannerAdmin />}
              {tab === "sms"               && <SMSAdmin agents={stats.agents.all} />}
              {(tab === "apikeys" || tab === "developer-api") && <ApiKeysAdmin />}
              {tab === "settings"          && <SettingsView onChangePassword={() => setShowChangePw(true)} />}
              {tab === "customers"         && <CustomersAdmin />}
              {tab === "mashup-bundles"    && <MashupBundlesAdmin />}
              {tab === "network-providers" && <NetworkProvidersAdmin />}
              {tab === "coupons"           && <CouponsAdmin />}
              {tab === "withdrawals"       && <WithdrawalsAdmin />}
              {tab === "analytics"         && <AnalyticsAdmin orders={stats.orders.all as never} />}
              {tab === "paystack-split"    && <PaystackSplitAdmin />}
              {tab === "operations"        && <OperationsCenter />}
            </>
          ) : null}
        </main>
      </div>

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
                  borderRadius: 999, background: active ? "rgba(59,130,246,0.18)" : "transparent",
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
