import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { sendAdminAlert, fmtAgentApproved } from "@/lib/telegram";

function generateReferralCode(name: string): string {
  const prefix = name.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, "X");
  const suffix = Math.random().toString(36).substring(2, 7).toUpperCase();
  return prefix + suffix;
}

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get("admin_session")?.value === process.env.ADMIN_SESSION_TOKEN;
}

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/agents/[id]/status">
) {
  if (!(await isAdmin())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const { action, rejection_reason } = await request.json();

  if (action !== "approve" && action !== "reject") {
    return Response.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
  }

  const { data: agent, error: fetchErr } = await supabase
    .from("agents")
    .select("id, name, email, status")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !agent) {
    return Response.json({ error: "Agent not found" }, { status: 404 });
  }

  if (action === "approve") {
    let referral_code = generateReferralCode(agent.name);
    // Ensure uniqueness
    let attempts = 0;
    while (attempts < 5) {
      const { data: clash } = await supabase
        .from("agents")
        .select("id")
        .eq("referral_code", referral_code)
        .maybeSingle();
      if (!clash) break;
      referral_code = generateReferralCode(agent.name);
      attempts++;
    }

    await supabase
      .from("agents")
      .update({ status: "approved", referral_code, updated_at: new Date().toISOString() })
      .eq("id", id);

    await sendAdminAlert(fmtAgentApproved(agent.name, referral_code));

    return Response.json({ success: true, referral_code });
  } else {
    await supabase
      .from("agents")
      .update({
        status: "rejected",
        rejection_reason: rejection_reason ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    return Response.json({ success: true });
  }
}
