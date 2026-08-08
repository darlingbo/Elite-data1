import { NextRequest } from "next/server";
import { authenticateSubAdmin, clearSubAdminSession, issueSubAdminSession } from "@/lib/subAdminAuth";
import { rateLimitDb } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (await rateLimitDb(`subadmin-login:${ip}`, 8, 15 * 60 * 1000)) {
    return Response.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }
  const body = await request.json().catch(() => null) as { email?: string; password?: string } | null;
  const session = body?.email && body?.password
    ? await authenticateSubAdmin(body.email, body.password)
    : null;
  if (!session) return Response.json({ error: "Incorrect email or password." }, { status: 401 });
  await issueSubAdminSession(session.id);
  await (await import("@/lib/supabase")).supabase.from("sub_admin_activity").insert({ sub_admin_id: session.id, action: "login" });
  return Response.json({ success: true });
}

export async function DELETE() {
  await clearSubAdminSession();
  return Response.json({ success: true });
}
