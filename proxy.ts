import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // MAINTENANCE MODE — redirect all customer routes to maintenance page
  // Remove this block when maintenance is complete
  if (
    !pathname.startsWith("/admin") &&
    !pathname.startsWith("/api/admin") &&
    !pathname.startsWith("/api/webhooks") &&
    pathname !== "/maintenance"
  ) {
    return NextResponse.redirect(new URL("/maintenance", request.url));
  }

  // Admin route protection — redirect unauthenticated visitors to login
  if (
    pathname.startsWith("/admin") &&
    pathname !== "/admin/login" &&
    !pathname.startsWith("/admin/reset-password")
  ) {
    const session = request.cookies.get("admin_session");
    const validToken = process.env.ADMIN_SESSION_TOKEN;
    if (!validToken || session?.value !== validToken) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
  }

  // Generate a unique nonce for this request so modern browsers enforce
  // the nonce-based CSP and ignore the 'unsafe-inline' fallback
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const csp = [
    "default-src 'self'",
    // 'unsafe-inline' is ignored by nonce-aware browsers; kept only for legacy fallback
    `script-src 'self' 'nonce-${nonce}' 'unsafe-inline' https://js.paystack.co`,
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.paystack.co",
    "frame-src https://checkout.paystack.com",
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

  const response = NextResponse.next({ request: { headers: reqHeaders } });

  // CSP set here per-request with nonce; vercel.json must NOT also set CSP
  response.headers.set("Content-Security-Policy", csp);

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
