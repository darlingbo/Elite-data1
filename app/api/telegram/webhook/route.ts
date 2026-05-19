import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { bundles, networkApiName } from "@/lib/bundles";

const ADMIN_BOT_TOKEN = process.env.TELEGRAM_ADMIN_BOT_TOKEN!;
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID!;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET!;

async function reply(chatId: string, text: string, markup?: object) {
  await fetch(`https://api.telegram.org/bot${ADMIN_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", reply_markup: markup }),
  });
}

async function answerCb(id: string, text: string) {
  await fetch(`https://api.telegram.org/bot${ADMIN_BOT_TOKEN}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: id, text }),
  });
}

// ── Commands ─────────────────────────────────────────────────────────────────

async function cmdStatus(chatId: string) {
  const [ordersRes, agentsRes] = await Promise.all([
    supabase.from("orders").select("status, amount, admin_commission, agent_commission, agent_id"),
    supabase.from("agents").select("status"),
  ]);
  const o = ordersRes.data ?? [];
  const a = agentsRes.data ?? [];

  const revenue = o.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const profit = o.reduce((s, x) => s + (Number(x.admin_commission) || 0), 0);
  const agentSales = o.filter((x) => x.agent_id).length;

  await reply(chatId,
    `📊 <b>Elite Data — Live Status</b>\n\n` +
    `📦 Total orders: <b>${o.length}</b>\n` +
    `✅ Completed: ${o.filter(x => x.status === "COMPLETED").length}\n` +
    `🔄 Processing: ${o.filter(x => x.status === "PROCESSING").length}\n` +
    `⏳ Pending: ${o.filter(x => x.status === "PENDING").length}\n` +
    `❌ Failed: ${o.filter(x => x.status === "FAILED").length}\n\n` +
    `💰 Revenue: <b>GH₵${revenue.toFixed(2)}</b>\n` +
    `📈 Admin profit: <b>GH₵${profit.toFixed(2)}</b>\n` +
    `🔗 Via agents: ${agentSales} orders\n\n` +
    `👤 Agents: ${a.filter(x => x.status === "approved").length} active, ` +
    `${a.filter(x => x.status === "pending").length} pending approval`
  );
}

async function cmdOrders(chatId: string) {
  const { data } = await supabase
    .from("orders")
    .select("reference, status, amount, network, bundle_size, phone, customer_name, created_at, agent_id, admin_commission")
    .order("created_at", { ascending: false })
    .limit(10);

  if (!data?.length) { await reply(chatId, "No orders yet."); return; }

  const icon: Record<string, string> = { COMPLETED: "✅", PROCESSING: "🔄", FAILED: "❌", PENDING: "⏳" };
  const lines = data.map(o =>
    `${icon[o.status] ?? "❓"} <b>${o.network.toUpperCase()} ${o.bundle_size}</b> → <code>${o.phone}</code>\n` +
    `   GH₵${Number(o.amount).toFixed(2)} | Profit: GH₵${Number(o.admin_commission).toFixed(2)} | ${o.agent_id ? "Agent" : "Direct"}\n` +
    `   <code>${o.reference}</code>`
  ).join("\n\n");

  await reply(chatId, `📦 <b>Last 10 Orders</b>\n\n${lines}`);
}

async function cmdFailed(chatId: string) {
  const { data } = await supabase
    .from("orders")
    .select("reference, network, bundle_size, phone, amount, agent_id")
    .eq("status", "FAILED")
    .order("created_at", { ascending: false })
    .limit(8);

  if (!data?.length) { await reply(chatId, "✅ No failed orders — all good!"); return; }

  for (const o of data) {
    await reply(
      chatId,
      `❌ <b>Failed Order</b>\n` +
      `📱 ${o.network.toUpperCase()} ${o.bundle_size} → <code>${o.phone}</code>\n` +
      `💰 GH₵${Number(o.amount).toFixed(2)}\n` +
      `📎 <code>${o.reference}</code>`,
      { inline_keyboard: [[{ text: "🔄 Retry Now", callback_data: `retry:${o.reference}` }]] }
    );
  }
}

async function cmdAgents(chatId: string) {
  const [activeRes, pendingRes] = await Promise.all([
    supabase
      .from("agents")
      .select("name, referral_code, commission_balance, total_sales, total_revenue")
      .eq("status", "approved")
      .order("total_revenue", { ascending: false })
      .limit(10),
    supabase.from("agents").select("name, phone, email, created_at").eq("status", "pending"),
  ]);

  const active = activeRes.data ?? [];
  const pending = pendingRes.data ?? [];

  let msg = `👤 <b>Agent Leaderboard</b>\n\n`;

  if (!active.length) {
    msg += "No active agents yet.\n";
  } else {
    const medals = ["🥇", "🥈", "🥉"];
    active.forEach((a, i) => {
      msg += `${medals[i] ?? `${i + 1}.`} <b>${a.name}</b>\n`;
      msg += `   Code: <code>${a.referral_code}</code>\n`;
      msg += `   Sales: ${a.total_sales} | Revenue: GH₵${Number(a.total_revenue).toFixed(2)}\n`;
      msg += `   Earned: GH₵${Number(a.commission_balance).toFixed(2)}\n\n`;
    });
  }

  if (pending.length) {
    msg += `\n⚡ <b>${pending.length} application(s) awaiting approval:</b>\n`;
    pending.forEach((p) => {
      msg += `• ${p.name} — <code>${p.phone}</code>\n`;
    });
    msg += `\nUse /approve to manage agents.`;
  }

  await reply(chatId, msg);
}

async function retryOrder(chatId: string, reference: string) {
  const { data: order } = await supabase
    .from("orders")
    .select("*")
    .eq("reference", reference)
    .maybeSingle();

  if (!order) { await reply(chatId, `❌ Order <code>${reference}</code> not found.`); return; }
  if (order.status !== "FAILED") {
    await reply(chatId, `ℹ️ Order status is <b>${order.status}</b>. Only FAILED orders can be retried.`);
    return;
  }

  await reply(chatId, `🔄 Retrying <code>${reference}</code>…`);

  const networkKey = order.network as keyof typeof networkApiName;

  try {
    const res = await fetch(`${process.env.INVENTOR_API_BASE_URL}/api/developer/purchase`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.INVENTOR_API_KEY}`,
      },
      body: JSON.stringify({
        network: networkApiName[networkKey],
        Phone: order.phone,
        Datasize: order.bundle_size_gb,
        reference: `${reference}-r`,
      }),
    });
    const data = await res.json();

    if (data.success) {
      await supabase
        .from("orders")
        .update({ status: "PROCESSING", inventor_order_id: data.data?.order?.id ?? null })
        .eq("reference", reference);

      await reply(chatId,
        `✅ <b>Retry successful!</b>\n` +
        `📱 ${order.network.toUpperCase()} ${order.bundle_size} → <code>${order.phone}</code>\n` +
        `Status: PROCESSING — bundle on its way.`
      );
    } else {
      await reply(chatId, `❌ Retry failed.\nInventor response: <code>${JSON.stringify(data)}</code>`);
    }
  } catch (e) {
    await reply(chatId, `❌ Network error during retry: ${String(e)}`);
  }
}

async function cmdHelp(chatId: string) {
  await reply(chatId,
    `👋 <b>Elite Data Admin Bot</b>\n\n` +
    `<b>Commands:</b>\n` +
    `/status — Live site overview &amp; profit stats\n` +
    `/orders — Last 10 orders with details\n` +
    `/failed — Failed orders with one-tap retry\n` +
    `/agents — Agent leaderboard &amp; earnings\n` +
    `/retry [ref] — Manually retry a specific failed order\n\n` +
    `<b>Automatic alerts:</b>\n` +
    `• New order received\n` +
    `• Bundle delivered\n` +
    `• Order failed (with retry button)\n` +
    `• New agent application\n` +
    `• Agent approved`
  );
}

// ── Main webhook handler ──────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (secret !== WEBHOOK_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const update = await request.json();

  // Inline button press
  if (update.callback_query) {
    const { id, from, data } = update.callback_query;
    if (String(from.id) !== ADMIN_CHAT_ID) {
      await answerCb(id, "⛔ Unauthorized");
      return Response.json({ ok: true });
    }
    await answerCb(id, "Processing…");
    if (data?.startsWith("retry:")) {
      await retryOrder(String(from.chat_id ?? from.id), data.replace("retry:", ""));
    }
    return Response.json({ ok: true });
  }

  const message = update.message;
  if (!message?.text) return Response.json({ ok: true });

  const chatId = String(message.chat.id);
  if (chatId !== ADMIN_CHAT_ID) {
    await reply(chatId, "⛔ This bot is for the site admin only.");
    return Response.json({ ok: true });
  }

  const text = (message.text as string).trim().split(" ")[0].toLowerCase();
  const arg = (message.text as string).trim().split(" ").slice(1).join(" ");

  switch (text) {
    case "/start":
    case "/help":   await cmdHelp(chatId); break;
    case "/status": await cmdStatus(chatId); break;
    case "/orders": await cmdOrders(chatId); break;
    case "/failed": await cmdFailed(chatId); break;
    case "/agents": await cmdAgents(chatId); break;
    case "/retry":
      if (arg) await retryOrder(chatId, arg);
      else await reply(chatId, "Usage: /retry [reference]");
      break;
    default:
      await reply(chatId, `Unknown command. Send /help for the full list.`);
  }

  return Response.json({ ok: true });
}
