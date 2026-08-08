"use client";

import { useState } from "react";
import { BG, CARD, BORDER, BORDER2 } from "./shared/constants";

const AI_TOOLS = [
  ["business_health", "Business Health"], ["pricing", "Pricing & Profit"], ["voucher_forecast", "Voucher Forecast"],
  ["agent_analysis", "Agent Analysis"], ["marketing", "Promotion Writer"], ["customer_reply", "Customer Reply"],
  ["twi_translation", "Twi Translator"], ["complaint_plan", "Complaint Helper"], ["daily_actions", "Daily Action Plan"],
  ["risk_review", "Risk Review"], ["campaign_calendar", "7-Day Campaign"], ["faq_builder", "FAQ Builder"],
] as const;

export function AiBusinessReport({ showToast }: { showToast: (msg: string, ok?: boolean) => void }) {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState("");
  const [mode, setMode] = useState<(typeof AI_TOOLS)[number][0]>("business_health");
  const [prompt, setPrompt] = useState("");
  const [summary, setSummary] = useState<{ orders: number; revenue: number; profit: number; voucherStock: { BECE: number; WASSCE: number } } | null>(null);

  async function generateReport() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/ai-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, prompt }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not generate report");
      setReport(result.report);
      setSummary(result.summary);
      showToast(`${AI_TOOLS.find(tool => tool[0] === mode)?.[1] ?? "AI tool"} completed`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not generate report", false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border p-5" style={{ background: CARD, borderColor: BORDER }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-white">AI Hub — Read Only</h2>
          <p className="text-xs text-slate-500 mt-1">Analyze, forecast, translate and draft content. AI cannot approve, retry, refund, deliver, edit orders, or change money.</p>
        </div>
        <button onClick={generateReport} disabled={loading} className="shrink-0 text-xs px-3 py-2 rounded-lg font-bold text-white disabled:opacity-60" style={{ background: "linear-gradient(90deg,#3b82f6,#8b5cf6)" }}>
          {loading ? "Working…" : "Run AI Tool"}
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4">
        {AI_TOOLS.map(tool => (
          <button key={tool[0]} onClick={() => { setMode(tool[0]); setReport(""); }} className="rounded-lg border px-3 py-2 text-xs font-bold text-left transition-colors" style={{ background: mode === tool[0] ? "#172554" : BG, borderColor: mode === tool[0] ? "#3b82f6" : BORDER2, color: mode === tool[0] ? "#93c5fd" : "#94a3b8" }}>
            {tool[1]}
          </button>
        ))}
      </div>
      <textarea value={prompt} onChange={event => setPrompt(event.target.value)} rows={3} maxLength={1500} placeholder={mode === "twi_translation" ? "Enter the text to translate…" : mode === "customer_reply" || mode === "complaint_plan" ? "Describe the customer message or complaint…" : mode === "marketing" || mode === "faq_builder" ? "Optional: enter the product, offer, or topic…" : "Optional: add a specific question or instruction…"} className="mt-3 w-full rounded-xl px-3 py-3 text-sm text-white border focus:outline-none focus:border-blue-500" style={{ background: BG, borderColor: BORDER }} />
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
          <div className="rounded-lg p-2" style={{ background: BG }}><p className="text-[10px] text-slate-500">30-day orders</p><p className="font-black text-white">{summary.orders}</p></div>
          <div className="rounded-lg p-2" style={{ background: BG }}><p className="text-[10px] text-slate-500">Revenue</p><p className="font-black text-white">GH₵{summary.revenue.toFixed(2)}</p></div>
          <div className="rounded-lg p-2" style={{ background: BG }}><p className="text-[10px] text-slate-500">Profit</p><p className="font-black text-green-400">GH₵{summary.profit.toFixed(2)}</p></div>
          <div className="rounded-lg p-2" style={{ background: BG }}><p className="text-[10px] text-slate-500">Voucher stock</p><p className="font-black text-white">B {summary.voucherStock.BECE} · W {summary.voucherStock.WASSCE}</p></div>
        </div>
      )}
      {report && <div className="mt-4 rounded-xl border p-4 text-sm text-slate-300 whitespace-pre-wrap leading-relaxed" style={{ background: BG, borderColor: BORDER2 }}>{report}</div>}
    </div>
  );
}
