"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  {
    href: "/",
    label: "Home",
    icon: "M3 11.5 12 4l9 7.5M5.5 10v9h5v-5h3v5h5v-9",
  },
  {
    href: "/buy",
    label: "Buy Data",
    icon: "M3 5h2l1.4 8.2a2 2 0 0 0 2 1.7h7.8a2 2 0 0 0 1.9-1.4L20 8H6M9 20h.01M17 20h.01",
  },
  {
    href: "/track",
    label: "Track",
    icon: "M9 5H7a2 2 0 0 0-2 2v12h14V7a2 2 0 0 0-2-2h-2M9 5a3 3 0 0 1 6 0M9 12h6M9 16h4",
  },
  {
    href: "/prices",
    label: "Prices",
    icon: "M4 7V4h3l11 11-5 5L2 9l2-2Zm3 0h.01",
  },
  {
    href: "/business",
    label: "More",
    icon: "M5 12h.01M12 12h.01M19 12h.01",
  },
];

export default function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
      <div className="mobile-bottom-nav__inner">
        {items.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`mobile-bottom-nav__item${active ? " is-active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={item.icon} />
              </svg>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
