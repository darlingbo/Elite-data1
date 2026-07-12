"use client";
import { useState, useEffect } from "react";

interface Announcement {
  id: string;
  message: string;
  target: "all" | "customers" | "agents" | "agents_commission" | "agents_custom_price";
  expires_at: string | null;
  show_from_hour: number | null;
  show_to_hour: number | null;
  display_type?: "banner" | "popup";
  link_url?: string | null;
  link_text?: string | null;
  active: boolean;
  created_at: string;
}

const TARGET_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  all:                 { label: "Everyone",           color: "#60a5fa", bg: "#1e3050" },
  customers:           { label: "Customers Only",     color: "#4ade80", bg: "#14532d" },
  agents:              { label: "All Agents",         color: "#c084fc", bg: "#3b1f5e" },
  agents_commission:   { label: "Commission Agents",  color: "#fb923c", bg: "#431a07" },
  agents_custom_price: { label: "Price Mode Agents",  color: "#fbbf24", bg: "#2a1a00" },
};

type HourSchedule = "always" | "evening" | "daytime";

const HOUR_SCHEDULES: { id: HourSchedule; label: string; sub: string; from: number | null; to: number | null }[] = [
  { id: "always",  label: "All Day",       sub: "Always visible",        from: null, to: null },
  { id: "evening", label: "6 PM – 6 AM",   sub: "Evening & night only",  from: 18,   to: 6   },
  { id: "daytime", label: "6 AM – 6 PM",   sub: "Daytime only",          from: 6,    to: 18  },
];

const SQL = `-- Run once in Supabase SQL Editor:
CREATE TABLE IF NOT EXISTS announcements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  message text NOT NULL,
  target text NOT NULL DEFAULT 'all',
  expires_at timestamptz,
  show_from_hour integer,
  show_to_hour integer,
  display_type text DEFAULT 'banner',
  link_url text,
  link_text text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- If the table already exists, add the new columns:
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS show_from_hour integer;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS show_to_hour integer;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS display_type text DEFAULT 'banner';
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS link_url text;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS link_text text;`;

function timeLeft(expires_at: string | null): string {
  if (!expires_at) return "Never expires";
  const diff = new Date(expires_at).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}

function scheduleLabel(a: Announcement): string {
  if (a.show_from_hour === null || a.show_from_hour === undefined) return "";
  if (a.show_from_hour === 18 && a.show_to_hour === 6) return "🌙 6 PM–6 AM only";
  if (a.show_from_hour === 6 && a.show_to_hour === 18) return "☀️ 6 AM–6 PM only";
  return `🕐 ${a.show_from_hour}:00–${a.show_to_hour}:00`;
}

export default function AnnouncementsAdmin() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [target, setTarget] = useState<"all" | "customers" | "agents" | "agents_commission" | "agents_custom_price">("all");
  const [duration, setDuration] = useState("168");
  const [hourSchedule, setHourSchedule] = useState<HourSchedule>("always");
  const [displayType, setDisplayType] = useState<"banner" | "popup">("banner");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkText, setLinkText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  // Store control
  const [storeOpen, setStoreOpen] = useState<boolean | null>(null);
  const [closedMsg, setClosedMsg] = useState("");
  const [storeLoading, setStoreLoading] = useState(false);
  const [storeSaved, setStoreSaved] = useState("");
  // Helpline control
  const [helplineEnabled, setHelplineEnabled] = useState<boolean | null>(null);
  const [helplineLoading, setHelplineLoading] = useState(false);
  const [helplineSaved, setHelplineSaved] = useState("");

  useEffect(() => {
    fetch("/api/admin/store-status").then(r => r.json()).then(d => {
      setStoreOpen(d.open !== false);
      setClosedMsg(d.closedMessage ?? "");
      setHelplineEnabled(d.helplineEnabled !== false);
    }).catch(() => { setStoreOpen(true); setHelplineEnabled(true); });
  }, []);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/announcements");
    const data = await res.json();
    setAnnouncements(data.announcements ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handlePost() {
    if (!message.trim()) return setError("Message cannot be empty.");
    setSaving(true);
    setError("");

    const expires_at = duration
      ? new Date(Date.now() + Number(duration) * 60 * 60 * 1000).toISOString()
      : null;

    const sched = HOUR_SCHEDULES.find((s) => s.id === hourSchedule)!;

    const res = await fetch("/api/admin/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        target,
        expires_at,
        show_from_hour: sched.from,
        show_to_hour: sched.to,
        display_type: displayType,
        link_url: linkUrl.trim() || null,
        link_text: linkText.trim() || null,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (data.announcement) {
      setMessage("");
      setDuration("168");
      setTarget("all");
      setHourSchedule("always");
      setDisplayType("banner");
      setLinkUrl("");
      setLinkText("");
      load();
    } else {
      setError(data.error ?? "Failed to post.");
    }
  }

  async function handleToggle(a: Announcement) {
    await fetch("/api/admin/announcements", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: a.id, active: !a.active }),
    });
    load();
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    await fetch("/api/admin/announcements", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setDeleting(null);
    load();
  }

  async function toggleStore() {
    const newState = !storeOpen;
    setStoreOpen(newState);
    setStoreLoading(true);
    await fetch("/api/admin/store-status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ open: newState }) }).catch(() => {});
    setStoreLoading(false);
    setStoreSaved(newState ? "Store is now OPEN" : "Store is now CLOSED");
    setTimeout(() => setStoreSaved(""), 3000);
  }

  async function toggleHelpline() {
    const newState = !helplineEnabled;
    setHelplineEnabled(newState);
    setHelplineLoading(true);
    await fetch("/api/admin/store-status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ helplineEnabled: newState }) }).catch(() => {});
    setHelplineLoading(false);
    setHelplineSaved(newState ? "Helpline is now VISIBLE" : "Helpline is now HIDDEN");
    setTimeout(() => setHelplineSaved(""), 3000);
  }

  async function saveClosedMessage() {
    setStoreLoading(true);
    await fetch("/api/admin/store-status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ closedMessage: closedMsg }) }).catch(() => {});
    setStoreLoading(false);
    setStoreSaved("Message saved!");
    setTimeout(() => setStoreSaved(""), 3000);
  }

  const active = announcements.filter((a) => a.active);
  const inactive = announcements.filter((a) => !a.active);

  return (
    <div className="space-y-6">
      <div>
        <h2 style={{ color: "#f1f5f9", fontWeight: 900, fontSize: 22, margin: 0 }}>Notifications</h2>
        <p style={{ color: "#64748b", fontSize: 14, marginTop: 4 }}>
          Send banner messages to customers and agents, or close the whole store with a custom message.
        </p>
      </div>

      {/* ── Store Control ── */}
      <div style={{ background: "#162032", border: "1px solid #1e3050", borderRadius: 16, padding: 20 }}>
        <h3 style={{ color: "#f1f5f9", fontWeight: 800, fontSize: 18, margin: "0 0 4px" }}>Announcements &amp; Store Control</h3>
        <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 18px" }}>Send banner messages, or close the whole store with a custom message.</p>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: storeOpen !== false ? "#4ade80" : "#f87171", display: "inline-block", boxShadow: storeOpen !== false ? "0 0 6px #4ade80" : "0 0 6px #f87171" }} />
          <span style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 16 }}>Store is {storeOpen !== false ? "OPEN" : "CLOSED"}</span>
        </div>
        <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 14px" }}>
          When closed, the buy page and all agent stores show your message instead of the shop.
        </p>
        <button
          onClick={toggleStore}
          disabled={storeLoading || storeOpen === null}
          style={{
            background: storeOpen !== false ? "#dc2626" : "#16a34a",
            color: "#fff", border: "none", borderRadius: 12,
            padding: "12px 28px", fontWeight: 800, fontSize: 14,
            cursor: "pointer", opacity: storeLoading ? 0.6 : 1, marginBottom: 18,
          }}>
          {storeLoading ? "Saving…" : storeOpen !== false ? "Close Store" : "Open Store"}
        </button>

        <p style={{ color: "#94a3b8", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
          Message to show customers when closed
        </p>
        <textarea
          rows={4}
          value={closedMsg}
          onChange={e => setClosedMsg(e.target.value)}
          placeholder="e.g. We're temporarily closed for maintenance. We'll be back soon!"
          style={{ width: "100%", background: "#0e1928", border: "1px solid #1e3050", borderRadius: 10, padding: "12px 14px", color: "#f1f5f9", fontSize: 14, resize: "vertical", outline: "none", boxSizing: "border-box", fontFamily: "inherit", marginBottom: 10 }}
        />
        <button
          onClick={saveClosedMessage}
          disabled={storeLoading}
          style={{ background: "#1e3a5f", color: "#60a5fa", border: "1px solid #1e4080", borderRadius: 10, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer", opacity: storeLoading ? 0.6 : 1 }}>
          {storeLoading ? "Saving…" : "Save Message"}
        </button>
        {storeSaved && <p style={{ color: "#4ade80", fontSize: 13, fontWeight: 700, marginTop: 8 }}>✓ {storeSaved}</p>}
      </div>

      {/* ── Helpline Control ── */}
      <div style={{ background: "#162032", border: "1px solid #1e3050", borderRadius: 16, padding: 20 }}>
        <h3 style={{ color: "#f1f5f9", fontWeight: 800, fontSize: 18, margin: "0 0 4px" }}>WhatsApp Helpline Button</h3>
        <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 18px" }}>
          The green &quot;Need Help?&quot; WhatsApp button at the bottom-right of every page. Turn it off when you are unavailable.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <span style={{
            width: 10, height: 10, borderRadius: "50%",
            background: helplineEnabled !== false ? "#4ade80" : "#f87171",
            display: "inline-block",
            boxShadow: helplineEnabled !== false ? "0 0 6px #4ade80" : "0 0 6px #f87171",
          }} />
          <span style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 16 }}>
            Helpline is {helplineEnabled !== false ? "ON — visible to customers" : "OFF — hidden from customers"}
          </span>
        </div>
        <button
          onClick={toggleHelpline}
          disabled={helplineLoading || helplineEnabled === null}
          style={{
            background: helplineEnabled !== false ? "#dc2626" : "#16a34a",
            color: "#fff", border: "none", borderRadius: 12,
            padding: "12px 28px", fontWeight: 800, fontSize: 14,
            cursor: "pointer", opacity: helplineLoading ? 0.6 : 1,
          }}>
          {helplineLoading ? "Saving…" : helplineEnabled !== false ? "Turn Off Helpline" : "Turn On Helpline"}
        </button>
        {helplineSaved && <p style={{ color: "#4ade80", fontSize: 13, fontWeight: 700, marginTop: 8 }}>✓ {helplineSaved}</p>}
      </div>

      {/* SQL setup */}
      <div style={{ background: "#162032", border: "1px solid #1e3050", borderRadius: 14, padding: 16 }}>
        <p style={{ color: "#fbbf24", fontWeight: 700, fontSize: 13, marginBottom: 8 }}>⚠ Supabase setup — run this once</p>
        <pre style={{ background: "#0e1928", border: "1px solid #1e3050", borderRadius: 8, padding: 12, fontFamily: "monospace", fontSize: 12, color: "#93c5fd", whiteSpace: "pre-wrap", margin: 0 }}>{SQL}</pre>
        <p style={{ color: "#64748b", fontSize: 12, marginTop: 8 }}>Run in Supabase → SQL Editor, then refresh.</p>
      </div>

      {/* Compose */}
      <div style={{ background: "#162032", border: "1px solid #1e3050", borderRadius: 14, padding: 20 }}>
        <p style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 15, marginBottom: 14 }}>New Announcement</p>

        {error && <p style={{ color: "#f87171", fontSize: 13, marginBottom: 10 }}>{error}</p>}

        <textarea
          rows={3}
          placeholder="Type your message… e.g. 'MTN bundles are experiencing delays. We apologise for any inconvenience.'"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          style={{ width: "100%", background: "#0e1928", border: "1px solid #1e3050", borderRadius: 10, padding: "12px 14px", color: "#f1f5f9", fontSize: 14, resize: "vertical", outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
        />

        <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
          {/* Target */}
          <div style={{ flex: 1, minWidth: 220 }}>
            <p style={{ color: "#94a3b8", fontSize: 11, fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Send To</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {/* Row 1 — broad targets */}
              <div style={{ display: "flex", gap: 6 }}>
                {(["all", "customers"] as const).map((t) => (
                  <button key={t} onClick={() => setTarget(t)}
                    style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "1px solid", fontWeight: 700, fontSize: 12, cursor: "pointer", transition: "all .15s",
                      borderColor: target === t ? TARGET_LABELS[t].color : "#1e3050",
                      background: target === t ? TARGET_LABELS[t].bg : "#0e1928",
                      color: target === t ? TARGET_LABELS[t].color : "#64748b" }}>
                    {t === "all" ? "Everyone" : "Customers"}
                  </button>
                ))}
              </div>
              {/* Row 2 — agent targets */}
              <div style={{ display: "flex", gap: 6 }}>
                {(["agents", "agents_commission", "agents_custom_price"] as const).map((t) => (
                  <button key={t} onClick={() => setTarget(t)}
                    style={{ flex: 1, padding: "7px 4px", borderRadius: 8, border: "1px solid", fontWeight: 700, fontSize: 11, cursor: "pointer", transition: "all .15s", textAlign: "center",
                      borderColor: target === t ? TARGET_LABELS[t].color : "#1e3050",
                      background: target === t ? TARGET_LABELS[t].bg : "#0e1928",
                      color: target === t ? TARGET_LABELS[t].color : "#64748b" }}>
                    {t === "agents" ? "All Agents" : t === "agents_commission" ? "Commission" : "Price Mode"}
                  </button>
                ))}
              </div>
              {target.startsWith("agents_") && (
                <p style={{ color: "#475569", fontSize: 11, marginTop: 2 }}>
                  {target === "agents_commission"
                    ? "Only agents in Commission mode will see this."
                    : "Only agents in Price Mode (custom price) will see this."}
                </p>
              )}
            </div>
          </div>

          {/* Duration */}
          <div style={{ flex: 1, minWidth: 160 }}>
            <p style={{ color: "#94a3b8", fontSize: 11, fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Disappears After</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[
                { label: "1h", val: "1" },
                { label: "6h", val: "6" },
                { label: "24h", val: "24" },
                { label: "3d", val: "72" },
                { label: "7d", val: "168" },
                { label: "Never", val: "" },
              ].map((opt) => (
                <button key={opt.val} onClick={() => setDuration(opt.val)}
                  style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid", fontWeight: 700, fontSize: 12, cursor: "pointer",
                    borderColor: duration === opt.val ? "#3b82f6" : "#1e3050",
                    background: duration === opt.val ? "#1e3a5f" : "#0e1928",
                    color: duration === opt.val ? "#60a5fa" : "#64748b" }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Visible Hours */}
        <div style={{ marginTop: 14 }}>
          <p style={{ color: "#94a3b8", fontSize: 11, fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Visible Hours (Ghana Time)</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {HOUR_SCHEDULES.map((s) => (
              <button key={s.id} onClick={() => setHourSchedule(s.id)}
                style={{
                  flex: 1,
                  minWidth: 100,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all .15s",
                  borderColor: hourSchedule === s.id ? "#f59e0b" : "#1e3050",
                  background: hourSchedule === s.id ? "#292015" : "#0e1928",
                }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: hourSchedule === s.id ? "#fbbf24" : "#94a3b8" }}>{s.label}</p>
                <p style={{ margin: 0, fontSize: 11, color: hourSchedule === s.id ? "#d97706" : "#475569" }}>{s.sub}</p>
              </button>
            ))}
          </div>
          {hourSchedule === "evening" && (
            <p style={{ color: "#64748b", fontSize: 12, marginTop: 6 }}>
              Banner shows every day from 6:00 PM to 6:00 AM. Automatically hides during daytime hours.
            </p>
          )}
        </div>

        {/* Display Type */}
        <div style={{ marginTop: 14 }}>
          <p style={{ color: "#94a3b8", fontSize: 11, fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Display Style</p>
          <div style={{ display: "flex", gap: 8 }}>
            {([
              { id: "banner" as const, icon: "📢", label: "Banner", sub: "Shown at top of page" },
              { id: "popup" as const,  icon: "💬", label: "Popup",  sub: "Appears when store opens" },
            ]).map((opt) => (
              <button key={opt.id} onClick={() => setDisplayType(opt.id)}
                style={{
                  flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid", cursor: "pointer", textAlign: "left", transition: "all .15s",
                  borderColor: displayType === opt.id ? "#3b82f6" : "#1e3050",
                  background: displayType === opt.id ? "#1e3a5f" : "#0e1928",
                }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: displayType === opt.id ? "#60a5fa" : "#94a3b8" }}>{opt.icon} {opt.label}</p>
                <p style={{ margin: 0, fontSize: 11, color: displayType === opt.id ? "#3b82f6" : "#475569" }}>{opt.sub}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Optional link (button inside banner/popup) */}
        <div style={{ marginTop: 14 }}>
          <p style={{ color: "#94a3b8", fontSize: 11, fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Button Link (optional)</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              type="url"
              placeholder="https://t.me/yourchannel"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              style={{ flex: 2, minWidth: 180, background: "#0e1928", border: "1px solid #1e3050", borderRadius: 8, padding: "9px 12px", color: "#f1f5f9", fontSize: 13, outline: "none" }}
            />
            <input
              type="text"
              placeholder='Button label (e.g. "Join Channel")'
              value={linkText}
              onChange={(e) => setLinkText(e.target.value)}
              style={{ flex: 1, minWidth: 140, background: "#0e1928", border: "1px solid #1e3050", borderRadius: 8, padding: "9px 12px", color: "#f1f5f9", fontSize: 13, outline: "none" }}
            />
          </div>
          <p style={{ color: "#475569", fontSize: 11, marginTop: 4 }}>
            Leave blank for no button. For a Telegram channel: paste the t.me link.
          </p>
        </div>

        <button onClick={handlePost} disabled={saving || !message.trim()}
          style={{ marginTop: 16, width: "100%", background: "linear-gradient(90deg,#3b82f6,#8b5cf6)", color: "#fff", border: "none", borderRadius: 10, padding: "12px 0", fontWeight: 700, fontSize: 14, cursor: "pointer", opacity: saving || !message.trim() ? 0.6 : 1 }}>
          {saving ? "Posting…" : "📢 Post Announcement"}
        </button>
      </div>

      {/* Active announcements */}
      <div style={{ background: "#162032", border: "1px solid #1e3050", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid #1e3050", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#4ade80", display: "inline-block" }} />
          <p style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 15, margin: 0 }}>Active ({active.length})</p>
        </div>
        {loading ? (
          <p style={{ textAlign: "center", color: "#475569", padding: "30px 0", fontSize: 14 }}>Loading…</p>
        ) : active.length === 0 ? (
          <p style={{ textAlign: "center", color: "#475569", padding: "30px 0", fontSize: 14 }}>No active announcements.</p>
        ) : active.map((a) => (
          <AnnouncementRow key={a.id} a={a} onToggle={handleToggle} onDelete={handleDelete} deleting={deleting} />
        ))}
      </div>

      {inactive.length > 0 && (
        <div style={{ background: "#162032", border: "1px solid #1e3050", borderRadius: 14, overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid #1e3050" }}>
            <p style={{ color: "#64748b", fontWeight: 700, fontSize: 15, margin: 0 }}>Inactive ({inactive.length})</p>
          </div>
          {inactive.map((a) => (
            <AnnouncementRow key={a.id} a={a} onToggle={handleToggle} onDelete={handleDelete} deleting={deleting} />
          ))}
        </div>
      )}
    </div>
  );
}

function AnnouncementRow({ a, onToggle, onDelete, deleting }: {
  a: Announcement;
  onToggle: (a: Announcement) => void;
  onDelete: (id: string) => void;
  deleting: string | null;
}) {
  const tl = TARGET_LABELS[a.target];
  const expired = a.expires_at ? new Date(a.expires_at) < new Date() : false;
  const sched = scheduleLabel(a);
  const isPopup = a.display_type === "popup";

  return (
    <div style={{ padding: "14px 18px", borderBottom: "1px solid #1e3050", display: "flex", gap: 14, alignItems: "flex-start" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ color: a.active && !expired ? "#f1f5f9" : "#64748b", fontSize: 14, margin: 0, lineHeight: 1.5 }}>{a.message}</p>
        {a.link_url && (
          <p style={{ fontSize: 12, color: "#3b82f6", margin: "4px 0 0", wordBreak: "break-all" }}>
            🔗 {a.link_text || "Button"} → {a.link_url}
          </p>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: tl.bg, color: tl.color }}>{tl.label}</span>
          <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
            background: isPopup ? "#2e1065" : "#0e2010",
            color: isPopup ? "#a855f7" : "#4ade80" }}>
            {isPopup ? "💬 Popup" : "📢 Banner"}
          </span>
          {sched && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "#292015", color: "#fbbf24" }}>{sched}</span>
          )}
          <span style={{ fontSize: 11, color: expired ? "#f87171" : "#64748b" }}>⏱ {timeLeft(a.expires_at)}</span>
          <span style={{ fontSize: 11, color: "#475569" }}>{new Date(a.created_at).toLocaleDateString("en-GH", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, shrink: 0 } as React.CSSProperties}>
        <button onClick={() => onToggle(a)}
          style={{ fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 6, border: "1px solid #1e3050", background: "#0e1928", color: a.active ? "#fbbf24" : "#4ade80", cursor: "pointer" }}>
          {a.active ? "Disable" : "Enable"}
        </button>
        <button onClick={() => { if (confirm("Delete this announcement?")) onDelete(a.id); }}
          disabled={deleting === a.id}
          style={{ fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 6, border: "none", background: "#3f1818", color: "#f87171", cursor: "pointer", opacity: deleting === a.id ? 0.5 : 1 }}>
          {deleting === a.id ? "…" : "Delete"}
        </button>
      </div>
    </div>
  );
}
