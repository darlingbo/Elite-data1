"use client";
import { useCallback, useEffect, useState } from "react";

type RequestRow = { id: string; order_reference: string; exam_type: string; candidate_type: string; candidate_name: string; index_number: string; exam_year: number; date_of_birth: string | null; whatsapp: string; status: string; created_at: string; voucher_code: string | null };

export default function ResultCheckerAdmin() {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => { setLoading(true); const res = await fetch("/api/admin/result-checker"); const json = await res.json(); setLoading(false); if (!res.ok) setError(json.error || "Could not load requests"); else { setRows(json.requests ?? []); setError(""); } }, []);
  useEffect(() => { void load(); }, [load]);
  async function update(id: string, action: "complete" | "reopen") { const res = await fetch("/api/admin/result-checker", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) }); if (res.ok) void load(); }
  if (loading) return <p className="py-16 text-center text-slate-500">Loading result checker requests…</p>;
  return <div className="space-y-4">
    {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>}
    <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 text-sm text-slate-300">Each request costs GH₵25 total. Approve its order first; the system assigns a stored voucher and shows it here. Check the official WAEC result, then send it through WhatsApp and mark it completed.</div>
    {rows.map(row => {
      const wa = row.whatsapp.replace(/\D/g, "").replace(/^0/, "233");
      const message = encodeURIComponent(`Hello ${row.candidate_name}, your ${row.exam_type} result check from Elite Data is ready.`);
      return <article key={row.id} className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-black text-white">{row.exam_type} · {row.candidate_name}</h3><p className="text-xs text-slate-500">{row.order_reference} · {new Date(row.created_at).toLocaleString("en-GH")}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${row.status === "completed" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>{row.status.replaceAll("_", " ")}</span></div>
        <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">{[["Candidate type", row.candidate_type], ["Exam year", String(row.exam_year)], ["Index number", row.index_number], ["Date of birth", row.date_of_birth ?? "Not required"], ["WhatsApp", row.whatsapp], ["Voucher code", row.voucher_code ?? "Waiting for order approval"]].map(([label, value]) => <div key={label} className="rounded-xl bg-black/20 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 break-all font-semibold text-slate-200">{value}</p></div>)}</div>
        <div className="mt-4 flex flex-wrap gap-2"><a href={`https://wa.me/${wa}?text=${message}`} target="_blank" rel="noreferrer" className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white">Open WhatsApp</a>{row.status === "completed" ? <button onClick={() => update(row.id, "reopen")} className="rounded-xl border border-slate-600 px-4 py-2 text-sm font-bold text-slate-300">Reopen</button> : <button onClick={() => update(row.id, "complete")} disabled={!row.voucher_code} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">Mark completed</button>}</div>
      </article>;
    })}
    {!rows.length && !error && <p className="py-16 text-center text-slate-500">No result checker requests yet.</p>}
  </div>;
}
