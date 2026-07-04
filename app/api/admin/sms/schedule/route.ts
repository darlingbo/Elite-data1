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

  const hasArkesel = !!process.env.ARKESEL_API_KEY;
  const hasAT      = !!(process.env.AT_API_KEY && process.env.AT_USERNAME);
  if (!hasArkesel && !hasAT) return Response.json({ error: "SMS not configured" }, { status: 500 });

  function normalise(phones: string[]): string[] {
    return phones.map((p: string) => {
      const d = p.replace(/\D/g, "");
      if (d.startsWith("233")) return `+${d}`;
      if (d.startsWith("0")) return `+233${d.slice(1)}`;
      return `+${d}`;
    });
  }

  let processed = 0;
  for (const job of due) {
    const normalised = normalise(job.phones ?? []);
    let ok = false;

    if (hasArkesel) {
      const res = await fetch("https://sms.arkesel.com/api/v2/sms/send", {
        method: "POST",
        headers: { "api-key": process.env.ARKESEL_API_KEY!, "Content-Type": "application/json" },
        body: JSON.stringify({ sender: process.env.ARKESEL_SENDER_ID ?? "EliteData", message: job.message, recipients: normalised }),
      }).catch(() => null);
      ok = res?.ok ?? false;
    } else {
      const body = new URLSearchParams({ username: process.env.AT_USERNAME!, to: normalised.join(","), message: job.message });
      const res = await fetch("https://api.africastalking.com/version1/messaging", {
        method: "POST",
        headers: { apiKey: process.env.AT_API_KEY!, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: body.toString(),
      }).catch(() => null);
      ok = res?.ok ?? false;
    }

    await supabase.from("sms_scheduled").update({ status: ok ? "sent" : "failed" }).eq("id", job.id);
    processed++;
  }
  return Response.json({ processed });
}
