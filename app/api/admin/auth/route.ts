import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendAdminAlert } from "@/lib/telegram";
import { verifyAdminPassword, issueAdminSession, clearAdminSession } from "@/lib/adminAuth";
import { rateLimitDb } from "@/lib/rate-limit";

function getIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}


export async function POST(request: NextRequest) {
  const ip = getIp(request);
  // Max 5 attempts per IP per 15 minutes, shared across all serverless instances.
  if (await rateLimitDb(`admin-login:${ip}`, 5, 15 * 60 * 1000)) {
    return Response.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });
  }

  const { password } = await request.json();
  if (!password || !(await verifyAdminPassword(String(password)))) {
    return Response.json({ error: "Incorrect password." }, { status: 401 });
  }

  // Alert on every successful login so you know if someone else gets in
  const ua = request.headers.get("user-agent") ?? "unknown";
  sendAdminAlert(`🔐 <b>Admin Login</b>\nIP: <code>${ip}</code>\nDevice: ${ua.slice(0, 80)}`).catch(() => {});

  // Persist to audit log (fire and forget — never block the login response)
  void supabase.from("audit_log").insert({
    action: "admin_login",
    ip,
    details: { user_agent: ua.slice(0, 200) },
    created_at: new Date().toISOString(),
  });

  // Mint a fresh random, server-revocable session token (see lib/adminAuth.ts).
  await issueAdminSession();

  return Response.json({ success: true });
}

export async function DELETE() {
  await clearAdminSession();
  return Response.json({ success: true });
}
