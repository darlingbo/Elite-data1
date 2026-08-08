import bcrypt from "bcryptjs";
import { getSubAdminSession, clearSubAdminSession } from "@/lib/subAdminAuth";
import { supabase } from "@/lib/supabase";

export async function POST(request: Request) {
  const session = await getSubAdminSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { currentPassword?: string; newPassword?: string } | null;
  if (!body?.currentPassword || !body.newPassword || body.newPassword.length < 8) return Response.json({ error: "Enter your current password and a new password of at least 8 characters." }, { status: 400 });
  const { data } = await supabase.from("sub_admins").select("password_hash").eq("id", session.id).single();
  if (!data || !(await bcrypt.compare(body.currentPassword, data.password_hash))) return Response.json({ error: "Current password is incorrect." }, { status: 403 });
  await supabase.from("sub_admins").update({ password_hash: await bcrypt.hash(body.newPassword, 12), session_hash: null, session_expires_at: null, updated_at: new Date().toISOString() }).eq("id", session.id);
  await supabase.from("sub_admin_activity").insert({ sub_admin_id: session.id, action: "password_changed" });
  await clearSubAdminSession();
  return Response.json({ success: true });
}
