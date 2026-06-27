import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

async function getKV(key: string): Promise<string | null> {
  const { data } = await supabase.from("system_settings").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}
async function setKV(key: string, value: string) {
  await supabase.from("system_settings").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
}

export async function GET() {
  const [openVal, msg] = await Promise.all([getKV("store_open"), getKV("store_closed_message")]);
  return Response.json({ open: openVal !== "false", closedMessage: msg ?? "" });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (typeof body.open === "boolean") await setKV("store_open", String(body.open));
  if (typeof body.closedMessage === "string") await setKV("store_closed_message", body.closedMessage);
  return Response.json({ success: true });
}
