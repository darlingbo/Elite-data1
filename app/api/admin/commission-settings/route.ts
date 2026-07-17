import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { cookies } from "next/headers";

async function isAdmin() {
  const c = await cookies();
  return c.get("admin_session")?.value === process.env.ADMIN_SESSION_TOKEN;
}

// GET — returns global split + all agent overrides
export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [globalRes, overridesRes, agentsRes] = await Promise.all([
    supabase.from("commission_settings").select("agent_pct").eq("id", "global").maybeSingle(),
    supabase.from("agent_commission_overrides").select("agent_id, agent_pct, note"),
    supabase.from("agents").select("id, name, referral_code, agent_type").eq("status", "approved").order("name"),
  ]);

  // Auto-initialize the global row if it doesn't exist yet
  if (!globalRes.data && !globalRes.error) {
    await supabase.from("commission_settings")
      .upsert({ id: "global", agent_pct: 80, updated_at: new Date().toISOString() }, { onConflict: "id" });
  }

  return Response.json({
    global_agent_pct: globalRes.data?.agent_pct ?? 80,
    overrides: overridesRes.data ?? [],
    agents: agentsRes.data ?? [],
    table_missing: !!globalRes.error,
  });
}

// POST — update global split or set per-agent override
export async function POST(request: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as {
    type: "global" | "agent";
    agent_pct: number;
    agent_id?: string;
    note?: string;
  };

  const pct = Number(body.agent_pct);
  if (isNaN(pct) || pct < 0 || pct > 100) {
    return Response.json({ error: "Percentage must be between 0 and 100." }, { status: 400 });
  }

  if (body.type === "global") {
    const { error } = await supabase
      .from("commission_settings")
      .upsert({ id: "global", agent_pct: pct, updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (error) return Response.json({ error: `Could not save split: ${error.message}. Run the setup SQL in Supabase first.` }, { status: 500 });

    // Read back to confirm the value was actually stored
    const { data: confirmed } = await supabase.from("commission_settings").select("agent_pct").eq("id", "global").maybeSingle();
    return Response.json({ success: true, global_agent_pct: confirmed?.agent_pct ?? pct });
  }

  if (body.type === "agent") {
    if (!body.agent_id) return Response.json({ error: "agent_id required" }, { status: 400 });
    const { error } = await supabase
      .from("agent_commission_overrides")
      .upsert({
        agent_id: body.agent_id,
        agent_pct: pct,
        note: body.note ?? null,
        updated_at: new Date().toISOString(),
      });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ success: true });
  }

  return Response.json({ error: "Invalid type" }, { status: 400 });
}

// DELETE — remove per-agent override (revert to global)
export async function DELETE(request: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const agentId = request.nextUrl.searchParams.get("agentId");
  if (!agentId) return Response.json({ error: "agentId required" }, { status: 400 });

  const { error } = await supabase
    .from("agent_commission_overrides")
    .delete()
    .eq("agent_id", agentId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
