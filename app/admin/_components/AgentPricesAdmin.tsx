"use client";
import { useState, useEffect, useCallback } from "react";

interface BundleRow {
  id: string; network: string; size: string; sizeGB: number; validity: string;
  price: number; costPrice: number; active: boolean; isCustom?: boolean;
}
interface CustomAgent {
  id: string; name: string; agent_type?: string; total_sales: number;
}

const netBadge: Record<string, { bg: string; color: string }> = {
  mtn: { bg: "#78350f", color: "#fbbf24" },
  telecel: { bg: "#7f1d1d", color: "#fca5a5" },
  airteltigo: { bg: "#881337", color: "#fda4af" },
};

export default function AgentPricesAdmin({ allAgents }: { allAgents: CustomAgent[] }) {
  const [bundles, setBundles] = useState<BundleRow[]>([]);
  const [tierPrices, setTierPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [tableError, setTableError] = useState("");

  // Edit modal
  const [editing, setEditing] = useState<BundleRow | null>(null);
  const [editPrice, setEditPrice] = useState({ price: "", costPrice: "", tierPrice: "" });
  const [editLoading, setEditLoading] = useState(false);
  const [editMsg, setEditMsg] = useState("");

  // Add form
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ network: "mtn", sizeLabel: "", sizeGB: "", validity: "30 days", price: "", costPrice: "", tierPrice: "" });
  const [addLoading, setAddLoading] = useState(false);
  const [addMsg, setAddMsg] = useState("");

  // Toggle / Delete
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<BundleRow | null>(null);

  const customAgents = allAgents.filter((a) => a.agent_type === "custom_price");

  const load = useCallback(async () => {
    setLoading(true);
    const [bRes, tRes] = await Promise.all([
      fetch("/api/admin/bundles").then((r) => r.json()),
      fetch("/api/admin/agent-tier-prices").then((r) => r.json()),
    ]);
    setBundles(bRes.bundles ?? []);
    if (tRes.tableError) {
      setTableError(tRes.tableError);
    } else {
      const map: Record<string, number> = {};
      for (const row of tRes.prices ?? []) map[row.bundle_id] = row.price;
      setTierPrices(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    if (!editing) return;
    const newPrice = parseFloat(editPrice.price);
    const newCostPrice = parseFloat(editPrice.costPrice);
    const tierPrice = editPrice.tierPrice ? parseFloat(editPrice.tierPrice) : null;

    if (!editPrice.price || isNaN(newPrice) || newPrice <= 0) { setEditMsg("Enter a valid sell price."); return; }
    if (!editPrice.costPrice || isNaN(newCostPrice) || newCostPrice <= 0) { setEditMsg("Enter a valid cost price."); return; }
    if (newCostPrice >= newPrice) { setEditMsg("Cost price must be less than sell price."); return; }
    if (tierPrice !== null && !isNaN(tierPrice) && tierPrice > 0 && tierPrice <= newCostPrice) {
      setEditMsg(`Tier price must be above cost price (GH₵${newCostPrice.toFixed(2)}).`); return;
    }

    setEditLoading(true); setEditMsg("");

    // Save sell price + cost price
    const priceRes = await fetch("/api/admin/bundles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bundleId: editing.id, price: newPrice, costPrice: newCostPrice }),
    });
    const priceD = await priceRes.json();
    if (!priceD.success) {
      setEditLoading(false);
      setEditMsg(priceD.error || "Failed to save prices.");
      return;
    }

    // Save tier price if provided
    if (tierPrice !== null && !isNaN(tierPrice) && tierPrice > 0) {
      const tierRes = await fetch("/api/admin/agent-tier-prices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bundleId: editing.id, price: tierPrice }),
      });
      const tierD = await tierRes.json();
      if (!(tierD.success ?? tierRes.ok)) {
        setEditLoading(false);
        setEditMsg(tierD.error || "Tier price failed to save.");
        return;
      }
      setTierPrices((p) => ({ ...p, [editing.id]: tierPrice }));
    }

    setBundles((prev) => prev.map((b) => b.id === editing.id ? { ...b, price: newPrice, costPrice: newCostPrice } : b));
    setEditLoading(false);
    setEditMsg("Saved!");
    setTimeout(() => { setEditing(null); setEditMsg(""); }, 1400);
  }

  async function handleAddBundle() {
    setAddMsg("");
    if (!addForm.sizeLabel.trim()) return setAddMsg("Size label is required.");
    if (!addForm.sizeGB || isNaN(Number(addForm.sizeGB)) || Number(addForm.sizeGB) <= 0) return setAddMsg("Valid GB size required.");
    if (!addForm.validity.trim()) return setAddMsg("Validity is required.");
    if (!addForm.price || isNaN(Number(addForm.price)) || Number(addForm.price) <= 0) return setAddMsg("Valid sell price required.");
    if (!addForm.costPrice || isNaN(Number(addForm.costPrice)) || Number(addForm.costPrice) <= 0) return setAddMsg("Valid cost price required.");
    if (Number(addForm.costPrice) >= Number(addForm.price)) return setAddMsg("Cost price must be less than sell price.");
    if (addForm.tierPrice && Number(addForm.tierPrice) <= Number(addForm.price)) return setAddMsg("Tier price must be above sell price.");

    setAddLoading(true);
    const res = await fetch("/api/admin/bundles", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        network: addForm.network,
        sizeLabel: addForm.sizeLabel.trim(),
        sizeGB: Number(addForm.sizeGB),
        validity: addForm.validity.trim(),
        price: Number(addForm.price),
        costPrice: Number(addForm.costPrice),
      }),
    });
    const data = await res.json();

    if (data.success && addForm.tierPrice && !isNaN(Number(addForm.tierPrice)) && Number(addForm.tierPrice) > 0) {
      await fetch("/api/admin/agent-tier-prices", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bundleId: data.bundleId, price: Number(addForm.tierPrice) }),
      });
      setTierPrices((p) => ({ ...p, [data.bundleId]: Number(addForm.tierPrice) }));
    }

    setAddLoading(false);
    if (data.success) {
      setAddMsg("Bundle added!");
      setAddForm({ network: "mtn", sizeLabel: "", sizeGB: "", validity: "30 days", price: "", costPrice: "", tierPrice: "" });
      load();
      setTimeout(() => { setAddOpen(false); setAddMsg(""); }, 1800);
    } else {
      setAddMsg(data.error || "Failed to add bundle.");
    }
  }

  async function handleToggleActive(b: BundleRow) {
    setTogglingId(b.id);
    await fetch("/api/admin/bundles", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bundleId: b.id, active: !b.active }),
    });
    setBundles((prev) => prev.map((x) => x.id === b.id ? { ...x, active: !b.active } : x));
    setTogglingId(null);
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeletingId(confirmDelete.id);
    await fetch("/api/admin/bundles", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bundleId: confirmDelete.id }),
    });
    setConfirmDelete(null);
    setDeletingId(null);
    load();
  }

  if (loading) return (
    <div className="flex items-center justify-center py-40">
      <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-white">Agent Pricing</h1>
          <p className="text-sm text-slate-500">
            Edit bundles, prices & set the tier base price for all{" "}
            <span className="text-purple-400 font-bold">{customAgents.length} custom-price agent{customAgents.length !== 1 ? "s" : ""}</span>
          </p>
        </div>
        <button onClick={() => { setAddOpen((v) => !v); setAddMsg(""); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all"
          style={{ background: "linear-gradient(90deg,#8b5cf6,#a78bfa)" }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Bundle
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl p-4 border border-[#1e3050]" style={{ background: "#162032" }}>
          <p className="text-xs text-slate-500 mb-1">Custom Price Agents</p>
          <p className="text-2xl font-black text-purple-400">{customAgents.length}</p>
        </div>
        <div className="rounded-xl p-4 border border-[#1e3050]" style={{ background: "#162032" }}>
          <p className="text-xs text-slate-500 mb-1">Tier Prices Set</p>
          <p className="text-2xl font-black text-white">{Object.keys(tierPrices).length} <span className="text-sm text-slate-500 font-normal">/ {bundles.length}</span></p>
        </div>
        <div className="rounded-xl p-4 border border-[#1e3050]" style={{ background: "#162032" }}>
          <p className="text-xs text-slate-500 mb-1">Active Bundles</p>
          <p className="text-2xl font-black text-green-400">{bundles.filter((b) => b.active).length}</p>
        </div>
      </div>

      {/* Info */}
      <div className="rounded-xl px-4 py-3 border border-purple-500/20 flex items-start gap-3" style={{ background: "rgba(139,92,246,0.07)" }}>
        <svg className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-xs text-purple-300 leading-relaxed">
          <span className="font-bold text-purple-200">Tier Price</span> is the base your custom-price agents see — they add their own markup on top.
          Your profit = Tier Price − Cost. Agent profit = Their markup − Tier Price. Changes take effect immediately for all agents.
        </p>
      </div>

      {/* SQL notice */}
      {tableError && (
        <div className="rounded-xl px-4 py-4 border border-amber-500/30" style={{ background: "rgba(245,158,11,0.08)" }}>
          <p className="text-amber-300 font-bold text-sm mb-2">⚠️ One-time setup required</p>
          <p className="text-amber-200 text-xs mb-3">Run this SQL in your Supabase SQL editor:</p>
          <pre className="text-xs font-mono text-green-300 p-3 rounded-lg overflow-x-auto" style={{ background: "#0e1928" }}>
{`CREATE TABLE IF NOT EXISTS custom_tier_prices (
  bundle_id text PRIMARY KEY,
  price numeric NOT NULL,
  updated_at timestamptz DEFAULT now()
);`}
          </pre>
        </div>
      )}

      {/* Add form */}
      {addOpen && (
        <div className="rounded-2xl border border-purple-500/30 p-5" style={{ background: "#0e1928" }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-black text-white text-base">Add New Bundle</p>
              <p className="text-xs text-slate-500 mt-0.5">All fields required except Tier Price (optional, but recommended)</p>
            </div>
            <button onClick={() => { setAddOpen(false); setAddMsg(""); }} className="text-slate-500 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Network</label>
              <select value={addForm.network} onChange={(e) => setAddForm((a) => ({ ...a, network: e.target.value }))}
                className="w-full rounded-lg px-3 py-2.5 text-sm text-white border border-[#1e3050] focus:outline-none focus:border-purple-500" style={{ background: "#162032" }}>
                <option value="mtn">MTN</option>
                <option value="telecel">Telecel</option>
                <option value="airteltigo">AirtelTigo</option>
              </select>
            </div>
            {[
              { label: "Size Label", key: "sizeLabel", placeholder: "e.g. 3GB" },
              { label: "GB (for API)", key: "sizeGB", placeholder: "e.g. 3", type: "number" as const },
              { label: "Validity", key: "validity", placeholder: "30 days" },
              { label: "Sell Price (GH₵)", key: "price", placeholder: "e.g. 15", type: "number" as const },
              { label: "Cost Price (GH₵)", key: "costPrice", placeholder: "e.g. 11", type: "number" as const },
              { label: "Tier Price (GH₵)", key: "tierPrice", placeholder: "e.g. 17", type: "number" as const },
            ].map((f) => (
              <div key={f.label}>
                <label className={`block text-xs font-semibold mb-1 ${f.key === "tierPrice" ? "text-purple-300" : "text-slate-400"}`}>{f.label}</label>
                <input type={f.type ?? "text"} step={f.type === "number" ? "0.01" : undefined} min={f.type === "number" ? "0.01" : undefined}
                  placeholder={f.placeholder} value={addForm[f.key as keyof typeof addForm]}
                  onChange={(e) => setAddForm((a) => ({ ...a, [f.key]: e.target.value }))}
                  className={`w-full rounded-lg px-3 py-2.5 text-sm text-white border focus:outline-none focus:border-purple-500 ${f.key === "tierPrice" ? "border-purple-700/60" : "border-[#1e3050]"}`}
                  style={{ background: "#162032" }} />
              </div>
            ))}
          </div>
          {addForm.price && addForm.costPrice && !isNaN(Number(addForm.price)) && !isNaN(Number(addForm.costPrice)) && Number(addForm.price) > Number(addForm.costPrice) && (
            <div className="mt-3 flex flex-wrap gap-4 text-xs font-semibold">
              <span style={{ color: "#4ade80" }}>Margin: GH₵{(Number(addForm.price) - Number(addForm.costPrice)).toFixed(2)}</span>
              {addForm.tierPrice && !isNaN(Number(addForm.tierPrice)) && Number(addForm.tierPrice) > Number(addForm.costPrice) && (
                <span style={{ color: "#a78bfa" }}>
                  Your profit at tier price: GH₵{(Number(addForm.tierPrice) - Number(addForm.costPrice)).toFixed(2)}
                </span>
              )}
            </div>
          )}
          {addMsg && <p className={`mt-3 text-xs font-semibold ${addMsg === "Bundle added!" ? "text-green-400" : "text-red-400"}`}>{addMsg}</p>}
          <div className="mt-4 flex gap-3">
            <button onClick={() => { setAddOpen(false); setAddMsg(""); }}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-400 border border-[#1e3050] hover:text-white transition-colors">Cancel</button>
            <button onClick={handleAddBundle} disabled={addLoading}
              className="px-6 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-60 transition-all"
              style={{ background: "linear-gradient(90deg,#8b5cf6,#a78bfa)" }}>
              {addLoading ? "Saving…" : "Save Bundle"}
            </button>
          </div>
        </div>
      )}

      {/* Bundle table */}
      <div className="rounded-2xl border border-[#1e3050] overflow-hidden" style={{ background: "#162032" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e3050] text-xs text-slate-500 uppercase tracking-wider" style={{ background: "#0e1928" }}>
                {["Network", "Bundle", "Sell Price", "Cost", "Your Profit", "Tier Price", "Agent Profit", "Status", "Actions"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap">
                    {h === "Tier Price" ? <span className="text-purple-400">{h} ✎</span> : h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bundles.map((b) => {
                const nb = netBadge[b.network.toLowerCase()] ?? { bg: "#1e293b", color: "#94a3b8" };
                const tierPrice = tierPrices[b.id];
                const adminProfit = b.price - b.costPrice;
                const agentProfit = tierPrice ? tierPrice - b.price : null;
                return (
                  <tr key={b.id} className={`border-b border-[#1e3050]/50 last:border-0 transition-colors ${b.active ? "hover:bg-[#1e3050]/30" : "opacity-50 hover:opacity-70"}`}>
                    <td className="px-4 py-3.5">
                      <span className="text-[10px] font-black px-2 py-0.5 rounded" style={{ background: nb.bg, color: nb.color }}>
                        {b.network.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 font-semibold text-slate-300">{b.size}</td>
                    <td className="px-4 py-3.5 font-black text-white">GH₵{b.price.toFixed(2)}</td>
                    <td className="px-4 py-3.5 text-slate-500 text-xs font-mono">GH₵{b.costPrice.toFixed(2)}</td>
                    <td className="px-4 py-3.5">
                      <span className="font-black text-xs" style={{ color: adminProfit > 0 ? "#4ade80" : "#f87171" }}>
                        GH₵{adminProfit.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      {tierPrice ? (
                        <span className="font-bold text-xs text-purple-300 font-mono">GH₵{tierPrice.toFixed(2)}</span>
                      ) : (
                        <span className="text-slate-600 text-xs italic">Not set</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      {agentProfit !== null ? (
                        <span className="font-black text-xs" style={{ color: agentProfit > 0 ? "#a78bfa" : "#f87171" }}>
                          GH₵{agentProfit.toFixed(2)}
                        </span>
                      ) : <span className="text-slate-600 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3.5">
                      <button onClick={() => handleToggleActive(b)} disabled={togglingId === b.id}
                        className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 disabled:opacity-40"
                        style={{ background: b.active ? "#8b5cf6" : "#374151" }}>
                        <span className="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out"
                          style={{ transform: b.active ? "translateX(16px)" : "translateX(0)" }} />
                      </button>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setEditing(b);
                            setEditPrice({ price: String(b.price), costPrice: String(b.costPrice), tierPrice: tierPrice ? String(tierPrice) : "" });
                            setEditMsg("");
                          }}
                          className="text-xs font-bold px-3 py-1.5 rounded-lg transition-colors text-purple-400 border border-purple-500/30 hover:border-purple-400"
                          style={{ background: "rgba(139,92,246,0.1)" }}>
                          Edit
                        </button>
                        {b.isCustom && (
                          <button onClick={() => setConfirmDelete(b)}
                            className="text-xs font-bold px-2.5 py-1.5 rounded-lg transition-colors text-red-400 border border-red-500/30 hover:border-red-400"
                            style={{ background: "rgba(248,113,113,0.08)" }}>
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
          {bundles.length === 0 && !tableError && (
            <div className="py-16 text-center">
              <p className="text-4xl mb-3">📦</p>
              <p className="text-slate-500 font-semibold">No bundles yet — add your first one above.</p>
            </div>
          )}
        </div>
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="rounded-2xl shadow-2xl w-full max-w-sm p-6 border border-[#1e3050] max-h-[90vh] overflow-y-auto" style={{ background: "#162032" }}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-black px-2 py-0.5 rounded"
                style={netBadge[editing.network.toLowerCase()] ? { background: netBadge[editing.network.toLowerCase()].bg, color: netBadge[editing.network.toLowerCase()].color } : {}}>
                {editing.network.toUpperCase()}
              </span>
              <h3 className="font-black text-white text-lg">Edit Bundle</h3>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Sets the base price custom-price agents see. Does <span className="text-white font-bold">not</span> affect commission agents or customer prices.
            </p>
            <div className="space-y-3">
              {/* Editable: sell price */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Customer Sell Price (GH₵) — <span className="text-slate-500 font-normal">what customers pay</span>
                </label>
                <input type="number" step="0.01" min="0.01" value={editPrice.price}
                  onChange={(e) => setEditPrice((p) => ({ ...p, price: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2.5 text-sm text-white border border-[#1e3050] focus:outline-none focus:border-blue-500"
                  style={{ background: "#0e1928" }} />
              </div>

              {/* Editable: cost price */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Inventor Cost Price (GH₵) — <span className="text-slate-500 font-normal">what you pay Inventor</span>
                </label>
                <input type="number" step="0.01" min="0.01" value={editPrice.costPrice}
                  onChange={(e) => setEditPrice((p) => ({ ...p, costPrice: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2.5 text-sm text-white border border-[#1e3050] focus:outline-none focus:border-blue-500"
                  style={{ background: "#0e1928" }} />
              </div>

              {/* Editable: tier price */}
              <div>
                <label className="block text-xs font-semibold text-purple-300 mb-1">
                  Tier Price (GH₵) — <span className="text-slate-500 font-normal">what custom-price agents pay as their base</span>
                </label>
                <input type="number" step="0.01" min="0.01" value={editPrice.tierPrice}
                  onChange={(e) => setEditPrice((p) => ({ ...p, tierPrice: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2.5 text-sm text-white border border-purple-700/60 focus:outline-none focus:border-purple-500"
                  style={{ background: "#0e1928" }} />
              </div>
              {editPrice.price && editPrice.costPrice && !isNaN(parseFloat(editPrice.price)) && !isNaN(parseFloat(editPrice.costPrice)) && parseFloat(editPrice.price) > parseFloat(editPrice.costPrice) && (
                <div className="rounded-lg px-3 py-2 text-xs space-y-1" style={{ background: "rgba(139,92,246,0.08)" }}>
                  <p className="text-green-400">
                    Platform margin: GH₵{(parseFloat(editPrice.price) - parseFloat(editPrice.costPrice)).toFixed(2)}
                  </p>
                  {editPrice.tierPrice && !isNaN(parseFloat(editPrice.tierPrice)) && parseFloat(editPrice.tierPrice) > parseFloat(editPrice.costPrice) && (
                    <p className="text-purple-300">
                      Your profit at tier price: GH₵{(parseFloat(editPrice.tierPrice) - parseFloat(editPrice.costPrice)).toFixed(2)}
                    </p>
                  )}
                </div>
              )}
              {editMsg && (
                <p className={`text-xs font-semibold ${editMsg.startsWith("Saved") ? "text-green-400" : "text-red-400"}`}>{editMsg}</p>
              )}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => { setEditing(null); setEditMsg(""); }}
                className="flex-1 border border-[#1e3050] text-slate-400 font-semibold py-2.5 rounded-xl text-sm hover:text-white transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={editLoading}
                className="flex-1 text-white font-bold py-2.5 rounded-xl text-sm disabled:opacity-60"
                style={{ background: "linear-gradient(90deg,#8b5cf6,#a78bfa)" }}>
                {editLoading ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="rounded-2xl shadow-2xl w-full max-w-sm p-6 border border-[#1e3050]" style={{ background: "#162032" }}>
            <h3 className="font-black text-white text-lg mb-2">Delete Bundle?</h3>
            <p className="text-sm text-slate-400 mb-5">
              Remove <span className="text-white font-bold">{confirmDelete.size}</span> ({confirmDelete.network.toUpperCase()}) permanently? This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 border border-[#1e3050] text-slate-400 font-semibold py-2.5 rounded-xl text-sm hover:text-white transition-colors">Cancel</button>
              <button onClick={handleDelete} disabled={!!deletingId}
                className="flex-1 text-white font-bold py-2.5 rounded-xl text-sm disabled:opacity-60"
                style={{ background: "linear-gradient(90deg,#dc2626,#f87171)" }}>
                {deletingId ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
