"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { Tab, OrderStatus, StatsData, Order } from "./_components/shared/types";
import { BG, BORDER } from "./_components/shared/constants";
import { Spinner } from "./_components/shared/Spinner";
import { Ic } from "./_components/shared/Icons";
import Icon from "@/components/ed/Icon";
import { Sidebar } from "./_components/Sidebar";
import { ChangePasswordModal } from "./_components/ChangePasswordModal";
import { CompensateView } from "./_components/CompensateView";
import { SettingsView } from "./_components/SettingsView";
import { OrdersView } from "./_components/OrdersView";
import { Dashboard } from "./_components/OverviewDashboard";

const PricesView         = dynamic(() => import("./_components/PricesView"),          { loading: () => <Spinner /> });
const PnLView            = dynamic(() => import("./_components/PnLView"),             { loading: () => <Spinner /> });
const ApiKeysAdmin       = dynamic(() => import("./_components/ApiKeysAdmin"),        { loading: () => <Spinner /> });
const AnnouncementsAdmin = dynamic(() => import("./_components/AnnouncementsAdmin"),  { loading: () => <Spinner /> });
const PromoBannerAdmin   = dynamic(() => import("./_components/PromoBannerAdmin"),    { loading: () => <Spinner /> });
const SMSAdmin           = dynamic(() => import("./_components/SMSAdmin"),            { loading: () => <Spinner /> });
const CustomersAdmin     = dynamic(() => import("./_components/CustomersAdmin"),      { loading: () => <Spinner /> });
const MashupBundlesAdmin = dynamic(() => import("./_components/MashupBundlesAdmin"),  { loading: () => <Spinner /> });
const NetworkProvidersAdmin = dynamic(() => import("./_components/NetworkProvidersAdmin"), { loading: () => <Spinner /> });
const CouponsAdmin       = dynamic(() => import("./_components/CouponsAdmin"),        { loading: () => <Spinner /> });
const AnalyticsAdmin     = dynamic(() => import("./_components/AnalyticsAdmin"),      { loading: () => <Spinner /> });
const RefundNumbers      = dynamic(() => import("./_components/RefundNumbers"),       { loading: () => <Spinner /> });
const OperationsCenter   = dynamic(() => import("./_components/OperationsCenter"),   { loading: () => <Spinner /> });
const FinancialReconciliation = dynamic(() => import("./_components/FinancialReconciliation"), { loading: () => <Spinner /> });
const AiHubView          = dynamic(() => import("./_components/AiHubView"),           { loading: () => <Spinner /> });
const ResultCheckerAdmin = dynamic(() => import("./_components/ResultCheckerAdmin"), { loading: () => <Spinner /> });
const NumberCheckAdmin   = dynamic(() => import("./_components/NumberCheckAdmin"),   { loading: () => <Spinner /> });

const tabToOrderFilter: Record<string, OrderStatus> = {
  "all-orders": "ALL", "pending-orders": "PENDING", "processing": "PROCESSING",
  "completed": "COMPLETED", "failed-orders": "FAILED", "approval-queue": "PENDING_APPROVAL",
};
const isOrderTab = (t: Tab) => t in tabToOrderFilter;

const pageTitle: Record<Tab, string> = {
  "overview": "Today", "all-orders": "All Orders", "approval-queue": "Approval Queue",
  "pending-orders": "Pending Orders", "processing": "Processing", "completed": "Completed",
  "failed-orders": "Failed Orders", "data-bundles": "Data Bundles",
  "transactions": "Finance Analytics",
  "refund-numbers": "Refunds", "compensate": "Compensate",
  "announcements": "Notifications", "notifications": "Notifications", "promo": "Promo Banner",
  "sms": "SMS Messaging", "apikeys": "API Keys", "settings": "Settings",
  "customers": "Customers", "mashup-bundles": "Mashup Bundles", "network-providers": "Network Providers",
  "coupons": "Coupons",
  "analytics": "Analytics", "developer-api": "Developer API",
  "operations": "Operations & Audit",
  "reconciliation": "Financial Reconciliation",
  "ai-hub": "AI Assistant",
  "result-checker": "Result Checker Requests",
  "mtn-verification": "Number check",
};

const pageSubtitle: Partial<Record<Tab, string>> = {
  overview: "Your business, orders, and cash flow at a glance",
  "approval-queue": "Review every paid order before delivery",
  "all-orders": "Search, verify, and manage order fulfilment",
  operations: "Reconcile warnings and review admin activity",
  reconciliation: "Compare payments, delivery, refunds, commission, cost, and profit",
  "ai-hub": "Ask questions, analyze the business, and create content safely",
  "result-checker": "Check paid BECE and WASSCE results and send them to customers on WhatsApp",
  "mtn-verification": "Checks the receiving number before payment. A number on neither list cannot pay",
  transactions: "Server-validated revenue, profit, customers, and transaction intelligence",
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
  // A phone number or reference typed into the menu search opens the order list filtered by it.
  const [orderSearch, setOrderSearch] = useState<{ q: string; key: number } | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const lastApprovalCount = useRef<number | null>(null);

  const [pendingOrders, setPendingOrders] = useState<Order[]>([]);

  function goTo(t: Tab, search?: string) {
    setTab(t);
    setOrderSearch(search ? { q: search, key: Date.now() } : null);
  }
  function findOrder(q: string) { goTo("all-orders", q); }

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
        setStats(prev => prev ? { ...prev, orders: { ...prev.orders, pendingApproval: data.orders?.length ?? 0 } } : prev);
      }
    } catch { }
  }, []);

  useEffect(() => { const t = setTimeout(() => void fetchStats(), 0); return () => clearTimeout(t); }, [fetchStats]);
  useEffect(() => { if (tab === "overview") { setTimeout(() => setAnimated(false), 0); setTimeout(() => setAnimated(true), 60); } }, [tab]);

  useEffect(() => {
    // Skip while the tab is in the background (saves Vercel CPU/invocations).
    const id = setInterval(() => { if (!document.hidden) void fetchStats(); }, 30_000);
    return () => clearInterval(id);
  }, [fetchStats]);

  // New order alert: a short beep and a buzz when more orders are waiting than before.
  useEffect(() => {
    const t = setTimeout(() => { try { setSoundOn(localStorage.getItem("ed_admin_sound") !== "off"); } catch { /* private mode */ } }, 0);
    return () => clearTimeout(t);
  }, []);
  const waitingNow = stats?.orders.pendingApproval ?? null;
  useEffect(() => {
    if (waitingNow === null) return;
    const before = lastApprovalCount.current;
    lastApprovalCount.current = waitingNow;
    document.title = waitingNow > 0 ? `(${waitingNow}) Elite Data admin` : "Elite Data admin";
    if (before === null || waitingNow <= before || !soundOn) return;
    try { navigator.vibrate?.([180, 90, 180]); } catch { /* not supported */ }
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const tone = (freq: number, at: number) => {
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.type = "sine"; osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + at);
        gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.28);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(ctx.currentTime + at); osc.stop(ctx.currentTime + at + 0.3);
      };
      tone(880, 0); tone(1175, 0.18);
      setTimeout(() => void ctx.close(), 900);
    } catch { /* the browser blocked sound until the page is tapped */ }
  }, [waitingNow, soundOn]);

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    try { localStorage.setItem("ed_admin_sound", next ? "on" : "off"); } catch { /* private mode */ }
  }

  useEffect(() => {
    if (tab !== "approval-queue") return;
    void fetchPendingApproval();
    const id = setInterval(() => { if (!document.hidden) void fetchPendingApproval(); }, 8_000);
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
        pendingApproval={stats?.orders.pendingApproval ?? 0}
        onLogout={handleLogout}
        onChangePassword={() => setShowChangePw(true)}
        onFindOrder={findOrder}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />
      {showChangePw && <ChangePasswordModal onClose={() => setShowChangePw(false)} />}
      {mobileSidebarOpen && <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={() => setMobileSidebarOpen(false)} />}

      <div className="md:ml-60 flex min-w-0 flex-col min-h-screen">
        <header className="admin-topbar px-3 sm:px-6 py-3 flex items-center justify-between sticky top-0 z-30 border-b backdrop-blur-xl" style={{ background: "rgba(7,11,20,0.82)", borderColor: BORDER }}>
          <div className="flex items-center gap-3">
            <button aria-label="Open admin menu" onClick={() => setMobileSidebarOpen(true)} className="md:hidden p-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
              <Ic.menu />
            </button>
            <span className="text-sm font-black text-white sm:hidden">{pageTitle[tab] ?? "Dashboard"}</span>
            <div className="hidden sm:flex items-center gap-2">
              <span className="text-xs text-slate-600 font-semibold">Elite Data</span>
              <span className="text-slate-700">/</span>
              <span className="text-xs font-bold text-white">{pageTitle[tab] ?? "Dashboard"}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" aria-label={soundOn ? "Turn the new order sound off" : "Turn the new order sound on"} aria-pressed={soundOn} onClick={toggleSound} className="p-2.5 rounded-xl border text-xs font-bold transition-colors" style={{ borderColor: BORDER, color: soundOn ? "#fbbf24" : "#64748b" }}>{soundOn ? "Sound on" : "Sound off"}</button>
            <div className="relative">
              <button aria-label="Open operations alerts" onClick={() => setTab("operations")} className="p-2.5 rounded-xl border text-slate-400 hover:text-white hover:bg-white/10 transition-colors" style={{ borderColor: BORDER }}><Ic.bell /></button>
              {(stats?.orders.pendingApproval ?? 0) > 0 && <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 flex items-center justify-center bg-amber-400 text-[9px] font-black text-slate-950 rounded-full ring-2 ring-[#070b14]">{stats?.orders.pendingApproval ?? 0}</span>}
            </div>
            <div className="hidden sm:flex items-center gap-2.5 border rounded-xl px-3 py-1.5" style={{ background: "rgba(15,23,42,0.7)", borderColor: BORDER }}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center font-black text-white text-xs" style={{ background: "linear-gradient(145deg,#2563eb,#0ea5e9)" }}>A</div>
              <div className="hidden sm:block text-right">
                <p className="text-xs font-bold text-white leading-none">Admin</p>
                <p className="text-[10px] text-slate-500">Super Admin</p>
              </div>
            </div>
          </div>
        </header>

        <div hidden={tab === "overview"} className="admin-page-heading px-4 sm:px-6 py-5 sm:py-6 border-b flex items-center justify-between gap-4" style={{ borderColor: BORDER }}>
          <div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white leading-none">{pageTitle[tab] ?? "Dashboard"}</h1>
            <p className="text-xs sm:text-sm mt-2" style={{ color: "#738099" }}>{pageSubtitle[tab] ?? "Manage your Elite Data business"}</p>
          </div>
          {tab === "overview" && (
            <div className="hidden sm:flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl" style={{ background: "rgba(16,185,129,0.08)", color: "#6ee7b7", border: "1px solid rgba(16,185,129,0.18)" }}>
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              Manual approval on
            </div>
          )}
        </div>

        {stats && stats.orders.pendingApproval > 0 && tab !== "approval-queue" && tab !== "overview" && (
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
              {tab === "overview"          && <Dashboard stats={stats} animated={animated} onNavigate={goTo} />}
              {isOrderTab(tab)             && <OrdersView key={`${tab}-${orderSearch?.key ?? 0}`} initialSearch={orderSearch?.q ?? ""} orders={tab === "approval-queue" ? pendingOrders : stats.orders.all} onRefresh={tab === "approval-queue" ? fetchPendingApproval : fetchStats} defaultFilter={tabToOrderFilter[tab]} />}
              {tab === "data-bundles"      && <PricesView />}
              {tab === "transactions"      && <PnLView />}
              {tab === "refund-numbers"    && <RefundNumbers />}
              {tab === "mtn-verification"  && <NumberCheckAdmin />}
              {tab === "compensate"        && <CompensateView />}
              {(tab === "announcements" || tab === "notifications") && <AnnouncementsAdmin />}
              {tab === "promo"             && <PromoBannerAdmin />}
              {tab === "sms"               && <SMSAdmin />}
              {(tab === "apikeys" || tab === "developer-api") && <ApiKeysAdmin />}
              {tab === "settings"          && <SettingsView onChangePassword={() => setShowChangePw(true)} />}
              {tab === "customers"         && <CustomersAdmin />}
              {tab === "mashup-bundles"    && <MashupBundlesAdmin />}
              {tab === "network-providers" && <NetworkProvidersAdmin />}
              {tab === "coupons"           && <CouponsAdmin />}
              {tab === "analytics"         && <AnalyticsAdmin orders={stats.orders.all as never} />}
              {tab === "operations"        && <OperationsCenter />}
              {tab === "reconciliation"    && <FinancialReconciliation />}
              {tab === "ai-hub"            && <AiHubView />}
              {tab === "result-checker"     && <ResultCheckerAdmin />}
            </>
          ) : null}
        </main>
      </div>

      <nav className="ad-bn md:hidden" aria-label="Admin navigation">
        {([
          { id: "overview" as Tab, label: "Today", icon: "grid" as const, badge: 0 },
          { id: "approval-queue" as Tab, label: "Approvals", icon: "check" as const, badge: stats?.orders.pendingApproval ?? 0 },
          { id: "all-orders" as Tab, label: "Orders", icon: "list" as const, badge: 0 },
          { id: "transactions" as Tab, label: "Money", icon: "money" as const, badge: 0 },
        ]).map(item => (
          <button key={item.id} type="button" onClick={() => goTo(item.id)} className={tab === item.id ? "on" : ""} aria-current={tab === item.id ? "page" : undefined}>
            <span style={{ position: "relative", display: "inline-flex" }}><Icon name={item.icon} />{item.badge > 0 && <em>{item.badge}</em>}</span>
            <span>{item.label}</span>
          </button>
        ))}
        <button type="button" onClick={() => setMobileSidebarOpen(true)} aria-label="Open the full menu"><Icon name="menu" /><span>Menu</span></button>
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
