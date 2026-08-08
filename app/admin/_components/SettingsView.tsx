"use client";
import { useState, useEffect } from "react";
import { BG, CARD, BORDER, BORDER2 } from "./shared/constants";

function base64urlToBuffer(base64url: string): ArrayBuffer {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const b64 = (base64url + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}
function bufferToBase64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function VoucherPricingSettings({ showToast }: { showToast: (msg: string, ok?: boolean) => void }) {
  const [prices, setPrices] = useState<Record<string, { sellPrice: number; costPrice: number }> | null>(null);
  const [editing, setEditing] = useState<"BECE" | "WASSCE" | null>(null);
  const [sellInput, setSellInput] = useState("");
  const [costInput, setCostInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/voucher-prices")
      .then(r => r.json())
      .then(d => { if (!d.error) setPrices(d); })
      .catch(() => {});
  }, []);

  function startEdit(type: "BECE" | "WASSCE") {
    const p = prices?.[type];
    setSellInput(String(p?.sellPrice ?? 18));
    setCostInput(String(p?.costPrice ?? 15));
    setEditing(type);
  }

  async function savePrice() {
    if (!editing) return;
    const sell = parseFloat(sellInput);
    const cost = parseFloat(costInput);
    if (isNaN(sell) || sell <= 0) { showToast("❌ Sell price must be a positive number", false); return; }
    if (isNaN(cost) || cost <= 0) { showToast("❌ Cost price must be a positive number", false); return; }
    if (cost >= sell) { showToast("❌ Cost must be less than sell price", false); return; }
    setSaving(true);
    const r = await fetch("/api/admin/voucher-prices", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: editing, sellPrice: sell, costPrice: cost }),
    }).then(r => r.json());
    setSaving(false);
    if (r.success) { setPrices(r.prices); setEditing(null); showToast(`✓ ${editing} price updated`); }
    else showToast(`❌ ${r.error ?? "Save failed"}`, false);
  }

  const types = ["BECE", "WASSCE"] as const;

  return (
    <div className="rounded-2xl border p-5" style={{ background: CARD, borderColor: BORDER }}>
      <h2 className="font-bold text-white mb-1">🎟 Voucher Pricing</h2>
      <p className="text-xs text-slate-500 mb-4">Set your sell and cost prices for BECE & WASSCE result checker vouchers</p>
      {!prices && <div className="text-sm text-slate-500">Loading…</div>}
      {prices && (
        <div className="space-y-3">
          {types.map(type => {
            const p = prices[type] ?? { sellPrice: 18, costPrice: 15 };
            const profit = p.sellPrice - p.costPrice;
            const isEditing = editing === type;
            return (
              <div key={type} className="rounded-xl border p-4" style={{ background: BG, borderColor: BORDER2 }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{type === "BECE" ? "📗" : "📘"}</span>
                    <span className="font-bold text-white text-sm">{type}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: "#052e16", color: "#4ade80" }}>
                      +GH₵{profit.toFixed(2)} profit
                    </span>
                  </div>
                  {!isEditing && (
                    <button onClick={() => startEdit(type)}
                      className="text-xs border px-3 py-1.5 rounded-lg font-bold text-blue-400 border-blue-900 hover:bg-blue-900/20">
                      Edit
                    </button>
                  )}
                </div>
                {isEditing ? (
                  <div className="space-y-2 mt-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Sell Price (GH₵)</label>
                        <input type="number" value={sellInput} onChange={e => setSellInput(e.target.value)}
                          step="0.01" min="0.01"
                          className="w-full rounded-lg px-3 py-2 text-sm text-white border focus:outline-none focus:border-blue-500"
                          style={{ background: CARD, borderColor: BORDER }} />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Cost Price (GH₵)</label>
                        <input type="number" value={costInput} onChange={e => setCostInput(e.target.value)}
                          step="0.01" min="0.01"
                          className="w-full rounded-lg px-3 py-2 text-sm text-white border focus:outline-none focus:border-blue-500"
                          style={{ background: CARD, borderColor: BORDER }} />
                      </div>
                    </div>
                    <div className="flex gap-2 mt-1">
                      <button onClick={savePrice} disabled={saving}
                        className="flex-1 py-2 rounded-lg text-sm font-black text-white disabled:opacity-60"
                        style={{ background: "linear-gradient(90deg,#3b82f6,#8b5cf6)" }}>
                        {saving ? "Saving…" : "Save"}
                      </button>
                      <button onClick={() => setEditing(null)}
                        className="px-4 py-2 rounded-lg text-sm font-bold text-slate-400 border"
                        style={{ borderColor: BORDER }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-6 text-sm mt-1">
                    <span className="text-slate-400">Sell: <strong className="text-white">GH₵{p.sellPrice.toFixed(2)}</strong></span>
                    <span className="text-slate-400">Cost: <strong className="text-white">GH₵{p.costPrice.toFixed(2)}</strong></span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

type VoucherInventoryItem = {
  id: number;
  voucher_type: "BECE" | "WASSCE";
  code: string;
  status: "available" | "assigned" | "sent";
  order_reference: string | null;
};

function VoucherInventorySettings({ showToast }: { showToast: (msg: string, ok?: boolean) => void }) {
  const [type, setType] = useState<"BECE" | "WASSCE">("BECE");
  const [codes, setCodes] = useState("");
  const [items, setItems] = useState<VoucherInventoryItem[]>([]);
  const [counts, setCounts] = useState({ BECE: { available: 0, assigned: 0, sent: 0 }, WASSCE: { available: 0, assigned: 0, sent: 0 } });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadInventory() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/voucher-inventory");
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not load voucher stock");
      setItems(result.items ?? []);
      setCounts(result.counts);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not load voucher stock", false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadInventory(); }, []);

  async function addVouchers() {
    if (!codes.trim()) return showToast("Paste at least one voucher", false);
    setSaving(true);
    try {
      const response = await fetch("/api/admin/voucher-inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voucherType: type, codes }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save vouchers");
      setCodes("");
      showToast(`${result.added} ${type} voucher${result.added === 1 ? "" : "s"} added${result.skipped ? `; ${result.skipped} duplicate(s) skipped` : ""}`);
      await loadInventory();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not save vouchers", false);
    } finally {
      setSaving(false);
    }
  }

  async function removeVoucher(id: number) {
    const response = await fetch("/api/admin/voucher-inventory", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const result = await response.json();
    if (!response.ok) return showToast(result.error ?? "Could not remove voucher", false);
    showToast("Unused voucher removed");
    await loadInventory();
  }

  return (
    <div className="rounded-2xl border p-5" style={{ background: CARD, borderColor: BORDER }}>
      <h2 className="font-bold text-white mb-1">Voucher Stock & SMS Delivery</h2>
      <p className="text-xs text-slate-500 mb-4">Paste one complete voucher per line. Approval uses this stock first and sends it by SMS. Inventor is used only when there is not enough local stock for the order.</p>
      <div className="grid grid-cols-2 gap-3 mb-4">
        {(["BECE", "WASSCE"] as const).map(voucherType => (
          <button key={voucherType} onClick={() => setType(voucherType)} className="rounded-xl border p-3 text-left" style={{ background: type === voucherType ? "#172554" : BG, borderColor: type === voucherType ? "#3b82f6" : BORDER2 }}>
            <p className="text-sm font-black text-white">{voucherType}</p>
            <p className="text-xl font-black text-green-400">{counts[voucherType].available} available</p>
            <p className="text-[11px] text-slate-500">{counts[voucherType].assigned} reserved · {counts[voucherType].sent} sent</p>
          </button>
        ))}
      </div>
      <textarea value={codes} onChange={event => setCodes(event.target.value)} rows={5} placeholder={`Paste ${type} vouchers here — one voucher per line`} className="w-full rounded-xl px-3 py-3 text-sm text-white border focus:outline-none focus:border-blue-500" style={{ background: BG, borderColor: BORDER }} />
      <button onClick={addVouchers} disabled={saving} className="mt-3 w-full py-2.5 rounded-xl text-sm font-black text-white disabled:opacity-60" style={{ background: "linear-gradient(90deg,#3b82f6,#8b5cf6)" }}>
        {saving ? "Saving…" : `Add ${type} Vouchers`}
      </button>
      <div className="mt-5 max-h-72 overflow-auto rounded-xl border" style={{ borderColor: BORDER2 }}>
        {loading ? <p className="p-4 text-sm text-slate-500">Loading stock…</p> : items.length === 0 ? <p className="p-4 text-sm text-slate-500">No vouchers saved yet.</p> : items.map(item => (
          <div key={item.id} className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0" style={{ borderColor: BORDER2 }}>
            <span className="text-xs font-bold text-blue-400 w-16">{item.voucher_type}</span>
            <code className="text-xs text-slate-300 flex-1 break-all">{item.code}</code>
            <span className="text-[10px] uppercase font-bold" style={{ color: item.status === "available" ? "#4ade80" : item.status === "sent" ? "#60a5fa" : "#fbbf24" }}>{item.status}</span>
            {item.status === "available" && <button onClick={() => removeVoucher(item.id)} className="text-xs text-red-400 hover:text-red-300">Remove</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

function VoucherDiscountCode({ showToast }: { showToast: (msg: string, ok?: boolean) => void }) {
  const [code, setCode] = useState("");
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/admin/voucher-discount-code")
      .then(r => r.json())
      .then(d => { setCode(d.code ?? ""); setInput(d.code ?? ""); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  async function save() {
    setSaving(true);
    const r = await fetch("/api/admin/voucher-discount-code", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: input }),
    }).then(r => r.json());
    setSaving(false);
    if (r.success) { setCode(r.code); showToast(r.code ? `✓ Discount code set to "${r.code}"` : "✓ Discount code cleared"); }
    else showToast("❌ Save failed", false);
  }

  return (
    <div className="rounded-2xl border p-5" style={{ background: CARD, borderColor: BORDER }}>
      <h2 className="font-bold text-white mb-1">🏷️ Voucher VIP Discount Code</h2>
      <p className="text-xs text-slate-500 mb-4">
        Share this code with specific customers so they always get the <strong className="text-white">GH₵18 bulk price</strong> — even when buying just 1 voucher.
        Leave blank to disable.
      </p>
      {!loaded ? <div className="text-sm text-slate-500">Loading…</div> : (
        <div className="space-y-3">
          {code && (
            <div className="flex items-center gap-3 rounded-xl border px-4 py-3" style={{ background: BG, borderColor: BORDER }}>
              <span className="text-xs text-slate-500">Current code:</span>
              <span className="font-black text-amber-400 tracking-widest text-sm">{code}</span>
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="e.g. ELITE18"
              value={input}
              onChange={e => setInput(e.target.value.toUpperCase())}
              className="flex-1 rounded-xl px-4 py-2.5 text-sm text-white border focus:outline-none focus:border-blue-500 tracking-widest font-bold"
              style={{ background: BG, borderColor: BORDER }}
            />
            <button
              onClick={save} disabled={saving || input === code}
              className="px-5 py-2.5 rounded-xl text-sm font-black text-white disabled:opacity-50"
              style={{ background: "linear-gradient(90deg,#3b82f6,#8b5cf6)" }}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
          {code && (
            <button
              onClick={() => { setInput(""); void save(); }}
              className="text-xs text-red-400 hover:text-red-300">
              Clear code (disable discount)
            </button>
          )}
          <p className="text-xs text-slate-600">
            Share the code with your VIP customers. They enter it on the voucher page before paying to unlock GH₵18 per voucher.
          </p>
        </div>
      )}
    </div>
  );
}

function BiometricSettings({ showToast }: { showToast: (msg: string, ok?: boolean) => void }) {
  const [status, setStatus] = useState<"loading" | "unsupported" | "none" | "registered">(() =>
    typeof window !== "undefined" && !window.PublicKeyCredential ? "unsupported" : "loading"
  );
  const [registering, setRegistering] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [credentials, setCredentials] = useState<{ id: string; createdAt: string }[]>([]);

  useEffect(() => {
    if (!window.PublicKeyCredential) return;
    fetch("/api/admin/biometric?action=has-credentials")
      .then(r => r.json())
      .then(d => {
        if (d.registered) {
          setStatus("registered");
          fetch("/api/admin/biometric?action=list").then(r => r.json()).then(d => setCredentials(d.credentials ?? [])).catch(() => {});
        } else {
          setStatus("none");
        }
      })
      .catch(() => setStatus("none"));
  }, []);

  async function register() {
    setRegistering(true);
    try {
      const optRes = await fetch("/api/admin/biometric?action=registration-options");
      if (!optRes.ok) { showToast("❌ Could not start registration", false); setRegistering(false); return; }
      const options = await optRes.json();

      const publicKey: PublicKeyCredentialCreationOptions = {
        ...options,
        challenge: base64urlToBuffer(options.challenge),
        user: { ...options.user, id: base64urlToBuffer(options.user.id) },
        excludeCredentials: (options.excludeCredentials ?? []).map((c: { id: string; type: string; transports?: string[] }) => ({
          ...c, id: base64urlToBuffer(c.id),
        })),
      };

      const credential = await navigator.credentials.create({ publicKey }) as PublicKeyCredential;
      if (!credential) { showToast("❌ Registration cancelled", false); setRegistering(false); return; }

      const attestation = credential.response as AuthenticatorAttestationResponse;
      const body = {
        id: credential.id,
        rawId: bufferToBase64url(credential.rawId),
        type: credential.type,
        response: {
          clientDataJSON: bufferToBase64url(attestation.clientDataJSON),
          attestationObject: bufferToBase64url(attestation.attestationObject),
          transports: attestation.getTransports?.() ?? [],
        },
      };

      const verifyRes = await fetch("/api/admin/biometric?action=registration-verify", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const result = await verifyRes.json();
      if (result.success) {
        showToast("✓ Biometric registered! You can now log in without a password.");
        setStatus("registered");
        fetch("/api/admin/biometric?action=list").then(r => r.json()).then(d => setCredentials(d.credentials ?? [])).catch(() => {});
      } else {
        showToast(`❌ ${result.error ?? "Registration failed"}`, false);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("cancel") || msg.includes("abort") || msg.includes("NotAllowed")) {
        showToast("Cancelled — try again when ready");
      } else {
        showToast("❌ Registration error — try again", false);
      }
    } finally {
      setRegistering(false);
    }
  }

  async function remove() {
    if (!confirm("Remove biometric login? You will need your password to sign in.")) return;
    setRemoving(true);
    const r = await fetch("/api/admin/biometric?action=remove", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }).then(r => r.json());
    setRemoving(false);
    if (r.success) { setStatus("none"); setCredentials([]); showToast("Biometric removed. Use password to log in."); }
    else showToast("❌ Could not remove — try again", false);
  }

  if (status === "unsupported") return null;

  return (
    <div className="rounded-2xl border p-5" style={{ background: CARD, borderColor: BORDER }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="font-bold text-white">🔐 Fingerprint / Face ID Login</p>
          <p className="text-xs text-slate-500">Log in with your fingerprint, Face ID, or phone PIN — no password needed</p>
        </div>
        {status === "loading" && <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />}
        {status === "registered" && <span className="text-xs font-black text-green-400 border border-green-800 bg-green-950 px-2.5 py-1 rounded-full">Active ✓</span>}
        {status === "none" && <span className="text-xs font-bold text-slate-500 border border-slate-700 px-2.5 py-1 rounded-full">Not set up</span>}
      </div>

      {status === "registered" && credentials.length > 0 && (
        <div className="mb-4 space-y-1.5">
          {credentials.map((c, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-slate-400 bg-green-950/30 rounded-lg px-3 py-2 border border-green-900/40">
              <span>📱</span>
              <span>Device {i + 1}: <span className="font-mono text-slate-300">{c.id}</span></span>
              <span className="ml-auto text-slate-600">{new Date(c.createdAt).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3">
        {status !== "loading" && (
          <button onClick={register} disabled={registering}
            className="flex-1 py-3 rounded-xl text-sm font-black text-white disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ background: "linear-gradient(135deg,#2563eb,#7c3aed)" }}>
            {registering
              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Setting up…</>
              : status === "registered" ? "👆 Re-register Biometric" : "👆 Set Up Fingerprint / Face ID"}
          </button>
        )}
        {status === "registered" && (
          <button onClick={remove} disabled={removing}
            className="px-4 py-3 rounded-xl text-sm font-bold text-red-400 border border-red-900 hover:bg-red-950 disabled:opacity-60">
            {removing ? "…" : "Remove"}
          </button>
        )}
      </div>

      {status === "none" && (
        <p className="text-xs text-slate-600 mt-3 text-center">
          Works with any phone — fingerprint sensor, Face ID, face unlock, or screen PIN
        </p>
      )}
    </div>
  );
}

function SettingToggle({ checked, onChange, saving }: { checked: boolean; onChange: (v: boolean) => void; saving?: boolean }) {
  return (
    <button onClick={() => !saving && onChange(!checked)} disabled={saving}
      className="relative inline-flex items-center h-7 rounded-full w-12 transition-colors shrink-0 disabled:opacity-60"
      style={{ background: checked ? "#16a34a" : "#374151" }}>
      {saving ? <span className="absolute inset-0 flex items-center justify-center"><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /></span>
        : <span className="inline-block w-5 h-5 transform rounded-full bg-white shadow transition-transform" style={{ transform: checked ? "translateX(26px)" : "translateX(2px)" }} />}
    </button>
  );
}

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

export function SettingsView({ onChangePassword }: { onChangePassword: () => void }) {
  const [net, setNet] = useState<{ mtn: boolean; telecel: boolean; at: boolean; mashup: boolean; autoHours: boolean; autoStart: string; autoEnd: string; inventor: boolean; datacity: boolean; datify: boolean; slowDelivery: boolean; autoApprove: boolean; smsApproval: boolean; smsAdminPhone: string; smsWebhookReady: boolean; smsTwoWayReady: boolean; smsCallbackUrl: string; aiOrderGuard: boolean; whatsappAi: boolean; deepseekReady: boolean; whatsappReady: boolean } | null>(null);
  const [netError, setNetError] = useState("");
  const [netSaving, setNetSaving] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [toastOk, setToastOk] = useState(true);
  const [checkingInt, setCheckingInt] = useState(false);
  const [intStatus, setIntStatus] = useState<Record<string, { value: string; ok: boolean }> | null>(null);
  const [hoursSaving, setHoursSaving] = useState(false);

  function showToast(msg: string, ok = true) { setToast(msg); setToastOk(ok); setTimeout(() => setToast(""), 3500); }

  useEffect(() => {
    fetch("/api/admin/network-settings")
      .then(r => r.json())
      .then(d => {
        if (d.error) { setNetError("Could not load settings. Run the SQL below in Supabase first."); return; }
        setNet(d);
      })
      .catch(() => setNetError("Network error loading settings."));
  }, []);

  async function toggleProvider(key: "inventor" | "datacity" | "datify" | "slowDelivery", value: boolean) {
    if (!net) return;
    setNet(prev => prev ? { ...prev, [key]: value } : prev);
    setNetSaving(key);
    const r = await fetch("/api/admin/network-settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [key]: value }) }).then(r => r.json());
    setNetSaving(null);
    const labels: Record<string, string> = { inventor: "Inventor", datacity: "DataCity", datify: "Datify" };
    if (r.success) showToast(`✓ ${labels[key]} ${value ? "enabled" : "disabled"}`);
    else { showToast(`❌ ${r.error ?? "Save failed"}`, false); setNet(prev => prev ? { ...prev, [key]: !value } : prev); }
  }

  async function toggleNet(key: "mtn" | "telecel" | "at" | "mashup", value: boolean) {
    if (!net) return;
    setNet(prev => prev ? { ...prev, [key]: value } : prev);
    setNetSaving(key);
    const r = await fetch("/api/admin/network-settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [key]: value }) }).then(r => r.json());
    setNetSaving(null);
    if (r.success) showToast(`✓ ${key.toUpperCase()} ${value ? "enabled" : "disabled"}`);
    else { showToast(`❌ ${r.error ?? "Save failed"}`, false); setNet(prev => prev ? { ...prev, [key]: !value } : prev); }
  }

  async function toggleAutoHours(value: boolean) {
    if (!net) return;
    setNet(prev => prev ? { ...prev, autoHours: value } : prev);
    setNetSaving("autoHours");
    const r = await fetch("/api/admin/network-settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ autoHours: value }) }).then(r => r.json());
    setNetSaving(null);
    if (r.success) showToast(`✓ Auto hours ${value ? "enabled" : "disabled"}`);
    else showToast("❌ Save failed", false);
  }

  async function toggleAutoApprove(value: boolean) {
    if (!net) return;
    setNet(prev => prev ? { ...prev, autoApprove: value } : prev);
    setNetSaving("autoApprove");
    const r = await fetch("/api/admin/network-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ autoApprove: value }),
    }).then(response => response.json());
    setNetSaving(null);
    if (r.success) showToast(`Automatic approval ${value ? "enabled" : "disabled"}`);
    else {
      showToast(r.error ?? "Save failed", false);
      setNet(prev => prev ? { ...prev, autoApprove: !value } : prev);
    }
  }

  async function saveSmsApproval(patch: { smsApproval?: boolean; smsAdminPhone?: string }) {
    if (!net) return;
    const previous = net;
    setNet(current => current ? { ...current, ...patch } : current);
    setNetSaving("smsApproval");
    const response = await fetch("/api/admin/network-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const result = await response.json();
    setNetSaving(null);
    if (result.success) showToast("SMS approval settings saved");
    else {
      setNet(previous);
      showToast(result.error ?? "Could not save SMS approval settings", false);
    }
  }

  async function toggleAiFeature(key: "aiOrderGuard" | "whatsappAi", value: boolean) {
    if (!net) return;
    setNet(current => current ? { ...current, [key]: value } : current);
    setNetSaving(key);
    const result = await fetch("/api/admin/network-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: value }),
    }).then(response => response.json());
    setNetSaving(null);
    if (result.success) showToast(`${key === "aiOrderGuard" ? "AI Order Guard" : "WhatsApp AI"} ${value ? "enabled" : "disabled"}`);
    else {
      setNet(current => current ? { ...current, [key]: !value } : current);
      showToast(result.error ?? "Could not save AI setting", false);
    }
  }

  async function saveStoreHours() {
    if (!net) return;
    setHoursSaving(true);
    const r = await fetch("/api/admin/network-settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ autoStart: net.autoStart, autoEnd: net.autoEnd }) }).then(r => r.json());
    setHoursSaving(false);
    if (r.success) showToast("✓ Store hours saved!");
    else showToast("❌ Save failed", false);
  }

  async function checkIntegrations() {
    setCheckingInt(true); setIntStatus(null);
    const results: Record<string, { value: string; ok: boolean }> = {};
    try {
      const d = await fetch("/api/admin/inventor-balance").then(r => r.json());
      results["Inventor API"] = d.balance !== null ? { value: `✓ Balance: GH₵${Number(d.balance).toFixed(2)}`, ok: true } : { value: "✗ Unreachable", ok: false };
    } catch { results["Inventor API"] = { value: "✗ Error", ok: false }; }
    results["Africa's Talking SMS"] = { value: "Check Vercel env: AT_API_KEY + AT_USERNAME", ok: false };
    results["Supabase DB"] = net ? { value: "✓ Connected", ok: true } : { value: "✗ Not connected — run SQL below", ok: false };
    setIntStatus(results);
    setCheckingInt(false);
  }

  const SQL = `-- Run this ONCE in Supabase SQL Editor:\nCREATE TABLE IF NOT EXISTS system_settings (\n  key text PRIMARY KEY,\n  value text NOT NULL,\n  updated_at timestamptz DEFAULT now()\n);\n\nCREATE TABLE IF NOT EXISTS admin_config (\n  key text PRIMARY KEY,\n  value text NOT NULL,\n  updated_at timestamptz DEFAULT now()\n);`;

  return (
    <div className="admin-section max-w-3xl space-y-5">
      <div><h1 className="text-xl font-black text-white">Settings</h1><p className="text-sm text-slate-500">Store availability, hours, and account settings</p></div>

      {netError && (
        <div className="rounded-2xl border p-4" style={{ background: "#120a00", borderColor: "#92400e" }}>
          <p className="text-sm font-bold text-amber-400 mb-2">⚠️ {netError}</p>
          <pre className="text-xs text-blue-300 font-mono whitespace-pre-wrap">{SQL}</pre>
        </div>
      )}

      {net && (
        <div
          className="rounded-2xl border p-5"
          style={{
            background: net.autoApprove
              ? "linear-gradient(135deg,rgba(5,46,22,.95),rgba(6,78,59,.55))"
              : CARD,
            borderColor: net.autoApprove ? "#22c55e" : BORDER,
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-white">Automatic Order Approval</h2>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-black"
                  style={{
                    color: net.autoApprove ? "#86efac" : "#fca5a5",
                    background: net.autoApprove ? "rgba(34,197,94,.15)" : "rgba(239,68,68,.12)",
                  }}
                >
                  {net.autoApprove ? "ON" : "OFF"}
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                When on, verified paid orders are approved and sent to the provider automatically.
                Turn it off anytime to return to the approval queue.
              </p>
            </div>
            <SettingToggle checked={net.autoApprove} saving={netSaving === "autoApprove"} onChange={toggleAutoApprove} />
          </div>
          <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300">
            Safety: every order is saved first, duplicate delivery is blocked, and Mashup orders still require manual approval.
          </div>
        </div>
      )}

      {net && (
        <div className="rounded-2xl border p-5" style={{ background: "linear-gradient(135deg,rgba(30,27,75,.8),rgba(15,23,42,.95))", borderColor: "#6366f1" }}>
          <h2 className="font-bold text-white">EliteData AI</h2>
          <p className="mt-1 text-xs text-slate-400">Smart protection for automatic orders and customer support.</p>
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">AI Order Guard</p>
                <p className="text-xs text-slate-400">Holds suspicious duplicates, invalid numbers, missing payments and loss-making orders.</p>
              </div>
              <SettingToggle checked={net.aiOrderGuard} saving={netSaving === "aiOrderGuard"} onChange={value => toggleAiFeature("aiOrderGuard", value)} />
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-4">
              <div>
                <p className="text-sm font-semibold text-white">WhatsApp AI Assistant</p>
                <p className="text-xs text-slate-400">Answers prices and securely checks an order only when its phone number matches.</p>
              </div>
              <SettingToggle checked={net.whatsappAi} saving={netSaving === "whatsappAi"} onChange={value => toggleAiFeature("whatsappAi", value)} />
            </div>
          </div>
          <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
            <div className={`rounded-lg px-3 py-2 ${net.deepseekReady ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"}`}>
              DeepSeek: {net.deepseekReady ? "Connected" : "API key missing"}
            </div>
            <div className={`rounded-lg px-3 py-2 ${net.whatsappReady ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"}`}>
              WhatsApp: {net.whatsappReady ? "Connected" : "Whapi connection missing"}
            </div>
          </div>
          {!net.deepseekReady && (
            <p className="mt-3 text-xs text-slate-400">The Order Guard continues using its free server-side safety rules when DeepSeek is unavailable.</p>
          )}
        </div>
      )}

      {net && (
        <div className="rounded-2xl border p-5" style={{ background: CARD, borderColor: net.smsApproval ? "#38bdf8" : BORDER }}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-bold text-white">Approve Orders by SMS</h2>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                Receive order alerts and reply with <strong className="text-slate-200">APPROVE reference</strong> or <strong className="text-slate-200">REJECT reference</strong>. Mobile data is not required.
              </p>
            </div>
            <SettingToggle
              checked={net.smsApproval}
              saving={netSaving === "smsApproval"}
              onChange={value => saveSmsApproval({ smsApproval: value })}
            />
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              type="tel"
              value={net.smsAdminPhone}
              onChange={event => setNet(current => current ? { ...current, smsAdminPhone: event.target.value } : current)}
              placeholder="Admin phone, e.g. 0241234567"
              className="min-w-0 flex-1 rounded-xl border px-3 py-2.5 text-sm text-white focus:border-sky-500 focus:outline-none"
              style={{ background: BG, borderColor: BORDER }}
            />
            <button
              onClick={() => saveSmsApproval({ smsAdminPhone: net.smsAdminPhone })}
              disabled={netSaving === "smsApproval"}
              className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-60"
            >
              Save Phone
            </button>
          </div>
          <p className={`mt-3 text-xs font-semibold ${net.smsWebhookReady ? "text-emerald-400" : "text-amber-400"}`}>
            {net.smsWebhookReady
              ? "Secure SMS webhook key is configured."
              : "Setup incomplete: SMS_WEBHOOK_SECRET must be added to Vercel before this can approve orders."}
          </p>
          <p className={`mt-1 text-xs font-semibold ${net.smsTwoWayReady ? "text-emerald-400" : "text-amber-400"}`}>
            {net.smsTwoWayReady
              ? "Africa's Talking two-way shortcode is configured."
              : "Setup incomplete: a Ghana two-way shortcode is required to receive your reply."}
          </p>
          {net.smsCallbackUrl && (
            <div className="mt-3">
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Africa&apos;s Talking incoming-message callback URL
              </label>
              <div className="flex gap-2">
                <input
                  readOnly
                  type="password"
                  value={net.smsCallbackUrl}
                  className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-xs text-slate-300"
                  style={{ background: BG, borderColor: BORDER }}
                />
                <button
                  onClick={() => navigator.clipboard.writeText(net.smsCallbackUrl).then(() => showToast("Callback URL copied"))}
                  className="rounded-xl border px-3 text-xs font-bold text-sky-400"
                  style={{ borderColor: BORDER }}
                >
                  Copy
                </button>
              </div>
            </div>
          )}
          <p className="mt-2 text-xs text-slate-500">
            Your SMS provider must support incoming replies using a two-way number or shortcode. A normal sender ID is usually outgoing-only.
          </p>
        </div>
      )}

      <div className="rounded-2xl border p-5" style={{ background: CARD, borderColor: BORDER }}>
        <h2 className="font-bold text-white mb-1">Network Availability</h2>
        <p className="text-xs text-slate-500 mb-4">Switch a network off to hide it from customers when it has issues</p>
        {!net && !netError && <div className="flex items-center gap-2 text-sm text-slate-500"><div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /> Loading…</div>}
        <div className="space-y-4">
          {net && [
            { key: "mtn" as const, label: "MTN",          dot: "#f59e0b" },
            { key: "telecel" as const, label: "Telecel", dot: "#ef4444" },
            { key: "at" as const, label: "AirtelTigo",  dot: "#3b82f6" },
            { key: "mashup" as const, label: "Mashup",  dot: "#8b5cf6" },
          ].map(n => (
            <div key={n.key} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: n.dot }} />
                <div>
                  <p className="font-semibold text-white text-sm">{n.label}</p>
                  <p className="text-xs font-bold" style={{ color: net[n.key] ? "#4ade80" : "#f87171" }}>
                    {net[n.key] ? "Available" : "Disabled"}
                  </p>
                </div>
              </div>
              <SettingToggle checked={net[n.key]} saving={netSaving === n.key} onChange={v => toggleNet(n.key, v)} />
            </div>
          ))}
        </div>
      </div>

      {net && (
        <div className="rounded-2xl border p-5" style={{ background: CARD, borderColor: BORDER }}>
          <h2 className="font-bold text-white mb-1">API Providers</h2>
          <p className="text-xs text-slate-500 mb-4">Toggle each data provider on or off at any time.</p>
          <div className="space-y-4">
            {([
              { key: "inventor" as const,  label: "Inventor",  dot: "#22d3ee", desc: "Primary provider" },
              { key: "datacity" as const,  label: "DataCity",  dot: "#06b6d4", desc: "Fallback provider" },
              { key: "datify"   as const,  label: "Datify",    dot: "#a855f7", desc: "Fallback provider" },
            ] as const).map(p => (
              <div key={p.key} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: p.dot }} />
                  <div>
                    <p className="font-semibold text-white text-sm">{p.label}</p>
                    <p className="text-xs font-bold" style={{ color: net[p.key] ? "#4ade80" : "#f87171" }}>
                      {net[p.key] ? `Active — ${p.desc}` : "Disabled"}
                    </p>
                  </div>
                </div>
                <SettingToggle checked={net[p.key]} saving={netSaving === p.key} onChange={v => toggleProvider(p.key, v)} />
              </div>
            ))}
          </div>
        </div>
      )}

      {net && (
        <div className="rounded-2xl border p-5" style={{ background: CARD, borderColor: BORDER }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-white">🐢 Slow Delivery Mode</p>
              <p className="text-xs text-slate-500 mt-0.5">Shows a notice on the buy page telling customers deliveries are slow today.</p>
            </div>
            <SettingToggle checked={net.slowDelivery} saving={netSaving === "slowDelivery"} onChange={v => toggleProvider("slowDelivery", v)} />
          </div>
          {net.slowDelivery && (
            <div className="mt-3 rounded-xl px-4 py-2.5 text-sm font-semibold" style={{ background: "#292015", color: "#fbbf24" }}>
              ⚠️ Customers are currently seeing the slow delivery notice.
            </div>
          )}
        </div>
      )}

      {net && (
        <div className="rounded-2xl border p-5" style={{ background: CARD, borderColor: BORDER }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-bold text-white">⏰ Auto Store Hours</p>
              <p className="text-xs text-slate-500">Store auto-closes outside these times (Ghana time)</p>
            </div>
            <SettingToggle checked={net.autoHours} saving={netSaving === "autoHours"} onChange={toggleAutoHours} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Open Time</label>
              <input type="time" value={net.autoStart}
                onChange={e => setNet(s => s ? { ...s, autoStart: e.target.value } : s)}
                className="w-full rounded-xl px-3 py-2.5 text-sm text-white border focus:outline-none focus:border-blue-500"
                style={{ background: BG, borderColor: BORDER }} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Close Time</label>
              <input type="time" value={net.autoEnd}
                onChange={e => setNet(s => s ? { ...s, autoEnd: e.target.value } : s)}
                className="w-full rounded-xl px-3 py-2.5 text-sm text-white border focus:outline-none focus:border-blue-500"
                style={{ background: BG, borderColor: BORDER }} />
            </div>
          </div>
          <button onClick={saveStoreHours} disabled={hoursSaving}
            className="mt-4 w-full py-2.5 rounded-xl text-sm font-black text-white disabled:opacity-60"
            style={{ background: "linear-gradient(90deg,#3b82f6,#8b5cf6)" }}>
            {hoursSaving ? "Saving…" : "Save Store Hours"}
          </button>
          {!net.autoHours && <p className="text-xs text-slate-600 mt-2 text-center">Enable the toggle above to activate auto hours</p>}
        </div>
      )}

      <div className="rounded-2xl border p-5" style={{ background: CARD, borderColor: BORDER }}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="font-bold text-white">🔌 Integrations Status</p>
            <p className="text-xs text-slate-500">Check API connections</p>
          </div>
          <button onClick={checkIntegrations} disabled={checkingInt}
            className="text-xs border px-3 py-1.5 rounded-lg font-bold text-blue-400 border-blue-900 hover:bg-blue-900/20 disabled:opacity-50">
            {checkingInt ? "Checking…" : "Check Now"}
          </button>
        </div>
        {intStatus && (
          <div className="mt-3 space-y-2.5">
            {Object.entries(intStatus).map(([k, v]) => (
              <div key={k} className="flex items-start justify-between gap-3">
                <span className="text-sm text-slate-400 shrink-0">{k}</span>
                <span className="text-xs font-semibold text-right" style={{ color: v.ok ? "#4ade80" : "#fbbf24" }}>{v.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <BiometricSettings showToast={showToast} />
      <VoucherInventorySettings showToast={showToast} />
      <VoucherPricingSettings showToast={showToast} />
      <VoucherDiscountCode showToast={showToast} />

      <div className="rounded-2xl border p-5" style={{ background: CARD, borderColor: BORDER }}>
        <p className="font-bold text-white mb-1">Admin Account</p>
        <p className="text-xs text-slate-500 mb-4">Logged in as <span className="text-white font-semibold">Super Admin</span></p>
        <div className="space-y-2">
          <button onClick={onChangePassword}
            className="flex items-center gap-3 px-4 py-3 rounded-xl border w-full text-left transition-all hover:border-blue-500"
            style={{ background: BG, borderColor: BORDER }}>
            <span className="text-2xl">🔑</span>
            <div>
              <p className="text-sm font-bold text-white">Change Password</p>
              <p className="text-xs text-slate-500">Update your admin login password</p>
            </div>
          </button>
          <a href="/api/admin/backup" download
            className="flex items-center gap-3 px-4 py-3 rounded-xl border w-full text-left transition-all hover:border-green-500"
            style={{ background: BG, borderColor: BORDER }}>
            <span className="text-2xl">🗄️</span>
            <div>
              <p className="text-sm font-bold text-white">Download Backup</p>
              <p className="text-xs text-slate-500">Export all orders, agents &amp; bundles as JSON · Runs automatically every night at 2 AM</p>
            </div>
          </a>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl text-sm font-bold shadow-xl"
          style={{ background: toastOk ? "#14532d" : "#7f1d1d", color: toastOk ? "#4ade80" : "#f87171", border: `1px solid ${toastOk ? "#166534" : "#991b1b"}` }}>
          {toast}
        </div>
      )}
    </div>
  );
}
