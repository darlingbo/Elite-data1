"use client";

import { useSyncExternalStore } from "react";
import Icon from "@/components/ed/Icon";

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
    <div className="ed-promo">
      <span className="ed-promo-ad">Ad</span>
      <p>Reselling? Send SMS to your customers with <b>MessagePilot</b>. Free Sender ID, from GH₵0.045 a text.</p>
      <a href="https://messagepilot.online" target="_blank" rel="noopener noreferrer" className="ed-btn b" style={{ minHeight: 36, fontSize: 12, padding: "0 12px" }}>Get started</a>
      <button type="button" onClick={dismiss} aria-label="Dismiss this ad" className="ed-ibtn plain" style={{ width: 40, height: 40, color: "var(--ed-muted)" }}><Icon name="x" small /></button>
    </div>
  );
}
