import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { randomBytes } from "crypto";

// GET — return the agent's API key (create one if it doesn't exist yet)
export async function GET(request: NextRequest) {
  const agentId = request.nextUrl.searchParams.get("agentId");
  if (!agentId) return Response.json({ error: "agentId required" }, { status: 400 });

  // Verify agent exists and is approved
  const { data: agent } = await supabase
    .from("agents")
    .select("id, name, business_name, status")
    .eq("id", agentId)
    .eq("status", "approved")
    .maybeSingle();

  if (!agent) return Response.json({ error: "Agent not found or not approved." }, { status: 404 });

  // Check if they already have an API key
  const { data: existing } = await supabase
    .from("api_keys")
    .select("id, key, name, wallet_balance, created_at")
    .eq("agent_id", agentId)
    .eq("active", true)
    .maybeSingle();

  if (existing) {
    return Response.json({ key: existing.key, name: existing.name, wallet_balance: existing.wallet_balance, created_at: existing.created_at });
  }

  // Auto-create one
  const newKey = `elite_${randomBytes(24).toString("hex")}`;
  const keyName = agent.business_name || agent.name;

  const { data: created, error } = await supabase
    .from("api_keys")
    .insert({
      key: newKey,
      name: keyName,
      active: true,
      wallet_balance: 0,
      agent_id: agentId,
    })
    .select("key, name, wallet_balance, created_at")
    .single();

  if (error || !created) return Response.json({ error: "Failed to create API key." }, { status: 500 });

  return Response.json({ key: created.key, name: created.name, wallet_balance: created.wallet_balance, created_at: created.created_at });
}
