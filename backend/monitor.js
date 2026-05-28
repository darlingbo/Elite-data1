/**
 * Standalone monitor — runs in GitHub Actions every 5 min.
 * Checks site health, syncs orders with Inventor, and sends Telegram alerts.
 * Uses Supabase REST API directly — no WebSocket/realtime dependency.
 */

const SUPABASE_URL  = process.env.SUPABASE_URL
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_KEY
const TG_TOKEN      = process.env.TELEGRAM_BOT_TOKEN
const TG_CHAT       = process.env.TELEGRAM_CHAT_ID
const CRON_SECRET   = process.env.CRON_SECRET   // optional — used to call site's sync API
const SITE_URL      = 'https://www.elitedata1.com'

const missing = [
  !SUPABASE_URL  && 'SUPABASE_URL',
  !SERVICE_KEY   && 'SUPABASE_SERVICE_KEY',
  !TG_TOKEN      && 'TELEGRAM_BOT_TOKEN',
  !TG_CHAT       && 'TELEGRAM_CHAT_ID',
].filter(Boolean)

if (missing.length) {
  console.error('Missing GitHub Actions secrets:', missing.join(', '))
  process.exit(1)
}

// ─── Supabase REST helper ─────────────────────────────────────────────────────
async function db(table, query = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`DB error ${res.status}: ${await res.text()}`)
  return res.json()
}

// ─── Telegram ─────────────────────────────────────────────────────────────────
async function tg(msg) {
  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TG_CHAT, text: msg, parse_mode: 'HTML' })
  }).catch(() => {})
}

// ─── Checks ───────────────────────────────────────────────────────────────────
async function checkSiteHealth() {
  try {
    const r = await fetch(SITE_URL, { method: 'HEAD', signal: AbortSignal.timeout(10000) })
    if (!r.ok) await tg(`🚨 <b>SITE IS DOWN!</b>\nStatus: ${r.status}\n${SITE_URL}`)
    else console.log(`[Health] Site OK — ${r.status}`)
  } catch (err) {
    await tg(`🚨 <b>SITE IS DOWN!</b>\nError: ${err.message}\n${SITE_URL}`)
    console.error('[Health] Site down:', err.message)
  }
}

// ─── Sync orders with Inventor ────────────────────────────────────────────────
// Calls the site's /api/cron/sync-orders endpoint which:
//   1. Checks Inventor for every pending/processing order
//   2. Marks completed/failed orders automatically
//   3. Only sends a YES/NO Telegram alert for orders Inventor still can't resolve
async function syncOrders() {
  try {
    const headers = {}
    if (CRON_SECRET) headers['Authorization'] = `Bearer ${CRON_SECRET}`

    const res = await fetch(`${SITE_URL}/api/cron/sync-orders`, {
      headers,
      signal: AbortSignal.timeout(55000), // give it almost the full 1-min window
    })

    if (!res.ok) {
      console.error(`[Sync] HTTP ${res.status}`)
      return
    }

    const data = await res.json()
    console.log(`[Sync] checked=${data.checked ?? 0} updated=${data.updated ?? 0} awaiting_approval=${data.retried ?? 0}`)
  } catch (err) {
    console.error('[Sync] Error:', err.message)
  }
}

// ─── Daily summary ────────────────────────────────────────────────────────────
async function sendDailySummary() {
  const hour = new Date().getUTCHours()
  if (hour !== 20) return

  try {
    const today = new Date().toISOString().slice(0, 10)
    const orders = await db('orders',
      `select=amount,status,agent_commission,admin_commission&created_at=gte.${today}`
    )

    const done = orders.filter(o => o.status === 'completed')
    const totalRevenue = done.reduce((s, o) => s + parseFloat(o.amount || 0), 0)
    const adminProfit  = done.reduce((s, o) => s + parseFloat(o.admin_commission || 0), 0)
    const agentPayout  = done.reduce((s, o) => s + parseFloat(o.agent_commission || 0), 0)

    await tg(
      `📊 <b>Daily Summary — ${today}</b>\n\n` +
      `📦 Total orders: ${orders.length} (${done.length} completed)\n` +
      `💵 Revenue: GH₵${totalRevenue.toFixed(2)}\n` +
      `🤝 Agent payouts: GH₵${agentPayout.toFixed(2)}\n` +
      `💰 <b>Your profit: GH₵${adminProfit.toFixed(2)}</b>`
    )
  } catch (err) {
    console.error('[Summary] Error:', err.message)
  }
}

async function run() {
  console.log(`[Monitor] Starting — ${new Date().toISOString()}`)
  await Promise.all([checkSiteHealth(), syncOrders(), sendDailySummary()])
  console.log('[Monitor] Done')
}

run().catch(err => { console.error('[Monitor] Fatal:', err); process.exit(1) })
