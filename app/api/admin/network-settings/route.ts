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
  const [mtn, telecel, at, mashup, autoHours, autoStart, autoEnd, inventor, datacity, datify] = await Promise.all([
    getSetting("network_mtn_active", "1"),
    getSetting("network_telecel_active", "1"),
    getSetting("network_at_active", "1"),
    getSetting("network_mashup_active", "1"),
    getSetting("store_auto_hours", "0"),
    getSetting("store_auto_start", "06:00"),
    getSetting("store_auto_end", "23:00"),
    getSetting("inventor_enabled", "1"),
    getSetting("datacity_enabled", "1"),
    getSetting("datify_enabled", "1"),
  ]);
  return Response.json({ mtn: mtn === "1", telecel: telecel === "1", at: at === "1", mashup: mashup === "1", autoHours: autoHours === "1", autoStart, autoEnd, inventor: inventor === "1", datacity: datacity === "1", datify: datify === "1" });
}

export async function PATCH(req: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  async function upsert(k: string, v: string) {
    const { error } = await supabase.from("system_settings").upsert({ key: k, value: v }, { onConflict: "key" });
    if (error) throw new Error(`Failed to save ${k}: ${error.message}`);
  }
  try {
    const tasks: Promise<void>[] = [];
    if ("mtn" in body) tasks.push(upsert("network_mtn_active", body.mtn ? "1" : "0"));
    if ("telecel" in body) tasks.push(upsert("network_telecel_active", body.telecel ? "1" : "0"));
    if ("at" in body) tasks.push(upsert("network_at_active", body.at ? "1" : "0"));
    if ("mashup" in body) tasks.push(upsert("network_mashup_active", body.mashup ? "1" : "0"));
    if ("autoHours" in body) tasks.push(upsert("store_auto_hours", body.autoHours ? "1" : "0"));
    if ("autoStart" in body) tasks.push(upsert("store_auto_start", body.autoStart));
    if ("autoEnd" in body) tasks.push(upsert("store_auto_end", body.autoEnd));
    if ("inventor" in body) tasks.push(upsert("inventor_enabled", body.inventor ? "1" : "0"));
    if ("datacity" in body) tasks.push(upsert("datacity_enabled", body.datacity ? "1" : "0"));
    if ("datify" in body) tasks.push(upsert("datify_enabled", body.datify ? "1" : "0"));
    await Promise.all(tasks);
    return Response.json({ success: true });
  } catch (e) {
    return Response.json({ success: false, error: (e as Error).message }, { status: 500 });
  }
}
