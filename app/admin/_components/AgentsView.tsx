"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import type { StatsData } from "./shared/types";
import { CARD, BORDER, BG } from "./shared/constants";

const AgentPriceModal = dynamic(() => import("./AgentPriceModal"));

export function AgentsView({ stats, onRefresh, defaultTab = "pending" }: { stats: StatsData; onRefresh: () => void; defaultTab?: "pending" | "approved" }) {
  const [agentTab, setAgentTab] = useState<"pending" | "approved">(defaultTab);
  const [agentAction, setAgentAction] = useState<{ id: string; name: string; action: "approve" | "reject" } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [pricesAgent, setPricesAgent] = useState<{ id: string; name: string } | null>(null);
  const [switchModal, setSwitchModal] = useState<{ id: string; name: string; currentType: string } | null>(null);
  const [switchTarget, setSwitchTarget] = useState<"commission" | "custom_price" | null>(null);
  const [switching, setSwitching] = useState(false);
  const [switchMsg, setSwitchMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [planModal, setPlanModal] = useState<{ id: string; name: string; currentPlan: "free" | "pro" } | null>(null);
  const [planChanging, setPlanChanging] = useState(false);

  async function handleSwitchMode() {
    if (!switchModal || !switchTarget) return;
    setSwitching(true);
    try {
      const res = await fetch("/api/admin/agents/switch-mode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId: switchModal.id, agentType: switchTarget }) });
      const d = await res.json();
      const label = switchTarget === "custom_price" ? "Set Own Price" : "Commission";
      if (d.success) { setSwitchMsg({ text: `✓ ${switchModal.name} → ${label}`, ok: true }); onRefresh(); }
      else setSwitchMsg({ text: d.error ?? "Failed", ok: false });
    } catch { setSwitchMsg({ text: "Network error", ok: false }); }
    finally { setSwitching(false); setSwitchModal(null); setSwitchTarget(null); setTimeout(() => setSwitchMsg(null), 5000); }
  }

  async function handlePlanChange() {
    if (!planModal) return;
    setPlanChanging(true);
    const newPlan = planModal.currentPlan === "free" ? "pro" : "free";
    try {
      const res = await fetch("/api/admin/agents/set-plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId: planModal.id, plan: newPlan }) });
      const d = await res.json();
      if (d.success) { setSwitchMsg({ text: `✓ ${planModal.name} is now a ${newPlan === "pro" ? "Pro" : "Free"} Agent`, ok: true }); onRefresh(); }
      else setSwitchMsg({ text: d.error ?? "Failed", ok: false });
    } catch { setSwitchMsg({ text: "Network error", ok: false }); }
    finally { setPlanChanging(false); setPlanModal(null); setTimeout(() => setSwitchMsg(null), 5000); }
  }

  async function handleAction() {
    if (!agentAction) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/agents/${agentAction.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: agentAction.action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSwitchMsg({ text: data.error ?? "Agent action failed", ok: false });
        return;
      }
      setAgentAction(null);
      onRefresh();
    } catch {
      setSwitchMsg({ text: "Network error", ok: false });
    } finally {
      setActionLoading(false);
      setTimeout(() => setSwitchMsg(null), 5000);
    }
  }

  const shown = stats.agents.all.filter(a => a.status === agentTab);

  return (
    <div className="admin-section space-y-4">
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
                  <th className="px-4 py-3 text-left font-semibold">Plan</th>
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
                <tr key={a.id} className="border-b last:border-0 hover:bg-white/2 transition-colors" style={{ borderColor: BORDER }}>
                  <td className="px-4 py-3.5 font-semibold text-white">{a.name}</td>
                  <td className="px-4 py-3.5 text-slate-400 text-xs">{a.email}</td>
                  <td className="px-4 py-3.5 font-mono text-xs text-slate-400">{a.phone}</td>
                  <td className="px-4 py-3.5 text-xs">{a.whatsapp ? <a href={`https://wa.me/${a.whatsapp.replace(/^0/, "233")}`} target="_blank" rel="noreferrer" className="text-green-400 hover:text-green-300 font-mono">{a.whatsapp}</a> : <span className="text-slate-600">—</span>}</td>
                  <td className="px-4 py-3.5 text-slate-500 text-xs">{a.business_name || "—"}</td>
                  {agentTab === "approved" && (() => {
                    const isPro = (a as { plan?: string }).plan === "pro";
                    return <>
                      <td className="px-4 py-3.5">
                        <button onClick={() => setPlanModal({ id: a.id, name: a.name, currentPlan: isPro ? "pro" : "free" })} title="Click to change plan" className="hover:opacity-80 transition-opacity">
                          {isPro
                            ? <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: "rgba(245,158,11,0.15)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.35)" }}>⭐ Pro ⇄</span>
                            : <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: "rgba(100,116,139,0.15)", color: "#94a3b8", border: "1px solid rgba(100,116,139,0.3)" }}>Free ⇄</span>}
                        </button>
                      </td>
                      <td className="px-4 py-3.5">
                        <button onClick={() => { setSwitchTarget(null); setSwitchModal({ id: a.id, name: a.name, currentType: a.agent_type ?? "commission" }); }} title="Change earning type" className="hover:opacity-70 transition-opacity">
                          {a.agent_type === "custom_price"
                            ? <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(139,92,246,0.15)", color: "#a78bfa", border: "1px solid rgba(139,92,246,0.3)" }}>Set Price ⇄</span>
                            : <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(16,185,129,0.1)", color: "#4ade80", border: "1px solid rgba(16,185,129,0.25)" }}>Commission ⇄</span>}
                        </button>
                      </td>
                      <td className="px-4 py-3.5 font-bold text-white">{a.total_sales}</td>
                      <td className="px-4 py-3.5 font-black" style={{ color: "#4ade80" }}>GH₵{(a.commission_balance ?? 0).toFixed(2)}</td>
                      <td className="px-4 py-3.5 font-mono text-xs font-bold" style={{ color: "#60a5fa" }}>{a.referral_code}</td>
                    </>;
                  })()}
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

      {planModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="rounded-2xl shadow-2xl w-full max-w-sm p-6 border" style={{ background: CARD, borderColor: BORDER }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl" style={{ background: planModal.currentPlan === "free" ? "rgba(245,158,11,0.15)" : "rgba(100,116,139,0.15)" }}>
                {planModal.currentPlan === "free" ? "⭐" : "🔓"}
              </div>
              <div>
                <h3 className="font-black text-white text-base">Change Agent Plan</h3>
                <p className="text-slate-400 text-xs">{planModal.name}</p>
              </div>
            </div>
            <div className="rounded-xl p-4 mb-5 border" style={{ background: "#060f1c", borderColor: BORDER }}>
              <div className="flex items-center justify-between mb-3">
                <div className="text-center flex-1">
                  <p className="text-xs text-slate-500 mb-1">Current</p>
                  <span className="text-sm font-bold px-3 py-1 rounded-full" style={planModal.currentPlan === "free" ? { background: "rgba(100,116,139,0.15)", color: "#94a3b8", border: "1px solid rgba(100,116,139,0.3)" } : { background: "rgba(245,158,11,0.15)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.35)" }}>
                    {planModal.currentPlan === "free" ? "Free Agent" : "⭐ Pro Agent"}
                  </span>
                </div>
                <div className="text-slate-600 text-lg px-3">→</div>
                <div className="text-center flex-1">
                  <p className="text-xs text-slate-500 mb-1">New</p>
                  <span className="text-sm font-bold px-3 py-1 rounded-full" style={planModal.currentPlan === "free" ? { background: "rgba(245,158,11,0.15)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.35)" } : { background: "rgba(100,116,139,0.15)", color: "#94a3b8", border: "1px solid rgba(100,116,139,0.3)" }}>
                    {planModal.currentPlan === "free" ? "⭐ Pro Agent" : "Free Agent"}
                  </span>
                </div>
              </div>
              <p className="text-slate-500 text-xs text-center">
                {planModal.currentPlan === "free"
                  ? "Pro agents get wholesale buy prices set by you (admin) instead of the automatic 4% discount."
                  : "Free agents get a 4% discount off the customer price as their buy price."}
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setPlanModal(null)} className="flex-1 border text-slate-400 font-semibold py-2.5 rounded-xl text-sm hover:text-white transition-colors" style={{ borderColor: BORDER }}>Cancel</button>
              <button onClick={handlePlanChange} disabled={planChanging}
                className="flex-1 text-white font-bold py-2.5 rounded-xl text-sm disabled:opacity-60 transition-all"
                style={{ background: planModal.currentPlan === "free" ? "linear-gradient(90deg,#d97706,#f59e0b)" : "linear-gradient(90deg,#475569,#64748b)" }}>
                {planChanging ? "Saving…" : planModal.currentPlan === "free" ? "Upgrade to Pro ⭐" : "Move to Free"}
              </button>
            </div>
          </div>
        </div>
      )}
      {switchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="rounded-2xl shadow-2xl w-full max-w-sm p-6 border" style={{ background: CARD, borderColor: BORDER }}>
            <h3 className="font-black text-white text-lg mb-1">Change Earning Type</h3>
            <p className="text-sm text-slate-400 mb-1">Select earning type for <span className="text-white font-bold">{switchModal.name}</span></p>
            <p className="text-xs text-slate-600 mb-4">Plan (Free/Pro) is changed separately with the plan badge.</p>
            <div className="flex flex-col gap-2 mb-5">
              {([
                { type: "commission",   label: "Commission",    desc: "Earns % split of admin profit. Sells at admin prices.",      color: "#60a5fa", bg: "rgba(59,130,246,0.12)",  border: "rgba(59,130,246,0.35)" },
                { type: "custom_price", label: "Set Own Price", desc: "Sets own prices above admin price. Profit = markup above base.", color: "#a78bfa", bg: "rgba(124,58,237,0.12)", border: "rgba(124,58,237,0.35)" },
              ] as { type: "commission" | "custom_price"; label: string; desc: string; color: string; bg: string; border: string }[]).map(opt => {
                const isCurrent = switchModal.currentType === opt.type;
                const isSelected = switchTarget === opt.type;
                return (
                  <button key={opt.type} onClick={() => !isCurrent && setSwitchTarget(opt.type)} disabled={isCurrent}
                    className="w-full text-left rounded-xl px-4 py-3 border-2 transition-all"
                    style={{ background: isSelected ? opt.bg : "transparent", borderColor: isSelected ? opt.color : isCurrent ? opt.border : BORDER, opacity: isCurrent ? 0.5 : 1, cursor: isCurrent ? "default" : "pointer" }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-sm" style={{ color: opt.color }}>{opt.label}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{opt.desc}</p>
                      </div>
                      {isCurrent && <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: opt.bg, color: opt.color }}>Current</span>}
                      {isSelected && !isCurrent && <span className="text-xs font-bold text-white">✓</span>}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setSwitchModal(null); setSwitchTarget(null); }} disabled={switching} className="flex-1 border text-slate-400 font-semibold py-2.5 rounded-xl text-sm" style={{ borderColor: BORDER }}>Cancel</button>
              <button onClick={handleSwitchMode} disabled={switching || !switchTarget} className="flex-1 text-white font-bold py-2.5 rounded-xl text-sm disabled:opacity-40" style={{ background: "linear-gradient(90deg,#3b82f6,#7c3aed)" }}>{switching ? "Switching…" : "Confirm"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
