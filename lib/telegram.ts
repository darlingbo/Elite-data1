const ADMIN_BOT_TOKEN = process.env.TELEGRAM_ADMIN_BOT_TOKEN;
const ASSISTANT_TOKEN = process.env.TELEGRAM_ASSISTANT_BOT_TOKEN;
const SWIFT_TOKEN     = process.env.TELEGRAM_SWIFT_BOT_TOKEN;
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

// ── Send to a specific agent's Telegram chat via Elite_dataAgentbot ───────────
export async function sendAgentNotification(agentChatId: string, message: string): Promise<void> {
  if (!ADMIN_BOT_TOKEN || !agentChatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${ADMIN_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: agentChatId, text: message, parse_mode: "HTML" }),
    });
  } catch { /* never crash the main flow */ }
}

// ── Admin alerts ─────────────────────────────────────────────────────────────
// Messages with inline keyboards (approve/reject buttons) MUST be sent via
// ADMIN_BOT_TOKEN — the same bot the Telegram webhook is registered on —
// so button callbacks are received. Plain text alerts use ASSISTANT_TOKEN.
export async function sendAdminAlert(message: string, markup?: object): Promise<void> {
  if (markup) {
    // Must use the same bot the Telegram webhook is registered on so button callbacks arrive
    await tgSend(ADMIN_BOT_TOKEN!, message, markup);
  } else {
    // Use assistant bot for plain alerts; fall back to admin bot if assistant token not set
    await tgSend((ASSISTANT_TOKEN || ADMIN_BOT_TOKEN)!, message);
  }
}

export async function sendAdminBotMessage(message: string, replyMarkup?: object): Promise<void> {
  await tgSend(ADMIN_BOT_TOKEN!, message, replyMarkup);
}

// ── @SWIFTDATAGH_BOT — stuck order approval alerts only ──────────────────────
export async function sendSwiftAlert(message: string, markup?: object): Promise<void> {
  await tgSend(SWIFT_TOKEN!, message, markup);
}

// ── Escape user-supplied content before inserting into Telegram HTML messages ──
export function tgEscape(text: string): string {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function e(text: string): string {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Message formatters ────────────────────────────────────────────────────────
export function fmtOrder({
  ref, network, size, phone, amount, profit, agentName,
}: {
  ref: string; network: string; size: string; phone: string;
  amount: number; profit: number; agentName?: string;
}) {
  const source = agentName ? `🔗 Agent: <b>${e(agentName)}</b>` : "🛒 Direct sale";
  return (
    `🛒 <b>New Order</b>\n` +
    `📱 ${e(network.toUpperCase())} ${e(size)}\n` +
    `📞 Phone: <code>${e(phone)}</code>\n` +
    `💰 Amount: GH₵${amount.toFixed(2)}\n` +
    `📊 Profit: GH₵${profit.toFixed(2)}\n` +
    `${source}\n` +
    `📎 Ref: <code>${e(ref)}</code>`
  );
}

export function fmtDelivered(ref: string, phone: string, network: string, size: string) {
  return (
    `✅ <b>Bundle Delivered</b>\n` +
    `📱 ${e(network.toUpperCase())} ${e(size)} → <code>${e(phone)}</code>\n` +
    `📎 Ref: <code>${e(ref)}</code>`
  );
}

export function fmtFailed(ref: string, phone: string, network: string, size: string, amount: number) {
  return (
    `❌ <b>Order Failed</b>\n` +
    `📱 ${e(network.toUpperCase())} ${e(size)} → <code>${e(phone)}</code>\n` +
    `💰 GH₵${amount.toFixed(2)}\n` +
    `📎 Ref: <code>${e(ref)}</code>`
  );
}

export function fmtAgentApplied(name: string, email: string, phone: string, business?: string) {
  return (
    `👤 <b>New Agent Application</b>\n` +
    `Name: ${e(name)}\n` +
    `Email: ${e(email)}\n` +
    `Phone: <code>${e(phone)}</code>\n` +
    (business ? `Business: ${e(business)}\n` : "") +
    `\n⚡ Use the buttons below to approve or reject instantly.`
  );
}

export function agentApprovalKeyboard(agentId: string) {
  return {
    inline_keyboard: [[
      { text: "✅ Approve", callback_data: `approve_agent:${agentId}` },
      { text: "❌ Reject", callback_data: `reject_agent:${agentId}` },
    ]],
  };
}

export function orderApprovalKeyboard(ref: string) {
  return {
    inline_keyboard: [[
      { text: "✅ Approve & Send", callback_data: `approve_order:${ref}` },
      { text: "❌ Reject", callback_data: `reject_order:${ref}` },
    ]],
  };
}

export function fmtAgentApproved(name: string, code: string) {
  return `✅ <b>Agent Approved</b>\nName: ${e(name)}\nReferral code: <code>${e(code)}</code>`;
}

export function retryKeyboard(ref: string) {
  return {
    inline_keyboard: [[
      { text: "🔄 Auto Retry", callback_data: `retry:${ref}` },
      { text: "✋ Manual Fulfil", callback_data: `manual_ask:${ref}` },
    ]],
  };
}
