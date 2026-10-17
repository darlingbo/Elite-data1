import Link from "next/link";

const quick = [
  { href: "/", label: "Home" },
  { href: "/buy", label: "Buy data" },
  { href: "/prices", label: "Bundle prices" },
  { href: "/track", label: "Track order" },
  { href: "/vouchers", label: "Result checker" },
];

const help = [
  { href: "/track", label: "Track my order" },
  { href: "/privacy", label: "Privacy policy" },
  { href: "/refund-policy", label: "Refund policy" },
];

export default function Footer() {
  return (
    <footer className="ed-footer">
      <div className="ed-wrap wide">
        <div className="ed-footer-grid">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span className="ed-logo">E</span>
              <span className="ed-brand">Elite Data</span>
            </div>
            <p style={{ margin: "0 0 12px", fontSize: 14, lineHeight: 1.6, color: "var(--ed-muted)", maxWidth: 320 }}>
              Cheap, instant data bundles in Ghana. MTN, Telecel and AirtelTigo delivered in minutes.
            </p>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.7, color: "var(--ed-muted)" }}>Mon to Sat: 6:00am to 11:59pm<br />Sunday: 7:00am to 11:30pm</p>
          </div>

          <nav aria-label="Quick links">
            <h4>Quick links</h4>
            <ul>{quick.map((l) => <li key={l.href}><Link href={l.href}>{l.label}</Link></li>)}</ul>
          </nav>

          <nav aria-label="Help and policies">
            <h4>Help</h4>
            <ul>
              <li><a href="https://wa.me/233509794503" target="_blank" rel="noopener noreferrer" style={{ color: "var(--ed-green)" }}>WhatsApp support</a></li>
              {help.map((l) => <li key={l.href}><Link href={l.href}>{l.label}</Link></li>)}
              <li style={{ fontSize: 13, color: "var(--ed-muted)", overflowWrap: "anywhere" }}>stephenowusuansah601@gmail.com</li>
            </ul>
          </nav>
        </div>

        <div className="ed-footer-bar">
          <p style={{ margin: 0 }}>© {new Date().getFullYear()} Elite Data. All rights reserved.</p>
          <p style={{ margin: 0 }}>Secure Mobile Money payments</p>
        </div>
      </div>
    </footer>
  );
}
