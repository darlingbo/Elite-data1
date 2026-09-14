"use client";

import { useSyncExternalStore } from "react";

const DISMISS_KEY = "elitedata_promo_messagepilot_dismissed";
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function getServerSnapshot() {
  return true;
}

function dismiss() {
  try {
    sessionStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // ignore
  }
  listeners.forEach((listener) => listener());
}

/** Slim sponsored strip above the public nav. Dismissible for the session. */
export default function PromoBanner() {
  const dismissed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (dismissed) return null;

  return (
    <div
      className="relative flex items-center justify-center gap-2 px-4 py-2.5 text-center"
      style={{
        background: "linear-gradient(90deg, rgba(59,130,246,0.16), rgba(139,92,246,0.16))",
        borderBottom: "1px solid rgba(148,163,184,0.16)",
      }}
    >
      <span
        className="hidden shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase sm:inline"
        style={{ background: "rgba(255,255,255,0.08)", color: "#9aa9bd" }}
      >
        Ad
      </span>
      <p className="text-xs font-medium sm:text-sm" style={{ color: "#f8fafc" }}>
        📢 Reselling? Send SMS to your customers with{" "}
        <strong
          className="font-extrabold"
          style={{
            background: "linear-gradient(90deg,#3b82f6,#8b5cf6)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          MessagePilot
        </strong>{" "}
        — orders, OTPs &amp; more. Free Sender ID, from GH₵0.045/text.
      </p>
      <a
        href="https://messagepilot.online"
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold whitespace-nowrap text-white sm:text-sm"
        style={{ background: "linear-gradient(90deg,#3b82f6,#8b5cf6)" }}
      >
        Get started →
      </a>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-3 text-lg leading-none"
        style={{ color: "#9aa9bd" }}
      >
        ×
      </button>
    </div>
  );
}
