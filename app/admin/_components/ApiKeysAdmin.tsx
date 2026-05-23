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

export default function ApiKeysAdmin() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKeyResult, setNewKeyResult] = useState<{ fullKey: string; name: string } | null>(null);
  const [error, setError] = useState("");
  const [revoking, setRevoking] = useState<string | null>(null);

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
    setCreating(true);
    setError("");
    const res = await fetch("/api/admin/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    const data = await res.json();
    setCreating(false);
    if (data.fullKey) {
      setNewKeyResult({ fullKey: data.fullKey, name: data.key.name });
      setNewName("");
      load();
    } else {
      setError(data.error ?? "Failed to create key.");
    }
  }

  async function handleRevoke(id: string) {
    setRevoking(id);
    await fetch("/api/admin/api-keys", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setRevoking(null);
    load();
  }

  async function handleToggle(key: ApiKey) {
    await fetch("/api/admin/api-keys", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: key.id, active: !key.active }),
    });
    load();
  }

  const sqlSetup = `-- Run this once in Supabase SQL editor:
CREATE TABLE IF NOT EXISTS api_keys (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  key text UNIQUE NOT NULL,
  key_prefix text NOT NULL,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  last_used_at timestamptz,
  requests_count integer DEFAULT 0
);

CREATE OR REPLACE FUNCTION increment_api_key_requests(p_key_id uuid)
RETURNS void LANGUAGE sql AS $$
  UPDATE api_keys SET requests_count = requests_count + 1 WHERE id = p_key_id;
$$;`;

  const sampleCode = `// JavaScript / Node.js example
const BASE_URL = "${BASE_URL}";
const API_KEY  = "elite_your_key_here";

// 1. List available bundles
const bundles = await fetch(\`\${BASE_URL}/api/v1/bundles\`, {
  headers: { Authorization: \`Bearer \${API_KEY}\` }
}).then(r => r.json());

// 2. Create an order (after Paystack payment)
const order = await fetch(\`\${BASE_URL}/api/v1/orders\`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: \`Bearer \${API_KEY}\` },
  body: JSON.stringify({
    name: "Kwame Mensah",
    email: "kwame@example.com",
    phone: "0241234567",
    bundleId: "mtn-5gb",
    paystackRef: "elite-1716000000000"
  })
}).then(r => r.json());

// 3. Check order status
const status = await fetch(\`\${BASE_URL}/api/v1/orders/\${order.reference}\`, {
  headers: { Authorization: \`Bearer \${API_KEY}\` }
}).then(r => r.json());`;

  return (
    <div className="space-y-6">
      <div>
        <h2 style={{ color: "#f1f5f9", fontWeight: 900, fontSize: 22, margin: 0 }}>API Keys</h2>
        <p style={{ color: "#64748b", fontSize: 14, marginTop: 4 }}>
          Give developers access to your platform programmatically.
        </p>
      </div>

      {/* SQL setup notice */}
      <div style={{ background: "#162032", border: "1px solid #1e3050", borderRadius: 14, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <p style={{ color: "#fbbf24", fontWeight: 700, fontSize: 13, margin: 0 }}>
            ⚠ One-time Supabase setup required
          </p>
          <CopyBtn text={sqlSetup} />
        </div>
        <div style={CODE_STYLE}>{sqlSetup}</div>
        <p style={{ color: "#64748b", fontSize: 12, marginTop: 8 }}>
          Run this in your Supabase dashboard → SQL Editor, once. After that, API keys will work.
        </p>
      </div>

      {/* Create new key */}
      <div style={{ background: "#162032", border: "1px solid #1e3050", borderRadius: 14, padding: 18 }}>
        <p style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Create New API Key</p>
        {error && <p style={{ color: "#f87171", fontSize: 13, marginBottom: 10 }}>{error}</p>}
        <div style={{ display: "flex", gap: 10 }}>
          <input
            type="text"
            placeholder="Key name (e.g. My App)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            style={{ flex: 1, background: "#0e1928", border: "1px solid #1e3050", borderRadius: 8, padding: "10px 14px", color: "#f1f5f9", fontSize: 14, outline: "none" }}
          />
          <button
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            style={{ background: "linear-gradient(90deg,#3b82f6,#8b5cf6)", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer", opacity: creating || !newName.trim() ? 0.6 : 1 }}>
            {creating ? "Creating…" : "Generate Key"}
          </button>
        </div>
      </div>

      {/* Newly created key — shown ONCE */}
      {newKeyResult && (
        <div style={{ background: "#0a2a1f", border: "1.5px solid #15803d", borderRadius: 14, padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <p style={{ color: "#4ade80", fontWeight: 800, fontSize: 15, margin: 0 }}>
              ✓ Key created: {newKeyResult.name}
            </p>
            <CopyBtn text={newKeyResult.fullKey} />
          </div>
          <div style={CODE_STYLE}>{newKeyResult.fullKey}</div>
          <p style={{ color: "#f87171", fontSize: 12, marginTop: 10, fontWeight: 700 }}>
            Copy this key now — it will not be shown again.
          </p>
          <button
            onClick={() => setNewKeyResult(null)}
            style={{ marginTop: 8, background: "none", border: "none", color: "#64748b", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>
            I&apos;ve saved it, dismiss
          </button>
        </div>
      )}

      {/* Keys list */}
      <div style={{ background: "#162032", border: "1px solid #1e3050", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid #1e3050" }}>
          <p style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 15, margin: 0 }}>Active Keys</p>
        </div>
        {loading ? (
          <p style={{ textAlign: "center", color: "#475569", padding: "40px 0", fontSize: 14 }}>Loading…</p>
        ) : keys.length === 0 ? (
          <p style={{ textAlign: "center", color: "#475569", padding: "40px 0", fontSize: 14 }}>No API keys yet. Create one above.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #1e3050" }}>
                {["Name", "Key Prefix", "Status", "Requests", "Last Used", "Actions"].map((h) => (
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
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: k.active ? "#14532d" : "#3f1818", color: k.active ? "#4ade80" : "#f87171" }}>
                      {k.active ? "Active" : "Revoked"}
                    </span>
                  </td>
                  <td style={{ padding: "12px 18px", color: "#94a3b8", fontSize: 13 }}>{k.requests_count.toLocaleString()}</td>
                  <td style={{ padding: "12px 18px", color: "#64748b", fontSize: 12 }}>
                    {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" }) : "Never"}
                  </td>
                  <td style={{ padding: "12px 18px" }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => handleToggle(k)}
                        style={{ fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 6, border: "1px solid #1e3050", background: "#0e1928", color: k.active ? "#fbbf24" : "#4ade80", cursor: "pointer" }}>
                        {k.active ? "Disable" : "Enable"}
                      </button>
                      <button
                        onClick={() => { if (confirm(`Delete key "${k.name}"? This cannot be undone.`)) handleRevoke(k.id); }}
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
        <p style={{ color: "#64748b", fontSize: 13, marginBottom: 14 }}>Share this with developers who want to integrate with your platform.</p>

        <div style={{ marginBottom: 14 }}>
          <p style={{ color: "#94a3b8", fontSize: 12, fontWeight: 700, marginBottom: 6 }}>BASE URL</p>
          <div style={{ ...CODE_STYLE, padding: "10px 14px" }}>{BASE_URL}</div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <p style={{ color: "#94a3b8", fontSize: 12, fontWeight: 700, marginBottom: 6 }}>ENDPOINTS</p>
          <div style={CODE_STYLE}>{`GET  /api/v1/bundles              → List all active bundles
POST /api/v1/orders               → Create order (after Paystack payment)
GET  /api/v1/orders/:reference    → Check order status`}</div>
        </div>

        <div style={{ marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <p style={{ color: "#94a3b8", fontSize: 12, fontWeight: 700, margin: 0 }}>CODE EXAMPLE (JavaScript)</p>
            <CopyBtn text={sampleCode} />
          </div>
          <div style={CODE_STYLE}>{sampleCode}</div>
        </div>

        <div style={{ marginTop: 14, padding: "12px 14px", background: "#0e1928", borderRadius: 10, border: "1px solid #1e3050" }}>
          <p style={{ color: "#94a3b8", fontSize: 12, fontWeight: 700, marginBottom: 6 }}>AUTHENTICATION</p>
          <p style={{ color: "#64748b", fontSize: 12, margin: 0 }}>
            All requests must include the header: <span style={{ color: "#93c5fd", fontFamily: "monospace" }}>Authorization: Bearer elite_your_key</span>
          </p>
          <p style={{ color: "#64748b", fontSize: 12, marginTop: 6, margin: 0 }}>
            For orders, the Paystack payment must already be completed by the customer before calling <span style={{ color: "#93c5fd", fontFamily: "monospace" }}>POST /api/v1/orders</span>. Pass the Paystack reference as <span style={{ color: "#93c5fd", fontFamily: "monospace" }}>paystackRef</span>.
          </p>
        </div>
      </div>
    </div>
  );
}
