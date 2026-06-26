import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";

async function isAdmin() {
  const s = await cookies();
  return s.get("admin_session")?.value === process.env.ADMIN_SESSION_TOKEN;
}

async function getSetting(key: string, def = "1") {
  const { data } = await supabase.from("system_settings").select("value").eq("key", key).maybeSingle();
  return data?.value ?? def;
}

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const [mtn, telecel, at, autoHours, autoStart, autoEnd] = await Promise.all([
    getSetting("network_mtn_active", "1"),
    getSetting("network_telecel_active", "1"),
    getSetting("network_at_active", "1"),
    getSetting("store_auto_hours", "0"),
    getSetting("store_auto_start", "06:00"),
    getSetting("store_auto_end", "23:00"),
  ]);
  return Response.json({ mtn: mtn === "1", telecel: telecel === "1", at: at === "1", autoHours: autoHours === "1", autoStart, autoEnd });
}

export async function PATCH(req: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  async function upsert(k: string, v: string) {
    await supabase.from("system_settings").upsert({ key: k, value: v }, { onConflict: "key" });
  }
  const tasks: Promise<void>[] = [];
  if ("mtn" in body) tasks.push(upsert("network_mtn_active", body.mtn ? "1" : "0"));
  if ("telecel" in body) tasks.push(upsert("network_telecel_active", body.telecel ? "1" : "0"));
  if ("at" in body) tasks.push(upsert("network_at_active", body.at ? "1" : "0"));
  if ("autoHours" in body) tasks.push(upsert("store_auto_hours", body.autoHours ? "1" : "0"));
  if ("autoStart" in body) tasks.push(upsert("store_auto_start", body.autoStart));
  if ("autoEnd" in body) tasks.push(upsert("store_auto_end", body.autoEnd));
  await Promise.all(tasks);
  return Response.json({ success: true });
}
