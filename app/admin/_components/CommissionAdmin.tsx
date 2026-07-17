"use client";
import { useState, useEffect, useCallback } from "react";

interface AgentOverride {
  agent_id: string;
  agent_pct: number;
  note: string | null;
}

interface Agent {
  id: string;
  name: string;
  referral_code: string;
  agent_type?: string;
}

interface CommissionData {
  global_agent_pct: number;
  overrides: AgentOverride[];
  agents: Agent[];
  table_missing?: boolean;
}

export default function CommissionAdmin() {
  const [data, setData] = useState<CommissionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [globalPct, setGlobalPct] = useState(80);
  const [search, setSearch] = useState("");
  const [overrideModal, setOverrideModal] = useState<Agent | null>(null);
  const [overridePct, setOverridePct] = useState(80);
  const [overrideNote, setOverrideNote] = useState("");
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/commission-settings");
      const json = await res.json() as CommissionData & { error?: string };
      if (!res.ok || json.error) {
        setData(null);
      } else {
        setData(json);
        setGlobalPct(json.global_agent_pct ?? 80);
      }
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]); // eslint-disable-line

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  async function saveGlobal() {
    setSaving(true);
    const res = await fetch("/api/admin/commission-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "global", agent_pct: globalPct }),
    });
    setSaving(false);
    if (res.ok) {
      showToast(`✅ Global split updated — Agents: ${globalPct}% / Admin: ${100 - globalPct}%`);
      load();
    } else {
      const j = await res.json();
      showToast(`❌ ${j.error}`);
    }
  }

  async function saveOverride() {
    if (!overrideModal) return;
    setSaving(true);
    const res = await fetch("/api/admin/commission-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "agent", agent_id: overrideModal.id, agent_pct: overridePct, note: overrideNote }),
    });
    setSaving(false);
    if (res.ok) {
      showToast(`✅ Override set for ${overrideModal.name} — ${overridePct}%`);
      setOverrideModal(null);
      load();
    } else {
      const j = await res.json();
      showToast(`❌ ${j.error}`);
    }
  }

  async function removeOverride(agentId: string, agentName: string) {
    if (!confirm(`Remove override for ${agentName}? They will revert to the global rate.`)) return;
    const res = await fetch(`/api/admin/commission-settings?agentId=${agentId}`, { method: "DELETE" });
    if (res.ok) { showToast(`✅ Override removed — ${agentName} now uses global rate`); load(); }
  }

  function openOverride(agent: Agent) {
    const existing = data?.overrides.find(o => o.agent_id === agent.id);
    setOverridePct(existing?.agent_pct ?? data?.global_agent_pct ?? 80);
    setOverrideNote(existing?.note ?? "");
    setOverrideModal(agent);
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (!data) return <div className="text-red-500 p-8">Failed to load commission settings.</div>;

  const overrideMap = new Map(data.overrides.map(o => [o.agent_id, o]));
  const filtered = data.agents.filter(a =>
    !search || a.name.toLowerCase().includes(search.toLowerCase()) || (a.referral_code ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const adminPct = 100 - globalPct;

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-slate-800 text-white px-5 py-3 rounded-xl shadow-xl text-sm font-semibold animate-fade-in">
          {toast}
        </div>
      )}

      {/* Override modal */}
      {overrideModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f1f3d] rounded-2xl border border-[#1e3050] p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-white font-bold text-lg mb-1">Set Override for</h3>
            <p className="text-blue-300 font-semibold mb-5">{overrideModal.name} <span className="text-slate-500 font-normal text-sm">({overrideModal.referral_code})</span></p>

            <p className="text-slate-400 text-xs mb-2 uppercase tracking-wider font-semibold">Agent Commission %</p>
            <div className="flex items-center gap-3 mb-4">
              <button onClick={() => setOverridePct(p => Math.max(0, p - 1))}
                className="w-10 h-10 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold text-lg flex items-center justify-center">−</button>
              <div className="flex-1 text-center">
                <span className="text-4xl font-black text-white">{overridePct}</span>
                <span className="text-2xl font-black text-slate-400">%</span>
              </div>
              <button onClick={() => setOverridePct(p => Math.min(100, p + 1))}
                className="w-10 h-10 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold text-lg flex items-center justify-center">+</button>
            </div>
            <input
              type="range" min={0} max={100} value={overridePct}
              onChange={e => setOverridePct(Number(e.target.value))}
              className="w-full accent-blue-500 mb-1"
            />
            <div className="flex justify-between text-xs text-slate-500 mb-5">
              <span>Agent gets {overridePct}%</span>
              <span>Admin gets {100 - overridePct}%</span>
            </div>

            <p className="text-slate-400 text-xs mb-1 uppercase tracking-wider font-semibold">Note (optional)</p>
            <input
              value={overrideNote}
              onChange={e => setOverrideNote(e.target.value)}
              placeholder="e.g. Top performer bonus"
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm mb-5 outline-none focus:border-blue-500"
            />

            <div className="flex gap-3">
              <button onClick={() => setOverrideModal(null)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white rounded-xl py-3 text-sm font-semibold">
                Cancel
              </button>
              <button onClick={saveOverride} disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white rounded-xl py-3 text-sm font-bold disabled:opacity-60">
                {saving ? "Saving…" : "Save Override"}
              </button>
            </div>
          </div>
        </div>
      )}

      {data.table_missing && (
        <div className="bg-red-900/30 border border-red-500/40 rounded-xl p-4 text-sm">
          <p className="text-red-300 font-bold mb-2">⚠️ Commission settings table not found in Supabase</p>
          <p className="text-red-200 text-xs mb-3">Run this SQL in Supabase Dashboard → SQL Editor, then reload this page:</p>
          <pre className="text-amber-200 text-xs bg-black/40 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{`CREATE TABLE IF NOT EXISTS commission_settings (
  id text PRIMARY KEY DEFAULT 'global',
  agent_pct numeric NOT NULL DEFAULT 80,
  updated_at timestamptz DEFAULT now()
);
INSERT INTO commission_settings (id, agent_pct) VALUES ('global', 80) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS agent_commission_overrides (
  agent_id uuid PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
  agent_pct numeric NOT NULL,
  note text,
  updated_at timestamptz DEFAULT now()
);`}</pre>
        </div>
      )}

      {/* Global split card */}
      <div className="bg-gradient-to-br from-[#0f2450] to-[#0a1a35] border border-[#1e3050] rounded-2xl p-6">
        <p className="text-slate-400 text-xs uppercase tracking-wider font-semibold mb-4">Global Commission Split</p>
        <p className="text-slate-300 text-sm mb-5">This applies to ALL commission-type agents unless you set a personal override below.</p>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-green-900/20 border border-green-500/25 rounded-xl p-4 text-center">
            <p className="text-4xl font-black text-green-400">{globalPct}%</p>
            <p className="text-green-300 text-sm font-semibold mt-1">Agent Gets</p>
            <p className="text-slate-500 text-xs mt-0.5">Commission to agent</p>
          </div>
          <div className="bg-blue-900/20 border border-blue-500/25 rounded-xl p-4 text-center">
            <p className="text-4xl font-black text-blue-400">{adminPct}%</p>
            <p className="text-blue-300 text-sm font-semibold mt-1">You Get</p>
            <p className="text-slate-500 text-xs mt-0.5">Admin profit</p>
          </div>
        </div>

        <div className="flex items-center gap-4 mb-4">
          <button onClick={() => setGlobalPct(p => Math.max(0, p - 1))}
            className="w-12 h-12 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold text-xl flex items-center justify-center flex-shrink-0">−</button>
          <div className="flex-1">
            <input
              type="range" min={0} max={100} value={globalPct}
              onChange={e => setGlobalPct(Number(e.target.value))}
              className="w-full accent-blue-500"
            />
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>0% agent</span>
              <span>50 / 50</span>
              <span>100% agent</span>
            </div>
          </div>
          <button onClick={() => setGlobalPct(p => Math.min(100, p + 1))}
            className="w-12 h-12 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold text-xl flex items-center justify-center flex-shrink-0">+</button>
        </div>

        <div className="flex gap-3">
          {[60, 70, 75, 80, 85, 90].map(v => (
            <button key={v} onClick={() => setGlobalPct(v)}
              className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${globalPct === v ? "bg-blue-600 border-blue-500 text-white" : "bg-slate-800 border-slate-600 text-slate-400 hover:text-white"}`}>
              {v}%
            </button>
          ))}
        </div>

        <button onClick={saveGlobal} disabled={saving}
          className="mt-5 w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-bold rounded-xl py-3.5 text-sm transition-colors">
          {saving ? "Saving…" : `Save — Agents ${globalPct}% / Admin ${adminPct}%`}
        </button>

        {data.overrides.length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-900/15 px-4 py-3 text-xs text-amber-300">
            ⚠️ <strong>{data.overrides.length} agent{data.overrides.length !== 1 ? "s" : ""}</strong> have a personal override set below — those agents ignore the global rate and use their own %. To apply the global rate to them, click <strong>Reset</strong> on each one.
          </div>
        )}
      </div>

      {/* Per-agent overrides */}
      <div className="bg-[#0b1829] border border-[#1e3050] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1e3050] flex items-center justify-between gap-3">
          <div>
            <h3 className="text-white font-bold text-base">Per-Agent Override</h3>
            <p className="text-slate-500 text-xs mt-0.5">{data.overrides.length} override{data.overrides.length !== 1 ? "s" : ""} active</p>
          </div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search agents…"
            className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500 w-48"
          />
        </div>

        {filtered.length === 0 && (
          <p className="text-slate-500 text-sm text-center py-10">No agents found.</p>
        )}

        <div className="divide-y divide-[#1e3050]">
          {filtered.map(agent => {
            const override = overrideMap.get(agent.id);
            const effectivePct = override?.agent_pct ?? data.global_agent_pct;
            const hasOverride = !!override;

            return (
              <div key={agent.id} className="flex items-center gap-4 px-5 py-4">
                <div className="w-9 h-9 rounded-full bg-blue-900/40 border border-blue-500/30 flex items-center justify-center font-bold text-blue-300 text-sm flex-shrink-0">
                  {agent.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm truncate">{agent.name}</p>
                  <p className="text-slate-500 text-xs">{agent.referral_code} · {agent.agent_type === "custom_price" ? "Custom Price" : "Commission"}</p>
                  {override?.note && <p className="text-amber-400 text-xs mt-0.5 italic">{override.note}</p>}
                </div>
                <div className="text-right flex-shrink-0 mr-3">
                  <div className={`text-lg font-black ${hasOverride ? "text-amber-400" : "text-slate-400"}`}>
                    {effectivePct}%
                  </div>
                  <div className="text-xs text-slate-500">
                    {hasOverride ? "Override" : "Global"}
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => openOverride(agent)}
                    className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 text-blue-300 text-xs font-semibold rounded-lg transition-colors">
                    {hasOverride ? "Edit" : "Override"}
                  </button>
                  {hasOverride && (
                    <button onClick={() => removeOverride(agent.id, agent.name)}
                      className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 text-red-400 text-xs font-semibold rounded-lg transition-colors">
                      Reset
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
