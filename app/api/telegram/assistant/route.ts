import { PLATFORM_FEE_RATE } from "@/lib/pricing";
import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { bundles, networkApiName } from "@/lib/bundles";
import { generateDeepSeekReply } from "@/lib/deepseek";
import { normaliseGhanaPhone, sendCustomerSMS } from "@/lib/sms";

const INVENTOR_TIMEOUT_MS = 10_000;

const BOT = process.env.TELEGRAM_ASSISTANT_BOT_TOKEN!;
const ADMIN = process.env.TELEGRAM_ADMIN_CHAT_ID!;
const SECRET = process.env.TELEGRAM_ASSISTANT_WEBHOOK_SECRET!;
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const SITE_URL = process.env.SITE_URL ?? "https://elitedata1.com";

const pendingSend = new Map<string, { ref: string; phone: string; network: string; size: string; sizeGB: number; costPrice: number; price: number }>();
const pendingClearStuck = new Set<string>();

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

async function draftCustomerSms(chatId: string, phoneInput: string, instruction: string, scheduledFor?: string) {
  const phone = normaliseGhanaPhone(phoneInput);
  if (!/^\+233\d{9}$/.test(phone)) {
    await send(chatId, "❌ Enter one valid Ghana phone number. Example: <code>/sms 0241234567 Your order is ready</code>");
    return;
  }
  if (!instruction.trim()) {
    await send(chatId, "❌ Tell me what the SMS should say. Example: <code>/sms 0241234567 Tell the customer their order is ready</code>");
    return;
  }

  let message = instruction.trim().slice(0, 500);
  try {
    message = (await generateDeepSeekReply([
      { role: "system", content: "Draft one professional Elite Data customer SMS in plain text. Preserve all factual details supplied by the admin. Do not invent order status, refunds, prices, links, or promises. No markdown, emojis, headings, or quotation marks. Maximum 320 characters. Return only the SMS text." },
      { role: "user", content: instruction.trim().slice(0, 800) },
    ])).trim().slice(0, 320) || message;
  } catch {
    // The exact admin text remains a safe fallback when the drafting provider is unavailable.
  }

  const { data: draft, error } = await supabase.from("sms_drafts").insert({
    requested_by: chatId,
    phone,
    message,
    scheduled_for: scheduledFor ?? null,
  }).select("id").single();
  if (error || !draft) {
    await send(chatId, "❌ I could not save the SMS draft. Nothing was sent.");
    return;
  }

  await send(chatId,
    `📱 <b>Confirm ${scheduledFor ? "scheduled " : ""}customer SMS</b>\n\n<b>To:</b> <code>${escapeHtml(phone)}</code>\n${scheduledFor ? `<b>When:</b> ${escapeHtml(new Date(scheduledFor).toLocaleString("en-GH", { timeZone: "Africa/Accra", dateStyle: "medium", timeStyle: "short" }))} Ghana time\n` : ""}\n<b>Message:</b>\n${escapeHtml(message)}\n\n<i>Nothing has been sent yet. This draft expires in 15 minutes.</i>`,
    { inline_keyboard: [[
      { text: "✅ Confirm Send", callback_data: `sms_confirm:${draft.id}` },
      { text: "❌ Cancel", callback_data: `sms_cancel:${draft.id}` },
    ]] },
  );
}

async function confirmCustomerSms(chatId: string, draftId: string) {
  const { data: draft } = await supabase.from("sms_drafts")
    .update({ status: "sending" })
    .eq("id", draftId)
    .eq("requested_by", chatId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .select("id, phone, message, scheduled_for")
    .maybeSingle();
  if (!draft) {
    await send(chatId, "❌ This SMS draft expired, was cancelled, or was already used. Nothing was sent.");
    return;
  }

  if (draft.scheduled_for && new Date(draft.scheduled_for).getTime() > Date.now()) {
    const { error } = await supabase.from("sms_scheduled").insert({
      audience: "individual",
      phones: [draft.phone],
      message: draft.message,
      send_at: draft.scheduled_for,
      requested_by: chatId,
      status: "pending",
    });
    await supabase.from("sms_drafts").update({
      status: error ? "failed" : "scheduled",
      provider_message: error?.message?.slice(0, 500) ?? "Scheduled",
    }).eq("id", draft.id).eq("status", "sending");
    await send(chatId, error
      ? `❌ I could not schedule that SMS: ${escapeHtml(error.message.slice(0, 300))}`
      : `✅ SMS scheduled for ${escapeHtml(new Date(draft.scheduled_for).toLocaleString("en-GH", { timeZone: "Africa/Accra", dateStyle: "medium", timeStyle: "short" }))} Ghana time.`,
    mainMenu());
    return;
  }

  const result = await sendCustomerSMS(draft.phone, draft.message);
  await supabase.from("sms_drafts").update({
    status: result.ok ? "sent" : "failed",
    provider_message: result.message.slice(0, 500),
    sent_at: result.ok ? new Date().toISOString() : null,
  }).eq("id", draft.id).eq("status", "sending");

  await send(chatId, result.ok
    ? `✅ SMS sent to <code>${escapeHtml(draft.phone)}</code>.`
    : `❌ SMS provider rejected the message. Nothing else will be retried automatically.\n\n${escapeHtml(result.message.slice(0, 300))}`,
    mainMenu());
}

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

function parseScheduledSms(raw: string): { phone: string; instruction: string; sendAt: string } | null {
  const match = raw.match(/^(?:please\s+)?(?:schedule|send)\s+(?:an?\s+)?sms\s+(?:to\s+)?(?:customer\s+)?(\+?233\d{9}|0\d{9})\s+(?:on\s+)?(today|tomorrow|\d{4}-\d{2}-\d{2})\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[:,-]?\s*(.+)$/i);
  if (!match) return null;
  const [, phone, dayInput, hourInput, minuteInput, meridiem, instruction] = match;
  const date = new Date();
  if (dayInput.toLowerCase() === "tomorrow") date.setUTCDate(date.getUTCDate() + 1);
  else if (dayInput.toLowerCase() !== "today") {
    const parsed = new Date(`${dayInput}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime())) return null;
    date.setUTCFullYear(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
  }
  let hour = Number(hourInput);
  const minute = Number(minuteInput ?? 0);
  if (meridiem?.toLowerCase() === "pm" && hour < 12) hour += 12;
  if (meridiem?.toLowerCase() === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  date.setUTCHours(hour, minute, 0, 0); // Ghana uses UTC year-round.
  if (date.getTime() <= Date.now()) return null;
  return { phone, instruction, sendAt: date.toISOString() };
}

async function refuseAiMutation(chatId: string | number) {
  await send(chatId, "🔒 <b>AI is read-only.</b> It can analyze and recommend, but it cannot approve, retry, deliver, reject, refund, edit, or change an order. Use the reviewed admin dashboard controls yourself.");
}

function mainMenu() {
  return {
    inline_keyboard: [
      [{ text: "📊 Status", callback_data: "cmd:status" }, { text: "📅 Today", callback_data: "cmd:today" }],
      [{ text: "📦 Orders", callback_data: "cmd:orders" }, { text: "❌ Failed", callback_data: "cmd:failed" }],
      [{ text: "⏳ Pending", callback_data: "cmd:pending" }, { text: "💰 Profit", callback_data: "cmd:profit" }],
      [{ text: "🏥 Health", callback_data: "cmd:health" }],
      [{ text: "🛒 Bundles", callback_data: "cmd:bundles" }, { text: "🔧 Fix Problems", callback_data: "cmd:fix" }],
      [{ text: "🧹 Clear Stuck", callback_data: "cmd:clearstuck" }, { text: "🔁 Sync Orders", callback_data: "cmd:sync" }],
      [{ text: "🔍 Recover Order", callback_data: "cmd:recover" }, { text: "🚀 Upgrade Site", callback_data: "cmd:upgrade" }],
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

async function cmdStart(chatId: string) {
  await send(chatId,
    `🤖 <b>Elite Data Assistant — AI-Powered, 24/7</b>\n\n` +
    `I'm your personal admin AI. I can:\n` +
    `• Show live stats, revenue &amp; profit\n` +
    `• Understand plain English — just describe what you need\n` +
    `• Diagnose problems automatically when you tell me what's wrong\n` +
    `• Retry or manually fulfil failed orders\n` +
    `• Clear stuck pending/processing orders\n` +
    `• Manage bundles — enable/disable from Telegram\n` +
    `• Run a full health check on all services\n\n` +
    `💡 <i>Tip: Say "bundles not delivering" or "something is wrong" and I'll diagnose and fix it automatically!</i>\n\n` +
    `Tap a button or just type what you want 👇`,
    mainMenu()
  );
}

async function cmdHelp(chatId: string) {
  await send(chatId,
    `🤖 <b>Everything I Can Do</b>\n\n` +

    `<b>📊 Stats &amp; Reports</b>\n` +
    `/status — Live dashboard (orders, revenue, profit)\n` +
    `/today — Today's full report with every order\n` +
    `/profit — Breakdown: this month, last month, all time\n\n` +

    `<b>📦 Order Management</b>\n` +
    `/orders [n] — Last n orders (default 10)\n` +
    `/order [ref] — Look up one specific order\n` +
    `/lookup [phone] — All orders for a phone number\n` +
    `/failed — All failed orders with Retry buttons\n` +
    `/pending — Stuck orders older than 15 min\n` +
    `/cancel [ref] — Cancel a pending order\n\n` +

    `<b>🔧 Fix &amp; Deliver</b>\n` +
    `/fix — Auto-retry ALL failed orders at once\n` +
    `/retry [ref] — Retry one specific failed order\n` +
    `/send [phone] [network] [size] — Manually deliver a bundle\n` +
    `/recover [ref] — Customer paid but got nothing? Paste the payment ref to deliver\n` +
    `/patchorder [ref] [network] [size] — Fix wrong network/size on an order\n` +
    `/clearstuck — Mark all stuck orders as failed &amp; clear the list\n` +
    `/sync — Force-sync all orders with Inventor API right now\n\n` +

    `<b>🛒 Bundles &amp; Site</b>\n` +
    `/bundles — See all bundles with prices &amp; margins; enable/disable from here\n` +
    `/health — Check Supabase, Inventor API &amp; Yebeck are all working\n` +
    `/upgrade — Get 5 AI business ideas based on your real data\n\n` +

    `<b>💬 Just Type It (Plain English)</b>\n` +
    `These words work without a slash:\n` +
    `<i>status, today, failed, pending, profit, health, fix, clear stuck, sync, bundles, orders, upgrade, help, menu</i>\n\n` +
    `<b>📱 Customer SMS</b>\n` +
    `/sms [phone] [message] — Draft an SMS to send now\n` +
    `/smsat [phone] [YYYY-MM-DD] [HH:MM] [message] — Schedule an SMS in Ghana time\n` +
    `<i>Or say: send sms to 0241234567 tomorrow at 2pm tell them their refund is ready</i>\n\n` +

    `<b>🧠 AI Problem Diagnosis</b>\n` +
    `Describe any problem in plain English and I'll diagnose &amp; fix it automatically:\n` +
    `<i>"bundles not delivering", "something is wrong", "customer didn't receive", "what's happening"</i>`,
    mainMenu()
  );
}

async function cmdStatus(chatId: string) {
  const ordersRes = await supabase.from("orders").select("status, amount, admin_commission, created_at");
  const o = ordersRes.data ?? [];
  const now = new Date();

  const today = o.filter((x) => {
    const d = new Date(x.created_at);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  });

  const revenue = o.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const profit = o.reduce((s, x) => s + (Number(x.admin_commission) || 0), 0);
  const todayRev = today.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const todayProfit = today.reduce((s, x) => s + (Number(x.admin_commission) || 0), 0);

  const failed = o.filter((x) => x.status === "failed").length;
  const pending = o.filter((x) => x.status === "pending").length;
  const alert = failed > 0 ? `\n\n⚠️ <b>${failed} failed order(s) need attention</b> — tap ❌ Failed` : "";

  await send(chatId,
    `📊 <b>Elite Data — Live Dashboard</b>\n\n` +
    `<b>📅 Today</b>\n` +
    `Orders: <b>${today.length}</b>  |  Revenue: <b>GH₵${todayRev.toFixed(2)}</b>  |  Profit: <b>GH₵${todayProfit.toFixed(2)}</b>\n\n` +
    `<b>📈 All Time</b>\n` +
    `Total orders: <b>${o.length}</b>\n` +
    `✅ Completed: ${o.filter((x) => x.status === "completed").length}\n` +
    `🔄 Processing: ${o.filter((x) => x.status === "processing").length}\n` +
    `⏳ Pending: ${pending}\n` +
    `❌ Failed: ${failed}\n\n` +
    `💰 Revenue: <b>GH₵${revenue.toFixed(2)}</b>\n` +
    `📈 Your profit: <b>GH₵${profit.toFixed(2)}</b>${alert}`,
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
  const icon: Record<string, string> = { completed: "✅", processing: "🔄", failed: "❌", pending: "⏳" };

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
    `Failed: ${o.filter((x) => x.status === "failed").length}\n\n` +
    `<b>Recent:</b>\n${lines}${o.length > 10 ? `\n...+${o.length - 10} more` : ""}`,
    mainMenu()
  );
}

async function cmdOrders(chatId: string, arg: string) {
  const limit = Math.min(parseInt(arg) || 10, 25);
  const { data } = await supabase
    .from("orders")
    .select("reference, status, amount, admin_commission, network, bundle_size, phone, customer_name, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!data?.length) { await send(chatId, "No orders yet."); return; }

  const icon: Record<string, string> = { completed: "✅", processing: "🔄", failed: "❌", pending: "⏳" };
  const lines = data.map((o) =>
    `${icon[o.status] ?? "❓"} <b>${o.network.toUpperCase()} ${o.bundle_size}</b> → <code>${o.phone}</code>\n` +
    `   <b>${o.customer_name}</b> | GH₵${Number(o.amount).toFixed(2)} | Profit: GH₵${Number(o.admin_commission).toFixed(2)}\n` +
    `   ${new Date(o.created_at).toLocaleDateString("en-GH")}`
  ).join("\n\n");

  await send(chatId, `📦 <b>Last ${limit} Orders</b>\n\n${lines}`, mainMenu());
}

async function cmdOrder(chatId: string, ref: string) {
  if (!ref) { await send(chatId, "Usage: /order [reference]"); return; }
  const { data: o } = await supabase.from("orders").select("*").eq("reference", ref).maybeSingle();
  if (!o) { await send(chatId, `❌ Order <code>${ref}</code> not found.`); return; }

  const markup = o.status === "failed" ? retryMenu(ref) : mainMenu();

  await send(chatId,
    `📦 <b>Order Details</b>\n\n` +
    `Ref: <code>${o.reference}</code>\n` +
    `Customer: <b>${o.customer_name}</b>\n` +
    `Phone: <code>${o.phone}</code>\n` +
    `Network: <b>${o.network.toUpperCase()} ${o.bundle_size}</b>\n` +
    `Amount: GH₵${Number(o.amount).toFixed(2)}\n` +
    `Profit: GH₵${Number(o.admin_commission).toFixed(2)}\n` +
    `Status: <b>${o.status.toUpperCase()}</b>\n` +
    `Date: ${new Date(o.created_at).toLocaleString("en-GH")}`,
    markup
  );
}

async function cmdFailed(chatId: string) {
  const { data } = await supabase
    .from("orders")
    .select("reference, network, bundle_size, phone, customer_name, amount, created_at")
    .eq("status", "failed")
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
    .in("status", ["pending", "processing"])
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
      `   Status: <b>${o.status.toUpperCase()}</b> | Age: <b>${age} min</b> | GH₵${Number(o.amount).toFixed(2)}\n` +
      `   <code>${o.reference}</code>`
    );
  }).join("\n\n");

  await send(chatId,
    `⚠️ <b>${data.length} Stuck Order${data.length > 1 ? "s" : ""}</b> (>15 min without completion):\n\n${lines}\n\n` +
    `Use /retry [ref] to retry, or tap 🧹 <b>Clear Stuck</b> to mark all as failed and clear the list.`,
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

async function cmdLookup(chatId: string, phone: string) {
  if (!phone) { await send(chatId, "Usage: /lookup [phone number]"); return; }
  const { data } = await supabase
    .from("orders")
    .select("reference, status, amount, network, bundle_size, created_at")
    .eq("phone", phone)
    .order("created_at", { ascending: false });

  if (!data?.length) { await send(chatId, `No orders found for <code>${phone}</code>.`); return; }

  const icon: Record<string, string> = { completed: "✅", processing: "🔄", failed: "❌", pending: "⏳" };
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

  try {
    const t = Date.now();
    const { error } = await supabase.from("orders").select("count", { count: "exact", head: true });
    results.push(error ? `❌ Supabase DB: ${error.message}` : `✅ Supabase DB: OK (${Date.now() - t}ms)`);
  } catch { results.push("❌ Supabase DB: Connection failed"); }

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

  results.push(
    process.env.YEBECK_API_KEY?.trim()
      ? "✅ Mobile Money (Yebeck): key is set"
      : "❌ Mobile Money (Yebeck): key is missing — customers cannot pay"
  );

  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: stuck } = await supabase.from("orders").select("reference").in("status", ["pending", "processing"]).lt("created_at", cutoff);
  results.push(stuck?.length
    ? `⚠️ Stuck orders: ${stuck.length} order(s) >15 min — use /clearstuck`
    : "✅ No stuck orders"
  );

  const { data: failed } = await supabase.from("orders").select("reference").eq("status", "failed");
  results.push(failed?.length
    ? `⚠️ Failed orders: ${failed.length} unresolved — use /fix to auto-retry`
    : "✅ No failed orders"
  );

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
    .from("orders").select("*").eq("status", "failed")
    .order("created_at", { ascending: false }).limit(15);

  if (!failed?.length) {
    await send(chatId, "✅ <b>Nothing to fix!</b>\nNo failed orders found. Site is clean.\n\nIf you see stuck orders, use 🧹 <b>Clear Stuck</b> to clear pending/processing orders.", mainMenu());
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
      if (res.ok) {
        await supabase.from("orders").update({ status: "processing" }).eq("reference", o.reference);
        fixed++;
      } else { stillFailing++; }
    } catch { stillFailing++; }
  }

  await send(chatId,
    `🔧 <b>Auto-Fix Complete</b>\n\n` +
    `✅ Fixed: <b>${fixed}</b> order${fixed !== 1 ? "s" : ""}\n` +
    `❌ Still failing: <b>${stillFailing}</b>\n\n` +
    (stillFailing > 0
      ? "Use /failed to manually handle the remaining ones."
      : "All issues resolved! Everything is processing. 🎉"),
    mainMenu()
  );
}

async function cmdClearStuck(chatId: string) {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: stuck } = await supabase
    .from("orders")
    .select("reference, network, bundle_size, phone, created_at, status")
    .in("status", ["pending", "processing"])
    .lt("created_at", cutoff);

  if (!stuck?.length) {
    await send(chatId, `✅ <b>No stuck orders to clear!</b>\nAll orders are moving normally.`, mainMenu());
    return;
  }

  pendingClearStuck.add(chatId);

  const lines = stuck.slice(0, 8).map((o) => {
    const age = Math.round((Date.now() - new Date(o.created_at).getTime()) / 60000);
    return `• ${o.network.toUpperCase()} ${o.bundle_size} → <code>${o.phone}</code> (${age} min, ${o.status.toUpperCase()})`;
  }).join("\n");

  await send(chatId,
    `🧹 <b>Clear Stuck Orders — Confirm</b>\n\n` +
    `Found <b>${stuck.length} stuck order(s)</b> older than 15 minutes:\n\n${lines}` +
    `${stuck.length > 8 ? `\n...and ${stuck.length - 8} more` : ""}\n\n` +
    `⚠️ This will mark all of them as <b>FAILED</b> and remove them from the stuck list.\n` +
    `You can then retry individual orders with /retry [ref] if needed.`,
    {
      inline_keyboard: [[
        { text: "✅ Yes — Clear All", callback_data: "clearstuck:confirm" },
        { text: "❌ Cancel", callback_data: "clearstuck:cancel" },
      ]],
    }
  );
}

async function execClearStuck(chatId: string) {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  // Count first
  const { data: stuck } = await supabase
    .from("orders")
    .select("id")
    .in("status", ["pending", "processing"])
    .lt("created_at", cutoff);

  if (!stuck?.length) {
    await send(chatId, `✅ No stuck orders found — already cleared!`, mainMenu());
    return;
  }

  // Update by status + cutoff directly (avoids null-reference issues)
  const { error } = await supabase
    .from("orders")
    .update({ status: "failed" })
    .in("status", ["pending", "processing"])
    .lt("created_at", cutoff);

  if (error) {
    await send(chatId, `❌ Failed to clear: ${error.message}`, mainMenu());
    return;
  }

  await send(chatId,
    `🧹 <b>Cleared ${stuck.length} stuck order(s)</b>\n\n` +
    `All moved to FAILED status. Use /failed to review them and /retry [ref] to retry any that should be re-sent.`,
    mainMenu()
  );
}

async function cmdUpgrade(chatId: string) {
  await send(chatId, "🧠 <b>Analyzing your site data...</b>\nLet me review your numbers and think of the best upgrades for you. This takes a few seconds…");

  const [ordersRes, bundlesRes] = await Promise.all([
    supabase.from("orders").select("status, amount, network, bundle_size, admin_commission, created_at"),
    supabase.from("bundle_prices").select("network, size_label, price, cost_price, active"),
  ]);

  const orders = ordersRes.data ?? [];
  const bundles = bundlesRes.data ?? [];

  const now = new Date();
  const todayOrders = orders.filter(o => {
    const d = new Date(o.created_at);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  });

  const totalRevenue = orders.reduce((s, o) => s + (Number(o.amount) || 0), 0);
  const totalProfit = orders.reduce((s, o) => s + (Number(o.admin_commission) || 0), 0);
  const failRate = orders.length > 0 ? ((orders.filter(o => o.status === "failed").length / orders.length) * 100).toFixed(1) : "0";
  const networkCounts = { mtn: 0, telecel: 0, airteltigo: 0 } as Record<string, number>;
  orders.forEach(o => { if (o.network) { const n = o.network.toLowerCase(); if (n in networkCounts) networkCounts[n]++; } });
  const topNetwork = Object.entries(networkCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "mtn";
  const avgOrder = orders.length > 0 ? (totalRevenue / orders.length).toFixed(2) : "0";

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (apiKey) {
    try {
      const siteContext = `You are a business advisor for Elite Data — a mobile data bundle reselling website in Ghana. The site sells MTN, Telecel, and AirtelTigo data bundles. The owner manages everything via Telegram and a web admin panel.

Current business data:
- Total orders: ${orders.length} (today: ${todayOrders.length})
- Total revenue: GH₵${totalRevenue.toFixed(2)} | Profit: GH₵${totalProfit.toFixed(2)}
- Average order value: GH₵${avgOrder}
- Delivery fail rate: ${failRate}%
- Top network: ${topNetwork.toUpperCase()} (${networkCounts[topNetwork]} orders)
- Active bundles: ${bundles.filter(b => b.active).length}

Give exactly 5 upgrade ideas. Each must be specific to this business — not generic advice. Format like this exactly:
🔹 **Idea Name**
What: One sentence on what this feature/change is.
Why: One sentence on how it increases sales or customer trust for a Ghanaian data reseller.

Only return the 5 ideas, no intro, no outro.`;

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 900,
          messages: [{ role: "user", content: siteContext }],
        }),
      });

      if (res.ok) {
        const json = await res.json();
        const ideas = (json.content?.[0]?.text ?? "").trim();
        await send(chatId,
          `🚀 <b>AI Site Upgrade Ideas</b>\n<i>Based on your live data — ${new Date().toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" })}</i>\n\n${ideas}`,
          {
            inline_keyboard: [
              [{ text: "🔄 Generate New Ideas", callback_data: "cmd:upgrade" }],
              [{ text: "◀️ Back to Menu", callback_data: "cmd:menu" }],
            ],
          }
        );
        return;
      }
    } catch { /* fall through to smart fallback */ }
  }

  // Smart data-driven fallback (no API key needed)
  const ideas: string[] = [];

  ideas.push(
    `🔹 <b>Combo Bundle Deals</b>\nWhat: Let customers buy two bundles together at a small discount (e.g. "2 × ${topNetwork.toUpperCase()} 2GB = save GH₵2").\nWhy: Increases average order from GH₵${avgOrder} and makes customers feel they're getting value.`
  );

  if (Number(failRate) > 5) {
    ideas.push(
      `🔹 <b>Auto-Retry Delivery (3 Attempts)</b>\nWhat: When Inventor DataHub fails, automatically retry the order every 3 minutes for up to 3 attempts before marking failed.\nWhy: Your fail rate is ${failRate}% — most failures are temporary API hiccups that self-resolve.`
    );
  } else {
    ideas.push(
      `🔹 <b>Order Status SMS / WhatsApp Notification</b>\nWhat: Send customers a WhatsApp message when their data bundle is successfully delivered.\nWhy: Builds trust and reduces "did it work?" support messages — especially important for first-time buyers.`
    );
  }

  ideas.push(
    `🔹 <b>Network Downtime Banner</b>
What: When a network is switched off in admin, show a clear banner on the buy page and offer to notify customers when it is back.
Why: Customers stop retrying and messaging you while a network is down.`
  );
  ideas.push(
    `🔹 <b>Saved Recipient Numbers</b>
What: Let returning customers pick from the last numbers they bought for, with one tap.
Why: Faster repeat buying, especially on slow phones.`
  );

  ideas.push(
    `🔹 <b>Returning Customer Discount Code</b>\nWhat: After a completed order, automatically send the customer a 5% discount code valid for 7 days.\nWhy: Encourages repeat purchases within the week while the customer still has data top-up on their mind.`
  );

  await send(chatId,
    `🚀 <b>Site Upgrade Ideas</b>\n<i>Based on your live business data — ${new Date().toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" })}</i>\n\n${ideas.join("\n\n")}\n\n💡 <i>Add ANTHROPIC_API_KEY to your Vercel env vars to unlock AI-generated ideas every time.</i>`,
    {
      inline_keyboard: [
        [{ text: "🔄 Refresh Ideas", callback_data: "cmd:upgrade" }],
        [{ text: "◀️ Back to Menu", callback_data: "cmd:menu" }],
      ],
    }
  );
}

async function cmdBundles(chatId: string, networkFilter?: string) {
  const { data: dbBundles } = await supabase
    .from("bundle_prices")
    .select("id, network, size_label, size_gb, price, cost_price, active")
    .order("network").order("size_gb");

  const allBundles = dbBundles ?? [];
  const nets = networkFilter ? [networkFilter] : ["mtn", "telecel", "airteltigo"];
  const netNames: Record<string, string> = { mtn: "MTN", telecel: "Telecel", airteltigo: "AirtelTigo" };
  const netIcons: Record<string, string> = { mtn: "🟡", telecel: "🔴", airteltigo: "🔵" };

  for (const net of nets) {
    const list = allBundles.filter(b => b.network?.toLowerCase() === net);
    if (!list.length) continue;

    const lines = list.map(b => {
      const margin = (b.price - b.cost_price).toFixed(2);
      const pct = (((b.price - b.cost_price) / b.price) * 100).toFixed(0);
      return `${b.active ? "✅" : "❌"} <b>${b.size_label}</b> — GH₵${b.price} (cost: GH₵${b.cost_price}, margin: GH₵${margin} / ${pct}%)`;
    }).join("\n");

    const keyboard = list.map(b => [{
      text: b.active ? `🔴 Disable ${b.size_label}` : `🟢 Enable ${b.size_label}`,
      callback_data: `bundle_toggle:${b.id}:${b.active ? "0" : "1"}`,
    }]);

    await send(chatId,
      `${netIcons[net]} <b>${netNames[net]} Bundles</b>\n\n${lines}\n\n<i>Tap to enable/disable a bundle from the store:</i>`,
      { inline_keyboard: keyboard }
    );
  }

  if (!nets.some(n => allBundles.some(b => b.network?.toLowerCase() === n))) {
    await send(chatId,
      `🛒 <b>Bundle Management</b>\n\nNo custom bundles found in the database.\n\nBundles from the default list cannot be toggled here — add them via the admin panel first.`,
      mainMenu()
    );
    return;
  }

  await send(chatId,
    `💡 <b>Bundle Tip</b>\n\nTo update prices, open the admin panel → Prices tab.\nTo add a new bundle, tap Add New Bundle in the admin panel.`,
    {
      inline_keyboard: [
        [
          { text: "🟡 MTN", callback_data: "bundles:mtn" },
          { text: "🔴 Telecel", callback_data: "bundles:telecel" },
          { text: "🔵 AirtelTigo", callback_data: "bundles:airteltigo" },
        ],
        [{ text: "🔄 Refresh All", callback_data: "cmd:bundles" }],
        [{ text: "◀️ Back to Menu", callback_data: "cmd:menu" }],
      ],
    }
  );
}

async function toggleBundle(chatId: string, bundleId: string, active: boolean) {
  const { data: b } = await supabase.from("bundle_prices").select("size_label, network, price").eq("id", bundleId).maybeSingle();
  const { error } = await supabase.from("bundle_prices").update({ active }).eq("id", bundleId);
  if (error) {
    await send(chatId, `❌ Failed to update bundle: ${error.message}`, mainMenu());
    return;
  }
  const label = b ? `${(b.network ?? "").toUpperCase()} ${b.size_label} (GH₵${b.price})` : bundleId;
  await send(chatId,
    `${active ? "✅ Enabled" : "❌ Disabled"}: <b>${label}</b>\n\nThe bundle is now ${active ? "visible in the store" : "hidden from customers"}.`,
    {
      inline_keyboard: [
        [{ text: active ? "🔴 Disable it again" : "🟢 Enable it again", callback_data: `bundle_toggle:${bundleId}:${active ? "0" : "1"}` }],
        [{ text: "🛒 View All Bundles", callback_data: "cmd:bundles" }],
        [{ text: "◀️ Back to Menu", callback_data: "cmd:menu" }],
      ],
    }
  );
}

async function cmdSend(chatId: string, args: string[]) {
  if (args.length < 3) {
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
  pendingSend.set(chatId, { ref, phone, network: bundle.network, size: bundle.size, sizeGB: bundle.sizeGB, costPrice: bundle.costPrice, price: bundle.price });

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
  if (order.status !== "failed") {
    await send(chatId, `ℹ️ Status is <b>${order.status.toUpperCase()}</b>. Only FAILED orders can be retried.`);
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
    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      await supabase.from("orders").update({ status: "processing" }).eq("reference", reference);
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

async function cmdCancel(chatId: string, ref: string) {
  if (!ref) { await send(chatId, "Usage: /cancel [reference]"); return; }
  const { data: o } = await supabase.from("orders").select("status, network, bundle_size, phone, amount").eq("reference", ref).maybeSingle();
  if (!o) { await send(chatId, "❌ Order not found."); return; }
  if (o.status === "completed") { await send(chatId, "❌ Cannot cancel a completed order."); return; }

  await supabase.from("orders").update({ status: "failed" }).eq("reference", ref);
  await send(chatId,
    `🚫 <b>Order Cancelled</b>\n${o.network.toUpperCase()} ${o.bundle_size} → <code>${o.phone}</code>\nGH₵${Number(o.amount).toFixed(2)}\nStatus set to FAILED.\n\n⚠️ Remember to refund the customer if payment was collected.`,
    mainMenu()
  );
}

async function cmdPatchOrder(chatId: string, arg: string) {
  // Usage: /patchorder [ref] [network] [bundle_size] [customer_name?]
  // Example: /patchorder elite-123 mtn 2GB "John Doe"
  const parts = arg.trim().split(/\s+/);
  if (parts.length < 3) {
    await send(chatId,
      `🔧 <b>Patch Order Data</b>\n\nFixes missing/wrong fields on an order in the database.\n\n` +
      `Usage: /patchorder [ref] [network] [bundle_size]\n\n` +
      `<b>Networks:</b> mtn, telecel, airteltigo\n\n` +
      `<b>Example:</b>\n<code>/patchorder elite-1779544025405 mtn 2GB</code>`,
      mainMenu()
    );
    return;
  }

  const [ref, networkRaw, bundleSize, ...nameParts] = parts;
  const network = networkRaw.toLowerCase();

  if (!["mtn", "telecel", "airteltigo"].includes(network)) {
    await send(chatId, `❌ Unknown network "<b>${networkRaw}</b>". Use: mtn, telecel, or airteltigo`);
    return;
  }

  const { data: existing } = await supabase.from("orders").select("reference, status, network, bundle_size, customer_name, phone").eq("reference", ref).maybeSingle();
  if (!existing) {
    await send(chatId, `❌ Order <code>${ref}</code> not found in database.`);
    return;
  }

  const updates: Record<string, string> = {
    network,
    bundle_size: bundleSize,
  };
  if (nameParts.length > 0) {
    updates.customer_name = nameParts.join(" ");
  }

  const { error } = await supabase.from("orders").update(updates).eq("reference", ref);
  if (error) {
    await send(chatId, `❌ Update failed: ${error.message}`, mainMenu());
    return;
  }

  await send(chatId,
    `✅ <b>Order Patched</b>\n\n` +
    `📎 Ref: <code>${ref}</code>\n` +
    `📱 Phone: <code>${existing.phone}</code>\n` +
    `Before: ${existing.network ?? "null"} ${existing.bundle_size ?? "null"}\n` +
    `After: <b>${network.toUpperCase()} ${bundleSize}</b>\n` +
    `Status: ${existing.status}\n\n` +
    `✅ Database updated — order now shows correctly.`,
    mainMenu()
  );
}

async function deepSeekRoute(chatId: string, userText: string): Promise<boolean> {
  if (!DEEPSEEK_KEY) return false;

  const systemPrompt = `You are the backend router for an Elite Data Ghana admin Telegram bot. The admin sends you a message, and you decide what action to take.

Available actions (respond with exactly one):
ACTION: status — show live dashboard
ACTION: today — today's orders
ACTION: orders — recent orders list
ACTION: failed — failed orders
ACTION: pending — stuck/pending orders
ACTION: profit — revenue and profit breakdown
ACTION: health — full site health check
ACTION: fix — auto-retry all failed orders
ACTION: clearstuck — clear stuck orders
ACTION: sync — sync orders with Inventor API
ACTION: upgrade — site improvement ideas
ACTION: bundles — bundle management
ACTION: help — command list

If the message is a question or statement you can answer directly (not a command), respond with:
REPLY: [your helpful answer]

Keep REPLY answers under 80 words. Output only ACTION: or REPLY: and nothing else.`;

  try {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${DEEPSEEK_KEY}` },
      body: JSON.stringify({
        model: "deepseek-chat",
        max_tokens: 800,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userText },
        ],
      }),
    });
    if (!res.ok) return false;
    const json = await res.json();
    const reply = String(json.choices?.[0]?.message?.content ?? "").trim();

    const actionMatch = reply.match(/ACTION:\s*(\w+)/i);
    if (actionMatch) {
      const action = actionMatch[1].trim().toLowerCase();
      const actionMap: Record<string, () => Promise<void>> = {
        status: () => cmdStatus(chatId),
        today: () => cmdToday(chatId),
        orders: () => cmdOrders(chatId, "10"),
        failed: () => cmdFailed(chatId),
        pending: () => cmdPending(chatId),
        profit: () => cmdProfit(chatId),
        health: () => cmdHealth(chatId),
        upgrade: () => cmdUpgrade(chatId),
        bundles: () => cmdBundles(chatId),
        help: () => cmdHelp(chatId),
      };
      const handler = actionMap[action];
      if (handler) { await handler(); return true; }
    }

    const replyMatch = reply.match(/REPLY:\s*(.+)/i);
    if (replyMatch) {
      const text = (replyMatch[1] ?? "").trim();
      await send(chatId, `🤖 ${text}`, mainMenu());
      return true;
    }

    return false;
  } catch { return false; }
}

async function deepSeekDiagnose(chatId: string, userText: string): Promise<boolean> {
  if (!DEEPSEEK_KEY) return false;

  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const [failedRes, stuckRes, processingRes] = await Promise.all([
    supabase.from("orders").select("reference").eq("status", "failed"),
    supabase.from("orders").select("reference").in("status", ["pending", "processing"]).lt("created_at", cutoff),
    supabase.from("orders").select("reference").eq("status", "processing"),
  ]);

  const failedCount = failedRes.data?.length ?? 0;
  const stuckCount = stuckRes.data?.length ?? 0;
  const processingCount = processingRes.data?.length ?? 0;

  const systemState = `Current system state:
- Failed orders: ${failedCount}
- Stuck orders (>15 min): ${stuckCount}
- Processing orders: ${processingCount}`;

  const systemPrompt = `You are an AI diagnostic assistant for Elite Data Ghana, a mobile data bundle reselling site in Ghana. The admin is describing a problem.

${systemState}

Diagnose the issue and respond with:
1. A brief analysis (1-2 sentences max)
2. Zero or more AUTO_FIX actions on separate lines (only what's needed):
   AUTO_FIX: fix — retry failed orders
   AUTO_FIX: sync — sync stuck orders with Inventor API
   AUTO_FIX: clearstuck — clear all stuck orders
   AUTO_FIX: health — run full health check
   AUTO_FIX: failed — show failed orders list

Be direct. Under 120 words total.`;

  try {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${DEEPSEEK_KEY}` },
      body: JSON.stringify({
        model: "deepseek-chat",
        max_tokens: 1500,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userText },
        ],
      }),
    });
    if (!res.ok) return false;
    const json = await res.json();
    const reply = String(json.choices?.[0]?.message?.content ?? "").trim();

    const analysisLines = reply.split("\n").filter(l => !l.startsWith("AUTO_FIX:"));
    const analysis = analysisLines.join("\n").trim();
    const fixes = reply.split("\n")
      .filter(l => l.startsWith("AUTO_FIX:"))
      .map(l => l.replace("AUTO_FIX:", "").trim().toLowerCase());

    let msg = `🧠 <b>AI Diagnosis</b>\n\n${analysis}`;
    if (fixes.length > 0) msg += `\n\n🔧 <b>Auto-fixing now…</b>`;
    await send(chatId, msg);

    for (const fix of fixes) {
      if (fix === "fix") await refuseAiMutation(chatId);
      else if (fix === "sync") await cmdSync(chatId);
      else if (fix === "clearstuck") await cmdClearStuck(chatId);
      else if (fix === "health") await cmdHealth(chatId);
      else if (fix === "failed") await cmdFailed(chatId);
    }

    return true;
  } catch { return false; }
}

async function execAiRetry(chatId: string) {
  const { data: failed } = await supabase
    .from("orders")
    .select("reference, phone, network, bundle_size, bundle_size_gb")
    .eq("status", "failed");

  if (!failed?.length) {
    await send(chatId, `✅ <b>No failed orders found</b> — all clear!`, mainMenu());
    return;
  }

  await send(chatId, `🔄 Retrying <b>${failed.length}</b> failed order(s)…`);

  let fixed = 0, stillFailing = 0;
  const fixedLines: string[] = [];

  for (const o of failed) {
    const sizeGb = o.bundle_size_gb ?? (() => {
      const m = (o.bundle_size ?? "").match(/(\d+(?:\.\d+)?)\s*gb/i);
      return m ? parseFloat(m[1]) : 1;
    })();

    try {
      const res = await fetch(`${process.env.INVENTOR_API_BASE_URL}/api/developer/purchase`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.INVENTOR_API_KEY}` },
        body: JSON.stringify({
          network: networkApiName[o.network as keyof typeof networkApiName] ?? o.network.toUpperCase(),
          Phone: o.phone,
          Datasize: sizeGb,
          reference: `${o.reference}-ai`,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        await supabase.from("orders").update({ status: "processing" }).eq("reference", o.reference);
        fixedLines.push(`✅ ${(o.network ?? "").toUpperCase()} ${o.bundle_size} → ${o.phone}`);
        fixed++;
      } else {
        stillFailing++;
      }
    } catch {
      stillFailing++;
    }
  }

  let msg = `🔧 <b>Retry Complete</b>\n\n✅ Fixed: <b>${fixed}</b>\n❌ Still failing: <b>${stillFailing}</b>`;
  if (fixedLines.length) msg += `\n\n${fixedLines.join("\n")}`;
  if (stillFailing > 0) msg += `\n\nSend /failed to review the remaining ones.`;
  await send(chatId, msg, mainMenu());
}

async function cmdSync(chatId: string) {
  await send(chatId, "🔄 Checking all stuck/processing orders and syncing with Inventor…");
  try {
    const res = await fetch(`${SITE_URL}/api/admin/sync-orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cron-sync": process.env.CRON_SECRET ?? "" },
    });
    const data = await res.json() as Record<string, unknown>;
    const checked = Number(data.checked ?? 0);
    const updated = Number(data.updated ?? 0);
    const retried = Number(data.retried ?? 0);

    if (checked === 0) {
      await send(chatId, `✅ <b>Sync complete — nothing to fix!</b>\nNo pending or processing orders found. All clear. 🎉`, mainMenu());
    } else {
      await send(chatId,
        `✅ <b>Sync Complete</b>\n\n` +
        `📦 Checked: ${checked} order(s)\n` +
        `🔄 Status updated: ${updated}\n` +
        `🔁 Auto-retried (stuck >15min): ${retried}\n\n` +
        `${retried > 0 ? "Inventor has been resent the stuck deliveries. You will get an alert when they complete." : "No stuck orders found."}`,
        mainMenu()
      );
    }
  } catch (err) {
    await send(chatId, `❌ Sync failed: ${String(err)}`, mainMenu());
  }
}

async function cmdRecover(chatId: string, reference: string) {
  if (!reference) {
    await send(chatId,
      `🔍 <b>Recover a Missed Order</b>\n\nUsage: /recover [payment_reference]\n\nExample:\n/recover YBK-482131\n\n<i>Use this when a customer paid but didn't receive their bundle.</i>`,
      mainMenu()
    );
    return;
  }

  await send(chatId, `🔍 Checking <code>${reference}</code>…`);

  const { data: existing } = await supabase.from("orders")
    .select("reference, status, phone, network, bundle_size, amount")
    .eq("reference", reference).maybeSingle();

  if (existing) {
    const icon: Record<string, string> = { completed: "✅", processing: "🔄", failed: "❌", pending: "⏳", pending_approval: "⚠️" };
    let markup: object = mainMenu();
    if (existing.status === "failed") {
      markup = retryMenu(reference);
    } else if (existing.status === "pending_approval") {
      markup = { inline_keyboard: [[
        { text: "✅ YES — Send Now", callback_data: `approve_retry:${reference}` },
        { text: "❌ NO — Already Done", callback_data: `skip_retry:${reference}` },
      ]] };
    }
    await send(chatId,
      `${icon[existing.status] ?? "❓"} <b>Order found in database</b>\n\n` +
      `📎 Ref: <code>${existing.reference}</code>\n` +
      `📱 Phone: <code>${existing.phone}</code>\n` +
      `📦 Bundle: ${(existing.network ?? "").toUpperCase()} ${existing.bundle_size}\n` +
      `💰 Amount: GH₵${Number(existing.amount).toFixed(2)}\n` +
      `Status: <b>${existing.status.toUpperCase()}</b>` +
      (existing.status === "failed" ? `\n\nTap below to retry delivery 👇` : ""),
      markup
    );
    return;
  }

  let customerName = "Customer";
  let phone = "";
  let bundleLabel = "";
  let email = "";
  let amountPesewas = 0;

  try {
    const { verifyYebeckPayment } = await import("@/lib/payment-attempt");
    const ybk = await verifyYebeckPayment(reference);
    if (ybk.status !== "success") {
      await send(chatId,
        `❌ <b>Payment not confirmed</b>

Ref: <code>${reference}</code>
Mobile Money status: ${ybk.status}

This Mobile Money payment was not successful — no delivery needed.`,
        mainMenu()
      );
      return;
    }
    const meta = (ybk.attempt.metadata ?? {}) as Record<string, string>;
    customerName = meta.customer_name || "Customer";
    phone = meta.recipient_phone || meta.phone || "";
    amountPesewas = ybk.attempt.amount_pesewas;
    email = `${phone}@elitedata1.com`;
    bundleLabel = meta.bundle_id ?? "";
  } catch (e) {
    await send(chatId, `❌ Could not verify this payment reference: ${String(e)}`, mainMenu());
    return;
  }

  if (!phone) {
    await send(chatId,
      `⚠️ <b>Payment confirmed but phone missing from metadata</b>\n\n` +
      `Amount: GH₵${(amountPesewas / 100).toFixed(2)}\n` +
      `Customer email: ${email}\n` +
      `Bundle: ${bundleLabel || "unknown"}\n\n` +
      `Check the payment in the Yebeck dashboard, then use /send to deliver manually.`,
      mainMenu()
    );
    return;
  }

  let network = "";
  if (/mtn/i.test(bundleLabel)) network = "mtn";
  else if (/telecel|vodafone/i.test(bundleLabel)) network = "telecel";
  else if (/airtel|tigo/i.test(bundleLabel)) network = "airteltigo";

  type BundleItem = { id: string; network: string; size: string; sizeGB: number; price: number; costPrice: number };
  let matchedBundle: BundleItem | null = null;
  try {
    const res = await fetch(`${SITE_URL}/api/bundles`);
    const bData = await res.json() as { bundles: BundleItem[] };
    const allB = bData.bundles ?? [];
    const basePrice = amountPesewas / 100 / (1 + PLATFORM_FEE_RATE);
    const netBundles = network ? allB.filter(b => b.network === network) : allB;
    matchedBundle = netBundles.reduce((prev: BundleItem | null, b) => {
      if (!prev) return b;
      return Math.abs(b.price - basePrice) < Math.abs(prev.price - basePrice) ? b : prev;
    }, null);
  } catch { /* fall through */ }

  if (!matchedBundle) {
    await send(chatId,
      `⚠️ <b>Payment confirmed — bundle not matched automatically</b>\n\n` +
      `📱 Phone: <code>${phone}</code>\n` +
      `👤 Name: ${customerName}\n` +
      `📦 Bundle: ${bundleLabel || "unknown"}\n` +
      `💰 Amount: GH₵${(amountPesewas / 100).toFixed(2)}\n\n` +
      `Use /send ${phone} ${network || "[network]"} ${bundleLabel || "[size]"} to deliver manually.`,
      mainMenu()
    );
    return;
  }

  await send(chatId, `✅ Payment GH₵${(amountPesewas / 100).toFixed(2)} confirmed! Delivering <b>${network.toUpperCase()} ${matchedBundle.size}</b> to <code>${phone}</code>…`);

  const networkMap: Record<string, string> = { mtn: "MTN", telecel: "TELECEL", airteltigo: "AT ISHARE" };
  let deliveryOk = false;
  let deliveryError = "";
  try {
    const invRes = await fetch(`${process.env.INVENTOR_API_BASE_URL}/api/developer/purchase`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.INVENTOR_API_KEY}` },
      body: JSON.stringify({
        network: networkMap[network] ?? network.toUpperCase(),
        Phone: phone,
        Datasize: matchedBundle.sizeGB,
        reference,
      }),
      signal: AbortSignal.timeout(20000),
    });
    const body = await invRes.json().catch(() => ({})) as Record<string, unknown>;
    deliveryOk = invRes.ok || body.success === true || body.status === "success" || body.status === "00";
    if (!deliveryOk) deliveryError = JSON.stringify(body).slice(0, 200);
  } catch (e) {
    deliveryError = String(e);
  }

  if (!deliveryOk) {
    await send(chatId,
      `❌ <b>Delivery failed</b>\n\nError: <code>${deliveryError}</code>\n\nTry /send ${phone} ${network} ${matchedBundle.size} to deliver manually.`,
      mainMenu()
    );
    return;
  }

  await supabase.from("orders").insert({
    reference,
    customer_name: customerName,
    phone,
    network,
    bundle_size: `${network.toUpperCase()} ${matchedBundle.size}`,
    bundle_size_gb: matchedBundle.sizeGB,
    amount: matchedBundle.price,
    cost_price: matchedBundle.costPrice,
    admin_commission: Math.max(0, matchedBundle.price - matchedBundle.costPrice),
    agent_commission: 0,
    status: "completed",
  }).then(() => {});

  await send(chatId,
    `🎉 <b>Recovery Complete!</b>\n\n` +
    `📱 <code>${phone}</code> — ${network.toUpperCase()} ${matchedBundle.size}\n` +
    `👤 ${customerName} (${email})\n` +
    `📎 Ref: <code>${reference}</code>\n\n` +
    `✅ Data delivered and order saved to admin panel.`,
    mainMenu()
  );
}

// ─── ENV GUARD ────────────────────────────────────────────────────────────────
// These patterns catch ANY attempt to extract sensitive config — no exceptions.
const SENSITIVE_PATTERNS = [
  /env(ironment)?\s*(var|variable|key|file|config)?/i,
  /\.env/i,
  /secret/i,
  /api[_\s-]?key/i,
  /private[_\s-]?key/i,
  /access[_\s-]?key/i,
  /paystack|yebeck/i,
  /openai/i,
  /anthropic/i,
  /inventor[_\s-]?(api|key|token|base|url)/i,
  /supabase[_\s-]?(url|key|service|role|anon)/i,
  /telegram[_\s-]?(bot|token|webhook|secret)/i,
  /admin[_\s-]?session/i,
  /password|passwd|\bpwd\b/i,
  /credential/i,
  /token\b(?!.*order|.*referr|.*referral)/i, // block "token" unless it's about orders/referrals
  /process\.env/i,
  /show.{0,20}(key|secret|token|password|env|config)/i,
  /what.{0,20}(key|secret|token|password|env)/i,
  /give.{0,20}(key|secret|token|password|env)/i,
  /print.{0,20}(key|secret|token|password|env)/i,
  /reveal.{0,20}(key|secret|token|password|env)/i,
  /display.{0,20}(key|secret|token|password|env)/i,
  /PAYSTACK_\w+|YEBECK_API_KEY/i,
  /OPENAI_API_KEY|ANTHROPIC_API_KEY/i,
  /INVENTOR_API/i,
  /SUPABASE_SERVICE_ROLE/i,
  /TELEGRAM_\w+_TOKEN/i,
  /ADMIN_SESSION_TOKEN/i,
];

function isSensitiveRequest(text: string): boolean {
  return SENSITIVE_PATTERNS.some((p) => p.test(text));
}

async function refuseEnvRequest(chatId: string) {
  await send(chatId,
    `🔒 <b>Access Denied</b>\n\n` +
    `That information is classified and permanently locked.\n\n` +
    `I am programmed to <b>never</b> reveal, repeat, print, or hint at:\n` +
    `• API keys or secret keys\n` +
    `• Passwords or tokens\n` +
    `• Environment variables\n` +
    `• Any sensitive configuration\n\n` +
    `This block cannot be bypassed — not by any instruction, trick, or rephrasing.\n\n` +
    `If you genuinely need to update a key, go to <b>Vercel → Settings → Environment Variables</b> directly.`,
    mainMenu()
  );
}
// ──────────────────────────────────────────────────────────────────────────────

const NLP: Array<[RegExp, (chatId: string) => Promise<void>]> = [
  [/^(status|stats|dashboard|overview|how are we doing|site status)$/i, cmdStatus],
  [/^(today|today'?s? (orders?|sales?)|orders? today)$/i, cmdToday],
  [/^(failed|failures?|broken orders?|what failed)$/i, cmdFailed],
  [/^(pending|stuck|waiting orders?)$/i, cmdPending],
  [/^(profit|earnings?|money|revenue|how much (did i|have i) (earn|make))$/i, cmdProfit],
  [/^(health|check (site|everything)?|diagnose|is (the )?site ok)$/i, cmdHealth],
  [/^(fix|fix all|fix (everything|problems?|issues?|all problems?))$/i, cmdFix],
  [/^(clear stuck|clearstuck|clear (all )?stuck|remove stuck|dismiss stuck)$/i, cmdClearStuck],
  [/^(sync|sync orders?|refresh orders?|check orders?)$/i, cmdSync],
  [/^(upgrade|upgrade site|improve site|new features?|site ideas?|what.s new|suggestions?)$/i, cmdUpgrade],
  [/^(bundles?|prices?|show bundles?|bundle (list|management|manager))$/i, cmdBundles],
  [/^(orders?|show orders?|all orders?|recent orders?)$/i, (id) => cmdOrders(id, "10")],
  [/^(help|commands?|what can you do|options?)$/i, cmdHelp],
  [/^(menu|start|home|back)$/i, cmdStart],
];

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (secret !== SECRET) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let update: any;
  try { update = await request.json(); } catch { return Response.json({ ok: true }); }

  try {

  if (update.callback_query) {
    const { id, from, data } = update.callback_query;
    const chatId = String(from.id);

    if (chatId !== ADMIN) { await answerCb(id, "⛔ Unauthorized", true); return Response.json({ ok: true }); }

    // ENV GUARD on callback data too
    if (isSensitiveRequest(data ?? "")) {
      await answerCb(id, "🔒 Blocked", true);
      await refuseEnvRequest(chatId);
      return Response.json({ ok: true });
    }

    const mutationCallbacks = new Set(["cmd:fix", "cmd:clearstuck", "cmd:sync", "cmd:recover", "clearstuck:confirm", "ai_retry:confirm"]);
    const mutationPrefixes = [
      "bundle_toggle:", "retry:", "approve_retry:", "skip_retry:", "manual_ask:", "manual_exec:",
      "approve:", "reject:", "manual_approve:", "manual_reject:", "send_exec:",
    ];
    if (mutationCallbacks.has(data ?? "") || mutationPrefixes.some(prefix => data?.startsWith(prefix))) {
      await answerCb(id, "AI is read-only", true);
      await refuseAiMutation(chatId);
      return Response.json({ ok: true });
    }

    await answerCb(id, "One moment…");

    if (data === "cmd:status") await cmdStatus(chatId);
    else if (data === "cmd:today") await cmdToday(chatId);
    else if (data === "cmd:orders") await cmdOrders(chatId, "10");
    else if (data === "cmd:failed") await cmdFailed(chatId);
    else if (data === "cmd:pending") await cmdPending(chatId);
    else if (data === "cmd:profit") await cmdProfit(chatId);
    else if (data === "cmd:health") await cmdHealth(chatId);
    else if (data === "cmd:fix") await cmdFix(chatId);
    else if (data === "cmd:clearstuck") await cmdClearStuck(chatId);
    else if (data === "cmd:sync") await cmdSync(chatId);
    else if (data === "cmd:recover") await cmdRecover(chatId, "");
    else if (data === "cmd:upgrade") await cmdUpgrade(chatId);
    else if (data === "cmd:bundles") await cmdBundles(chatId);
    else if (data === "cmd:menu") await cmdStart(chatId);
    else if (data?.startsWith("bundles:")) await cmdBundles(chatId, data.replace("bundles:", ""));
    else if (data?.startsWith("bundle_toggle:")) {
      const [, bundleId, activeStr] = data.split(":");
      await toggleBundle(chatId, bundleId, activeStr === "1");
    }
    else if (data === "clearstuck:confirm") {
      pendingClearStuck.delete(chatId);
      await execClearStuck(chatId);
    }
    else if (data === "clearstuck:cancel") {
      pendingClearStuck.delete(chatId);
      await send(chatId, "Cancelled. Stuck orders were not changed.", mainMenu());
    }
    else if (data?.startsWith("retry:")) await execRetry(chatId, data.replace("retry:", ""), "Retry");
    else if (data?.startsWith("approve_retry:")) {
      const ref = data.replace("approve_retry:", "");
      const { data: order } = await supabase.from("orders").select("network, bundle_size, bundle_size_gb, phone, agent_id, agent_commission, amount").eq("reference", ref).maybeSingle();
      if (!order) { await send(chatId, `❌ Order <code>${ref}</code> not found.`); }
      else {
        await send(chatId, `📤 Sending ${(order.network ?? "").toUpperCase()} ${order.bundle_size} to <code>${order.phone}</code>…`);
        const networkMap: Record<string, string> = { mtn: "MTN", telecel: "TELECEL", airteltigo: "AT ISHARE" };
        const sizeGb = order.bundle_size_gb ?? (() => { const m = (order.bundle_size ?? "").match(/(\d+(?:\.\d+)?)\s*gb/i); return m ? parseFloat(m[1]) : 1; })();
        try {
          const invRes = await fetch(`${process.env.INVENTOR_API_BASE_URL}/api/developer/purchase`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.INVENTOR_API_KEY}` },
            body: JSON.stringify({ network: networkMap[order.network] ?? order.network.toUpperCase(), Phone: order.phone, Datasize: sizeGb, reference: `${ref}-ap` }),
            signal: AbortSignal.timeout(20000),
          });
          const body = await invRes.json().catch(() => ({})) as Record<string, unknown>;
          const ok = invRes.ok || body.success === true || body.status === "success" || body.status === "00";
          if (ok) {
            await supabase.from("orders").update({ status: "completed" }).eq("reference", ref);
            if (order.agent_id) {
              const { data: ag } = await supabase.from("agents").select("commission_balance, total_sales, total_revenue").eq("id", order.agent_id).maybeSingle();
              if (ag) {
                await supabase.from("agents").update({
                  commission_balance: (Number(ag.commission_balance) || 0) + (Number(order.agent_commission) || 0),
                  total_sales: (Number(ag.total_sales) || 0) + 1,
                  total_revenue: (Number(ag.total_revenue) || 0) + (Number(order.amount) || 0),
                  updated_at: new Date().toISOString(),
                }).eq("id", order.agent_id);
              }
            }
            await send(chatId, `✅ <b>Delivered!</b>\n${(order.network ?? "").toUpperCase()} ${order.bundle_size} → <code>${order.phone}</code>\nRef: <code>${ref}</code>`, mainMenu());
          } else {
            await send(chatId, `❌ Delivery failed.\n<code>${JSON.stringify(body).slice(0, 200)}</code>`, mainMenu());
          }
        } catch (e) { await send(chatId, `❌ Error: ${String(e)}`); }
      }
    }
    else if (data?.startsWith("skip_retry:")) {
      const ref = data.replace("skip_retry:", "");
      const { data: ord } = await supabase.from("orders").select("agent_id, agent_commission, amount").eq("reference", ref).maybeSingle();
      await supabase.from("orders").update({ status: "completed" }).eq("reference", ref);
      if (ord?.agent_id && ord.agent_commission) {
        const { data: ag } = await supabase.from("agents").select("commission_balance, total_sales, total_revenue").eq("id", ord.agent_id).maybeSingle();
        if (ag) {
          await supabase.from("agents").update({
            commission_balance: (Number(ag.commission_balance) || 0) + Number(ord.agent_commission),
            total_sales: (Number(ag.total_sales) || 0) + 1,
            total_revenue: (Number(ag.total_revenue) || 0) + Number(ord.amount),
            updated_at: new Date().toISOString(),
          }).eq("id", ord.agent_id);
        }
      }
      await send(chatId, `✅ <b>Marked as done.</b>\nOrder <code>${ref}</code> closed — cron will not touch it again.`, mainMenu());
    }
    else if (data?.startsWith("manual_ask:")) {
      const ref = data.replace("manual_ask:", "");
      const { data: o } = await supabase.from("orders").select("network, bundle_size, phone, amount").eq("reference", ref).maybeSingle();
      if (o) {
        await send(chatId,
          `✋ <b>Manual Fulfil — Confirm</b>\n\n${o.network.toUpperCase()} ${o.bundle_size} → <code>${o.phone}</code>\nGH₵${Number(o.amount).toFixed(2)}\n\nThis calls Inventor DataHub directly. Confirm?`,
          { inline_keyboard: [[{ text: "✅ Yes, Do It", callback_data: `manual_exec:${ref}` }, { text: "❌ Cancel", callback_data: "noop" }]] }
        );
      }
    }
    else if (data?.startsWith("manual_exec:")) await execRetry(chatId, data.replace("manual_exec:", ""), "Manual");
    else if (data?.startsWith("sms_confirm:")) await confirmCustomerSms(chatId, data.replace("sms_confirm:", ""));
    else if (data?.startsWith("sms_cancel:")) {
      const draftId = data.replace("sms_cancel:", "");
      await supabase.from("sms_drafts").update({ status: "cancelled" }).eq("id", draftId).eq("requested_by", chatId).eq("status", "pending");
      await send(chatId, "✅ SMS cancelled. Nothing was sent.", mainMenu());
    }
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
          if (res.ok) {
            // Close any pending/processing orders for this phone+network+size so cron won't re-deliver
            const { data: stuck } = await supabase
              .from("orders")
              .select("reference")
              .eq("phone", pending.phone)
              .eq("network", pending.network)
              .eq("bundle_size_gb", pending.sizeGB)
              .in("status", ["pending", "processing"]);
            if (stuck && stuck.length > 0) {
              for (const o of stuck) {
                await supabase.from("orders").update({ status: "completed" }).eq("reference", o.reference);
              }
            }

            // Save manual delivery to orders table
            await supabase.from("orders").insert({
              reference: pending.ref,
              customer_name: "Manual (Admin)",
              phone: pending.phone,
              network: pending.network,
              bundle_size: pending.size,
              bundle_size_gb: pending.sizeGB,
              amount: pending.price,
              cost_price: pending.costPrice,
              admin_commission: Math.max(0, pending.price - pending.costPrice),
              agent_commission: 0,
              status: "completed",
            });
            const closedNote = stuck && stuck.length > 0 ? `\n⚠️ Closed ${stuck.length} pending order(s) — cron won't re-deliver.` : "";
            await send(chatId, `✅ <b>Sent!</b>\n${pending.network.toUpperCase()} ${pending.size} delivered to <code>${pending.phone}</code> 📶\n<i>Order saved to admin panel.</i>${closedNote}`, mainMenu());
          } else {
            const result = await res.json().catch(() => ({}));
            await send(chatId, `❌ Failed: <code>${JSON.stringify(result).slice(0, 200)}</code>`, mainMenu());
          }
        } catch (e) { await send(chatId, `❌ Error: ${String(e)}`); }
      }
    }
    else if (data === "ai_retry:confirm") await execAiRetry(chatId);
    else if (data === "ai_retry:skip") await send(chatId, "👍 Skipped. I'll check again on the next cycle.", mainMenu());
    else if (data === "noop") await send(chatId, "Cancelled.", mainMenu());

    return Response.json({ ok: true });
  }

  const message = update.message;
  if (!message) return Response.json({ ok: true });

  // Photo handler
  if (message.photo) {
    const chatId = String(message.chat.id);
    if (chatId === ADMIN) {
      await send(chatId,
        `📸 <b>Photo received!</b>\n\n` +
        `Image editing &amp; flyer creation is coming soon! 🎨\n\n` +
        `Once launched, you'll be able to:\n` +
        `• Edit customer images\n` +
        `• Create branded data bundle flyers\n` +
        `• Generate promotional graphics\n\n` +
        `For now, use the menu to manage your store.`,
        mainMenu()
      );
    }
    return Response.json({ ok: true });
  }

  if (!message.text) return Response.json({ ok: true });

  const chatId = String(message.chat.id);
  if (chatId !== ADMIN) {
    await send(chatId, "⛔ This is a private admin assistant.");
    return Response.json({ ok: true });
  }

  const raw = (message.text as string).trim();

  // ENV GUARD — block before anything else runs
  if (isSensitiveRequest(raw)) {
    await refuseEnvRequest(chatId);
    return Response.json({ ok: true });
  }
  const lower = raw.toLowerCase();
  const parts = raw.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const arg = parts.slice(1).join(" ");
  const args = parts.slice(1);

  const scheduledSms = parseScheduledSms(raw);
  if (scheduledSms) {
    await draftCustomerSms(chatId, scheduledSms.phone, scheduledSms.instruction, scheduledSms.sendAt);
    return Response.json({ ok: true });
  }

  const naturalSms = raw.match(/^(?:please\s+)?send\s+(?:an?\s+)?sms\s+(?:to\s+)?(?:customer\s+)?(\+?233\d{9}|0\d{9})\s*[:,-]?\s*(.+)$/i);
  if (naturalSms) {
    await draftCustomerSms(chatId, naturalSms[1], naturalSms[2]);
    return Response.json({ ok: true });
  }

  const mutationCommand = /^\/(fix|clearstuck|sync|recover|patchorder|send|retry|cancel)\b/i;
  const mutationRequest = /\b(approve|reject|retry|redeliver|deliver again|force.?complete|mark .*completed|refund|cancel order|change status|edit order|clear stuck|fix failed|send bundle)\b/i;
  if (mutationCommand.test(raw) || mutationRequest.test(raw)) {
    await refuseAiMutation(chatId);
    return Response.json({ ok: true });
  }

  // Problem detection — route to AI diagnosis before NLP
  const PROBLEM_WORDS = /problem|issue|wrong|not working|not deliver|not receiv|not getting|didn.t receive|didn.t get|can.t receive|haven.t got|error|something wrong|broken|glitch|weird|failing|customer.{0,50}(complain|call|messag|not|didn|can.t)|they (didn.t|not|can.t).{0,20}(receive|get|deliver)|bundle not|data not|what.{0,10}s happening|what is happening|what.{0,10}s wrong|help me fix/i;
  if (PROBLEM_WORDS.test(raw) && !raw.startsWith("/")) {
    const diagnosed = await deepSeekDiagnose(chatId, raw);
    if (diagnosed) return Response.json({ ok: true });
  }

  for (const [pattern, handler] of NLP) {
    if (pattern.test(lower)) { await handler(chatId); return Response.json({ ok: true }); }
  }

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
    case "/lookup":                    await cmdLookup(chatId, arg); break;
    case "/health":                    await cmdHealth(chatId); break;
    case "/fix":                       await cmdFix(chatId); break;
    case "/clearstuck":                await cmdClearStuck(chatId); break;
    case "/bundles":                   await cmdBundles(chatId, arg || undefined); break;
    case "/upgrade":                   await cmdUpgrade(chatId); break;
    case "/cancel":                    await cmdCancel(chatId, arg); break;
    case "/sync":                      await cmdSync(chatId); break;
    case "/recover":                   await cmdRecover(chatId, arg); break;
    case "/patchorder":                await cmdPatchOrder(chatId, arg); break;
    case "/send":                      await cmdSend(chatId, args); break;
    case "/sms": {
      const [phone, ...instructionParts] = args;
      await draftCustomerSms(chatId, phone ?? "", instructionParts.join(" "));
      break;
    }
    case "/smsat": {
      const [phone, date, time, ...instructionParts] = args;
      const parsed = parseScheduledSms(`send sms to ${phone ?? ""} on ${date ?? ""} at ${time ?? ""} ${instructionParts.join(" ")}`);
      if (!parsed) await send(chatId, "❌ Usage: <code>/smsat 0241234567 2026-08-10 14:30 Your message</code>. Date and time must be in the future (Ghana time).");
      else await draftCustomerSms(chatId, parsed.phone, parsed.instruction, parsed.sendAt);
      break;
    }
    case "/retry":
      arg ? await execRetry(chatId, arg) : await send(chatId, "Usage: /retry [reference]");
      break;
    default: {
      const handled = await deepSeekRoute(chatId, raw);
      if (!handled) {
        await send(chatId,
          `🤔 I didn't catch that.\n\nTry: <b>status</b>, <b>failed</b>, <b>health</b>, <b>fix</b>, <b>clear stuck</b>, <b>profit</b>, or tap the menu below.`,
          mainMenu()
        );
      }
    }
  }

  } catch (err) {
    const errMsg = String(err).slice(0, 300);
    try { await send(ADMIN, `⚠️ <b>Bot crash</b>\n<code>${errMsg}</code>`); } catch { /* ignore */ }
  }

  return Response.json({ ok: true });
}
