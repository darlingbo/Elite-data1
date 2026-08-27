"use client";
import type { Tab } from "./shared/types";
import { Ic } from "./shared/Icons";

type Item = { id: Tab; icon: React.ReactNode; label: string; badge?: number };

export function Sidebar({ tab, setTab, pendingOrders, pendingAgents, pendingApproval, onLogout, onChangePassword, mobileOpen, onMobileClose }: {
  tab: Tab; setTab: (t: Tab) => void; pendingOrders: number; pendingAgents: number; pendingApproval: number;
  onLogout: () => void; onChangePassword: () => void; mobileOpen: boolean; onMobileClose: () => void;
}) {
  const quickAccess: Item[] = [
    { id: "result-checker", icon: <Ic.check />, label: "Result Checks" },
    { id: "approval-queue", icon: <Ic.clock />, label: "Approval Queue", badge: pendingApproval || undefined },
    { id: "processing", icon: <Ic.sync />, label: "Processing" },
    { id: "manual", icon: <Ic.edit />, label: "Manual Orders" },
    { id: "transactions", icon: <Ic.trend />, label: "Finance Analytics" },
    { id: "reconciliation", icon: <Ic.cash />, label: "Reconciliation" },
  ];

  const sections: Array<{ label: string; items: Item[] }> = [
    { label: "AI", items: [{ id: "ai-hub", icon: <Ic.sparkles />, label: "AI Assistant" }] },
    { label: "OPERATIONS", items: [
      { id: "reconciliation", icon: <Ic.cash />, label: "Reconciliation" },
      { id: "operations", icon: <Ic.sync />, label: "Health & Audit" },
    ] },
    { label: "MANAGE", items: [
      { id: "customers", icon: <Ic.agents />, label: "Customers" },
      { id: "data-bundles", icon: <Ic.bundle />, label: "Data Bundles" },
      { id: "mashup-bundles", icon: <Ic.bundle />, label: "Mashup Bundles" },
      { id: "all-orders", icon: <Ic.orders />, label: "Orders" },
      { id: "transactions", icon: <Ic.trend />, label: "Finance Analytics" },
      { id: "network-providers", icon: <Ic.sync />, label: "Network Providers" },
      { id: "coupons", icon: <Ic.tag />, label: "Coupons" },
      { id: "commissions", icon: <Ic.cash />, label: "Commissions" },
      { id: "referrals", icon: <Ic.trophy />, label: "Referrals" },
      { id: "compensate", icon: <Ic.wallet />, label: "Compensate" },
    ] },
    { label: "AGENTS", items: [
      { id: "all-agents", icon: <Ic.agents />, label: "All Agents" },
      { id: "agent-applications", icon: <Ic.add />, label: "Applications", badge: pendingAgents || undefined },
      { id: "agent-wallets", icon: <Ic.wallet />, label: "Agent Wallets" },
      { id: "withdrawals", icon: <Ic.cash />, label: "Withdrawals" },
      { id: "agent-ranks", icon: <Ic.trophy />, label: "Agent Ranks" },
      { id: "bundle-prices", icon: <Ic.tag />, label: "Agent Prices" },
    ] },
    { label: "ORDERS", items: [
      { id: "approval-queue", icon: <Ic.clock />, label: "Approval Queue", badge: pendingApproval || undefined },
      { id: "pending-orders", icon: <Ic.clock />, label: "Pending", badge: pendingOrders || undefined },
      { id: "processing", icon: <Ic.sync />, label: "Processing" },
      { id: "manual", icon: <Ic.edit />, label: "Manual Orders" },
      { id: "result-checker", icon: <Ic.check />, label: "Result Checks" },
      { id: "refund-numbers", icon: <Ic.wallet />, label: "Refunds" },
    ] },
    { label: "CONTENT", items: [
      { id: "notifications", icon: <Ic.mega />, label: "Notifications" },
      { id: "sms", icon: <Ic.sms />, label: "SMS Broadcast" },
      { id: "promo", icon: <Ic.mega />, label: "Promo Banner" },
      { id: "analytics", icon: <Ic.trend />, label: "Analytics" },
    ] },
    { label: "SETTINGS", items: [
      { id: "developer-api", icon: <Ic.key />, label: "Developer API" },
      { id: "paystack-split", icon: <Ic.cash />, label: "Paystack Split" },
      { id: "settings", icon: <Ic.gear />, label: "Settings" },
    ] },
  ];

  function open(item: Item) {
    setTab(item.id);
    onMobileClose();
  }

  function NavItem({ item, compact = false }: { item: Item; compact?: boolean }) {
    const active = tab === item.id;
    return (
      <button onClick={() => open(item)}
        className={`w-full flex items-center justify-between gap-2.5 rounded-xl font-semibold transition-all text-left ${compact ? "px-3 py-2 text-xs" : "px-3 py-2.5 text-sm"}`}
        style={active
          ? { background: "linear-gradient(90deg,rgba(37,99,235,0.24),rgba(37,99,235,0.08))", color: "#bfdbfe", boxShadow: "inset 0 0 0 1px rgba(96,165,250,0.16)" }
          : { color: "#738099" }}>
        <span className="flex min-w-0 items-center gap-2.5"><span className="shrink-0">{item.icon}</span><span className="truncate">{item.label}</span></span>
        {item.badge ? <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-orange-400 text-gray-900 leading-none">{item.badge}</span> : null}
      </button>
    );
  }

  return (
    <aside className={`fixed inset-y-0 left-0 z-50 w-[88vw] max-w-72 md:w-60 flex flex-col border-r transition-transform duration-300 ${mobileOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
      style={{ background: "rgba(7,11,20,0.98)", borderColor: "#202b3d", boxShadow: "18px 0 60px rgba(0,0,0,0.24)" }}>
      <button onClick={onMobileClose} className="md:hidden absolute top-4 right-4 z-10 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10" aria-label="Close admin menu">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
      </button>

      <div className="px-4 pt-5 pb-4 border-b" style={{ borderColor: "#202b3d" }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-white text-base shadow-lg" style={{ background: "linear-gradient(145deg,#2563eb,#0ea5e9)", boxShadow: "0 8px 24px rgba(37,99,235,0.35)" }}>E</div>
          <div><p className="font-black text-white text-sm leading-none">Elite Data</p><div className="flex items-center gap-1.5 mt-0.5"><span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /><p className="text-[10px] uppercase tracking-[0.16em]" style={{ color: "#60a5fa" }}>Control Center</p></div></div>
        </div>
      </div>

      <div className="px-3 pt-3 pb-1">
        <button onClick={() => { setTab("overview"); onMobileClose(); }} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all"
          style={tab === "overview" ? { background: "linear-gradient(90deg,rgba(37,99,235,0.24),rgba(37,99,235,0.08))", color: "#bfdbfe", boxShadow: "inset 0 0 0 1px rgba(96,165,250,0.16)" } : { color: "#738099" }}>
          <Ic.home /> Dashboard
        </button>
      </div>

      <div className="md:hidden mx-3 mt-2 rounded-2xl border p-2" style={{ borderColor: "rgba(59,130,246,0.28)", background: "rgba(37,99,235,0.07)" }}>
        <p className="px-2 pb-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-blue-400">Quick Access</p>
        <div className="grid grid-cols-2 gap-1">{quickAccess.map(item => <NavItem key={`quick-${item.id}`} item={item} compact />)}</div>
      </div>

      <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-4 overscroll-contain">
        {sections.map(sec => (
          <div key={sec.label}>
            <div className="flex items-center gap-2 px-3 mb-1.5"><div className="h-px flex-1" style={{ background: "#202b3d" }} /><p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.18em]">{sec.label}</p><div className="h-px flex-1" style={{ background: "#202b3d" }} /></div>
            <div className="space-y-0.5">{sec.items.map(item => <NavItem key={`${sec.label}-${item.id}`} item={item} />)}</div>
          </div>
        ))}
      </nav>

      <div className="border-t" style={{ borderColor: "#202b3d" }}>
        <div className="mx-3 my-3 px-3 py-2.5 rounded-xl flex items-center gap-2.5" style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)" }}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-white text-xs shrink-0" style={{ background: "linear-gradient(135deg,#3b82f6,#7c3aed)" }}>A</div>
          <div className="min-w-0"><p className="text-xs font-black text-white leading-none truncate">Administrator</p><p className="text-[10px] mt-0.5" style={{ color: "#3b82f6" }}>Super Admin</p></div>
          <span className="ml-auto text-[8px] font-black px-1.5 py-0.5 rounded-full text-green-900 bg-green-400 shrink-0">LIVE</span>
        </div>
        <div className="px-3 pb-3 space-y-0.5">
          <a href="/admin/sub-admins" className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-semibold transition-all text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"><Ic.agents /> Sub-admin Teams</a>
          <a href="/" target="_blank" rel="noreferrer" className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-semibold transition-all text-slate-500 hover:text-slate-300 hover:bg-white/5"><Ic.website /> View Website</a>
          <button onClick={onChangePassword} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-semibold text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-all"><Ic.key /> Change Password</button>
          <button onClick={onLogout} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-semibold transition-all hover:bg-red-900/20" style={{ color: "#f87171" }}><Ic.logout /> Sign Out</button>
        </div>
      </div>
    </aside>
  );
}
