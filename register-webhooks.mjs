// ─── Register Telegram Webhooks ───────────────────────────────────────────────
// Run once: node register-webhooks.mjs
// Reads your tokens from .env.local and points both bots to elitedata1.com

import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local
const envPath = resolve(".env.local");
const env = {};
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
}

const SITE_URL = "https://elitedata1.com";

const bots = [
  {
    name: "Admin Bot (webhook)",
    token: env.TELEGRAM_ADMIN_BOT_TOKEN,
    url: `${SITE_URL}/api/telegram/webhook`,
    secret: env.TELEGRAM_WEBHOOK_SECRET,
  },
  {
    name: "AI Assistant Bot",
    token: env.TELEGRAM_ASSISTANT_BOT_TOKEN,
    url: `${SITE_URL}/api/telegram/assistant`,
    secret: env.TELEGRAM_ASSISTANT_WEBHOOK_SECRET,
  },
];

for (const bot of bots) {
  if (!bot.token) {
    console.log(`⚠️  Skipping "${bot.name}" — token not found in .env.local`);
    continue;
  }

  const apiUrl = `https://api.telegram.org/bot${bot.token}/setWebhook`;
  const body = { url: bot.url, ...(bot.secret ? { secret_token: bot.secret } : {}) };

  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (data.ok) {
      console.log(`✅ ${bot.name} → ${bot.url}`);
    } else {
      console.log(`❌ ${bot.name} failed: ${data.description}`);
    }
  } catch (err) {
    console.log(`❌ ${bot.name} error: ${err.message}`);
  }
}

console.log("\nDone. Your bots now point to elitedata1.com.");
