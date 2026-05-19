import type { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/orders/[reference]">
) {
  const { reference } = await ctx.params;

  const { data, error } = await supabase
    .from("orders")
    .select("reference, status, customer_name, phone, network, bundle_size, amount, created_at, updated_at, inventor_order_id")
    .eq("reference", reference)
    .maybeSingle();

  if (error || !data) {
    return Response.json({ error: "Order not found" }, { status: 404 });
  }

  return Response.json({ success: true, order: data });
}
