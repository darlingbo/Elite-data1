/**
 * Standalone monitor — runs in GitHub Actions every 5 min.
 * Checks stuck orders, site health, and sends Telegram alerts.
 */
import { createClient } from '@supabase/supabase-js'
import fetch from 'node-fetch'

const SUPABASE_URL  = process.env.SUPABASE_URL
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_KEY
const TG_TOKEN      = process.env.TELEGRAM_BOT_TOKEN
const TG_CHAT       = process.env.TELEGRAM_CHAT_ID
const INVENTOR_KEY  = process.env.INVENTOR_API_KEY
const SITE_URL      = 'https://elite-data1.vercel.app'

const missing = [
  !SUPABASE_URL    && 'SUPABASE_URL',
  !SERVICE_KEY     && 'SUPABASE_SERVICE_KEY',
  !TG_TOKEN        && 'TELEGRAM_BOT_TOKEN',
  !TG_CHAT         && 'TELEGRAM_CHAT_ID',
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

async function deliverData(network, phone, sizeGB, ref) {
  const netMap = { MTN: 'MTN', TELECEL: 'TELECEL', AIRTELTIGO: 'AT ISHARE' }
  const net = netMap[network?.toUpperCase()] || network
  const res = await fetch('https://agent.inventor-datahub.com/api/developer/purchase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${INVENTOR_KEY}` },
    body: JSON.stringify({ network: net, Phone: phone, Datasize: Number(sizeGB), reference: ref }),
    signal: AbortSignal.timeout(30000)
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`)
  return data
}

async function checkStuckOrders() {
  if (!INVENTOR_KEY) {
    console.log('[Orders] Skipping — INVENTOR_API_KEY not set')
    return
  }

  // Orders stuck in PENDING or FAILED for more than 4 minutes
  const cutoff = new Date(Date.now() - 4 * 60 * 1000).toISOString()
  let { data: orders, error } = await sb
    .from('orders')
    .select('reference, phone, network, bundle_size, bundle_size_gb, amount, agent_id, agent_commission, status, created_at')
    .in('status', ['pending', 'failed'])
    .lt('created_at', cutoff)
    .limit(10)

  // Fall back if newer columns don't exist yet
  if (error) {
    const { data: basic, error: err2 } = await sb
      .from('orders')
      .select('reference, phone, network, bundle_size, amount, agent_id, status, created_at')
      .in('status', ['pending', 'failed'])
      .lt('created_at', cutoff)
      .limit(10)
    if (err2) { console.error('[Orders] DB error:', err2.message); return }
    orders = (basic ?? []).map(o => ({ ...o, bundle_size_gb: null, agent_commission: null }))
    error = null
  }

  if (error) { console.error('[Orders] DB error:', error.message); return }
  if (!orders?.length) { console.log('[Orders] No stuck orders'); return }

  console.log(`[Orders] Found ${orders.length} stuck order(s)`)
  let fixed = 0, failed = 0

  for (const o of orders) {
    const sizeGb = o.bundle_size_gb ?? (() => {
      const m = (o.bundle_size ?? '').match(/(\d+(?:\.\d+)?)\s*gb/i)
      return m ? parseFloat(m[1]) : null
    })()

    if (!o.phone || !o.network || !sizeGb) {
      console.log(`[Orders] Skipping ${o.reference} — missing phone/network/size`)
      continue
    }
    try {
      const ref = `ED_FIX_${Date.now()}_${o.reference.slice(-6)}`
      await deliverData(o.network, o.phone, sizeGb, ref)
      await sb.from('orders').update({ status: 'completed' }).eq('reference', o.reference)

      // Credit agent commission if applicable
      if (o.agent_id && o.agent_commission) {
        await sb.rpc('increment_agent_stats', {
          p_agent_id: o.agent_id,
          p_commission: parseFloat(o.agent_commission),
          p_revenue: parseFloat(o.amount)
        }).maybeSingle()
      }

      fixed++
      console.log(`[Orders] Fixed: ${o.phone} ${o.network} ${o.bundle_size_gb}GB`)
    } catch (err) {
      await sb.from('orders').update({ status: 'failed' }).eq('reference', o.reference)
      failed++
      console.log(`[Orders] Failed to fix ${o.reference}: ${err.message}`)
    }
  }

  if (fixed > 0) {
    await tg(`✅ <b>Auto-fixed ${fixed} stuck order(s)</b>${failed > 0 ? `\n❌ ${failed} could not be fixed` : ''}`)
  }
  if (failed > 0 && fixed === 0) {
    await tg(`⚠️ <b>${failed} order(s) still stuck after retry</b>\nManual delivery may be needed. Check admin panel.`)
  }
}

async function sendDailySummary() {
  const hour = new Date().getUTCHours()
  if (hour !== 20) return  // Send at 8 PM Ghana time (UTC+0)

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
