"use client";
import { useState, useEffect, useCallback } from "react";

interface RefundRow {
  reference: string;
  customer_name: string | null;
  phone: string | null;
  refund_phone: string | null;
  refund_network: string | null;
  network: string | null;
  bundle_size: string | null;
  amount: number;
  status: string;
  created_at: string;
}

const D = {
  bg: "#0d1117",
  card: "#161b22",
  border: "#21262d",
  text: "#e6edf3",
  muted: "#8b949e",
};

const MOMO_LABELS: Record<string, string> = {
  mtn: "MTN MoMo",
  telecel: "Telecel Cash",
  airteltigo: "AirtelTigo Money",
};

const MOMO_COLORS: Record<string, { bg: string; color: string }> = {
  mtn: { bg: "rgba(251,191,36,0.15)", color: "#fbbf24" },
  telecel: { bg: "rgba(239,68,68,0.15)", color: "#f87171" },
  airteltigo: { bg: "rgba(59,130,246,0.15)", color: "#60a5fa" },
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  completed: { bg: "rgba(16,185,129,0.1)", color: "#10b981" },
  processing: { bg: "rgba(59,130,246,0.1)", color: "#3b82f6" },
  pending: { bg: "rgba(245,158,11,0.1)", color: "#f59e0b" },
  failed: { bg: "rgba(248,113,113,0.1)", color: "#f87171" },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-GH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function CopyBtn({ text, label }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  function copy() {
    navigator.clipboard?.writeText(text).catch(() => {});
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  }
  return (
    <button onClick={copy}
      style={{ background: done ? "rgba(16,185,129,0.2)" : "rgba(59,130,246,0.12)", color: done ? "#34d399" : "#60a5fa", border: `1px solid ${done ? "rgba(16,185,129,0.3)" : "rgba(59,130,246,0.3)"}`, borderRadius: 8, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
      {done ? "✓ Copied" : `📋 ${label ?? text}`}
    </button>
  );
}

export default function RefundNumbers() {
  const [rows, setRows] = useState<RefundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [migrationNeeded, setMigrationNeeded] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "failed" | "processing" | "pending" | "completed">("all");
  const [search, setSearch] = useState("");
  const [copiedAll, setCopiedAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/refund-numbers");
      const d = await res.json();
      setRows(d.orders ?? []);
      setMigrationNeeded(!!d.migration_needed);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter(r => {
    if (statusFilter !== "all" && (r.status ?? "").toLowerCase() !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (r.customer_name ?? "").toLowerCase().includes(q) ||
        (r.phone ?? "").includes(q) ||
        (r.refund_phone ?? "").includes(q) ||
        (r.reference ?? "").toLowerCase().includes(q);
    }
    return true;
  });

  function copyAll() {
    const lines = filtered.map(r =>
      `${r.customer_name ?? "Unknown"} | ${MOMO_LABELS[r.refund_network ?? ""] ?? r.refund_network ?? "?"} | ${r.refund_phone ?? "—"} | ${(r.network ?? "").toUpperCase()} ${r.bundle_size ?? ""} | GH₵${Number(r.amount).toFixed(2)} | ${r.status} | Ref: ${r.reference}`
    ).join("\n");
    navigator.clipboard?.writeText(lines).catch(() => {});
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  }

  const counts = {
    failed: rows.filter(r => r.status?.toLowerCase() === "failed").length,
    processing: rows.filter(r => r.status?.toLowerCase() === "processing").length,
    pending: rows.filter(r => r.status?.toLowerCase() === "pending").length,
    completed: rows.filter(r => r.status?.toLowerCase() === "completed").length,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: D.text, margin: 0 }}>MoMo Refund Numbers</h2>
          <p style={{ fontSize: 13, color: D.muted, margin: "4px 0 0" }}>
            Every customer's MoMo number for instant manual refunds
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name / number…"
            style={{ background: D.card, border: `1px solid ${D.border}`, color: D.text, borderRadius: 10, padding: "8px 14px", fontSize: 13, outline: "none", width: 200 }} />
          <button onClick={load}
            style={{ background: D.card, border: `1px solid ${D.border}`, color: D.muted, borderRadius: 10, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            ↻ Refresh
          </button>
          <button onClick={copyAll} disabled={filtered.length === 0}
            style={{ background: copiedAll ? "rgba(16,185,129,0.2)" : "rgba(59,130,246,0.12)", border: `1px solid ${copiedAll ? "rgba(16,185,129,0.4)" : "rgba(59,130,246,0.4)"}`, color: copiedAll ? "#34d399" : "#60a5fa", borderRadius: 10, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            {copiedAll ? "✓ Copied All!" : `📋 Copy All (${filtered.length})`}
          </button>
        </div>
      </div>

      {/* Migration warning */}
      {migrationNeeded && (
        <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.4)", borderRadius: 14, padding: "16px 20px" }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: "#fbbf24", margin: "0 0 8px" }}>⚠️ Database columns missing</p>
          <p style={{ fontSize: 13, color: "#8b949e", margin: "0 0 12px", lineHeight: 1.6 }}>
            The <code style={{ background: "rgba(255,255,255,0.07)", padding: "2px 6px", borderRadius: 4 }}>refund_phone</code> and <code style={{ background: "rgba(255,255,255,0.07)", padding: "2px 6px", borderRadius: 4 }}>refund_network</code> columns don&apos;t exist yet in your Supabase orders table.
            Run this SQL in your <strong style={{ color: "#e6edf3" }}>Supabase SQL Editor</strong>:
          </p>
          <pre style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: 10, padding: "12px 16px", fontSize: 12, color: "#4ade80", margin: 0, overflowX: "auto", fontFamily: "monospace" }}>
{`ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_phone TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_network TEXT;`}
          </pre>
          <p style={{ fontSize: 12, color: "#8b949e", margin: "10px 0 0" }}>After running it, click ↻ Refresh above.</p>
        </div>
      )}

      {/* Status filter pills */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {([
          { key: "all", label: `All (${rows.length})`, bg: "#3b82f6" },
          { key: "failed", label: `Failed (${counts.failed})`, bg: "#f87171" },
          { key: "processing", label: `Processing (${counts.processing})`, bg: "#3b82f6" },
          { key: "pending", label: `Pending (${counts.pending})`, bg: "#f59e0b" },
          { key: "completed", label: `Completed (${counts.completed})`, bg: "#10b981" },
        ] as const).map(f => (
          <button key={f.key} onClick={() => setStatusFilter(f.key as typeof statusFilter)}
            style={{ padding: "7px 14px", borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: "pointer",
              background: statusFilter === f.key ? `${f.bg}30` : D.card,
              color: statusFilter === f.key ? f.bg : D.muted,
              border: `1px solid ${statusFilter === f.key ? `${f.bg}60` : D.border}` }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: D.muted }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ background: D.card, borderRadius: 14, padding: "60px 20px", textAlign: "center", border: `1px solid ${D.border}` }}>
          <p style={{ color: D.muted, fontSize: 14, margin: 0 }}>No records found.</p>
        </div>
      ) : (
        <div style={{ overflowX: "auto", borderRadius: 14, border: `1px solid ${D.border}` }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: D.bg, borderBottom: `1px solid ${D.border}` }}>
                {["#", "Customer", "Order Phone", "MoMo Network", "MoMo Number", "Bundle", "Amount", "Status", "Date", ""].map(h => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: D.muted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const mc = MOMO_COLORS[r.refund_network ?? ""] ?? { bg: "rgba(100,100,100,0.15)", color: "#94a3b8" };
                const sc = STATUS_COLORS[(r.status ?? "").toLowerCase()] ?? { bg: "transparent", color: "#94a3b8" };
                return (
                  <tr key={r.reference} style={{ borderBottom: `1px solid ${D.border}`, background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)" }}>
                    <td style={{ padding: "12px 14px", color: D.muted, fontFamily: "monospace" }}>{i + 1}</td>
                    <td style={{ padding: "12px 14px" }}>
                      <p style={{ margin: 0, fontWeight: 700, color: D.text }}>{r.customer_name || "—"}</p>
                      <p style={{ margin: 0, fontSize: 11, color: D.muted, fontFamily: "monospace" }}>{r.reference?.slice(0, 16)}…</p>
                    </td>
                    <td style={{ padding: "12px 14px", fontFamily: "monospace", color: D.muted, fontSize: 12 }}>{r.phone ?? "—"}</td>
                    <td style={{ padding: "12px 14px" }}>
                      <span style={{ background: mc.bg, color: mc.color, padding: "3px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700 }}>
                        {MOMO_LABELS[r.refund_network ?? ""] ?? r.refund_network ?? "—"}
                      </span>
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontFamily: "monospace", fontWeight: 800, color: D.text, fontSize: 14 }}>{r.refund_phone ?? "—"}</span>
                        {r.refund_phone && <CopyBtn text={r.refund_phone} />}
                      </div>
                    </td>
                    <td style={{ padding: "12px 14px", color: D.muted, whiteSpace: "nowrap" }}>
                      {(r.network ?? "").toUpperCase()} {r.bundle_size ?? ""}
                    </td>
                    <td style={{ padding: "12px 14px", fontWeight: 800, color: D.text }}>GH₵{Number(r.amount).toFixed(2)}</td>
                    <td style={{ padding: "12px 14px" }}>
                      <span style={{ background: sc.bg, color: sc.color, padding: "3px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, textTransform: "capitalize" }}>
                        {r.status ?? "—"}
                      </span>
                    </td>
                    <td style={{ padding: "12px 14px", color: D.muted, fontSize: 11, whiteSpace: "nowrap" }}>{fmtDate(r.created_at)}</td>
                    <td style={{ padding: "12px 14px" }}>
                      {r.refund_phone && (
                        <CopyBtn
                          text={`${r.customer_name ?? ""} | ${MOMO_LABELS[r.refund_network ?? ""] ?? ""} | ${r.refund_phone} | ${(r.network ?? "").toUpperCase()} ${r.bundle_size ?? ""} | GH₵${Number(r.amount).toFixed(2)}`}
                          label="Copy Row"
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
