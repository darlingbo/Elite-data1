"use client";
import { useEffect, useState } from "react";

/* Light-mode CSS injected as a <style> tag so !important can override inline styles */
const LIGHT_CSS = `
  html[data-theme="light"] body { background:#f0f4f8 !important; color:#0f172a !important; }

  /* nav bar */
  html[data-theme="light"] nav.sticky {
    background: rgba(255,255,255,0.97) !important;
    border-color: rgba(0,0,0,0.1) !important;
  }
  html[data-theme="light"] nav.sticky a:not(.text-white),
  html[data-theme="light"] nav.sticky span:not(.text-white),
  html[data-theme="light"] nav.sticky button:not(.text-white) { color: #1e3a8a !important; }
  html[data-theme="light"] nav.sticky a:hover { background: rgba(30,58,138,0.08) !important; }

  /* drawer */
  html[data-theme="light"] aside { background: #1e3a8a !important; }

  /* page shells that use the main dark bg */
  html[data-theme="light"] [style*="background: rgb(8, 15, 30)"],
  html[data-theme="light"] [style*="background:#080f1e"],
  html[data-theme="light"] [style*="background: #080f1e"] { background:#f0f4f8 !important; }

  html[data-theme="light"] [style*="background: rgb(13, 27, 46)"],
  html[data-theme="light"] [style*="background:#0d1b2e"],
  html[data-theme="light"] [style*="background: #0d1b2e"] { background:#ffffff !important; }

  html[data-theme="light"] [style*="background: rgb(14, 3, 34)"],
  html[data-theme="light"] [style*="background:#0e0322"],
  html[data-theme="light"] [style*="background: #0e0322"] { background:#f8fafc !important; }

  /* card borders */
  html[data-theme="light"] [style*="border-color: rgb(30, 58, 95)"],
  html[data-theme="light"] [style*="borderColor:#1e3a5f"],
  html[data-theme="light"] [style*="border: 1px solid rgb(30, 58, 95)"] { border-color:#e2e8f0 !important; }

  /* white text on dark → dark text */
  html[data-theme="light"] [style*="color: rgb(248, 250, 252)"],
  html[data-theme="light"] [style*="color:#f8fafc"],
  html[data-theme="light"] [style*="color: #f8fafc"] { color:#0f172a !important; }
  html[data-theme="light"] [style*="color: rgb(148, 163, 184)"],
  html[data-theme="light"] [style*="color:#94a3b8"],
  html[data-theme="light"] [style*="color: #94a3b8"] { color:#475569 !important; }
  html[data-theme="light"] [style*="color: rgb(100, 116, 139)"],
  html[data-theme="light"] [style*="color:#64748b"],
  html[data-theme="light"] [style*="color: #64748b"] { color:#334155 !important; }

  /* gradients used for page backgrounds */
  html[data-theme="light"] [style*="linear-gradient(135deg, rgb(6, 12, 28)"],
  html[data-theme="light"] [style*="linear-gradient(135deg,#060c1c"],
  html[data-theme="light"] [style*="background: linear-gradient(135deg, rgb(6"] { background:linear-gradient(135deg,#e0e7ff,#f0f4f8) !important; }

  /* min-height shells */
  html[data-theme="light"] [style*="min-height: 100vh"][style*="background"] { background:#f0f4f8 !important; }

  /* Tailwind utility overrides for public pages */
  html[data-theme="light"] .bg-gray-900  { background:#f8fafc !important; }
  html[data-theme="light"] .bg-slate-900 { background:#f1f5f9 !important; }
  html[data-theme="light"] .bg-blue-950  { background:#dbeafe !important; }
  html[data-theme="light"] .text-gray-300, html[data-theme="light"] .text-gray-400 { color:#475569 !important; }

  /* Agent portal: use a coherent light palette without changing brand-button text. */
  html[data-theme="light"] .agent-app-shell { background:#f1f5f9 !important; color:#0f172a !important; }
  html[data-theme="light"] .agent-app-shell .main-with-sidebar { background:#f1f5f9 !important; }
  html[data-theme="light"] .agent-app-shell .agent-desktop-header,
  html[data-theme="light"] .agent-app-shell .mobile-header {
    background:rgba(255,255,255,.96) !important;
    border-color:#dbe3ee !important;
    box-shadow:0 8px 28px rgba(15,23,42,.08);
  }
  html[data-theme="light"] .agent-app-shell .agent-desktop-header h1 { color:#0f172a !important; }
  html[data-theme="light"] .agent-app-shell .agent-desktop-header p { color:#526174 !important; }
  html[data-theme="light"] .agent-app-shell .agent-header-actions button:not(.agent-header-avatar) {
    color:#475569 !important; border-color:#dbe3ee !important; background:#fff !important;
  }
  html[data-theme="light"] .agent-app-shell input,
  html[data-theme="light"] .agent-app-shell textarea,
  html[data-theme="light"] .agent-app-shell select {
    background:#fff !important; color:#0f172a !important; border-color:#cbd5e1 !important;
  }
  html[data-theme="light"] .agent-app-shell input::placeholder,
  html[data-theme="light"] .agent-app-shell textarea::placeholder { color:#64748b !important; opacity:1; }
  html[data-theme="light"] .agent-app-shell option { background:#fff; color:#0f172a; }
  html[data-theme="light"] .agent-app-shell .pro-card {
    background:#fff !important; border-color:#dbe3ee !important; color:#0f172a !important;
    box-shadow:0 10px 30px rgba(15,23,42,.06);
  }
  html[data-theme="light"] .agent-app-shell .pro-balance small,
  html[data-theme="light"] .agent-app-shell .pro-metric small,
  html[data-theme="light"] .agent-app-shell .pro-metric span,
  html[data-theme="light"] .agent-app-shell .pro-orders-head p,
  html[data-theme="light"] .agent-app-shell .pro-empty,
  html[data-theme="light"] .agent-app-shell .pro-order-info small { color:#526987 !important; }
  html[data-theme="light"] .agent-app-shell .pro-order-row {
    color:#0f172a !important; border-color:#e2e8f0 !important;
  }
  html[data-theme="light"] .agent-app-shell .pro-order-row:hover { background:#f8fafc !important; }
  html[data-theme="light"] .agent-app-shell .pro-orders-head button,
  html[data-theme="light"] .agent-app-shell .pro-chevron { color:#3f5d83 !important; }
  html[data-theme="light"] .agent-app-shell .pro-shortcuts > button:hover { border-color:#93b4dc !important; }
  html[data-theme="light"] .agent-app-shell .bottom-nav > div {
    background:rgba(255,255,255,.97) !important;
    box-shadow:0 8px 28px rgba(15,23,42,.16),0 0 0 1px #dbe3ee !important;
  }
  html[data-theme="light"] .agent-app-shell button[style*="color: white"],
  html[data-theme="light"] .agent-app-shell a[style*="color: white"],
  html[data-theme="light"] .agent-app-shell .text-white { color:#fff !important; }

  /* Welcome modal is converted to a true light card as a single component. */
  html[data-theme="light"] .welcome-popup-card { background:#fff !important; border-color:#dbe3ee !important; }
  html[data-theme="light"] .welcome-popup-card h2 { color:#0f172a !important; }
  html[data-theme="light"] .welcome-popup-card p { color:#475569 !important; }
  html[data-theme="light"] .welcome-popup-card > button:last-child { color:#475569 !important; }
`;

export default function ThemeToggle() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("elite-theme");
    const isDark = saved ? saved === "dark" : true;
    setDark(isDark);
    applyTheme(isDark);
  }, []);

  function applyTheme(isDark: boolean) {
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
    let tag = document.getElementById("elite-light-css") as HTMLStyleElement | null;
    if (!isDark) {
      if (!tag) {
        tag = document.createElement("style");
        tag.id = "elite-light-css";
        document.head.appendChild(tag);
      }
      tag.textContent = LIGHT_CSS;
    } else {
      tag?.remove();
    }
  }

  function toggle() {
    const next = !dark;
    setDark(next);
    localStorage.setItem("elite-theme", next ? "dark" : "light");
    applyTheme(next);
  }

  return (
    <>
      <style>{`
        .bloom-switch { display:inline-block; cursor:pointer; }
        .bloom-switch input { position:absolute; opacity:0; pointer-events:none; width:0; height:0; }
        .bloom-switch__track {
          display:inline-block; position:relative;
          width:4.5rem; height:2.2rem; border-radius:999px;
          background:linear-gradient(120deg,#1f0a4a,#0e0322);
          border:1px solid rgba(165,123,255,0.4);
          box-shadow:inset 0 2px 6px rgba(0,0,0,0.45);
          transition:background 320ms cubic-bezier(.22,1,.36,1), border-color 320ms cubic-bezier(.22,1,.36,1);
          overflow:hidden;
        }
        .bloom-switch__thumb {
          position:absolute; top:50%; left:0.2rem;
          width:1.75rem; height:1.75rem; border-radius:50%;
          background:#ffd23f; display:grid; place-items:center;
          transform:translateY(-50%);
          transition:left 360ms cubic-bezier(.34,1.56,.64,1), background 320ms cubic-bezier(.22,1,.36,1), box-shadow 320ms cubic-bezier(.22,1,.36,1);
          color:#0e0322; box-shadow:0 0 16px rgba(255,210,63,0.55);
        }
        .bloom-switch__sun, .bloom-switch__moon {
          position:absolute; width:1rem; height:1rem;
          transition:opacity 220ms cubic-bezier(.22,1,.36,1), transform 320ms cubic-bezier(.22,1,.36,1);
        }
        .bloom-switch__moon { opacity:0; transform:rotate(-60deg) scale(0.8); }
        .bloom-switch__star {
          position:absolute; width:4px; height:4px; border-radius:50%;
          background:#fbf5ff; opacity:0;
          transition:opacity 320ms cubic-bezier(.22,1,.36,1), transform 360ms cubic-bezier(.22,1,.36,1);
        }
        .bloom-switch__star--1 { top:22%; left:58%; transform:scale(0.4); }
        .bloom-switch__star--2 { top:55%; left:70%; width:3px; height:3px; transform:scale(0.4); }
        .bloom-switch__star--3 { top:38%; left:82%; width:2px; height:2px; transform:scale(0.4); }
        .bloom-switch input:checked ~ .bloom-switch__track {
          background:linear-gradient(120deg,#150633,#0e0322);
          border-color:rgba(165,123,255,0.55);
        }
        .bloom-switch input:checked ~ .bloom-switch__track .bloom-switch__thumb {
          left:calc(100% - 1.95rem); background:#fbf5ff; color:#1f0a4a;
          box-shadow:0 0 16px rgba(165,123,255,0.6);
        }
        .bloom-switch input:checked ~ .bloom-switch__track .bloom-switch__sun { opacity:0; transform:rotate(60deg) scale(0.6); }
        .bloom-switch input:checked ~ .bloom-switch__track .bloom-switch__moon { opacity:1; transform:rotate(0) scale(1); }
        .bloom-switch input:checked ~ .bloom-switch__track .bloom-switch__star { opacity:1; transform:scale(1); }
        .bloom-switch input:focus-visible ~ .bloom-switch__track { outline:2px solid #ffd23f; outline-offset:3px; }
      `}</style>

      <label className="bloom-switch" title={dark ? "Switch to light mode" : "Switch to dark mode"}>
        <input type="checkbox" checked={dark} onChange={toggle} />
        <span className="bloom-switch__track">
          <span className="bloom-switch__thumb">
            <svg className="bloom-switch__sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
            <svg className="bloom-switch__moon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          </span>
          <span className="bloom-switch__star bloom-switch__star--1" />
          <span className="bloom-switch__star bloom-switch__star--2" />
          <span className="bloom-switch__star bloom-switch__star--3" />
        </span>
      </label>
    </>
  );
}
