"use client";
import { useMemo } from "react";

const BG = "#0b1120", CARD = "#111827", BORDER = "#1f2937";

interface Order { status: string; amount: number; bundle_size: string; network: string; created_at: string; agent_id: string | null }

function LineChart({ data }: { data: { label: string; revenue: number }[] }) {
  const W = 500, H = 140, pad = { t: 12, r: 8, b: 28, l: 8 };
  const iW = W - pad.l - pad.r, iH = H - pad.t - pad.b;
  const max = Math.max(...data.map(d => d.revenue), 1);
  const pts = data.map((d, i) => ({
    x: pad.l + (data.length > 1 ? (i / (data.length - 1)) * iW : iW / 2),
    y: pad.t + iH - (d.revenue / max) * iH,
  }));
  const linePath = pts.reduce((acc, p, i) => {
    if (i === 0) return `M ${p.x} ${p.y}`;
    const prev = pts[i - 1], cx = (prev.x + p.x) / 2;
    return `${acc} C ${cx} ${prev.y} ${cx} ${p.y} ${p.x} ${p.y}`;
  }, "");
  const areaPath = `${linePath} L ${pts[pts.length - 1].x} ${H - pad.b} L ${pts[0].x} ${H - pad.b} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 180 }}>
      <defs>
        <linearGradient id="aGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map((t, i) => <line key={i} x1={pad.l} y1={pad.t + iH * (1 - t)} x2={W - pad.r} y2={pad.t + iH * (1 - t)} stroke="#1f2937" strokeWidth={0.8} />)}
      <path d={areaPath} fill="url(#aGrad)" />
      <path d={linePath} fill="none" stroke="#8b5cf6" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={4} fill="#8b5cf6" stroke={BG} strokeWidth={2} />)}
      {data.map((d, i) => <text key={i} x={pts[i].x} y={H - pad.b + 16} textAnchor="middle" fontSize={9} fill="#6b7280">{d.label}</text>)}
    </svg>
  );
}

export default function AnalyticsAdmin({ orders }: { orders: Order[] }) {
  const completed = useMemo(() => orders.filter(o => o.status?.toLowerCase() === "completed"), [orders]);

  // Weekly revenue
  const weekly = useMemo(() => {
    const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const now = new Date(), dow = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
    monday.setHours(0, 0, 0, 0);
    return labels.map((label, i) => {
      const start = new Date(monday); start.setDate(monday.getDate() + i);
      const end = new Date(start); end.setDate(start.getDate() + 1);
      const dayOrders = completed.filter(o => { const d = new Date(o.created_at); return d >= start && d < end; });
      return { label, revenue: dayOrders.reduce((s, o) => s + Number(o.amount), 0), count: dayOrders.length };
    });
  }, [completed]);

  // Revenue by network
  const byNetwork = useMemo(() => {
    const map: Record<string, number> = {};
    for (const o of completed) {
      const n = (o.network ?? "other").toUpperCase();
      map[n] = (map[n] ?? 0) + Number(o.amount);
    }
    const total = Object.values(map).reduce((s, v) => s + v, 0) || 1;
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([net, rev]) => ({ net, rev, pct: (rev / total) * 100 }));
  }, [completed]);

  // Order status breakdown
  const byStatus = useMemo(() => {
    const t = orders.length || 1;
    const counts = { completed: 0, processing: 0, pending: 0, failed: 0 };
    for (const o of orders) counts[o.status?.toLowerCase() as keyof typeof counts] = (counts[o.status?.toLowerCase() as keyof typeof counts] ?? 0) + 1;
    return counts;
  }, [orders]);

  const totalRev = completed.reduce((s, o) => s + Number(o.amount), 0);
  const avgOrderVal = completed.length ? totalRev / completed.length : 0;
  const completionRate = orders.length ? (completed.length / orders.length) * 100 : 0;

  // Total data sold
  const totalDataGB = useMemo(() => {
    let gb = 0;
    for (const o of completed) {
      const raw = (o.bundle_size ?? "").replace(/^(mtn|telecel|at ishare|airteltigo|airtel)\s+/i, "").trim();
      const m = raw.match(/^([\d.]+)\s*GB/i);
      if (m) gb += parseFloat(m[1]);
    }
    return gb;
  }, [completed]);

  const dataDisplay = totalDataGB >= 1000 ? `${(totalDataGB / 1000).toFixed(2)} TB` : `${totalDataGB.toFixed(0)} GB`;

  const netColors: Record<string, string> = { MTN: "#f59e0b", TELECEL: "#ef4444", OTHER: "#6b7280", VOUCHER: "#8b5cf6", AIRTELTIGO: "#3b82f6" };

  return (
    <div className="space-y-5">
      <div><h1 className="text-xl font-black text-white">Analytics</h1><p className="text-sm text-slate-500">Business performance overview</p></div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Completion Rate", value: `${completionRate.toFixed(1)}%`, sub: `${completed.length} of ${orders.length} orders`, color: "#4ade80" },
          { label: "Avg. Order Value", value: `GH₵${avgOrderVal.toFixed(2)}`, sub: "Per completed order", color: "#60a5fa" },
          { label: "Total Data Sold", value: dataDisplay, sub: "All completed deliveries", color: "#f59e0b" },
          { label: "Admin Profit (Net)", value: `GH₵${(orders.reduce((s, o) => s + Number(o.amount ?? 0), 0) - orders.reduce((s, o) => s + (Number((o as unknown as Record<string, unknown>).cost_price) || 0), 0)).toFixed(2)}`, sub: "Gross less cost", color: "#a78bfa" },
        ].map(s => (
          <div key={s.label} className="rounded-2xl border p-5" style={{ background: CARD, borderColor: BORDER }}>
            <p className="text-xs text-slate-500 mb-1">{s.label}</p>
            <p className="text-2xl font-black" style={{ color: s.color }}>{s.value}</p>
            <p className="text-xs text-slate-600 mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Weekly chart + network breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl border p-5" style={{ background: CARD, borderColor: BORDER }}>
          <h3 className="font-bold text-white mb-1">Weekly Revenue</h3>
          <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
            <div><p className="text-slate-500 text-xs mb-0.5">Total Revenue</p><p className="font-black text-white">GH₵{weekly.reduce((s, d) => s + d.revenue, 0).toFixed(2)}</p></div>
            <div><p className="text-slate-500 text-xs mb-0.5">Total Transactions</p><p className="font-black text-white">{weekly.reduce((s, d) => s + d.count, 0)}</p></div>
            <div><p className="text-slate-500 text-xs mb-0.5">Avg. Order Value</p><p className="font-black text-white">GH₵{weekly.reduce((s, d) => s + d.count, 0) > 0 ? (weekly.reduce((s, d) => s + d.revenue, 0) / weekly.reduce((s, d) => s + d.count, 0)).toFixed(2) : "0.00"}</p></div>
          </div>
          <LineChart data={weekly} />
        </div>

        <div className="rounded-2xl border p-5" style={{ background: CARD, borderColor: BORDER }}>
          <h3 className="font-bold text-white mb-4">Revenue by Network</h3>
          <div className="space-y-3">
            {byNetwork.map(n => (
              <div key={n.net}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-semibold text-white">{n.net}</span>
                  <span className="font-bold" style={{ color: netColors[n.net] ?? "#6b7280" }}>{n.pct.toFixed(1)}%</span>
                </div>
                <div className="w-full h-1.5 rounded-full" style={{ background: BORDER }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.min(n.pct, 100)}%`, background: netColors[n.net] ?? "#6b7280" }} />
                </div>
                <p className="text-xs text-slate-500 mt-0.5">GH₵{n.rev.toFixed(2)} · {byNetwork.reduce((s, x) => x.net === n.net ? s + 1 : s, 0)} orders</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Order status breakdown */}
      <div className="rounded-2xl border p-5" style={{ background: CARD, borderColor: BORDER }}>
        <h3 className="font-bold text-white mb-4">Order Status Breakdown</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Completed", value: byStatus.completed, color: "#4ade80", pct: orders.length ? (byStatus.completed / orders.length * 100).toFixed(1) : "0" },
            { label: "Processing", value: byStatus.processing, color: "#60a5fa", pct: orders.length ? (byStatus.processing / orders.length * 100).toFixed(1) : "0" },
            { label: "Pending", value: byStatus.pending, color: "#fbbf24", pct: orders.length ? (byStatus.pending / orders.length * 100).toFixed(1) : "0" },
            { label: "Failed", value: byStatus.failed, color: "#f87171", pct: orders.length ? (byStatus.failed / orders.length * 100).toFixed(1) : "0" },
          ].map(s => (
            <div key={s.label} className="rounded-xl border p-4 text-center" style={{ background: BG, borderColor: BORDER }}>
              <p className="text-3xl font-black mb-1" style={{ color: s.color }}>{s.value.toLocaleString()}</p>
              <p className="text-sm font-semibold text-white">{s.label}</p>
              <p className="text-xs text-slate-500">{s.pct}% of total</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
