# Founders’ Café · Cloudflare 24/7 Live Mood Edition

A zero-cost ($0/month on Cloudflare Workers Free Plan), 24/7 live pixel mood café for builders — no Mac needs to stay online, no random Quick Tunnel URLs, and zero external dependencies.

## What's Inside

- `wrangler.jsonc` — Cloudflare Workers + SQLite-backed Durable Objects (`CafeRoom`) + static assets config.
- `src/index.js` — Edge WebSocket router + `CafeRoom` Durable Object using WebSocket Hibernation (`ping`/`pong` auto-response, SQLite global counters & moments, IP-based anti-abuse seat/socket caps).
- `public/scene.js` — 60fps pixel café renderer with 5 animated moods (🔥 grinding flames, 👻 floating ghost, 🐟 wooden fish mallet + `+1 NO BUGS`, ☕ steaming mug, 🚀 shipped stars), parabolic flying coffee cups, café-wide fireworks, SOS beacon, and 1-click 1200×675 PNG postcard export.
- `public/sfx.js` — Synthesized Web Audio sound effects (woodblock, counter bell, fireworks, coffee clink, optional rain ambience).
- `public/app.js`, `public/index.html`, `public/style.css` — Bilingual (`EN` default / `中文`) instant-seat client.

## Run Locally

```sh
cd worker
wrangler dev --port 8787 --local
```

Open `http://localhost:8787` (open 2–3 tabs to test flying coffee cups and café-wide fireworks!).

## Deploy to Cloudflare (0 元 · 24/7 Live)

```sh
cd worker
wrangler deploy
```

This deploys directly to your fixed origin (`https://founders-cafe.xiongmaopan7.workers.dev/`) with SQLite-backed Durable Objects on the Workers Free Plan.
