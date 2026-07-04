import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { NextRequest } from "next/server";

async function isAdmin() {
  const s = await cookies();
  return s.get("admin_session")?.value === process.env.ADMIN_SESSION_TOKEN;
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
  const body = await req.json();
  const { data, error } = await supabase.from("sms_scheduled").insert({
    audience: body.audience,
    phones: body.phones,
    message: body.message,
    send_at: body.sendAt,
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
  const now = new Date().toISOString();
  const { data: due } = await supabase
    .from("sms_scheduled")
    .select("*")
    .eq("status", "pending")
    .lte("send_at", now);

  if (!due?.length) return Response.json({ processed: 0 });

  const apiKey   = process.env.AT_API_KEY;
  const username = process.env.AT_USERNAME;
  if (!apiKey || !username) return Response.json({ error: "SMS not configured" }, { status: 500 });

  function normalizePhones(phones: string[]): string {
    return phones.map((p: string) => {
      const d = p.replace(/\D/g, "");
      if (d.startsWith("233")) return `+${d}`;
      if (d.startsWith("0")) return `+233${d.slice(1)}`;
      return `+${d}`;
    }).join(",");
  }

  let processed = 0;
  for (const job of due) {
    const body = new URLSearchParams({ username, to: normalizePhones(job.phones ?? []), message: job.message });
    const res = await fetch("https://api.africastalking.com/version1/messaging", {
      method: "POST",
      headers: { apiKey, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: body.toString(),
    }).catch(() => null);
    await supabase.from("sms_scheduled").update({ status: res?.ok ? "sent" : "failed" }).eq("id", job.id);
    processed++;
  }
  return Response.json({ processed });
}
