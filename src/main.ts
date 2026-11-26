import {
  waitForEvenAppBridge,
  TextContainerProperty,
  CreateStartUpPageContainer,
  TextContainerUpgrade,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk'

const bridge = await waitForEvenAppBridge()

const ASSETS = ['bitcoin', 'ethereum', 'solana'] as const
const SYMBOLS: Record<string, string> = { bitcoin: 'BTC', ethereum: 'ETH', solana: 'SOL' }

type PriceData = {
  prices: Record<string, { usd: number; ch24: number }>
  alerts: { asset: string; op: string; level: number; msg: string }[]
  fetchedAt: number
  error?: string
}

const BACKEND = 'http://localhost:8787'

async function fetchPrices(): Promise<PriceData | null> {
  try {
    const ids = ASSETS.join(',')
    const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`)
    const j: any = await r.json()
    const prices: PriceData['prices'] = {}
    for (const id of ASSETS) {
      if (j[id]) prices[id] = { usd: j[id].usd, ch24: j[id].usd_24h_change ?? 0 }
    }
    let alerts: PriceData['alerts'] = []
    try {
      const ar = await fetch(`${BACKEND}/alerts`)
      if (ar.ok) alerts = await ar.json()
    } catch { /* backend optional */ }
    return { prices, alerts, fetchedAt: Date.now() }
  } catch (e) {
    console.log('fetch failed', e)
    return null
  }
}

function fmt(n: number): string {
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (n >= 1) return n.toFixed(2)
  return n.toFixed(4)
}

function renderPage(d: PriceData | null, page: number): string {
  if (!d) return 'G2 CRYPTO GLANCE\n\nConnecting...\n(check network)\n\nTap: retry'
  const keys = ASSETS.filter(a => d.prices[a])
  if (!keys.length) return 'G2 CRYPTO GLANCE\n\nNo price data\nTap: retry'
  const lines: string[] = []
  for (const a of keys) {
    const p = d.prices[a]
    const sign = p.ch24 >= 0 ? '+' : ''
    lines.push(`${SYMBOLS[a]} $${fmt(p.usd)}  ${sign}${p.ch24.toFixed(1)}%`)
  }
  let content = '== G2 CRYPTO GLANCE ==\n' + lines.join('\n')
  if (page === 1) {
    if (d.alerts.length) {
      content += '\n\n-- ALERTS --\n' + d.alerts.slice(0, 3).map(a => `${a.asset} ${a.op}${a.level}`).join('\n')
    } else {
      content += '\n\n-- ALERTS --\nnone active\nset via Telegram bot'
    }
  } else {
    content += '\n\nTap: alerts page\nDbl-tap: exit'
  }
  return content
}

let page = 0
let data = await fetchPrices()

const mainText = new TextContainerProperty({
  xPosition: 0,
  yPosition: 0,
  width: 576,
  height: 288,
  borderWidth: 0,
  borderColor: 5,
  paddingLength: 6,
  containerID: 1,
  containerName: 'main',
  content: renderPage(data, page),
  isEventCapture: 1,
})

const result = await bridge.createStartUpPageContainer(
  new CreateStartUpPageContainer({
    containerTotalNum: 1,
    textObject: [mainText],
  }),
)
console.log('Page created:', result === 0 ? 'success' : `failed (${result})`)

// Reads the event type out of one envelope.
// CLICK_EVENT is 0 and protobuf omits zero-value fields on the wire, so the
// default has to be resolved INSIDE the envelope check — see template docs.
function eventTypeOf(envelope?: { eventType?: OsEventTypeList }): OsEventTypeList | null {
  if (!envelope) return null
  return envelope.eventType ?? OsEventTypeList.CLICK_EVENT
}

// Refresh prices every 60s
setInterval(async () => {
  data = await fetchPrices()
  bridge.textContainerUpgrade(
    new TextContainerUpgrade({
      containerID: 1,
      containerName: 'main',
      content: renderPage(data, page),
    }),
  )
}, 60000)

// Event routing: taps/lifecycle via event.sysEvent, scroll via event.textEvent.
// Double-tap → shutDownPageContainer(1) checked at root level so users can
// always exit; DOUBLE_CLICK before CLICK.
const unsubscribe = bridge.onEvenHubEvent(event => {
  const sysType = eventTypeOf(event.sysEvent)
  const textType = eventTypeOf(event.textEvent)

  if (sysType === OsEventTypeList.DOUBLE_CLICK_EVENT || textType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
    bridge.shutDownPageContainer(1)
    return
  }

  if (sysType === OsEventTypeList.CLICK_EVENT || textType === OsEventTypeList.CLICK_EVENT) {
    page = page === 0 ? 1 : 0
    bridge.textContainerUpgrade(
      new TextContainerUpgrade({
        containerID: 1,
        containerName: 'main',
        content: renderPage(data, page),
      }),
    )
    return
  }

  if (sysType === OsEventTypeList.SYSTEM_EXIT_EVENT || sysType === OsEventTypeList.ABNORMAL_EXIT_EVENT) {
    unsubscribe()
  }
})
