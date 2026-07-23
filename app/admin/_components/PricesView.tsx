"use client";
import { useState, useEffect, useCallback } from "react";

interface BundleRow {
  id: string; network: string; size: string; sizeGB: number; validity: string;
  price: number; costPrice: number; apiPrice?: number | null; hasOverride: boolean; active: boolean; isCustom?: boolean;
}

const netBadge: Record<string, { bg: string; color: string }> = {
  mtn: { bg: "#78350f", color: "#fbbf24" },
  telecel: { bg: "#7f1d1d", color: "#fca5a5" },
  airteltigo: { bg: "#881337", color: "#fda4af" },
};

export default function PricesView() {
  const [bundles, setBundles] = useState<BundleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<BundleRow | null>(null);
  const [editPrice, setEditPrice] = useState({ price: "", costPrice: "", apiPrice: "" });
  const [editMeta, setEditMeta] = useState({ sizeLabel: "", sizeGB: "", validity: "" });
  const [editLoading, setEditLoading] = useState(false);
  const [editMsg, setEditMsg] = useState("");
  const [search, setSearch] = useState("");
  const [networkFilter, setNetworkFilter] = useState<"all" | "mtn" | "telecel" | "airteltigo">("all");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<BundleRow | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ network: "mtn", sizeLabel: "", sizeGB: "", validity: "30 days", price: "", costPrice: "" });
  const [addLoading, setAddLoading] = useState(false);
  const [addMsg, setAddMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/bundles");
    const data = await res.json();
    setBundles(data.bundles ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { const t = setTimeout(() => void load(), 0); return () => clearTimeout(t); }, [load]);

  async function handleAddBundle() {
    setAddMsg("");
    if (!addForm.sizeLabel.trim()) return setAddMsg("Size label is required.");
    if (!addForm.sizeGB || isNaN(Number(addForm.sizeGB)) || Number(addForm.sizeGB) <= 0) return setAddMsg("Valid GB size required.");
    if (!addForm.validity.trim()) return setAddMsg("Validity is required.");
    if (!addForm.price || isNaN(Number(addForm.price)) || Number(addForm.price) <= 0) return setAddMsg("Valid selling price required.");
    if (!addForm.costPrice || isNaN(Number(addForm.costPrice)) || Number(addForm.costPrice) <= 0) return setAddMsg("Valid cost price required.");
    if (Number(addForm.costPrice) >= Number(addForm.price)) return setAddMsg("Cost price must be less than selling price.");
    setAddLoading(true);
    const res = await fetch("/api/admin/bundles", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ network: addForm.network, sizeLabel: addForm.sizeLabel.trim(), sizeGB: Number(addForm.sizeGB), validity: addForm.validity.trim(), price: Number(addForm.price), costPrice: Number(addForm.costPrice) }),
    });
    const data = await res.json();
    setAddLoading(false);
    if (data.success) {
      setAddMsg("Bundle added!");
      setAddForm({ network: "mtn", sizeLabel: "", sizeGB: "", validity: "30 days", price: "", costPrice: "" });
      load();
      setTimeout(() => { setAddOpen(false); setAddMsg(""); }, 1800);
    } else { setAddMsg(data.error || "Failed to add bundle."); }
  }

  async function handleSave() {
    if (!editing) return;
    if (!editPrice.price || !editPrice.costPrice || isNaN(parseFloat(editPrice.price)) || isNaN(parseFloat(editPrice.costPrice))) { setEditMsg("Enter valid numbers for both prices."); return; }
    if (editMeta.sizeGB && (isNaN(parseFloat(editMeta.sizeGB)) || parseFloat(editMeta.sizeGB) <= 0)) { setEditMsg("Size (GB) must be a positive number."); return; }
    setEditLoading(true); setEditMsg("");
    const body: Record<string, unknown> = { bundleId: editing.id, price: parseFloat(editPrice.price), costPrice: parseFloat(editPrice.costPrice), apiPrice: editPrice.apiPrice ? parseFloat(editPrice.apiPrice) : null, active: editing.active };
    if (editMeta.sizeLabel.trim()) body.sizeLabel = editMeta.sizeLabel.trim();
    if (editMeta.sizeGB) body.sizeGB = parseFloat(editMeta.sizeGB);
    if (editMeta.validity.trim()) body.validity = editMeta.validity.trim();
    const res = await fetch("/api/admin/bundles", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (data.success) { setEditMsg(data.warning ? `Saved! Note: ${data.warning}` : "Saved!"); load(); setTimeout(() => { setEditing(null); setEditMsg(""); }, 1500); }
    else setEditMsg(data.error || "Error");
    setEditLoading(false);
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeletingId(confirmDelete.id);
    await fetch("/api/admin/bundles", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bundleId: confirmDelete.id }),
    });
    setConfirmDelete(null);
    setDeletingId(null);
    load();
  }

  async function handleToggleActive(b: BundleRow) {
    setTogglingId(b.id);
    await fetch("/api/admin/bundles", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bundleId: b.id, active: !b.active }) });
    setBundles((prev) => prev.map((x) => x.id === b.id ? { ...x, active: !b.active } : x));
    setTogglingId(null);
  }

  const shown = bundles.filter((b) => {
    const q = search.toLowerCase();
    return (networkFilter === "all" || b.network.toLowerCase() === networkFilter) && (!q || b.size.toLowerCase().includes(q));
  });

  const totals = { active: bundles.filter((b) => b.active).length, inactive: bundles.filter((b) => !b.active).length };

  return (
    <div className="admin-section space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-white">Bundle Management</h1>
          <p className="text-sm text-slate-500">Edit prices, toggle visibility — {totals.active} active, {totals.inactive} hidden</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setAddOpen((v) => !v); setAddMsg(""); }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all"
            style={{ background: "linear-gradient(90deg,#3b82f6,#8b5cf6)" }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Add New Bundle
          </button>
          <div className="flex gap-1 rounded-xl p-1 border border-[#1e3050]" style={{ background: "#0e1928" }}>
            {(["all", "mtn", "telecel", "airteltigo"] as const).map((n) => (
              <button key={n} onClick={() => setNetworkFilter(n)}
                className="text-[11px] font-bold px-2.5 py-1 rounded-lg capitalize transition-all"
                style={networkFilter === n ? { background: "linear-gradient(90deg,#3b82f6,#8b5cf6)", color: "#fff" } : { color: "#64748b" }}>
                {n === "all" ? "All" : n === "airteltigo" ? "AT" : n.charAt(0).toUpperCase() + n.slice(1)}
              </button>
            ))}
          </div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">🔍</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…"
              className="pl-9 pr-4 py-2 text-sm rounded-xl border border-[#1e3050] focus:outline-none focus:border-blue-500 w-36 text-white placeholder-slate-600"
              style={{ background: "#162032" }} />
          </div>
        </div>
      </div>

      {addOpen && (
        <div className="rounded-2xl border border-blue-500/30 p-5" style={{ background: "#0e1928" }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-black text-white text-base">Add New Bundle</p>
              <p className="text-xs text-slate-500 mt-0.5">Fill in all details and click Save to add a new bundle to the store</p>
            </div>
            <button onClick={() => { setAddOpen(false); setAddMsg(""); }} className="text-slate-500 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: "Network", type: "select" as const },
              { label: "Size Label", key: "sizeLabel", placeholder: "e.g. 3GB" },
              { label: "GB (for API)", key: "sizeGB", placeholder: "e.g. 3", type: "number" as const },
              { label: "Validity", key: "validity", placeholder: "30 days" },
              { label: "Sell Price (GH₵)", key: "price", placeholder: "e.g. 15", type: "number" as const },
              { label: "Cost Price (GH₵)", key: "costPrice", placeholder: "e.g. 11", type: "number" as const },
            ].map((f) => (
              <div key={f.label}>
                <label className="block text-xs font-semibold text-slate-400 mb-1">{f.label}</label>
                {f.type === "select" ? (
                  <select value={addForm.network} onChange={(e) => setAddForm((a) => ({ ...a, network: e.target.value }))}
                    className="w-full rounded-lg px-3 py-2.5 text-sm text-white border border-[#1e3050] focus:outline-none focus:border-blue-500" style={{ background: "#162032" }}>
                    <option value="mtn">MTN</option><option value="telecel">Telecel</option><option value="airteltigo">AirtelTigo</option>
                  </select>
                ) : (
                  <input type={f.type ?? "text"} step={f.type === "number" ? "0.01" : undefined} min={f.type === "number" ? "0.01" : undefined}
                    placeholder={f.placeholder} value={addForm[f.key as keyof typeof addForm]}
                    onChange={(e) => setAddForm((a) => ({ ...a, [f.key!]: e.target.value }))}
                    className="w-full rounded-lg px-3 py-2.5 text-sm text-white border border-[#1e3050] focus:outline-none focus:border-blue-500" style={{ background: "#162032" }} />
                )}
              </div>
            ))}
          </div>
          {addForm.price && addForm.costPrice && !isNaN(Number(addForm.price)) && !isNaN(Number(addForm.costPrice)) && Number(addForm.price) > Number(addForm.costPrice) && (
            <div className="mt-3 text-xs font-semibold" style={{ color: "#4ade80" }}>
              Margin: GH₵{(Number(addForm.price) - Number(addForm.costPrice)).toFixed(2)} ({(((Number(addForm.price) - Number(addForm.costPrice)) / Number(addForm.price)) * 100).toFixed(0)}%)
            </div>
          )}
          {addMsg && <p className={`mt-3 text-xs font-semibold ${addMsg === "Bundle added!" ? "text-green-400" : "text-red-400"}`}>{addMsg}</p>}
          <div className="mt-4 flex gap-3">
            <button onClick={() => { setAddOpen(false); setAddMsg(""); }} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-400 border border-[#1e3050] hover:text-white transition-colors">Cancel</button>
            <button onClick={handleAddBundle} disabled={addLoading} className="px-6 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-60 transition-all" style={{ background: "linear-gradient(90deg,#3b82f6,#8b5cf6)" }}>
              {addLoading ? "Saving…" : "Save Bundle"}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-[#1e3050] overflow-hidden" style={{ background: "#162032" }}>
        {loading ? <p className="text-center text-slate-500 py-16">Loading…</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e3050] text-xs text-slate-500 uppercase tracking-wider" style={{ background: "#0e1928" }}>
                  {["Network","Bundle","Validity","Sell Price","Cost","Margin","Status","Actions"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((b) => {
                  const nb = netBadge[b.network.toLowerCase()] ?? { bg: "#1e293b", color: "#94a3b8" };
                  const margin = b.price - b.costPrice;
                  return (
                    <tr key={b.id} className={`border-b border-[#1e3050]/50 last:border-0 transition-colors ${b.active ? "hover:bg-[#1e3050]/30" : "opacity-50 hover:opacity-70"}`}>
                      <td className="px-4 py-3.5"><span className="text-[10px] font-black px-2 py-0.5 rounded" style={{ background: nb.bg, color: nb.color }}>{b.network.toUpperCase()}</span></td>
                      <td className="px-4 py-3.5 font-semibold text-slate-300">
                        {b.size}
                        {b.hasOverride && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ background: "rgba(59,130,246,0.15)", color: "#60a5fa" }}>custom</span>}
                      </td>
                      <td className="px-4 py-3.5 text-slate-500 text-xs">{b.validity}</td>
                      <td className="px-4 py-3.5 font-black text-white">GH₵{b.price.toFixed(2)}</td>
                      <td className="px-4 py-3.5 text-slate-500">GH₵{b.costPrice.toFixed(2)}</td>
                      <td className="px-4 py-3.5">
                        <span className="font-black" style={{ color: "#4ade80" }}>GH₵{margin.toFixed(2)}</span>
                        <span className="text-slate-600 text-xs ml-1">({((margin / b.price) * 100).toFixed(0)}%)</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <button onClick={() => handleToggleActive(b)} disabled={togglingId === b.id}
                          className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-40"
                          style={{ background: b.active ? "#10b981" : "#374151" }} title={b.active ? "Click to hide" : "Click to show"}>
                          <span className="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out" style={{ transform: b.active ? "translateX(16px)" : "translateX(0)" }} />
                        </button>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <button onClick={() => { setEditing(b); setEditPrice({ price: String(b.price), costPrice: String(b.costPrice), apiPrice: b.apiPrice != null ? String(b.apiPrice) : "" }); setEditMeta({ sizeLabel: b.size, sizeGB: String(b.sizeGB), validity: b.validity }); setEditMsg(""); }}
                            className="text-xs font-bold px-3 py-1.5 rounded-lg transition-colors text-blue-400 border border-blue-500/30 hover:border-blue-400" style={{ background: "rgba(59,130,246,0.1)" }}>
                            Edit
                          </button>
                          {b.isCustom && (
                            <button onClick={() => setConfirmDelete(b)}
                              className="text-xs font-bold px-2.5 py-1.5 rounded-lg transition-colors text-red-400 border border-red-500/30 hover:border-red-400" style={{ background: "rgba(248,113,113,0.08)" }}>
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {shown.length === 0 && <p className="text-center text-slate-500 py-10">No bundles match your filter.</p>}
          </div>
        )}
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="rounded-2xl shadow-2xl w-full max-w-sm p-6 border border-[#1e3050]" style={{ background: "#162032" }}>
            <h3 className="font-black text-white text-lg mb-2">Delete Bundle?</h3>
            <p className="text-sm text-slate-400 mb-1">
              This will permanently remove <span className="text-white font-bold">{confirmDelete.size}</span> ({confirmDelete.network.toUpperCase()}) from the store.
            </p>
            <p className="text-xs text-slate-500 mb-5">Customers will no longer see or buy this bundle. This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 border border-[#1e3050] text-slate-400 font-semibold py-2.5 rounded-xl text-sm hover:text-white transition-colors">Cancel</button>
              <button onClick={handleDelete} disabled={!!deletingId}
                className="flex-1 text-white font-bold py-2.5 rounded-xl text-sm disabled:opacity-60"
                style={{ background: "linear-gradient(90deg,#dc2626,#f87171)" }}>
                {deletingId ? "Deleting…" : "Delete Bundle"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="rounded-2xl shadow-2xl w-full max-w-sm p-6 border border-[#1e3050] max-h-[90vh] overflow-y-auto" style={{ background: "#162032" }}>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[11px] font-black px-2 py-0.5 rounded" style={netBadge[editing.network.toLowerCase()] ? { background: netBadge[editing.network.toLowerCase()].bg, color: netBadge[editing.network.toLowerCase()].color } : {}}>
                {editing.network.toUpperCase()}
              </span>
              <h3 className="font-black text-white text-lg">Edit Bundle</h3>
            </div>
            <p className="text-xs text-slate-500 mb-4">Changes override the defaults. Leave size/validity blank to keep current.</p>
            <div className="space-y-3">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pricing</p>
              {[{ label: "Selling Price (GH₵)", key: "price" as const }, { label: "Cost / Fulfillment (GH₵)", key: "costPrice" as const }].map(({ label, key }) => (
                <div key={key}>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">{label}</label>
                  <input type="number" step="0.01" min="0.01" value={editPrice[key]} onChange={(e) => setEditPrice((p) => ({ ...p, [key]: e.target.value }))}
                    className="w-full rounded-lg px-3 py-2.5 text-sm text-white border border-[#1e3050] focus:outline-none focus:border-blue-500" style={{ background: "#0e1928" }} />
                </div>
              ))}
              {editPrice.price && editPrice.costPrice && !isNaN(parseFloat(editPrice.price)) && !isNaN(parseFloat(editPrice.costPrice)) && (
                <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(16,185,129,0.1)", color: "#4ade80" }}>
                  <span className="font-black">Margin: GH₵{(parseFloat(editPrice.price) - parseFloat(editPrice.costPrice)).toFixed(2)}</span>
                  <span className="opacity-60 ml-1">({(((parseFloat(editPrice.price) - parseFloat(editPrice.costPrice)) / parseFloat(editPrice.price)) * 100).toFixed(0)}% of sale)</span>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">API Price (GH₵) <span className="text-slate-600">(charged to developer API users — leave blank to use selling price)</span></label>
                <input type="number" step="0.01" min="0.01" placeholder={editPrice.price ? `Default: GH₵${parseFloat(editPrice.price).toFixed(2)}` : "e.g. 6.00"} value={editPrice.apiPrice} onChange={(e) => setEditPrice((p) => ({ ...p, apiPrice: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2.5 text-sm text-white border border-[#1e3050] focus:outline-none focus:border-blue-500" style={{ background: "#0e1928" }} />
              </div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider pt-2">Bundle Details</p>
              {[
                { label: "Display Size Label", key: "sizeLabel" as const, placeholder: editing.size, hint: "(e.g. 2GB, 500MB)" },
                { label: "Data Size in GB", key: "sizeGB" as const, placeholder: String(editing.sizeGB), hint: "(for Inventor API)", type: "number" },
                { label: "Validity", key: "validity" as const, placeholder: editing.validity, hint: "(e.g. 30 days)" },
              ].map(({ label, key, placeholder, hint, type }) => (
                <div key={key}>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">{label} <span className="text-slate-600">{hint}</span></label>
                  <input type={type ?? "text"} step={type === "number" ? "0.01" : undefined} min={type === "number" ? "0.01" : undefined}
                    placeholder={placeholder} value={editMeta[key]} onChange={(e) => setEditMeta((m) => ({ ...m, [key]: e.target.value }))}
                    className="w-full rounded-lg px-3 py-2.5 text-sm text-white border border-[#1e3050] focus:outline-none focus:border-blue-500" style={{ background: "#0e1928" }} />
                </div>
              ))}
              {editMsg && <p className={`text-xs font-semibold ${editMsg.startsWith("Saved") ? "text-green-400" : "text-red-400"}`}>{editMsg}</p>}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => { setEditing(null); setEditMsg(""); }} className="flex-1 border border-[#1e3050] text-slate-400 font-semibold py-2.5 rounded-xl text-sm hover:text-white transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={editLoading} className="flex-1 text-white font-bold py-2.5 rounded-xl text-sm disabled:opacity-60" style={{ background: "linear-gradient(90deg,#3b82f6,#8b5cf6)" }}>
                {editLoading ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
