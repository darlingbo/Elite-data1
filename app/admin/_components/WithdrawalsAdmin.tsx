"use client";
import { useState, useEffect, useCallback } from "react";

const BG = "#0b1120", CARD = "#111827", BORDER = "#1f2937";

interface Withdrawal {
  id: string;
  agent_id: string;
  amount: number;
  description: string;
  created_at: string;
  status: string;
  agent: { name: string; referral_code: string; phone: string } | null;
}
interface Data { withdrawals: Withdrawal[]; pending: number; approved: number; rejected: number; totalGhc: number }

export default function WithdrawalsAdmin() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const [acting, setActing] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/admin/withdrawals").then(r => r.json());
    setData(r);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function act(id: string, status: "approved" | "rejected") {
    setActing(id);
    try {
      const res = await fetch("/api/admin/withdrawals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const d = await res.json();
      if (d.success) {
        setToast(status === "approved" ? "✅ Approved — Paystack transfer sent!" : "❌ Rejected.");
        await load();
      } else {
        setToast(`Error: ${d.error ?? "Failed"}`);
      }
    } catch {
      setToast("Network error. Try again.");
    } finally {
      setActing(null);
      setTimeout(() => setToast(""), 4000);
    }
  }

  const shown = (data?.withdrawals ?? []).filter(w => tab === "all" || w.status === "pending");

  if (loading) return <div className="flex items-center justify-center py-32"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-5">
      {toast && (
        <div style={{ background: toast.startsWith("✅") ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)", border: `1px solid ${toast.startsWith("✅") ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)"}`, borderRadius: 12, padding: "12px 18px", fontSize: 14, fontWeight: 700, color: toast.startsWith("✅") ? "#4ade80" : "#f87171" }}>
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-black text-white">Withdrawal Requests</h1>
          <p className="text-sm text-slate-500">Paystack transfer fires only when you tap Approve — money never moves until you say so.</p>
        </div>
        <button onClick={load} className="text-xs border px-3 py-1.5 rounded-lg text-slate-400 hover:text-white flex items-center gap-1.5" style={{ borderColor: BORDER }}>↺ Refresh</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "PENDING",   value: data?.pending ?? 0,                      color: "#f59e0b" },
          { label: "APPROVED",  value: data?.approved ?? 0,                     color: "#4ade80" },
          { label: "REJECTED",  value: data?.rejected ?? 0,                     color: "#f87171" },
          { label: "TOTAL GH₵", value: `GH₵${(data?.totalGhc ?? 0).toFixed(2)}`, color: "#60a5fa" },
        ].map(s => (
          <div key={s.label} className="rounded-2xl border p-5" style={{ background: CARD, borderColor: BORDER }}>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">{s.label}</p>
            <p className="text-2xl font-black" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {(["pending", "all"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="px-4 py-2 rounded-xl text-sm font-bold border transition-all"
            style={tab === t ? { background: "#1e3a5f", color: "#60a5fa", borderColor: "#1e3a5f" } : { background: "transparent", color: "#6b7280", borderColor: BORDER }}>
            {t === "pending" ? `Pending (${data?.pending ?? 0})` : "All"}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="rounded-2xl border overflow-hidden" style={{ background: CARD, borderColor: BORDER }}>
        {shown.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-4xl mb-3">🎉</p>
            <p className="text-slate-500 font-semibold">No {tab === "pending" ? "pending " : ""}withdrawal requests</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-slate-500 uppercase tracking-wider" style={{ background: BG, borderColor: BORDER }}>
                  {["Agent", "Amount", "Description", "Date", "Status", "Action"].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map(w => {
                  const statusStyle: Record<string, { bg: string; color: string }> = {
                    pending:  { bg: "rgba(245,158,11,0.15)",  color: "#fbbf24" },
                    approved: { bg: "rgba(74,222,128,0.15)",  color: "#4ade80" },
                    rejected: { bg: "rgba(248,113,113,0.15)", color: "#f87171" },
                  };
                  const s = statusStyle[w.status] ?? statusStyle.pending;
                  const isBusy = acting === w.id;
                  return (
                    <tr key={w.id} className="border-b last:border-0 hover:bg-white/[0.02]" style={{ borderColor: BORDER }}>
                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-white">{w.agent?.name ?? "—"}</p>
                        <p className="text-xs text-slate-500 font-mono">{w.agent?.referral_code}</p>
                      </td>
                      <td className="px-4 py-3.5 font-black" style={{ color: "#f59e0b" }}>GH₵{Math.abs(Number(w.amount)).toFixed(2)}</td>
                      <td className="px-4 py-3.5 text-slate-400 text-xs max-w-xs truncate">{w.description}</td>
                      <td className="px-4 py-3.5 text-xs text-slate-500">{new Date(w.created_at).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" })}</td>
                      <td className="px-4 py-3.5">
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: s.bg, color: s.color }}>
                          {w.status}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        {w.status === "pending" ? (
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              onClick={() => act(w.id, "approved")}
                              disabled={isBusy}
                              style={{ background: "rgba(74,222,128,0.15)", border: "1px solid rgba(74,222,128,0.4)", color: "#4ade80", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer", opacity: isBusy ? 0.5 : 1 }}>
                              {isBusy ? "…" : "✅ Approve"}
                            </button>
                            <button
                              onClick={() => act(w.id, "rejected")}
                              disabled={isBusy}
                              style={{ background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.35)", color: "#f87171", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer", opacity: isBusy ? 0.5 : 1 }}>
                              {isBusy ? "…" : "✕ Reject"}
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-600">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
