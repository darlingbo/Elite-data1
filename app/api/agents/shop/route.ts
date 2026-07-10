import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const agentId = request.nextUrl.searchParams.get("agentId");
  if (!agentId) return Response.json({ error: "agentId required" }, { status: 400 });

  const { data } = await supabase
    .from("agents")
    .select("shop_name, tagline, store_color")
    .eq("id", agentId)
    .maybeSingle();

  return Response.json({ shop_name: data?.shop_name ?? null, tagline: data?.tagline ?? null, store_color: data?.store_color ?? "#3b82f6" });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { agentId, shopName, tagline, storeColor, referralCode } = body;

  if (!agentId || !shopName?.trim() || !referralCode) {
    return Response.json({ error: "agentId, shopName, and referralCode required" }, { status: 400 });
  }

  const trimmed = shopName.trim();
  if (trimmed.length < 3 || trimmed.length > 50) {
    return Response.json({ error: "Shop name must be 3–50 characters." }, { status: 400 });
  }

  // Verify the caller owns this agent account
  const { data: agent } = await supabase
    .from("agents")
    .select("id")
    .eq("id", agentId)
    .eq("referral_code", referralCode.toUpperCase())
    .eq("status", "approved")
    .maybeSingle();

  if (!agent) return Response.json({ error: "Unauthorized." }, { status: 403 });

  const updateFields: Record<string, string> = { shop_name: trimmed };
  if (tagline !== undefined) updateFields.tagline = String(tagline).slice(0, 80);
  if (storeColor && /^#[0-9a-fA-F]{6}$/.test(storeColor)) updateFields.store_color = storeColor;

  const { error } = await supabase
    .from("agents")
    .update(updateFields)
    .eq("id", agentId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
