"use client";

import { useEffect, useState } from "react";

type ControlData = {
  provider: { ready: boolean; lastError: string | null };
  settings: Record<string, string>;
  usage: { requests: number; tokens: number; cost: number; averageLatency: number; errors: number };
  activity: Array<{ id: string; scope: string; role: string; content_redacted: string; status: string; created_at: string }>;
  escalations: Array<{ id: string; summary_redacted: string; status: string; created_at: string }>;
};

export default function AiControlPanel() {
  const [data, setData] = useState<ControlData | null>(null);
  const [saving, setSaving] = useState(false);
  const load = () => fetch("/api/admin/ai-control").then(response => response.json()).then(setData);
  useEffect(() => { void load(); }, []);
  async function patch(body: Record<string, unknown>) { setSaving(true); await fetch("/api/admin/ai-control", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); await load(); setSaving(false); }
  if (!data) return <div className="rounded-2xl border border-white/10 p-5 text-sm text-slate-500">Loading AI controls…</div>;
  const agentOn = data.settings.agent_ai_auto_approve_enabled !== "0";
  const customerOn = data.settings.customer_ai_enabled !== "0";
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[['Provider', data.provider.ready ? 'Online' : 'Offline'], ['24h requests', data.usage.requests], ['Tokens', data.usage.tokens], ['Est. cost', `$${Number(data.usage.cost).toFixed(4)}`], ['Avg speed', `${data.usage.averageLatency}ms`]].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-white/10 bg-slate-950 p-3"><p className="text-[10px] text-slate-500">{label}</p><p className="mt-1 font-black text-white">{value}</p></div>)}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-4">
          <h3 className="font-black text-white">Safety & Cost Controls</h3>
          <div className="mt-4 space-y-3 text-sm">
            <label className="flex items-center justify-between text-slate-300"><span>Free-agent AI auto approval</span><input type="checkbox" checked={agentOn} disabled={saving} onChange={event => void patch({ agentAutoApprove: event.target.checked })} /></label>
            <label className="flex items-center justify-between text-slate-300"><span>Customer AI chat</span><input type="checkbox" checked={customerOn} disabled={saving} onChange={event => void patch({ customerAi: event.target.checked })} /></label>
            <label className="block text-slate-300">Minimum screening score<input type="number" min="0" max="100" defaultValue={data.settings.agent_ai_min_score ?? "70"} onBlur={event => void patch({ minScore: event.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-white" /></label>
            <label className="block text-slate-300">Daily AI request limit<input type="number" min="10" max="5000" defaultValue={data.settings.ai_daily_request_limit ?? "500"} onBlur={event => void patch({ dailyLimit: event.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-white" /></label>
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-4">
          <div className="flex items-center justify-between"><h3 className="font-black text-white">Human Escalation Inbox</h3><span className="text-xs text-amber-300">{data.escalations.filter(item => item.status === 'open').length} open</span></div>
          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">{data.escalations.length ? data.escalations.map(item => <div key={item.id} className="rounded-xl border border-white/10 p-3"><p className="text-xs text-slate-300">{item.summary_redacted}</p><div className="mt-2 flex items-center justify-between"><span className="text-[10px] text-slate-600">{new Date(item.created_at).toLocaleString('en-GH')}</span>{item.status === 'open' && <button onClick={() => void patch({ action: 'resolve_escalation', id: item.id })} className="text-xs font-bold text-emerald-400">Resolve</button>}</div></div>) : <p className="text-sm text-slate-600">No escalations yet.</p>}</div>
        </div>
      </div>
      <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-4"><h3 className="font-black text-white">Redacted Conversation & Audit History</h3><div className="mt-3 max-h-72 space-y-2 overflow-y-auto">{data.activity.map(item => <div key={item.id} className="flex gap-3 rounded-lg border border-white/5 p-2 text-xs"><span className={`shrink-0 font-bold ${item.status === 'error' ? 'text-red-400' : item.status === 'escalated' ? 'text-amber-400' : 'text-blue-400'}`}>{item.scope}</span><span className="line-clamp-2 flex-1 text-slate-400">{item.content_redacted}</span><span className="shrink-0 text-slate-700">{new Date(item.created_at).toLocaleTimeString('en-GH')}</span></div>)}</div></div>
    </div>
  );
}
