import Link from "next/link";

const BG     = "#080f1e";
const BORDER = "#1e3a5f";
const MUTED  = "#64748b";
const TEXT   = "#94a3b8";
const YELLOW = "#fbbf24";

export default function Footer() {
  return (
    <footer style={{ background: BG, borderTop: `1px solid ${BORDER}`, paddingTop: 48, paddingBottom: 24 }}>
      <div className="max-w-6xl mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">

          {/* Brand */}
          <div className="md:col-span-2">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: "rgba(251,191,36,0.12)",
                border: "1px solid rgba(251,191,36,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <span style={{ color: YELLOW, fontWeight: 900, fontSize: 16 }}>E</span>
              </div>
              <span style={{ fontWeight: 900, fontSize: 20, color: "#f8fafc", letterSpacing: "-0.02em" }}>
                Elite<span style={{ color: YELLOW }}>Data</span>
              </span>
            </div>
            <p style={{ color: MUTED, fontSize: 14, lineHeight: 1.7, maxWidth: 300, margin: "0 0 16px" }}>
              Ghana&apos;s trusted platform for cheap and instant data bundles. MTN, Telecel and AirtelTigo delivered in minutes.
            </p>
            <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.8 }}>
              <p style={{ margin: "0 0 2px" }}>Mon – Sat: 6:00am – 11:59pm</p>
              <p style={{ margin: 0 }}>Sunday: 7:00am – 11:30pm</p>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 style={{ color: "#f8fafc", fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>
              Quick Links
            </h4>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { href: "/",        label: "Home" },
                { href: "/buy",     label: "Buy Data" },
                { href: "/prices",  label: "Bundle Prices" },
                { href: "/track",   label: "Track Order" },
                { href: "/vouchers",label: "Result Checker" },
                { href: "/agent",   label: "Become an Agent" },
              ].map(l => (
                <li key={l.href}>
                  <Link href={l.href} style={{ color: TEXT, fontSize: 14, textDecoration: "none", transition: "color 0.15s" }}
                    className="hover:text-yellow-400">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 style={{ color: "#f8fafc", fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>
              Support
            </h4>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              <li>
                <a href="https://wa.me/233509794503" target="_blank" rel="noreferrer"
                  style={{ color: "#4ade80", fontSize: 14, textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.526 5.845L.057 23.882l6.174-1.447A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.797 9.797 0 01-5.003-1.372l-.36-.213-3.664.86.902-3.559-.234-.375A9.797 9.797 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z" />
                  </svg>
                  WhatsApp Support
                </a>
              </li>
              <li>
                <Link href="/track" style={{ color: TEXT, fontSize: 14, textDecoration: "none" }} className="hover:text-yellow-400">
                  Track My Order
                </Link>
              </li>
              <li>
                <Link href="/agent/dashboard" style={{ color: TEXT, fontSize: 14, textDecoration: "none" }} className="hover:text-yellow-400">
                  Agent Login
                </Link>
              </li>
              <li style={{ color: MUTED, fontSize: 14 }}>stephenowusuansah601@gmail.com</li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div style={{
          borderTop: `1px solid ${BORDER}`,
          paddingTop: 20,
          display: "flex", flexWrap: "wrap", justifyContent: "space-between",
          alignItems: "center", gap: 10,
          fontSize: 12, color: MUTED,
        }}>
          <p style={{ margin: 0 }}>© {new Date().getFullYear()} Elite Data. All rights reserved.</p>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span>Powered by</span>
            <span style={{ color: "#60a5fa", fontWeight: 700 }}>Paystack</span>
            <span>· Secured payments</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
