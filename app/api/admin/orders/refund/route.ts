import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { verifyAdminSessionValue } from "@/lib/adminAuth";

async function isAdmin() {
  const c = await cookies();
  return verifyAdminSessionValue(c.get("admin_session")?.value);
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { reference, amount } = await req.json() as { reference: string; amount?: number };
  if (!reference) return Response.json({ error: "reference required" }, { status: 400 });

  // Fetch the order
  const { data: order } = await supabase
    .from("orders")
    .select("reference, paystack_reference, amount, status, refunded")
    .eq("reference", reference)
    .maybeSingle();

  if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
  if (order.refunded) return Response.json({ error: "Order has already been refunded" }, { status: 409 });

  const s = (order.status ?? "").toLowerCase();
  if (s === "completed") {
    return Response.json({ error: "Cannot refund a completed order — the bundle was already delivered." }, { status: 409 });
  }
  if (s === "processing" || s === "pending_approval" || s === "pending") {
    return Response.json(
      { error: `Cannot refund an order with status "${order.status}". Wait for it to fail first.` },
      { status: 409 }
    );
  }

  const paystackRef = order.paystack_reference ?? reference;
  const refundAmount = amount ? Math.round(amount * 100) : undefined; // Paystack uses kobo (pesewas)

  // Call Paystack Refunds API
  const paystackRes = await fetch("https://api.paystack.co/refund", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      transaction: paystackRef,
      ...(refundAmount ? { amount: refundAmount } : {}),
    }),
  });

  const paystackData = await paystackRes.json() as { status: boolean; message: string; data?: { id: number; status: string; amount: number } };

  if (!paystackRes.ok || !paystackData.status) {
    return Response.json(
      { error: `Paystack refund failed: ${paystackData.message}` },
      { status: 502 }
    );
  }

  // Mark order as refunded in DB
  await supabase.from("orders").update({
    refunded: true,
    refunded_at: new Date().toISOString(),
    refund_amount: (paystackData.data?.amount ?? 0) / 100,
    status: "failed",
  }).eq("reference", reference);

  return Response.json({
    success: true,
    refundId: paystackData.data?.id,
    amount: (paystackData.data?.amount ?? 0) / 100,
    message: paystackData.message,
  });
}
