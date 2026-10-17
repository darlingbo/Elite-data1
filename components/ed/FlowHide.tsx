"use client";
import { usePathname } from "next/navigation";

/**
 * Hides site-wide chrome (menu bar, popup, chat, bottom bar) on the buying screens.
 *
 * This has to be decided in the browser. The root layout is not re-rendered when a
 * customer taps from Home to the number step, so a server-side path check would go stale.
 * `variant="top"` also hides on /track. `variant="footer"` keeps the footer on /buy (policy links) and hides it on the other buying screens.
 */
export default function FlowHide({ children, variant = "chrome" }: { children: React.ReactNode; variant?: "chrome" | "footer" | "top" }) {
  const pathname = usePathname() ?? "";
  const inFlow = pathname === "/buy" || pathname.startsWith("/buy/") || pathname.startsWith("/checkout");
  // "top" is the site header and promo bar. Track has its own app bar but keeps the bottom bar.
  if (variant === "top") return inFlow || pathname.startsWith("/track") ? null : <>{children}</>;
  if (variant === "footer" ? inFlow && pathname !== "/buy" : inFlow) return null;
  return <>{children}</>;
}
