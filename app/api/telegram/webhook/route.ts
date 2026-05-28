import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { networkApiName } from "@/lib/bundles";

const ADMIN_BOT_TOKEN = process.env.TELEGRAM_ADMIN_BOT_TOKEN!;
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID!;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET!;
const SITE_URL = process.env.SITE_URL ?? "https://elitedata1.com";

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

const icon: Record<string, string> = { completed: "✅", processing: "🔄", failed: "❌", pending: "⏳" };

async function cmdStatus(chatId: string) {
  const [ordersRes, agentsRes] = await Promise.all([
    supabase.from("orders").select("status, amount, admin_commission, agent_id"),
    supabase.from("agents").select("status"),
  ]);
  const o = ordersRes.data ?? [];
  const a = agentsRes.data ?? [];

  const revenue = o.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const profit = o.reduce((s, x) => s + (Number(x.admin_commission) || 0), 0);

  await reply(chatId,
    `📊 <b>Elite Data — Live Status</b>\n\n` +
    `📦 Total orders: <b>${o.length}</b>\n` +
    `✅ Completed: ${o.filter(x => x.status === "completed").length}\n` +
    `🔄 Processing: ${o.filter(x => x.status === "processing").length}\n` +
    `⏳ Pending: ${o.filter(x => x.status === "pending").length}\n` +
    `❌ Failed: ${o.filter(x => x.status === "failed").length}\n\n` +
    `💰 Revenue: <b>GH₵${revenue.toFixed(2)}</b>\n` +
    `📈 Admin profit: <b>GH₵${profit.toFixed(2)}</b>\n` +
    `🔗 Via agents: ${o.filter(x => x.agent_id).length} orders\n\n` +
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

  const lines = data.map(o =>
    `${icon[o.status] ?? "❓"} <b>${(o.network ?? "—").toUpperCase()} ${o.bundle_size ?? "—"}</b> → <code>${o.phone}</code>\n` +
    `   GH₵${Number(o.amount).toFixed(2)} | Profit: GH₵${Number(o.admin_commission).toFixed(2)} | ${o.agent_id ? "Agent" : "Direct"}\n` +
    `   <code>${o.reference ?? "—"}</code>`
  ).join("\n\n");

  await reply(chatId, `📦 <b>Last 10 Orders</b>\n\n${lines}`);
}

async function cmdFailed(chatId: string) {
  const { data } = await supabase
    .from("orders")
    .select("reference, network, bundle_size, phone, amount, agent_id")
    .eq("status", "failed")
    .order("created_at", { ascending: false })
    .limit(8);

  if (!data?.length) { await reply(chatId, "✅ No failed orders — all good!"); return; }

  for (const o of data) {
    if (!o.reference) continue;
    await reply(
      chatId,
      `❌ <b>Failed Order</b>\n` +
      `📱 ${(o.network ?? "—").toUpperCase()} ${o.bundle_size ?? "—"} → <code>${o.phone}</code>\n` +
      `💰 GH₵${Number(o.amount).toFixed(2)}\n` +
      `📎 <code>${o.reference}</code>`,
      { inline_keyboard: [[{ text: "🔄 Retry Now", callback_data: `retry:${o.reference}` }]] }
    );
  }
}

async function cmdAgents(chatId: string) {
  const [activeRes, pendingRes] = await Promise.all([
    supabase.from("agents").select("name, referral_code, commission_balance, total_sales, total_revenue")
      .eq("status", "approved").order("total_revenue", { ascending: false }).limit(10),
    supabase.from("agents").select("name, phone, email, created_at").eq("status", "pending"),
  ]);

  const active = activeRes.data ?? [];
  const pending = pendingRes.data ?? [];
  const medals = ["🥇", "🥈", "🥉"];

  let msg = `👤 <b>Agent Leaderboard</b>\n\n`;
  if (!active.length) {
    msg += "No active agents yet.\n";
  } else {
    active.forEach((a, i) => {
      msg += `${medals[i] ?? `${i + 1}.`} <b>${a.name}</b>\n`;
      msg += `   Code: <code>${a.referral_code}</code>\n`;
      msg += `   Sales: ${a.total_sales} | Revenue: GH₵${Number(a.total_revenue).toFixed(2)}\n`;
      msg += `   Earned: GH₵${Number(a.commission_balance).toFixed(2)}\n\n`;
    });
  }

  if (pending.length) {
    msg += `\n⚡ <b>${pending.length} application(s) awaiting approval:</b>\n`;
    pending.forEach((p) => { msg += `• ${p.name} — <code>${p.phone}</code>\n`; });
    msg += `\nUse the assistant bot to approve.`;
  }

  await reply(chatId, msg);
}

async function retryOrder(chatId: string, reference: string) {
  const { data: order } = await supabase.from("orders").select("*").eq("reference", reference).maybeSingle();
  if (!order) { await reply(chatId, `❌ Order <code>${reference}</code> not found.`); return; }
  if (order.status !== "failed") {
    await reply(chatId, `ℹ️ Order status is <b>${order.status.toUpperCase()}</b>. Only FAILED orders can be retried.`);
    return;
  }

  await reply(chatId, `🔄 Retrying <code>${reference}</code>…`);
  const networkKey = order.network as keyof typeof networkApiName;

  try {
    const res = await fetch(`${process.env.INVENTOR_API_BASE_URL}/api/developer/purchase`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.INVENTOR_API_KEY}` },
      body: JSON.stringify({
        network: networkApiName[networkKey],
        Phone: order.phone,
        Datasize: order.bundle_size_gb,
        reference: `${reference}-r`,
      }),
    });
    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      await supabase.from("orders").update({ status: "processing" }).eq("reference", reference);
      await reply(chatId,
        `✅ <b>Retry successful!</b>\n` +
        `📱 ${(order.network ?? "").toUpperCase()} ${order.bundle_size} → <code>${order.phone}</code>\n` +
        `Status: PROCESSING — bundle on its way.`
      );
    } else {
      await reply(chatId, `❌ Retry failed.\nInventor: <code>${JSON.stringify(data).slice(0, 200)}</code>`);
    }
  } catch (e) {
    await reply(chatId, `❌ Network error during retry: ${String(e)}`);
  }
}

async function cmdRecover(chatId: string, reference: string) {
  if (!reference) {
    await reply(chatId, "Usage: /recover [paystack_reference]\nExample: /recover elite-1779381711689");
    return;
  }

  await reply(chatId, `🔍 Checking <code>${reference}</code>…`);

  // Check if already in DB
  const { data: existing } = await supabase
    .from("orders")
    .select("reference, status, phone, network, bundle_size, amount")
    .eq("reference", reference)
    .maybeSingle();

  if (existing) {
    const icon: Record<string, string> = { completed: "✅", processing: "🔄", failed: "❌", pending: "⏳" };
    await reply(chatId,
      `${icon[existing.status] ?? "❓"} <b>Order already exists</b>\n\n` +
      `📎 Ref: <code>${existing.reference}</code>\n` +
      `📱 Phone: <code>${existing.phone}</code>\n` +
      `📦 Bundle: ${(existing.network ?? "").toUpperCase()} ${existing.bundle_size}\n` +
      `💰 Amount: GH₵${Number(existing.amount).toFixed(2)}\n` +
      `Status: <b>${existing.status.toUpperCase()}</b>`
    );
    return;
  }

  // Not in DB — verify on Paystack
  let psData: Record<string, unknown> = {};
  try {
    const psRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
    );
    psData = await psRes.json();
  } catch {
    await reply(chatId, "❌ Could not reach Paystack. Check your internet and try again.");
    return;
  }

  const txn = psData.data as Record<string, unknown>;
  if (!psData.status || txn?.status !== "success") {
    await reply(chatId,
      `❌ <b>Payment not confirmed</b>\n\n` +
      `Ref: <code>${reference}</code>\n` +
      `Paystack status: ${txn?.status ?? "unknown"}\n\n` +
      `This payment was not successful — no delivery needed.`
    );
    return;
  }

  // Extract customer info from Paystack metadata
  const meta = txn.metadata as Record<string, unknown>;
  const fields = (meta?.custom_fields as Array<Record<string, string>>) ?? [];
  const getField = (name: string) => fields.find(f => f.variable_name === name)?.value ?? "";

  const customerName = getField("name") || String(txn.customer ? (txn.customer as Record<string, string>).first_name : "") || "Customer";
  const phone = getField("phone") || "";
  const bundleLabel = getField("bundle") || ""; // e.g. "MTN 2GB"
  const email = (txn.customer as Record<string, string>)?.email ?? "";
  const amountPesewas = Number(txn.amount ?? 0);

  if (!phone) {
    await reply(chatId,
      `⚠️ <b>Payment confirmed but phone not found in metadata</b>\n\n` +
      `Amount: GH₵${(amountPesewas / 100).toFixed(2)}\n` +
      `Customer email: ${email}\n` +
      `Bundle: ${bundleLabel || "unknown"}\n\n` +
      `Please check Paystack dashboard for full details.`
    );
    return;
  }

  // Match bundle from label (e.g. "MTN 2GB") and amount
  let network = "";
  if (/mtn/i.test(bundleLabel)) network = "mtn";
  else if (/telecel|vodafone/i.test(bundleLabel)) network = "telecel";
  else if (/airtel|tigo/i.test(bundleLabel)) network = "airteltigo";

  // Find bundleId by matching network + price closest to paid amount
  let bundleId = "";
  try {
    const res = await fetch(`${SITE_URL}/api/bundles`);
    const data = await res.json() as { bundles: Array<{ id: string; network: string; price: number }> };
    const bundles = data.bundles ?? [];
    const basePrice = amountPesewas / 100 / 1.02;
    const netBundles = network ? bundles.filter(b => b.network === network) : bundles;
    const best = netBundles.reduce((prev: { id: string; network: string; price: number } | null, b) => {
      if (!prev) return b;
      return Math.abs(b.price - basePrice) < Math.abs(prev.price - basePrice) ? b : prev;
    }, null);
    if (best) bundleId = best.id;
  } catch { /* fall through */ }

  if (!bundleId) {
    await reply(chatId,
      `⚠️ <b>Payment confirmed — bundle not matched automatically</b>\n\n` +
      `📱 Phone: <code>${phone}</code>\n` +
      `👤 Name: ${customerName}\n` +
      `📦 Bundle: ${bundleLabel || "unknown"}\n` +
      `💰 Amount: GH₵${(amountPesewas / 100).toFixed(2)}\n\n` +
      `Could not match bundle automatically. Deliver manually via Inventor dashboard.`
    );
    return;
  }

  // Trigger delivery via our orders/create endpoint
  await reply(chatId, `✅ Payment confirmed! Delivering <b>${bundleLabel}</b> to <code>${phone}</code>…`);

  try {
    const createRes = await fetch(`${SITE_URL}/api/orders/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: customerName, email, phone, bundleId, paystackRef: reference }),
    });
    const result = await createRes.json() as Record<string, unknown>;

    if (result.success) {
      await reply(chatId,
        `🎉 <b>Delivery ${result.status === "COMPLETED" ? "Completed" : "Processing"}!</b>\n\n` +
        `📱 <code>${phone}</code> — ${bundleLabel}\n` +
        `👤 ${customerName} (${email})\n` +
        `📎 Ref: <code>${reference}</code>\n\n` +
        `${result.status === "COMPLETED" ? "Data is on their phone ✅" : "Bundle is on its way 🔄"}`
      );
    } else {
      await reply(chatId,
        `❌ <b>Delivery failed</b>\n\nError: ${result.error ?? "Unknown error"}\n\nTry /retry ${reference} or deliver manually.`
      );
    }
  } catch (err) {
    await reply(chatId, `❌ Delivery error: ${String(err)}`);
  }
}

async function cmdSync(chatId: string) {
  await reply(chatId, "🔄 Checking all stuck orders and retrying…");
  try {
    const res = await fetch(`${SITE_URL}/api/admin/sync-orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cron-sync": process.env.CRON_SECRET ?? "",
      },
    });
    const data = await res.json() as Record<string, unknown>;
    const checked = Number(data.checked ?? 0);
    const updated = Number(data.updated ?? 0);
    const retried = Number(data.retried ?? 0);

    if (checked === 0) {
      await reply(chatId, "✅ No pending or processing orders found — all clear!");
    } else {
      await reply(chatId,
        `✅ <b>Sync complete</b>\n\n` +
        `📦 Checked: ${checked} order(s)\n` +
        `🔄 Status updated: ${updated}\n` +
        `🔁 Auto-retried (stuck >15min): ${retried}\n\n` +
        `${retried > 0 ? "Inventor has been resent the stuck deliveries. You will get an alert when they complete." : "No stuck orders found."}`
      );
    }
  } catch (err) {
    await reply(chatId, `❌ Sync failed: ${String(err)}`);
  }
}

async function cmdSend(chatId: string, arg: string) {
  if (!arg.trim()) {
    await reply(chatId,
      `📤 <b>Manual Bundle Delivery</b>\n\n` +
      `Usage: /send [network] [size] [phone]\n\n` +
      `<b>Examples:</b>\n` +
      `/send mtn 2gb 0241234567\n` +
      `/send telecel 10gb 0551234567\n` +
      `/send airteltigo 5gb 0261234567\n\n` +
      `<i>This sends data directly from your Inventor API balance — no Paystack needed.</i>`
    );
    return;
  }

  const parts = arg.trim().split(/\s+/);
  if (parts.length < 3) {
    await reply(chatId, "❌ Need 3 parts: network, size, phone.\nExample: /send mtn 2gb 0241234567");
    return;
  }

  const [netRaw, sizeRaw, phone] = parts;

  // Normalise network
  const net = netRaw.toLowerCase();
  let network = "";
  const networkApiMap: Record<string, string> = { mtn: "MTN", telecel: "TELECEL", airteltigo: "AT ISHARE" };
  if (net === "mtn") network = "mtn";
  else if (net.includes("telecel") || net.includes("voda")) network = "telecel";
  else if (net.includes("airtel") || net.includes("tigo") || net === "at") network = "airteltigo";

  if (!network) {
    await reply(chatId, `❌ Unknown network "<b>${netRaw}</b>". Use: mtn, telecel, or airteltigo`);
    return;
  }

  // Parse size (e.g. "2gb" → 2)
  const sizeGB = parseFloat(sizeRaw.toLowerCase().replace("gb", "").trim());
  if (!sizeGB || isNaN(sizeGB)) {
    await reply(chatId, `❌ Invalid size "<b>${sizeRaw}</b>". Examples: 1gb, 2gb, 5gb, 10gb`);
    return;
  }

  // Validate phone — Ghana format
  if (!/^0[2-5]\d{8}$/.test(phone.trim())) {
    await reply(chatId, `❌ Invalid phone number "<b>${phone}</b>". Must be a valid Ghana number like 0241234567`);
    return;
  }

  // Fetch bundles and find match
  type BundleItem = { id: string; network: string; size: string; sizeGB: number; price: number; costPrice: number };
  let bundle: BundleItem | null = null;
  try {
    const bRes = await fetch(`${SITE_URL}/api/bundles`);
    const bData = await bRes.json() as { bundles: BundleItem[] };
    const all: BundleItem[] = bData.bundles ?? [];
    bundle = all.find(b => b.network === network && b.sizeGB === sizeGB) ?? null;

    if (!bundle) {
      const available = all
        .filter(b => b.network === network)
        .sort((a, b) => a.sizeGB - b.sizeGB)
        .map(b => `${b.sizeGB}GB (GH₵${b.price})`)
        .join(", ");
      await reply(chatId,
        `❌ No <b>${network.toUpperCase()} ${sizeGB}GB</b> bundle found.\n\n` +
        `Available ${network.toUpperCase()} bundles:\n${available}`
      );
      return;
    }
  } catch {
    await reply(chatId, "❌ Could not fetch bundle list. Try again.");
    return;
  }

  await reply(chatId,
    `📤 Sending <b>${network.toUpperCase()} ${bundle.size}</b> to <code>${phone}</code>…\n` +
    `Cost: GH₵${bundle.costPrice} from your Inventor balance`
  );

  const ref = `manual-tg-${Date.now()}`;

  try {
    const invRes = await fetch(`${process.env.INVENTOR_API_BASE_URL}/api/developer/purchase`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.INVENTOR_API_KEY}` },
      body: JSON.stringify({
        network: networkApiMap[network],
        Phone: phone.trim(),
        Datasize: sizeGB,
        reference: ref,
      }),
      signal: AbortSignal.timeout(20000),
    });

    const invBody = await invRes.json().catch(() => ({})) as Record<string, unknown>;
    const ok =
      invRes.ok ||
      invBody.success === true ||
      invBody.status === "success" ||
      invBody.status === "00";

    if (ok) {
      // Mark any pending/processing orders for this phone+network+size as completed
      // so the cron doesn't re-deliver them and cause double data
      const { data: stuck } = await supabase
        .from("orders")
        .select("reference")
        .eq("phone", phone.trim())
        .eq("network", network)
        .eq("bundle_size_gb", sizeGB)
        .in("status", ["pending", "processing"]);
      const cancelledRefs: string[] = [];
      if (stuck && stuck.length > 0) {
        for (const o of stuck) {
          await supabase.from("orders").update({ status: "completed" }).eq("reference", o.reference);
          cancelledRefs.push(o.reference);
        }
      }

      // Record manual delivery in DB
      await supabase.from("orders").insert({
        reference: ref,
        customer_name: "Manual (Telegram)",
        phone: phone.trim(),
        network,
        bundle_size: bundle.size,
        bundle_size_gb: sizeGB,
        amount: bundle.price,
        cost_price: bundle.costPrice,
        admin_commission: parseFloat((bundle.price - bundle.costPrice).toFixed(2)),
        agent_commission: 0,
        status: "completed",
      });

      await reply(chatId,
        `✅ <b>Delivered!</b>\n\n` +
        `📱 Phone: <code>${phone}</code>\n` +
        `📦 Bundle: ${network.toUpperCase()} ${bundle.size}\n` +
        `💰 Cost: GH₵${bundle.costPrice} deducted from API\n` +
        `📎 Ref: <code>${ref}</code>` +
        (cancelledRefs.length > 0 ? `\n\n⚠️ Closed ${cancelledRefs.length} pending order(s) for this number so cron won't re-deliver.` : "")
      );
    } else {
      const errMsg = JSON.stringify(invBody).slice(0, 300);
      await reply(chatId,
        `❌ <b>Delivery failed</b>\n\n` +
        `Phone: <code>${phone}</code>\n` +
        `Bundle: ${network.toUpperCase()} ${bundle.size}\n\n` +
        `Inventor response:\n<code>${errMsg}</code>`
      );
    }
  } catch (err) {
    await reply(chatId, `❌ Error sending bundle: ${String(err)}`);
  }
}

async function cmdHelp(chatId: string) {
  await reply(chatId,
    `👋 <b>Elite Data Admin Bot</b>\n\n` +
    `<b>📦 Orders:</b>\n` +
    `/orders — Last 10 orders\n` +
    `/failed — Failed orders with retry button\n` +
    `/status — Live stats &amp; profit\n\n` +
    `<b>🔧 Fix &amp; Deliver:</b>\n` +
    `/send [network] [size] [phone] — Manual bundle delivery\n` +
    `/recover [ref] — Recover missed payment &amp; deliver\n` +
    `/retry [ref] — Retry a specific failed order\n` +
    `/sync — Auto-retry all stuck orders\n\n` +
    `<b>👥 Agents:</b>\n` +
    `/agents — Leaderboard &amp; earnings\n\n` +
    `<b>⚡ Examples:</b>\n` +
    `/send mtn 2gb 0241234567\n` +
    `/recover elite-1779381711689\n` +
    `/sync\n\n` +
    `<b>🔔 Auto alerts:</b> new orders, deliveries, failures, agent applications, auto-retries, agent withdrawals`
  );
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (secret !== WEBHOOK_SECRET) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const update = await request.json();

  if (update.callback_query) {
    const { id, from, data } = update.callback_query;
    if (String(from.id) !== ADMIN_CHAT_ID) { await answerCb(id, "⛔ Unauthorized"); return Response.json({ ok: true }); }
    await answerCb(id, "Processing…");
    const chatId = String(from.chat_id ?? from.id);

    if (data?.startsWith("retry:")) {
      await retryOrder(chatId, data.replace("retry:", ""));

    } else if (data?.startsWith("approve_retry:")) {
      const ref = data.replace("approve_retry:", "");
      const { data: order } = await supabase.from("orders").select("*").eq("reference", ref).maybeSingle();
      if (!order) { await reply(chatId, `❌ Order <code>${ref}</code> not found.`); return Response.json({ ok: true }); }

      const networkApiMap: Record<string, string> = { mtn: "MTN", telecel: "TELECEL", airteltigo: "AT ISHARE" };
      const sizeGb = order.bundle_size_gb ?? (() => {
        const m = (order.bundle_size ?? "").match(/(\d+(?:\.\d+)?)\s*gb/i);
        return m ? parseFloat(m[1]) : 1;
      })();

      try {
        const retryRef = `${ref}-rs`;
        const res = await fetch(`${process.env.INVENTOR_API_BASE_URL}/api/developer/purchase`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.INVENTOR_API_KEY}` },
          body: JSON.stringify({
            network: networkApiMap[order.network] ?? order.network.toUpperCase(),
            Phone: order.phone,
            Datasize: sizeGb,
            reference: retryRef,
          }),
          signal: AbortSignal.timeout(20000),
        });
        const body = await res.json().catch(() => ({})) as Record<string, unknown>;
        const ok = res.ok || body.success === true || body.status === "success" || body.status === "00" || res.status === 409;

        if (ok) {
          await supabase.from("orders").update({ status: "processing" }).eq("reference", ref);
          await reply(chatId,
            `✅ <b>Sent!</b>\n\n` +
            `📱 ${(order.network ?? "").toUpperCase()} ${order.bundle_size} → <code>${order.phone}</code>\n` +
            `📎 Ref: <code>${retryRef}</code>\n\nBundle is on its way.`
          );
        } else {
          await reply(chatId,
            `❌ <b>Delivery failed</b>\n\nInventor: <code>${JSON.stringify(body).slice(0, 200)}</code>`
          );
        }
      } catch (err) {
        await reply(chatId, `❌ Error: ${String(err)}`);
      }

    } else if (data?.startsWith("skip_retry:")) {
      const ref = data.replace("skip_retry:", "");
      await supabase.from("orders").update({ status: "completed" }).eq("reference", ref);
      await reply(chatId, `✅ Marked <code>${ref}</code> as <b>COMPLETED</b> — no re-delivery.`);
    }

    return Response.json({ ok: true });
  }

  const message = update.message;
  if (!message?.text) return Response.json({ ok: true });

  const chatId = String(message.chat.id);
  const msgText = (message.text as string).trim();

  // ── Agent linking via /start AGENTCODE ────────────────────────────────────
  if (chatId !== ADMIN_CHAT_ID) {
    const isStart = msgText.toLowerCase().startsWith("/start");
    const code = msgText.split(" ")[1]?.trim().toUpperCase();

    if (isStart && code) {
      const { data: agent } = await supabase
        .from("agents")
        .select("id, name, referral_code, telegram_chat_id")
        .eq("referral_code", code)
        .eq("status", "approved")
        .maybeSingle();

      if (!agent) {
        await reply(chatId,
          `❌ <b>Code not found</b>\n\n` +
          `The code <code>${code}</code> is not linked to any active agent.\n\n` +
          `Go to your dashboard and copy the exact link from the <b>Connect Telegram</b> section.`
        );
        return Response.json({ ok: true });
      }

      if (agent.telegram_chat_id && agent.telegram_chat_id !== chatId) {
        await reply(chatId,
          `⚠️ <b>Already connected to another Telegram account</b>\n\n` +
          `Contact admin on WhatsApp to reset your Telegram link.`
        );
        return Response.json({ ok: true });
      }

      await supabase.from("agents").update({ telegram_chat_id: chatId }).eq("id", agent.id);

      await reply(chatId,
        `✅ <b>Connected! You are now ${agent.name}</b>\n\n` +
        `📱 From now on, every time a customer buys from your store link, you will get an instant notification here on Telegram.\n\n` +
        `🛒 <b>What you will see:</b>\n` +
        `• Customer name &amp; phone\n` +
        `• Bundle bought\n` +
        `• Amount paid\n` +
        `• Your commission earned\n` +
        `• Delivery status\n\n` +
        `Keep this chat open and notifications turned on! 🔔`
      );
      return Response.json({ ok: true });
    }

    // Non-admin, no valid code
    await reply(chatId,
      `👋 <b>Elite Data Agent Bot</b>\n\n` +
      `This bot sends you instant sale notifications.\n\n` +
      `To connect your account, go to your agent dashboard and tap <b>Connect Telegram</b>.`
    );
    return Response.json({ ok: true });
  }

  const text = msgText.split(" ")[0].toLowerCase();
  const arg = msgText.split(" ").slice(1).join(" ");

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
    case "/recover":
      await cmdRecover(chatId, arg);
      break;
    case "/sync":
      await cmdSync(chatId);
      break;
    case "/send":
      await cmdSend(chatId, arg);
      break;
    default:
      await reply(chatId, `Unknown command. Send /help for the list.\n\nFor advanced features, use the assistant bot.`);
  }

  return Response.json({ ok: true });
}
