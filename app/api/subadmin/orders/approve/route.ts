import { getSubAdminSession } from "@/lib/subAdminAuth";
import { supabase } from "@/lib/supabase";
import { approveOrder } from "@/lib/order-approval";

export async function POST(request: Request) {
  const session = await getSubAdminSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.canApproveOrders) return Response.json({ error: "Approval permission is disabled." }, { status: 403 });
  const { reference } = await request.json().catch(() => ({})) as { reference?: string };
  if (!reference) return Response.json({ error: "Reference is required." }, { status: 400 });

  const { data: order } = await supabase.from("orders")
    .select("agent_id,status")
    .eq("reference", reference)
    .maybeSingle();
  if (!order?.agent_id) return Response.json({ error: "Order is not assigned to one of your agents." }, { status: 404 });
  const { data: agent } = await supabase.from("agents")
    .select("id")
    .eq("id", order.agent_id)
    .eq("sub_admin_id", session.id)
    .maybeSingle();
  if (!agent) return Response.json({ error: "You cannot manage this order." }, { status: 403 });
  const result = await approveOrder(reference, "admin_dashboard");
  await supabase.from("sub_admin_activity").insert({ sub_admin_id: session.id, action: result.ok ? "order_approved" : "order_approval_failed", target: reference, details: { message: result.message } });
  return Response.json(result, { status: result.ok ? 200 : 409 });
}
