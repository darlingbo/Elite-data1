import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { verifyAdminSessionValue } from "@/lib/adminAuth";

async function isAdmin(): Promise<boolean> {
  const c = await cookies();
  return verifyAdminSessionValue(c.get("admin_session")?.value);
}

// POST { references: string[] }
// Marks orders as completed and credits agent commission for each.
export async function POST(request: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { references } = await request.json() as { references: string[] };
  if (!Array.isArray(references) || references.length === 0) {
    return Response.json({ error: "references array required" }, { status: 400 });
  }

  const results: { ref: string; ok: boolean; note?: string }[] = [];

  for (const ref of references) {
    const { data: order } = await supabase
      .from("orders")
      .select("reference, status, agent_id, agent_commission, amount")
      .eq("reference", ref)
      .maybeSingle();

    if (!order) { results.push({ ref, ok: false, note: "not found" }); continue; }
    if (order.status === "completed") { results.push({ ref, ok: true, note: "already completed" }); continue; }

    await supabase.from("orders").update({ status: "completed" }).eq("reference", ref);

    // Credit agent commission
    if (order.agent_id) {
      const commission = Number(order.agent_commission) || 0;
      const revenue = Number(order.amount) || 0;
      const { data: agent } = await supabase
        .from("agents")
        .select("commission_balance, total_sales, total_revenue")
        .eq("id", order.agent_id)
        .maybeSingle();
      if (agent) {
        await supabase.from("agents").update({
          commission_balance: (Number(agent.commission_balance) || 0) + commission,
          total_sales: (Number(agent.total_sales) || 0) + 1,
          total_revenue: (Number(agent.total_revenue) || 0) + revenue,
          updated_at: new Date().toISOString(),
        }).eq("id", order.agent_id);
      }
    }

    results.push({ ref, ok: true, note: "marked completed" });
  }

  const done = results.filter(r => r.ok).length;
  return Response.json({ done, total: references.length, results });
}
