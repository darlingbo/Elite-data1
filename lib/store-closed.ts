// Client-safe pieces of the admin "Close Store" switch (Admin → Announcements).
// Database access lives in lib/store-status.ts (server only) — keep this file
// free of server imports so CheckoutModal can use it too.

export const ALTERNATE_STORE_URL = "https://silentecho.online";
export const ALTERNATE_STORE_LABEL = "silentecho.online";

export const DEFAULT_CLOSED_MESSAGE =
  `Elite Data is temporarily closed. To buy data in the meantime, please go to ${ALTERNATE_STORE_LABEL}.`;

// Pages that keep working while the store is closed: the admin area,
// order tracking/receipts for people who already paid, and policy pages.
// Everything else (home, buy, prices, vouchers...) is closed,
// so any new public page is closed by default.
const OPEN_WHEN_CLOSED = [
  "/admin",
  "/track",
  "/order",
  "/privacy",
  "/refund-policy",
  "/store-closed",
  "/maintenance",
  "/opengraph-image",
];

/** True when this page should show the closed screen while the store is closed. */
export function isStoreGatedPath(pathname: string): boolean {
  if (pathname === "/api" || pathname.startsWith("/api/")) return false;
  // Static files (logo.png, manifest.json, robots.txt, sitemap.xml ...) must keep loading.
  if (/\.[a-z0-9]+$/i.test(pathname)) return false;
  return !OPEN_WHEN_CLOSED.some((open) => pathname === open || pathname.startsWith(`${open}/`));
}
