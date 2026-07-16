import type { Order } from "./types";

export function get7DayComparison(orders: Order[]) {
  const now = Date.now();
  const D7 = 7 * 86400000;
  const curr = orders.filter(o => now - new Date(o.created_at).getTime() <= D7);
  const prev = orders.filter(o => {
    const age = now - new Date(o.created_at).getTime();
    return age > D7 && age <= 2 * D7;
  });
  function pct(a: number, b: number) {
    if (b === 0) return a > 0 ? 100 : 0;
    return Math.round(((a - b) / b) * 100 * 10) / 10;
  }
  const rev = (arr: Order[]) => arr.filter(o => o.status.toLowerCase() === "completed").reduce((s, o) => s + Number(o.amount), 0);
  return {
    orders:    pct(curr.length, prev.length),
    completed: pct(curr.filter(o => o.status.toLowerCase() === "completed").length, prev.filter(o => o.status.toLowerCase() === "completed").length),
    pending:   pct(curr.filter(o => o.status.toLowerCase() === "pending").length,   prev.filter(o => o.status.toLowerCase() === "pending").length),
    failed:    pct(curr.filter(o => o.status.toLowerCase() === "failed").length,    prev.filter(o => o.status.toLowerCase() === "failed").length),
    revenue:   pct(rev(curr), rev(prev)),
    agents:    0,
  };
}

export function getWeeklyRevenue(orders: Order[]) {
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const now = new Date();
  const dow = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
  monday.setHours(0, 0, 0, 0);
  return labels.map((label, i) => {
    const start = new Date(monday); start.setDate(monday.getDate() + i);
    const end   = new Date(start);  end.setDate(start.getDate() + 1);
    const dayOrders = orders.filter(o => {
      const d = new Date(o.created_at);
      return d >= start && d < end && o.status.toLowerCase() === "completed";
    });
    return { label, revenue: dayOrders.reduce((s, o) => s + Number(o.amount), 0), count: dayOrders.length };
  });
}

export function getTopBundles(orders: Order[]) {
  const completed = orders.filter(o => o.status.toLowerCase() === "completed");
  const map: Record<string, { count: number; revenue: number; network: string }> = {};
  for (const o of completed) {
    const net = (o.network ?? "").toLowerCase();
    const raw = (o.bundle_size ?? "").replace(/^(mtn|telecel|at ishare|airteltigo|airtel)\s+/i, "").trim();
    const key = `${net}|${raw}`;
    if (!map[key]) map[key] = { count: 0, revenue: 0, network: net };
    map[key].count++;
    map[key].revenue += Number(o.amount) || 0;
  }
  const colors = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#f87171"];
  const sorted = Object.entries(map).sort((a, b) => b[1].count - a[1].count);
  const top4 = sorted.slice(0, 4);
  const otherCount = sorted.slice(4).reduce((s, [, v]) => s + v.count, 0);
  const total = completed.length || 1;
  const result = top4.map(([key, v], i) => {
    const [net, size] = key.split("|");
    return { label: `${size} – ${net.toUpperCase()}`, count: v.count, revenue: v.revenue, pct: (v.count / total) * 100, color: colors[i] };
  });
  if (otherCount > 0) result.push({ label: "Others", count: otherCount, revenue: 0, pct: (otherCount / total) * 100, color: colors[4] });
  return { bundles: result, total: completed.length };
}

export function getTodayStats(orders: Order[]) {
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const today = orders.filter(o => new Date(o.created_at) >= todayStart);
  const delivered = today.filter(o => o.status.toLowerCase() === "completed");
  return {
    orders: today.length,
    delivered: delivered.length,
    revenue: delivered.reduce((s, o) => s + Number(o.amount), 0),
    profit: delivered.reduce((s, o) => s + Number(o.admin_commission ?? 0), 0),
    viaAgents: today.filter(o => o.agent_id).length,
  };
}

export function getDataSold(orders: Order[]): string {
  const completed = orders.filter(o => o.status.toLowerCase() === "completed");
  let totalGB = 0;
  for (const o of completed) {
    const raw = (o.bundle_size ?? "").replace(/^(mtn|telecel|at ishare|airteltigo|airtel)\s+/i, "").trim();
    const m = raw.match(/^([\d.]+)\s*(gb|tb|mb)?/i);
    if (m) {
      const val = parseFloat(m[1]);
      const unit = (m[2] ?? "GB").toUpperCase();
      totalGB += unit === "TB" ? val * 1024 : unit === "MB" ? val / 1024 : val;
    }
  }
  return totalGB >= 1024 ? `${(totalGB / 1024).toFixed(2)} TB` : `${totalGB.toFixed(0)} GB`;
}

export function getRevenueBreakdown(orders: Order[]) {
  const completed = orders.filter(o => o.status.toLowerCase() === "completed");
  const total = completed.reduce((s, o) => s + Number(o.amount), 0) || 1;
  const map: Record<string, number> = {};
  for (const o of completed) {
    const net = (o.network ?? "other").toLowerCase();
    map[net] = (map[net] ?? 0) + Number(o.amount);
  }
  const DOT: Record<string, string> = { mtn: "#f59e0b", telecel: "#ef4444", airteltigo: "#3b82f6" };
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .map(([net, rev]) => ({
      label: net === "mtn" ? "MTN" : net === "telecel" ? "Telecel" : net.includes("airtel") ? "AirtelTigo" : net.toUpperCase(),
      revenue: rev,
      pct: (rev / total) * 100,
      dot: DOT[net] ?? "#6b7280",
    }));
}

export function getNetBadge(network: string) {
  const net = (network ?? "").toLowerCase();
  if (net === "mtn") return { bg: "#78350f", color: "#fbbf24", label: "MTN" };
  if (net === "telecel") return { bg: "#7f1d1d", color: "#fca5a5", label: "Telecel" };
  if (net.includes("airtel")) return { bg: "#4c1d95", color: "#c4b5fd", label: "AirtelTigo" };
  if (net === "voucher") return { bg: "#312e81", color: "#a5b4fc", label: "🎟 Voucher" };
  return { bg: "#1e3050", color: "#94a3b8", label: (network ?? "—").toUpperCase() };
}
