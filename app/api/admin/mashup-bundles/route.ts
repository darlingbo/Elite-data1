import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";

async function isAdmin() {
  const s = await cookies();
  return s.get("admin_session")?.value === process.env.ADMIN_SESSION_TOKEN;
}

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await supabase.from("mashup_bundles").select("*").order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ bundles: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const { name, data_value, data_unit = "GB", minutes = 0, price, cost_price = 0, network = "airteltigo" } = body;
  if (!name || !data_value || !price) return Response.json({ error: "name, data_value, price required" }, { status: 400 });
  const { data, error } = await supabase.from("mashup_bundles").insert({ name, data_value, data_unit, minutes, price, cost_price, network, active: true }).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ bundle: data });
}

export async function PATCH(req: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const { id, ...fields } = body;
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const { error } = await supabase.from("mashup_bundles").update(fields).eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await req.json();
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const { error } = await supabase.from("mashup_bundles").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
