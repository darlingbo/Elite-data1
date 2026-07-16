"use client";
import { useState } from "react";
import { CARD, BORDER, BG } from "./shared/constants";

export function CompensateView() {
  const [phone, setPhone] = useState(""); const [network, setNetwork] = useState("mtn"); const [sizeGB, setSizeGB] = useState("2");
  const [agentCode, setAgentCode] = useState(""); const [commission, setCommission] = useState(""); const [originalRef, setOriginalRef] = useState(""); const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; agentCredited: boolean; deliveryLog: string; ref: string } | null>(null);
  const [error, setError] = useState("");
  async function handleSubmit() {
    setLoading(true); setResult(null); setError("");
    try {
      const res = await fetch("/api/admin/compensate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, network, sizeGB: parseFloat(sizeGB), agentCode: agentCode || undefined, commission: parseFloat(commission) || undefined, note: note || undefined, originalRef: originalRef || undefined }) });
      const j = await res.json();
      if (res.ok) setResult(j); else setError(j.error ?? "Failed");
    } catch (e) { setError(String(e)); }
    setLoading(false);
  }
  const inp = "w-full rounded-xl px-3 py-2.5 text-sm text-white border focus:outline-none focus:border-blue-500";
  return (
    <div className="max-w-lg">
      <div className="rounded-2xl border p-6" style={{ background: CARD, borderColor: BORDER }}>
        <h2 className="text-lg font-black text-white mb-1">Compensate Delivery</h2>
        <p className="text-xs text-slate-500 mb-5">Deliver missing data to a customer and credit the agent commission.</p>
        {result && <div className="rounded-xl p-3 mb-4 border" style={{ background: result.success ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", borderColor: result.success ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)" }}><p className="text-sm font-bold" style={{ color: result.success ? "#4ade80" : "#f87171" }}>{result.success ? "✅ Delivered!" : "❌ Failed"} {result.agentCredited ? "· Agent credited" : ""}</p><p className="text-xs text-slate-500 mt-1 break-all">Ref: {result.ref}</p><p className="text-xs text-slate-500 mt-0.5 break-all">{result.deliveryLog}</p></div>}
        {error && <div className="rounded-xl p-3 mb-4 border text-red-400 text-sm" style={{ background: "rgba(239,68,68,0.1)", borderColor: "rgba(239,68,68,0.3)" }}>{error}</div>}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div><label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Phone</label><input className={inp} style={{ background: BG, borderColor: BORDER }} value={phone} onChange={e => setPhone(e.target.value)} placeholder="0556153736" /></div>
          <div><label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Network</label><select className={inp} style={{ background: BG, borderColor: BORDER }} value={network} onChange={e => setNetwork(e.target.value)}><option value="mtn">MTN</option><option value="telecel">Telecel</option><option value="airteltigo">AirtelTigo</option></select></div>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div><label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Missing GB</label><input type="number" min="0.5" step="0.5" className={inp} style={{ background: BG, borderColor: BORDER }} value={sizeGB} onChange={e => setSizeGB(e.target.value)} /></div>
          <div><label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Commission (GH₵)</label><input type="number" min="0" step="0.01" className={inp} style={{ background: BG, borderColor: BORDER }} value={commission} onChange={e => setCommission(e.target.value)} /></div>
        </div>
        <div className="mb-3"><label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Agent Code</label><input className={inp} style={{ background: BG, borderColor: BORDER }} value={agentCode} onChange={e => setAgentCode(e.target.value)} placeholder="Leave blank to skip" /></div>
        <div className="mb-3"><label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Original Order Ref</label><input className={inp} style={{ background: BG, borderColor: BORDER }} value={originalRef} onChange={e => setOriginalRef(e.target.value)} /></div>
        <div className="mb-5"><label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Note</label><input className={inp} style={{ background: BG, borderColor: BORDER }} value={note} onChange={e => setNote(e.target.value)} placeholder="Reason for compensation" /></div>
        <button onClick={handleSubmit} disabled={loading} className="w-full text-white font-bold py-3 rounded-xl text-sm disabled:opacity-60" style={{ background: loading ? "#334155" : "linear-gradient(90deg,#3b82f6,#8b5cf6)" }}>{loading ? "Sending…" : `🔧 Deliver ${sizeGB}GB to ${phone || "customer"}`}</button>
      </div>
    </div>
  );
}
