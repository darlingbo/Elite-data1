import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { timingSafeEqual } from "crypto";

// In-memory rate limiter: max 5 attempts per IP per 15 minutes
const attempts = new Map<string, { count: number; resetAt: number }>();

function getIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return false;
  }
  entry.count++;
  return entry.count > 5;
}

function safeEqual(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ab.length !== bb.length) {
      timingSafeEqual(ab, ab); // consume time anyway
      return false;
    }
    return timingSafeEqual(ab, bb);
  } catch { return false; }
}

export async function POST(request: NextRequest) {
  const ip = getIp(request);
  if (isRateLimited(ip)) {
    return Response.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });
  }

  const { password } = await request.json();
  const expected = process.env.ADMIN_PASSWORD ?? "";

  if (!password || !safeEqual(String(password), expected)) {
    return Response.json({ error: "Incorrect password." }, { status: 401 });
  }

  // Clear rate limit on success
  attempts.delete(ip);

  const token = process.env.ADMIN_SESSION_TOKEN;
  if (!token) {
    return Response.json({ error: "Server misconfigured." }, { status: 500 });
  }

  const cookieStore = await cookies();
  cookieStore.set("admin_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  return Response.json({ success: true });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete("admin_session");
  return Response.json({ success: true });
}
