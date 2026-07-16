import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { networkApiName } from "@/lib/bundles";
import { sendAgentNotification, sendAdminAlert } from "@/lib/telegram";
import { inventorPurchase, inventorVoucher } from "@/lib/inventor";

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

  // Detect mashup orders — manually fulfilled by admin, skip Inventor
  const { data: mashupBundleList } = await supabase
    .from("mashup_bundles")
    .select("id, data_value, data_unit, minutes")
    .eq("active", true);
  const isMashupOrder = !isVoucher && (mashupBundleList ?? []).some(b => {
    const label = b.minutes > 0
      ? `${b.data_value}${b.data_unit} + ${b.minutes}min`
      : `${b.data_value}${b.data_unit}`;
    return label === order.bundle_size;
  });

  if (isMashupOrder) {
    await supabase.from("orders").update({ status: "processing" }).eq("reference", reference);
    if (order.agent_id && Number(order.agent_commission ?? 0) > 0) {
      const { data: ag } = await supabase.from("agents")
        .select("agent_type, plan, commission_balance, wallet_balance, paystack_wallet_balance, total_sales, total_revenue")
        .eq("id", order.agent_id).maybeSingle();
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
    return { ok: true, message: `Mashup approved — deliver ${order.bundle_size} to ${order.phone} manually, then force-complete` };
  }

  let apiOk = false;
  let balanceAfter: number | null = null;
  let errorBody: Record<string, unknown> = {};

  if (isVoucher) {
    const voucherTypeMatch = String(order.bundle_size ?? "").match(/^(BECE|WASSCE)/i);
    const qtyMatch = String(order.bundle_size ?? "").match(/x(\d+)/i);
    const voucherType = voucherTypeMatch ? voucherTypeMatch[1].toUpperCase() : "BECE";
    const qty = qtyMatch ? parseInt(qtyMatch[1]) : 1;
    const recipient = order.phone.startsWith("0") ? `233${order.phone.slice(1)}` : order.phone;
    const result = await inventorVoucher(voucherType, recipient, qty);
    apiOk = result.ok;
    if (!apiOk) errorBody = result.body;
  } else {
    const networkApiMap: Record<string, string> = { mtn: "MTN", telecel: "TELECEL", airteltigo: "AT ISHARE" };
    const network = networkApiMap[order.network as string] ?? networkApiName[order.network as keyof typeof networkApiName] ?? "MTN";
    const sizeGB = Number(order.bundle_size_gb ?? 1);
    const result = await inventorPurchase(network, order.phone, sizeGB, reference);
    apiOk = result.ok;
    balanceAfter = result.balance;
    if (!apiOk) errorBody = result.body;
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

    // Check balance from purchase response; alert if low (fire-and-forget)
    ;(async () => {
      try {
        const { inventorBalance } = await import("@/lib/inventor");
        const bal = balanceAfter ?? await inventorBalance();
        if (bal !== null) {
          const low = Number(process.env.INVENTOR_LOW_BALANCE_GHS ?? 50);
          if (bal < low) {
            sendAdminAlert(`⚠️ <b>Inventor balance low: GH₵${bal.toFixed(2)}</b> — top up now to avoid delivery failures.`).catch(() => {});
          }
        }
      } catch { /* never break the approval flow */ }
    })();

    // Wallet orders: notify agent of successful delivery
    if (reference.startsWith("AGTWALLET-") && order.agent_id) {
      const { data: ag } = await supabase
        .from("agents").select("telegram_chat_id").eq("id", order.agent_id).maybeSingle();
      if (ag?.telegram_chat_id) {
        sendAgentNotification(
          ag.telegram_chat_id,
          `✅ <b>Delivered!</b>\n\n` +
          `📱 ${order.network?.toUpperCase()} ${order.bundle_size} → <code>${order.phone}</code>\n` +
          `📎 <code>${reference}</code>`
        ).catch(() => {});
      }
    }

    return { ok: true, message: "Approved & sent" };
  } else {
    await supabase.from("orders").update({ status: "failed" }).eq("reference", reference);
    // Extract human-readable error from Inventor response
    const errMsg = String(
      (errorBody.error as string) ?? (errorBody.message as string) ?? JSON.stringify(errorBody)
    ).slice(0, 160);
    return { ok: false, message: errMsg };
  }
}

async function runReject(reference: string): Promise<{ ok: boolean; message: string }> {
  const { data: order } = await supabase
    .from("orders")
    .select("phone, network, bundle_size, amount, status, customer_name, agent_id")
    .eq("reference", reference)
    .maybeSingle();

  if (!order) return { ok: false, message: "Order not found" };
  if (order.status !== "pending_approval") {
    return { ok: false, message: `Already ${order.status}` };
  }

  await supabase.from("orders").update({ status: "rejected" }).eq("reference", reference);

  // Wallet orders: refund the deducted amount and notify agent
  if (reference.startsWith("AGTWALLET-") && order.agent_id) {
    const { data: ag } = await supabase
      .from("agents")
      .select("wallet_balance, telegram_chat_id, name")
      .eq("id", order.agent_id)
      .maybeSingle();
    if (ag) {
      await supabase.from("agents")
        .update({ wallet_balance: Number(ag.wallet_balance ?? 0) + Number(order.amount ?? 0) })
        .eq("id", order.agent_id);
      if (ag.telegram_chat_id) {
        sendAgentNotification(
          ag.telegram_chat_id,
          `❌ <b>Order Rejected</b>\n\n` +
          `📱 ${order.network?.toUpperCase()} ${order.bundle_size} → <code>${order.phone}</code>\n` +
          `💰 GH₵${Number(order.amount).toFixed(2)} refunded to your wallet\n` +
          `📎 <code>${reference}</code>\n\nContact admin for details.`
        ).catch(() => {});
      }
    }
  }

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
