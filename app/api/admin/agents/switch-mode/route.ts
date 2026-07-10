import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get("admin_session")?.value === process.env.ADMIN_SESSION_TOKEN;
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { agentId, agentType } = await req.json();

  if (!agentId || !["commission", "custom_price", "pro"].includes(agentType)) {
    return Response.json({ error: "Invalid agent type." }, { status: 400 });
  }

  const { error } = await supabase
    .from("agents")
    .update({ agent_type: agentType })
    .eq("id", agentId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
