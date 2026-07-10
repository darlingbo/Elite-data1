"use client";
import { useEffect, useState } from "react";

const WA_URL = "https://whatsapp.com/channel/0029Vb8BFMA42DchXuWWOu3z";
const TG_URL = "https://t.me/elitedata1";
const STORAGE_KEY = "elite_welcome_seen";

export default function WelcomePopup() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        const t = setTimeout(() => setVisible(true), 1500);
        return () => clearTimeout(t);
      }
    } catch {}
  }, []);

  function dismiss() {
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch {}
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      onClick={dismiss}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, animation: "fadeIn .25s ease",
      }}
    >
      <style>{`
        @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
        @keyframes slideUp { from { opacity:0; transform:translateY(32px) scale(.97) } to { opacity:1; transform:translateY(0) scale(1) } }
      `}</style>

      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#0d1b2e", borderRadius: 24, padding: "32px 28px 28px",
          maxWidth: 360, width: "100%", textAlign: "center", position: "relative",
          border: "1px solid #1e3a5f",
          boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
          animation: "slideUp .35s cubic-bezier(.22,1,.36,1)",
        }}
      >
        {/* Close */}
        <button
          onClick={dismiss}
          style={{ position: "absolute", top: 14, right: 14, background: "rgba(255,255,255,0.08)", border: "none", color: "#94a3b8", width: 32, height: 32, borderRadius: 99, fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
        >✕</button>

        {/* Icon */}
        <div style={{ width: 64, height: 64, borderRadius: 20, background: "linear-gradient(135deg,#25d366,#128c7e)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, margin: "0 auto 16px" }}>
          📢
        </div>

        <h2 style={{ color: "#f1f5f9", fontWeight: 900, fontSize: 20, margin: "0 0 8px" }}>
          Stay Connected!
        </h2>
        <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 24px", lineHeight: 1.6 }}>
          Join our channels to get the latest deals, bundle updates and exclusive offers.
        </p>

        {/* WhatsApp */}
        <a
          href={WA_URL}
          target="_blank"
          rel="noreferrer"
          onClick={dismiss}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
            background: "linear-gradient(135deg,#25d366,#128c7e)",
            color: "white", textDecoration: "none", borderRadius: 14,
            padding: "14px 20px", fontWeight: 800, fontSize: 15,
            marginBottom: 12, boxShadow: "0 4px 20px rgba(37,211,102,0.35)",
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          Follow on WhatsApp
        </a>

        {/* Telegram */}
        <a
          href={TG_URL}
          target="_blank"
          rel="noreferrer"
          onClick={dismiss}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
            background: "linear-gradient(135deg,#229ed9,#1a7fad)",
            color: "white", textDecoration: "none", borderRadius: 14,
            padding: "14px 20px", fontWeight: 800, fontSize: 15,
            marginBottom: 20, boxShadow: "0 4px 20px rgba(34,158,217,0.35)",
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
          Follow on Telegram
        </a>

        <button
          onClick={dismiss}
          style={{ background: "transparent", border: "none", color: "#475569", fontSize: 13, cursor: "pointer", textDecoration: "underline" }}
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}
