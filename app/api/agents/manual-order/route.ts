import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { bundles } from "@/lib/bundles";
import { sendAdminBotMessage } from "@/lib/telegram";
import { requireAgentSession } from "@/lib/agentAuth";
import { resolveAgentCommissionRate } from "@/lib/commission";

export async function GET(req: NextRequest) {
  const agentId = req.nextUrl.searchParams.get("agentId");
  if (!agentId) return Response.json({ error: "agentId required" }, { status: 400 });
  const auth = requireAgentSession(req, agentId, { requireFull: true });
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await supabase
    .from("manual_orders")
    .select("*")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ orders: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { agentId, agentCode, agentName, customerPhone, network, bundleId, bundleSize } = body;

  if (!agentId || !customerPhone || !network || !bundleId || !bundleSize) {
    return Response.json({ error: "All fields are required." }, { status: 400 });
  }
  const auth = requireAgentSession(req, agentId, { requireFull: true });
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const cleaned = customerPhone.replace(/\s/g, "");
  if (!/^0[2-5][0-9]{8}$/.test(cleaned)) {
    return Response.json({ error: "Enter a valid Ghana phone number (e.g. 0241234567)." }, { status: 400 });
  }

  const bundle = bundles.find((b) => b.id === bundleId);
  if (!bundle) return Response.json({ error: "Bundle not found." }, { status: 400 });

  const amountPaid = bundle.price;
  const costPrice = bundle.costPrice;
  const profit = Math.max(0, amountPaid - costPrice);
  const agentRate = await resolveAgentCommissionRate(agentId);
  const agentCommission = parseFloat((profit * agentRate).toFixed(2));
  const adminProfit = parseFloat((profit * (1 - agentRate)).toFixed(2));

  const { data, error } = await supabase
    .from("manual_orders")
    .insert({
      agent_id: agentId,
      agent_name: agentName ?? "Agent",
      agent_code: agentCode ?? "",
      customer_phone: cleaned,
      network,
      bundle_id: bundleId,
      bundle_size: bundleSize,
      amount_paid: amountPaid,
      cost_price: costPrice,
      agent_commission: agentCommission,
      admin_profit: adminProfit,
      status: "pending",
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Notify admin via assistant bot with approve/reject buttons
  const orderId = data.id as string;
  await sendAdminBotMessage(
    `🧾 <b>New Manual Order Request</b>\n\n` +
    `👤 Agent: <b>${agentName ?? "Agent"}</b> (${agentCode ?? "?"})\n` +
    `📱 ${network.toUpperCase()} ${bundleSize} → <code>${cleaned}</code>\n` +
    `💰 Amount: GH₵${amountPaid.toFixed(2)}\n` +
    `📈 Your profit: GH₵${adminProfit.toFixed(2)} | Agent commission: GH₵${agentCommission.toFixed(2)}\n\n` +
    `<i>Check your Paystack account to confirm payment, then tap Approve.</i>`,
    {
      inline_keyboard: [[
        { text: "✅ Approve & Deliver", callback_data: `manual_approve:${orderId}` },
        { text: "❌ Reject", callback_data: `manual_reject:${orderId}` },
      ]],
    }
  ).catch(() => {});

  return Response.json({ success: true, order: data });
}
