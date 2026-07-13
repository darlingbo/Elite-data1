import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const { phone } = await req.json().catch(() => ({}));
  if (!phone) return Response.json({ blocked: false });

  const { data } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", "phone_blocklist")
    .maybeSingle();

  let list: string[] = [];
  try { list = JSON.parse(data?.value ?? "[]"); } catch { list = []; }

  const normalize = (p: string) =>
    String(p).trim().replace(/\s/g, "").replace(/^\+233/, "0").replace(/^233/, "0");

  const blocked = list.some(b => normalize(b) === normalize(phone));
  return Response.json({ blocked });
}
