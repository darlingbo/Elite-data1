import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendAdminAlert } from "@/lib/telegram";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Pull counts from every critical table
    const [
      { count: totalOrders },
      { count: completedOrders },
      { count: totalAgents },
      { count: activeAgents },
      { count: totalBundles },
      { data: revenueRows },
    ] = await Promise.all([
      supabase.from("orders").select("*", { count: "exact", head: true }),
      supabase.from("orders").select("*", { count: "exact", head: true }).eq("status", "COMPLETED"),
      supabase.from("agents").select("*", { count: "exact", head: true }),
      supabase.from("agents").select("*", { count: "exact", head: true }).eq("status", "approved"),
      supabase.from("bundle_prices").select("*", { count: "exact", head: true }).eq("active", true),
      supabase.from("orders").select("amount").eq("status", "COMPLETED"),
    ]);

    const totalRevenue = (revenueRows ?? []).reduce((s, o) => s + Number(o.amount), 0);

    // Export last 500 orders as the backup payload
    const { data: orders } = await supabase
      .from("orders")
      .select("reference,status,customer_name,phone,network,bundle_size,amount,created_at")
      .order("created_at", { ascending: false })
      .limit(500);

    const { data: agents } = await supabase
      .from("agents")
      .select("id,name,email,phone,referral_code,status,commission_balance,total_sales,total_revenue,created_at");

    const { data: bundles } = await supabase
      .from("bundle_prices")
      .select("id,network,size_label,price,cost_price,active");

    // Save snapshot to Supabase (rolling — keep last 7 days by key)
    const today = new Date().toISOString().slice(0, 10);
    await supabase.from("system_settings").upsert(
      {
        key: `backup_snapshot_${today}`,
        value: JSON.stringify({ orders, agents, bundles, created_at: new Date().toISOString() }),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

    // Clean up snapshots older than 7 days
    for (let i = 8; i <= 14; i++) {
      const old = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      await supabase.from("system_settings").delete().eq("key", `backup_snapshot_${old}`);
    }

    await sendAdminAlert(
      `🗄️ <b>Daily Backup Complete</b>\n\n` +
      `📦 Orders: ${totalOrders ?? 0} total, ${completedOrders ?? 0} completed\n` +
      `💰 Total Revenue: GH₵${totalRevenue.toFixed(2)}\n` +
      `👥 Agents: ${activeAgents ?? 0} active / ${totalAgents ?? 0} total\n` +
      `📡 Active Bundles: ${totalBundles ?? 0}\n\n` +
      `Snapshot saved for ${today}. Download from Admin → Settings → Download Backup.`
    );

    return Response.json({ ok: true, date: today, orders: totalOrders, revenue: totalRevenue });
  } catch (err) {
    await sendAdminAlert(`⚠️ Daily backup FAILED: ${String(err)}`).catch(() => {});
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
