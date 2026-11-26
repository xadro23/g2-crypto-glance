// G2 Crypto Glance — alert backend (zero deps, Node stdlib)
// Polls CoinGecko every 60s, evaluates alert rules, pushes to Telegram.
import http from 'node:http'
import fs from 'node:fs'

const PORT = 8787
const STATE = new URL('./state.json', import.meta.url).pathname
const TELEGRAM_BOT_TOKEN = process.env.TG_BOT_TOKEN || ''
const TELEGRAM_CHAT_ID = process.env.TG_CHAT_ID || ''

const ASSETS = { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana' }

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')) } catch { return { alerts: [], fired: {} } }
}
function saveState(s) { fs.writeFileSync(STATE, JSON.stringify(s, null, 2)) }
let state = loadState()

async function tgSend(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) { console.log('[tg] disabled, would send:', text); return }
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
    })
  } catch (e) { console.log('[tg] send failed', e) }
}

async function pollPrices() {
  const ids = Object.values(ASSETS).join(',')
  try {
    const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`)
    const j = await r.json()
    const px = {}
    for (const [sym, id] of Object.entries(ASSETS)) if (j[id]) px[sym] = j[id].usd
    state.lastPrices = px
    for (const a of state.alerts) {
      const p = px[a.asset]
      if (p == null) continue
      const hit = a.op === '>=' ? p >= a.level : p <= a.level
      const key = `${a.asset}${a.op}${a.level}`
      if (hit && !state.fired[key]) {
        state.fired[key] = Date.now()
        const msg = `🚨 G2 Crypto Glance: ${a.asset} ${a.op === '>=' ? 'crossed above' : 'dropped below'} $${a.level} (now $${p})`
        await tgSend(msg)
        a.msg = msg
        console.log('[alert]', msg)
      } else if (!hit) {
        delete state.fired[key]
      }
    }
    saveState(state)
    console.log('[poll]', JSON.stringify(px))
  } catch (e) { console.log('[poll] failed', e) }
}
setInterval(pollPrices, 60000)
pollPrices()

const server = http.createServer((req, res) => {
  res.setHeader('access-control-allow-origin', '*')
  res.setHeader('content-type', 'application/json')
  const url = new URL(req.url, `http://x`)
  if (url.pathname === '/alerts') {
    res.end(JSON.stringify(state.alerts.filter(a => a.msg ? true : true).map(a => ({ asset: a.asset, op: a.op, level: a.level, msg: a.msg || '' }))))
  } else if (url.pathname === '/prices') {
    res.end(JSON.stringify(state.lastPrices || {}))
  } else if (url.pathname === '/set' && req.method === 'POST') {
    // body: {"asset":"BTC","op":">=","level":100000}
    let body = ''
    req.on('data', c => body += c)
    req.on('end', () => {
      try {
        const a = JSON.parse(body)
        if (!ASSETS[a.asset] || !['>=', '<='].includes(a.op) || typeof a.level !== 'number') {
          res.statusCode = 400; res.end('{"error":"bad request"}'); return
        }
        state.alerts.push(a); saveState(state)
        res.end('{"ok":true}')
      } catch { res.statusCode = 400; res.end('{"error":"bad json"}') }
    })
  } else {
    res.statusCode = 404; res.end('{"error":"not found"}')
  }
})
server.listen(PORT, () => console.log(`alert backend on :${PORT}`))
