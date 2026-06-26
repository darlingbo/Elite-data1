import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";

async function isAdmin() {
  const s = await cookies();
  return s.get("admin_session")?.value === process.env.ADMIN_SESSION_TOKEN;
}

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await supabase.from("promo_codes").select("*").order("created_at", { ascending: false });
  if (error) return Response.json({ codes: [], sql: `CREATE TABLE IF NOT EXISTS promo_codes (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, code text UNIQUE NOT NULL, discount_type text NOT NULL DEFAULT 'percent', discount_value numeric NOT NULL, max_uses int, used_count int NOT NULL DEFAULT 0, expires_at timestamptz, active boolean NOT NULL DEFAULT true, created_at timestamptz DEFAULT now());` });
  return Response.json({ codes: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const { code, discount_type = "percent", discount_value, max_uses, expires_at } = body;
  if (!code || !discount_value) return Response.json({ error: "code and discount_value required" }, { status: 400 });
  const { data, error } = await supabase.from("promo_codes").insert({ code: code.toUpperCase().trim(), discount_type, discount_value, max_uses: max_uses || null, expires_at: expires_at || null, active: true, used_count: 0 }).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ code: data });
}

export async function DELETE(req: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await req.json();
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const { error } = await supabase.from("promo_codes").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
