import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { NextRequest } from "next/server";
import { verifyAdminSessionValue } from "@/lib/adminAuth";

async function isAdmin() {
  const s = await cookies();
  return verifyAdminSessionValue(s.get("admin_session")?.value);
}

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { data } = await supabase
    .from("sms_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  return Response.json({ logs: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  await supabase.from("sms_logs").insert({
    audience: body.audience,
    recipient_count: body.recipientCount,
    message: body.message,
    sent_count: body.sentCount,
    failed_count: body.failedCount,
    status: body.status,
  });
  return Response.json({ success: true });
}
