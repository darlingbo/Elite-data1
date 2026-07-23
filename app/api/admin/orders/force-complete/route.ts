import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { sendAdminAlert } from "@/lib/telegram";
import { verifyAdminSessionValue } from "@/lib/adminAuth";

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifyAdminSessionValue(cookieStore.get("admin_session")?.value);
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
  if (order.status === "completed") return Response.json({ error: "Order is already completed." }, { status: 409 });

  const { error: completeError } = await supabase.rpc("admin_complete_order", {
    p_reference: reference,
  });
  if (completeError) return Response.json({ error: completeError.message }, { status: 409 });

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
