"use client";
import { useState, useEffect } from "react";

const BG = "#0b1120", CARD = "#111827", BORDER = "#1f2937";
function fmt(n: number) { return `GH₵${Number(n).toFixed(2)}`; }

interface Customer { name: string; phone: string; networks: string[]; orders: number; spent: number; lastOrder: string }

export default function CustomersAdmin() {
  const [data, setData] = useState<{ customers: Customer[]; totalSpent: number; avgOrders: number; repeatBuyers: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/admin/customers").then(r => r.json()).then(setData).finally(() => setLoading(false));
  }, []);

  const customers = (data?.customers ?? []).filter(c =>
    !search || c.name?.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search)
  );

  const netBadge = (n: string) => {
    if (n === "MTN") return { bg: "#78350f", color: "#fbbf24" };
    if (n === "TELECEL") return { bg: "#7f1d1d", color: "#fca5a5" };
    return { bg: "#1e3050", color: "#94a3b8" };
  };

  if (loading) return <div className="flex items-center justify-center py-32"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="admin-section space-y-5">
      <div><h1 className="text-xl font-black text-white">Customers</h1></div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total Customers", value: data?.customers.length ?? 0 },
          { label: "Total Spent", value: fmt(data?.totalSpent ?? 0), green: true },
          { label: "Avg. Orders", value: data?.avgOrders ?? 0 },
          { label: "Repeat Buyers", value: data?.repeatBuyers ?? 0 },
        ].map(s => (
          <div key={s.label} className="rounded-2xl border p-5" style={{ background: CARD, borderColor: BORDER }}>
            <p className="text-xs text-slate-500 mb-1 uppercase tracking-wide">{s.label}</p>
            <p className="text-2xl font-black" style={{ color: s.green ? "#4ade80" : "white" }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="flex gap-3">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or phone…"
          className="flex-1 rounded-xl px-4 py-2.5 text-sm text-white border focus:outline-none focus:border-blue-500"
          style={{ background: CARD, borderColor: BORDER }} />
      </div>

      {/* Table */}
      <div className="rounded-2xl border overflow-hidden" style={{ background: CARD, borderColor: BORDER }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-slate-500 uppercase tracking-wider" style={{ background: BG, borderColor: BORDER }}>
                <th className="px-4 py-3 text-left w-8">#</th>
                <th className="px-4 py-3 text-left">Customer</th>
                <th className="px-4 py-3 text-left">Phone</th>
                <th className="px-4 py-3 text-left">Networks</th>
                <th className="px-4 py-3 text-right">Orders</th>
                <th className="px-4 py-3 text-right">Total Spent</th>
                <th className="px-4 py-3 text-left">Last Order</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c, i) => (
                <tr key={c.phone} className="border-b last:border-0 hover:bg-white/[0.02]" style={{ borderColor: BORDER }}>
                  <td className="px-4 py-3.5 text-slate-600 font-bold text-sm">{i + 1}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0"
                        style={{ background: `hsl(${(c.phone.charCodeAt(0) * 17) % 360},60%,40%)` }}>
                        {(c.name ?? c.phone).charAt(0).toUpperCase()}
                      </div>
                      <span className="font-semibold text-white">{c.name || c.phone}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-slate-400 font-mono text-xs">{c.phone}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex gap-1 flex-wrap">
                      {c.networks.map(n => {
                        const { bg, color } = netBadge(n);
                        return <span key={n} className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: bg, color }}>{n}</span>;
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-right font-bold text-white">{c.orders}</td>
                  <td className="px-4 py-3.5 text-right font-black" style={{ color: "#4ade80" }}>{fmt(c.spent)}</td>
                  <td className="px-4 py-3.5 text-xs text-slate-500">
                    {new Date(c.lastOrder).toLocaleDateString("en-GH", { day: "numeric", month: "short" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {customers.length === 0 && (
            <div className="py-16 text-center"><p className="text-slate-500">No customers found</p></div>
          )}
        </div>
      </div>
    </div>
  );
}
