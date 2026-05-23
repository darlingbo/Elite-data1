"use client";
import { useState, useEffect } from "react";
import { bundles as defaultBundles } from "@/lib/bundles";

interface AgentPrice {
  bundle_id: string;
  custom_price: number;
  active: boolean;
}
interface CustomAgent {
  id: string;
  name: string;
  email: string;
  phone: string;
  referral_code: string;
  status: string;
  commission_balance: number;
  total_sales: number;
  agent_type: string;
}

export default function CustomAgentsView() {
  const [agents, setAgents] = useState<CustomAgent[]>([]);
  const [prices, setPrices] = useState<Record<string, AgentPrice[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingPrice, setEditingPrice] = useState<{ agentId: string; bundleId: string; val: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/stats")
      .then(r => r.json())
      .then(d => {
        const custom = (d.agents?.all ?? []).filter((a: CustomAgent) => a.agent_type === "custom_price");
        setAgents(custom);
        setLoading(false);
      });
  }, []);

  async function loadPrices(agentId: string) {
    if (prices[agentId]) return;
    const res = await fetch(`/api/agents/prices?agentId=${agentId}`);
    const d = await res.json();
    setPrices(p => ({ ...p, [agentId]: d.prices ?? [] }));
  }

  async function savePrice(agentId: string, bundleId: string, customPrice: number) {
    setSaving(true);
    await fetch("/api/agents/prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId, bundleId, customPrice }),
    });
    const res = await fetch(`/api/agents/prices?agentId=${agentId}`);
    const d = await res.json();
    setPrices(p => ({ ...p, [agentId]: d.prices ?? [] }));
    setEditingPrice(null);
    setSaving(false);
  }

  function toggleAgent(agentId: string) {
    if (expanded === agentId) { setExpanded(null); return; }
    setExpanded(agentId);
    loadPrices(agentId);
  }

  const netColors: Record<string, string> = { mtn: "text-yellow-600", telecel: "text-red-600", airteltigo: "text-blue-600" };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;

  if (!agents.length) return (
    <div className="text-center py-20">
      <p className="text-slate-400 text-lg font-semibold">No custom-price agents yet</p>
      <p className="text-slate-500 text-sm mt-1">Agents who register with "Set My Own Prices" will appear here.</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-black text-lg">Custom Price Agents</h2>
          <p className="text-slate-400 text-sm">{agents.length} agent{agents.length !== 1 ? "s" : ""} — set or override their bundle prices</p>
        </div>
      </div>

      {agents.map(agent => {
        const agentPriceMap = Object.fromEntries((prices[agent.id] ?? []).map(p => [p.bundle_id, p.custom_price]));
        const isExpanded = expanded === agent.id;

        return (
          <div key={agent.id} className="rounded-2xl border border-[#1e3050] overflow-hidden" style={{ background: "#162032" }}>
            {/* Agent row */}
            <button onClick={() => toggleAgent(agent.id)} className="w-full flex items-center gap-4 px-5 py-4 hover:bg-[#1e3050]/40 transition-colors text-left">
              <div className="w-10 h-10 rounded-full flex items-center justify-center font-black text-white shrink-0"
                style={{ background: "linear-gradient(135deg,#8b5cf6,#6d28d9)" }}>
                {agent.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-sm">{agent.name}</p>
                <p className="text-slate-400 text-xs">{agent.email} · <span className="font-mono">{agent.referral_code}</span></p>
              </div>
              <div className="text-right shrink-0 mr-2">
                <p className="text-xs text-slate-400">Sales</p>
                <p className="text-white font-bold">{agent.total_sales}</p>
              </div>
              <span className={`text-xs font-bold px-2 py-1 rounded-full shrink-0 ${agent.status === "approved" ? "bg-green-900/50 text-green-400" : "bg-amber-900/50 text-amber-400"}`}>
                {agent.status}
              </span>
              <svg className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Prices panel */}
            {isExpanded && (
              <div className="border-t border-[#1e3050] px-5 py-4">
                <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-4">Bundle Prices — click a price to edit</p>
                <div className="space-y-1">
                  {defaultBundles.map(b => {
                    const current = agentPriceMap[b.id];
                    const isEditing = editingPrice?.agentId === agent.id && editingPrice?.bundleId === b.id;
                    return (
                      <div key={b.id} className="flex items-center gap-3 py-2 border-b border-[#1e3050]/50 last:border-0">
                        <span className={`text-xs font-bold w-12 shrink-0 ${netColors[b.network] ?? "text-slate-400"}`}>
                          {b.network === "airteltigo" ? "AT" : b.network.toUpperCase()}
                        </span>
                        <span className="text-slate-300 text-sm flex-1">{b.size}</span>
                        <span className="text-slate-500 text-xs">Cost: GH₵{b.costPrice.toFixed(2)}</span>
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <input type="number" step="0.5" autoFocus
                              value={editingPrice.val}
                              onChange={e => setEditingPrice(p => p ? { ...p, val: e.target.value } : p)}
                              className="w-20 px-2 py-1 rounded-lg text-sm text-white border border-blue-500 focus:outline-none"
                              style={{ background: "#0e1928" }} />
                            <button onClick={() => savePrice(agent.id, b.id, parseFloat(editingPrice.val))} disabled={saving}
                              className="text-xs font-bold text-green-400 hover:text-green-300 disabled:opacity-50">
                              {saving ? "…" : "Save"}
                            </button>
                            <button onClick={() => setEditingPrice(null)} className="text-xs text-slate-500 hover:text-slate-300">✕</button>
                          </div>
                        ) : (
                          <button onClick={() => setEditingPrice({ agentId: agent.id, bundleId: b.id, val: String(current ?? b.price) })}
                            className={`text-sm font-bold px-3 py-1 rounded-lg transition-colors ${current ? "text-green-400 hover:bg-green-900/30" : "text-slate-500 hover:bg-[#1e3050]"}`}>
                            {current ? `GH₵${Number(current).toFixed(2)}` : "Not set"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
