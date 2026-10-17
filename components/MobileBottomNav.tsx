"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon, { type IconName } from "@/components/ed/Icon";
import { OPEN_MENU_EVENT } from "@/components/PublicNav";

const items: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/buy", label: "Buy", icon: "buy" },
  { href: "/track", label: "Track", icon: "track" },
  { href: "/vouchers", label: "Vouchers", icon: "voucher" },
];

export default function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="ed-bn" aria-label="Mobile navigation">
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href} className={active ? "on" : ""} aria-current={active ? "page" : undefined}>
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </Link>
        );
      })}
      <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_MENU_EVENT))} aria-label="Open the full menu">
        <Icon name="more" />
        <span>More</span>
      </button>
    </nav>
  );
}
