import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return Response.json({ error: "Code required" }, { status: 400 });
  }

  const { data: agent } = await supabase
    .from("agents")
    .select("name, phone, whatsapp")
    .eq("referral_code", code.toUpperCase())
    .eq("status", "approved")
    .maybeSingle();

  if (!agent) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  // Prefer whatsapp number, fall back to phone, normalise to international format
  const raw = (agent.whatsapp || agent.phone || "").replace(/\s+/g, "");
  const whatsapp = raw.startsWith("0") ? "233" + raw.slice(1) : raw.replace(/^\+/, "");

  return Response.json({ success: true, name: agent.name, whatsapp });
}
