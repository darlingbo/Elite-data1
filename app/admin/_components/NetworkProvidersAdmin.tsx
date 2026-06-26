"use client";
import { useState, useEffect } from "react";

const BG = "#0b1120", CARD = "#111827", BORDER = "#1f2937";

interface ProviderData {
  inventorBalance: number | null;
  datifyOverride: boolean;
  datifyStartTime: string;
  datifyEndTime: string;
  inWindow: boolean;
  datifyActive: boolean;
  activeProvider: "inventor" | "datify";
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} className="relative inline-flex items-center h-6 rounded-full w-11 transition-colors shrink-0" style={{ background: checked ? "#16a34a" : "#374151" }}>
      <span className="inline-block w-5 h-5 transform rounded-full bg-white shadow transition-transform" style={{ transform: checked ? "translateX(22px)" : "translateX(2px)" }} />
    </button>
  );
}

export default function NetworkProvidersAdmin() {
  const [data, setData] = useState<ProviderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [startTime, setStartTime] = useState("18:40");
  const [endTime, setEndTime] = useState("09:00");
  const [override, setOverride] = useState(false);

  async function load() {
    setLoading(true);
    const r = await fetch("/api/admin/network-providers").then(r => r.json());
    setData(r);
    setOverride(r.datifyOverride ?? false);
    setStartTime(r.datifyStartTime ?? "18:40");
    setEndTime(r.datifyEndTime ?? "09:00");
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function toast3(msg: string) { setToast(msg); setTimeout(() => setToast(""), 3000); }

  async function save() {
    setSaving(true);
    await fetch("/api/admin/network-providers", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ datifyOverride: override, datifyStartTime: startTime, datifyEndTime: endTime }) });
    await load();
    toast3("Saved!");
    setSaving(false);
  }

  async function toggleOverride(val: boolean) {
    setOverride(val);
    await fetch("/api/admin/network-providers", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ datifyOverride: val }) });
    await load();
  }

  if (loading) return <div className="flex items-center justify-center py-32"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;

  const datifyActive = data?.datifyActive ?? false;
  const inventorActive = !datifyActive;

  return (
    <div className="space-y-5">
      <div><h1 className="text-xl font-black text-white">Network Providers</h1></div>

      {/* Smart switching diagram */}
      <div className="rounded-2xl border p-5" style={{ background: CARD, borderColor: BORDER }}>
        <h2 className="font-bold text-white mb-1">Smart API Switching</h2>
        <p className="text-sm text-slate-500 mb-5">Orders route through Provider A (Inventor) by default. If Inventor fails or Datify is scheduled, the system automatically uses Provider B (Datify).</p>

        {/* Flow diagram */}
        <div className="flex items-center justify-center gap-3 mb-5 flex-wrap">
          {[
            { label: "Customer", sub: "Order", icon: "🛒", active: false, accent: false },
            { label: "Provider A", sub: `Inventor ${inventorActive ? "ACTIVE" : ""}`, icon: "🚀", active: inventorActive, accent: true },
            null,
            { label: "Provider B", sub: "Datify", icon: "🌐", active: datifyActive, accent: false },
            { label: "Data", sub: "Delivered", icon: "📊", active: false, accent: false },
          ].map((item, i) => item === null ? (
            <div key={i} className="flex flex-col items-center gap-1">
              <span className="text-xs text-amber-400 font-bold">if A fails</span>
              <span className="text-slate-500">→</span>
              <span className="text-xs text-slate-500">auto-switch</span>
            </div>
          ) : (
            <div key={i} className="flex items-center gap-3">
              {i > 0 && <span className="text-slate-600">→</span>}
              <div className="flex flex-col items-center gap-1">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl border"
                  style={{ background: item.active && item.accent ? "#0c2a0c" : "#1f2937", borderColor: item.active && item.accent ? "#16a34a" : BORDER }}>
                  {item.icon}
                </div>
                <p className="text-xs font-bold text-white">{item.label}</p>
                <p className="text-[10px] text-slate-500">{item.sub}</p>
                {item.active && item.accent && <span className="text-[10px] font-bold text-green-400 border border-green-800 px-1.5 rounded">ACTIVE</span>}
              </div>
            </div>
          ))}
        </div>

        <p className="text-center text-sm text-slate-400">
          Current active provider: <span className="font-bold" style={{ color: "#4ade80" }}>Provider {datifyActive ? "B — Datify" : "A — Inventor"}</span>
        </p>
      </div>

      {/* Provider cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Provider A */}
        <div className="rounded-2xl border p-5" style={{ background: CARD, borderColor: BORDER }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🚀</span>
              <div>
                <p className="font-bold text-white">Provider A — Inventor</p>
                <p className="text-xs text-slate-500">Primary delivery provider</p>
              </div>
            </div>
            <span className="text-xs font-bold px-2 py-1 rounded-full" style={{ background: inventorActive ? "#0c2a0c" : "#1f2937", color: inventorActive ? "#4ade80" : "#6b7280" }}>
              {inventorActive ? "ONLINE" : "STANDBY"}
            </span>
          </div>
          <div className="space-y-2.5 text-sm">
            <div className="flex justify-between"><span className="text-slate-400">Wallet Balance</span>
              <span className="font-black" style={{ color: (data?.inventorBalance ?? 0) > 100 ? "#4ade80" : "#f87171" }}>
                {data?.inventorBalance !== null ? `GH₵${Number(data?.inventorBalance ?? 0).toFixed(2)}` : "Unreachable"}
                {data?.inventorBalance !== null && <span className="text-green-400 ml-2 text-xs">OK</span>}
              </span>
            </div>
            <div className="flex justify-between"><span className="text-slate-400">Role</span><span className="text-white">Default / Primary</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Used when</span><span className="text-white">Datify is OFF</span></div>
          </div>
          <button onClick={load} className="mt-4 w-full border text-blue-400 font-bold py-2.5 rounded-xl text-sm hover:bg-blue-900/20 flex items-center justify-center gap-2" style={{ borderColor: "#1e3a5f" }}>
            🔄 Refresh Balance
          </button>
        </div>

        {/* Provider B */}
        <div className="rounded-2xl border p-5" style={{ background: CARD, borderColor: BORDER }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🌐</span>
              <div>
                <p className="font-bold text-white">Provider B — Datify</p>
                <p className="text-xs text-slate-500">Backup / scheduled provider</p>
              </div>
            </div>
            <span className="text-xs font-bold px-2 py-1 rounded-full" style={{ background: datifyActive ? "#0c2a0c" : "#1f2937", color: datifyActive ? "#4ade80" : "#6b7280" }}>
              {datifyActive ? "ACTIVE" : "STANDBY"}
            </span>
          </div>
          <div className="space-y-2.5 text-sm">
            <div className="flex justify-between"><span className="text-slate-400">Wallet Balance</span><span className="text-red-400">Unreachable</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Auto time window</span><span className="text-white">{startTime} – {endTime} (Ghana)</span></div>
            <div className="flex justify-between"><span className="text-slate-400">In window now?</span><span className="text-white">{data?.inWindow ? "Yes" : "No"}</span></div>
          </div>
          <button onClick={load} className="mt-4 w-full border text-blue-400 font-bold py-2.5 rounded-xl text-sm hover:bg-blue-900/20 flex items-center justify-center gap-2" style={{ borderColor: "#1e3a5f" }}>
            🔄 Refresh Balance
          </button>
        </div>
      </div>

      {/* Provider B Controls */}
      <div className="rounded-2xl border p-5" style={{ background: CARD, borderColor: BORDER }}>
        <h2 className="font-bold text-white mb-1">Provider B Controls</h2>
        <p className="text-xs text-slate-500 mb-5">Configure when Datify activates</p>

        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="font-semibold text-white">Manual Override</p>
            <p className="text-xs text-slate-500">Force all orders to Datify right now — ignores time window</p>
          </div>
          <Toggle checked={override} onChange={toggleOverride} />
        </div>

        <h3 className="font-semibold text-white mb-3">Auto Time Window (Ghana Time)</h3>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-wide mb-1">Start Time</label>
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm text-white border focus:outline-none focus:border-blue-500"
              style={{ background: BG, borderColor: BORDER }} />
          </div>
          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-wide mb-1">End Time</label>
            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm text-white border focus:outline-none focus:border-blue-500"
              style={{ background: BG, borderColor: BORDER }} />
          </div>
        </div>
        <p className="text-xs text-slate-500 mb-4">Datify activates automatically between these times every day.</p>
        <button onClick={save} disabled={saving}
          className="px-6 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50"
          style={{ background: "linear-gradient(90deg,#3b82f6,#8b5cf6)" }}>
          {saving ? "Saving…" : "Save Changes"}
        </button>
        {toast && <span className="ml-3 text-sm text-green-400 font-semibold">{toast}</span>}
      </div>

      {/* How it works */}
      <div className="rounded-2xl border p-5" style={{ background: "#0e1928", borderColor: "#1e3050" }}>
        <p className="font-bold text-blue-400 mb-3">ℹ️ How Smart Switching Works</p>
        <div className="space-y-1.5 text-sm">
          {[
            ["Default:", "All orders go through Provider A (Inventor)"],
            ["Auto time window:", "Datify activates between your set hours every day"],
            ["Manual override:", "Forces Datify ON until you turn it off"],
            ["If Provider A fails:", "System automatically retries via Provider B"],
            ["Low balance alert:", "Top up before balance hits zero to avoid delivery failures"],
          ].map(([k, v]) => (
            <p key={k} className="text-slate-400"><span className="font-semibold text-white">{k}</span> {v}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
