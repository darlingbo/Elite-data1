/**
 * Standalone monitor — runs in GitHub Actions every 5 min.
 * Checks site health, stuck orders, and sends Telegram alerts.
 * Does NOT auto-deliver — that is handled by cron-job.org with admin approval.
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = process.env.SUPABASE_URL
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_KEY
const TG_TOKEN      = process.env.TELEGRAM_BOT_TOKEN
const TG_CHAT       = process.env.TELEGRAM_CHAT_ID
const SITE_URL      = 'https://www.elitedata1.com'

const missing = [
  !SUPABASE_URL  && 'SUPABASE_URL',
  !SERVICE_KEY   && 'SUPABASE_SERVICE_KEY',
  !TG_TOKEN      && 'TELEGRAM_BOT_TOKEN',
  !TG_CHAT       && 'TELEGRAM_CHAT_ID',
].filter(Boolean)

if (missing.length) {
  console.error('Missing GitHub Actions secrets:', missing.join(', '))
  console.error('Go to your repo → Settings → Secrets and variables → Actions → New repository secret')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY)

async function tg(msg) {
  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TG_CHAT, text: msg, parse_mode: 'HTML' })
  }).catch(() => {})
}

async function checkSiteHealth() {
  try {
    const r = await fetch(SITE_URL, { method: 'HEAD', signal: AbortSignal.timeout(10000) })
    if (!r.ok) await tg(`🚨 <b>SITE IS DOWN!</b>\nStatus: ${r.status}\n${SITE_URL}\n\nCustomers cannot access Elite Data!`)
    else console.log(`[Health] Site OK — ${r.status}`)
  } catch (err) {
    await tg(`🚨 <b>SITE IS DOWN!</b>\nError: ${err.message}\n${SITE_URL}`)
    console.error('[Health] Site down:', err.message)
  }
}

async function checkStuckOrders() {
  // Alert only — do NOT auto-deliver. Cron-job.org handles delivery with admin approval.
  const cutoff = new Date(Date.now() - 20 * 60 * 1000).toISOString()
  const { data: orders, error } = await sb
    .from('orders')
    .select('reference, phone, network, bundle_size, status, created_at')
    .in('status', ['pending', 'processing'])
    .lt('created_at', cutoff)
    .limit(10)

  if (error) { console.error('[Orders] DB error:', error.message); return }
  if (!orders?.length) { console.log('[Orders] No stuck orders'); return }

  console.log(`[Orders] Found ${orders.length} stuck order(s) — alerting only`)
  const lines = orders.map(o => {
    const age = Math.round((Date.now() - new Date(o.created_at).getTime()) / 60000)
    return `• ${o.network?.toUpperCase()} ${o.bundle_size} → ${o.phone} (${age} min, ${o.status})`
  }).join('\n')

  await tg(
    `⚠️ <b>${orders.length} order(s) stuck for 20+ min</b>\n\n${lines}\n\n` +
    `Cron-job.org will ask for your approval to send. Check Telegram.`
  )
}

async function sendDailySummary() {
  const hour = new Date().getUTCHours()
  if (hour !== 20) return  // 8 PM Ghana time (UTC+0)

  const today = new Date().toISOString().slice(0, 10)
  const { data: orders } = await sb
    .from('orders')
    .select('amount, status, agent_commission, admin_commission')
    .gte('created_at', today)

  const done = (orders || []).filter(o => o.status === 'completed')
  const totalRevenue = done.reduce((s, o) => s + parseFloat(o.amount || 0), 0)
  const adminProfit = done.reduce((s, o) => s + parseFloat(o.admin_commission || 0), 0)
  const agentPayout = done.reduce((s, o) => s + parseFloat(o.agent_commission || 0), 0)

  await tg(
    `📊 <b>Daily Summary — ${today}</b>\n\n` +
    `📦 Total orders: ${(orders || []).length} (${done.length} completed)\n` +
    `💵 Revenue: GH₵${totalRevenue.toFixed(2)}\n` +
    `🤝 Agent payouts: GH₵${agentPayout.toFixed(2)}\n` +
    `💰 <b>Your profit: GH₵${adminProfit.toFixed(2)}</b>`
  )
}

async function run() {
  console.log(`[Monitor] Starting — ${new Date().toISOString()}`)
  await Promise.all([checkSiteHealth(), checkStuckOrders(), sendDailySummary()])
  console.log('[Monitor] Done')
}

run().catch(err => { console.error('[Monitor] Fatal:', err); process.exit(1) })
