"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface Leader {
  rank: number;
  name: string;
  referral_code: string;
  total_sales: number;
  total_revenue: number;
}

const BG     = "#080f1e";
const CARD   = "#0d1b2e";
const BORDER = "#1e3a5f";
const TEXT   = "#f8fafc";
const MUTED  = "#94a3b8";
const SUB    = "#64748b";
const YELLOW = "#fbbf24";

const MEDALS = ["🥇", "🥈", "🥉"];

function maskName(name: string): string {
  const parts = name.trim().split(" ");
  return parts
    .map((p) => (p.length <= 2 ? p : p[0] + "*".repeat(p.length - 2) + p[p.length - 1]))
    .join(" ");
}

function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) return <span style={{ fontSize: 22 }}>{MEDALS[rank - 1]}</span>;
  return (
    <span style={{
      width: 32, height: 32, borderRadius: 8,
      background: "rgba(255,255,255,0.06)", border: `1px solid ${BORDER}`,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontSize: 13, fontWeight: 700, color: MUTED,
    }}>
      {rank}
    </span>
  );
}

export default function LeaderboardPage() {
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"all" | "month">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/agents/leaderboard?period=${period}`);
      const d = await r.json();
      setLeaders(d.leaders ?? []);
    } catch {
      setLeaders([]);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ background: BG, minHeight: "100vh", paddingBottom: 80 }}>
      {/* Header */}
      <div style={{
        background: `radial-gradient(ellipse 80% 50% at 50% -10%, rgba(59,130,246,0.13) 0%, transparent 65%), ${BG}`,
        padding: "52px 16px 40px",
        textAlign: "center",
        borderBottom: `1px solid ${BORDER}`,
      }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🏆</div>
        <h1 style={{ color: TEXT, fontWeight: 900, fontSize: "clamp(24px,6vw,36px)", letterSpacing: "-0.03em", margin: "0 0 10px" }}>
          Agent Leaderboard
        </h1>
        <p style={{ color: MUTED, fontSize: 15, maxWidth: 400, margin: "0 auto 24px" }}>
          Top Elite Data agents ranked by bundles sold. Want to be on the board?
        </p>
        <Link
          href="/agent"
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: YELLOW, color: "#0d0d0d", fontWeight: 800,
            padding: "12px 24px", borderRadius: 14, textDecoration: "none", fontSize: 14,
          }}
        >
          🚀 Become an Agent
        </Link>
      </div>

      <div style={{ maxWidth: 600, margin: "0 auto", padding: "32px 16px 0" }}>
        {/* Period toggle */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24, justifyContent: "center" }}>
          {(["all", "month"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                padding: "8px 20px", borderRadius: 10, border: "none",
                cursor: "pointer", fontWeight: 700, fontSize: 13,
                background: period === p ? YELLOW : "rgba(255,255,255,0.06)",
                color: period === p ? "#0d0d0d" : MUTED,
                transition: "all 0.15s",
              }}
            >
              {p === "all" ? "All Time" : "This Month"}
            </button>
          ))}
        </div>

        {/* Table */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 20, overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: "48px 16px", textAlign: "center" }}>
              <div style={{ color: MUTED, fontSize: 14 }}>Loading rankings…</div>
            </div>
          ) : leaders.length === 0 ? (
            <div style={{ padding: "48px 16px", textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
              <p style={{ color: MUTED, fontSize: 14, margin: 0 }}>No rankings yet for this period.</p>
            </div>
          ) : (
            leaders.map((l, i) => (
              <div
                key={l.referral_code || i}
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "16px 20px",
                  borderBottom: i < leaders.length - 1 ? `1px solid ${BORDER}` : "none",
                  background: i === 0 ? "rgba(251,191,36,0.04)" : "transparent",
                }}
              >
                {/* Rank */}
                <div style={{ width: 32, flexShrink: 0, textAlign: "center" }}>
                  <RankBadge rank={l.rank} />
                </div>

                {/* Agent avatar */}
                <div style={{
                  width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                  background: `linear-gradient(135deg, #3b82f6, #8b5cf6)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 900, fontSize: 16, color: "#fff",
                }}>
                  {(l.name || "A")[0].toUpperCase()}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: TEXT, fontWeight: 700, fontSize: 14, margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {maskName(l.name)}
                  </p>
                  <p style={{ color: SUB, fontSize: 12, margin: 0 }}>
                    {l.referral_code && `Code: ${l.referral_code}`}
                  </p>
                </div>

                {/* Sales */}
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <p style={{ color: YELLOW, fontWeight: 800, fontSize: 15, margin: "0 0 2px" }}>
                    {l.total_sales.toLocaleString()}
                  </p>
                  <p style={{ color: SUB, fontSize: 11, margin: 0 }}>bundles sold</p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer note */}
        <p style={{ color: SUB, fontSize: 12, textAlign: "center", marginTop: 20, lineHeight: 1.6 }}>
          Agent names are partially masked for privacy. Rankings update daily.
        </p>
      </div>
    </div>
  );
}
