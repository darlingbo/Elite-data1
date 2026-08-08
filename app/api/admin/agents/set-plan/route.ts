import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { verifyAdminSessionValue } from "@/lib/adminAuth";
import { syncProAgentSubAdmin } from "@/lib/pro-subadmin";

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifyAdminSessionValue(cookieStore.get("admin_session")?.value);
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { agentId, plan } = await req.json();

  if (!agentId || !["free", "pro"].includes(plan)) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const { error } = await supabase
    .from("agents")
    .update({ plan })
    .eq("id", agentId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (plan === "pro") {
    const { data: agent } = await supabase.from("agents").select("id,name,email,password_hash,plan,status,sub_admin_id").eq("id", agentId).single();
    if (agent) await syncProAgentSubAdmin(agent);
  }
  return Response.json({ success: true });
}
