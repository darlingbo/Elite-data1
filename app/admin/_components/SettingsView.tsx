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

export function SettingsView({ onChangePassword }: { onChangePassword: () => void }) {
  const [net, setNet] = useState<{ mtn: boolean; telecel: boolean; at: boolean; mashup: boolean; autoHours: boolean; autoStart: string; autoEnd: string; inventor: boolean; datacity: boolean; datify: boolean; slowDelivery: boolean } | null>(null);
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
    <div className="max-w-xl space-y-5">
      <div><h1 className="text-xl font-black text-white">Settings</h1><p className="text-sm text-slate-500">Store availability, hours, and account settings</p></div>

      {netError && (
        <div className="rounded-2xl border p-4" style={{ background: "#120a00", borderColor: "#92400e" }}>
          <p className="text-sm font-bold text-amber-400 mb-2">⚠️ {netError}</p>
          <pre className="text-xs text-blue-300 font-mono whitespace-pre-wrap">{SQL}</pre>
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
