"use client";
import { useCallback, useEffect, useState } from "react";

type Operations = {
  counts: Record<string, number>;
  alerts: Array<{ reference: string; status: string; phone: string; amount: number; created_at: string }>;
  audit: Array<{ id: string; action: string; details: Record<string, unknown>; created_at: string }>;
  checkedAt: string;
};

export default function OperationsCenter() {
  const [data, setData] = useState<Operations | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/operations", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not load operations");
      setData(body);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load operations");
    }
  }, []);
  useEffect(() => { void load(); const id = setInterval(load, 30_000); return () => clearInterval(id); }, [load]);

  if (!data && !error) return <p className="text-slate-400 p-6">Checking financial operations…</p>;
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-black text-white">Operations & reconciliation</h2>
          <p className="text-sm text-slate-400">Investigate warnings before retrying or paying anyone.</p>
        </div>
        <button onClick={() => void load()} className="min-h-11 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white">Refresh</button>
      </div>
      {error && <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-red-300">{error}</div>}
      {data && <>
        <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2 lg:grid-cols-5">
          {Object.entries(data.counts).map(([key, value]) => (
            <div key={key} className={`rounded-xl border p-4 ${value ? "border-amber-500/40 bg-amber-500/10" : "border-emerald-500/30 bg-emerald-500/10"}`}>
              <p className="text-2xl font-black text-white">{value}</p>
              <p className="mt-1 text-xs capitalize text-slate-300">{key.replace(/([A-Z])/g, " $1")}</p>
            </div>
          ))}
        </div>
        <section className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
          <h3 className="font-bold text-white">Needs attention</h3>
          {data.alerts.length === 0 ? <p className="mt-3 text-sm text-emerald-400">No reconciliation warnings.</p> :
            <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm">
              <thead className="text-slate-500"><tr><th className="pb-2">Reference</th><th>Status</th><th>Phone</th><th>Amount</th><th>Created</th></tr></thead>
              <tbody>{data.alerts.map((item) => <tr key={`${item.reference}-${item.status}`} className="border-t border-slate-800 text-slate-300">
                <td className="py-2 font-mono text-xs">{item.reference}</td><td>{item.status}</td><td>{item.phone}</td>
                <td>GH₵{Number(item.amount).toFixed(2)}</td><td>{new Date(item.created_at).toLocaleString()}</td>
              </tr>)}</tbody>
            </table></div>}
        </section>
        <section className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
          <h3 className="font-bold text-white">Recent audit activity</h3>
          <div className="mt-3 space-y-2">{data.audit.map((entry) => (
            <div key={entry.id} className="rounded-lg border border-slate-800 p-3 text-sm">
              <div className="flex justify-between gap-3"><span className="font-semibold text-blue-300">{entry.action}</span>
                <time className="text-xs text-slate-500">{new Date(entry.created_at).toLocaleString()}</time></div>
              <p className="mt-1 break-all font-mono text-xs text-slate-500">{JSON.stringify(entry.details)}</p>
            </div>
          ))}</div>
        </section>
      </>}
    </div>
  );
}
