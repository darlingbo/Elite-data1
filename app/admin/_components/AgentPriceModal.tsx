"use client";
import { useState, useEffect } from "react";
import { bundles as defaultBundles } from "@/lib/bundles";

interface AgentPriceModalProps {
  agentId: string;
  agentName: string;
  onClose: () => void;
}

export default function AgentPriceModal({ agentId, agentName, onClose }: AgentPriceModalProps) {
  const [priceMap, setPriceMap] = useState<Record<string, number>>({});
  const [adminPrices, setAdminPrices] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState<{ bundleId: string; val: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/bundles").then(r => r.json()),
      fetch(`/api/agents/prices?agentId=${agentId}`).then(r => r.json()),
    ]).then(([b, p]) => {
      const ap: Record<string, number> = {};
      for (const bundle of (b.bundles ?? [])) ap[bundle.id] = bundle.price;
      setAdminPrices(ap);
      const pm: Record<string, number> = {};
      for (const row of (p.prices ?? [])) pm[row.bundle_id] = row.custom_price;
      setPriceMap(pm);
      setLoading(false);
    });
  }, [agentId]);

  async function savePrice(bundleId: string, customPrice: number) {
    const adminPrice = adminPrices[bundleId] ?? 0;
    if (customPrice < adminPrice) return;
    setSaving(true);
    await fetch("/api/agents/prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId, bundleId, customPrice }),
    });
    const res = await fetch(`/api/agents/prices?agentId=${agentId}`);
    const d = await res.json();
    const pm: Record<string, number> = {};
    for (const row of (d.prices ?? [])) pm[row.bundle_id] = row.custom_price;
    setPriceMap(pm);
    setEditing(null);
    setSaving(false);
  }

  const netColors: Record<string, string> = {
    mtn: "text-yellow-400",
    telecel: "text-red-400",
    airteltigo: "text-blue-400",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="rounded-2xl shadow-2xl w-full max-w-xl border border-[#1e3050] flex flex-col" style={{ background: "#162032", maxHeight: "90vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e3050] shrink-0">
          <div>
            <h3 className="font-black text-white text-base">{agentName} — Bundle Prices</h3>
            <p className="text-xs text-slate-400 mt-0.5">Set how much this agent charges their customers</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Info strip */}
        <div className="px-5 py-2.5 border-b border-[#1e3050] shrink-0" style={{ background: "#0e1928" }}>
          <p className="text-xs text-slate-400">
            Agent profit = their price − your base price &nbsp;·&nbsp; Your profit = base price − cost price
          </p>
        </div>

        {/* Bundle list */}
        <div className="overflow-y-auto flex-1 px-5 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-7 h-7 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-1">
              {defaultBundles.map(b => {
                const adminBase = adminPrices[b.id] ?? b.price;
                const current = priceMap[b.id];
                const isEditing = editing?.bundleId === b.id;
                const agentProfit = current ? (current - adminBase) : null;

                return (
                  <div key={b.id} className="flex items-center gap-3 py-2.5 border-b border-[#1e3050]/50 last:border-0">
                    <span className={`text-xs font-black w-10 shrink-0 ${netColors[b.network] ?? "text-slate-400"}`}>
                      {b.network === "airteltigo" ? "AT" : b.network.toUpperCase()}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-semibold">{b.size}</p>
                      <p className="text-slate-500 text-xs">
                        Base: GH₵{adminBase.toFixed(2)}
                        {agentProfit !== null && agentProfit > 0 && (
                          <span className="text-green-400 ml-2">· Agent +GH₵{agentProfit.toFixed(2)}</span>
                        )}
                      </p>
                    </div>
                    {isEditing ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <input
                          type="number" step="0.5" min={adminBase}
                          value={editing.val}
                          autoFocus
                          onChange={e => setEditing(p => p ? { ...p, val: e.target.value } : p)}
                          className="w-20 px-2 py-1 rounded-lg text-sm text-white border border-blue-500 focus:outline-none text-right"
                          style={{ background: "#0e1928" }}
                        />
                        <button
                          onClick={() => savePrice(b.id, parseFloat(editing.val))}
                          disabled={saving || parseFloat(editing.val) < adminBase}
                          className="text-xs font-bold text-green-400 hover:text-green-300 disabled:opacity-40">
                          {saving ? "…" : "Save"}
                        </button>
                        <button onClick={() => setEditing(null)} className="text-xs text-slate-500 hover:text-slate-300">✕</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setEditing({ bundleId: b.id, val: String(current ?? adminBase) })}
                        className={`text-sm font-bold px-3 py-1 rounded-lg transition-colors shrink-0 ${current ? "text-green-400 hover:bg-green-900/30" : "text-slate-500 hover:bg-[#1e3050]"}`}>
                        {current ? `GH₵${Number(current).toFixed(2)}` : "Not set"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-[#1e3050] shrink-0">
          <button onClick={onClose} className="w-full text-sm font-bold text-slate-400 hover:text-white transition-colors py-2">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
