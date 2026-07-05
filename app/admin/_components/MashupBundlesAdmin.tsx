"use client";
import { useState, useEffect } from "react";

const BG = "#0b1120", CARD = "#111827", BORDER = "#1f2937";
const inp = "w-full rounded-xl px-3 py-2.5 text-sm text-white border focus:outline-none focus:border-blue-500";

interface Bundle { id: string; name: string; data_value: number; data_unit: string; minutes: number; price: number; cost_price: number; active: boolean; network: string; created_at: string }

const SQL = `CREATE TABLE IF NOT EXISTS mashup_bundles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  data_value numeric NOT NULL,
  data_unit text NOT NULL DEFAULT 'GB',
  minutes integer NOT NULL DEFAULT 0,
  price numeric NOT NULL,
  cost_price numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  network text NOT NULL DEFAULT 'airteltigo',
  created_at timestamp with time zone DEFAULT now()
);
-- If table already exists, add the column:
ALTER TABLE mashup_bundles ADD COLUMN IF NOT EXISTS network text NOT NULL DEFAULT 'mtn';`;

export default function MashupBundlesAdmin() {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", data_value: "", data_unit: "GB", minutes: "0", price: "", cost_price: "", network: "mtn" });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [showSql, setShowSql] = useState(false);

  async function load() {
    setLoading(true);
    const r = await fetch("/api/admin/mashup-bundles").then(r => r.json());
    setBundles(r.bundles ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function toast3(msg: string) { setToast(msg); setTimeout(() => setToast(""), 3000); }

  async function save() {
    setSaving(true);
    const body = { name: form.name, data_value: parseFloat(form.data_value), data_unit: form.data_unit, minutes: parseInt(form.minutes), price: parseFloat(form.price), cost_price: parseFloat(form.cost_price || "0"), network: form.network };
    const method = editId ? "PATCH" : "POST";
    const payload = editId ? { id: editId, ...body } : body;
    const r = await fetch("/api/admin/mashup-bundles", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (r.ok) { toast3(editId ? "Updated!" : "Bundle added!"); setForm({ name: "", data_value: "", data_unit: "GB", minutes: "0", price: "", cost_price: "", network: "mtn" }); setEditId(null); load(); }
    else { const d = await r.json(); toast3(d.error ?? "Failed"); }
    setSaving(false);
  }

  async function toggleActive(b: Bundle) {
    await fetch("/api/admin/mashup-bundles", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: b.id, active: !b.active }) });
    load();
  }

  async function del(id: string) {
    if (!confirm("Delete this bundle?")) return;
    await fetch("/api/admin/mashup-bundles", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    load();
  }

  function startEdit(b: Bundle) {
    setEditId(b.id);
    setForm({ name: b.name, data_value: String(b.data_value), data_unit: b.data_unit, minutes: String(b.minutes), price: String(b.price), cost_price: String(b.cost_price), network: b.network ?? "airteltigo" });
  }

  if (loading) return <div className="flex items-center justify-center py-32"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-black text-white">Mashup Bundles</h1><p className="text-sm text-slate-500 mt-0.5">MTN combo packs — data + voice minutes</p></div>
        <button onClick={() => setShowSql(!showSql)} className="text-xs border px-3 py-1.5 rounded-lg text-slate-400 hover:text-white" style={{ borderColor: BORDER }}>+ Add Bundle</button>
      </div>

      {/* SQL notice */}
      <div className="rounded-xl border p-4" style={{ background: "#0e1928", borderColor: "#1e3050" }}>
        <p className="text-xs font-semibold text-amber-400 mb-2">Note: If you see a database error, run this SQL in your Supabase SQL editor first:</p>
        <pre className="text-xs text-blue-300 whitespace-pre-wrap break-all font-mono">{SQL}</pre>
      </div>

      {/* Form */}
      <div className="rounded-2xl border p-5" style={{ background: CARD, borderColor: BORDER }}>
        <h2 className="font-bold text-white mb-4">{editId ? "Edit Bundle" : "+ Add Bundle"}</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          {[["Bundle Name", "name", "e.g. Special 2GB"], ["Data Value", "data_value", "2"], ["Minutes", "minutes", "0"], ["Sell Price (GH₵)", "price", "9.50"], ["Cost Price (GH₵)", "cost_price", "8.30"]].map(([label, key, ph]) => (
            <div key={key}>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</label>
              <input className={inp} style={{ background: BG, borderColor: BORDER }} placeholder={ph}
                value={(form as Record<string, string>)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
            </div>
          ))}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Delivers via</label>
            <select className={inp} style={{ background: BG, borderColor: BORDER }} value={form.network} onChange={e => setForm(f => ({ ...f, network: e.target.value }))}>
              <option value="mtn">MTN</option>
              <option value="airteltigo">AirtelTigo (AT ISHARE)</option>
              <option value="telecel">Telecel</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3">
          {editId && <button onClick={() => { setEditId(null); setForm({ name: "", data_value: "", data_unit: "GB", minutes: "0", price: "", cost_price: "" }); }} className="border text-slate-400 font-semibold py-2.5 px-5 rounded-xl text-sm hover:text-white" style={{ borderColor: BORDER }}>Cancel</button>}
          <button onClick={save} disabled={saving || !form.name || !form.data_value || !form.price}
            className="flex-1 text-white font-bold py-2.5 rounded-xl text-sm disabled:opacity-50"
            style={{ background: saving ? "#334155" : "linear-gradient(90deg,#3b82f6,#8b5cf6)" }}>
            {saving ? "Saving…" : editId ? "Update Bundle" : "+ Add Bundle"}
          </button>
        </div>
        {toast && <p className="mt-3 text-sm font-semibold text-green-400">{toast}</p>}
      </div>

      {/* List */}
      {bundles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <span className="text-5xl">📦</span>
          <p className="font-bold text-white">No Mashup Bundles Yet</p>
          <p className="text-sm text-slate-500">Click &quot;+ Add Bundle&quot; to create your first combo pack.</p>
        </div>
      ) : (
        <div className="rounded-2xl border overflow-hidden" style={{ background: CARD, borderColor: BORDER }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-slate-500 uppercase tracking-wider" style={{ background: BG, borderColor: BORDER }}>
                  {["Bundle", "Delivers via", "Data", "Minutes", "Sell Price", "Cost", "Profit", "Status", "Actions"].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bundles.map(b => {
                  const profit = b.price - b.cost_price;
                  const pct = b.cost_price > 0 ? Math.round((profit / b.cost_price) * 100) : 0;
                  return (
                    <tr key={b.id} className="border-b last:border-0 hover:bg-white/[0.02]" style={{ borderColor: BORDER }}>
                      <td className="px-4 py-3.5 font-semibold text-white">{b.name}</td>
                      <td className="px-4 py-3.5">
                        <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: b.network === "mtn" ? "rgba(245,158,11,0.15)" : b.network === "telecel" ? "rgba(239,68,68,0.15)" : "rgba(59,130,246,0.15)", color: b.network === "mtn" ? "#f59e0b" : b.network === "telecel" ? "#ef4444" : "#60a5fa" }}>
                          {b.network === "mtn" ? "MTN" : b.network === "telecel" ? "Telecel" : "AT ISHARE"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-slate-300">{b.data_value}{b.data_unit}</td>
                      <td className="px-4 py-3.5 text-slate-300">{b.minutes} min</td>
                      <td className="px-4 py-3.5 font-bold text-white">GH₵{Number(b.price).toFixed(2)}</td>
                      <td className="px-4 py-3.5 text-slate-400">GH₵{Number(b.cost_price).toFixed(2)}</td>
                      <td className="px-4 py-3.5"><span className="font-bold" style={{ color: "#4ade80" }}>GH₵{profit.toFixed(2)}</span> <span className="text-xs text-slate-500">({pct}%)</span></td>
                      <td className="px-4 py-3.5">
                        <button onClick={() => toggleActive(b)} className="relative inline-flex items-center h-5 rounded-full w-9 transition-colors" style={{ background: b.active ? "#16a34a" : "#374151" }}>
                          <span className="inline-block w-4 h-4 transform rounded-full bg-white transition-transform" style={{ transform: b.active ? "translateX(18px)" : "translateX(2px)" }} />
                        </button>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex gap-2">
                          <button onClick={() => startEdit(b)} className="text-xs px-3 py-1.5 rounded-lg font-bold text-blue-400 border border-blue-900 hover:bg-blue-900/30">Edit</button>
                          <button onClick={() => del(b.id)} className="text-xs px-3 py-1.5 rounded-lg font-bold text-red-400 border border-red-900 hover:bg-red-900/30">Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
