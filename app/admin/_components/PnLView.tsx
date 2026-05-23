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

interface LedgerEntry {
  id: string;
  type: "snapshot" | "deposit" | "deduction";
  amount: number;
  balance_after: number | null;
  note: string | null;
  order_reference: string | null;
  recorded_at: string;
}

type Period = "7d" | "30d" | "all";

function toDateKey(d: Date) { return d.toISOString().slice(0, 10); }
function fmt(n: number) { return `GH₵${Math.abs(n).toFixed(2)}`; }
function fmtDate(dk: string) {
  const d = new Date(dk + "T12:00:00");
  return d.toLocaleDateString("en-GH", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
}
function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GH", { day: "2-digit", month: "short" }) + " · " + fmtTime(iso);
}

export default function PnLView({ orders }: { orders: Order[] }) {
  const [period, setPeriod] = useState<Period>("7d");
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [openAmt, setOpenAmt] = useState("");
  const [closeAmt, setCloseAmt] = useState("");
  const [depositAmt, setDepositAmt] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const todayKey = toDateKey(new Date());

  const loadLedger = useCallback(async () => {
    const res = await fetch("/api/admin/balance-log").catch(() => null);
    if (!res?.ok) return;
    const d = await res.json().catch(() => ({}));
    setLedger(d.entries ?? []);
  }, []);

  useEffect(() => { loadLedger(); }, [loadLedger]);

  async function record(type: "snapshot" | "deposit", amount: string, note: string) {
    const amt = parseFloat(amount);
    if (!amt || isNaN(amt)) return;
    setSaving(note);
    await fetch("/api/admin/balance-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, amount: amt, balance_after: type === "snapshot" ? amt : null, note }),
    });
    setSaving(null);
    if (note === "Start of Day") setOpenAmt("");
    else if (note === "End of Day") setCloseAmt("");
    else setDepositAmt("");
    loadLedger();
  }

  // ── Daily API Summary ──
  // Group ledger entries by date → per-day open, close, deductions
  const dailyApiRows = useMemo(() => {
    type DayRow = {
      date: string;
      open: number | null;
      openTime: string | null;
      close: number | null;
      closeTime: string | null;
      deductions: number;
      deposits: number;
      orderCount: number;
    };
    const map = new Map<string, DayRow>();

    for (const e of ledger) {
      const dk = toDateKey(new Date(e.recorded_at));
      if (!map.has(dk)) map.set(dk, { date: dk, open: null, openTime: null, close: null, closeTime: null, deductions: 0, deposits: 0, orderCount: 0 });
      const row = map.get(dk)!;
      if (e.type === "snapshot") {
        if (e.note?.toLowerCase().includes("start")) { row.open = Number(e.amount); row.openTime = e.recorded_at; }
        else if (e.note?.toLowerCase().includes("end") || e.note?.toLowerCase().includes("clos")) { row.close = Number(e.amount); row.closeTime = e.recorded_at; }
        else { if (row.open === null) { row.open = Number(e.amount); row.openTime = e.recorded_at; } else { row.close = Number(e.amount); row.closeTime = e.recorded_at; } }
      } else if (e.type === "deduction") {
        row.deductions += Number(e.amount);
        row.orderCount++;
      } else if (e.type === "deposit") {
        row.deposits += Number(e.amount);
      }
    }

    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [ledger]);

  // Current running balance (from last snapshot forward)
  const runningBalance = useMemo(() => {
    const lastSnap = [...ledger].sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()).find(e => e.type === "snapshot");
    if (!lastSnap) return null;
    let bal = Number(lastSnap.amount);
    const snapTime = new Date(lastSnap.recorded_at).getTime();
    for (const e of ledger) {
      if (new Date(e.recorded_at).getTime() <= snapTime) continue;
      if (e.type === "deposit") bal += Number(e.amount);
      if (e.type === "deduction") bal -= Number(e.amount);
    }
    return bal;
  }, [ledger]);

  // ── Today's cumulative purchase log ──
  const todayPurchases = useMemo(() => {
    return orders
      .filter(o => {
        const s = (o.status ?? "").toLowerCase();
        return (s === "completed" || s === "processing") && toDateKey(new Date(o.created_at)) === todayKey;
      })
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map((o, i, arr) => {
        const cost = Number(o.cost_price) || 0;
        const runningCost = arr.slice(0, i + 1).reduce((s, x) => s + (Number(x.cost_price) || 0), 0);
        return { ...o, cost, runningCost, num: i + 1 };
      });
  }, [orders, todayKey]);

  const todayOpenBalance = useMemo(() => {
    const todaySnaps = ledger.filter(e => e.type === "snapshot" && toDateKey(new Date(e.recorded_at)) === todayKey);
    const startSnap = todaySnaps.find(e => e.note?.toLowerCase().includes("start"));
    return startSnap ? Number(startSnap.amount) : null;
  }, [ledger, todayKey]);

  // ── P&L calculations ──
  const cutoff = useMemo(() => {
    if (period === "all") return null;
    const d = new Date();
    d.setDate(d.getDate() - (period === "7d" ? 7 : 30));
    d.setHours(0, 0, 0, 0);
    return d;
  }, [period]);

  const completed = useMemo(() =>
    orders.filter(o => {
      if ((o.status ?? "").toLowerCase().trim() !== "completed") return false;
      if (cutoff && new Date(o.created_at) < cutoff) return false;
      return true;
    }), [orders, cutoff]);

  const stats = useMemo(() => {
    let apiCost = 0, revenue = 0, agentsEarned = 0, adminEarned = 0, agentOrders = 0, directOrders = 0;
    for (const o of completed) {
      apiCost += Number(o.cost_price) || 0;
      revenue += Number(o.amount) || 0;
      agentsEarned += Number(o.agent_commission) || 0;
      adminEarned += Number(o.admin_commission) || 0;
      const isAgent = (o.agent_id ?? "") !== "" || (Number(o.agent_commission) || 0) > 0;
      if (isAgent) agentOrders++; else directOrders++;
    }
    return { apiCost, revenue, agentsEarned, adminEarned, agentOrders, directOrders, total: completed.length };
  }, [completed]);

  const dailyProfitRows = useMemo(() => {
    const map = new Map<string, { date: string; n: number; failed: number; apiCost: number; revenue: number; agentsEarned: number; adminEarned: number }>();
    for (const o of orders) {
      if (cutoff && new Date(o.created_at) < cutoff) continue;
      const dk = toDateKey(new Date(o.created_at));
      if (!map.has(dk)) map.set(dk, { date: dk, n: 0, failed: 0, apiCost: 0, revenue: 0, agentsEarned: 0, adminEarned: 0 });
      const row = map.get(dk)!;
      const st = (o.status ?? "").toLowerCase().trim();
      if (st === "completed") {
        row.n++;
        row.apiCost += Number(o.cost_price) || 0;
        row.revenue += Number(o.amount) || 0;
        row.agentsEarned += Number(o.agent_commission) || 0;
        row.adminEarned += Number(o.admin_commission) || 0;
      } else if (st === "failed") row.failed++;
    }
    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [orders, cutoff]);

  const card = { background: "#162032", border: "1px solid #1e3050", borderRadius: 16, overflow: "hidden" as const };
  const hdr = { padding: "12px 20px", background: "#0e1928", borderBottom: "1px solid #1e3050" };
  const th = { padding: "10px 14px", color: "#475569", fontWeight: 700, fontSize: 10, textTransform: "uppercase" as const, letterSpacing: "0.06em", whiteSpace: "nowrap" as const };

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-white">Profit &amp; Loss</h1>
          <p className="text-sm text-slate-500">Daily API tracking · Revenue · Net profit</p>
        </div>
        <div className="flex gap-1 rounded-xl p-1 border border-[#1e3050]" style={{ background: "#0e1928" }}>
          {(["7d", "30d", "all"] as Period[]).map((p) => (
            <button key={p} onClick={() => setPeriod(p)}
              className="text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
              style={period === p ? { background: "linear-gradient(90deg,#3b82f6,#8b5cf6)", color: "#fff" } : { color: "#64748b" }}>
              {p === "7d" ? "Last 7 Days" : p === "30d" ? "Last 30 Days" : "All Time"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Section 1: Record API Balances ── */}
      <div style={card}>
        <div style={hdr}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>🏦</span>
              <p style={{ color: "#f1f5f9", fontWeight: 800, fontSize: 15, margin: 0 }}>Inventor API Balance</p>
            </div>
            {runningBalance !== null && (
              <p style={{ color: runningBalance >= 50 ? "#4ade80" : "#f87171", fontWeight: 900, fontFamily: "monospace", fontSize: 18, margin: 0 }}>
                {fmt(runningBalance)} est. remaining
              </p>
            )}
          </div>
        </div>

        <div style={{ padding: 20 }}>
          <p style={{ color: "#475569", fontSize: 12, marginBottom: 16 }}>
            Every morning, open your Inventor account and record the balance. Every evening, record it again. The system tracks what was spent in between.
          </p>

          {/* 3 input boxes: Start of Day, End of Day, Deposit */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 16 }}>
            {[
              { label: "☀️ Start of Day Balance", placeholder: "Morning balance", val: openAmt, set: setOpenAmt, key: "Start of Day", color: "#3b82f6" },
              { label: "🌙 End of Day Balance", placeholder: "Evening balance", val: closeAmt, set: setCloseAmt, key: "End of Day", color: "#8b5cf6" },
              { label: "➕ Top-up / Deposit", placeholder: "Amount added", val: depositAmt, set: setDepositAmt, key: "Top-up deposit", color: "#4ade80" },
            ].map(({ label, placeholder, val, set, key, color }) => (
              <div key={key} style={{ background: "#0e1928", border: "1px solid #1e3050", borderRadius: 12, padding: 12 }}>
                <p style={{ color: "#94a3b8", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }}>{label}</p>
                <div style={{ display: "flex", gap: 6 }}>
                  <div style={{ display: "flex", flex: 1, alignItems: "center", background: "#162032", border: "1px solid #1e3050", borderRadius: 8, overflow: "hidden" }}>
                    <span style={{ padding: "0 8px", color: "#475569", fontWeight: 700, fontSize: 12 }}>GH₵</span>
                    <input type="number" min="0" step="0.01" value={val} onChange={e => set(e.target.value)}
                      placeholder={placeholder}
                      style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#f1f5f9", fontSize: 13, fontWeight: 700, padding: "8px 8px 8px 0" }} />
                  </div>
                  <button onClick={() => record(key === "Top-up deposit" ? "deposit" : "snapshot", val, key)}
                    disabled={saving === key || !val}
                    style={{ padding: "8px 12px", background: "#0e1928", border: `1px solid ${color}`, borderRadius: 8, color, fontWeight: 700, fontSize: 11, cursor: "pointer", opacity: !val ? 0.4 : 1, whiteSpace: "nowrap" }}>
                    {saving === key ? "…" : "Save"}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Running balance breakdown */}
          {runningBalance !== null && (() => {
            const lastSnap = [...ledger].sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()).find(e => e.type === "snapshot");
            const totalDed = ledger.filter(e => e.type === "deduction").reduce((s, e) => s + Number(e.amount), 0);
            const totalDep = lastSnap ? ledger.filter(e => e.type === "deposit" && new Date(e.recorded_at) > new Date(lastSnap.recorded_at)).reduce((s, e) => s + Number(e.amount), 0) : 0;
            return (
              <div style={{ background: "#0e1928", border: "1px solid #1e3050", borderRadius: 12, padding: 14 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ color: "#64748b" }}>
                      Last recorded balance ({lastSnap?.note ?? "snapshot"})
                      {lastSnap && <span style={{ color: "#334155", marginLeft: 6 }}>· {fmtDateTime(lastSnap.recorded_at)}</span>}
                    </span>
                    <span style={{ color: "#f1f5f9", fontWeight: 700, fontFamily: "monospace" }}>{fmt(Number(lastSnap?.amount ?? 0))}</span>
                  </div>
                  {totalDep > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                      <span style={{ color: "#64748b" }}>+ Deposits since then</span>
                      <span style={{ color: "#4ade80", fontWeight: 700, fontFamily: "monospace" }}>+ {fmt(totalDep)}</span>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ color: "#64748b" }}>− Bundles purchased (auto-tracked)</span>
                    <span style={{ color: "#f87171", fontWeight: 700, fontFamily: "monospace" }}>− {fmt(totalDed)}</span>
                  </div>
                  <div style={{ borderTop: "1px solid #1e3050", paddingTop: 8, display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#f1f5f9", fontWeight: 800, fontSize: 13 }}>= Estimated Current Balance</span>
                    <span style={{ color: runningBalance >= 0 ? "#4ade80" : "#f87171", fontWeight: 900, fontFamily: "monospace", fontSize: 18 }}>{fmt(runningBalance)}</span>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* ── Section 2: Today's Cumulative Purchase Log ── */}
      <div style={card}>
        <div style={{ ...hdr, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>📋</span>
            <p style={{ color: "#f1f5f9", fontWeight: 800, fontSize: 15, margin: 0 }}>Today&apos;s Purchase Log</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {todayOpenBalance !== null && (
              <span style={{ color: "#64748b", fontSize: 12 }}>Opened at: <strong style={{ color: "#93c5fd" }}>{fmt(todayOpenBalance)}</strong></span>
            )}
            <span style={{ color: "#f87171", fontFamily: "monospace", fontWeight: 700, fontSize: 13 }}>
              Total spent today: {fmt(todayPurchases.reduce((s, o) => s + o.cost, 0))}
            </span>
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          {todayPurchases.length === 0 ? (
            <p style={{ padding: "40px 20px", textAlign: "center", color: "#334155", fontSize: 13 }}>No completed orders today yet.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#0e1928", borderBottom: "1px solid #1e3050" }}>
                  <th style={{ ...th, textAlign: "left" }}>#</th>
                  <th style={{ ...th, textAlign: "left" }}>Time</th>
                  <th style={{ ...th, textAlign: "left" }}>Phone</th>
                  <th style={{ ...th, textAlign: "left" }}>Bundle</th>
                  <th style={{ ...th, textAlign: "right" }}>API Cost</th>
                  <th style={{ ...th, textAlign: "right" }}>Running Total Spent</th>
                  {todayOpenBalance !== null && <th style={{ ...th, textAlign: "right" }}>API Remaining</th>}
                </tr>
              </thead>
              <tbody>
                {todayPurchases.map(o => (
                  <tr key={o.created_at + (o.phone ?? "")} style={{ borderBottom: "1px solid rgba(30,48,80,0.5)" }}>
                    <td style={{ padding: "9px 14px", color: "#475569", fontWeight: 700 }}>{o.num}</td>
                    <td style={{ padding: "9px 14px", color: "#64748b", fontFamily: "monospace", whiteSpace: "nowrap", fontSize: 11 }}>{fmtTime(o.created_at)}</td>
                    <td style={{ padding: "9px 14px", color: "#94a3b8", fontFamily: "monospace" }}>{o.phone ?? "—"}</td>
                    <td style={{ padding: "9px 14px", color: "#f1f5f9" }}>{(o.network ?? "").toUpperCase()} {o.bundle_size ?? ""}</td>
                    <td style={{ padding: "9px 14px", color: "#f87171", fontFamily: "monospace", textAlign: "right" }}>− {fmt(o.cost)}</td>
                    <td style={{ padding: "9px 14px", color: "#f87171", fontFamily: "monospace", fontWeight: 700, textAlign: "right" }}>{fmt(o.runningCost)}</td>
                    {todayOpenBalance !== null && (
                      <td style={{ padding: "9px 14px", fontFamily: "monospace", fontWeight: 700, textAlign: "right", color: (todayOpenBalance - o.runningCost) < 50 ? "#f87171" : "#4ade80" }}>
                        {fmt(todayOpenBalance - o.runningCost)}
                      </td>
                    )}
                  </tr>
                ))}
                {/* Total row */}
                <tr style={{ background: "#0e1928", borderTop: "2px solid #1e3050" }}>
                  <td colSpan={3} style={{ padding: "10px 14px", color: "#f1f5f9", fontWeight: 800, fontSize: 12 }}>TOTAL TODAY ({todayPurchases.length} orders)</td>
                  <td style={{ padding: "10px 14px", color: "#f87171", fontFamily: "monospace", fontWeight: 900, textAlign: "right" }}>{fmt(todayPurchases.reduce((s, o) => s + o.cost, 0))}</td>
                  <td style={{ padding: "10px 14px", color: "#f87171", fontFamily: "monospace", fontWeight: 900, textAlign: "right" }}>{fmt(todayPurchases.reduce((s, o) => s + o.cost, 0))}</td>
                  {todayOpenBalance !== null && <td style={{ padding: "10px 14px" }} />}
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Section 3: Daily API Summary (open → deducted → close) ── */}
      <div style={card}>
        <div style={hdr}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>📊</span>
            <p style={{ color: "#f1f5f9", fontWeight: 800, fontSize: 15, margin: 0 }}>Daily API Summary</p>
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          {dailyApiRows.length === 0 ? (
            <p style={{ padding: "40px 20px", textAlign: "center", color: "#334155", fontSize: 13 }}>Record your start-of-day balance to begin tracking.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#0e1928", borderBottom: "1px solid #1e3050" }}>
                  <th style={{ ...th, textAlign: "left" }}>Date</th>
                  <th style={{ ...th, textAlign: "right" }}>Opening Balance</th>
                  <th style={{ ...th, textAlign: "right" }}>Recorded At</th>
                  <th style={{ ...th, textAlign: "right" }}>Orders</th>
                  <th style={{ ...th, textAlign: "right" }}>API Deducted</th>
                  <th style={{ ...th, textAlign: "right" }}>Deposits Added</th>
                  <th style={{ ...th, textAlign: "right" }}>Closing Balance</th>
                  <th style={{ ...th, textAlign: "right" }}>Recorded At</th>
                  <th style={{ ...th, textAlign: "center" }}>Verify</th>
                </tr>
              </thead>
              <tbody>
                {dailyApiRows.map(row => {
                  const isToday = row.date === todayKey;
                  // If we have open and deductions, calculate expected close
                  const expectedClose = row.open !== null ? row.open - row.deductions + row.deposits : null;
                  // Verify: actual close vs expected close (within GH₵0.50)
                  const verified = row.close !== null && expectedClose !== null && Math.abs(row.close - expectedClose) < 0.5;
                  const closeDisplay = row.close ?? expectedClose;
                  return (
                    <tr key={row.date} style={{ borderBottom: "1px solid rgba(30,48,80,0.5)", background: isToday ? "rgba(59,130,246,0.05)" : undefined }}>
                      <td style={{ padding: "11px 14px", color: "#f1f5f9", fontWeight: 700, whiteSpace: "nowrap" }}>
                        {isToday ? "Today" : fmtDate(row.date)}
                      </td>
                      <td style={{ padding: "11px 14px", textAlign: "right", fontFamily: "monospace", color: row.open !== null ? "#93c5fd" : "#334155" }}>
                        {row.open !== null ? fmt(row.open) : "—"}
                      </td>
                      <td style={{ padding: "11px 14px", textAlign: "right", color: "#475569", fontSize: 11, whiteSpace: "nowrap" }}>
                        {row.openTime ? fmtTime(row.openTime) : "—"}
                      </td>
                      <td style={{ padding: "11px 14px", textAlign: "right", color: "#f1f5f9", fontWeight: 700 }}>{row.orderCount}</td>
                      <td style={{ padding: "11px 14px", textAlign: "right", fontFamily: "monospace", color: "#f87171", fontWeight: 700 }}>
                        {row.deductions > 0 ? `− ${fmt(row.deductions)}` : "—"}
                      </td>
                      <td style={{ padding: "11px 14px", textAlign: "right", fontFamily: "monospace", color: row.deposits > 0 ? "#4ade80" : "#334155" }}>
                        {row.deposits > 0 ? `+ ${fmt(row.deposits)}` : "—"}
                      </td>
                      <td style={{ padding: "11px 14px", textAlign: "right", fontFamily: "monospace", color: closeDisplay !== null ? "#c084fc" : "#334155", fontWeight: 700 }}>
                        {closeDisplay !== null ? fmt(closeDisplay) : "—"}
                        {row.close === null && expectedClose !== null && <span style={{ color: "#475569", fontSize: 10 }}> (est.)</span>}
                      </td>
                      <td style={{ padding: "11px 14px", textAlign: "right", color: "#475569", fontSize: 11, whiteSpace: "nowrap" }}>
                        {row.closeTime ? fmtTime(row.closeTime) : "—"}
                      </td>
                      <td style={{ padding: "11px 14px", textAlign: "center" }}>
                        {row.close !== null
                          ? (verified ? <span style={{ color: "#4ade80", fontWeight: 700, fontSize: 11 }}>✓ Match</span> : <span style={{ color: "#f87171", fontWeight: 700, fontSize: 11 }}>⚠ Check</span>)
                          : <span style={{ color: "#334155", fontSize: 11 }}>Pending</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Section 4: P&L Summary ── */}
      <div style={card}>
        <div style={{ ...hdr, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>💰</span>
          <p style={{ color: "#f1f5f9", fontWeight: 800, fontSize: 15, margin: 0 }}>
            Profit &amp; Loss — {period === "7d" ? "Last 7 Days" : period === "30d" ? "Last 30 Days" : "All Time"} · {stats.total} completed orders
          </p>
        </div>
        {[
          { emoji: "💸", label: "API Cost (Data Purchased)", sub: `Cost of ${stats.total} bundles from Inventor`, val: stats.apiCost, color: "#f87171" },
          { emoji: "📈", label: "Total Revenue from Customers", sub: `${stats.directOrders} direct + ${stats.agentOrders} via agents`, val: stats.revenue, color: "#93c5fd" },
          { emoji: "🤝", label: "Agent Commissions (owed to agents)", sub: `80% profit from ${stats.agentOrders} agent orders`, val: stats.agentsEarned, color: "#c084fc" },
          { emoji: "👤", label: "Your Admin Profit", sub: "20% from agent + 100% from direct sales", val: stats.adminEarned, color: "#34d399" },
        ].map(row => (
          <div key={row.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid #1e3050" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 18 }}>{row.emoji}</span>
              <div>
                <p style={{ color: row.color, fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em", margin: 0 }}>{row.label}</p>
                <p style={{ color: "#475569", fontSize: 11, margin: "3px 0 0" }}>{row.sub}</p>
              </div>
            </div>
            <p style={{ color: row.color, fontWeight: 900, fontSize: 20, fontFamily: "monospace", margin: 0 }}>{fmt(row.val)}</p>
          </div>
        ))}
        {/* Net profit */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px", background: "rgba(74,222,128,0.05)", borderTop: "2px solid rgba(74,222,128,0.2)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 22 }}>✅</span>
            <div>
              <p style={{ color: "#fff", fontWeight: 900, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>Net Profit (Yours)</p>
              <p style={{ color: "#475569", fontSize: 11, margin: "4px 0 0" }}>
                {fmt(stats.revenue)} revenue − {fmt(stats.apiCost)} API cost − {fmt(stats.agentsEarned)} agents
              </p>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ color: "#4ade80", fontWeight: 900, fontSize: 28, fontFamily: "monospace", margin: 0 }}>{fmt(stats.adminEarned)}</p>
            {stats.revenue > 0 && <p style={{ color: "#16a34a", fontSize: 12, fontWeight: 700, margin: "2px 0 0" }}>{((stats.adminEarned / stats.revenue) * 100).toFixed(1)}% margin</p>}
          </div>
        </div>
      </div>

      {/* ── Section 5: Daily Profit Table ── */}
      <div style={card}>
        <div style={hdr}>
          <p style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 15, margin: 0 }}>Daily Profit — Day by Day</p>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#0e1928", borderBottom: "1px solid #1e3050" }}>
                {["Date", "Orders", "API Cost 💸", "Revenue 📈", "Agents 🤝", "Admin Profit 👤", "Net ✅"].map((h, i) => (
                  <th key={h} style={{ ...th, textAlign: i === 0 ? "left" : "right" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dailyProfitRows.map(row => {
                const isToday = row.date === todayKey;
                return (
                  <tr key={row.date} style={{ borderBottom: "1px solid rgba(30,48,80,0.5)", background: isToday ? "rgba(59,130,246,0.05)" : undefined }}>
                    <td style={{ padding: "11px 14px", whiteSpace: "nowrap" }}>
                      <span style={{ color: "#f1f5f9", fontWeight: 700 }}>{isToday ? "Today" : fmtDate(row.date)}</span>
                      {row.failed > 0 && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: "rgba(248,113,113,0.15)", color: "#f87171" }}>{row.failed} failed</span>}
                    </td>
                    <td style={{ padding: "11px 14px", color: "#f1f5f9", fontWeight: 700, textAlign: "right" }}>{row.n}</td>
                    <td style={{ padding: "11px 14px", color: "#f87171", fontFamily: "monospace", textAlign: "right" }}>{fmt(row.apiCost)}</td>
                    <td style={{ padding: "11px 14px", color: "#93c5fd", fontFamily: "monospace", textAlign: "right" }}>{fmt(row.revenue)}</td>
                    <td style={{ padding: "11px 14px", color: "#c084fc", fontFamily: "monospace", textAlign: "right" }}>{fmt(row.agentsEarned)}</td>
                    <td style={{ padding: "11px 14px", color: "#34d399", fontFamily: "monospace", textAlign: "right" }}>{fmt(row.adminEarned)}</td>
                    <td style={{ padding: "11px 14px", fontWeight: 900, fontFamily: "monospace", textAlign: "right", color: row.adminEarned > 0 ? "#4ade80" : "#f87171" }}>{fmt(row.adminEarned)}</td>
                  </tr>
                );
              })}
              {/* Totals row */}
              {dailyProfitRows.length > 0 && (() => {
                const tot = dailyProfitRows.reduce((acc, r) => ({
                  n: acc.n + r.n, apiCost: acc.apiCost + r.apiCost, revenue: acc.revenue + r.revenue,
                  agentsEarned: acc.agentsEarned + r.agentsEarned, adminEarned: acc.adminEarned + r.adminEarned,
                }), { n: 0, apiCost: 0, revenue: 0, agentsEarned: 0, adminEarned: 0 });
                return (
                  <tr style={{ background: "#0e1928", borderTop: "2px solid #1e3050" }}>
                    <td style={{ padding: "12px 14px", color: "#f1f5f9", fontWeight: 900, fontSize: 12 }}>TOTAL ({dailyProfitRows.length} days)</td>
                    <td style={{ padding: "12px 14px", color: "#f1f5f9", fontWeight: 900, textAlign: "right" }}>{tot.n}</td>
                    <td style={{ padding: "12px 14px", color: "#f87171", fontFamily: "monospace", fontWeight: 900, textAlign: "right" }}>{fmt(tot.apiCost)}</td>
                    <td style={{ padding: "12px 14px", color: "#93c5fd", fontFamily: "monospace", fontWeight: 900, textAlign: "right" }}>{fmt(tot.revenue)}</td>
                    <td style={{ padding: "12px 14px", color: "#c084fc", fontFamily: "monospace", fontWeight: 900, textAlign: "right" }}>{fmt(tot.agentsEarned)}</td>
                    <td style={{ padding: "12px 14px", color: "#34d399", fontFamily: "monospace", fontWeight: 900, textAlign: "right" }}>{fmt(tot.adminEarned)}</td>
                    <td style={{ padding: "12px 14px", color: "#4ade80", fontFamily: "monospace", fontWeight: 900, textAlign: "right" }}>{fmt(tot.adminEarned)}</td>
                  </tr>
                );
              })()}
              {dailyProfitRows.length === 0 && (
                <tr><td colSpan={7} style={{ padding: "50px 0", textAlign: "center", color: "#475569" }}>No completed orders in this period</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
