import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendAdminAlert, sendAgentNotification } from "@/lib/telegram";

async function creditAgent(agentId: string, commission: number, revenue: number) {
  if (!agentId || !commission) return;
  const { data: agent } = await supabase
    .from("agents")
    .select("commission_balance, total_sales, total_revenue, telegram_chat_id")
    .eq("id", agentId)
    .maybeSingle();
  if (!agent) return;
  await supabase.from("agents").update({
    commission_balance: (Number(agent.commission_balance) || 0) + commission,
    total_sales: (Number(agent.total_sales) || 0) + 1,
    total_revenue: (Number(agent.total_revenue) || 0) + revenue,
    updated_at: new Date().toISOString(),
  }).eq("id", agentId);
  return agent.telegram_chat_id as string | null;
}

async function refundWallet(agentId: string, amount: number) {
  const { data: agent } = await supabase
    .from("agents")
    .select("wallet_balance")
    .eq("id", agentId)
    .maybeSingle();
  if (!agent) return;
  await supabase.from("agents")
    .update({ wallet_balance: (Number(agent.wallet_balance) || 0) + amount })
    .eq("id", agentId);
}

export async function POST(request: NextRequest) {
  // Optional shared-secret check — set INVENTOR_WEBHOOK_SECRET in Vercel env vars
  // to match whatever secret Inventor lets you configure on their dashboard.
  const secret = process.env.INVENTOR_WEBHOOK_SECRET;
  if (secret) {
    const sig = request.headers.get("x-webhook-secret") ??
                request.headers.get("x-inventor-secret") ??
                request.headers.get("authorization")?.replace("Bearer ", "");
    if (sig !== secret) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = String(body.event ?? "");
  const data = (body.data ?? {}) as Record<string, unknown>;
  const reference = String(data.reference ?? "");

  if (!reference) return Response.json({ ok: true }); // ignore malformed pings

  // Load the order
  const { data: order } = await supabase
    .from("orders")
    .select("reference, status, phone, network, bundle_size, amount, cost_price, agent_id, agent_commission, admin_commission")
    .eq("reference", reference)
    .maybeSingle();

  // Also check for retry references (sync-orders appends "-rs")
  const baseRef = reference.endsWith("-rs") ? reference.slice(0, -3) : null;
  const { data: baseOrder } = baseRef
    ? await supabase.from("orders").select("reference, status, phone, network, bundle_size, amount, cost_price, agent_id, agent_commission, admin_commission").eq("reference", baseRef).maybeSingle()
    : { data: null };

  const target = order ?? baseOrder;
  const targetRef = target?.reference ?? reference;

  if (!target) {
    // Unknown reference — still acknowledge so Inventor doesn't keep retrying
    return Response.json({ ok: true });
  }

  // Already in a terminal state — no-op
  if (target.status === "completed" || target.status === "failed") {
    return Response.json({ ok: true });
  }

  // ── order.completed ───────────────────────────────────────────────────────
  if (event === "order.completed") {
    await supabase.from("orders").update({ status: "completed" }).eq("reference", targetRef);

    const commission = Number(target.agent_commission) || 0;
    const revenue = Number(target.amount) || 0;
    let tgChatId: string | null = null;

    if (target.agent_id) {
      tgChatId = await creditAgent(target.agent_id, commission, revenue) ?? null;
    }

    const isWallet = targetRef.startsWith("AGTWALLET-");

    if (tgChatId && isWallet) {
      const cost = Number(target.cost_price) || 0;
      sendAgentNotification(
        tgChatId,
        `✅ Data Delivered!\n\n📱 ${(target.network ?? "").toUpperCase()} ${target.bundle_size} → ${target.phone}\n💰 GH₵${cost.toFixed(2)} deducted`
      ).catch(() => {});
    }

    if (!isWallet) {
      const profit = (Number(target.amount) - Number(target.cost_price)).toFixed(2);
      sendAdminAlert(
        `✅ <b>ORDER COMPLETED</b> (Inventor webhook)\n\n` +
        `📱 ${(target.network ?? "").toUpperCase()} ${target.bundle_size} → <code>${target.phone}</code>\n` +
        `📎 Ref: <code>${targetRef}</code>\n💰 Profit: GH₵${profit}`
      ).catch(() => {});
    }

    return Response.json({ ok: true });
  }

  // ── order.processing ─────────────────────────────────────────────────────
  if (event === "order.processing") {
    await supabase.from("orders").update({ status: "processing" }).eq("reference", targetRef);
    return Response.json({ ok: true });
  }

  // ── order.failed ─────────────────────────────────────────────────────────
  if (event === "order.failed") {
    await supabase.from("orders").update({ status: "failed" }).eq("reference", targetRef);

    // Refund wallet orders automatically
    const isWallet = targetRef.startsWith("AGTWALLET-");
    if (isWallet && target.agent_id) {
      const cost = Number(target.cost_price) || 0;
      await refundWallet(target.agent_id, cost);

      const { data: agent } = await supabase
        .from("agents")
        .select("telegram_chat_id")
        .eq("id", target.agent_id)
        .maybeSingle();

      if (agent?.telegram_chat_id) {
        sendAgentNotification(
          agent.telegram_chat_id,
          `❌ Order Failed — Refunded\n\n📱 ${(target.network ?? "").toUpperCase()} ${target.bundle_size} → ${target.phone}\n💰 GH₵${Number(target.cost_price).toFixed(2)} refunded to your wallet`
        ).catch(() => {});
      }
    }

    sendAdminAlert(
      `❌ <b>ORDER FAILED</b> (Inventor webhook)\n\n` +
      `📱 ${(target.network ?? "").toUpperCase()} ${target.bundle_size} → <code>${target.phone}</code>\n` +
      `📎 Ref: <code>${targetRef}</code>` +
      (isWallet ? "\n💳 Wallet auto-refunded" : "")
    ).catch(() => {});

    return Response.json({ ok: true });
  }

  // Unknown event — acknowledge anyway
  return Response.json({ ok: true });
}
