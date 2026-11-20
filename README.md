# PaperStreet

**PaperStreet is a Discord Activity for stock paper trading.** Every player starts with **$10,000 in virtual cash**, builds a portfolio, and competes on a global equity leaderboard. This first version runs as an embedded Discord Activity; the standalone slash command bot can be added later without operating a persistent Discord Gateway connection.

The entire stack runs on **Cloudflare Workers Free**: a single Worker for the API, Worker Static Assets for the React interface, and a D1 SQLite database. No always-on servers, queues, paid Workers features, or background jobs are required.

## Features

- Native Discord Activity authentication using the Embedded App SDK and Discord OAuth2.
- One click market buys and sells of whole shares from a deliberately limited set of 12 US stocks/ETFs.
- Server authoritative execution, signed expiring sessions, duplicate order protection, and atomic SQLite balances.
- Portfolio equity, weighted cost basis, unrealized profit/loss, trade history, and global leaderboard ranked by portfolio equity.
- Mobile responsive dark interface inside Discord, without external browser data APIs.
- Stock quote caching in D1, a maximum of 12 supported symbols, and only one frontend market refresh every two minutes while the Activity is visible.
- **Simulated prices** by default, with an optional Finnhub quote integration. These are never presented interchangeably.

> This is a game, not brokerage software. It never trades real securities or handles real money. In simulated mode, all prices are entirely fictional. In Finnhub mode, prices are the provider's last available quotes and may be delayed, stale or unavailable. This initial release does not model market hours, fees, taxes, dividends, splits or corporate actions, so results should not be treated as a realistic financial simulation.

## 1. Discord Developer Portal

1. Create a Discord application at <https://discord.com/developers/applications> and note its **Application ID** and **OAuth2 Client Secret**. Enabling Activities creates a default **Launch** entry point, so no interaction webhook or Gateway session is needed for this release.
2. Under **OAuth2**, add `https://127.0.0.1` as a redirect URI. The Embedded App SDK manages the Activity's authorize redirect automatically.
3. Under **Activities → Settings**, enable Activities.
4. Under **Activities → URL Mappings**, configure `/` to the hostname of your deployed Worker, e.g. `paperstreet.YOUR_SUBDOMAIN.workers.dev` (hostname only, no `https://`). The browser sends all `/api/*` calls through the same mapped origin. **No other mappings are necessary.**
5. Configure application installation settings so it can be launched using the Discord App Launcher and test it from your server. You do not need to configure a Discord interactions endpoint for the automatic Launch handler.

## 2. Cloudflare D1 and deployment

These commands are for Git Bash, macOS, or any shell with Node.js 22+ installed. Cloudflare's free plan is sufficient for an initial small player population.

```sh
npm install --no-audit --no-fund
npx wrangler login
npx wrangler d1 create paperstreet
```

Copy the printed `database_id` into `wrangler.jsonc`, replacing the all-zero placeholder. Then apply the schema **before deploying**:

```sh
npm run db:remote
```

Generate a session signing secret, set your OAuth credentials, and deploy:

```sh
openssl rand -hex 32
npx wrangler secret put DISCORD_CLIENT_ID
npx wrangler secret put DISCORD_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET
npm run deploy
```

Paste the generated secret into `SESSION_SECRET` and **never commit it**. Use your actual Discord Application ID and OAuth2 Client Secret for the other prompts. Copy the `*.workers.dev` deployment hostname into the Discord Activity URL Mapping above.

For development, copy `.dev.vars.example` to `.dev.vars`, replace all placeholders, and run:

```sh
npm run db:local
npm run dev
```

The local UI must be opened from a Discord Activity, not directly in a browser, because the Embedded App SDK requires Discord's iframe context. For local Discord testing, make the local Vite server reachable via `cloudflared tunnel --url http://localhost:5173` and temporarily map `/` to the tunnel hostname in the Developer Portal. The OAuth2 Client Secret remains on the Worker; it must never be exposed through a `VITE_` variable.

## 3. Real quote mode (optional)

The default `MARKET_MODE` is `simulated`, which needs no third party API key. For the optional Finnhub integration:

1. Obtain a free Finnhub API key, and check that the provider's free plan and licensing permit your intended audience and redistribution of prices. A publicly playable game can exceed personal use terms.
2. Run `npx wrangler secret put FINNHUB_API_KEY`.
3. Change `MARKET_MODE` in `wrangler.jsonc` from `simulated` to `finnhub` and redeploy.

Quotes are fetched **only by the backend** and cached for 90 seconds in D1. A failed provider request can show an old quote with a stale label, but **trades using stale prices are rejected**, and the leaderboard pauses until all quotes are fresh. This guards against stale price arbitrage and protects the API key. Market quotes are not continuously streamed or guaranteed real time. Switching modes does not reset holdings, and equity will be revalued using the new mode's prices; choose a mode before inviting players.

## Resource design and constraints

- Single Worker + static SPA, no separate Pages project or always-running bot process.
- On demand D1 reads; small indexed tables and one shared quote cache. The leaderboard calculates global equity in SQL. No scheduled polling or price history writes.
- `GET /api/market` is scoped to a signed account; `POST /api/trade` obtains the execution quote itself rather than accepting a client supplied price. The client supplied expected price is only a slippage guard.
- Only the 12 preselected symbols are tradeable. Full market search and instant quote streaming would exceed the intended zero cost design.
- Free tiers have enforceable daily limits. If player volume becomes large, throttling, alternative price licensing and a carefully designed price update strategy will be needed.

## API

| Route | Access | Purpose |
| --- | --- | --- |
| `GET /api/health` | Public | Health check |
| `GET /api/config` | Public | Discord application ID and market mode |
| `POST /api/auth` | OAuth code | Exchange with Discord; issue signed game session |
| `GET /api/market` | Bearer session | Market quotes |
| `GET /api/portfolio` | Bearer session | Account equity and positions |
| `POST /api/trade` | Bearer session | Execute idempotent buy/sell order |
| `GET /api/leaderboard` | Bearer session | Top 25 by current equity |
| `GET /api/history` | Bearer session | Last 30 trades |

Sessions live only in browser memory and expire after one hour. Refreshing or reopening the Activity establishes a fresh Discord OAuth session. No Discord access tokens are persisted in D1.

## Checks

```sh
npm test
python3 tests/database_test.py
npm run build
```

CI groups all checks in a single job with concurrency control and runs only when a PR is opened/updated or manually requested. Deployment is intentionally **manual** so changes cannot accidentally publish a game requiring secrets or a provisioned D1 database.

## Future roadmap

Dedicated Discord slash commands, per guild competitions with verified guild membership, market hours and more realistic execution models, seasonal tournaments, achievements, user watchlists, historical charts, and richer market data. This first release intentionally ships the core Activity before adding Gateway events or features that would stress Cloudflare's free plan.
