"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Icon from "@/components/ed/Icon";

const WA_URL = "https://whatsapp.com/channel/0029Vb8BFMA42DchXuWWOu3z";
const TG_URL = "https://t.me/elitedata1";
const STORAGE_KEY = "elite_welcome_seen";

/** A small card on the Home page, once per visitor. It never covers the buy buttons. */
export default function WelcomePopup() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (pathname !== "/") return;
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        const t = setTimeout(() => setVisible(true), 4000);
        return () => clearTimeout(t);
      }
    } catch { /* private mode: do not show */ }
  }, [pathname]);

  function dismiss() {
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
    setVisible(false);
  }

  if (!visible || pathname !== "/") return null;

  return (
    <aside className="ed-welcome" role="dialog" aria-label="Follow Elite Data">
      <button type="button" className="ed-ibtn plain ed-welcome-x" onClick={dismiss} aria-label="Close"><Icon name="x" /></button>
      <b className="ed-display" style={{ fontSize: 18 }}>Get deals first</b>
      <p style={{ margin: 0, fontSize: 13, color: "var(--ed-muted)", lineHeight: 1.5 }}>Follow our channels for new bundles and offers.</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <a href={WA_URL} target="_blank" rel="noopener noreferrer" onClick={dismiss} className="ed-btn g">WhatsApp</a>
        <a href={TG_URL} target="_blank" rel="noopener noreferrer" onClick={dismiss} className="ed-btn b">Telegram</a>
      </div>
    </aside>
  );
}
