"use client";
import { useState, useEffect } from "react";

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  active: boolean;
  created_at: string;
  last_used_at: string | null;
  requests_count: number;
  wallet_balance: number;
}

const BASE_URL = typeof window !== "undefined" ? window.location.origin : "";

const CODE_STYLE: React.CSSProperties = {
  background: "#0e1928",
  border: "1px solid #1e3050",
  borderRadius: 10,
  padding: "14px 16px",
  fontFamily: "monospace",
  fontSize: 13,
  color: "#93c5fd",
  whiteSpace: "pre-wrap",
  wordBreak: "break-all",
  lineHeight: 1.7,
};

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}
      style={{ background: copied ? "#15803d" : "#1e3050", color: copied ? "#bbf7d0" : "#94a3b8", border: "none", borderRadius: 6, padding: "3px 10px", fontSize: 11, cursor: "pointer", fontWeight: 700 }}>
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function TopupModal({ apiKey, onClose, onDone }: { apiKey: ApiKey; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleTopup() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError("Enter a valid amount."); return; }
    setLoading(true);
    setError("");
    const res = await fetch("/api/admin/api-keys/topup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyId: apiKey.id, amount: amt, note: note || undefined }),
    });
    const data = await res.json();
    setLoading(false);
    if (data.success) { onDone(); onClose(); }
    else setError(data.error ?? "Failed to top up.");
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#111827", border: "1px solid #1e3050", borderRadius: 16, padding: 28, width: 360, maxWidth: "90vw" }}>
        <p style={{ color: "#f1f5f9", fontWeight: 800, fontSize: 17, margin: "0 0 4px" }}>Top Up Wallet</p>
        <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 20px" }}>{apiKey.name} — Current balance: <b style={{ color: "#4ade80" }}>GH₵{Number(apiKey.wallet_balance).toFixed(2)}</b></p>

        {error && <p style={{ color: "#f87171", fontSize: 13, marginBottom: 12 }}>{error}</p>}

        <div style={{ marginBottom: 14 }}>
          <label style={{ color: "#94a3b8", fontSize: 12, fontWeight: 700, display: "block", marginBottom: 6 }}>AMOUNT (GH₵)</label>
          <input
            type="number" placeholder="e.g. 100" value={amount} onChange={e => setAmount(e.target.value)}
            style={{ width: "100%", background: "#0e1928", border: "1px solid #1e3050", borderRadius: 8, padding: "10px 14px", color: "#f1f5f9", fontSize: 15, outline: "none", boxSizing: "border-box" }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ color: "#94a3b8", fontSize: 12, fontWeight: 700, display: "block", marginBottom: 6 }}>NOTE (optional)</label>
          <input
            type="text" placeholder="e.g. MoMo payment received" value={note} onChange={e => setNote(e.target.value)}
            style={{ width: "100%", background: "#0e1928", border: "1px solid #1e3050", borderRadius: 8, padding: "10px 14px", color: "#f1f5f9", fontSize: 14, outline: "none", boxSizing: "border-box" }}
          />
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, background: "#1e3050", color: "#94a3b8", border: "none", borderRadius: 8, padding: "11px 0", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Cancel</button>
          <button onClick={handleTopup} disabled={loading}
            style={{ flex: 2, background: "linear-gradient(90deg,#16a34a,#15803d)", color: "#fff", border: "none", borderRadius: 8, padding: "11px 0", fontWeight: 700, fontSize: 14, cursor: "pointer", opacity: loading ? 0.6 : 1 }}>
            {loading ? "Topping up…" : `Add GH₵${amount || "0"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ApiKeysAdmin() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKeyResult, setNewKeyResult] = useState<{ fullKey: string; name: string } | null>(null);
  const [error, setError] = useState("");
  const [revoking, setRevoking] = useState<string | null>(null);
  const [topupKey, setTopupKey] = useState<ApiKey | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/api-keys");
    const data = await res.json();
    setKeys(data.keys ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true); setError("");
    const res = await fetch("/api/admin/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    const data = await res.json();
    setCreating(false);
    if (data.fullKey) { setNewKeyResult({ fullKey: data.fullKey, name: data.key.name }); setNewName(""); load(); }
    else setError(data.error ?? "Failed to create key.");
  }

  async function handleRevoke(id: string) {
    setRevoking(id);
    await fetch("/api/admin/api-keys", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setRevoking(null); load();
  }

  async function handleToggle(key: ApiKey) {
    await fetch("/api/admin/api-keys", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: key.id, active: !key.active }) });
    load();
  }

  const sampleCode = `// ── Elite Data Developer API ──────────────────────
const BASE  = "${BASE_URL}";
const KEY   = "elite_your_key_here";
const HEADS = { "Content-Type": "application/json", Authorization: \`Bearer \${KEY\}\` };

// 1. Check your wallet balance
const bal = await fetch(\`\${BASE}/api/v1/balance\`, { headers: HEADS }).then(r => r.json());
console.log("Balance:", bal.balance, "GHS");

// 2. List bundles (shows api_price — what gets deducted from your wallet)
const { bundles } = await fetch(\`\${BASE}/api/v1/bundles\`, { headers: HEADS }).then(r => r.json());

// 3. Purchase (no Paystack needed — wallet is deducted automatically)
const order = await fetch(\`\${BASE}/api/v1/purchase\`, {
  method: "POST", headers: HEADS,
  body: JSON.stringify({
    network: "MTN",           // MTN | TELECEL | AIRTELTIGO
    phone: "0241234567",
    datasize: 2,              // in GB
    reference: "my-unique-ref-" + Date.now()
  })
}).then(r => r.json());

console.log(order);
// { success: true, status: "completed", amount_charged: 10.01, wallet_balance: 89.99 }

// 4. Check order status anytime
const status = await fetch(\`\${BASE}/api/v1/orders/\${order.reference}\`, { headers: HEADS }).then(r => r.json());`;

  return (
    <div className="admin-section space-y-6">
      {topupKey && <TopupModal apiKey={topupKey} onClose={() => setTopupKey(null)} onDone={load} />}

      <div>
        <h2 style={{ color: "#f1f5f9", fontWeight: 900, fontSize: 22, margin: 0 }}>Developer API</h2>
        <p style={{ color: "#64748b", fontSize: 14, marginTop: 4 }}>
          Wallet-based API — developers top up, then buy data bundles without Paystack.
        </p>
      </div>

      {/* How it works */}
      <div style={{ background: "#0a1f2e", border: "1px solid #1e3050", borderRadius: 14, padding: 18 }}>
        <p style={{ color: "#38bdf8", fontWeight: 700, fontSize: 13, margin: "0 0 10px" }}>💡 How the API works</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          {[
            { step: "1", text: "You create an API key and share it with the developer" },
            { step: "2", text: "Developer pays you (MoMo/cash), you top up their wallet here" },
            { step: "3", text: "Developer calls /api/v1/purchase — wallet deducted automatically" },
            { step: "4", text: "You earn profit on every bundle they sell (15% above cost)" },
          ].map(s => (
            <div key={s.step} style={{ background: "#111827", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#1d4ed8", color: "#fff", fontWeight: 900, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>{s.step}</div>
              <p style={{ color: "#94a3b8", fontSize: 12, margin: 0, lineHeight: 1.5 }}>{s.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Create new key */}
      <div style={{ background: "#162032", border: "1px solid #1e3050", borderRadius: 14, padding: 18 }}>
        <p style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Create New API Key</p>
        {error && <p style={{ color: "#f87171", fontSize: 13, marginBottom: 10 }}>{error}</p>}
        <div style={{ display: "flex", gap: 10 }}>
          <input
            type="text" placeholder="Developer / app name (e.g. Kofi's App)" value={newName}
            onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            style={{ flex: 1, background: "#0e1928", border: "1px solid #1e3050", borderRadius: 8, padding: "10px 14px", color: "#f1f5f9", fontSize: 14, outline: "none" }}
          />
          <button onClick={handleCreate} disabled={creating || !newName.trim()}
            style={{ background: "linear-gradient(90deg,#3b82f6,#8b5cf6)", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer", opacity: creating || !newName.trim() ? 0.6 : 1 }}>
            {creating ? "Creating…" : "Generate Key"}
          </button>
        </div>
      </div>

      {/* Newly created key — shown ONCE */}
      {newKeyResult && (
        <div style={{ background: "#0a2a1f", border: "1.5px solid #15803d", borderRadius: 14, padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <p style={{ color: "#4ade80", fontWeight: 800, fontSize: 15, margin: 0 }}>✓ Key created: {newKeyResult.name}</p>
            <CopyBtn text={newKeyResult.fullKey} />
          </div>
          <div style={CODE_STYLE}>{newKeyResult.fullKey}</div>
          <p style={{ color: "#f87171", fontSize: 12, marginTop: 10, fontWeight: 700 }}>Copy this key now — it will not be shown again.</p>
          <button onClick={() => setNewKeyResult(null)} style={{ marginTop: 8, background: "none", border: "none", color: "#64748b", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>
            I&apos;ve saved it, dismiss
          </button>
        </div>
      )}

      {/* Keys list */}
      <div style={{ background: "#162032", border: "1px solid #1e3050", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid #1e3050" }}>
          <p style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 15, margin: 0 }}>Developer Wallets</p>
        </div>
        {loading ? (
          <p style={{ textAlign: "center", color: "#475569", padding: "40px 0", fontSize: 14 }}>Loading…</p>
        ) : keys.length === 0 ? (
          <p style={{ textAlign: "center", color: "#475569", padding: "40px 0", fontSize: 14 }}>No API keys yet. Create one above.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #1e3050" }}>
                {["Developer", "Key", "Wallet Balance", "Status", "Requests", "Actions"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "10px 18px", color: "#64748b", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} style={{ borderBottom: "1px solid #1e3050" }}>
                  <td style={{ padding: "12px 18px", color: "#f1f5f9", fontWeight: 600, fontSize: 14 }}>{k.name}</td>
                  <td style={{ padding: "12px 18px" }}>
                    <span style={{ fontFamily: "monospace", fontSize: 12, color: "#93c5fd", background: "#0e1928", padding: "3px 8px", borderRadius: 6 }}>{k.key_prefix}</span>
                  </td>
                  <td style={{ padding: "12px 18px" }}>
                    <span style={{ fontWeight: 800, fontSize: 15, color: Number(k.wallet_balance) > 0 ? "#4ade80" : "#f87171" }}>
                      GH₵{Number(k.wallet_balance).toFixed(2)}
                    </span>
                  </td>
                  <td style={{ padding: "12px 18px" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: k.active ? "#14532d" : "#3f1818", color: k.active ? "#4ade80" : "#f87171" }}>
                      {k.active ? "Active" : "Revoked"}
                    </span>
                  </td>
                  <td style={{ padding: "12px 18px", color: "#94a3b8", fontSize: 13 }}>{(k.requests_count || 0).toLocaleString()}</td>
                  <td style={{ padding: "12px 18px" }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => setTopupKey(k)}
                        style={{ fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 6, border: "none", background: "#14532d", color: "#4ade80", cursor: "pointer" }}>
                        + Top Up
                      </button>
                      <button onClick={() => handleToggle(k)}
                        style={{ fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 6, border: "1px solid #1e3050", background: "#0e1928", color: k.active ? "#fbbf24" : "#4ade80", cursor: "pointer" }}>
                        {k.active ? "Disable" : "Enable"}
                      </button>
                      <button onClick={() => { if (confirm(`Delete key "${k.name}"?`)) handleRevoke(k.id); }}
                        disabled={revoking === k.id}
                        style={{ fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 6, border: "none", background: "#3f1818", color: "#f87171", cursor: "pointer", opacity: revoking === k.id ? 0.5 : 1 }}>
                        {revoking === k.id ? "…" : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Developer documentation */}
      <div style={{ background: "#162032", border: "1px solid #1e3050", borderRadius: 14, padding: 18 }}>
        <p style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Developer Documentation</p>
        <p style={{ color: "#64748b", fontSize: 13, marginBottom: 14 }}>Share this with developers integrating with your platform.</p>

        <div style={{ marginBottom: 14 }}>
          <p style={{ color: "#94a3b8", fontSize: 12, fontWeight: 700, marginBottom: 6 }}>ENDPOINTS</p>
          <div style={CODE_STYLE}>{`GET  /api/v1/balance              → Check wallet balance
GET  /api/v1/bundles              → List bundles with api_price
POST /api/v1/purchase             → Buy data (deducts from wallet)
GET  /api/v1/orders/:reference    → Check order status`}</div>
        </div>

        <div style={{ marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <p style={{ color: "#94a3b8", fontSize: 12, fontWeight: 700, margin: 0 }}>CODE EXAMPLE</p>
            <CopyBtn text={sampleCode} />
          </div>
          <div style={CODE_STYLE}>{sampleCode}</div>
        </div>

      </div>
    </div>
  );
}
