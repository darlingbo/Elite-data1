"use client";
import { useState, useEffect } from "react";

const D = { bg: "#0d1117", card: "#161b22", border: "#21262d", text: "#e6edf3", muted: "#8b949e" };

const themes = [
  { id: "blue",   label: "Blue",   color: "#3b82f6", preview: "linear-gradient(135deg,#060d2e,#0f2562,#2563eb)" },
  { id: "gold",   label: "Gold",   color: "#f59e0b", preview: "linear-gradient(135deg,#1c0a00,#78350f,#d97706)" },
  { id: "purple", label: "Purple", color: "#8b5cf6", preview: "linear-gradient(135deg,#0d0526,#3b0764,#7c3aed)" },
  { id: "green",  label: "Green",  color: "#22c55e", preview: "linear-gradient(135deg,#011a0a,#14532d,#16a34a)" },
];

export default function PromoBannerAdmin() {
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState("");
  const [submessage, setSubmessage] = useState("");
  const [theme, setTheme] = useState("blue");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/admin/promo-banner")
      .then(r => r.json())
      .then(d => { setEnabled(d.enabled ?? false); setMessage(d.message ?? ""); setSubmessage(d.submessage ?? ""); setTheme(d.theme ?? "blue"); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/admin/promo-banner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, message, submessage, theme }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }

  if (loading) return <div style={{ color: D.muted, padding: 40, textAlign: "center" }}>Loading…</div>;

  return (
    <div className="admin-section" style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 760 }}>
      {/* Header */}
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 900, color: D.text, margin: 0 }}>Monthly Promo Banner</h2>
        <p style={{ fontSize: 13, color: D.muted, margin: "4px 0 0" }}>
          An animated mascot banner shown at the top of your site. Perfect for monthly deals.
        </p>
      </div>

      <div style={{ background: D.card, borderRadius: 14, padding: 24, border: `1px solid ${D.border}`, display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Enable toggle */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <p style={{ fontSize: 15, fontWeight: 700, color: D.text, margin: 0 }}>Show Banner</p>
            <p style={{ fontSize: 12, color: D.muted, margin: "2px 0 0" }}>Turns the mascot animation on or off on the homepage</p>
          </div>
          <button
            onClick={() => setEnabled(!enabled)}
            style={{
              width: 52, height: 28, borderRadius: 14, border: "none", cursor: "pointer",
              background: enabled ? "#22c55e" : D.border,
              position: "relative", transition: "background .2s",
            }}
          >
            <div style={{
              position: "absolute", top: 4, left: enabled ? 26 : 4,
              width: 20, height: 20, borderRadius: "50%", background: "#fff",
              transition: "left .2s", boxShadow: "0 1px 4px rgba(0,0,0,.3)",
            }} />
          </button>
        </div>

        {/* Message */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: D.muted, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 8 }}>
            Main Message *
          </label>
          <input
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="e.g. Get 5GB MTN for only GH₵15 this month!"
            maxLength={80}
            style={{
              width: "100%", background: D.bg, border: `1px solid ${D.border}`, borderRadius: 10,
              padding: "11px 14px", color: D.text, fontSize: 14, outline: "none", boxSizing: "border-box",
            }}
          />
          <p style={{ fontSize: 11, color: D.muted, margin: "4px 0 0" }}>{message.length}/80 characters</p>
        </div>

        {/* Submessage */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: D.muted, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 8 }}>
            Sub-message (optional)
          </label>
          <input
            value={submessage}
            onChange={e => setSubmessage(e.target.value)}
            placeholder="e.g. Limited time. Valid until end of month."
            maxLength={100}
            style={{
              width: "100%", background: D.bg, border: `1px solid ${D.border}`, borderRadius: 10,
              padding: "11px 14px", color: D.text, fontSize: 14, outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        {/* Theme picker */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: D.muted, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 10 }}>
            Color Theme
          </label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {themes.map(th => (
              <button
                key={th.id}
                onClick={() => setTheme(th.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "10px 16px",
                  borderRadius: 10, border: `2px solid ${theme === th.id ? th.color : D.border}`,
                  background: theme === th.id ? `${th.color}18` : D.bg,
                  cursor: "pointer", color: D.text, fontSize: 13, fontWeight: 700,
                  transition: "all .15s",
                }}
              >
                <div style={{ width: 20, height: 20, borderRadius: 6, background: th.preview, flexShrink: 0 }} />
                {th.label}
                {theme === th.id && <span style={{ color: th.color }}>✓</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Preview chip */}
        {message && (
          <div style={{ background: D.bg, borderRadius: 10, padding: "10px 14px", border: `1px solid ${D.border}` }}>
            <p style={{ fontSize: 11, color: D.muted, margin: "0 0 4px", textTransform: "uppercase", letterSpacing: 1 }}>Preview Text</p>
            <p style={{ fontSize: 16, fontWeight: 900, color: themes.find(t=>t.id===theme)?.color ?? "#60a5fa", margin: 0 }}>{message}</p>
            {submessage && <p style={{ fontSize: 12, color: D.muted, margin: "3px 0 0" }}>{submessage}</p>}
          </div>
        )}

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            background: saved ? "#22c55e" : "#3b82f6", color: "#fff", border: "none",
            borderRadius: 12, padding: "13px", fontSize: 14, fontWeight: 800,
            cursor: "pointer", opacity: saving ? 0.7 : 1, transition: "background .3s",
          }}
        >
          {saving ? "Saving…" : saved ? "✓ Saved!" : "Save Banner Settings"}
        </button>
      </div>

      <div style={{ background: "rgba(59,130,246,.08)", border: "1px solid rgba(59,130,246,.2)", borderRadius: 12, padding: "12px 16px" }}>
        <p style={{ fontSize: 12, color: "#60a5fa", margin: 0, lineHeight: 1.6 }}>
          💡 <b>Tip:</b> Update this every month with your best deal. The mascot animation plays automatically on the homepage. Visitors can close it and it won&apos;t show again that session.
        </p>
      </div>
    </div>
  );
}
