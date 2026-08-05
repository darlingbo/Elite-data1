"use client";
import { useCallback, useEffect, useMemo, useState } from "react";

type RequestRow = { id: string; order_reference: string; exam_type: string; candidate_type: string; candidate_name: string; index_number: string; exam_year: number; date_of_birth: string | null; whatsapp: string; status: string; created_at: string; voucher_code: string | null };
type VoucherRow = { id: number; voucher_type: "BECE" | "WASSCE"; code: string; status: "available" | "assigned" | "sent"; order_reference: string | null; created_at: string };

export default function ResultCheckerAdmin() {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [vouchers, setVouchers] = useState<VoucherRow[]>([]);
  const [voucherType, setVoucherType] = useState<"BECE" | "WASSCE">("BECE");
  const [codes, setCodes] = useState("");
  const [automationEnabled, setAutomationEnabled] = useState(false);
  const [automationEnabledAt, setAutomationEnabledAt] = useState<string | null>(null);
  const [changingTrigger, setChangingTrigger] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [requestsRes, controlRes, triggerRes] = await Promise.all([
        fetch("/api/admin/result-checker", { cache: "no-store" }),
        fetch("/api/admin/control-center", { cache: "no-store" }),
        fetch("/api/admin/automation-trigger", { cache: "no-store" }),
      ]);
      const requestsJson = await requestsRes.json();
      const controlJson = await controlRes.json();
      const triggerJson = await triggerRes.json();
      if (!requestsRes.ok) throw new Error(requestsJson.error || "Could not load requests");
      if (!controlRes.ok) throw new Error(controlJson.error || "Could not load voucher inventory");
      if (!triggerRes.ok) throw new Error(triggerJson.error || "Could not load automation trigger");
      setRows(requestsJson.requests ?? []);
      setVouchers(controlJson.vouchers ?? []);
      setAutomationEnabled(Boolean(triggerJson.enabled));
      setAutomationEnabledAt(triggerJson.enabledAt ?? null);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load result checker data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const stock = useMemo(() => ({
    BECE: vouchers.filter(v => v.voucher_type === "BECE" && v.status === "available").length,
    WASSCE: vouchers.filter(v => v.voucher_type === "WASSCE" && v.status === "available").length,
    assigned: vouchers.filter(v => v.status === "assigned").length,
    sent: vouchers.filter(v => v.status === "sent").length,
  }), [vouchers]);

  async function toggleAutomation() {
    const next = !automationEnabled;
    if (next && !window.confirm("Turn automatic delivery ON for NEW voucher orders only? Old pending orders will remain pending. No automatic retry, refund, or provider switching will be allowed.")) return;
    setChangingTrigger(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/admin/automation-trigger", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not update automation trigger");
      setAutomationEnabled(Boolean(json.enabled));
      setAutomationEnabledAt(json.enabledAt ?? null);
      setNotice(next
        ? "Automatic delivery is ON for new voucher orders only. Existing pending orders were not changed."
        : "Automatic delivery is OFF. New voucher orders will wait for your approval.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update automation trigger");
    } finally {
      setChangingTrigger(false);
    }
  }

  async function addVouchers() {
    const parsed = Array.from(new Set(codes.split(/\r?\n|,/).map(code => code.trim()).filter(Boolean)));
    if (!parsed.length || saving) return;
    setSaving(true);
    setNotice("");
    try {
      const res = await fetch("/api/admin/control-center", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voucherType, codes: parsed }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not add vouchers");
      setCodes("");
      setNotice(`${json.added ?? parsed.length} ${voucherType} voucher${parsed.length === 1 ? "" : "s"} added.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add vouchers");
    } finally {
      setSaving(false);
    }
  }

  async function update(id: string, action: "complete" | "reopen") {
    const res = await fetch("/api/admin/result-checker", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) });
    if (res.ok) void load();
  }

  if (loading) return <p className="py-16 text-center text-slate-500">Loading voucher inventory and result checker requests…</p>;

  return <div className="space-y-5">
    {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>}
    {notice && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">{notice}</div>}

    <section className={`rounded-2xl border p-4 sm:p-5 ${automationEnabled ? "border-emerald-500/40 bg-emerald-500/10" : "border-amber-500/30 bg-amber-500/10"}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className={`h-3 w-3 rounded-full ${automationEnabled ? "bg-emerald-400" : "bg-amber-400"}`} />
            <h2 className="text-lg font-black text-white">New-order automation trigger</h2>
          </div>
          <p className="mt-2 text-sm text-slate-300">
            {automationEnabled
              ? "ON: new paid voucher orders can receive stored codes automatically."
              : "OFF: new paid voucher orders stay pending until you approve them."}
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-400">Old pending orders are never processed by this switch. No automatic retry, refund, provider switch, or second charge.</p>
          {automationEnabledAt && automationEnabled && <p className="mt-2 text-xs text-emerald-300">Enabled {new Date(automationEnabledAt).toLocaleString("en-GH")}</p>}
        </div>
        <button onClick={() => void toggleAutomation()} disabled={changingTrigger}
          className={`min-h-12 rounded-xl px-6 text-sm font-black text-white disabled:opacity-50 ${automationEnabled ? "bg-red-600" : "bg-emerald-600"}`}>
          {changingTrigger ? "Saving…" : automationEnabled ? "Turn OFF" : "Turn ON"}
        </button>
      </div>
    </section>

    <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4 sm:p-5">
      <div className="mb-4">
        <h2 className="text-lg font-black text-white">Stored voucher inventory</h2>
        <p className="mt-1 text-sm text-slate-400">Add BECE or WASSCE voucher codes manually. No external voucher API is used.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-black/20 p-3"><p className="text-[10px] font-bold uppercase text-slate-500">BECE available</p><p className="mt-1 text-2xl font-black text-emerald-300">{stock.BECE}</p></div>
        <div className="rounded-xl bg-black/20 p-3"><p className="text-[10px] font-bold uppercase text-slate-500">WASSCE available</p><p className="mt-1 text-2xl font-black text-emerald-300">{stock.WASSCE}</p></div>
        <div className="rounded-xl bg-black/20 p-3"><p className="text-[10px] font-bold uppercase text-slate-500">Assigned</p><p className="mt-1 text-2xl font-black text-amber-300">{stock.assigned}</p></div>
        <div className="rounded-xl bg-black/20 p-3"><p className="text-[10px] font-bold uppercase text-slate-500">Sent</p><p className="mt-1 text-2xl font-black text-blue-300">{stock.sent}</p></div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-[160px_1fr_auto]">
        <select value={voucherType} onChange={event => setVoucherType(event.target.value as "BECE" | "WASSCE")} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm font-bold text-white">
          <option value="BECE">BECE</option><option value="WASSCE">WASSCE</option>
        </select>
        <textarea value={codes} onChange={event => setCodes(event.target.value)} rows={5} placeholder="Enter one voucher code per line" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white outline-none focus:border-blue-500" />
        <button onClick={() => void addVouchers()} disabled={saving || !codes.trim()} className="min-h-12 rounded-xl bg-blue-600 px-5 text-sm font-black text-white disabled:opacity-40">{saving ? "Adding…" : "Add vouchers"}</button>
      </div>
      <div className="mt-4 max-h-72 overflow-auto rounded-xl border border-slate-800">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="sticky top-0 bg-slate-950 text-xs uppercase text-slate-500"><tr><th className="p-3">Type</th><th>Code</th><th>Status</th><th>Order</th><th>Added</th></tr></thead>
          <tbody>{vouchers.map(voucher => <tr key={voucher.id} className="border-t border-slate-800 text-slate-300"><td className="p-3 font-bold">{voucher.voucher_type}</td><td className="font-mono text-xs">{voucher.code}</td><td className="capitalize">{voucher.status}</td><td className="font-mono text-xs">{voucher.order_reference ?? "—"}</td><td>{new Date(voucher.created_at).toLocaleDateString("en-GH")}</td></tr>)}</tbody>
        </table>
      </div>
    </section>

    <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 text-sm text-slate-300">Customer result-check requests appear below. Stored voucher codes are assigned once and cannot be reused.</div>
    {rows.map(row => {
      const wa = row.whatsapp.replace(/\D/g, "").replace(/^0/, "233");
      const message = encodeURIComponent(`Hello ${row.candidate_name}, your ${row.exam_type} result check from Elite Data is ready.`);
      return <article key={row.id} className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-black text-white">{row.exam_type} · {row.candidate_name}</h3><p className="text-xs text-slate-500">{row.order_reference} · {new Date(row.created_at).toLocaleString("en-GH")}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${row.status === "completed" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>{row.status.replaceAll("_", " ")}</span></div>
        <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">{[["Candidate type", row.candidate_type], ["Exam year", String(row.exam_year)], ["Index number", row.index_number], ["Date of birth", row.date_of_birth ?? "Not required"], ["WhatsApp", row.whatsapp], ["Voucher code", row.voucher_code ?? "Not assigned"]].map(([label, value]) => <div key={label} className="rounded-xl bg-black/20 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 break-all font-semibold text-slate-200">{value}</p></div>)}</div>
        <div className="mt-4 flex flex-wrap gap-2"><a href={`https://wa.me/${wa}?text=${message}`} target="_blank" rel="noreferrer" className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white">Open WhatsApp</a>{row.status === "completed" ? <button onClick={() => update(row.id, "reopen")} className="rounded-xl border border-slate-600 px-4 py-2 text-sm font-bold text-slate-300">Reopen</button> : <button onClick={() => update(row.id, "complete")} disabled={!row.voucher_code} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">Mark completed</button>}</div>
      </article>;
    })}
    {!rows.length && !error && <p className="py-12 text-center text-slate-500">No result checker requests yet.</p>}
  </div>;
}
