import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { NextRequest } from "next/server";
import { verifyAdminSessionValue } from "@/lib/adminAuth";
import { processDueScheduledSms } from "@/lib/scheduled-sms";

async function isAdmin() {
  const s = await cookies();
  return verifyAdminSessionValue(s.get("admin_session")?.value);
}

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { data } = await supabase
    .from("sms_scheduled")
    .select("*")
    .order("send_at", { ascending: true });
  return Response.json({ scheduled: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json() as { audience?: string; phones?: string[]; message?: string; sendAt?: string };
  const phones = Array.isArray(body.phones) ? body.phones.map(String).filter(Boolean) : [];
  const message = String(body.message ?? "").trim();
  const sendAt = new Date(String(body.sendAt ?? ""));
  if (!phones.length || !message || message.length > 500 || !Number.isFinite(sendAt.getTime()) || sendAt.getTime() <= Date.now()) {
    return Response.json({ error: "Valid phones, message (max 500 characters), and a future date/time are required" }, { status: 400 });
  }
  const { data, error } = await supabase.from("sms_scheduled").insert({
    audience: body.audience ?? "individual",
    phones,
    message,
    send_at: sendAt.toISOString(),
    status: "pending",
  }).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true, id: data.id });
}

export async function DELETE(req: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await req.json();
  await supabase.from("sms_scheduled").delete().eq("id", id);
  return Response.json({ success: true });
}

// Process due scheduled messages
export async function PATCH() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(await processDueScheduledSms());
}
