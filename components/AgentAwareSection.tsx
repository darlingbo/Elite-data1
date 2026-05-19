"use client";
import { useState, useEffect } from "react";

export default function AgentAwareSection({ children }: { children: React.ReactNode }) {
  const [hide, setHide] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("agentRef");
      const fromUrl = new URLSearchParams(window.location.search).get("agent");
      if (stored || fromUrl) setHide(true);
    } catch {}
    setReady(true);
  }, []);

  if (!ready) return null;
  if (hide) return null;
  return <>{children}</>;
}
