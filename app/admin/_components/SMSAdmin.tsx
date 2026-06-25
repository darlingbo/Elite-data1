"use client";
import { useState, useEffect, useMemo } from "react";

interface Agent {
  id: string; name: string; email: string; phone: string; whatsapp?: string;
  business_name: string; referral_code: string; status: string; agent_type?: string;
  commission_balance: number; wallet_balance?: number; total_sales: number;
  total_revenue: number; created_at: string;
}

const BG = "#0f172a"; const CARD = "#1e293b"; const BORDER = "#334155";

const TEMPLATES = [
  { label: "Low Balance Alert", text: "Hi {name}, your Elite Data wallet balance is low. Top up now to keep selling data bundles. Visit your dashboard at elitedata.com" },
  { label: "New Bundle Available", text: "Hi {name}, new data bundles are now available on Elite Data! Log in to your agent dashboard to see the latest prices. Sell more, earn more!" },
  { label: "Payment Received", text: "Hi {name}, your wallet has been topped up on Elite Data. Your updated balance is ready. Log in to start selling!" },
  { label: "Promotion", text: "Hi {name}, great news from Elite Data! We have exciting promotions for agents this week. Log in now to take advantage. Happy selling!" },
  { label: "System Update", text: "Hi {name}, Elite Data system update: We have improved our platform to serve you better. Log in and explore the new features in your dashboard." },
];

export default function SMSAdmin({ agents }: { agents: Agent[] }) {
  const [mode, setMode] = useState<"bulk" | "individual">("bulk");

  // Bulk state
  const [audience, setAudience] = useState<"all" | "custom_price" | "commission" | "selected" | "customers">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMsg, setBulkMsg] = useState("");
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ ok: boolean; text: string } | null>(null);

  // Customer phones state
  const [customerPhones, setCustomerPhones] = useState<string[] | null>(null);
  const [customersLoading, setCustomersLoading] = useState(false);

  // Individual state
  const [testPhone, setTestPhone] = useState("");
  const [testMsg, setTestMsg] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  const approvedAgents = useMemo(() => agents.filter(a => a.status === "approved"), [agents]);

  // Fetch customer phones when customers audience selected
  useEffect(() => {
    if (audience !== "customers" || customerPhones !== null || customersLoading) return;
    setCustomersLoading(true);
    fetch("/api/admin/sms/customers")
      .then(r => r.json())
      .then(d => setCustomerPhones(d.phones ?? []))
      .finally(() => setCustomersLoading(false));
  }, [audience, customerPhones, customersLoading]);

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

  function toggleAgent(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function selectAll() { setSelected(new Set(approvedAgents.map(a => a.id))); }
  function clearAll() { setSelected(new Set()); }

  function applyTemplate(t: typeof TEMPLATES[0]) {
    if (mode === "bulk") setBulkMsg(t.text);
    else setTestMsg(t.text);
  }

  async function sendBulk() {
    if (!bulkMsg.trim() || sendPhones.length === 0) return;
    setBulkSending(true); setBulkResult(null);
    try {
      const res = await fetch("/api/admin/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phones: sendPhones, message: bulkMsg }),
      });
      const d = await res.json();
      const label = audience === "customers" ? "customers" : "agents";
      setBulkResult({ ok: res.ok && !d.error, text: d.error ?? `Sent to ${sendPhones.length} ${label} successfully!` });
    } catch (e) {
      setBulkResult({ ok: false, text: String(e) });
    } finally { setBulkSending(false); }
  }

  async function sendTest() {
    const phone = testPhone.trim().replace(/\s/g, "");
    if (!phone || !testMsg.trim()) return;
    setTestSending(true); setTestResult(null);
    try {
      const res = await fetch("/api/admin/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phones: [phone], message: testMsg }),
      });
      const d = await res.json();
      setTestResult({ ok: res.ok && !d.error, text: d.error ?? `Test SMS sent to ${phone}!` });
    } catch (e) {
      setTestResult({ ok: false, text: String(e) });
    } finally { setTestSending(false); }
  }

  const charCount = (mode === "bulk" ? bulkMsg : testMsg).length;
  const smsCount = Math.ceil(charCount / 160) || 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Mode toggle */}
      <div style={{ display: "flex", gap: 8 }}>
        {([["bulk", "📢 Bulk SMS"], ["individual", "🧪 Test / Individual"]] as const).map(([m, label]) => (
          <button key={m} onClick={() => setMode(m)} style={{
            padding: "10px 22px", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer",
            background: mode === m ? "linear-gradient(90deg,#3b82f6,#8b5cf6)" : CARD,
            color: mode === m ? "white" : "#94a3b8",
            border: `1px solid ${mode === m ? "transparent" : BORDER}`,
          }}>{label}</button>
        ))}
      </div>

      {/* Message templates */}
      <div style={{ background: CARD, borderRadius: 14, border: `1px solid ${BORDER}`, padding: "18px 20px" }}>
        <p style={{ color: "#94a3b8", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, margin: "0 0 12px" }}>Message Templates</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {TEMPLATES.map(t => (
            <button key={t.label} onClick={() => applyTemplate(t)} style={{
              padding: "6px 14px", borderRadius: 8, border: `1px solid ${BORDER}`, background: "#0f172a",
              color: "#60a5fa", fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {mode === "bulk" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20 }} className="sms-grid">
          {/* Left: message + send */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Message */}
            <div style={{ background: CARD, borderRadius: 14, border: `1px solid ${BORDER}`, padding: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <p style={{ color: "white", fontWeight: 700, fontSize: 15, margin: 0 }}>Compose Message</p>
                <span style={{ fontSize: 12, color: charCount > 160 ? "#f87171" : "#94a3b8" }}>
                  {charCount} chars · {smsCount} SMS
                </span>
              </div>
              <textarea
                value={bulkMsg}
                onChange={e => setBulkMsg(e.target.value)}
                placeholder="Type your message here… Use {name} to personalise (e.g. Hi {name}, your Elite Data wallet…)"
                rows={6}
                style={{ width: "100%", background: BG, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 14px", color: "white", fontSize: 14, resize: "vertical", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
              />
              <p style={{ color: "#64748b", fontSize: 12, margin: "8px 0 0" }}>
                Tip: <code style={{ color: "#94a3b8" }}>{"{name}"}</code> is replaced with each agent's first name automatically.
              </p>
            </div>

            {/* Send button + result */}
            <div style={{ background: CARD, borderRadius: 14, border: `1px solid ${BORDER}`, padding: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <p style={{ color: "white", fontWeight: 700, fontSize: 14, margin: 0 }}>
                    Sending to <span style={{ color: "#60a5fa" }}>{recipientCount} {audience === "customers" ? "customer" : "agent"}{recipientCount !== 1 ? "s" : ""}</span>
                  </p>
                  <p style={{ color: "#64748b", fontSize: 12, margin: "2px 0 0" }}>
                    Estimated: {recipientCount * smsCount} SMS credit{recipientCount * smsCount !== 1 ? "s" : ""}
                  </p>
                </div>
                <button
                  onClick={sendBulk}
                  disabled={bulkSending || !bulkMsg.trim() || sendPhones.length === 0 || customersLoading}
                  style={{ background: bulkSending || !bulkMsg.trim() || sendPhones.length === 0 ? "#1e293b" : "linear-gradient(90deg,#3b82f6,#8b5cf6)", color: bulkSending ? "#64748b" : "white", border: "none", borderRadius: 10, padding: "12px 28px", fontSize: 14, fontWeight: 800, cursor: bulkSending ? "not-allowed" : "pointer" }}>
                  {bulkSending ? "Sending…" : customersLoading ? "Loading customers…" : `Send to ${recipientCount} ${audience === "customers" ? "Customer" : "Agent"}${recipientCount !== 1 ? "s" : ""}`}
                </button>
              </div>
              {bulkResult && (
                <div style={{ marginTop: 14, padding: "12px 16px", borderRadius: 10, background: bulkResult.ok ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)", border: `1px solid ${bulkResult.ok ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}` }}>
                  <p style={{ color: bulkResult.ok ? "#4ade80" : "#f87171", fontWeight: 700, fontSize: 13, margin: 0 }}>
                    {bulkResult.ok ? "✓" : "✗"} {bulkResult.text}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Right: audience picker */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: CARD, borderRadius: 14, border: `1px solid ${BORDER}`, padding: "20px" }}>
              <p style={{ color: "white", fontWeight: 700, fontSize: 15, margin: "0 0 14px" }}>Recipients</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                {([
                  ["all", `All Agents (${approvedAgents.length})`],
                  ["custom_price", `Price Mode Agents (${approvedAgents.filter(a => a.agent_type === "custom_price").length})`],
                  ["commission", `Commission Agents (${approvedAgents.filter(a => a.agent_type !== "custom_price").length})`],
                  ["customers", customersLoading ? "All Customers (loading…)" : `All Customers (${customerPhones?.length ?? "click to load"})`],
                  ["selected", `Select Manually (${selected.size} chosen)`],
                ] as const).map(([val, label]) => (
                  <label key={val} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "10px 12px", borderRadius: 8, background: audience === val ? "rgba(59,130,246,0.1)" : "transparent", border: `1px solid ${audience === val ? "rgba(59,130,246,0.4)" : BORDER}` }}>
                    <input type="radio" checked={audience === val} onChange={() => setAudience(val)} style={{ accentColor: "#3b82f6" }} />
                    <span style={{ color: audience === val ? "#60a5fa" : "#94a3b8", fontSize: 13, fontWeight: 600 }}>{label}</span>
                  </label>
                ))}
              </div>

              {audience === "selected" && (
                <div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    <button onClick={selectAll} style={{ flex: 1, padding: "6px", borderRadius: 6, border: `1px solid ${BORDER}`, background: "transparent", color: "#60a5fa", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Select All</button>
                    <button onClick={clearAll} style={{ flex: 1, padding: "6px", borderRadius: 6, border: `1px solid ${BORDER}`, background: "transparent", color: "#f87171", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Clear</button>
                  </div>
                  <div style={{ maxHeight: 260, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                    {approvedAgents.map(a => (
                      <label key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "8px 10px", borderRadius: 6, background: selected.has(a.id) ? "rgba(59,130,246,0.08)" : "transparent" }}>
                        <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggleAgent(a.id)} style={{ accentColor: "#3b82f6" }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ color: "white", fontSize: 12, fontWeight: 700, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</p>
                          <p style={{ color: "#64748b", fontSize: 11, margin: 0 }}>{a.phone}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Preview */}
            {bulkMsg && (
              <div style={{ background: CARD, borderRadius: 14, border: `1px solid ${BORDER}`, padding: "16px 18px" }}>
                <p style={{ color: "#94a3b8", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, margin: "0 0 10px" }}>Preview (first agent)</p>
                <div style={{ background: "#0f172a", borderRadius: 10, padding: "12px 14px" }}>
                  <p style={{ color: "#e2e8f0", fontSize: 13, margin: 0, lineHeight: 1.6 }}>
                    {bulkMsg.replace(/\{name\}/g, recipients[0]?.name?.split(" ")[0] ?? "Agent")}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {mode === "individual" && (
        <div style={{ maxWidth: 580 }}>
          <div style={{ background: CARD, borderRadius: 14, border: `1px solid ${BORDER}`, padding: "24px" }}>
            <p style={{ color: "white", fontWeight: 700, fontSize: 16, margin: "0 0 20px" }}>🧪 Individual / Test SMS</p>

            <div style={{ marginBottom: 16 }}>
              <label style={{ color: "#94a3b8", fontSize: 12, fontWeight: 700, display: "block", marginBottom: 6 }}>RECIPIENT PHONE NUMBER</label>
              <input
                type="tel"
                value={testPhone}
                onChange={e => setTestPhone(e.target.value)}
                placeholder="e.g. 0241234567 or 233241234567"
                style={{ width: "100%", background: BG, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 14px", color: "white", fontSize: 14, outline: "none", boxSizing: "border-box" }}
              />
              <p style={{ color: "#64748b", fontSize: 11, margin: "6px 0 0" }}>Enter any phone number to test. Use Ghana format: 024XXXXXXX or international: 233241XXXXXX</p>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <label style={{ color: "#94a3b8", fontSize: 12, fontWeight: 700 }}>MESSAGE</label>
                <span style={{ fontSize: 12, color: charCount > 160 ? "#f87171" : "#64748b" }}>{charCount} chars · {smsCount} SMS</span>
              </div>
              <textarea
                value={testMsg}
                onChange={e => setTestMsg(e.target.value)}
                placeholder="Type your test message here…"
                rows={5}
                style={{ width: "100%", background: BG, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 14px", color: "white", fontSize: 14, resize: "vertical", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
              />
            </div>

            <button
              onClick={sendTest}
              disabled={testSending || !testPhone.trim() || !testMsg.trim()}
              style={{ width: "100%", background: testSending || !testPhone.trim() || !testMsg.trim() ? "#1e293b" : "linear-gradient(90deg,#3b82f6,#8b5cf6)", color: testSending ? "#64748b" : "white", border: "none", borderRadius: 10, padding: "14px", fontSize: 14, fontWeight: 800, cursor: testSending ? "not-allowed" : "pointer" }}>
              {testSending ? "Sending…" : "Send Test SMS"}
            </button>

            {testResult && (
              <div style={{ marginTop: 14, padding: "12px 16px", borderRadius: 10, background: testResult.ok ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)", border: `1px solid ${testResult.ok ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}` }}>
                <p style={{ color: testResult.ok ? "#4ade80" : "#f87171", fontWeight: 700, fontSize: 13, margin: 0 }}>
                  {testResult.ok ? "✓" : "✗"} {testResult.text}
                </p>
              </div>
            )}
          </div>

          {/* Info box */}
          <div style={{ marginTop: 16, background: "rgba(59,130,246,0.08)", borderRadius: 12, border: "1px solid rgba(59,130,246,0.2)", padding: "14px 16px" }}>
            <p style={{ color: "#60a5fa", fontWeight: 700, fontSize: 13, margin: "0 0 6px" }}>ℹ️ About Test Mode</p>
            <p style={{ color: "#94a3b8", fontSize: 12, margin: 0, lineHeight: 1.6 }}>
              Use individual mode to test your messages before sending to all agents. Send to your own phone number to preview exactly how the SMS will appear to recipients.
            </p>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 767px) {
          .sms-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
