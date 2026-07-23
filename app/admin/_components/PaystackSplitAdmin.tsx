"use client";
import { useState, useEffect } from "react";

const BG = "#0b1120", CARD = "#111827", BORDER = "#1f2937";

interface Agent { id: string; name: string; referral_code: string; email: string; status: string; paystack_subaccount_code?: string }

export default function PaystackSplitAdmin() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editCode, setEditCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  async function load() {
    setLoading(true);
    const r = await fetch("/api/admin/paystack-split").then(r => r.json());
    setAgents(r.agents ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function toast3(msg: string) { setToast(msg); setTimeout(() => setToast(""), 3000); }

  async function saveCode(agentId: string) {
    setSaving(true);
    const r = await fetch("/api/admin/paystack-split", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId, subaccountCode: editCode }) });
    if (r.ok) { toast3("Saved!"); setEditId(null); load(); }
    else { const d = await r.json(); toast3(d.error ?? "Failed"); }
    setSaving(false);
  }

  const shown = agents.filter(a => !search || a.name?.toLowerCase().includes(search.toLowerCase()) || a.referral_code?.toLowerCase().includes(search.toLowerCase()) || a.email?.toLowerCase().includes(search.toLowerCase()));
  const withSub = agents.filter(a => a.paystack_subaccount_code).length;
  const withoutSub = agents.length - withSub;

  if (loading) return <div className="flex items-center justify-center py-32"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-5">
      <div><h1 className="text-xl font-black text-white">Paystack Split Payments</h1></div>

      {/* How to */}
      <div className="rounded-2xl border p-5" style={{ background: CARD, borderColor: BORDER }}>
        <h2 className="font-bold text-white mb-3">Paystack Subaccounts</h2>
        <p className="text-sm text-slate-400 mb-4">Link each agent&apos;s Paystack subaccount code so their share is automatically sent to their bank on every sale.</p>
        <div className="rounded-xl border p-4 space-y-2 text-sm" style={{ background: "#0e1928", borderColor: "#1e3050" }}>
          <p className="font-bold text-blue-400">ℹ️ How to set up a subaccount for an agent</p>
          {[
            "Go to your Paystack dashboard → Settlement → Subaccounts",
            "Click Create Subaccount and enter the agent's bank details",
            "Set the percentage charge (e.g. 80 for 80% to agent)",
            ["Copy the generated code (looks like ", <code key="c" className="bg-slate-800 px-1.5 rounded text-blue-300">ACCT_abc123xyz</code>, ")"],
            "Paste it in the field below for that agent and click Save",
          ].map((s, i) => <p key={i} className="text-slate-400">{Array.isArray(s) ? s : s}</p>)}
          <p className="text-slate-500 text-xs pt-1">Once set, Paystack will automatically split every payment — the agent&apos;s % goes straight to their bank. Set <strong className="text-white">bearer = account</strong> so your account pays the Paystack fee (this is already done in the code).</p>
        </div>
      </div>

      {/* Search */}
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search agents by name, email or code…"
        className="w-full rounded-xl px-4 py-2.5 text-sm text-white border focus:outline-none focus:border-blue-500"
        style={{ background: CARD, borderColor: BORDER }} />

      {/* Stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: "TOTAL AGENTS", value: agents.length },
          { label: "WITH SUBACCOUNT", value: withSub, color: "#4ade80" },
          { label: "WITHOUT SUBACCOUNT", value: withoutSub, color: "#f87171" },
        ].map(s => (
          <div key={s.label} className="rounded-2xl border p-4 text-center" style={{ background: CARD, borderColor: BORDER }}>
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{s.label}</p>
            <p className="text-2xl font-black" style={{ color: s.color ?? "white" }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Agent list */}
      <div className="rounded-2xl border overflow-hidden" style={{ background: CARD, borderColor: BORDER }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-slate-500 uppercase tracking-wider" style={{ background: BG, borderColor: BORDER }}>
                {["Agent", "Ref Code", "Email", "Subaccount Code", "Action"].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map(a => (
                <tr key={a.id} className="border-b last:border-0 hover:bg-white/[0.02]" style={{ borderColor: BORDER }}>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0"
                        style={{ background: `hsl(${(a.referral_code.charCodeAt(0) * 17) % 360},60%,40%)` }}>
                        {(a.name ?? "?").charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-white leading-none">{a.name}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">{a.status}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-xs font-bold font-mono px-2 py-1 rounded" style={{ background: "#1e3050", color: "#60a5fa" }}>{a.referral_code}</span>
                  </td>
                  <td className="px-4 py-3.5 text-slate-400 text-xs">{a.email}</td>
                  <td className="px-4 py-3.5">
                    {editId === a.id ? (
                      <input value={editCode} onChange={e => setEditCode(e.target.value)} placeholder="ACCT_xxx…"
                        className="rounded-lg px-3 py-1.5 text-sm text-white border w-48 focus:outline-none focus:border-blue-500"
                        style={{ background: BG, borderColor: BORDER }} autoFocus />
                    ) : a.paystack_subaccount_code ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-green-400 border border-green-800 px-2 py-0.5 rounded">LINKED</span>
                        <span className="text-xs text-slate-400 font-mono">{a.paystack_subaccount_code}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-red-400">Not set</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    {editId === a.id ? (
                      <div className="flex gap-2">
                        <button onClick={() => saveCode(a.id)} disabled={saving}
                          className="text-xs px-3 py-1.5 rounded-lg font-bold text-white disabled:opacity-50"
                          style={{ background: "#3b82f6" }}>Save</button>
                        <button onClick={() => setEditId(null)} className="text-xs px-3 py-1.5 rounded-lg font-bold text-slate-400 border" style={{ borderColor: BORDER }}>Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => { setEditId(a.id); setEditCode(a.paystack_subaccount_code ?? ""); }}
                        className="text-xs px-3 py-1.5 rounded-lg font-bold text-blue-400 border border-blue-900 hover:bg-blue-900/20">
                        {a.paystack_subaccount_code ? "Edit" : "Set Code"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {toast && <p className="text-sm font-semibold text-green-400">{toast}</p>}
    </div>
  );
}
