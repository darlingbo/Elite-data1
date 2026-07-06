"use client";
import { useState, useEffect } from "react";

interface Announcement {
  id: string;
  message: string;
  display_type?: "banner" | "popup";
  link_url?: string | null;
  link_text?: string | null;
}

const STORAGE_KEY = "elitedata_dismissed_announcements";

function getDismissed(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"); } catch { return {}; }
}

function dismiss(id: string) {
  const d = getDismissed();
  d[id] = Date.now() + 24 * 60 * 60 * 1000; // hide for 24h
  localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
}

function isVisible(id: string): boolean {
  const d = getDismissed();
  return !d[id] || Date.now() > d[id];
}

export default function AnnouncementBanner({ target }: { target: "customers" | "agents" | "agents_commission" | "agents_custom_price" }) {
  const [items, setItems] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch(`/api/announcements?target=${target}`)
      .then((r) => r.json())
      .then((d) => {
        const all: Announcement[] = d.announcements ?? [];
        // Filter out ones already dismissed in localStorage
        const visible = all.filter((a) => isVisible(a.id));
        setItems(visible);
      })
      .catch(() => {});
  }, [target]);

  function handleDismiss(id: string) {
    dismiss(id);
    setDismissed((s) => new Set([...s, id]));
  }

  const visible = items.filter((a) => !dismissed.has(a.id));
  const banners = visible.filter((a) => (a.display_type ?? "banner") === "banner");
  const popups  = visible.filter((a) => a.display_type === "popup");
  const topPopup = popups[0] ?? null; // show one popup at a time

  return (
    <>
      {/* ── Banner announcements ── */}
      {banners.length > 0 && (
        <div className="space-y-2 mb-4">
          {banners.map((a) => (
            <div key={a.id} className="flex items-start gap-3 rounded-xl px-4 py-3"
              style={{ background: "#fff8e7", border: "1px solid #fcd34d" }}>
              <span className="text-lg shrink-0">📢</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold leading-snug" style={{ color: "#92400e" }}>{a.message}</p>
                {a.link_url && (
                  <a href={a.link_url} target="_blank" rel="noopener noreferrer"
                    className="inline-block mt-2 text-xs font-black px-3 py-1.5 rounded-lg"
                    style={{ background: "#f59e0b", color: "#fff" }}>
                    {a.link_text || "Learn More"} →
                  </a>
                )}
              </div>
              <button onClick={() => handleDismiss(a.id)}
                className="shrink-0 text-lg leading-none mt-0.5"
                style={{ color: "#d97706" }}>×</button>
            </div>
          ))}
        </div>
      )}

      {/* ── Popup announcement (modal) ── */}
      {topPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={() => handleDismiss(topPopup.id)}>
          <div className="relative w-full max-w-sm rounded-2xl p-6 shadow-2xl"
            style={{ background: "#0d1117", border: "1px solid #30363d" }}
            onClick={(e) => e.stopPropagation()}>
            {/* Close button */}
            <button onClick={() => handleDismiss(topPopup.id)}
              className="absolute top-3 right-4 text-2xl font-light"
              style={{ color: "#8b949e" }}>×</button>

            {/* Icon */}
            <div className="text-4xl text-center mb-3">📢</div>

            {/* Message */}
            <p className="text-center font-bold text-base leading-relaxed mb-4"
              style={{ color: "#e6edf3" }}>
              {topPopup.message}
            </p>

            {/* Action button */}
            {topPopup.link_url && (
              <a href={topPopup.link_url} target="_blank" rel="noopener noreferrer"
                className="block w-full text-center py-3 rounded-xl font-black text-white mb-3"
                style={{ background: "linear-gradient(90deg,#3b82f6,#8b5cf6)" }}>
                {topPopup.link_text || "Join Now"} →
              </a>
            )}

            <button onClick={() => handleDismiss(topPopup.id)}
              className="block w-full text-center py-2 rounded-xl text-sm font-semibold"
              style={{ color: "#8b949e", background: "#161b22", border: "1px solid #30363d" }}>
              Maybe Later
            </button>
          </div>
        </div>
      )}
    </>
  );
}
