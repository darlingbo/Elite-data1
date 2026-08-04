"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { AiBusinessReport } from "./SettingsView";
import AiControlPanel from "./AiControlPanel";

type ChatMessage = { role: "user" | "assistant"; content: string };

const WELCOME: ChatMessage = {
  role: "assistant",
  content: "Hello! I’m your EliteData AI assistant. Ask me about business performance, agents, voucher stock, marketing, customer replies, risks, or what you should focus on today.",
};

const SUGGESTIONS = [
  "How is my business performing?",
  "What should I focus on today?",
  "Check my voucher stock",
  "Give me a marketing idea",
];

export default function AiHubView() {
  const [toast, setToast] = useState("");
  const [toastOk, setToastOk] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const conversationEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = window.sessionStorage.getItem("elite-admin-ai-chat");
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as ChatMessage[];
      if (Array.isArray(parsed) && parsed.length) setMessages(parsed.slice(-20));
    } catch { }
  }, []);

  useEffect(() => {
    window.sessionStorage.setItem("elite-admin-ai-chat", JSON.stringify(messages.slice(-20)));
    conversationEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  function showToast(message: string, ok = true) {
    setToast(message);
    setToastOk(ok);
    window.setTimeout(() => setToast(""), 3500);
  }

  async function sendMessage(event?: FormEvent, suggested?: string) {
    event?.preventDefault();
    const content = (suggested ?? input).trim();
    if (!content || sending) return;
    const nextMessages = [...messages, { role: "user" as const, content }].slice(-12);
    setMessages(nextMessages);
    setInput("");
    setSending(true);
    try {
      const transcript = nextMessages.map(message => `${message.role === "user" ? "Admin" : "Assistant"}: ${message.content}`).join("\n\n").slice(-7_500);
      const response = await fetch("/api/admin/ai-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "assistant_chat", prompt: transcript }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "AI could not answer");
      setMessages(current => [...current, { role: "assistant" as const, content: String(result.report) }].slice(-20));
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI could not answer";
      setMessages(current => [...current, { role: "assistant" as const, content: `Sorry, I could not answer right now. ${message}` }].slice(-20));
    } finally {
      setSending(false);
    }
  }

  function clearChat() {
    setMessages([WELCOME]);
    window.sessionStorage.removeItem("elite-admin-ai-chat");
  }

  return (
    <div className="admin-section mx-auto max-w-5xl space-y-5">
      <div className="overflow-hidden rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-950/50 via-slate-950 to-blue-950/40">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 text-2xl shadow-lg shadow-violet-950/40">✦</div>
            <div>
              <div className="flex items-center gap-2"><h1 className="text-xl font-black text-white sm:text-2xl">EliteData AI</h1><span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-black text-emerald-300">ONLINE</span></div>
              <p className="mt-1 text-sm text-slate-400">Your conversational, read-only business assistant</p>
            </div>
          </div>
          <button onClick={clearChat} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-slate-400 hover:bg-white/5 hover:text-white">New chat</button>
        </div>

        <div className="h-[430px] space-y-4 overflow-y-auto p-4 sm:p-6">
          {messages.map((message, index) => <div key={`${message.role}-${index}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "rounded-br-md bg-blue-600 text-white" : "rounded-bl-md border border-white/10 bg-slate-900/90 text-slate-200"}`}>{message.content}</div></div>)}
          {sending && <div className="flex justify-start"><div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-white/10 bg-slate-900/90 px-4 py-4">{[0,1,2].map(dot => <span key={dot} className="h-2 w-2 animate-pulse rounded-full bg-violet-400" style={{ animationDelay: `${dot * 160}ms` }} />)}</div></div>}
          <div ref={conversationEnd} />
        </div>

        {messages.length <= 1 && <div className="flex flex-wrap gap-2 px-4 pb-3 sm:px-6">{SUGGESTIONS.map(suggestion => <button key={suggestion} onClick={() => void sendMessage(undefined, suggestion)} className="rounded-full border border-blue-500/20 bg-blue-500/5 px-3 py-1.5 text-xs font-semibold text-blue-300 hover:bg-blue-500/10">{suggestion}</button>)}</div>}

        <form onSubmit={event => void sendMessage(event)} className="flex gap-2 border-t border-white/10 bg-black/20 p-3 sm:p-4">
          <textarea value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} rows={1} maxLength={1500} placeholder="Message EliteData AI…" className="min-h-12 flex-1 resize-none rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-500" />
          <button type="submit" disabled={sending || !input.trim()} className="h-12 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-5 text-sm font-black text-white disabled:opacity-40">Send</button>
        </form>
        <p className="px-4 pb-3 text-center text-[10px] text-slate-600">AI can advise and draft. It cannot approve orders, retry delivery, refund, or change money.</p>
      </div>

      <div><h2 className="mb-3 text-sm font-black uppercase tracking-wider text-slate-400">Specialist AI Tools</h2><AiBusinessReport showToast={showToast} /></div>
      <div><h2 className="mb-3 text-sm font-black uppercase tracking-wider text-slate-400">AI Control Center</h2><AiControlPanel /></div>
      {toast && <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-2xl border px-5 py-3 text-sm font-bold shadow-xl md:bottom-6" style={{ background: toastOk ? "#14532d" : "#7f1d1d", color: toastOk ? "#4ade80" : "#f87171", borderColor: toastOk ? "#166534" : "#991b1b" }}>{toast}</div>}
    </div>
  );
}
