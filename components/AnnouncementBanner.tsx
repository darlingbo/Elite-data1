"use client";
import { useState, useEffect } from "react";

interface Announcement {
  id: string;
  message: string;
}

export default function AnnouncementBanner({ target }: { target: "customers" | "agents" | "agents_commission" | "agents_custom_price" }) {
  const [items, setItems] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch(`/api/announcements?target=${target}`)
      .then((r) => r.json())
      .then((d) => setItems(d.announcements ?? []))
      .catch(() => {});
  }, [target]);

  const visible = items.filter((a) => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      {visible.map((a) => (
        <div key={a.id} className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <span className="text-lg shrink-0">📢</span>
          <p className="flex-1 text-sm text-amber-800 font-medium leading-snug">{a.message}</p>
          <button onClick={() => setDismissed((s) => new Set([...s, a.id]))}
            className="shrink-0 text-amber-400 hover:text-amber-600 transition-colors text-lg leading-none mt-0.5">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
