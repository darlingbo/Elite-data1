import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Elite Data — Cheap Data Bundles in Ghana";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 40%, #7c3aed 100%)",
          fontFamily: "sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Decorative circles */}
        <div style={{ position: "absolute", top: -80, right: -80, width: 400, height: 400, borderRadius: "50%", background: "rgba(255,255,255,0.05)", display: "flex" }} />
        <div style={{ position: "absolute", bottom: -120, left: -60, width: 500, height: 500, borderRadius: "50%", background: "rgba(255,255,255,0.04)", display: "flex" }} />

        {/* Logo icon */}
        <div style={{
          width: 100, height: 100, borderRadius: 28,
          background: "rgba(255,255,255,0.15)",
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 28,
          border: "2px solid rgba(255,255,255,0.25)",
        }}>
          <svg width="56" height="56" viewBox="0 0 200 200">
            <polygon points="115,20 75,108 105,108 85,180 145,85 112,85 138,20" fill="white"/>
          </svg>
        </div>

        {/* Brand name */}
        <div style={{ fontSize: 72, fontWeight: 900, color: "white", letterSpacing: -2, lineHeight: 1, marginBottom: 12 }}>
          Elite Data
        </div>

        {/* Tagline */}
        <div style={{ fontSize: 30, color: "#bfdbfe", fontWeight: 600, marginBottom: 40 }}>
          Ghana&apos;s #1 Data Bundle Store
        </div>

        {/* Network pills */}
        <div style={{ display: "flex", gap: 16 }}>
          {[
            { label: "MTN",        bg: "#f59e0b", color: "#78350f" },
            { label: "Telecel",    bg: "#ef4444", color: "white"   },
            { label: "AirtelTigo", bg: "#3b82f6", color: "white"   },
          ].map(n => (
            <div key={n.label} style={{
              background: n.bg, color: n.color,
              fontWeight: 800, fontSize: 22,
              padding: "10px 28px", borderRadius: 999,
              display: "flex",
            }}>
              {n.label}
            </div>
          ))}
        </div>

        {/* Bottom tagline */}
        <div style={{ position: "absolute", bottom: 36, fontSize: 22, color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>
          elitedata1.com · Instant delivery · Best prices
        </div>
      </div>
    ),
    { ...size }
  );
}
