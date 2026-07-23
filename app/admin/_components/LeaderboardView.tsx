"use client";
import { useMemo } from "react";
import type { StatsData } from "./shared/types";
import { BG, CARD, BORDER } from "./shared/constants";

export function LeaderboardView({ stats }: { stats: StatsData }) {
  const agents = useMemo(() =>
    [...stats.agents.all].filter(a => a.status === "approved")
      .sort((a, b) => Number(b.total_revenue) - Number(a.total_revenue)),
    [stats.agents.all]
  );

  const avatarColors = ["#f59e0b", "#94a3b8", "#cd7f32", "#3b82f6", "#8b5cf6", "#10b981", "#f87171"];
  const medals = ["🥇", "🥈", "🥉"];
  const totalRevenue = agents.reduce((s, a) => s + Number(a.total_revenue), 0);
  const totalSales   = agents.reduce((s, a) => s + Number(a.total_sales), 0);
  const totalBal     = agents.reduce((s, a) => s + Number(a.commission_balance ?? 0), 0);
  const topThree = agents.length >= 3 ? [agents[1], agents[0], agents[2]] : [];

  return (
    <div className="admin-section space-y-5">
      <div>
        <h1 className="text-xl font-black text-white">Agent Leaderboard</h1>
        <p className="text-sm text-slate-500">{agents.length} approved agents · GH₵{totalRevenue.toFixed(2)} total revenue generated</p>
      </div>

      {topThree.length === 3 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {topThree.map((a, i) => {
            const rank = i === 0 ? 2 : i === 1 ? 1 : 3;
            const isFirst = rank === 1;
            const share = totalRevenue > 0 ? (Number(a.total_revenue) / totalRevenue) * 100 : 0;
            return (
              <div key={a.id} className="rounded-2xl border p-5 text-center" style={{ background: CARD, borderColor: isFirst ? "#78350f" : BORDER, boxShadow: isFirst ? "0 0 0 1px #78350f40" : undefined }}>
                <div className="text-3xl mb-3">{medals[rank - 1]}</div>
                <div className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-black text-white mx-auto mb-2" style={{ background: avatarColors[rank - 1] }}>
                  {(a.name ?? "?").charAt(0).toUpperCase()}
                </div>
                <p className="font-black text-white truncate">{a.name}</p>
                <p className="text-[11px] text-slate-500 mb-2">@{(a.referral_code ?? "").toLowerCase()}</p>
                <p className="font-black text-lg" style={{ color: "#4ade80" }}>GH₵{Number(a.total_revenue).toFixed(2)}</p>
                <p className="text-xs text-slate-500">{Number(a.total_sales).toLocaleString()} sales · {share.toFixed(1)}% share</p>
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-2xl border overflow-hidden" style={{ background: CARD, borderColor: BORDER }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-slate-500 uppercase tracking-wider" style={{ background: BG, borderColor: BORDER }}>
                <th className="px-4 py-3 text-left font-semibold w-12">Rank</th>
                <th className="px-4 py-3 text-left font-semibold">Agent</th>
                <th className="px-4 py-3 text-left font-semibold">Code</th>
                <th className="px-4 py-3 text-left font-semibold">Mode</th>
                <th className="px-4 py-3 text-right font-semibold">Sales</th>
                <th className="px-4 py-3 text-right font-semibold">Revenue</th>
                <th className="px-4 py-3 text-right font-semibold">Comm. Balance</th>
                <th className="px-4 py-3 text-right font-semibold">Revenue Share</th>
                <th className="px-4 py-3 text-left font-semibold">Joined</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a, i) => {
                const share = totalRevenue > 0 ? (Number(a.total_revenue) / totalRevenue) * 100 : 0;
                return (
                  <tr key={a.id} className="border-b last:border-0 hover:bg-white/2 transition-colors" style={{ borderColor: BORDER }}>
                    <td className="px-4 py-3.5 text-center">
                      {i < 3
                        ? <span className="text-xl">{medals[i]}</span>
                        : <span className="text-slate-600 font-black text-sm">#{i + 1}</span>}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0" style={{ background: avatarColors[i % avatarColors.length] }}>
                          {(a.name ?? "?").charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-white leading-none">{a.name}</p>
                          <p className="text-[10px] text-slate-500 mt-0.5 font-mono">{a.phone}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs font-bold" style={{ color: "#60a5fa" }}>{a.referral_code}</td>
                    <td className="px-4 py-3.5">
                      {a.agent_type === "custom_price"
                        ? <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(139,92,246,0.15)", color: "#a78bfa", border: "1px solid rgba(139,92,246,0.3)" }}>Price Mode</span>
                        : <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(16,185,129,0.1)", color: "#4ade80", border: "1px solid rgba(16,185,129,0.25)" }}>Commission</span>}
                    </td>
                    <td className="px-4 py-3.5 text-right font-bold text-white">{Number(a.total_sales).toLocaleString()}</td>
                    <td className="px-4 py-3.5 text-right font-black" style={{ color: "#4ade80" }}>GH₵{Number(a.total_revenue).toFixed(2)}</td>
                    <td className="px-4 py-3.5 text-right font-bold text-white">GH₵{Number(a.commission_balance ?? 0).toFixed(2)}</td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: BORDER }}>
                          <div className="h-full rounded-full" style={{ width: `${Math.min(share, 100)}%`, background: avatarColors[i % avatarColors.length] }} />
                        </div>
                        <span className="text-xs text-slate-400 w-10 text-right">{share.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-500">{new Date(a.created_at).toLocaleDateString("en-GH")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {agents.length === 0 && (
            <div className="py-16 text-center">
              <p className="text-4xl mb-3">🏆</p>
              <p className="text-slate-500 font-semibold">No approved agents yet</p>
            </div>
          )}
        </div>
        {agents.length > 0 && (
          <div className="grid grid-cols-3 border-t divide-x" style={{ borderColor: BORDER, "--tw-divide-opacity": 1 } as React.CSSProperties}>
            {[
              { label: "Approved Agents", value: agents.length.toString() },
              { label: "Total Sales", value: totalSales.toLocaleString() },
              { label: "Total Revenue", value: `GH₵${totalRevenue.toFixed(2)}`, green: true },
            ].map(s => (
              <div key={s.label} className="px-5 py-3 border-r last:border-r-0" style={{ borderColor: BORDER }}>
                <p className="text-xs text-slate-500 mb-0.5">{s.label}</p>
                <p className="font-black text-sm" style={{ color: s.green ? "#4ade80" : "white" }}>{s.value}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {agents.length > 0 && (
        <div className="rounded-2xl border p-5" style={{ background: CARD, borderColor: BORDER }}>
          <p className="font-bold text-white mb-4">Outstanding Commission Balances</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {agents.filter(a => Number(a.commission_balance) > 0).sort((a, b) => Number(b.commission_balance) - Number(a.commission_balance)).map((a, i) => (
              <div key={a.id} className="rounded-xl border p-3" style={{ background: BG, borderColor: BORDER }}>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-white" style={{ background: avatarColors[i % avatarColors.length] }}>
                    {(a.name ?? "?").charAt(0).toUpperCase()}
                  </div>
                  <p className="text-xs font-semibold text-white truncate">{a.name}</p>
                </div>
                <p className="font-black text-sm" style={{ color: "#fbbf24" }}>GH₵{Number(a.commission_balance).toFixed(2)}</p>
                <p className="text-[10px] text-slate-600">pending payout</p>
              </div>
            ))}
            {agents.filter(a => Number(a.commission_balance) > 0).length === 0 && (
              <p className="col-span-full text-sm text-slate-600 py-2">All commission balances are at zero</p>
            )}
          </div>
          {totalBal > 0 && (
            <div className="mt-4 pt-3 border-t flex items-center justify-between" style={{ borderColor: BORDER }}>
              <span className="text-sm text-slate-400">Total outstanding commissions</span>
              <span className="font-black text-lg" style={{ color: "#fbbf24" }}>GH₵{totalBal.toFixed(2)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
