# G2 Crypto Glance — Even Realities Hackathon Entry

**Track:** Crypto & DeFi · **Also targets:** Best Telegram Integration ($1,000)

A glanceable crypto watchlist for Even G2 smart glasses: BTC/ETH/SOL prices, 24h
change, and price alerts delivered **directly to the glasses display**, with
notifications mirrored to **Telegram** so users never miss a move — even when
the glasses are off.

## What it does

- **Glance page** (576×288 green monochrome): live prices for BTC, ETH, SOL via
  CoinGecko public API (CORS-friendly, no key, free tier) — tap to cycle assets,
  scroll pages, double-tap to exit.
- **Alert engine**: a tiny VPS backend polls prices every 60s, evaluates
  user-configured thresholds, and pushes alerts to:
  1. the glasses (fetched by the app on each refresh), and
  2. a Telegram chat via Bot API — the "never miss it" channel.
- **Telegram integration**: alerts arrive as native Telegram messages with the
  asset, trigger level and current price; users set alerts from chat too.

## Architecture

```
Even G2 glasses ←BLE→ Even App (WebView) ←HTTPS→ alert-backend (/server)
                                        ↘ Telegram Bot API
```

- Frontend: Vite + TypeScript + `@evenrealities/even_hub_sdk`
- Backend: Node stdlib HTTP server (zero dependencies), JSON state
- Simulator-first development: all UI verified on `evenhub-simulator`

## Run

```bash
npm install
npm run dev            # vite dev server on :5173
npm run simulate       # evenhub-simulator http://localhost:5173
node server/server.mjs # alert backend on :8787
```

## Honest limitations

- Built and verified on the Even Hub simulator only — no G2 hardware available
  during the hackathon; BLE timing/perf untested on device.
- CoinGecko free tier rate limits apply (we batch 3 assets into one request).
- Demo video: simulator screen recording.
