import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { bundles, networkApiName } from "@/lib/bundles";
import { sendAdminAlert, sendAgentNotification } from "@/lib/telegram";
import { inventorPurchase } from "@/lib/inventor";

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get("admin_session")?.value === process.env.ADMIN_SESSION_TOKEN;
}

async function deliverBundle(phone: string, network: string, sizeGB: number, reference: string): Promise<{ ok: boolean; log: string }> {
  const apiNetwork = networkApiName[network as keyof typeof networkApiName] ?? network.toUpperCase();
  const { ok, body } = await inventorPurchase(apiNetwork, phone, sizeGB, reference, 20_000);
  const errMsg = ok ? "" : String((body.error as string) ?? (body.message as string) ?? JSON.stringify(body)).slice(0, 200);
  return { ok, log: ok ? "Accepted by Inventor" : errMsg };
}

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("manual_orders")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ orders: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id, action, note } = await req.json() as { id: string; action: "approve" | "reject"; note?: string };
  if (!id || !action) return Response.json({ error: "id and action required" }, { status: 400 });

  // ── REJECT ────────────────────────────────────────────────────────────────
  if (action === "reject") {
    const { data: order } = await supabase.from("manual_orders").select("agent_id, agent_name, customer_phone, network, bundle_size").eq("id", id).single();

    const { error } = await supabase
      .from("manual_orders")
      .update({ status: "rejected", admin_note: note ?? "", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "pending");
    if (error) return Response.json({ error: error.message }, { status: 500 });

    // Notify agent if they have Telegram
    if (order?.agent_id) {
      const { data: agent } = await supabase.from("agents").select("telegram_chat_id").eq("id", order.agent_id).maybeSingle();
      if (agent?.telegram_chat_id) {
        await sendAgentNotification(agent.telegram_chat_id,
          `❌ <b>Manual Order Rejected</b>\n📱 ${order.network.toUpperCase()} ${order.bundle_size} → ${order.customer_phone}\n${note ? `Reason: ${note}` : "Contact admin for details."}`
        ).catch(() => {});
      }
    }

    return Response.json({ success: true });
  }

  // ── APPROVE & DELIVER ─────────────────────────────────────────────────────
  if (action === "approve") {
    const { data: order, error: fetchErr } = await supabase
      .from("manual_orders")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchErr || !order) return Response.json({ error: "Order not found" }, { status: 404 });
    if (order.status !== "pending") return Response.json({ error: "Already processed" }, { status: 400 });

    const bundle = bundles.find((b) => b.id === order.bundle_id);
    if (!bundle) return Response.json({ error: "Bundle not found in system" }, { status: 400 });

    // 1. Deliver via Inventor API
    const reference = `MNL-${id.slice(0, 8).toUpperCase()}`;
    const { ok, log } = await deliverBundle(order.customer_phone, order.network, bundle.sizeGB, reference);

    if (!ok) {
      await sendAdminAlert(
        `❌ <b>Manual order delivery FAILED</b>\nAgent: ${order.agent_name} (${order.agent_code})\n📱 ${order.customer_phone} | ${order.network.toUpperCase()} ${order.bundle_size}\n${log}`
      ).catch(() => {});
      return Response.json({ error: `Delivery failed: ${log}` }, { status: 502 });
    }

    // 2. Mark manual order as approved
    await supabase
      .from("manual_orders")
      .update({ status: "approved", admin_note: note ?? "", updated_at: new Date().toISOString() })
      .eq("id", id);

    // 3. Save to orders table (permanent record visible in admin Orders tab)
    const { error: orderErr } = await supabase.from("orders").insert({
      reference,
      customer_name: `Agent: ${order.agent_name}`,
      phone: order.customer_phone,
      network: order.network,
      bundle_size: `${order.network.toUpperCase()} ${order.bundle_size}`,
      amount: order.amount_paid,
      cost_price: order.cost_price,
      agent_commission: order.agent_commission,
      admin_commission: order.admin_profit,
      agent_id: order.agent_id ?? null,
      status: "COMPLETED",
      created_at: new Date().toISOString(),
    });

    if (orderErr) {
      // Log but don't fail — delivery already happened
      await sendAdminAlert(`⚠️ Manual order delivered but failed to save to orders table: ${orderErr.message}`).catch(() => {});
    }

    // 4. Credit agent commission balance + update stats
    if (order.agent_id) {
      const { data: agent } = await supabase
        .from("agents")
        .select("commission_balance, total_sales, total_revenue, telegram_chat_id")
        .eq("id", order.agent_id)
        .maybeSingle();

      if (agent) {
        await supabase.from("agents").update({
          commission_balance: (Number(agent.commission_balance) || 0) + Number(order.agent_commission),
          total_sales: (Number(agent.total_sales) || 0) + 1,
          total_revenue: (Number(agent.total_revenue) || 0) + Number(order.amount_paid),
          updated_at: new Date().toISOString(),
        }).eq("id", order.agent_id);

        // 5. Log commission in wallet transactions
        await supabase.from("agent_wallet_transactions").insert({
          agent_id: order.agent_id,
          type: "commission",
          amount: Number(order.agent_commission),
          description: `Commission: ${order.network.toUpperCase()} ${order.bundle_size} → ${order.customer_phone} (Manual)`,
        });

        // 6. Notify agent on Telegram
        if (agent.telegram_chat_id) {
          await sendAgentNotification(agent.telegram_chat_id,
            `✅ <b>Manual Order Approved!</b>\n📱 ${order.network.toUpperCase()} ${order.bundle_size} delivered to ${order.customer_phone}\n💰 Commission credited: GH₵${Number(order.agent_commission).toFixed(2)}\n📎 Ref: <code>${reference}</code>`
          ).catch(() => {});
        }
      }
    }

    await sendAdminAlert(
      `✅ <b>Manual Order Delivered</b>\nAgent: ${order.agent_name} (${order.agent_code})\n📱 ${order.customer_phone} → ${order.network.toUpperCase()} ${order.bundle_size}\n💰 Commission: GH₵${Number(order.agent_commission).toFixed(2)}\n📎 Ref: <code>${reference}</code>`
    ).catch(() => {});

    return Response.json({ success: true, reference });
  }

  return Response.json({ error: "Invalid action" }, { status: 400 });
}
