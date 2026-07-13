import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";

async function isAdmin() {
  const c = await cookies();
  return c.get("admin_session")?.value === process.env.ADMIN_SESSION_TOKEN;
}

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Try to return the latest saved snapshot first (fast)
  const today = new Date().toISOString().slice(0, 10);
  const { data: snap } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", `backup_snapshot_${today}`)
    .maybeSingle();

  if (snap?.value) {
    return new Response(snap.value, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="elitedata-backup-${today}.json"`,
      },
    });
  }

  // No snapshot yet — generate live
  const [
    { data: orders },
    { data: agents },
    { data: bundles },
    { data: settings },
  ] = await Promise.all([
    supabase.from("orders").select("reference,status,customer_name,phone,network,bundle_size,amount,created_at").order("created_at", { ascending: false }).limit(1000),
    supabase.from("agents").select("id,name,email,phone,referral_code,status,commission_balance,total_sales,total_revenue,created_at"),
    supabase.from("bundle_prices").select("id,network,size_label,price,cost_price,active"),
    supabase.from("system_settings").select("key,value").not("key", "like", "backup_snapshot_%"),
  ]);

  const backup = JSON.stringify({
    created_at: new Date().toISOString(),
    orders,
    agents,
    bundles,
    settings: (settings ?? []).filter(s =>
      !["admin_password_hash", "phone_blocklist"].includes(s.key)
    ),
  }, null, 2);

  return new Response(backup, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="elitedata-backup-${today}.json"`,
    },
  });
}
