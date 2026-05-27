"use client";
import { useState, useEffect, useRef } from "react";

interface OrderItem {
  phone: string;
  network: string;
  bundle_size: string;
  created_at: string;
}

const NET_COLORS: Record<string, { bg: string; dot: string; label: string }> = {
  mtn:        { bg: "rgba(245,158,11,0.15)", dot: "#f59e0b", label: "MTN" },
  telecel:    { bg: "rgba(239,68,68,0.15)",  dot: "#ef4444", label: "Telecel" },
  airteltigo: { bg: "rgba(59,130,246,0.15)", dot: "#3b82f6", label: "AirtelTigo" },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function SocialProofTicker() {
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(false);
  const [animKey, setAnimKey] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/orders/recent")
      .then((r) => r.json())
      .then((d) => {
        if (d.orders?.length) setOrders(d.orders);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!orders.length) return;

    function showNext() {
      setIdx((prev) => (prev + 1) % orders.length);
      setAnimKey((k) => k + 1);
      setVisible(true);

      // Hide after 3.2s, then wait 0.5s gap before next
      timerRef.current = setTimeout(() => {
        setVisible(false);
        timerRef.current = setTimeout(showNext, 600);
      }, 3200);
    }

    // Small initial delay so page loads first
    timerRef.current = setTimeout(() => {
      setVisible(true);
      timerRef.current = setTimeout(() => {
        setVisible(false);
        timerRef.current = setTimeout(showNext, 600);
      }, 3200);
    }, 1500);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [orders]);

  if (!orders.length) return null;

  const order = orders[idx];
  const net = NET_COLORS[order?.network?.toLowerCase()] ?? NET_COLORS.mtn;

  return (
    <>
      <style>{`
        @keyframes tickerSlideIn {
          0%   { transform: translateY(-110%); opacity: 0; }
          18%  { transform: translateY(0);     opacity: 1; }
          80%  { transform: translateY(0);     opacity: 1; }
          100% { transform: translateY(-110%); opacity: 0; }
        }
        @keyframes tickerSlideOut {
          0%   { transform: translateY(0);     opacity: 1; }
          100% { transform: translateY(-110%); opacity: 0; }
        }
        .ticker-enter {
          animation: tickerSlideIn 3.8s cubic-bezier(0.22,1,0.36,1) forwards;
        }
        .ticker-exit {
          animation: tickerSlideOut 0.45s cubic-bezier(0.55,0,1,0.45) forwards;
        }
      `}</style>

      <div
        style={{
          position: "fixed",
          top: 14,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 9999,
          pointerEvents: "none",
          width: "calc(100% - 32px)",
          maxWidth: 400,
        }}
      >
        {visible && (
          <div
            key={animKey}
            className={visible ? "ticker-enter" : "ticker-exit"}
            style={{
              background: "#111827",
              border: `1.5px solid ${net.dot}55`,
              borderLeft: `3.5px solid ${net.dot}`,
              borderRadius: 14,
              padding: "10px 14px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              boxShadow: `0 4px 24px rgba(0,0,0,0.5), 0 0 0 1px ${net.dot}22`,
            }}
          >
            {/* Pulsing dot */}
            <span style={{ position: "relative", flexShrink: 0, width: 10, height: 10 }}>
              <span style={{
                position: "absolute", inset: 0, borderRadius: "50%",
                background: net.dot, opacity: 0.4,
                animation: "ping 1.2s cubic-bezier(0,0,0.2,1) infinite",
              }} />
              <span style={{
                position: "absolute", inset: "2px", borderRadius: "50%",
                background: net.dot,
              }} />
            </span>

            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#f1f5f9", lineHeight: 1.3 }}>
                <span style={{ color: net.dot }}>{net.label} {order.bundle_size}</span>
                {" "}delivered to{" "}
                <span style={{ color: "#e2e8f0" }}>{order.phone}</span>
              </p>
              <p style={{ margin: "2px 0 0", fontSize: 11, color: "#64748b" }}>
                ✅ Completed · {timeAgo(order.created_at)}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ping animation */}
      <style>{`
        @keyframes ping {
          75%, 100% { transform: scale(2.2); opacity: 0; }
        }
      `}</style>
    </>
  );
}