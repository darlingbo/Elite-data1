"use client";
import { useState, useEffect } from "react";

const CARD = "#111827", BORDER = "#1f2937";

type RoutedProvider = "inventor" | "datacity" | "datify";
interface RoutingRule { id: string; match: string; provider: RoutedProvider; label?: string; }

const PROVIDER_META: Record<RoutedProvider, { icon: string; label: string; color: string }> = {
  inventor: { icon: "🚀", label: "Inventor",  color: "#4ade80" },
  datacity: { icon: "🌍", label: "DataCity",  color: "#60a5fa" },
  datify:   { icon: "📡", label: "Datify",    color: "#a78bfa" },
};

interface ProviderData {
  inventorBalance:  number | null;
  datacityBalance:  number | null;
  datifyBalance:    number | null;
  inventorEnabled:  boolean;
  datacityEnabled:  boolean;
  datifyEnabled:    boolean;
}

const PROVIDERS = [
  { key: "inventor",  label: "Inventor",  role: "Primary",          icon: "🚀", enabledKey: "inventorEnabled",  balKey: "inventorBalance"  },
  { key: "datacity",  label: "DataCity",  role: "Fallback #1",      icon: "🌍", enabledKey: "datacityEnabled",  balKey: "datacityBalance"  },
  { key: "datify",    label: "Datify",    role: "Fallback #2",      icon: "📡", enabledKey: "datifyEnabled",    balKey: "datifyBalance"    },
] as const;

function Toggle({ checked, saving, onChange }: { checked: boolean; saving: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      disabled={saving}
      className="relative inline-flex items-center h-6 rounded-full w-11 transition-colors shrink-0 disabled:opacity-50"
      style={{ background: checked ? "#16a34a" : "#374151" }}>
      <span className="inline-block w-5 h-5 transform rounded-full bg-white shadow transition-transform"
        style={{ transform: checked ? "translateX(22px)" : "translateX(2px)" }} />
    </button>
  );
}

function BalanceDisplay({ bal }: { bal: number | null }) {
  if (bal === null) return <span style={{ color: "#f87171" }}>Unreachable</span>;
  const ok = bal > 50;
  const warn = bal > 0;
  return (
    <span style={{ color: ok ? "#4ade80" : warn ? "#fbbf24" : "#f87171" }}>
      GH₵{bal.toFixed(2)}
      <span className="ml-1 text-xs" style={{ color: ok ? "#4ade80" : warn ? "#fbbf24" : "#f87171" }}>
        {ok ? "OK" : warn ? "LOW" : "EMPTY"}
      </span>
    </span>
  );
}

export default function NetworkProvidersAdmin() {
  const [data, setData] = useState<ProviderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  // Number routing state
  const [rules, setRules]               = useState<RoutingRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [newMatch, setNewMatch]         = useState("");
  const [newProvider, setNewProvider]   = useState<RoutedProvider>("inventor");
  const [newLabel, setNewLabel]         = useState("");
  const [rulesSaving, setRulesSaving]   = useState(false);

  async function load() {
    setLoading(true);
    const r = await fetch("/api/admin/network-providers").then(r => r.json());
    setData(r);
    setLoading(false);
  }

  async function loadRules() {
    setRulesLoading(true);
    const r = await fetch("/api/admin/phone-routing").then(r => r.json()).catch(() => ({ rules: [] }));
    setRules(r.rules ?? []);
    setRulesLoading(false);
  }

  async function addRule() {
    if (!newMatch.trim()) return;
    setRulesSaving(true);
    const r = await fetch("/api/admin/phone-routing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ match: newMatch.trim(), provider: newProvider, label: newLabel.trim() || undefined }),
    }).then(r => r.json());
    setRules(r.rules ?? rules);
    setNewMatch(""); setNewLabel("");
    setRulesSaving(false);
    setToast("Rule added");
    setTimeout(() => setToast(""), 2500);
  }

  async function deleteRule(id: string) {
    setRules(prev => prev.filter(r => r.id !== id));
    await fetch("/api/admin/phone-routing", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setToast("Rule removed");
    setTimeout(() => setToast(""), 2500);
  }

  useEffect(() => { load(); loadRules(); }, []);

  async function toggleProvider(key: "inventorEnabled" | "datacityEnabled" | "datifyEnabled", value: boolean) {
    if (!data) return;
    setData(prev => prev ? { ...prev, [key]: value } : prev);
    setSaving(key);
    await fetch("/api/admin/network-providers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: value }),
    });
    setSaving(null);
    setToast(value ? "Provider enabled" : "Provider disabled");
    setTimeout(() => setToast(""), 2500);
  }

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const inv = data?.inventorEnabled ?? true;
  const dc  = data?.datacityEnabled ?? true;
  const dt  = data?.datifyEnabled   ?? true;

  // Determine which provider is "live" for the flow diagram label
  const activeLabel = inv ? "Inventor" : dc ? "DataCity" : dt ? "Datify" : "None";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-black text-white">Network Providers</h1>
        <p className="text-sm mt-1" style={{ color: "#64748b" }}>
          Orders are delivered sequentially — if a provider fails, the next one tries automatically.
        </p>
      </div>

      {/* Fallback chain diagram */}
      <div className="rounded-2xl border p-5" style={{ background: CARD, borderColor: BORDER }}>
        <h2 className="font-bold text-white mb-1">Sequential Fallback Chain</h2>
        <p className="text-sm mb-5" style={{ color: "#64748b" }}>
          Each provider is only called if the previous one definitively rejected the order.
          A timeout stops the chain — no double delivery.
        </p>

        <div className="flex items-center justify-center gap-2 flex-wrap mb-5">
          {/* Customer */}
          <div className="flex flex-col items-center gap-1">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl border" style={{ background: "#1f2937", borderColor: BORDER }}>🛒</div>
            <p className="text-xs font-bold text-white">Customer</p>
            <p className="text-[10px]" style={{ color: "#64748b" }}>Order</p>
          </div>

          {PROVIDERS.map((p, i) => {
            const enabled = data?.[p.enabledKey] ?? true;
            return (
              <div key={p.key} className="flex items-center gap-2">
                <div className="flex flex-col items-center gap-0.5" style={{ color: "#94a3b8" }}>
                  <span className="text-xs">→</span>
                  {i > 0 && <span className="text-[9px]" style={{ color: "#f59e0b" }}>if fails</span>}
                </div>
                <div className="flex flex-col items-center gap-1">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl border"
                    style={{ background: enabled ? (i === 0 ? "#0c2a0c" : i === 1 ? "#0c1e3a" : "#1a0c3a") : "#1a1a1a", borderColor: enabled ? (i === 0 ? "#16a34a" : i === 1 ? "#3b82f6" : "#8b5cf6") : BORDER, opacity: enabled ? 1 : 0.4 }}>
                    {p.icon}
                  </div>
                  <p className="text-xs font-bold text-white">{p.label}</p>
                  <p className="text-[10px]" style={{ color: "#64748b" }}>{p.role}</p>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: enabled ? "#0c2a0c" : "#1f2937", color: enabled ? "#4ade80" : "#6b7280" }}>
                    {enabled ? "ON" : "OFF"}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Delivered */}
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: "#94a3b8" }}>→</span>
            <div className="flex flex-col items-center gap-1">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl border" style={{ background: "#0c2a0c", borderColor: "#16a34a" }}>✅</div>
              <p className="text-xs font-bold text-white">Data</p>
              <p className="text-[10px]" style={{ color: "#64748b" }}>Delivered</p>
            </div>
          </div>
        </div>

        <p className="text-center text-sm" style={{ color: "#94a3b8" }}>
          Primary provider: <span className="font-bold" style={{ color: "#4ade80" }}>{activeLabel}</span>
        </p>
      </div>

      {/* Provider cards */}
      <div className="grid grid-cols-1 gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        {PROVIDERS.map((p, i) => {
          const enabled = data?.[p.enabledKey] ?? true;
          const bal     = data?.[p.balKey]     ?? null;
          const accentOn  = i === 0 ? "#16a34a" : i === 1 ? "#3b82f6" : "#8b5cf6";
          const bgOn      = i === 0 ? "#0c2a0c" : i === 1 ? "#0c1e3a" : "#1a0c3a";
          const enableKey = p.enabledKey;

          return (
            <div key={p.key} className="rounded-2xl border p-5" style={{ background: CARD, borderColor: BORDER, opacity: enabled ? 1 : 0.7 }}>
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{p.icon}</span>
                  <div>
                    <p className="font-bold text-white">{p.label}</p>
                    <p className="text-xs" style={{ color: "#64748b" }}>{p.role}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-2 py-1 rounded-full"
                    style={{ background: enabled ? bgOn : "#1f2937", color: enabled ? accentOn : "#6b7280" }}>
                    {enabled ? "ONLINE" : "OFF"}
                  </span>
                  <Toggle
                    checked={enabled}
                    saving={saving === enableKey}
                    onChange={(v) => toggleProvider(enableKey, v)}
                  />
                </div>
              </div>

              {/* Stats */}
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <span style={{ color: "#94a3b8" }}>Wallet Balance</span>
                  <span className="font-black"><BalanceDisplay bal={bal} /></span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: "#94a3b8" }}>Fallback order</span>
                  <span className="text-white">#{i + 1} — {i === 0 ? "Primary" : `Fallback #${i}`}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: "#94a3b8" }}>Called when</span>
                  <span className="text-white text-xs text-right" style={{ maxWidth: 160 }}>
                    {i === 0 ? "Always (first try)" : `Provider${i === 1 ? " #1" : "s #1–2"} ${i === 1 ? "rejects" : "both reject"}`}
                  </span>
                </div>
              </div>

              <button onClick={load}
                className="mt-4 w-full border font-bold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2"
                style={{ borderColor: "#1e3a5f", color: "#60a5fa", background: "transparent" }}>
                🔄 Refresh Balance
              </button>
            </div>
          );
        })}
      </div>

      {/* Number Routing */}
      <div className="rounded-2xl border p-5" style={{ background: CARD, borderColor: BORDER }}>
        <h2 className="font-bold text-white mb-1">📍 Number Routing</h2>
        <p className="text-sm mb-5" style={{ color: "#64748b" }}>
          Pin a phone number or prefix to one provider. Those numbers skip the fallback chain — only that provider is called.
        </p>

        {/* Add rule */}
        <div className="flex flex-col gap-2 mb-5">
          <div className="flex gap-2 flex-wrap">
            <input
              placeholder="Number or prefix — e.g. 0241234567 or 024"
              value={newMatch}
              onChange={e => setNewMatch(e.target.value)}
              style={{ flex: 1, minWidth: 180, background: "#0d1117", border: "1px solid #374151", borderRadius: 10, padding: "10px 14px", fontSize: 14, color: "white", outline: "none" }}
            />
            <select
              value={newProvider}
              onChange={e => setNewProvider(e.target.value as RoutedProvider)}
              style={{ background: "#0d1117", border: "1px solid #374151", borderRadius: 10, padding: "10px 14px", fontSize: 14, color: "white", outline: "none" }}>
              <option value="inventor">🚀 Inventor</option>
              <option value="datacity">🌍 DataCity</option>
              <option value="datify">📡 Datify</option>
            </select>
          </div>
          <div className="flex gap-2">
            <input
              placeholder="Note (optional) — e.g. MTN corporate SIM"
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              style={{ flex: 1, background: "#0d1117", border: "1px solid #374151", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "white", outline: "none" }}
            />
            <button
              onClick={addRule}
              disabled={rulesSaving || !newMatch.trim()}
              style={{ background: "#3b82f6", color: "white", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 800, fontSize: 14, cursor: "pointer", opacity: rulesSaving || !newMatch.trim() ? 0.5 : 1, whiteSpace: "nowrap" }}>
              {rulesSaving ? "Saving…" : "+ Add Rule"}
            </button>
          </div>
        </div>

        {/* Rules list */}
        {rulesLoading ? (
          <p style={{ color: "#64748b", fontSize: 13 }}>Loading…</p>
        ) : rules.length === 0 ? (
          <div style={{ background: "#0d1117", border: "1px solid #1f2937", borderRadius: 12, padding: "20px", textAlign: "center" }}>
            <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>No routing rules. All numbers use the sequential fallback chain.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {rules.map(rule => {
              const pm = PROVIDER_META[rule.provider];
              return (
                <div key={rule.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "#0d1117", border: "1px solid #1f2937", borderRadius: 12, padding: "12px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                    <span style={{ fontFamily: "monospace", fontWeight: 800, color: "white", fontSize: 14 }}>{rule.match}</span>
                    <span style={{ color: "#4b5563" }}>→</span>
                    <span style={{ fontWeight: 700, color: pm.color }}>{pm.icon} {pm.label}</span>
                    {rule.label && <span style={{ fontSize: 11, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rule.label}</span>}
                  </div>
                  <button
                    onClick={() => deleteRule(rule.id)}
                    style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171", borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                    ✕ Remove
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* How it works */}
      <div className="rounded-2xl border p-5" style={{ background: "#0e1928", borderColor: "#1e3050" }}>
        <p className="font-bold mb-3" style={{ color: "#60a5fa" }}>ℹ️ How Sequential Fallback Works</p>
        <div className="space-y-1.5 text-sm">
          {[
            ["Step 1:",       "Order goes to Inventor first."],
            ["Step 2:",       "If Inventor definitively rejects (not timeout), DataCity tries next."],
            ["Step 3:",       "If DataCity also rejects, Datify tries last."],
            ["Timeout rule:", "If any provider times out, the chain STOPS — order stays as processing. No double delivery."],
            ["Disabled:",     "Any provider toggled OFF is skipped entirely — next one is tried immediately."],
            ["All fail:",     "Admin gets a WhatsApp + Telegram alert to deliver manually."],
          ].map(([k, v]) => (
            <p key={k} style={{ color: "#94a3b8" }}><span className="font-semibold text-white">{k}</span> {v}</p>
          ))}
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 px-4 py-2 rounded-xl font-bold text-sm shadow-lg z-50"
          style={{ background: "#0c2a0c", color: "#4ade80", border: "1px solid #16a34a" }}>
          ✓ {toast}
        </div>
      )}
    </div>
  );
}
