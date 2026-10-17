import { NextRequest, NextResponse } from "next/server";
import { isStoreGatedPath } from "@/lib/store-closed";
import { getStoreStatus } from "@/lib/store-status";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
    }
  }

  // Admin route protection — redirect unauthenticated visitors to login
  if (
    pathname.startsWith("/admin") &&
    pathname !== "/admin/login" &&
    !pathname.startsWith("/admin/reset-password")
  ) {
    // Coarse page gate only: redirect visitors with no admin session cookie to
    // the login screen. The real authorization happens inside every /api/admin
    // route (verifyAdminSessionValue), which validates the session against the
    // server-side hash. We only presence-check here because the proxy runs on the
    // edge and cannot reach the database to verify the random session token.
    const session = request.cookies.get("admin_session");
    if (!session?.value) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
  }

  // Generate a unique nonce for this request so modern browsers enforce
  // the nonce-based CSP and ignore the 'unsafe-inline' fallback
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const csp = [
    "default-src 'self'",
    // 'unsafe-inline' is ignored by nonce-aware browsers; kept only for legacy fallback
    `script-src 'self' 'nonce-${nonce}' 'unsafe-inline'`,
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.yebeck.com",
    "frame-src 'none'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

  // Pass nonce + pathname to server components via request headers
  const reqHeaders = new Headers(request.headers);
  reqHeaders.set("x-nonce", nonce);
  reqHeaders.set("x-pathname", pathname);

  // Admin "Close Store" switch: while closed, shopping pages show the closed
  // screen (503 so search engines treat it as temporary). Admin,
  // order tracking, APIs and webhooks are untouched — see lib/store-closed.ts.
  if (isStoreGatedPath(pathname) && !(await getStoreStatus()).open) {
    reqHeaders.set("x-store-closed", "1");
    const closed = NextResponse.rewrite(new URL("/store-closed", request.url), {
      request: { headers: reqHeaders },
      status: 503,
      headers: { "Retry-After": "3600", "Cache-Control": "no-store" },
    });
    closed.headers.set("Content-Security-Policy", csp);
    return closed;
  }

  const response = NextResponse.next({ request: { headers: reqHeaders } });

  // CSP set here per-request with nonce; vercel.json must NOT also set CSP
  response.headers.set("Content-Security-Policy", csp);

  return response;
}

// Vercel bills every proxy run as a function call + CPU, even for cached or static
// responses, so skip requests that need none of the proxy's work (CSP/nonce for
// pages, admin gates, closed-store screen, cross-origin check on POST/PUT/DELETE):
//  - static files (images, css, js, json, txt, xml, fonts, html in /public)
//  - public GET-only JSON endpoints that are CDN-cached (see lib/public-cache.ts)
// This must stay an inline literal — Next.js reads it at build time.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|api/(?:announcements|orders/recent|promo-banner|bundles|mashup-bundles|network-status)$|.*\\.(?:png|jpe?g|gif|svg|ico|webp|avif|css|js|json|txt|xml|woff2?|map|html)$).*)",
  ],
};
