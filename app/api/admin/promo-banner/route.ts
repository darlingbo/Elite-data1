import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";

async function isAdmin() {
  const store = await cookies();
  return store.get("admin_session")?.value === process.env.ADMIN_SESSION_TOKEN;
}

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { data } = await supabase.from("admin_config").select("value").eq("key", "promo_banner").maybeSingle();
  if (!data?.value) return Response.json({ enabled: false, message: "", submessage: "", theme: "blue" });
  try { return Response.json(JSON.parse(data.value)); }
  catch { return Response.json({ enabled: false, message: "", submessage: "", theme: "blue" }); }
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const val = JSON.stringify({
    enabled: Boolean(body.enabled),
    message: String(body.message ?? "").trim(),
    submessage: String(body.submessage ?? "").trim(),
    theme: ["blue", "gold", "purple", "green"].includes(body.theme) ? body.theme : "blue",
  });
  const { data: ex } = await supabase.from("admin_config").select("id").eq("key", "promo_banner").maybeSingle();
  if (ex) { await supabase.from("admin_config").update({ value: val }).eq("key", "promo_banner"); }
  else { await supabase.from("admin_config").insert({ key: "promo_banner", value: val }); }
  return Response.json({ success: true });
}
