"use client";
import { useState, useEffect } from "react";

const BG = "#0b1120", CARD = "#111827", BORDER = "#1f2937";
const inp = "w-full rounded-xl px-3 py-2.5 text-sm text-white border focus:outline-none focus:border-blue-500";

interface PromoCode { id: string; code: string; discount_type: string; discount_value: number; max_uses: number | null; used_count: number; expires_at: string | null; active: boolean; created_at: string }

export default function CouponsAdmin() {
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ code: "", discount_type: "percent", discount_value: "10", max_uses: "", expires_at: "" });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [sql, setSql] = useState("");

  async function load() {
    setLoading(true);
    const r = await fetch("/api/admin/coupons").then(r => r.json());
    setCodes(r.codes ?? []);
    if (r.sql) setSql(r.sql);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function toast3(msg: string) { setToast(msg); setTimeout(() => setToast(""), 3000); }

  async function create() {
    setSaving(true);
    const r = await fetch("/api/admin/coupons", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: form.code, discount_type: form.discount_type, discount_value: parseFloat(form.discount_value), max_uses: form.max_uses ? parseInt(form.max_uses) : undefined, expires_at: form.expires_at || undefined }) });
    if (r.ok) { toast3("Code created!"); setForm({ code: "", discount_type: "percent", discount_value: "10", max_uses: "", expires_at: "" }); load(); }
    else { const d = await r.json(); toast3(d.error ?? "Failed"); }
    setSaving(false);
  }

  async function del(id: string) {
    if (!confirm("Delete this code?")) return;
    await fetch("/api/admin/coupons", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    load();
  }

  if (loading) return <div className="flex items-center justify-center py-32"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-5">
      <div><h1 className="text-xl font-black text-white">Coupons</h1></div>

      {/* Form */}
      <div className="rounded-2xl border p-5" style={{ background: CARD, borderColor: BORDER }}>
        <h2 className="font-bold text-white mb-1">Promo Codes</h2>
        <p className="text-sm text-slate-500 mb-5">Create discount codes customers can enter at checkout.</p>

        <div className="space-y-4">
          <h3 className="font-semibold text-white">Create New Code</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">CODE *</label>
              <input className={inp} style={{ background: BG, borderColor: BORDER }} placeholder="E.G. SAVE20"
                value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">DISCOUNT TYPE *</label>
              <select className={inp} style={{ background: BG, borderColor: BORDER }} value={form.discount_type} onChange={e => setForm(f => ({ ...f, discount_type: e.target.value }))}>
                <option value="percent">Percentage (% off)</option>
                <option value="fixed">Fixed amount (GH₵ off)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">DISCOUNT VALUE * (E.G. 10 = 10%)</label>
              <input type="number" min="1" className={inp} style={{ background: BG, borderColor: BORDER }} placeholder="10"
                value={form.discount_value} onChange={e => setForm(f => ({ ...f, discount_value: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">MAX USES (BLANK = UNLIMITED)</label>
              <input type="number" min="1" className={inp} style={{ background: BG, borderColor: BORDER }} placeholder="Unlimited"
                value={form.max_uses} onChange={e => setForm(f => ({ ...f, max_uses: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">EXPIRY DATE (BLANK = NO EXPIRY)</label>
              <input type="date" className={inp} style={{ background: BG, borderColor: BORDER }}
                value={form.expires_at} onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))} />
            </div>
          </div>
          <button onClick={create} disabled={saving || !form.code || !form.discount_value}
            className="w-full py-3 rounded-xl text-sm font-bold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(90deg,#3b82f6,#8b5cf6)" }}>
            {saving ? "Creating…" : "Create Code"}
          </button>
          {toast && <p className="text-sm font-semibold text-green-400">{toast}</p>}
        </div>
      </div>

      {/* Active codes */}
      <div className="rounded-2xl border p-5" style={{ background: CARD, borderColor: BORDER }}>
        <h3 className="font-semibold text-white mb-4">Active Codes</h3>
        {codes.length === 0 ? (
          <p className="text-sm text-slate-500 py-8 text-center">No promo codes yet. Create one above.</p>
        ) : (
          <div className="space-y-2">
            {codes.map(c => {
              const used = c.used_count ?? 0;
              const max = c.max_uses;
              const expired = c.expires_at && new Date(c.expires_at) < new Date();
              return (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-xl border" style={{ background: BG, borderColor: BORDER }}>
                  <div className="flex items-center gap-3">
                    <span className="font-black text-sm font-mono" style={{ color: "#f59e0b" }}>{c.code}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: c.discount_type === "percent" ? "#1e3a5f" : "#1a2e1a", color: c.discount_type === "percent" ? "#60a5fa" : "#4ade80" }}>
                      {c.discount_type === "percent" ? `${c.discount_value}% off` : `GH₵${c.discount_value} off`}
                    </span>
                    {expired && <span className="text-xs text-red-400">Expired</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500">{used}/{max ?? "∞"} uses</span>
                    {c.expires_at && <span className="text-xs text-slate-500">Exp: {new Date(c.expires_at).toLocaleDateString("en-GH")}</span>}
                    <button onClick={() => del(c.id)} className="text-xs px-3 py-1 rounded-lg font-bold text-red-400 border border-red-900 hover:bg-red-900/20">Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SQL note */}
      {sql && (
        <div className="rounded-xl border p-4" style={{ background: "#0e1928", borderColor: "#1e3050" }}>
          <p className="text-xs font-semibold text-amber-400 mb-2">💡 SQL to run once in Supabase:</p>
          <pre className="text-xs text-blue-300 whitespace-pre-wrap break-all font-mono">{sql}</pre>
        </div>
      )}
    </div>
  );
}
