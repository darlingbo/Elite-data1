import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { verifyAdminSessionValue } from "@/lib/adminAuth";

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifyAdminSessionValue(cookieStore.get("admin_session")?.value);
}

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ announcements: data ?? [] });
}

export async function POST(request: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { message, target, expires_at, show_from_hour, show_to_hour, display_type, link_url, link_text } = await request.json();
  if (!message?.trim()) return Response.json({ error: "Message is required." }, { status: 400 });
  if (!["all", "customers", "agents"].includes(target)) {
    return Response.json({ error: "target must be: all, customers, or agents" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("announcements")
    .insert({
      message: message.trim(),
      target,
      expires_at: expires_at ?? null,
      active: true,
      show_from_hour: show_from_hour ?? null,
      show_to_hour: show_to_hour ?? null,
      display_type: display_type ?? "banner",
      link_url: link_url?.trim() || null,
      link_text: link_text?.trim() || null,
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ announcement: data });
}

export async function PATCH(request: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id, active } = await request.json();
  const { error } = await supabase.from("announcements").update({ active }).eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await request.json();
  const { error } = await supabase.from("announcements").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
