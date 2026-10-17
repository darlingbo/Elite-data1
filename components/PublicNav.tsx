"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import Icon, { type IconName } from "@/components/ed/Icon";

const navLinks = [
  { href: "/buy", label: "Buy data" },
  { href: "/prices", label: "Prices" },
  { href: "/business", label: "Business" },
  { href: "/track", label: "Track order" },
  { href: "/vouchers", label: "Result checker" },
];

const drawerLinks: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/buy", label: "Buy data", icon: "buy" },
  { href: "/prices", label: "Bundle prices", icon: "tag" },
  { href: "/business", label: "Business top-up", icon: "store" },
  { href: "/track", label: "Track order", icon: "track" },
  { href: "/vouchers", label: "Result checker", icon: "voucher" },
];

export const OPEN_MENU_EVENT = "ed:open-menu";

export default function PublicNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_MENU_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_MENU_EVENT, onOpen);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      <header className="ed-appbar" style={{ minHeight: 60 }}>
        <Link href="/" className="ed-logo" aria-label="Elite Data home">E</Link>
        <Link href="/" className="ed-brand">Elite Data</Link>

        <nav className="ed-navlinks" aria-label="Main">
          {navLinks.map((l) => (
            <Link key={l.href} href={l.href} aria-current={pathname === l.href ? "page" : undefined}>{l.label}</Link>
          ))}
        </nav>

        <span className="ed-spacer" />

        <Link href="/buy" className="ed-btn y ed-navbuy">Buy data</Link>
        <div className="shrink-0"><ThemeToggle /></div>
        <button type="button" className="ed-ibtn ed-menubtn" onClick={() => setOpen(true)} aria-label="Open menu"><Icon name="menu" /></button>
      </header>

      {open && <div className="ed-scrim" onClick={() => setOpen(false)} aria-hidden="true" />}

      <aside className={`ed-drawer${open ? " open" : ""}`} aria-label="Menu" aria-hidden={!open}>
        <div className="ed-drawer-head">
          <span className="ed-logo">E</span>
          <span className="ed-brand">Elite Data</span>
          <span className="ed-spacer" />
          <button type="button" className="ed-ibtn" onClick={() => setOpen(false)} aria-label="Close menu"><Icon name="x" /></button>
        </div>
        <nav className="ed-drawer-links">
          {drawerLinks.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} aria-current={pathname === l.href ? "page" : undefined}>
              <Icon name={l.icon} />{l.label}
            </Link>
          ))}
        </nav>
        <div className="ed-drawer-foot">
          <Link href="/buy" onClick={() => setOpen(false)} className="ed-btn y tall block">Buy data</Link>
          <a href="https://wa.me/233509794503" target="_blank" rel="noopener noreferrer" className="ed-link" style={{ minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Icon name="whatsapp" small />WhatsApp +233 509 794 503
          </a>
        </div>
      </aside>
    </>
  );
}
