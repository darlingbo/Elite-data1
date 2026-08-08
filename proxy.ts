import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
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

  if (pathname.startsWith("/subadmin") && pathname !== "/subadmin/login") {
    const session = request.cookies.get("sub_admin_session");
    if (!session?.value) {
      return NextResponse.redirect(new URL("/subadmin/login", request.url));
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
