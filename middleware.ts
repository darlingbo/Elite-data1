import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Protect all /admin routes except the login page itself
  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login")) {
    const session = req.cookies.get("admin_session")?.value;
    const token = process.env.ADMIN_SESSION_TOKEN;

    if (!token || !session || session !== token) {
      const loginUrl = new URL("/admin/login", req.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
