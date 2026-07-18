import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { requireAgentSession } from "@/lib/agentAuth";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { agentId, agentType, referralCode } = body;

  if (!agentId || !referralCode || !["commission", "custom_price"].includes(agentType)) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const auth = requireAgentSession(request, agentId);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  // Verify the caller owns this agent account
  const { data: agent } = await supabase
    .from("agents")
    .select("agent_type")
    .eq("id", agentId)
    .eq("referral_code", String(referralCode).toUpperCase())
    .eq("status", "approved")
    .maybeSingle();

  if (!agent) return Response.json({ error: "Unauthorized." }, { status: 403 });

  // Type is locked after first choice — cannot be changed
  if (agent.agent_type) {
    return Response.json({ error: "Agent mode is locked and cannot be changed." }, { status: 403 });
  }

  const { error } = await supabase
    .from("agents")
    .update({ agent_type: agentType })
    .eq("id", agentId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
