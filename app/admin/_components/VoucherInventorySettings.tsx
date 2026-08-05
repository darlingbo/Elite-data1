"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type VoucherRow = {
  id: number;
  voucher_type: "BECE" | "WASSCE";
  code: string;
  status: "available" | "assigned" | "sent";
  order_reference: string | null;
  created_at: string;
};

export default function VoucherInventorySettings() {
  const [vouchers, setVouchers] = useState<VoucherRow[]>([]);
  const [voucherType, setVoucherType] = useState<"BECE" | "WASSCE">("BECE");
  const [codes, setCodes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/control-center", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load voucher inventory");
      setVouchers(body.vouchers ?? []);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load voucher inventory");
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

  async function addVouchers() {
    const parsed = Array.from(new Set(codes.split(/\r?\n|,/).map(code => code.trim()).filter(Boolean)));
    if (!parsed.length || saving) return;
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/admin/control-center", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voucherType, codes: parsed }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not add vouchers");
      setCodes("");
      setNotice(`${body.added ?? parsed.length} ${voucherType} voucher${parsed.length === 1 ? "" : "s"} added.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add vouchers");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4 sm:p-5">
      <div className="mb-4">
        <h2 className="text-lg font-black text-white">🎟 Stored Voucher Inventory</h2>
        <p className="mt-1 text-sm text-slate-400">Add and manage BECE or WASSCE voucher codes manually. No external voucher API is used.</p>
      </div>

      {error && <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>}
      {notice && <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">{notice}</div>}

      {loading ? <p className="py-8 text-center text-slate-500">Loading voucher inventory…</p> : <>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-black/20 p-3"><p className="text-[10px] font-bold uppercase text-slate-500">BECE available</p><p className="mt-1 text-2xl font-black text-emerald-300">{stock.BECE}</p></div>
          <div className="rounded-xl bg-black/20 p-3"><p className="text-[10px] font-bold uppercase text-slate-500">WASSCE available</p><p className="mt-1 text-2xl font-black text-emerald-300">{stock.WASSCE}</p></div>
          <div className="rounded-xl bg-black/20 p-3"><p className="text-[10px] font-bold uppercase text-slate-500">Assigned</p><p className="mt-1 text-2xl font-black text-amber-300">{stock.assigned}</p></div>
          <div className="rounded-xl bg-black/20 p-3"><p className="text-[10px] font-bold uppercase text-slate-500">Sent</p><p className="mt-1 text-2xl font-black text-blue-300">{stock.sent}</p></div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[160px_1fr_auto]">
          <select value={voucherType} onChange={event => setVoucherType(event.target.value as "BECE" | "WASSCE")} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm font-bold text-white">
            <option value="BECE">BECE</option>
            <option value="WASSCE">WASSCE</option>
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
      </>}
    </section>
  );
}
