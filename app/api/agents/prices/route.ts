import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { requireAgentSession } from "@/lib/agentAuth";

export async function GET(request: NextRequest) {
  const agentId = request.nextUrl.searchParams.get("agentId");
  if (!agentId) return Response.json({ error: "agentId required" }, { status: 400 });

  const { data } = await supabase
    .from("agent_bundle_prices")
    .select("bundle_id, custom_price, active, locked_by_sub_admin_id, locked_at")
    .eq("agent_id", agentId);

  return Response.json({ prices: data ?? [] });
}

export async function POST(request: NextRequest) {
  const { agentId, bundleId, customPrice, active, referralCode } = await request.json();

  if (!agentId || !bundleId || customPrice === undefined || !referralCode) {
    return Response.json({ error: "Missing fields." }, { status: 400 });
  }
  const auth = requireAgentSession(request, agentId, { requireFull: true });
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  if (Number(customPrice) < 0.5) {
    return Response.json({ error: "Price must be at least GH₵0.50." }, { status: 400 });
  }

  // Verify the caller owns this agent account
  const { data: agent } = await supabase
    .from("agents")
    .select("id")
    .eq("id", agentId)
    .eq("referral_code", String(referralCode).toUpperCase())
    .eq("status", "approved")
    .maybeSingle();

  if (!agent) return Response.json({ error: "Unauthorized." }, { status: 403 });

  const { data: existing } = await supabase
    .from("agent_bundle_prices")
    .select("locked_by_sub_admin_id")
    .eq("agent_id", agentId)
    .eq("bundle_id", bundleId)
    .maybeSingle();
  if (existing?.locked_by_sub_admin_id) {
    return Response.json({ error: "This price is locked by your Pro sub-admin. Ask them to change or unlock it." }, { status: 423 });
  }

  const { error } = await supabase
    .from("agent_bundle_prices")
    .upsert(
      { agent_id: agentId, bundle_id: bundleId, custom_price: Number(customPrice), active: active ?? true, updated_at: new Date().toISOString() },
      { onConflict: "agent_id,bundle_id" }
    );

  if (error) return Response.json({ error: error.message }, { status: 500 });
  await supabase.from("agent_price_history").insert({
    target_agent_id: agentId, actor_type: "agent", price_kind: "bundle",
    item_key: bundleId, new_price: Number(customPrice), action: "set",
  });
  return Response.json({ success: true });
}
