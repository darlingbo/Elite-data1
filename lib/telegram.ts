const BOT_TOKEN       = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_BOT_TOKEN = process.env.TELEGRAM_ADMIN_BOT_TOKEN;
const ASSISTANT_TOKEN = process.env.TELEGRAM_ASSISTANT_BOT_TOKEN;
const CHAT_ID         = process.env.TELEGRAM_ADMIN_CHAT_ID;

async function tgSend(token: string, message: string, markup?: object): Promise<void> {
  if (!token || !CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text: message, parse_mode: "HTML", reply_markup: markup }),
    });
  } catch { /* never crash the main flow */ }
}

// ── Notification bot (@Swiftdatagh_bot) — one-way alerts ─────────────────────
// Also mirrors every alert to the assistant bot so admin sees it all in one place
export async function sendAdminAlert(message: string): Promise<void> {
  await Promise.all([
    tgSend(BOT_TOKEN!, message),
    tgSend(ASSISTANT_TOKEN!, message),
  ]);
}

// ── Old admin bot (@Elite_dataAgentbot) + assistant — with inline buttons ─────
// Used for failed orders that need a retry/manual button
export async function sendAdminBotMessage(message: string, replyMarkup?: object): Promise<void> {
  await Promise.all([
    tgSend(ADMIN_BOT_TOKEN!, message, replyMarkup),
    tgSend(ASSISTANT_TOKEN!, message, replyMarkup),
  ]);
}

// ── Message formatters ────────────────────────────────────────────────────────
export function fmtOrder({
  ref, network, size, phone, amount, profit, agentName,
}: {
  ref: string; network: string; size: string; phone: string;
  amount: number; profit: number; agentName?: string;
}) {
  const source = agentName ? `🔗 Agent: <b>${agentName}</b>` : "🛒 Direct sale";
  return (
    `🛒 <b>New Order</b>\n` +
    `📱 ${network.toUpperCase()} ${size}\n` +
    `📞 Phone: <code>${phone}</code>\n` +
    `💰 Amount: GH₵${amount.toFixed(2)}\n` +
    `📊 Profit: GH₵${profit.toFixed(2)}\n` +
    `${source}\n` +
    `📎 Ref: <code>${ref}</code>`
  );
}

export function fmtDelivered(ref: string, phone: string, network: string, size: string) {
  return (
    `✅ <b>Bundle Delivered</b>\n` +
    `📱 ${network.toUpperCase()} ${size} → <code>${phone}</code>\n` +
    `📎 Ref: <code>${ref}</code>`
  );
}

export function fmtFailed(ref: string, phone: string, network: string, size: string, amount: number) {
  return (
    `❌ <b>Order Failed</b>\n` +
    `📱 ${network.toUpperCase()} ${size} → <code>${phone}</code>\n` +
    `💰 GH₵${amount.toFixed(2)}\n` +
    `📎 Ref: <code>${ref}</code>`
  );
}

export function fmtAgentApplied(name: string, email: string, phone: string, business?: string) {
  return (
    `👤 <b>New Agent Application</b>\n` +
    `Name: ${name}\n` +
    `Email: ${email}\n` +
    `Phone: <code>${phone}</code>\n` +
    (business ? `Business: ${business}\n` : "") +
    `\n⚡ Use /agents to approve or reject`
  );
}

export function fmtAgentApproved(name: string, code: string) {
  return `✅ <b>Agent Approved</b>\nName: ${name}\nReferral code: <code>${code}</code>`;
}

export function retryKeyboard(ref: string) {
  return {
    inline_keyboard: [[
      { text: "🔄 Auto Retry", callback_data: `retry:${ref}` },
      { text: "✋ Manual Fulfil", callback_data: `manual_ask:${ref}` },
    ]],
  };
}
