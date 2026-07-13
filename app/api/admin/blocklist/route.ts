import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";

async function isAdmin() {
  const c = await cookies();
  return c.get("admin_session")?.value === process.env.ADMIN_SESSION_TOKEN;
}

async function getList(): Promise<string[]> {
  const { data } = await supabase.from("system_settings").select("value").eq("key", "phone_blocklist").maybeSingle();
  try { return JSON.parse(data?.value ?? "[]"); } catch { return []; }
}

async function saveList(phones: string[]) {
  await supabase.from("system_settings").upsert(
    { key: "phone_blocklist", value: JSON.stringify(phones), updated_at: new Date().toISOString() },
    { onConflict: "key" }
  );
}

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ phones: await getList() });
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { phone } = await req.json();
  if (!phone) return Response.json({ error: "phone required" }, { status: 400 });
  const list = await getList();
  const normalized = String(phone).trim();
  if (!list.includes(normalized)) {
    list.push(normalized);
    await saveList(list);
  }
  return Response.json({ phones: list });
}

export async function DELETE(req: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { phone } = await req.json();
  const list = (await getList()).filter(p => p !== String(phone).trim());
  await saveList(list);
  return Response.json({ phones: list });
}
