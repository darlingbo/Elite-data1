import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { verifyAdminSessionValue } from "@/lib/adminAuth";
import { getPaymentAttempt } from "@/lib/payment-attempt";

async function isAdmin() {
  const c = await cookies();
  return verifyAdminSessionValue(c.get("admin_session")?.value);
}

const MOMO_LABEL: Record<string, string> = { mtn: "MTN MoMo", telecel: "Telecel Cash", at: "AirtelTigo Money" };

/**
 * Everything the admin needs to decide on one order: how it was paid, who the
 * customer is, and what has happened to it so far.
 */
export async function GET(request: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const reference = request.nextUrl.searchParams.get("reference")?.trim();
  if (!reference) return Response.json({ error: "reference required" }, { status: 400 });

  const { data: order } = await supabase.from("orders").select("*").eq("reference", reference).maybeSingle();
  if (!order) return Response.json({ error: "Order not found" }, { status: 404 });

  const payRef = String(order.paystack_reference ?? order.reference);
  const method = String(order.payment_method ?? "").toLowerCase();
  const isMomo =
    /^(?:ybk|yebeck)-/i.test(payRef) || method.startsWith("yebeck") || method === "momo" || method === "mobile_money";
  const isWallet = ["agent_wallet", "api_wallet"].includes(method) || /^(AGTWALLET|AGTAPI|API)-/.test(String(order.reference));

  let payer: { phone: string | null; network: string | null; label: string | null } = { phone: null, network: null, label: null };
  if (isMomo) {
    const attempt = await getPaymentAttempt(payRef).catch(() => null);
    const meta = (attempt?.metadata ?? {}) as { payerPhone?: string; provider?: string };
    payer = {
      phone: meta.payerPhone ?? null,
      network: meta.provider ?? null,
      label: meta.provider ? (MOMO_LABEL[meta.provider] ?? meta.provider) : null,
    };
  }

  const phone = String(order.phone ?? "");
  const { data: history } = await supabase
    .from("orders")
    .select("reference, status, refunded, created_at")
    .eq("phone", phone)
    .order("created_at", { ascending: false })
    .limit(300);
  const rows = (history as Array<{ reference: string; status: string; refunded?: boolean | null; created_at: string }> | null) ?? [];
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const customer = {
    total: rows.length,
    today: rows.filter((r) => new Date(r.created_at) >= startOfDay).length,
    refunds: rows.filter((r) => r.refunded).length,
    failed: rows.filter((r) => r.status === "failed").length,
  };

  const { data: logs } = await supabase
    .from("order_logs")
    .select("action, note, created_at")
    .eq("reference", reference)
    .order("created_at", { ascending: true })
    .limit(50);

  const timeline: Array<{ at: string; text: string }> = [];
  if (order.created_at) timeline.push({ at: String(order.created_at), text: "Order placed and paid" });
  if (order.approved_at) timeline.push({ at: String(order.approved_at), text: `Approved${order.approved_via ? ` (${String(order.approved_via).replace(/_/g, " ")})` : ""}` });
  for (const l of ((logs as Array<{ action: string; note: string | null; created_at: string }> | null) ?? [])) {
    timeline.push({ at: l.created_at, text: l.note ? `${l.action}: ${l.note}` : l.action });
  }
  if (order.completed_at) timeline.push({ at: String(order.completed_at), text: "Delivered" });
  if (order.refunded_at) timeline.push({ at: String(order.refunded_at), text: "Refund recorded" });
  timeline.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  const notes: string[] = [];
  if (customer.today >= 3) notes.push(`${customer.today}${customer.today === 3 ? "rd" : "th"} order from this number today`);
  if (Number(order.amount) >= 100) notes.push("Large amount");
  if (customer.refunds > 0) notes.push(`${customer.refunds} earlier refund${customer.refunds > 1 ? "s" : ""}`);

  return Response.json({
    order: {
      reference: order.reference,
      status: order.status,
      amount: Number(order.amount ?? 0),
      phone,
      network: order.network,
      bundle_size: order.bundle_size,
      customer_name: order.customer_name,
      created_at: order.created_at,
      refunded: !!order.refunded,
      refund_phone: order.refund_phone ?? null,
      agent_id: order.agent_id ?? null,
    },
    payment: {
      kind: isWallet ? "wallet" : isMomo ? "momo" : "card",
      payerPhone: payer.phone,
      payerNetwork: payer.label,
    },
    customer,
    notes,
    timeline,
  });
}
