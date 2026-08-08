import { isAdmin } from "@/lib/adminAuth";
import { supabase } from "@/lib/supabase";

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await supabase.from("master_commission_ledger")
    .select("order_reference,sub_admin_id,master_agent_id,sub_agent_id,rate,amount,admin_rate,admin_amount,reversed_at,reversal_reason,created_at")
    .order("created_at", { ascending: false }).limit(1000);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const ledger = data ?? [];
  const active = ledger.filter(row => !row.reversed_at);
  const { data: priceHistory } = await supabase.from("agent_price_history").select("target_agent_id,sub_admin_id,actor_type,price_kind,item_key,old_price,new_price,action,created_at").order("created_at", { ascending: false }).limit(250);
  return Response.json({
    summary: {
      adminEarnings: active.reduce((sum, row) => sum + Number(row.admin_amount ?? 0), 0),
      subAdminEarnings: active.reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
      reversedAdminEarnings: ledger.filter(row => row.reversed_at).reduce((sum, row) => sum + Number(row.admin_amount ?? 0), 0),
      transactions: active.length,
    },
    ledger, priceHistory: priceHistory ?? [],
  });
}
