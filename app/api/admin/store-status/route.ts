import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";

async function isAdmin() {
  const c = await cookies();
  return c.get("admin_session")?.value === process.env.ADMIN_SESSION_TOKEN;
}

async function getKV(key: string): Promise<string | null> {
  const { data } = await supabase.from("system_settings").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}
async function setKV(key: string, value: string) {
  await supabase.from("system_settings").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
}

export async function GET() {
  const [openVal, msg, helplineVal] = await Promise.all([
    getKV("store_open"),
    getKV("store_closed_message"),
    getKV("helpline_enabled"),
  ]);
  return Response.json({
    open: openVal !== "false",
    closedMessage: msg ?? "",
    helplineEnabled: helplineVal !== "false",
  });
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (typeof body.open === "boolean") await setKV("store_open", String(body.open));
  if (typeof body.closedMessage === "string") await setKV("store_closed_message", body.closedMessage);
  if (typeof body.helplineEnabled === "boolean") await setKV("helpline_enabled", String(body.helplineEnabled));
  return Response.json({ success: true });
}
