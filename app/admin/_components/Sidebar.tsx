"use client";
import type { Tab } from "./shared/types";
import { Ic } from "./shared/Icons";

export function Sidebar({ tab, setTab, pendingOrders, pendingAgents, pendingApproval, onLogout, onChangePassword, mobileOpen, onMobileClose }: {
  tab: Tab; setTab: (t: Tab) => void; pendingOrders: number; pendingAgents: number; pendingApproval: number;
  onLogout: () => void; onChangePassword: () => void; mobileOpen: boolean; onMobileClose: () => void;
}) {
  const sections = [
    {
      label: "AI",
      items: [
        { id: "ai-hub" as Tab, icon: <Ic.sparkles />, label: "AI Assistant" },
      ],
    },
    {
      label: "OPERATIONS",
      items: [
        { id: "reconciliation" as Tab, icon: <Ic.cash />, label: "Reconciliation" },
        { id: "operations" as Tab, icon: <Ic.sync />, label: "Health & Audit" },
      ],
    },
    {
      label: "MANAGE",
      items: [
        { id: "customers" as Tab,         icon: <Ic.agents />,  label: "Customers" },
        { id: "data-bundles" as Tab,      icon: <Ic.bundle />,  label: "Data Bundles" },
        { id: "mashup-bundles" as Tab,    icon: <Ic.bundle />,  label: "Mashup Bundles" },
        { id: "all-orders" as Tab,        icon: <Ic.orders />,  label: "Orders" },
        { id: "transactions" as Tab,      icon: <Ic.trend />,   label: "Finance Analytics" },
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
        { id: "approval-queue" as Tab,  icon: <Ic.clock />, label: "Approval Queue", badge: pendingApproval || undefined },
        { id: "pending-orders" as Tab,  icon: <Ic.clock />, label: "Pending", badge: pendingOrders || undefined },
        { id: "processing" as Tab,      icon: <Ic.sync />,  label: "Processing" },
        { id: "manual" as Tab,          icon: <Ic.edit />,  label: "Manual Orders" },
        { id: "result-checker" as Tab,  icon: <Ic.check />, label: "Result Checks" },
        { id: "refund-numbers" as Tab,  icon: <Ic.wallet />, label: "MoMo Refunds" },
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
          ? { background: "linear-gradient(90deg,rgba(37,99,235,0.24),rgba(37,99,235,0.08))", color: "#bfdbfe", boxShadow: "inset 0 0 0 1px rgba(96,165,250,0.16)" }
          : { color: "#738099" }}
        onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; (e.currentTarget as HTMLElement).style.color = "#94a3b8"; } }}
        onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = ""; (e.currentTarget as HTMLElement).style.color = "#64748b"; } }}>
        <span className="flex items-center gap-2.5">{item.icon}{item.label}</span>
        {item.badge ? <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-orange-400 text-gray-900 leading-none">{item.badge}</span> : null}
      </button>
    );
  }

  return (
    <aside className={`fixed inset-y-0 left-0 z-50 w-[88vw] max-w-72 md:w-60 flex flex-col border-r transition-transform duration-300 ${mobileOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
      style={{ background: "rgba(7,11,20,0.98)", borderColor: "#202b3d", boxShadow: "18px 0 60px rgba(0,0,0,0.24)" }}>
      <button onClick={onMobileClose} className="md:hidden absolute top-4 right-4 z-10 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
      </button>

      <div className="px-4 pt-5 pb-4 border-b" style={{ borderColor: "#202b3d" }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-white text-base shadow-lg" style={{ background: "linear-gradient(145deg,#2563eb,#0ea5e9)", boxShadow: "0 8px 24px rgba(37,99,235,0.35)" }}>E</div>
          <div>
            <p className="font-black text-white text-sm leading-none">Elite Data</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <p className="text-[10px] uppercase tracking-[0.16em]" style={{ color: "#60a5fa" }}>Control Center</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-3 pt-3 pb-1">
        <button onClick={() => { setTab("overview"); onMobileClose(); }}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all"
          style={tab === "overview"
            ? { background: "linear-gradient(90deg,rgba(37,99,235,0.24),rgba(37,99,235,0.08))", color: "#bfdbfe", boxShadow: "inset 0 0 0 1px rgba(96,165,250,0.16)" }
            : { color: "#738099" }}
          onMouseEnter={e => { if (tab !== "overview") { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; } }}
          onMouseLeave={e => { if (tab !== "overview") { (e.currentTarget as HTMLElement).style.background = ""; } }}>
          <Ic.home /> Dashboard
        </button>
      </div>

      <nav className="flex-1 px-3 py-2 overflow-y-auto space-y-4">
        {sections.map(sec => (
          <div key={sec.label}>
            <div className="flex items-center gap-2 px-3 mb-1.5">
              <div className="h-px flex-1" style={{ background: "#202b3d" }} />
              <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.18em]">{sec.label}</p>
              <div className="h-px flex-1" style={{ background: "#202b3d" }} />
            </div>
            <div className="space-y-0.5">{sec.items.map(item => <NavItem key={item.id} item={item} />)}</div>
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
