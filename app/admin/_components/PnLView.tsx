"use client";
import { useState, useMemo, useEffect, useCallback } from "react";

interface Order {
  status: string;
  amount: number;
  admin_commission: number;
  agent_commission: number;
  cost_price?: number;
  created_at: string;
  agent_id?: string | null;
  phone?: string;
  bundle_size?: string;
  network?: string;
}

interface AgentRow {
  id: string;
  name: string;
}

interface LedgerEntry {
  id: string;
  type: "snapshot" | "deposit" | "deduction";
  amount: number;
  balance_after: number | null;
  note: string | null;
  order_reference: string | null;
  recorded_at: string;
}

function toDateKey(d: Date) { return d.toISOString().slice(0, 10); }
function fmt(n: number) { return `GH₵${Math.abs(n).toFixed(2)}`; }
function fmtDate(dk: string) {
  return new Date(dk + "T12:00:00").toLocaleDateString("en-GH", {
    weekday: "short", day: "2-digit", month: "short", year: "numeric",
  });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit", hour12: true });
}

const NET_COLOR: Record<string, string> = {
  mtn: "#f59e0b",
  telecel: "#ef4444",
  airteltigo: "#3b82f6",
};

function getProfitByPeriod(orders: Order[]) {
  const now = new Date();
  function startOf(period: "day" | "week" | "month" | "year") {
    const d = new Date(now);
    if (period === "day")   { d.setHours(0, 0, 0, 0); }
    if (period === "week")  { d.setDate(d.getDate() - d.getDay()); d.setHours(0, 0, 0, 0); }
    if (period === "month") { d.setDate(1); d.setHours(0, 0, 0, 0); }
    if (period === "year")  { d.setMonth(0, 1); d.setHours(0, 0, 0, 0); }
    return d;
  }
  function calc(period: "day" | "week" | "month" | "year") {
    const start = startOf(period);
    const slice = orders.filter(o => (o.status ?? "").toLowerCase() === "completed" && new Date(o.created_at) >= start);
    return {
      profit:  slice.reduce((s, o) => s + (Number(o.admin_commission) || 0), 0),
      revenue: slice.reduce((s, o) => s + (Number(o.amount) || 0), 0),
      orders:  slice.length,
    };
  }
  return { day: calc("day"), week: calc("week"), month: calc("month"), year: calc("year") };
}

export default function PnLView({ orders, agents = [] }: { orders: Order[]; agents?: AgentRow[] }) {
  const agentMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of agents) m.set(a.id, a.name);
    return m;
  }, [agents]);
  const [earningPeriod, setEarningPeriod] = useState<"day" | "week" | "month" | "year">("day");
  const profitPeriods = useMemo(() => getProfitByPeriod(orders), [orders]);

  const [ledger, setLedger]     = useState<LedgerEntry[]>([]);
  const [openAmt, setOpenAmt]   = useState("");
  const [closeAmt, setCloseAmt] = useState("");
  const [saving, setSaving]     = useState<string | null>(null);
  const todayKey = toDateKey(new Date());

  const loadLedger = useCallback(async () => {
    const res = await fetch("/api/admin/balance-log").catch(() => null);
    if (!res?.ok) return;
    const d = await res.json().catch(() => ({}));
    setLedger(d.entries ?? []);
  }, []);

  useEffect(() => { loadLedger(); }, [loadLedger]);

  async function recordBalance(which: "start" | "end") {
    const raw = which === "start" ? openAmt : closeAmt;
    const amt = parseFloat(raw);
    if (!amt || isNaN(amt)) return;
    const note = which === "start" ? "Start of Day" : "End of Day";
    setSaving(which);
    await fetch("/api/admin/balance-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "snapshot", amount: amt, balance_after: amt, note }),
    });
    setSaving(null);
    if (which === "start") setOpenAmt(""); else setCloseAmt("");
    loadLedger();
  }

  // ── Today's completed sales ──────────────────────────────────────────────
  const todaySales = useMemo(() =>
    orders
      .filter(o => (o.status ?? "").toLowerCase() === "completed" && toDateKey(new Date(o.created_at)) === todayKey)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [orders, todayKey]);

  const todayProfit          = todaySales.reduce((s, o) => s + (Number(o.admin_commission) || 0), 0);
  const todayRevenue         = todaySales.reduce((s, o) => s + (Number(o.amount) || 0), 0);
  const todayAgentCommission = todaySales.reduce((s, o) => s + (Number(o.agent_commission) || 0), 0);

  // Today's API balance snapshots
  const todaySnaps = ledger.filter(e => e.type === "snapshot" && toDateKey(new Date(e.recorded_at)) === todayKey);
  const todayStart = todaySnaps.find(e => e.note?.toLowerCase().includes("start"));
  const todayEnd   = todaySnaps.find(e => e.note?.toLowerCase().includes("end"));

  // ── Past-day records (yesterday and before) ──────────────────────────────
  const dailyRecords = useMemo(() => {
    const map = new Map<string, {
      date: string; sales: number; profit: number; agentCommission: number; revenue: number;
      apiStart: number | null; apiEnd: number | null;
    }>();

    for (const o of orders) {
      if ((o.status ?? "").toLowerCase() !== "completed") continue;
      const dk = toDateKey(new Date(o.created_at));
      if (dk === todayKey) continue;
      if (!map.has(dk)) map.set(dk, { date: dk, sales: 0, profit: 0, agentCommission: 0, revenue: 0, apiStart: null, apiEnd: null });
      const row = map.get(dk)!;
      row.sales++;
      row.profit          += Number(o.admin_commission) || 0;
      row.agentCommission += Number(o.agent_commission) || 0;
      row.revenue         += Number(o.amount) || 0;
    }

    for (const e of ledger) {
      if (e.type !== "snapshot") continue;
      const dk = toDateKey(new Date(e.recorded_at));
      if (dk === todayKey) continue;
      if (!map.has(dk)) map.set(dk, { date: dk, sales: 0, profit: 0, agentCommission: 0, revenue: 0, apiStart: null, apiEnd: null });
      const snapRow = map.get(dk)!;
      if (e.note?.toLowerCase().includes("start")) snapRow.apiStart = Number(e.amount);
      else if (e.note?.toLowerCase().includes("end")) snapRow.apiEnd = Number(e.amount);
    }

    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [orders, ledger, todayKey]);

  // ── Style helpers ────────────────────────────────────────────────────────
  const card = { background: "#162032", border: "1px solid #1e3050", borderRadius: 16, overflow: "hidden" as const };
  const hdr  = { padding: "14px 20px", background: "#0e1928", borderBottom: "1px solid #1e3050" };
  const th   = { padding: "10px 14px", color: "#475569", fontWeight: 700 as const, fontSize: 10, textTransform: "uppercase" as const, letterSpacing: "0.06em", whiteSpace: "nowrap" as const };

  const epData   = profitPeriods[earningPeriod];
  const epLabels: Record<string, string> = { day: "Today", week: "This Week", month: "This Month", year: "This Year" };
  const epColors: Record<string, string> = { day: "#f59e0b", week: "#3b82f6", month: "#8b5cf6", year: "#22c55e" };
  const epGrads:  Record<string, string> = { day: "linear-gradient(135deg,#78350f,#d97706)", week: "linear-gradient(135deg,#1e3a8a,#3b82f6)", month: "linear-gradient(135deg,#4c1d95,#8b5cf6)", year: "linear-gradient(135deg,#14532d,#22c55e)" };
  const epIcons:  Record<string, string> = { day: "☀️", week: "📅", month: "🗓️", year: "🏆" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ══════════ EARNINGS BY PERIOD ══════════ */}
      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ ...hdr, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>💰</span>
            <p style={{ color: "#f1f5f9", fontWeight: 800, fontSize: 15, margin: 0 }}>My Earnings</p>
          </div>
          {/* Pill tabs */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: 5, background: "#0a0f1a", border: "1px solid #1e3050", borderRadius: 999, boxShadow: "0 1px 1px rgba(0,0,0,0.4), 0 8px 24px -12px rgba(0,0,0,0.6)" }}>
            {(["day", "week", "month", "year"] as const).map(p => (
              <button key={p} onClick={() => setEarningPeriod(p)} style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                height: 30, padding: "0 14px", borderRadius: 999, fontSize: 13, fontWeight: 600,
                border: "none", cursor: "pointer",
                transition: "background 220ms cubic-bezier(.22,1,.36,1), color 220ms cubic-bezier(.22,1,.36,1), box-shadow 220ms cubic-bezier(.22,1,.36,1)",
                background: earningPeriod === p ? "white" : "transparent",
                color: earningPeriod === p ? "#0e1116" : "#64748b",
                boxShadow: earningPeriod === p ? "0 1px 1px rgba(0,0,0,0.15), 0 4px 12px -4px rgba(0,0,0,0.5)" : "none",
              }}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding: "20px 20px 16px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ width: 56, height: 56, borderRadius: 18, background: epGrads[earningPeriod], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0, transition: "background .3s" }}>
            {epIcons[earningPeriod]}
          </div>
          <div>
            <p style={{ color: "#475569", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 4px" }}>{epLabels[earningPeriod]} · Admin Profit</p>
            <p style={{ color: epColors[earningPeriod], fontWeight: 900, fontSize: 34, fontFamily: "monospace", margin: 0, transition: "color .3s" }}>+{fmt(epData.profit)}</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginLeft: "auto" }}>
            <div style={{ background: "#0e1928", border: "1px solid #1e3050", borderRadius: 12, padding: "10px 16px", minWidth: 110 }}>
              <p style={{ color: "#475569", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 4px" }}>Revenue</p>
              <p style={{ color: "#93c5fd", fontFamily: "monospace", fontWeight: 900, fontSize: 16, margin: 0 }}>{fmt(epData.revenue)}</p>
            </div>
            <div style={{ background: "#0e1928", border: "1px solid #1e3050", borderRadius: 12, padding: "10px 16px", minWidth: 110 }}>
              <p style={{ color: "#475569", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 4px" }}>Orders</p>
              <p style={{ color: "#f1f5f9", fontFamily: "monospace", fontWeight: 900, fontSize: 16, margin: 0 }}>{epData.orders}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════ TODAY ══════════ */}
      <div style={card}>

        {/* Header */}
        <div style={{ ...hdr, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>📅</span>
            <p style={{ color: "#f1f5f9", fontWeight: 800, fontSize: 15, margin: 0 }}>
              Today — {new Date().toLocaleDateString("en-GH", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
            </p>
          </div>
          {todaySales.length > 0 && (
            <p style={{ color: "#4ade80", fontWeight: 900, fontFamily: "monospace", fontSize: 18, margin: 0 }}>
              +{fmt(todayProfit)} profit
            </p>
          )}
        </div>

        {/* API Balance — Start / End */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #1e3050", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

          {/* Start of day */}
          <div style={{ background: "#0e1928", border: "1px solid #1e3050", borderRadius: 12, padding: 14 }}>
            <p style={{ color: "#475569", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }}>
              ☀️ API Balance — Start of Day
            </p>
            {todayStart ? (
              <div>
                <p style={{ color: "#93c5fd", fontWeight: 900, fontFamily: "monospace", fontSize: 22, margin: "0 0 2px" }}>
                  {fmt(todayStart.amount)}
                </p>
                <p style={{ color: "#334155", fontSize: 10, margin: 0 }}>Recorded at {fmtTime(todayStart.recorded_at)}</p>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  type="number" min="0" step="0.01" placeholder="e.g. 250.00"
                  value={openAmt} onChange={e => setOpenAmt(e.target.value)}
                  style={{ flex: 1, background: "#162032", border: "1px solid #1e3050", borderRadius: 8, padding: "9px 10px", color: "#f1f5f9", fontSize: 13, fontWeight: 700, outline: "none" }}
                />
                <button onClick={() => recordBalance("start")} disabled={saving === "start" || !openAmt}
                  style={{ padding: "9px 14px", background: "#1d4ed8", border: "none", borderRadius: 8, color: "white", fontWeight: 800, fontSize: 12, cursor: "pointer", opacity: !openAmt ? 0.4 : 1 }}>
                  {saving === "start" ? "…" : "Save"}
                </button>
              </div>
            )}
          </div>

          {/* End of day */}
          <div style={{ background: "#0e1928", border: "1px solid #1e3050", borderRadius: 12, padding: 14 }}>
            <p style={{ color: "#475569", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }}>
              🌙 API Balance — End of Day
            </p>
            {todayEnd ? (
              <div>
                <p style={{ color: "#c084fc", fontWeight: 900, fontFamily: "monospace", fontSize: 22, margin: "0 0 2px" }}>
                  {fmt(todayEnd.amount)}
                </p>
                <p style={{ color: "#334155", fontSize: 10, margin: 0 }}>Recorded at {fmtTime(todayEnd.recorded_at)}</p>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  type="number" min="0" step="0.01" placeholder="e.g. 190.00"
                  value={closeAmt} onChange={e => setCloseAmt(e.target.value)}
                  style={{ flex: 1, background: "#162032", border: "1px solid #1e3050", borderRadius: 8, padding: "9px 10px", color: "#f1f5f9", fontSize: 13, fontWeight: 700, outline: "none" }}
                />
                <button onClick={() => recordBalance("end")} disabled={saving === "end" || !closeAmt}
                  style={{ padding: "9px 14px", background: "#7c3aed", border: "none", borderRadius: 8, color: "white", fontWeight: 800, fontSize: 12, cursor: "pointer", opacity: !closeAmt ? 0.4 : 1 }}>
                  {saving === "end" ? "…" : "Save"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Today's stats */}
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #1e3050", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0 }}>
          {[
            { label: "Sales Today",        value: String(todaySales.length),     color: "#f1f5f9" },
            { label: "Revenue Today",      value: fmt(todayRevenue),              color: "#93c5fd" },
            { label: "Agent Commissions",  value: `${fmt(todayAgentCommission)}`, color: "#c084fc" },
            { label: "Your Profit",        value: `+${fmt(todayProfit)}`,         color: "#4ade80" },
          ].map((s, i) => (
            <div key={s.label} style={{ padding: "10px 0", paddingLeft: i === 0 ? 0 : 20, borderLeft: i > 0 ? "1px solid #1e3050" : "none", marginLeft: i > 0 ? 20 : 0 }}>
              <p style={{ fontSize: 10, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 4px" }}>{s.label}</p>
              <p style={{ fontSize: 18, fontWeight: 900, color: s.color, fontFamily: "monospace", margin: 0 }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Today's sales table */}
        {todaySales.length === 0 ? (
          <p style={{ padding: "48px 20px", textAlign: "center", color: "#334155", fontSize: 13 }}>
            No sales yet today — each sale will appear here instantly as it comes in.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#0e1928" }}>
                  <th style={{ ...th, textAlign: "left" as const }}>#</th>
                  <th style={{ ...th, textAlign: "left" as const }}>Time</th>
                  <th style={{ ...th, textAlign: "left" as const }}>Phone</th>
                  <th style={{ ...th, textAlign: "left" as const }}>Bundle</th>
                  <th style={{ ...th, textAlign: "left" as const }}>Agent</th>
                  <th style={{ ...th, textAlign: "right" as const }}>Sold For</th>
                  <th style={{ ...th, textAlign: "right" as const }}>Agent Cut</th>
                  <th style={{ ...th, textAlign: "right" as const }}>Your Profit</th>
                  <th style={{ ...th, textAlign: "right" as const }}>Running Profit</th>
                </tr>
              </thead>
              <tbody>
                {todaySales.map((o, i) => {
                  const runningProfit = todaySales.slice(0, i + 1).reduce((s, x) => s + (Number(x.admin_commission) || 0), 0);
                  const net = (o.network ?? "").toLowerCase();
                  const netColor = NET_COLOR[net] ?? "#3b82f6";
                  const agentName = o.agent_id ? (agentMap.get(o.agent_id) ?? "Agent") : null;
                  const agentComm = Number(o.agent_commission) || 0;
                  return (
                    <tr key={`${o.created_at}-${o.phone}-${i}`} style={{ borderBottom: "1px solid rgba(30,48,80,0.5)" }}>
                      <td style={{ padding: "10px 14px", color: "#334155", fontWeight: 700 }}>{i + 1}</td>
                      <td style={{ padding: "10px 14px", color: "#64748b", fontFamily: "monospace", whiteSpace: "nowrap" as const }}>{fmtTime(o.created_at)}</td>
                      <td style={{ padding: "10px 14px", color: "#94a3b8", fontFamily: "monospace" }}>{o.phone ?? "—"}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ padding: "2px 8px", borderRadius: 6, background: `${netColor}22`, color: netColor, fontWeight: 700, fontSize: 11, whiteSpace: "nowrap" as const }}>
                          {(o.network ?? "").toUpperCase()} {o.bundle_size ?? ""}
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" as const }}>
                        {agentName
                          ? <span style={{ fontSize: 11, fontWeight: 700, color: "#c084fc", background: "rgba(192,132,252,0.12)", padding: "2px 8px", borderRadius: 6 }}>{agentName}</span>
                          : <span style={{ fontSize: 11, color: "#334155" }}>Direct</span>}
                      </td>
                      <td style={{ padding: "10px 14px", color: "#93c5fd", fontFamily: "monospace", textAlign: "right" as const }}>{fmt(Number(o.amount) || 0)}</td>
                      <td style={{ padding: "10px 14px", fontFamily: "monospace", textAlign: "right" as const, color: agentComm > 0 ? "#c084fc" : "#334155" }}>
                        {agentComm > 0 ? `${fmt(agentComm)}` : "—"}
                      </td>
                      <td style={{ padding: "10px 14px", color: "#4ade80", fontFamily: "monospace", fontWeight: 700, textAlign: "right" as const }}>+{fmt(Number(o.admin_commission) || 0)}</td>
                      <td style={{ padding: "10px 14px", color: "#4ade80", fontFamily: "monospace", fontWeight: 900, textAlign: "right" as const }}>{fmt(runningProfit)}</td>
                    </tr>
                  );
                })}
                <tr style={{ background: "#0e1928", borderTop: "2px solid #1e3050" }}>
                  <td colSpan={5} style={{ padding: "12px 14px", color: "#f1f5f9", fontWeight: 900, fontSize: 12 }}>
                    DAY TOTAL — {todaySales.length} sale{todaySales.length !== 1 ? "s" : ""}
                  </td>
                  <td style={{ padding: "12px 14px", color: "#93c5fd", fontFamily: "monospace", fontWeight: 900, textAlign: "right" as const }}>{fmt(todayRevenue)}</td>
                  <td style={{ padding: "12px 14px", color: "#c084fc", fontFamily: "monospace", fontWeight: 900, textAlign: "right" as const }}>{fmt(todayAgentCommission)}</td>
                  <td style={{ padding: "12px 14px", color: "#4ade80", fontFamily: "monospace", fontWeight: 900, textAlign: "right" as const }}>+{fmt(todayProfit)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ══════════ DAILY RECORDS (past days) ══════════ */}
      <div style={card}>
        <div style={{ ...hdr, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>📖</span>
          <p style={{ color: "#f1f5f9", fontWeight: 800, fontSize: 15, margin: 0 }}>Daily Records</p>
          {dailyRecords.length > 0 && (
            <span style={{ marginLeft: "auto", color: "#334155", fontSize: 12 }}>
              {dailyRecords.length} day{dailyRecords.length !== 1 ? "s" : ""} ·
              Total profit: <span style={{ color: "#4ade80", fontWeight: 700 }}> +{fmt(dailyRecords.reduce((s, r) => s + r.profit, 0))}</span>
            </span>
          )}
        </div>

        {dailyRecords.length === 0 ? (
          <p style={{ padding: "48px 20px", textAlign: "center", color: "#334155", fontSize: 13 }}>
            Yesterday&apos;s record will appear here automatically once the day ends at midnight.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#0e1928" }}>
                  <th style={{ ...th, textAlign: "left" as const }}>Date</th>
                  <th style={{ ...th, textAlign: "right" as const }}>Sales</th>
                  <th style={{ ...th, textAlign: "right" as const }}>Revenue</th>
                  <th style={{ ...th, textAlign: "right" as const }}>Agent Cut</th>
                  <th style={{ ...th, textAlign: "right" as const }}>Your Profit</th>
                  <th style={{ ...th, textAlign: "right" as const }}>API at 12:00 AM</th>
                  <th style={{ ...th, textAlign: "right" as const }}>API at 11:59 PM</th>
                  <th style={{ ...th, textAlign: "right" as const }}>API Spent</th>
                </tr>
              </thead>
              <tbody>
                {dailyRecords.map(row => {
                  const apiSpent = row.apiStart !== null && row.apiEnd !== null
                    ? row.apiStart - row.apiEnd
                    : null;
                  return (
                    <tr key={row.date} style={{ borderBottom: "1px solid rgba(30,48,80,0.5)" }}>
                      <td style={{ padding: "12px 14px", color: "#f1f5f9", fontWeight: 700, whiteSpace: "nowrap" as const }}>
                        {fmtDate(row.date)}
                      </td>
                      <td style={{ padding: "12px 14px", color: "#f1f5f9", fontWeight: 700, textAlign: "right" as const }}>{row.sales}</td>
                      <td style={{ padding: "12px 14px", color: "#93c5fd", fontFamily: "monospace", textAlign: "right" as const }}>{fmt(row.revenue)}</td>
                      <td style={{ padding: "12px 14px", fontFamily: "monospace", textAlign: "right" as const, color: row.agentCommission > 0 ? "#c084fc" : "#334155" }}>
                        {row.agentCommission > 0 ? fmt(row.agentCommission) : "—"}
                      </td>
                      <td style={{ padding: "12px 14px", color: "#4ade80", fontFamily: "monospace", fontWeight: 800, textAlign: "right" as const }}>
                        +{fmt(row.profit)}
                      </td>
                      <td style={{ padding: "12px 14px", fontFamily: "monospace", textAlign: "right" as const, color: row.apiStart !== null ? "#93c5fd" : "#334155" }}>
                        {row.apiStart !== null ? fmt(row.apiStart) : "—"}
                      </td>
                      <td style={{ padding: "12px 14px", fontFamily: "monospace", textAlign: "right" as const, color: row.apiEnd !== null ? "#c084fc" : "#334155" }}>
                        {row.apiEnd !== null ? fmt(row.apiEnd) : "—"}
                      </td>
                      <td style={{ padding: "12px 14px", fontFamily: "monospace", fontWeight: 700, textAlign: "right" as const, color: apiSpent === null ? "#334155" : "#f87171" }}>
                        {apiSpent !== null ? `− ${fmt(apiSpent)}` : "—"}
                      </td>
                    </tr>
                  );
                })}
                {/* Grand total row */}
                {(() => {
                  const totSales        = dailyRecords.reduce((s, r) => s + r.sales, 0);
                  const totRevenue      = dailyRecords.reduce((s, r) => s + r.revenue, 0);
                  const totAgentComm    = dailyRecords.reduce((s, r) => s + r.agentCommission, 0);
                  const totProfit       = dailyRecords.reduce((s, r) => s + r.profit, 0);
                  return (
                    <tr style={{ background: "#0e1928", borderTop: "2px solid #1e3050" }}>
                      <td style={{ padding: "13px 14px", color: "#f1f5f9", fontWeight: 900, fontSize: 12 }}>
                        ALL TIME ({dailyRecords.length} days)
                      </td>
                      <td style={{ padding: "13px 14px", color: "#f1f5f9", fontWeight: 900, textAlign: "right" as const }}>{totSales}</td>
                      <td style={{ padding: "13px 14px", color: "#93c5fd", fontFamily: "monospace", fontWeight: 900, textAlign: "right" as const }}>{fmt(totRevenue)}</td>
                      <td style={{ padding: "13px 14px", color: "#c084fc", fontFamily: "monospace", fontWeight: 900, textAlign: "right" as const }}>{fmt(totAgentComm)}</td>
                      <td style={{ padding: "13px 14px", color: "#4ade80", fontFamily: "monospace", fontWeight: 900, textAlign: "right" as const }}>+{fmt(totProfit)}</td>
                      <td colSpan={3} />
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
