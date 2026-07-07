import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const reference = String(body.reference ?? "").trim();
  const phone = String(body.phone ?? "").replace(/\s/g, "");

  if (!reference || !phone) {
    return Response.json({ error: "Reference and phone are required." }, { status: 400 });
  }

  const { data: order } = await supabase
    .from("orders")
    .select("reference, customer_name, network, bundle_size, amount, phone, status")
    .eq("reference", reference)
    .maybeSingle();

  if (!order) {
    return Response.json({ error: "No order found with that reference. Check and try again." }, { status: 404 });
  }

  if ((order.phone ?? "").replace(/\s/g, "") !== phone) {
    return Response.json({ error: "Phone number does not match this order. Make sure you enter the number you used to buy." }, { status: 403 });
  }

  const refundable = ["failed", "not_on_list"];
  if (!refundable.includes(order.status?.toLowerCase())) {
    return Response.json({ error: "This order is not eligible for a refund. Only failed orders can be refunded." }, { status: 400 });
  }

  return Response.json({
    success: true,
    order: {
      customer_name: order.customer_name,
      network: order.network,
      bundle_size: order.bundle_size,
      amount: order.amount,
      phone: order.phone,
    },
  });
}
