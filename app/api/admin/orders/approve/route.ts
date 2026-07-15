import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { networkApiName } from "@/lib/bundles";

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get("admin_session")?.value === process.env.ADMIN_SESSION_TOKEN;
}

async function runApprove(reference: string): Promise<{ ok: boolean; message: string }> {
  const { data: order } = await supabase
    .from("orders")
    .select("*")
    .eq("reference", reference)
    .maybeSingle();

  if (!order) return { ok: false, message: "Order not found" };
  if (order.status !== "pending_approval") {
    return { ok: false, message: `Already ${order.status}` };
  }

  const isVoucher = order.network === "voucher";
  let apiOk = false;
  let errorBody: Record<string, unknown> = {};

  if (isVoucher) {
    const voucherTypeMatch = String(order.bundle_size ?? "").match(/^(BECE|WASSCE)/i);
    const qtyMatch = String(order.bundle_size ?? "").match(/x(\d+)/i);
    const voucherType = voucherTypeMatch ? voucherTypeMatch[1].toUpperCase() : "BECE";
    const qty = qtyMatch ? parseInt(qtyMatch[1]) : 1;
    try {
      const res = await fetch(`${process.env.INVENTOR_API_BASE_URL}/api/developer/vouchers`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.INVENTOR_API_KEY}` },
        body: JSON.stringify({ voucherType, Phone: order.phone, quantity: qty }),
        signal: AbortSignal.timeout(15000),
      });
      const body = await res.json().catch(() => ({})) as Record<string, unknown>;
      apiOk = res.ok && body.success === true;
      if (!apiOk) errorBody = body;
    } catch (err) {
      errorBody = { error: String(err) };
    }
  } else {
    const networkApiMap: Record<string, string> = { mtn: "MTN", telecel: "TELECEL", airteltigo: "AT ISHARE" };
    const sizeGB = Number(order.bundle_size_gb ?? 1);
    try {
      const res = await fetch(`${process.env.INVENTOR_API_BASE_URL}/api/developer/purchase`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.INVENTOR_API_KEY}` },
        body: JSON.stringify({
          network: networkApiMap[order.network as string] ?? networkApiName[order.network as keyof typeof networkApiName] ?? "MTN",
          Phone: order.phone,
          Datasize: sizeGB,
          reference,
        }),
        signal: AbortSignal.timeout(25000),
      });
      const body = await res.json().catch(() => ({})) as Record<string, unknown>;
      const bodyData = (body.data as Record<string, unknown>) ?? {};
      const orderData = (bodyData.order as Record<string, unknown>) ?? bodyData;
      const rawStatus = String(orderData.status ?? bodyData.status ?? body.status ?? "").toLowerCase();
      const isProcessing = res.status === 409 || rawStatus.includes("process") || rawStatus.includes("progress") || rawStatus.includes("pending");
      apiOk = res.ok || res.status === 409 || isProcessing;
      if (!apiOk) errorBody = body;
    } catch (err) {
      errorBody = { error: String(err) };
    }
  }

  if (apiOk) {
    await supabase.from("orders").update({ status: "processing" }).eq("reference", reference);

    // Credit agent commission now that delivery is confirmed
    if (order.agent_id && Number(order.agent_commission ?? 0) > 0) {
      const { data: ag } = await supabase
        .from("agents")
        .select("agent_type, plan, commission_balance, wallet_balance, paystack_wallet_balance, total_sales, total_revenue")
        .eq("id", order.agent_id)
        .maybeSingle();
      if (ag) {
        if (ag.agent_type === "custom_price" && ag.plan === "free") {
          const adminTierPrice = Number(order.cost_price ?? 0) + Number(order.admin_commission ?? 0);
          await supabase.from("agents").update({
            wallet_balance: Math.max(0, Number(ag.wallet_balance ?? 0) - adminTierPrice),
            paystack_wallet_balance: Math.max(0, Number(ag.paystack_wallet_balance ?? 0) - adminTierPrice),
            commission_balance: Number(ag.commission_balance ?? 0) + Number(order.agent_commission),
            total_sales: Number(ag.total_sales ?? 0) + 1,
          }).eq("id", order.agent_id);
        } else {
          await supabase.from("agents").update({
            commission_balance: Number(ag.commission_balance ?? 0) + Number(order.agent_commission),
            total_sales: Number(ag.total_sales ?? 0) + 1,
            total_revenue: Number(ag.total_revenue ?? 0) + Number(order.amount ?? 0),
          }).eq("id", order.agent_id);
        }
      }
    }

    return { ok: true, message: "Approved & sent" };
  } else {
    await supabase.from("orders").update({ status: "failed" }).eq("reference", reference);
    return { ok: false, message: `API error: ${JSON.stringify(errorBody).slice(0, 120)}` };
  }
}

async function runReject(reference: string): Promise<{ ok: boolean; message: string }> {
  const { data: order } = await supabase
    .from("orders")
    .select("phone, network, bundle_size, amount, status, customer_name")
    .eq("reference", reference)
    .maybeSingle();

  if (!order) return { ok: false, message: "Order not found" };
  if (order.status !== "pending_approval") {
    return { ok: false, message: `Already ${order.status}` };
  }

  await supabase.from("orders").update({ status: "rejected" }).eq("reference", reference);

  return { ok: true, message: "Rejected" };
}

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { references, action } = await request.json() as { references: string[]; action: "approve" | "reject" };

  if (!Array.isArray(references) || references.length === 0) {
    return Response.json({ error: "No references provided" }, { status: 400 });
  }
  if (action !== "approve" && action !== "reject") {
    return Response.json({ error: "Invalid action" }, { status: 400 });
  }

  const results = await Promise.all(
    references.map(ref =>
      (action === "approve" ? runApprove(ref) : runReject(ref)).then(r => ({ reference: ref, ...r }))
    )
  );

  const succeeded = results.filter(r => r.ok).length;
  return Response.json({ results, succeeded, total: references.length });
}
