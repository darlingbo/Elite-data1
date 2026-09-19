"use client";
import { useState, useEffect, useCallback } from "react";

interface NumberRow {
  phone: string;
  orders: number;
  lastOrder: string;
  verified?: boolean; // undefined = not checked yet
}

const D = {
  bg: "#0d1117",
  card: "#161b22",
  border: "#21262d",
  text: "#e6edf3",
  muted: "#8b949e",
};

const BATCH_SIZE = 60;

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" });
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
      {done ? "✓ Copied" : `📋 ${label ?? "Copy"}`}
    </button>
  );
}

export default function MtnVerificationAdmin() {
  const [rows, setRows] = useState<NumberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [checkedCount, setCheckedCount] = useState(0);
  const [filter, setFilter] = useState<"all" | "verified" | "not_verified" | "unchecked">("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/mtn-numbers");
      const d = await res.json();
      setRows((d.numbers ?? []).map((n: { phone: string; orders: number; lastOrder: string }) => ({ ...n })));
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function checkAll() {
    setChecking(true);
    setCheckedCount(0);
    const phones = rows.map((r) => r.phone);
    for (let i = 0; i < phones.length; i += BATCH_SIZE) {
      const batch = phones.slice(i, i + BATCH_SIZE);
      try {
        const res = await fetch("/api/admin/mtn-numbers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phones: batch }),
        });
        const d = await res.json();
        const byPhone = new Map<string, boolean>((d.results ?? []).map((r: { phone: string; verified: boolean }) => [r.phone, r.verified]));
        setRows((prev) => prev.map((r) => (byPhone.has(r.phone) ? { ...r, verified: byPhone.get(r.phone) } : r)));
      } catch {
        // move on to the next batch
      }
      setCheckedCount(Math.min(i + BATCH_SIZE, phones.length));
    }
    setChecking(false);
  }

  const filtered = rows.filter((r) => {
    if (filter === "verified" && r.verified !== true) return false;
    if (filter === "not_verified" && r.verified !== false) return false;
    if (filter === "unchecked" && r.verified !== undefined) return false;
    if (search) return r.phone.includes(search.replace(/\D/g, ""));
    return true;
  });

  const counts = {
    verified: rows.filter((r) => r.verified === true).length,
    notVerified: rows.filter((r) => r.verified === false).length,
    unchecked: rows.filter((r) => r.verified === undefined).length,
  };

  const notVerifiedList = rows.filter((r) => r.verified === false).map((r) => r.phone).join("\n");

  return (
    <div className="admin-section" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: D.text, margin: 0 }}>MTN Verification</h2>
          <p style={{ fontSize: 13, color: D.muted, margin: "4px 0 0", maxWidth: 520, lineHeight: 1.6 }}>
            Every MTN number that has ordered from you ({rows.length} total). Checks each one live against
            MTN&apos;s own beneficiary list — numbers not on it get delivered manually within 72h instead of instantly.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search number…"
            style={{ background: D.card, border: `1px solid ${D.border}`, color: D.text, borderRadius: 10, padding: "8px 14px", fontSize: 13, outline: "none", width: 160 }} />
          <button onClick={load} disabled={checking}
            style={{ background: D.card, border: `1px solid ${D.border}`, color: D.muted, borderRadius: 10, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            ↻ Refresh list
          </button>
          <button onClick={checkAll} disabled={checking || rows.length === 0}
            style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.4)", color: "#60a5fa", borderRadius: 10, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: checking ? "default" : "pointer", opacity: checking ? 0.7 : 1 }}>
            {checking ? `Checking… ${checkedCount}/${rows.length}` : "Check all with MTN"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {([
          { key: "all", label: `All (${rows.length})`, bg: "#3b82f6" },
          { key: "verified", label: `Verified (${counts.verified})`, bg: "#34d399" },
          { key: "not_verified", label: `Needs registration (${counts.notVerified})`, bg: "#f87171" },
          { key: "unchecked", label: `Not checked (${counts.unchecked})`, bg: "#94a3b8" },
        ] as const).map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key as typeof filter)}
            style={{ padding: "7px 14px", borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: "pointer",
              background: filter === f.key ? `${f.bg}30` : D.card,
              color: filter === f.key ? f.bg : D.muted,
              border: `1px solid ${filter === f.key ? `${f.bg}60` : D.border}` }}>
            {f.label}
          </button>
        ))}
        {counts.notVerified > 0 && (
          <CopyBtn text={notVerifiedList} label={`Copy all ${counts.notVerified} needing registration`} />
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: D.muted }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ background: D.card, borderRadius: 14, padding: "60px 20px", textAlign: "center", border: `1px solid ${D.border}` }}>
          <p style={{ color: D.muted, fontSize: 14, margin: 0 }}>No numbers match.</p>
        </div>
      ) : (
        <div style={{ overflowX: "auto", borderRadius: 14, border: `1px solid ${D.border}` }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: D.bg, borderBottom: `1px solid ${D.border}` }}>
                {["#", "Phone", "Orders", "Last order", "Status", ""].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: D.muted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.phone} style={{ borderBottom: `1px solid ${D.border}`, background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)" }}>
                  <td style={{ padding: "12px 14px", color: D.muted, fontFamily: "monospace" }}>{i + 1}</td>
                  <td style={{ padding: "12px 14px", fontFamily: "monospace", fontWeight: 800, color: D.text }}>{r.phone}</td>
                  <td style={{ padding: "12px 14px", color: D.muted }}>{r.orders}</td>
                  <td style={{ padding: "12px 14px", color: D.muted, fontSize: 12, whiteSpace: "nowrap" }}>{fmtDate(r.lastOrder)}</td>
                  <td style={{ padding: "12px 14px" }}>
                    {r.verified === true && (
                      <span style={{ background: "rgba(52,211,153,0.15)", color: "#34d399", padding: "3px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700 }}>✓ Verified</span>
                    )}
                    {r.verified === false && (
                      <span style={{ background: "rgba(248,113,113,0.15)", color: "#f87171", padding: "3px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700 }}>Needs registration</span>
                    )}
                    {r.verified === undefined && (
                      <span style={{ background: "rgba(148,163,184,0.12)", color: "#94a3b8", padding: "3px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700 }}>Not checked</span>
                    )}
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    <CopyBtn text={r.phone} label="Copy" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
