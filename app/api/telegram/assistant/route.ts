import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { bundles, networkApiName } from "@/lib/bundles";

const BOT = process.env.TELEGRAM_ASSISTANT_BOT_TOKEN!;
const ADMIN = process.env.TELEGRAM_ADMIN_CHAT_ID!;
const SECRET = process.env.TELEGRAM_ASSISTANT_WEBHOOK_SECRET!;

// In-memory store for multi-step flows (clears on cold start — acceptable)
const pendingSend = new Map<string, { ref: string; phone: string; network: string; size: string; sizeGB: number }>();

// ── Telegram helpers ──────────────────────────────────────────────────────────
async function send(chatId: string | number, text: string, markup?: object) {
  await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", reply_markup: markup }),
  });
}

async function answerCb(id: string, text = "", alert = false) {
  await fetch(`https://api.telegram.org/bot${BOT}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: id, text, show_alert: alert }),
  });
}

// ── Keyboards ─────────────────────────────────────────────────────────────────
function mainMenu() {
  return {
    inline_keyboard: [
      [{ text: "📊 Status", callback_data: "cmd:status" }, { text: "📅 Today", callback_data: "cmd:today" }],
      [{ text: "📦 Orders", callback_data: "cmd:orders" }, { text: "❌ Failed", callback_data: "cmd:failed" }],
      [{ text: "⏳ Pending", callback_data: "cmd:pending" }, { text: "💰 Profit", callback_data: "cmd:profit" }],
      [{ text: "👤 Agents", callback_data: "cmd:agents" }, { text: "🏥 Health", callback_data: "cmd:health" }],
      [{ text: "🔧 Fix All Problems", callback_data: "cmd:fix" }],
    ],
  };
}

function retryMenu(ref: string) {
  return {
    inline_keyboard: [[
      { text: "🔄 Auto Retry", callback_data: `retry:${ref}` },
      { text: "✋ Manual Fulfil", callback_data: `manual_ask:${ref}` },
    ]],
  };
}

// ── Commands ──────────────────────────────────────────────────────────────────
async function cmdStart(chatId: string) {
  await send(chatId,
    `🤖 <b>Elite Data Assistant — 24/7 Online</b>\n\n` +
    `I'm your personal admin AI. I can:\n` +
    `• Show live stats, revenue &amp; profit\n` +
    `• Detect and fix site problems automatically\n` +
    `• Retry or manually fulfil failed orders\n` +
    `• Approve/reject agent applications\n` +
    `• Run a full health check on all services\n` +
    `• Accept plain-English commands\n\n` +
    `Tap a button or just type what you want 👇`,
    mainMenu()
  );
}

async function cmdHelp(chatId: string) {
  await send(chatId,
    `🤖 <b>Full Command List</b>\n\n` +
    `<b>📊 Stats</b>\n` +
    `/status — Live dashboard\n` +
    `/today — Today's orders &amp; earnings\n` +
    `/profit — Full profit breakdown\n\n` +
    `<b>📦 Orders</b>\n` +
    `/orders [n] — Last n orders (default 10)\n` +
    `/order [ref] — Look up one order\n` +
    `/lookup [phone] — All orders for a number\n` +
    `/failed — Failed orders + fix buttons\n` +
    `/pending — Stuck orders (>15 min old)\n` +
    `/cancel [ref] — Cancel a pending order\n\n` +
    `<b>🔧 Fix &amp; Fulfil</b>\n` +
    `/retry [ref] — Auto-retry one failed order\n` +
    `/fix — Auto-retry ALL failed orders now\n` +
    `/send [phone] [network] [size] — Manual order\n` +
    `  e.g. /send 0551234567 mtn 2GB\n\n` +
    `<b>👤 Agents</b>\n` +
    `/agents — Leaderboard + pending apps\n` +
    `/approve [agent-id] — Approve agent\n` +
    `/reject [agent-id] — Reject agent\n\n` +
    `<b>🏥 Diagnostics</b>\n` +
    `/health — Full service health check\n` +
    `/fix — Detect &amp; fix all problems\n\n` +
    `<b>💬 Plain English</b>\n` +
    `Just type: <i>status, failed, profit, health, fix, agents, today, orders</i>`,
    mainMenu()
  );
}

async function cmdStatus(chatId: string) {
  const [ordersRes, agentsRes] = await Promise.all([
    supabase.from("orders").select("status, amount, admin_commission, agent_id, created_at"),
    supabase.from("agents").select("status"),
  ]);
  const o = ordersRes.data ?? [];
  const a = agentsRes.data ?? [];
  const now = new Date();

  const today = o.filter((x) => {
    const d = new Date(x.created_at);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  });

  const revenue = o.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const profit = o.reduce((s, x) => s + (Number(x.admin_commission) || 0), 0);
  const todayRev = today.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const todayProfit = today.reduce((s, x) => s + (Number(x.admin_commission) || 0), 0);

  const failed = o.filter((x) => x.status === "FAILED").length;
  const pending = o.filter((x) => x.status === "PENDING").length;
  const alert = failed > 0 ? `\n\n⚠️ <b>${failed} failed order(s) need attention</b> — tap ❌ Failed` : "";

  await send(chatId,
    `📊 <b>Elite Data — Live Dashboard</b>\n\n` +
    `<b>📅 Today</b>\n` +
    `Orders: <b>${today.length}</b>  |  Revenue: <b>GH₵${todayRev.toFixed(2)}</b>  |  Profit: <b>GH₵${todayProfit.toFixed(2)}</b>\n\n` +
    `<b>📈 All Time</b>\n` +
    `Total orders: <b>${o.length}</b>\n` +
    `✅ Completed: ${o.filter((x) => x.status === "COMPLETED").length}\n` +
    `🔄 Processing: ${o.filter((x) => x.status === "PROCESSING").length}\n` +
    `⏳ Pending: ${pending}\n` +
    `❌ Failed: ${failed}\n\n` +
    `💰 Revenue: <b>GH₵${revenue.toFixed(2)}</b>\n` +
    `📈 Your profit: <b>GH₵${profit.toFixed(2)}</b>\n` +
    `🔗 Via agents: ${o.filter((x) => x.agent_id).length} orders\n\n` +
    `👤 Agents: ${a.filter((x) => x.status === "approved").length} active | ${a.filter((x) => x.status === "pending").length} pending${alert}`,
    mainMenu()
  );
}

async function cmdToday(chatId: string) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const { data } = await supabase
    .from("orders")
    .select("status, amount, admin_commission, network, bundle_size, phone, customer_name")
    .gte("created_at", start)
    .order("created_at", { ascending: false });

  const o = data ?? [];
  const revenue = o.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const profit = o.reduce((s, x) => s + (Number(x.admin_commission) || 0), 0);
  const icon: Record<string, string> = { COMPLETED: "✅", PROCESSING: "🔄", FAILED: "❌", PENDING: "⏳" };

  if (!o.length) {
    await send(chatId, `📅 <b>Today's Orders</b>\n\nNo orders yet today. Site is ready and waiting! 🚀`, mainMenu());
    return;
  }

  const lines = o.slice(0, 10).map((x) =>
    `${icon[x.status] ?? "❓"} ${x.network.toUpperCase()} ${x.bundle_size} → <code>${x.phone}</code>`
  ).join("\n");

  await send(chatId,
    `📅 <b>Today's Report</b>\n\n` +
    `Orders: <b>${o.length}</b>\n` +
    `Revenue: <b>GH₵${revenue.toFixed(2)}</b>\n` +
    `Profit: <b>GH₵${profit.toFixed(2)}</b>\n` +
    `Failed: ${o.filter((x) => x.status === "FAILED").length}\n\n` +
    `<b>Recent:</b>\n${lines}${o.length > 10 ? `\n...+${o.length - 10} more` : ""}`,
    mainMenu()
  );
}

async function cmdOrders(chatId: string, arg: string) {
  const limit = Math.min(parseInt(arg) || 10, 25);
  const { data } = await supabase
    .from("orders")
    .select("reference, status, amount, admin_commission, network, bundle_size, phone, customer_name, created_at, agent_id")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!data?.length) { await send(chatId, "No orders yet."); return; }

  const icon: Record<string, string> = { COMPLETED: "✅", PROCESSING: "🔄", FAILED: "❌", PENDING: "⏳" };
  const lines = data.map((o) =>
    `${icon[o.status] ?? "❓"} <b>${o.network.toUpperCase()} ${o.bundle_size}</b> → <code>${o.phone}</code>\n` +
    `   <b>${o.customer_name}</b> | GH₵${Number(o.amount).toFixed(2)} | Profit: GH₵${Number(o.admin_commission).toFixed(2)}\n` +
    `   ${o.agent_id ? "🔗 Agent" : "👤 Direct"} | ${new Date(o.created_at).toLocaleDateString("en-GH")}`
  ).join("\n\n");

  await send(chatId, `📦 <b>Last ${limit} Orders</b>\n\n${lines}`, mainMenu());
}

async function cmdOrder(chatId: string, ref: string) {
  if (!ref) { await send(chatId, "Usage: /order [reference]"); return; }
  const { data: o } = await supabase.from("orders").select("*").eq("reference", ref).maybeSingle();
  if (!o) { await send(chatId, `❌ Order <code>${ref}</code> not found.`); return; }

  const markup = o.status === "FAILED" ? retryMenu(ref) : mainMenu();

  await send(chatId,
    `📦 <b>Order Details</b>\n\n` +
    `Ref: <code>${o.reference}</code>\n` +
    `Customer: <b>${o.customer_name}</b>\n` +
    `Phone: <code>${o.phone}</code>\n` +
    `Network: <b>${o.network.toUpperCase()} ${o.bundle_size}</b>\n` +
    `Amount: GH₵${Number(o.amount).toFixed(2)}\n` +
    `Profit: GH₵${Number(o.admin_commission).toFixed(2)}\n` +
    `Source: ${o.agent_id ? "🔗 Via Agent" : "👤 Direct"}\n` +
    `Status: <b>${o.status}</b>\n` +
    `Date: ${new Date(o.created_at).toLocaleString("en-GH")}`,
    markup
  );
}

async function cmdFailed(chatId: string) {
  const { data } = await supabase
    .from("orders")
    .select("reference, network, bundle_size, phone, customer_name, amount, created_at")
    .eq("status", "FAILED")
    .order("created_at", { ascending: false })
    .limit(10);

  if (!data?.length) {
    await send(chatId, `✅ <b>No failed orders!</b>\nEverything is running smoothly. 🎉`, mainMenu());
    return;
  }

  await send(chatId, `❌ <b>${data.length} Failed Order${data.length > 1 ? "s" : ""}</b>\nTap to retry or manually fulfil:`);

  for (const o of data) {
    const age = Math.round((Date.now() - new Date(o.created_at).getTime()) / 60000);
    await send(chatId,
      `❌ <b>${o.network.toUpperCase()} ${o.bundle_size}</b> → <code>${o.phone}</code>\n` +
      `👤 ${o.customer_name} | GH₵${Number(o.amount).toFixed(2)} | ${age} min ago\n` +
      `📎 <code>${o.reference}</code>`,
      retryMenu(o.reference)
    );
  }
}

async function cmdPending(chatId: string) {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("orders")
    .select("reference, network, bundle_size, phone, customer_name, amount, created_at, status")
    .in("status", ["PENDING", "PROCESSING"])
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true });

  if (!data?.length) {
    await send(chatId, `✅ <b>No stuck orders!</b>\nAll orders are moving normally.`, mainMenu());
    return;
  }

  const lines = data.map((o) => {
    const age = Math.round((Date.now() - new Date(o.created_at).getTime()) / 60000);
    return (
      `⏳ <b>${o.network.toUpperCase()} ${o.bundle_size}</b> → <code>${o.phone}</code>\n` +
      `   Status: <b>${o.status}</b> | Age: <b>${age} min</b> | GH₵${Number(o.amount).toFixed(2)}\n` +
      `   <code>${o.reference}</code>`
    );
  }).join("\n\n");

  await send(chatId,
    `⚠️ <b>${data.length} Stuck Order${data.length > 1 ? "s" : ""}</b> (>15 min without completion):\n\n${lines}\n\n` +
    `Use /retry [ref] or /order [ref] to investigate each one.`,
    mainMenu()
  );
}

async function cmdProfit(chatId: string) {
  const { data: orders } = await supabase
    .from("orders")
    .select("amount, cost_price, admin_commission, agent_commission, created_at");

  const o = orders ?? [];
  const now = new Date();
  const thisMonth = o.filter((x) => {
    const d = new Date(x.created_at);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  const lastMonth = o.filter((x) => {
    const d = new Date(x.created_at);
    const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return d.getFullYear() === lm.getFullYear() && d.getMonth() === lm.getMonth();
  });

  const calc = (arr: typeof o) => ({
    rev: arr.reduce((s, x) => s + (Number(x.amount) || 0), 0),
    cost: arr.reduce((s, x) => s + (Number(x.cost_price) || 0), 0),
    admin: arr.reduce((s, x) => s + (Number(x.admin_commission) || 0), 0),
    agent: arr.reduce((s, x) => s + (Number(x.agent_commission) || 0), 0),
  });

  const all = calc(o);
  const month = calc(thisMonth);
  const last = calc(lastMonth);

  await send(chatId,
    `💰 <b>Profit Breakdown</b>\n\n` +
    `<b>📅 This Month</b>\n` +
    `Revenue: GH₵${month.rev.toFixed(2)}\n` +
    `Cost: -GH₵${month.cost.toFixed(2)}\n` +
    `Gross: GH₵${(month.rev - month.cost).toFixed(2)}\n` +
    `Your profit: <b>GH₵${month.admin.toFixed(2)}</b>\n` +
    `Agent payouts: GH₵${month.agent.toFixed(2)}\n\n` +
    `<b>📆 Last Month</b>\n` +
    `Revenue: GH₵${last.rev.toFixed(2)} | Profit: GH₵${last.admin.toFixed(2)}\n\n` +
    `<b>📈 All Time</b>\n` +
    `Revenue: GH₵${all.rev.toFixed(2)}\n` +
    `Cost: -GH₵${all.cost.toFixed(2)}\n` +
    `Gross: GH₵${(all.rev - all.cost).toFixed(2)}\n` +
    `Your profit: <b>GH₵${all.admin.toFixed(2)}</b>\n` +
    `Agent payouts: GH₵${all.agent.toFixed(2)}`,
    mainMenu()
  );
}

async function cmdAgents(chatId: string) {
  const [activeRes, pendingRes] = await Promise.all([
    supabase.from("agents").select("name, referral_code, commission_balance, total_sales, total_revenue")
      .eq("status", "approved").order("total_revenue", { ascending: false }).limit(10),
    supabase.from("agents").select("id, name, phone, email, created_at").eq("status", "pending"),
  ]);

  const active = activeRes.data ?? [];
  const pending = pendingRes.data ?? [];
  const medals = ["🥇", "🥈", "🥉"];

  let msg = `👤 <b>Agent Leaderboard</b>\n\n`;
  if (!active.length) {
    msg += "No active agents yet.\n";
  } else {
    active.forEach((a, i) => {
      msg += `${medals[i] ?? `${i + 1}.`} <b>${a.name}</b> [<code>${a.referral_code}</code>]\n`;
      msg += `   Sales: ${a.total_sales} | Revenue: GH₵${Number(a.total_revenue).toFixed(2)} | Earned: GH₵${Number(a.commission_balance).toFixed(2)}\n`;
    });
  }

  await send(chatId, msg);

  if (pending.length) {
    await send(chatId, `\n⚡ <b>${pending.length} Application${pending.length > 1 ? "s" : ""} Awaiting Approval:</b>`);
    for (const p of pending) {
      await send(chatId,
        `👤 <b>${p.name}</b>\n📱 <code>${p.phone}</code>\n📧 ${p.email}\n📅 ${new Date(p.created_at).toLocaleDateString("en-GH")}`,
        {
          inline_keyboard: [[
            { text: "✅ Approve", callback_data: `approve:${p.id}` },
            { text: "❌ Reject", callback_data: `reject:${p.id}` },
          ]],
        }
      );
    }
  } else {
    await send(chatId, "No pending agent applications.", mainMenu());
  }
}

async function cmdLookup(chatId: string, phone: string) {
  if (!phone) { await send(chatId, "Usage: /lookup [phone number]"); return; }
  const { data } = await supabase
    .from("orders")
    .select("reference, status, amount, network, bundle_size, created_at")
    .eq("phone", phone)
    .order("created_at", { ascending: false });

  if (!data?.length) { await send(chatId, `No orders found for <code>${phone}</code>.`); return; }

  const icon: Record<string, string> = { COMPLETED: "✅", PROCESSING: "🔄", FAILED: "❌", PENDING: "⏳" };
  const lines = data.map((o) =>
    `${icon[o.status] ?? "❓"} ${o.network.toUpperCase()} ${o.bundle_size} — GH₵${Number(o.amount).toFixed(2)} — ${new Date(o.created_at).toLocaleDateString("en-GH")}`
  ).join("\n");

  await send(chatId,
    `📱 <b>Orders for <code>${phone}</code></b>\n` +
    `Total: ${data.length} order${data.length > 1 ? "s" : ""}\n\n${lines}`,
    mainMenu()
  );
}

async function cmdHealth(chatId: string) {
  await send(chatId, "🏥 Running full site diagnostics…");
  const results: string[] = [];

  // Supabase
  try {
    const t = Date.now();
    const { error } = await supabase.from("orders").select("count", { count: "exact", head: true });
    results.push(error ? `❌ Supabase DB: ${error.message}` : `✅ Supabase DB: OK (${Date.now() - t}ms)`);
  } catch { results.push("❌ Supabase DB: Connection failed"); }

  // Inventor DataHub
  try {
    const t = Date.now();
    const res = await fetch(`${process.env.INVENTOR_API_BASE_URL}/api/developer/orders?limit=1`, {
      headers: { Authorization: `Bearer ${process.env.INVENTOR_API_KEY}` },
    });
    const ms = Date.now() - t;
    results.push([200, 201, 404, 422].includes(res.status)
      ? `✅ Inventor API: OK (${ms}ms)`
      : `⚠️ Inventor API: HTTP ${res.status} (${ms}ms)`
    );
  } catch { results.push("❌ Inventor API: Connection failed"); }

  // Paystack
  try {
    const t = Date.now();
    const res = await fetch("https://api.paystack.co/bank", {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
    });
    results.push(res.ok ? `✅ Paystack: OK (${Date.now() - t}ms)` : `⚠️ Paystack: HTTP ${res.status}`);
  } catch { results.push("❌ Paystack: Connection failed"); }

  // Stuck orders
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: stuck } = await supabase.from("orders").select("reference").in("status", ["PENDING", "PROCESSING"]).lt("created_at", cutoff);
  results.push(stuck?.length
    ? `⚠️ Stuck orders: ${stuck.length} order(s) >15 min — use /pending`
    : "✅ No stuck orders"
  );

  // Failed orders
  const { data: failed } = await supabase.from("orders").select("reference").eq("status", "FAILED");
  results.push(failed?.length
    ? `⚠️ Failed orders: ${failed.length} unresolved — use /fix to auto-retry`
    : "✅ No failed orders"
  );

  // Pending agents
  const { data: pendingAgents } = await supabase.from("agents").select("id").eq("status", "pending");
  if (pendingAgents?.length) {
    results.push(`⚠️ ${pendingAgents.length} agent application(s) need review — use /agents`);
  }

  const allOk = results.every((r) => r.startsWith("✅"));
  await send(chatId,
    `🏥 <b>Site Health Report</b>\n` +
    `${allOk ? "✅ All systems operational" : "⚠️ Some issues detected"}\n\n` +
    results.join("\n") + `\n\n🕐 ${new Date().toLocaleString("en-GH")}`,
    mainMenu()
  );
}

async function cmdFix(chatId: string) {
  const { data: failed } = await supabase
    .from("orders").select("*").eq("status", "FAILED")
    .order("created_at", { ascending: false }).limit(15);

  if (!failed?.length) {
    await send(chatId, "✅ <b>Nothing to fix!</b>\nNo failed orders found. Site is clean.", mainMenu());
    return;
  }

  await send(chatId, `🔧 <b>Auto-Fix Started</b>\nRetrying ${failed.length} failed order(s)…`);
  let fixed = 0, stillFailing = 0;

  for (const o of failed) {
    try {
      const networkKey = o.network as keyof typeof networkApiName;
      const res = await fetch(`${process.env.INVENTOR_API_BASE_URL}/api/developer/purchase`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.INVENTOR_API_KEY}` },
        body: JSON.stringify({ network: networkApiName[networkKey], Phone: o.phone, Datasize: o.bundle_size_gb, reference: `${o.reference}-fix` }),
      });
      const data = await res.json();
      if (data.success) {
        await supabase.from("orders").update({ status: "PROCESSING", inventor_order_id: data.data?.order?.id ?? null }).eq("reference", o.reference);
        fixed++;
      } else { stillFailing++; }
    } catch { stillFailing++; }
  }

  await send(chatId,
    `🔧 <b>Auto-Fix Complete</b>\n\n` +
    `✅ Fixed: <b>${fixed}</b> order${fixed !== 1 ? "s" : ""}\n` +
    `❌ Still failing: <b>${stillFailing}</b>\n\n` +
    (stillFailing > 0
      ? "Use /failed to manually handle the remaining ones — they may need Inventor support."
      : "All issues resolved! Everything is processing. 🎉"),
    mainMenu()
  );
}

async function cmdSend(chatId: string, args: string[]) {
  if (args.length < 3) {
    const nets = ["mtn", "telecel", "airteltigo"];
    const examples = nets.map((n) => bundles.filter((b) => b.network === n).map((b) => b.size).slice(0, 3).join(", ")).join("\n");
    await send(chatId,
      `📤 <b>Manual Order</b>\n\nUsage: /send [phone] [network] [size]\n\n` +
      `<b>Examples:</b>\n/send 0551234567 mtn 2GB\n/send 0201234567 telecel 1GB\n\n` +
      `<b>Available bundles:</b>\nMTN: ${bundles.filter((b) => b.network === "mtn").map((b) => b.size).join(", ")}\n` +
      `Telecel: ${bundles.filter((b) => b.network === "telecel").map((b) => b.size).join(", ")}\n` +
      `AirtelTigo: ${bundles.filter((b) => b.network === "airteltigo").map((b) => b.size).join(", ")}`
    );
    return;
  }

  const [phone, networkRaw, sizeRaw] = args;
  const network = networkRaw.toLowerCase();
  const bundle = bundles.find(
    (b) => b.network.toLowerCase() === network && b.size.toLowerCase() === sizeRaw.toLowerCase()
  );

  if (!bundle) {
    const available = bundles.filter((b) => b.network.toLowerCase() === network).map((b) => b.size).join(", ");
    await send(chatId, `❌ Bundle not found.\n\nAvailable ${networkRaw.toUpperCase()} sizes:\n${available || "No matching network — try mtn, telecel, or airteltigo"}`);
    return;
  }

  const ref = `MANUAL-${Date.now()}`;
  pendingSend.set(chatId, { ref, phone, network: bundle.network, size: bundle.size, sizeGB: bundle.sizeGB });

  await send(chatId,
    `📤 <b>Manual Order — Confirm</b>\n\n` +
    `Network: <b>${bundle.network.toUpperCase()} ${bundle.size}</b>\n` +
    `Phone: <code>${phone}</code>\n` +
    `Fulfillment cost: GH₵${bundle.costPrice.toFixed(2)}\n\n` +
    `This sends data directly to the number. Tap to confirm.`,
    {
      inline_keyboard: [[
        { text: "✅ Yes — Send Now", callback_data: `send_exec:${chatId}` },
        { text: "❌ Cancel", callback_data: "noop" },
      ]],
    }
  );
}

async function execRetry(chatId: string, reference: string, label = "Auto") {
  const { data: order } = await supabase.from("orders").select("*").eq("reference", reference).maybeSingle();
  if (!order) { await send(chatId, `❌ Order <code>${reference}</code> not found.`); return; }
  if (order.status !== "FAILED") {
    await send(chatId, `ℹ️ Status is <b>${order.status}</b>. Only FAILED orders can be retried.`);
    return;
  }

  await send(chatId, `🔄 [${label}] Retrying <code>${reference}</code>…`);
  const networkKey = order.network as keyof typeof networkApiName;

  try {
    const res = await fetch(`${process.env.INVENTOR_API_BASE_URL}/api/developer/purchase`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.INVENTOR_API_KEY}` },
      body: JSON.stringify({ network: networkApiName[networkKey], Phone: order.phone, Datasize: order.bundle_size_gb, reference: `${reference}-${label.toLowerCase()}` }),
    });
    const data = await res.json();

    if (data.success) {
      await supabase.from("orders").update({ status: "PROCESSING", inventor_order_id: data.data?.order?.id ?? null }).eq("reference", reference);
      await send(chatId,
        `✅ <b>Success!</b>\n${order.network.toUpperCase()} ${order.bundle_size} → <code>${order.phone}</code>\nStatus: PROCESSING — bundle on its way! 📶`,
        mainMenu()
      );
    } else {
      await send(chatId,
        `❌ <b>Still failing</b>\nInventor: <code>${JSON.stringify(data).slice(0, 150)}</code>\n\nTry again or contact Inventor support.`,
        retryMenu(reference)
      );
    }
  } catch (e) {
    await send(chatId, `❌ Network error: ${String(e)}`);
  }
}

async function execAgentAction(chatId: string, agentId: string, action: "approve" | "reject") {
  const { data: agent } = await supabase.from("agents").select("name").eq("id", agentId).maybeSingle();
  if (!agent) { await send(chatId, "❌ Agent not found."); return; }

  if (action === "approve") {
    const prefix = agent.name.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, "X");
    const suffix = Math.random().toString(36).substring(2, 7).toUpperCase();
    const code = prefix + suffix;
    await supabase.from("agents").update({ status: "approved", referral_code: code }).eq("id", agentId);
    await send(chatId, `✅ <b>${agent.name} approved!</b>\nReferral code: <code>${code}</code>\nThey can now start sharing their link and earning commissions.`, mainMenu());
  } else {
    await supabase.from("agents").update({ status: "rejected" }).eq("id", agentId);
    await send(chatId, `❌ <b>${agent.name} rejected.</b>`, mainMenu());
  }
}

async function cmdCancel(chatId: string, ref: string) {
  if (!ref) { await send(chatId, "Usage: /cancel [reference]"); return; }
  const { data: o } = await supabase.from("orders").select("status, network, bundle_size, phone, amount").eq("reference", ref).maybeSingle();
  if (!o) { await send(chatId, "❌ Order not found."); return; }
  if (o.status === "COMPLETED") { await send(chatId, "❌ Cannot cancel a completed order."); return; }

  await supabase.from("orders").update({ status: "FAILED" }).eq("reference", ref);
  await send(chatId,
    `🚫 <b>Order Cancelled</b>\n${o.network.toUpperCase()} ${o.bundle_size} → <code>${o.phone}</code>\nGH₵${Number(o.amount).toFixed(2)}\nStatus set to FAILED.\n\n⚠️ Remember to refund the customer if payment was collected.`,
    mainMenu()
  );
}

// ── Natural-language matcher ───────────────────────────────────────────────────
const NLP: Array<[RegExp, (chatId: string) => Promise<void>]> = [
  [/^(status|stats|dashboard|overview|how are we doing|site status)$/i, cmdStatus],
  [/^(today|today'?s? (orders?|sales?)|orders? today)$/i, cmdToday],
  [/^(failed|failures?|broken orders?|what failed)$/i, cmdFailed],
  [/^(pending|stuck|waiting orders?)$/i, cmdPending],
  [/^(profit|earnings?|money|revenue|how much (did i|have i) (earn|make))$/i, cmdProfit],
  [/^(agents?|agent (panel|list|board)|leaderboard)$/i, cmdAgents],
  [/^(health|check (site|everything)?|diagnose|is (the )?site ok)$/i, cmdHealth],
  [/^(fix|fix all|fix (everything|problems?|issues?|all problems?))$/i, cmdFix],
  [/^(orders?|show orders?|all orders?|recent orders?)$/i, (id) => cmdOrders(id, "10")],
  [/^(help|commands?|what can you do|options?)$/i, cmdHelp],
  [/^(menu|start|home|back)$/i, cmdStart],
];

// ── Main webhook ───────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (secret !== SECRET) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const update = await request.json();

  // ── Inline button presses ──
  if (update.callback_query) {
    const { id, from, data } = update.callback_query;
    const chatId = String(from.id);

    if (chatId !== ADMIN) { await answerCb(id, "⛔ Unauthorized", true); return Response.json({ ok: true }); }
    await answerCb(id, "One moment…");

    if (data === "cmd:status") await cmdStatus(chatId);
    else if (data === "cmd:today") await cmdToday(chatId);
    else if (data === "cmd:orders") await cmdOrders(chatId, "10");
    else if (data === "cmd:failed") await cmdFailed(chatId);
    else if (data === "cmd:pending") await cmdPending(chatId);
    else if (data === "cmd:profit") await cmdProfit(chatId);
    else if (data === "cmd:agents") await cmdAgents(chatId);
    else if (data === "cmd:health") await cmdHealth(chatId);
    else if (data === "cmd:fix") await cmdFix(chatId);
    else if (data?.startsWith("retry:")) await execRetry(chatId, data.replace("retry:", ""), "Retry");
    else if (data?.startsWith("manual_ask:")) {
      const ref = data.replace("manual_ask:", "");
      const { data: o } = await supabase.from("orders").select("network, bundle_size, phone, amount").eq("reference", ref).maybeSingle();
      if (o) {
        await send(chatId,
          `✋ <b>Manual Fulfil — Confirm</b>\n\n${o.network.toUpperCase()} ${o.bundle_size} → <code>${o.phone}</code>\nGH₵${Number(o.amount).toFixed(2)}\n\nThis calls Inventor DataHub directly and bypasses the normal flow. Confirm?`,
          { inline_keyboard: [[{ text: "✅ Yes, Do It Manually", callback_data: `manual_exec:${ref}` }, { text: "❌ Cancel", callback_data: "noop" }]] }
        );
      }
    }
    else if (data?.startsWith("manual_exec:")) await execRetry(chatId, data.replace("manual_exec:", ""), "Manual");
    else if (data?.startsWith("approve:")) await execAgentAction(chatId, data.replace("approve:", ""), "approve");
    else if (data?.startsWith("reject:")) await execAgentAction(chatId, data.replace("reject:", ""), "reject");
    else if (data?.startsWith("send_exec:")) {
      const pending = pendingSend.get(chatId);
      if (!pending) { await send(chatId, "❌ Session expired. Use /send again."); }
      else {
        pendingSend.delete(chatId);
        await send(chatId, `📤 Sending ${pending.network.toUpperCase()} ${pending.size} to <code>${pending.phone}</code>…`);
        try {
          const networkKey = pending.network as keyof typeof networkApiName;
          const res = await fetch(`${process.env.INVENTOR_API_BASE_URL}/api/developer/purchase`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.INVENTOR_API_KEY}` },
            body: JSON.stringify({ network: networkApiName[networkKey], Phone: pending.phone, Datasize: pending.sizeGB, reference: pending.ref }),
          });
          const result = await res.json();
          if (result.success) {
            await send(chatId, `✅ <b>Sent!</b>\n${pending.network.toUpperCase()} ${pending.size} delivered to <code>${pending.phone}</code> 📶`, mainMenu());
          } else {
            await send(chatId, `❌ Failed: <code>${JSON.stringify(result).slice(0, 200)}</code>`, mainMenu());
          }
        } catch (e) { await send(chatId, `❌ Error: ${String(e)}`); }
      }
    }
    else if (data === "noop") await send(chatId, "Cancelled.", mainMenu());

    return Response.json({ ok: true });
  }

  // ── Text messages ──
  const message = update.message;
  if (!message?.text) return Response.json({ ok: true });

  const chatId = String(message.chat.id);
  if (chatId !== ADMIN) {
    await send(chatId, "⛔ This is a private admin assistant.");
    return Response.json({ ok: true });
  }

  const raw = (message.text as string).trim();
  const lower = raw.toLowerCase();
  const parts = raw.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const arg = parts.slice(1).join(" ");
  const args = parts.slice(1);

  // Natural language
  for (const [pattern, handler] of NLP) {
    if (pattern.test(lower)) { await handler(chatId); return Response.json({ ok: true }); }
  }

  // Slash commands
  switch (cmd) {
    case "/start":                     await cmdStart(chatId); break;
    case "/help": case "/commands":    await cmdHelp(chatId); break;
    case "/status": case "/stats":     await cmdStatus(chatId); break;
    case "/today":                     await cmdToday(chatId); break;
    case "/orders":                    await cmdOrders(chatId, arg); break;
    case "/order":                     await cmdOrder(chatId, arg); break;
    case "/failed":                    await cmdFailed(chatId); break;
    case "/pending":                   await cmdPending(chatId); break;
    case "/profit":                    await cmdProfit(chatId); break;
    case "/agents":                    await cmdAgents(chatId); break;
    case "/lookup":                    await cmdLookup(chatId, arg); break;
    case "/health":                    await cmdHealth(chatId); break;
    case "/fix":                       await cmdFix(chatId); break;
    case "/cancel":                    await cmdCancel(chatId, arg); break;
    case "/send":                      await cmdSend(chatId, args); break;
    case "/retry":
      arg ? await execRetry(chatId, arg) : await send(chatId, "Usage: /retry [reference]");
      break;
    case "/approve":
      arg ? await execAgentAction(chatId, arg, "approve") : await send(chatId, "Usage: /approve [agent-id]");
      break;
    case "/reject":
      arg ? await execAgentAction(chatId, arg, "reject") : await send(chatId, "Usage: /reject [agent-id]");
      break;
    default:
      await send(chatId,
        `🤔 I didn't catch that.\n\nTry: <b>status</b>, <b>failed</b>, <b>health</b>, <b>fix</b>, <b>profit</b>, <b>agents</b>, or tap the menu below.`,
        mainMenu()
      );
  }

  return Response.json({ ok: true });
}
