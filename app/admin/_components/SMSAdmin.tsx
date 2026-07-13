"use client";
import { useState, useEffect, useMemo, useCallback } from "react";

interface Agent {
  id: string; name: string; email: string; phone: string;
  business_name: string; referral_code: string; status: string;
  agent_type?: string; commission_balance: number; wallet_balance?: number;
  total_sales: number; total_revenue: number; created_at: string;
}
interface SmsLog {
  id: string; audience: string; recipient_count: number; message: string;
  sent_count: number; failed_count: number; status: string; created_at: string;
}
interface Scheduled {
  id: string; audience: string; phones: string[]; message: string;
  send_at: string; status: string; created_at: string;
}

const BG = "#0b1120", CARD = "#111827", BORDER = "#1f2937";

const DEFAULT_TEMPLATES = [
  { id: "t1", label: "Low Balance Alert",   text: "Hi {name}, your Elite Data wallet is low. Top up now to keep selling! Visit your agent dashboard." },
  { id: "t2", label: "New Bundle",          text: "Hi {name}, new data bundles are live on Elite Data! Log in to see the latest prices and start selling." },
  { id: "t3", label: "Payment Received",    text: "Hi {name}, your wallet has been topped up on Elite Data. Your new balance is ready — start selling!" },
  { id: "t4", label: "Promotion",           text: "Hi {name}, exciting offers this week on Elite Data! Log in to your agent dashboard and take advantage now." },
  { id: "t5", label: "System Update",       text: "Hi {name}, Elite Data has been improved! New features are live. Log in to your dashboard to explore." },
  { id: "t6", label: "Order Confirmed",     text: "Hi {name}, your data bundle order has been confirmed and delivered. Thank you for using Elite Data!" },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} className="relative inline-flex items-center h-6 rounded-full w-11 transition-colors shrink-0"
      style={{ background: checked ? "#16a34a" : "#374151" }}>
      <span className="inline-block w-5 h-5 transform rounded-full bg-white shadow transition-transform"
        style={{ transform: checked ? "translateX(22px)" : "translateX(2px)" }} />
    </button>
  );
}

export default function SMSAdmin({ agents }: { agents: Agent[] }) {
  const [activeTab, setActiveTab] = useState<"compose" | "templates" | "reports" | "schedule">("compose");
  const [mode, setMode] = useState<"bulk" | "individual">("bulk");

  // Bulk
  const [audience, setAudience] = useState<"all" | "custom_price" | "commission" | "selected" | "customers">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMsg, setBulkMsg] = useState("");
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ ok: boolean; text: string; warn?: string } | null>(null);
  const [customerPhones, setCustomerPhones] = useState<string[] | null>(null);
  const [customersLoading, setCustomersLoading] = useState(false);

  // Individual
  const [testPhone, setTestPhone] = useState("");
  const [testMsg, setTestMsg] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string; warn?: string } | null>(null);

  // Templates
  const [templates, setTemplates] = useState(DEFAULT_TEMPLATES);
  const [newTplLabel, setNewTplLabel] = useState("");
  const [newTplText, setNewTplText] = useState("");

  // Reports
  const [logs, setLogs] = useState<SmsLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Schedule
  const [scheduled, setScheduled] = useState<Scheduled[]>([]);
  const [schedLoading, setSchedLoading] = useState(false);
  const [schedMsg, setSchedMsg] = useState("");
  const [schedDate, setSchedDate] = useState("");
  const [schedTime, setSchedTime] = useState("");
  const [schedAudience, setSchedAudience] = useState<"all" | "customers">("all");
  const [schedText, setSchedText] = useState("");
  const [schedSaving, setSchedSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagResult, setDiagResult] = useState<{
    configured: boolean; username?: string; isSandbox?: boolean;
    senderId?: string | null; balance?: string | null; error?: string;
  } | null>(null);

  const approvedAgents = useMemo(() => agents.filter(a => a.status === "approved"), [agents]);

  async function runDiagnose() {
    setDiagnosing(true);
    setDiagResult(null);
    try {
      const r = await fetch("/api/admin/sms/check").then(r => r.json());
      setDiagResult(r);
    } catch (e) {
      setDiagResult({ configured: false, error: String(e) });
    } finally {
      setDiagnosing(false);
    }
  }

  useEffect(() => {
    if (audience !== "customers" || customerPhones !== null || customersLoading) return;
    setCustomersLoading(true);
    fetch("/api/admin/sms/customers").then(r => r.json()).then(d => setCustomerPhones(d.phones ?? [])).finally(() => setCustomersLoading(false));
  }, [audience, customerPhones, customersLoading]);

  const loadReports = useCallback(async () => {
    setLogsLoading(true);
    const r = await fetch("/api/admin/sms/reports").then(r => r.json());
    setLogs(r.logs ?? []);
    setLogsLoading(false);
  }, []);

  const loadScheduled = useCallback(async () => {
    setSchedLoading(true);
    const r = await fetch("/api/admin/sms/schedule").then(r => r.json());
    setScheduled(r.scheduled ?? []);
    setSchedLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab === "reports") loadReports();
    if (activeTab === "schedule") loadScheduled();
  }, [activeTab, loadReports, loadScheduled]);

  const recipients = useMemo(() => {
    if (audience === "all") return approvedAgents;
    if (audience === "custom_price") return approvedAgents.filter(a => a.agent_type === "custom_price");
    if (audience === "commission") return approvedAgents.filter(a => a.agent_type !== "custom_price");
    if (audience === "customers") return [];
    return approvedAgents.filter(a => selected.has(a.id));
  }, [audience, approvedAgents, selected]);

  const sendPhones = useMemo(() => {
    if (audience === "customers") return customerPhones ?? [];
    return recipients.map(a => a.phone).filter(Boolean);
  }, [audience, recipients, customerPhones]);

  const recipientCount = audience === "customers" ? (customerPhones?.length ?? 0) : recipients.length;
  const currentMsg = mode === "bulk" ? bulkMsg : testMsg;
  const charCount = currentMsg.length;
  const smsCount = Math.ceil(charCount / 160) || 1;

  function applyTemplate(text: string) {
    if (mode === "bulk") setBulkMsg(text);
    else setTestMsg(text);
  }

  async function logSend(opts: { audience: string; recipientCount: number; message: string; sentCount: number; failedCount: number; status: string }) {
    await fetch("/api/admin/sms/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(opts) }).catch(() => {});
  }

  async function sendBulk() {
    if (!bulkMsg.trim() || sendPhones.length === 0) return;
    setBulkSending(true); setBulkResult(null);
    try {
      const res = await fetch("/api/admin/sms/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phones: sendPhones, message: bulkMsg }) });
      const d = await res.json();
      const ok = res.ok && !d.error;
      const label = audience === "customers" ? "customers" : "agents";
      const warn = d.isSandbox
        ? "⚠️ AT_USERNAME is set to 'sandbox' — messages never deliver to real phones. Change it to your live Africa's Talking username."
        : d.failReasons?.length
        ? `⚠️ Some failed: ${d.failReasons.join(", ")}. Check your AT account balance and sender ID.`
        : undefined;
      setBulkResult({ ok, text: d.error ?? `✓ Sent to ${d.sent ?? sendPhones.length} ${label} successfully!`, warn });
      await logSend({ audience, recipientCount: sendPhones.length, message: bulkMsg, sentCount: d.sent ?? 0, failedCount: d.failed ?? 0, status: ok ? "success" : "failed" });
    } catch (e) {
      setBulkResult({ ok: false, text: String(e) });
    } finally { setBulkSending(false); }
  }

  async function sendTest() {
    const phone = testPhone.trim().replace(/\s/g, "");
    if (!phone || !testMsg.trim()) return;
    setTestSending(true); setTestResult(null);
    try {
      const res = await fetch("/api/admin/sms/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phones: [phone], message: testMsg }) });
      const d = await res.json();
      const ok = res.ok && !d.error;
      const warn = d.isSandbox
        ? "⚠️ AT_USERNAME is 'sandbox' — this never delivers to a real phone. Use your live AT username."
        : d.failReasons?.length
        ? `⚠️ AT status: ${d.failReasons.join(", ")}. Check your AT balance / sender ID.`
        : undefined;
      setTestResult({ ok, text: d.error ?? `✓ Test SMS sent to ${phone}!`, warn });
      await logSend({ audience: "individual", recipientCount: 1, message: testMsg, sentCount: ok ? 1 : 0, failedCount: ok ? 0 : 1, status: ok ? "success" : "failed" });
    } catch (e) {
      setTestResult({ ok: false, text: String(e) });
    } finally { setTestSending(false); }
  }

  function saveTemplate() {
    if (!newTplLabel.trim() || !newTplText.trim()) return;
    setTemplates(t => [...t, { id: `c${Date.now()}`, label: newTplLabel.trim(), text: newTplText.trim() }]);
    setNewTplLabel(""); setNewTplText("");
  }

  async function scheduleMsg() {
    if (!schedText.trim() || !schedDate || !schedTime) return;
    setSchedSaving(true);
    const sendAt = new Date(`${schedDate}T${schedTime}`).toISOString();
    const phones = schedAudience === "all" ? approvedAgents.map(a => a.phone).filter(Boolean) : (customerPhones ?? []);
    const r = await fetch("/api/admin/sms/schedule", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audience: schedAudience, phones, message: schedText, sendAt }) }).then(r => r.json());
    if (r.success) { setSchedMsg("✓ Scheduled!"); setSchedText(""); setSchedDate(""); setSchedTime(""); loadScheduled(); }
    else setSchedMsg(r.error ?? "Failed");
    setSchedSaving(false);
    setTimeout(() => setSchedMsg(""), 3000);
  }

  async function deleteScheduled(id: string) {
    await fetch("/api/admin/sms/schedule", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    loadScheduled();
  }

  async function processScheduled() {
    setProcessing(true);
    const r = await fetch("/api/admin/sms/schedule", { method: "PATCH" }).then(r => r.json());
    setSchedMsg(`✓ Processed ${r.processed ?? 0} scheduled message(s)`);
    loadScheduled();
    setProcessing(false);
    setTimeout(() => setSchedMsg(""), 4000);
  }

  const tabs = [
    { id: "compose" as const,   label: "✉️ Compose" },
    { id: "templates" as const, label: "📋 Templates" },
    { id: "schedule" as const,  label: "🕐 Schedule" },
    { id: "reports" as const,   label: "📊 Reports" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-black text-white">SMS Broadcast</h1>
          <p className="text-sm text-slate-500">Send messages to agents and customers via Africa&apos;s Talking</p>
        </div>
        {/* Quick Send All button */}
        <button onClick={() => { setMode("bulk"); setAudience("all"); setActiveTab("compose"); }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black text-white"
          style={{ background: "linear-gradient(90deg,#3b82f6,#8b5cf6)" }}>
          📢 Send to All Agents
        </button>
      </div>

      {/* ── Diagnose panel ── */}
      <div className="rounded-2xl border p-4" style={{ background: CARD, borderColor: BORDER }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="font-bold text-white text-sm">Account Diagnostics</p>
            <p className="text-xs text-slate-500">Check your Africa&apos;s Talking credentials and balance</p>
          </div>
          <button onClick={runDiagnose} disabled={diagnosing}
            className="px-4 py-2 rounded-xl text-sm font-bold border text-blue-400 disabled:opacity-50"
            style={{ borderColor: BORDER, background: BG }}>
            {diagnosing ? "Checking…" : "🔍 Run Diagnose"}
          </button>
        </div>

        {diagResult && (
          <div className="mt-4 space-y-2">
            {!diagResult.configured && (
              <div className="p-3 rounded-xl" style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)" }}>
                <p className="text-sm font-bold text-red-400">❌ {diagResult.error as string}</p>
                <p className="text-xs text-slate-400 mt-1">Add AT_API_KEY and AT_USERNAME in Vercel → Settings → Environment Variables, then redeploy.</p>
              </div>
            )}

            {diagResult.configured && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl p-3" style={{ background: BG }}>
                  <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Username</p>
                  <p className="text-sm font-black" style={{ color: diagResult.isSandbox ? "#f87171" : "#4ade80" }}>
                    {diagResult.username as string}
                    {diagResult.isSandbox && <span className="text-xs text-red-400 ml-1">(SANDBOX — won&apos;t deliver!)</span>}
                  </p>
                </div>
                <div className="rounded-xl p-3" style={{ background: BG }}>
                  <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Balance</p>
                  <p className="text-sm font-black" style={{ color: diagResult.balance ? "#4ade80" : "#f87171" }}>
                    {diagResult.balance as string ?? "Could not fetch — check API key"}
                  </p>
                </div>
                <div className="rounded-xl p-3" style={{ background: BG }}>
                  <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Sender ID</p>
                  <p className="text-sm font-black text-white">
                    {diagResult.senderId ? diagResult.senderId as string : <span className="text-slate-500">None set (AT default)</span>}
                  </p>
                </div>
              </div>
            )}

            {diagResult.configured && diagResult.isSandbox && (
              <div className="p-3 rounded-xl" style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)" }}>
                <p className="text-sm font-bold text-red-400">❌ You are in SANDBOX mode</p>
                <p className="text-xs text-slate-400 mt-1">Change AT_USERNAME in Vercel env vars to your real Africa&apos;s Talking username, then redeploy.</p>
              </div>
            )}

            {diagResult.configured && !diagResult.isSandbox && diagResult.balance && (
              <div className="p-3 rounded-xl" style={{ background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)" }}>
                <p className="text-sm font-bold text-green-400">✅ Account looks good</p>
                <p className="text-xs text-slate-400 mt-1">
                  If SMS still doesn&apos;t deliver: make sure your Sender ID (<strong className="text-white">{diagResult.senderId as string || "AFRICASTALKING"}</strong>) is registered with MTN Ghana / Telecel. Unregistered sender IDs get silently dropped by Ghana networks. Remove AT_SENDER_ID from env vars to use the default, or register it at africastalking.com.
                </p>
              </div>
            )}

            {diagResult.error && diagResult.configured && (
              <div className="p-3 rounded-xl" style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)" }}>
                <p className="text-sm font-bold text-red-400">❌ {diagResult.error as string}</p>
                <p className="text-xs text-slate-400 mt-1">Your AT_API_KEY may be wrong or expired.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className="px-4 py-2 rounded-xl text-sm font-bold border transition-all"
            style={activeTab === t.id ? { background: "#1e3a5f", color: "#60a5fa", borderColor: "#1e3a5f" } : { background: "transparent", color: "#6b7280", borderColor: BORDER }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── COMPOSE TAB ── */}
      {activeTab === "compose" && (
        <div className="space-y-4">
          {/* Mode toggle */}
          <div className="flex gap-2">
            {([["bulk", "📢 Bulk SMS"], ["individual", "🧪 Test / Individual"]] as const).map(([m, label]) => (
              <button key={m} onClick={() => setMode(m)}
                className="px-5 py-2.5 rounded-xl text-sm font-bold border transition-all"
                style={mode === m ? { background: "linear-gradient(90deg,#3b82f6,#8b5cf6)", color: "white", borderColor: "transparent" } : { background: CARD, color: "#94a3b8", borderColor: BORDER }}>
                {label}
              </button>
            ))}
          </div>

          {/* Quick template chips */}
          <div className="rounded-2xl border p-4" style={{ background: CARD, borderColor: BORDER }}>
            <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-3">Quick Templates</p>
            <div className="flex flex-wrap gap-2">
              {templates.map(t => (
                <button key={t.id} onClick={() => applyTemplate(t.text)}
                  className="px-3 py-1.5 rounded-lg border text-xs font-semibold text-blue-400 hover:bg-blue-900/20 transition-all"
                  style={{ background: BG, borderColor: BORDER }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {mode === "bulk" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Message compose */}
              <div className="lg:col-span-2 space-y-4">
                <div className="rounded-2xl border p-5" style={{ background: CARD, borderColor: BORDER }}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-bold text-white">Compose Message</p>
                    <span className="text-xs font-semibold" style={{ color: charCount > 160 ? "#f87171" : "#6b7280" }}>
                      {charCount} chars · {smsCount} SMS
                    </span>
                  </div>
                  <textarea value={bulkMsg} onChange={e => setBulkMsg(e.target.value)} rows={6} placeholder={`Type your message… Use {name} for personalisation\nE.g. Hi {name}, your Elite Data order is confirmed!`}
                    className="w-full rounded-xl px-4 py-3 text-sm text-white border focus:outline-none focus:border-blue-500 resize-y"
                    style={{ background: BG, borderColor: BORDER, fontFamily: "inherit" }} />
                  <p className="text-xs text-slate-600 mt-2">Tip: <code className="text-slate-400 bg-slate-800 px-1 rounded">{"{name}"}</code> is replaced with each recipient&apos;s first name.</p>
                </div>

                {/* Preview */}
                {bulkMsg && (
                  <div className="rounded-2xl border p-4" style={{ background: CARD, borderColor: BORDER }}>
                    <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-2">Preview</p>
                    <div className="rounded-xl p-3" style={{ background: BG }}>
                      <p className="text-sm text-slate-200 leading-relaxed">
                        {bulkMsg.replace(/\{name\}/g, recipients[0]?.name?.split(" ")[0] ?? audience === "customers" ? "Customer" : "Agent")}
                      </p>
                    </div>
                  </div>
                )}

                {/* Send */}
                <div className="rounded-2xl border p-5" style={{ background: CARD, borderColor: BORDER }}>
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <p className="font-bold text-white">
                        Sending to <span className="text-blue-400">{recipientCount} {audience === "customers" ? "customer" : "agent"}{recipientCount !== 1 ? "s" : ""}</span>
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">~{recipientCount * smsCount} SMS credit{recipientCount * smsCount !== 1 ? "s" : ""}</p>
                    </div>
                    <button onClick={sendBulk} disabled={bulkSending || !bulkMsg.trim() || sendPhones.length === 0 || customersLoading}
                      className="px-6 py-3 rounded-xl text-sm font-black text-white disabled:opacity-50 transition-all"
                      style={{ background: "linear-gradient(90deg,#3b82f6,#8b5cf6)" }}>
                      {bulkSending ? "Sending…" : customersLoading ? "Loading…" : `Send to ${recipientCount} ${audience === "customers" ? "Customer" : "Agent"}${recipientCount !== 1 ? "s" : ""} →`}
                    </button>
                  </div>
                  {bulkResult && (
                    <div className="mt-3 space-y-2">
                      <div className="p-3 rounded-xl" style={{ background: bulkResult.ok ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)", border: `1px solid ${bulkResult.ok ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)"}` }}>
                        <p className="text-sm font-bold" style={{ color: bulkResult.ok ? "#4ade80" : "#f87171" }}>{bulkResult.text}</p>
                      </div>
                      {bulkResult.warn && (
                        <div className="p-3 rounded-xl" style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)" }}>
                          <p className="text-sm font-bold text-amber-400">{bulkResult.warn}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Recipients */}
              <div className="rounded-2xl border p-5" style={{ background: CARD, borderColor: BORDER }}>
                <p className="font-bold text-white mb-4">Recipients</p>
                {/* One-click shortcuts */}
                <div className="space-y-2 mb-4">
                  <button onClick={() => { setAudience("customers"); if (!customerPhones) { setCustomersLoading(true); fetch("/api/admin/sms/customers").then(r=>r.json()).then(d=>{setCustomerPhones(d.phones??[]); setCustomersLoading(false);}); } }}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border font-semibold text-sm transition-all"
                    style={audience === "customers" ? { background: "rgba(59,130,246,0.15)", color: "#60a5fa", borderColor: "rgba(59,130,246,0.4)" } : { background: BG, color: "#6b7280", borderColor: BORDER }}>
                    <span>👥 All Customers</span>
                    <span className="text-xs">{customersLoading ? "…" : customerPhones?.length ?? "load"}</span>
                  </button>
                </div>
                <div className="space-y-2">
                  {([
                    ["all", `All Agents (${approvedAgents.length})`],
                    ["custom_price", `Price Mode (${approvedAgents.filter(a => a.agent_type === "custom_price").length})`],
                    ["commission", `Commission (${approvedAgents.filter(a => a.agent_type !== "custom_price").length})`],
                    ["selected", `Select Manually (${selected.size})`],
                  ] as const).map(([val, label]) => (
                    <label key={val} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer transition-all"
                      style={audience === val ? { background: "rgba(59,130,246,0.1)", borderColor: "rgba(59,130,246,0.4)" } : { background: BG, borderColor: BORDER }}>
                      <input type="radio" checked={audience === val} onChange={() => setAudience(val)} className="accent-blue-500" />
                      <span className="text-sm font-semibold" style={{ color: audience === val ? "#60a5fa" : "#6b7280" }}>{label}</span>
                    </label>
                  ))}
                </div>

                {audience === "selected" && (
                  <div className="mt-3">
                    <div className="flex gap-2 mb-2">
                      <button onClick={() => setSelected(new Set(approvedAgents.map(a => a.id)))} className="flex-1 py-1.5 rounded-lg text-xs font-bold text-blue-400 border" style={{ borderColor: BORDER }}>All</button>
                      <button onClick={() => setSelected(new Set())} className="flex-1 py-1.5 rounded-lg text-xs font-bold text-red-400 border" style={{ borderColor: BORDER }}>Clear</button>
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {approvedAgents.map(a => (
                        <label key={a.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-white/5">
                          <input type="checkbox" checked={selected.has(a.id)} onChange={() => setSelected(p => { const n = new Set(p); n.has(a.id) ? n.delete(a.id) : n.add(a.id); return n; })} className="accent-blue-500" />
                          <div>
                            <p className="text-xs font-bold text-white">{a.name}</p>
                            <p className="text-[10px] text-slate-500">{a.phone}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {mode === "individual" && (
            <div className="max-w-lg">
              <div className="rounded-2xl border p-6 space-y-4" style={{ background: CARD, borderColor: BORDER }}>
                <p className="font-bold text-white text-base">🧪 Individual / Test SMS</p>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Recipient Phone Number</label>
                  <input type="tel" value={testPhone} onChange={e => setTestPhone(e.target.value)} placeholder="0241234567 or +233241234567"
                    className="w-full rounded-xl px-4 py-3 text-sm text-white border focus:outline-none focus:border-blue-500"
                    style={{ background: BG, borderColor: BORDER }} />
                  <p className="text-xs text-slate-600 mt-1">Ghana: 024XXXXXXX · International: 233241XXXXXX</p>
                </div>
                <div>
                  <div className="flex justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Message</label>
                    <span className="text-xs font-semibold" style={{ color: charCount > 160 ? "#f87171" : "#6b7280" }}>{charCount} chars · {smsCount} SMS</span>
                  </div>
                  <textarea value={testMsg} onChange={e => setTestMsg(e.target.value)} rows={5} placeholder="Type your test message…"
                    className="w-full rounded-xl px-4 py-3 text-sm text-white border focus:outline-none focus:border-blue-500 resize-y"
                    style={{ background: BG, borderColor: BORDER, fontFamily: "inherit" }} />
                </div>
                <button onClick={sendTest} disabled={testSending || !testPhone.trim() || !testMsg.trim()}
                  className="w-full py-3 rounded-xl text-sm font-black text-white disabled:opacity-50"
                  style={{ background: "linear-gradient(90deg,#3b82f6,#8b5cf6)" }}>
                  {testSending ? "Sending…" : "Send Test SMS"}
                </button>
                {testResult && (
                  <div className="space-y-2">
                    <div className="p-3 rounded-xl" style={{ background: testResult.ok ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)", border: `1px solid ${testResult.ok ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)"}` }}>
                      <p className="text-sm font-bold" style={{ color: testResult.ok ? "#4ade80" : "#f87171" }}>{testResult.text}</p>
                    </div>
                    {testResult.warn && (
                      <div className="p-3 rounded-xl" style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)" }}>
                        <p className="text-sm font-bold text-amber-400">{testResult.warn}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TEMPLATES TAB ── */}
      {activeTab === "templates" && (
        <div className="space-y-4">
          {/* Add template */}
          <div className="rounded-2xl border p-5" style={{ background: CARD, borderColor: BORDER }}>
            <h2 className="font-bold text-white mb-4">Create New Template</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Template Name</label>
                <input value={newTplLabel} onChange={e => setNewTplLabel(e.target.value)} placeholder="e.g. Weekly Promo"
                  className="w-full rounded-xl px-4 py-2.5 text-sm text-white border focus:outline-none focus:border-blue-500"
                  style={{ background: BG, borderColor: BORDER }} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Message <span className="text-slate-600 normal-case font-normal">— use {"{name}"} to personalise</span></label>
                <textarea value={newTplText} onChange={e => setNewTplText(e.target.value)} rows={4} placeholder="Hi {name}, …"
                  className="w-full rounded-xl px-4 py-3 text-sm text-white border focus:outline-none focus:border-blue-500 resize-y"
                  style={{ background: BG, borderColor: BORDER, fontFamily: "inherit" }} />
                <p className="text-xs text-slate-600 mt-1">{newTplText.length} chars · {Math.ceil(newTplText.length / 160) || 1} SMS</p>
              </div>
              <button onClick={saveTemplate} disabled={!newTplLabel.trim() || !newTplText.trim()}
                className="w-full py-3 rounded-xl text-sm font-black text-white disabled:opacity-50"
                style={{ background: "linear-gradient(90deg,#3b82f6,#8b5cf6)" }}>
                Save Template
              </button>
            </div>
          </div>

          {/* Template list */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {templates.map(t => (
              <div key={t.id} className="rounded-2xl border p-4" style={{ background: CARD, borderColor: BORDER }}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="font-bold text-white text-sm">{t.label}</p>
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => { setBulkMsg(t.text); setActiveTab("compose"); setMode("bulk"); }}
                      className="text-xs px-2.5 py-1 rounded-lg font-bold text-blue-400 border border-blue-900 hover:bg-blue-900/20">Use</button>
                    {!t.id.startsWith("t") && (
                      <button onClick={() => setTemplates(prev => prev.filter(x => x.id !== t.id))}
                        className="text-xs px-2.5 py-1 rounded-lg font-bold text-red-400 border border-red-900 hover:bg-red-900/20">Del</button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">{t.text}</p>
                <p className="text-[10px] text-slate-600 mt-2">{t.text.length} chars · {Math.ceil(t.text.length / 160)} SMS</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SCHEDULE TAB ── */}
      {activeTab === "schedule" && (
        <div className="space-y-4">
          <div className="rounded-2xl border p-5" style={{ background: CARD, borderColor: BORDER }}>
            <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
              <div>
                <h2 className="font-bold text-white">Schedule SMS</h2>
                <p className="text-xs text-slate-500">Set a future date and time — message fires automatically</p>
              </div>
              <button onClick={processScheduled} disabled={processing}
                className="text-xs px-3 py-2 rounded-xl font-bold border text-amber-400 border-amber-900 hover:bg-amber-900/20 disabled:opacity-50">
                {processing ? "Processing…" : "⚡ Process Due Now"}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Audience</label>
                <select value={schedAudience} onChange={e => setSchedAudience(e.target.value as "all" | "customers")}
                  className="w-full rounded-xl px-4 py-2.5 text-sm text-white border focus:outline-none focus:border-blue-500"
                  style={{ background: BG, borderColor: BORDER }}>
                  <option value="all">All Agents ({approvedAgents.length})</option>
                  <option value="customers">All Customers</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Date</label>
                <input type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)} min={new Date().toISOString().split("T")[0]}
                  className="w-full rounded-xl px-4 py-2.5 text-sm text-white border focus:outline-none focus:border-blue-500"
                  style={{ background: BG, borderColor: BORDER }} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Time (Ghana)</label>
                <input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)}
                  className="w-full rounded-xl px-4 py-2.5 text-sm text-white border focus:outline-none focus:border-blue-500"
                  style={{ background: BG, borderColor: BORDER }} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Message</label>
                <textarea value={schedText} onChange={e => setSchedText(e.target.value)} rows={4} placeholder="Hi {name}, …"
                  className="w-full rounded-xl px-4 py-3 text-sm text-white border focus:outline-none focus:border-blue-500 resize-y"
                  style={{ background: BG, borderColor: BORDER, fontFamily: "inherit" }} />
                <p className="text-xs text-slate-600 mt-1">{schedText.length} chars · {Math.ceil(schedText.length / 160) || 1} SMS</p>
              </div>
            </div>
            <button onClick={scheduleMsg} disabled={schedSaving || !schedText.trim() || !schedDate || !schedTime}
              className="w-full py-3 rounded-xl text-sm font-black text-white disabled:opacity-50"
              style={{ background: "linear-gradient(90deg,#3b82f6,#8b5cf6)" }}>
              {schedSaving ? "Scheduling…" : "Schedule Message"}
            </button>
            {schedMsg && <p className="text-sm font-bold text-green-400 mt-2">{schedMsg}</p>}
          </div>

          {/* Scheduled list */}
          <div className="rounded-2xl border overflow-hidden" style={{ background: CARD, borderColor: BORDER }}>
            <div className="px-5 py-3 border-b" style={{ borderColor: BORDER }}>
              <p className="font-bold text-white text-sm">Scheduled Messages</p>
            </div>
            {schedLoading ? (
              <div className="py-12 flex justify-center"><div className="w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : scheduled.length === 0 ? (
              <div className="py-12 text-center"><p className="text-4xl mb-2">🕐</p><p className="text-slate-500 text-sm font-semibold">No scheduled messages</p></div>
            ) : (
              <div className="divide-y" style={{ borderColor: BORDER }}>
                {scheduled.map(s => {
                  const statusColor = s.status === "pending" ? "#f59e0b" : s.status === "sent" ? "#4ade80" : "#f87171";
                  return (
                    <div key={s.id} className="px-5 py-4 flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: `${statusColor}20`, color: statusColor }}>{s.status}</span>
                          <span className="text-xs text-slate-500">{s.audience} · {s.phones?.length ?? 0} recipients</span>
                          <span className="text-xs text-slate-500">{new Date(s.send_at).toLocaleString("en-GH", { dateStyle: "medium", timeStyle: "short" })}</span>
                        </div>
                        <p className="text-sm text-slate-300 line-clamp-2">{s.message}</p>
                      </div>
                      {s.status === "pending" && (
                        <button onClick={() => deleteScheduled(s.id)} className="text-xs px-2.5 py-1.5 rounded-lg font-bold text-red-400 border border-red-900 hover:bg-red-900/20 shrink-0">Cancel</button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-xl border p-4" style={{ background: "#0e1928", borderColor: "#1e3050" }}>
            <p className="text-xs font-bold text-blue-400 mb-1">ℹ️ How scheduling works</p>
            <p className="text-xs text-slate-400 leading-relaxed">Messages are stored and fire when you click <strong className="text-white">Process Due Now</strong> or visit this page. For fully automatic sending, set up a cron job calling <code className="text-blue-300 bg-slate-800 px-1 rounded">/api/admin/sms/schedule</code> with PATCH method.</p>
          </div>
        </div>
      )}

      {/* ── REPORTS TAB ── */}
      {activeTab === "reports" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div><h2 className="font-bold text-white">Delivery Reports</h2><p className="text-xs text-slate-500">History of all SMS sends from this dashboard</p></div>
            <button onClick={loadReports} className="text-xs border px-3 py-1.5 rounded-lg text-slate-400 hover:text-white" style={{ borderColor: BORDER }}>↺ Refresh</button>
          </div>

          {/* Summary stats */}
          {logs.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Total Sends", value: logs.length },
                { label: "Total Recipients", value: logs.reduce((s, l) => s + l.recipient_count, 0).toLocaleString() },
                { label: "Successfully Sent", value: logs.reduce((s, l) => s + (l.sent_count ?? 0), 0).toLocaleString(), color: "#4ade80" },
                { label: "Failed", value: logs.reduce((s, l) => s + (l.failed_count ?? 0), 0).toLocaleString(), color: "#f87171" },
              ].map(s => (
                <div key={s.label} className="rounded-2xl border p-4" style={{ background: CARD, borderColor: BORDER }}>
                  <p className="text-xs text-slate-500 mb-1">{s.label}</p>
                  <p className="text-2xl font-black" style={{ color: s.color ?? "white" }}>{s.value}</p>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-2xl border overflow-hidden" style={{ background: CARD, borderColor: BORDER }}>
            {logsLoading ? (
              <div className="py-16 flex justify-center"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : logs.length === 0 ? (
              <div className="py-16 text-center"><p className="text-4xl mb-3">📊</p><p className="text-slate-500 font-semibold">No reports yet</p><p className="text-xs text-slate-600 mt-1">Reports appear here after you send your first SMS</p></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-slate-500 uppercase tracking-wider" style={{ background: BG, borderColor: BORDER }}>
                      {["Date", "Audience", "Recipients", "Sent", "Failed", "Status", "Message"].map(h => (
                        <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map(l => {
                      const statusStyle = l.status === "success" ? { bg: "rgba(74,222,128,0.15)", color: "#4ade80" } : { bg: "rgba(248,113,113,0.15)", color: "#f87171" };
                      return (
                        <tr key={l.id} className="border-b last:border-0 hover:bg-white/[0.02]" style={{ borderColor: BORDER }}>
                          <td className="px-4 py-3.5 text-xs text-slate-500 whitespace-nowrap">{new Date(l.created_at).toLocaleString("en-GH", { dateStyle: "short", timeStyle: "short" })}</td>
                          <td className="px-4 py-3.5 text-xs font-semibold text-white capitalize">{l.audience?.replace("_", " ")}</td>
                          <td className="px-4 py-3.5 font-bold text-white">{l.recipient_count}</td>
                          <td className="px-4 py-3.5 font-bold text-green-400">{l.sent_count ?? "—"}</td>
                          <td className="px-4 py-3.5 font-bold" style={{ color: (l.failed_count ?? 0) > 0 ? "#f87171" : "#6b7280" }}>{l.failed_count ?? "—"}</td>
                          <td className="px-4 py-3.5">
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: statusStyle.bg, color: statusStyle.color }}>{l.status}</span>
                          </td>
                          <td className="px-4 py-3.5 text-xs text-slate-400 max-w-xs truncate">{l.message}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* SQL setup note */}
          <div className="rounded-xl border p-4" style={{ background: "#0e1928", borderColor: "#1e3050" }}>
            <p className="text-xs font-semibold text-amber-400 mb-2">💡 Run this SQL once in Supabase if reports are empty:</p>
            <pre className="text-xs text-blue-300 font-mono whitespace-pre-wrap">{`CREATE TABLE IF NOT EXISTS sms_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  audience text, recipient_count int, message text,
  sent_count int DEFAULT 0, failed_count int DEFAULT 0,
  status text DEFAULT 'success', created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sms_scheduled (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  audience text, phones text[], message text,
  send_at timestamptz, status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);`}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
