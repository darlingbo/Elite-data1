import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { sendAdminAlert } from "@/lib/telegram";
import { verifyAdminSessionValue } from "@/lib/adminAuth";

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifyAdminSessionValue(cookieStore.get("admin_session")?.value);
}

export async function POST() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Sum up completed commissions per agent
  const { data: totals, error } = await supabase
    .from("orders")
    .select("agent_id, agent_commission, amount")
    .eq("status", "completed")
    .not("agent_id", "is", null);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Group by agent
  const map = new Map<string, { earned: number; count: number; revenue: number }>();
  for (const row of totals ?? []) {
    if (!row.agent_id) continue;
    const cur = map.get(row.agent_id) ?? { earned: 0, count: 0, revenue: 0 };
    cur.earned  += Number(row.agent_commission ?? 0);
    cur.count   += 1;
    cur.revenue += Number(row.amount ?? 0);
    map.set(row.agent_id, cur);
  }

  if (map.size === 0) return Response.json({ updated: 0, message: "No completed agent orders found" });

  // Fetch current agent balances
  const agentIds = Array.from(map.keys());
  const { data: agents } = await supabase
    .from("agents")
    .select("id, name, commission_balance, total_sales, total_revenue")
    .in("id", agentIds);

  let updated = 0;
  const report: string[] = [];

  for (const agent of agents ?? []) {
    const expected = map.get(agent.id);
    if (!expected) continue;

    const currentBalance = Number(agent.commission_balance ?? 0);
    const currentSales   = Number(agent.total_sales ?? 0);
    const currentRevenue = Number(agent.total_revenue ?? 0);

    const newBalance = Math.max(currentBalance, expected.earned);
    const newSales   = Math.max(currentSales,   expected.count);
    const newRevenue = Math.max(currentRevenue, expected.revenue);

    // Only update if something actually changed
    if (newBalance !== currentBalance || newSales !== currentSales || newRevenue !== currentRevenue) {
      await supabase
        .from("agents")
        .update({ commission_balance: newBalance, total_sales: newSales, total_revenue: newRevenue })
        .eq("id", agent.id);

      const diff = (newBalance - currentBalance).toFixed(2);
      report.push(`${agent.name}: +GH₵${diff}`);
      updated++;
    }
  }

  if (updated > 0) {
    await sendAdminAlert(
      `💰 COMMISSION RECALCULATED\n${updated} agent(s) updated:\n\n${report.join("\n")}`
    ).catch(() => {});
  }

  return Response.json({ updated, report, checked: agentIds.length });
}
