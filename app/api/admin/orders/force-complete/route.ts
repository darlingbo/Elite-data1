import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { sendAdminAlert } from "@/lib/telegram";

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get("admin_session")?.value === process.env.ADMIN_SESSION_TOKEN;
}

export async function POST(request: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { reference } = await request.json();
  if (!reference) return Response.json({ error: "reference required" }, { status: 400 });

  const { data: order } = await supabase
    .from("orders")
    .select("reference, phone, network, bundle_size, agent_id, agent_commission, admin_commission, cost_price, amount, status")
    .eq("reference", reference)
    .maybeSingle();

  if (!order) return Response.json({ error: "Order not found" }, { status: 404 });

  await supabase.from("orders").update({ status: "completed" }).eq("reference", reference);

  // Credit agent commission if not already done
  if (order.agent_id && (order.agent_commission || order.amount)) {
    const commission = Number(order.agent_commission) || 0;
    const revenue = Number(order.amount) || 0;
    const { data: ag } = await supabase.from("agents").select("commission_balance, total_sales, total_revenue").eq("id", order.agent_id).maybeSingle();
    if (ag) {
      await supabase.from("agents").update({
        commission_balance: (Number(ag.commission_balance) || 0) + commission,
        total_sales: (Number(ag.total_sales) || 0) + 1,
        total_revenue: (Number(ag.total_revenue) || 0) + revenue,
        updated_at: new Date().toISOString(),
      }).eq("id", order.agent_id);
    }
  }

  try {
    await supabase.from("order_logs").insert({
      reference,
      action: "force_complete",
      note: "Admin manually marked as completed",
      details: { phone: order.phone, network: order.network, bundle: order.bundle_size, from_status: order.status },
    });
  } catch { /* non-critical */ }

  await sendAdminAlert(
    `✅ MANUALLY COMPLETED\nRef: ${reference}\nPhone: ${order.phone}\n${(order.network ?? "").toUpperCase()} ${order.bundle_size}\nMarked complete by admin`
  ).catch(() => {});

  return Response.json({ success: true });
}
