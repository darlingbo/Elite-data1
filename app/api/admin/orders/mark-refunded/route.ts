import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";

async function isAdmin() {
  const c = await cookies();
  return c.get("admin_session")?.value === process.env.ADMIN_SESSION_TOKEN;
}

// POST /api/admin/orders/mark-refunded
// Body: { reference: string } OR { markAllFailed: true }
// Marks order(s) as manually refunded — no Paystack call
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { reference?: string; markAllFailed?: boolean };

  const now = new Date().toISOString();

  if (body.markAllFailed) {
    // Bulk: mark ALL failed unrefunded orders as manually refunded
    const { data: failedOrders } = await supabase
      .from("orders")
      .select("reference, amount")
      .eq("status", "failed")
      .or("refunded.is.null,refunded.eq.false");

    if (!failedOrders || failedOrders.length === 0) {
      return Response.json({ success: true, count: 0, message: "No failed orders to mark." });
    }

    const refs = failedOrders.map(o => o.reference);
    const { error } = await supabase
      .from("orders")
      .update({ refunded: true, refunded_at: now, refund_amount: null })
      .in("reference", refs);

    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ success: true, count: refs.length });
  }

  if (!body.reference) return Response.json({ error: "reference required" }, { status: 400 });

  const { data: order } = await supabase
    .from("orders")
    .select("reference, refunded")
    .eq("reference", body.reference)
    .maybeSingle();

  if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
  if (order.refunded) return Response.json({ error: "Already refunded" }, { status: 409 });

  const { error } = await supabase
    .from("orders")
    .update({ refunded: true, refunded_at: now, refund_amount: null })
    .eq("reference", body.reference);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ success: true });
}
