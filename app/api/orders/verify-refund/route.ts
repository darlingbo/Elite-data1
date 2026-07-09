import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

const REFUNDABLE = ["failed", "not_on_list"];

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const reference = String(body.reference ?? "").trim();
  const phone = String(body.phone ?? "").replace(/\s/g, "");

  if (!phone) {
    return Response.json({ error: "Phone number is required." }, { status: 400 });
  }

  // ── Reference provided: exact lookup ─────────────────────────────────────
  if (reference) {
    const { data: order } = await supabase
      .from("orders")
      .select("reference, customer_name, network, bundle_size, amount, phone, status")
      .eq("reference", reference)
      .maybeSingle();

    if (!order) {
      return Response.json({ error: "No order found with that reference. Check and try again." }, { status: 404 });
    }

    if ((order.phone ?? "").replace(/\s/g, "") !== phone) {
      return Response.json({ error: "Phone number does not match this order. Enter the number you used to buy." }, { status: 403 });
    }

    if (!REFUNDABLE.includes(order.status?.toLowerCase())) {
      return Response.json({ error: "This order is not eligible for a refund. Only failed orders can be refunded." }, { status: 400 });
    }

    return Response.json({
      success: true,
      order: {
        reference: order.reference,
        customer_name: order.customer_name,
        network: order.network,
        bundle_size: order.bundle_size,
        amount: order.amount,
        phone: order.phone,
      },
    });
  }

  // ── No reference: look up by phone, return most recent failed order ───────
  const { data: orders } = await supabase
    .from("orders")
    .select("reference, customer_name, network, bundle_size, amount, phone, status, created_at")
    .eq("phone", phone)
    .in("status", REFUNDABLE)
    .order("created_at", { ascending: false })
    .limit(5);

  if (!orders || orders.length === 0) {
    return Response.json({
      error: "No failed orders found for that phone number. Make sure you enter the exact number you used to pay.",
    }, { status: 404 });
  }

  // If only one failed order, proceed directly
  if (orders.length === 1) {
    const o = orders[0];
    return Response.json({
      success: true,
      order: {
        reference: o.reference,
        customer_name: o.customer_name,
        network: o.network,
        bundle_size: o.bundle_size,
        amount: o.amount,
        phone: o.phone,
      },
    });
  }

  // Multiple failed orders — return list so the customer can pick
  return Response.json({
    success: true,
    multiple: orders.map(o => ({
      reference: o.reference,
      customer_name: o.customer_name,
      network: o.network,
      bundle_size: o.bundle_size,
      amount: o.amount,
      phone: o.phone,
    })),
  });
}
