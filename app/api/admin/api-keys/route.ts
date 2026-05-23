import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { randomBytes } from "crypto";

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get("admin_session")?.value === process.env.ADMIN_SESSION_TOKEN;
}

function generateKey(): string {
  return "elite_" + randomBytes(24).toString("hex");
}

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("api_keys")
    .select("id, name, key_prefix, active, created_at, last_used_at, requests_count")
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ keys: data ?? [] });
}

export async function POST(request: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await request.json();
  if (!name?.trim()) return Response.json({ error: "Name is required." }, { status: 400 });

  const key = generateKey();
  const keyPrefix = key.slice(0, 12) + "…";

  const { data, error } = await supabase
    .from("api_keys")
    .insert({ name: name.trim(), key, key_prefix: keyPrefix, active: true })
    .select("id, name, key_prefix, active, created_at")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Return the full key ONCE — it will not be shown again
  return Response.json({ key: data, fullKey: key });
}

export async function PATCH(request: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id, active } = await request.json();
  if (!id) return Response.json({ error: "id required." }, { status: 400 });

  const { error } = await supabase.from("api_keys").update({ active }).eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await request.json();
  if (!id) return Response.json({ error: "id required." }, { status: 400 });

  const { error } = await supabase.from("api_keys").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
