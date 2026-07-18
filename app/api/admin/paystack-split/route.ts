import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { verifyAdminSessionValue } from "@/lib/adminAuth";

async function isAdmin() {
  const s = await cookies();
  return verifyAdminSessionValue(s.get("admin_session")?.value);
}

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { data: agents } = await supabase
    .from("agents")
    .select("id, name, referral_code, email, status, paystack_subaccount_code")
    .eq("status", "approved")
    .order("name");
  return Response.json({ agents: agents ?? [] });
}

export async function PATCH(req: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { agentId, subaccountCode } = await req.json();
  if (!agentId) return Response.json({ error: "agentId required" }, { status: 400 });
  const { error } = await supabase.from("agents").update({ paystack_subaccount_code: subaccountCode || null }).eq("id", agentId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
