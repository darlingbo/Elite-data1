"use client";
import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("elite-theme");
    const isDark = saved ? saved === "dark" : true;
    setDark(isDark);
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    localStorage.setItem("elite-theme", next ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
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
            {/* Sun */}
            <svg className="bloom-switch__sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
            {/* Moon */}
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
