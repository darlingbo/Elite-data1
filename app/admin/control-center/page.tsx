"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Settings = Record<string, string>;
type Voucher = { id: number; voucher_type: string; code: string; status: string; order_reference?: string | null; created_at: string; assigned_at?: string | null; sent_at?: string | null };
type ManualOrder = { id: string; agent_name?: string | null; agent_code?: string | null; customer_phone: string; network: string; bundle_size: string; amount_paid: number; cost_price: number; agent_commission: number; admin_profit: number; status: string; admin_note?: string | null; created_at: string };
type Activity = { id: string; scope: string; role: string; content_redacted: string; status: string; latency_ms?: number | null; estimated_tokens?: number | null; estimated_cost_usd?: number | null; created_at: string };
type Escalation = { id: string; session_id: string; summary_redacted: string; status: string; created_at: string; resolved_at?: string | null };
type Payload = { settings: Settings; vouchers: Voucher[]; manualOrders: ManualOrder[]; activity: Activity[]; escalations: Escalation[] };

const toggleSettings = [
  ["customer_ai_enabled", "Customer AI Assistant"],
  ["whatsapp_ai_enabled", "WhatsApp AI Assistant"],
  ["ai_order_guard_enabled", "AI Order Guard"],
  ["agent_ai_auto_approve_enabled", "Agent AI Auto Approval"],
  ["auto_approve_orders", "Automatic Order Processing"],
] as const;

function enabled(value?: string) { return value === "1" || value === "true"; }
function money(value: number | string | null | undefined) { return `GH₵${Number(value ?? 0).toFixed(2)}`; }

export default function AdminControlCenter() {
  const router = useRouter();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [voucherType, setVoucherType] = useState("BECE");
  const [voucherCodes, setVoucherCodes] = useState("");
  const [tab, setTab] = useState<"automation" | "vouchers" | "manual" | "ai">("automation");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/control-center", { cache: "no-store" });
      if (res.status === 401) { router.push("/admin/login"); return; }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Unable to load controls");
      setData(json);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  async function updateSetting(key: string, value: string) {
    setSaving(key);
    setError("");
    const res = await fetch("/api/admin/control-center", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "setting", key, value }) });
    const json = await res.json();
    if (!res.ok) setError(json.error || "Update failed");
    else setData(prev => prev ? { ...prev, settings: { ...prev.settings, [key]: value } } : prev);
    setSaving(null);
  }

  async function addVouchers() {
    const codes = voucherCodes.split(/\r?\n|,/).map(v => v.trim()).filter(Boolean);
    if (!codes.length) { setError("Enter at least one voucher code."); return; }
    setSaving("vouchers");
    const res = await fetch("/api/admin/control-center", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ voucherType, codes }) });
    const json = await res.json();
    if (!res.ok) setError(json.error || "Could not save vouchers");
    else { setVoucherCodes(""); await load(); }
    setSaving(null);
  }

  async function updateManualOrder(id: string, status: string) {
    setSaving(id);
    const res = await fetch("/api/admin/control-center", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "manual-order", id, status }) });
    const json = await res.json();
    if (!res.ok) setError(json.error || "Order update failed"); else await load();
    setSaving(null);
  }

  async function resolveEscalation(id: string) {
    setSaving(id);
    const res = await fetch("/api/admin/control-center", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "escalation", id, status: "resolved" }) });
    const json = await res.json();
    if (!res.ok) setError(json.error || "Escalation update failed"); else await load();
    setSaving(null);
  }

  const counts = useMemo(() => ({
    availableBECE: data?.vouchers.filter(v => v.voucher_type === "BECE" && v.status === "available").length ?? 0,
    availableWASSCE: data?.vouchers.filter(v => v.voucher_type === "WASSCE" && v.status === "available").length ?? 0,
    pendingManual: data?.manualOrders.filter(v => ["pending", "processing"].includes(v.status.toLowerCase())).length ?? 0,
    openEscalations: data?.escalations.filter(v => v.status !== "resolved").length ?? 0,
  }), [data]);

  const card = "rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5";
  const button = "rounded-xl px-4 py-2.5 text-sm font-bold transition disabled:opacity-50";

  return (
    <main className="min-h-screen bg-[#070b14] text-white">
      <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-400">Elite Data Admin</p>
            <h1 className="mt-1 text-2xl font-black sm:text-3xl">Automation & Voucher Center</h1>
            <p className="mt-1 text-sm text-slate-400">AI, automatic processing, manual orders, BECE and WASSCE inventory.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => router.push("/admin")} className={`${button} border border-slate-700 bg-slate-900 text-slate-200`}>Back to Admin</button>
            <button onClick={() => void load()} className={`${button} bg-blue-600 text-white`}>Refresh</button>
          </div>
        </div>

        {error && <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm font-semibold text-red-300">{error}</div>}

        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className={card}><p className="text-xs text-slate-400">BECE Available</p><p className="mt-1 text-2xl font-black text-emerald-400">{counts.availableBECE}</p></div>
          <div className={card}><p className="text-xs text-slate-400">WASSCE Available</p><p className="mt-1 text-2xl font-black text-cyan-400">{counts.availableWASSCE}</p></div>
          <div className={card}><p className="text-xs text-slate-400">Manual Queue</p><p className="mt-1 text-2xl font-black text-amber-400">{counts.pendingManual}</p></div>
          <div className={card}><p className="text-xs text-slate-400">AI Escalations</p><p className="mt-1 text-2xl font-black text-rose-400">{counts.openEscalations}</p></div>
        </div>

        <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
          {(["automation", "vouchers", "manual", "ai"] as const).map(item => (
            <button key={item} onClick={() => setTab(item)} className={`${button} whitespace-nowrap ${tab === item ? "bg-blue-600 text-white" : "border border-slate-800 bg-slate-900 text-slate-300"}`}>
              {item === "automation" ? "Automation" : item === "vouchers" ? "Vouchers" : item === "manual" ? "Manual Orders" : "AI Activity"}
            </button>
          ))}
        </div>

        {loading ? <div className={`${card} text-center text-slate-400`}>Loading control center…</div> : !data ? null : (
          <>
            {tab === "automation" && (
              <div className="grid gap-4 lg:grid-cols-2">
                <section className={card}>
                  <h2 className="text-lg font-black">Main switches</h2>
                  <div className="mt-4 space-y-3">
                    {toggleSettings.map(([key, label]) => {
                      const on = enabled(data.settings[key]);
                      return <div key={key} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                        <div><p className="font-bold">{label}</p><p className="text-xs text-slate-500">{on ? "Enabled" : "Disabled"}</p></div>
                        <button disabled={saving === key} onClick={() => void updateSetting(key, on ? "0" : "1")} className={`${button} ${on ? "bg-emerald-500 text-slate-950" : "bg-slate-700 text-white"}`}>{saving === key ? "Saving…" : on ? "ON" : "OFF"}</button>
                      </div>;
                    })}
                  </div>
                </section>

                <section className={card}>
                  <h2 className="text-lg font-black">Limits and schedule</h2>
                  <div className="mt-4 space-y-4">
                    {[
                      ["agent_ai_min_score", "Agent AI minimum score", "number"],
                      ["ai_daily_request_limit", "AI daily request limit", "number"],
                      ["store_auto_start", "Automatic processing starts", "time"],
                      ["store_auto_end", "Automatic processing ends", "time"],
                    ].map(([key, label, type]) => <label key={key} className="block">
                      <span className="mb-1 block text-sm font-semibold text-slate-300">{label}</span>
                      <input type={type} defaultValue={data.settings[key] ?? ""} onBlur={e => void updateSetting(key, e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white outline-none focus:border-blue-500" />
                    </label>)}
                  </div>
                </section>
              </div>
            )}

            {tab === "vouchers" && (
              <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
                <section className={card}>
                  <h2 className="text-lg font-black">Add voucher stock</h2>
                  <select value={voucherType} onChange={e => setVoucherType(e.target.value)} className="mt-4 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3">
                    <option value="BECE">BECE</option><option value="WASSCE">WASSCE</option>
                  </select>
                  <textarea value={voucherCodes} onChange={e => setVoucherCodes(e.target.value)} rows={10} placeholder="Paste one code per line" className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 font-mono text-sm outline-none focus:border-blue-500" />
                  <button disabled={saving === "vouchers"} onClick={() => void addVouchers()} className={`${button} mt-3 w-full bg-blue-600 text-white`}>{saving === "vouchers" ? "Saving…" : `Add ${voucherType} vouchers`}</button>
                </section>
                <section className={`${card} overflow-hidden`}>
                  <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-black">Stored vouchers</h2><span className="text-xs text-slate-400">{data.vouchers.length} total</span></div>
                  <div className="max-h-[620px] overflow-auto">
                    <table className="min-w-full text-left text-sm"><thead className="sticky top-0 bg-slate-900 text-xs uppercase text-slate-500"><tr><th className="p-3">Type</th><th className="p-3">Code</th><th className="p-3">Status</th><th className="p-3">Reference</th></tr></thead>
                      <tbody>{data.vouchers.map(v => <tr key={v.id} className="border-t border-slate-800"><td className="p-3 font-bold">{v.voucher_type}</td><td className="p-3 font-mono">{v.code}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-bold ${v.status === "available" ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-700 text-slate-300"}`}>{v.status}</span></td><td className="p-3 text-slate-400">{v.order_reference || "—"}</td></tr>)}</tbody>
                    </table>
                  </div>
                </section>
              </div>
            )}

            {tab === "manual" && (
              <section className={`${card} overflow-hidden`}>
                <h2 className="mb-4 text-lg font-black">Manual processing queue</h2>
                <div className="space-y-3">{data.manualOrders.length === 0 ? <p className="text-slate-400">No manual orders found.</p> : data.manualOrders.map(order => <div key={order.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-black">{order.network} · {order.bundle_size}</p><p className="text-sm text-slate-400">{order.customer_phone} · {order.agent_name || order.agent_code || "Direct"}</p><p className="mt-1 text-xs text-slate-500">{new Date(order.created_at).toLocaleString()}</p></div><div className="text-right"><p className="font-black text-emerald-400">{money(order.amount_paid)}</p><p className="text-xs text-slate-500">Profit {money(order.admin_profit)}</p></div></div>
                  <div className="mt-3 flex flex-wrap gap-2"><span className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold">{order.status}</span>{["processing","completed","failed"].map(status => <button key={status} disabled={saving === order.id} onClick={() => void updateManualOrder(order.id, status)} className={`${button} border border-slate-700 bg-slate-900 capitalize text-slate-200`}>{status}</button>)}</div>
                </div>)}</div>
              </section>
            )}

            {tab === "ai" && (
              <div className="grid gap-4 xl:grid-cols-2">
                <section className={card}><h2 className="mb-4 text-lg font-black">AI activity</h2><div className="max-h-[620px] space-y-3 overflow-auto">{data.activity.map(item => <div key={item.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3"><div className="flex justify-between gap-3"><p className="font-bold">{item.scope} · {item.role}</p><span className="text-xs text-slate-500">{new Date(item.created_at).toLocaleString()}</span></div><p className="mt-2 text-sm text-slate-300">{item.content_redacted}</p><p className="mt-2 text-xs text-slate-500">{item.status} · {item.latency_ms ?? 0}ms · {item.estimated_tokens ?? 0} tokens</p></div>)}</div></section>
                <section className={card}><h2 className="mb-4 text-lg font-black">AI escalations</h2><div className="space-y-3">{data.escalations.length === 0 ? <p className="text-slate-400">No escalations.</p> : data.escalations.map(item => <div key={item.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-bold">Session {item.session_id}</p><p className="mt-2 text-sm text-slate-300">{item.summary_redacted}</p><p className="mt-2 text-xs text-slate-500">{new Date(item.created_at).toLocaleString()}</p></div><span className="rounded-full bg-amber-500/15 px-2 py-1 text-xs font-bold text-amber-300">{item.status}</span></div>{item.status !== "resolved" && <button disabled={saving === item.id} onClick={() => void resolveEscalation(item.id)} className={`${button} mt-3 bg-emerald-500 text-slate-950`}>Mark resolved</button>}</div>)}</div></section>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
