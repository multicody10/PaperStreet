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

## 2. Automatic Cloudflare deployment with GitHub Actions

Once set up, **every push or merged PR to `main` automatically tests, migrates D1, and deploys** the Activity and API to one Cloudflare Worker. You can also manually run **Actions → Deploy PaperStreet → Run workflow**. Pull requests only run checks and never deploy. No paid plan or always-on process is required.

### One-time configuration

1. **Create the D1 database** in your Cloudflare account under **Workers & Pages → D1** (name it `paperstreet`), or run `npx wrangler login` and `npx wrangler d1 create paperstreet` locally. Copy the resulting **database ID** (UUID). Do not create a new database for each deployment.
2. **Create a scoped Cloudflare API token** in [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens). Allow the account's **Workers Scripts: Edit** and **D1: Edit** permissions, scoped to the specific Cloudflare account. Obtain your **Account ID** from the Cloudflare dashboard. Keep the token private.
3. In [PaperStreet GitHub Actions secrets](https://github.com/multicody10/PaperStreet/settings/secrets/actions), create two repository **secrets**:
   - `CLOUDFLARE_API_TOKEN`: the scoped Cloudflare token.
   - `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account ID.
4. In [PaperStreet GitHub Actions variables](https://github.com/multicody10/PaperStreet/settings/variables/actions), create one repository **variable**:
   - `PAPERSTREET_D1_DATABASE_ID`: the D1 database UUID from step 1. This identifier is not a credential.
5. Merge this workflow into `main` (or choose **Run workflow**). The first deployment creates the `paperstreet` Worker, applies `migrations/0001_init.sql` to the remote D1 database, and prints the new `*.workers.dev` URL in the Actions logs. Later runs apply **only pending** migrations. A failed test or migration prevents deployment.
6. In **Cloudflare → Workers & Pages → paperstreet → Settings → Variables and Secrets**, add the following **Worker secrets**, then save/deploy the settings:
   - `DISCORD_CLIENT_ID`: your Discord Application ID.
   - `DISCORD_CLIENT_SECRET`: your Discord OAuth2 Client Secret.
   - `SESSION_SECRET`: a unique 64-character hexadecimal secret (`openssl rand -hex 32` in Git Bash).
7. Configure **Discord Developer Portal → Activities → URL Mappings** with `/` mapped to your deployed Worker hostname as described in section 1. Test launch from Discord.

**Security:** The GitHub token deploys the project and updates the database, but does **not** need your Discord credentials. Set Discord secrets on the **Cloudflare Worker**, not in GitHub or `wrangler.jsonc`. `PAPERSTREET_D1_DATABASE_ID` is substituted into the runner's temporary Wrangler configuration before build; the tracked placeholder is never committed as a real database ID. Deployment secrets are exposed only to the migration and deploy commands, not to dependency installation or tests. Do not separately connect a Cloudflare Workers Builds Git integration to the same Worker; otherwise two deployment systems could race.

### Optional manual deployment and development

If you prefer running Wrangler yourself, copy the D1 database ID into your local `wrangler.jsonc`, replacing the all-zero placeholder, then run `npm install --no-audit --no-fund && npm run db:remote && npm run deploy` after `npx wrangler login`. The GitHub Actions workflow does **not** require editing the tracked `wrangler.jsonc`.

For local development, copy `.dev.vars.example` to `.dev.vars`, fill in Discord credentials, and run:

```sh
npm install --no-audit --no-fund
npm run db:local
npm run dev
```

The local UI must be opened from a Discord Activity, not directly in a browser, because the Embedded App SDK requires Discord's iframe context. For local testing, make Vite accessible using `cloudflared tunnel --url http://localhost:5173` and temporarily map `/` to the tunnel hostname in the Discord Developer Portal. The OAuth2 Client Secret remains on the Worker; never expose it through a `VITE_` variable.

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

CI groups PR checks in a single job with concurrency control. A separate deployment workflow runs only on pushes to `main` or manual dispatch, verifies all checks, applies remote D1 migrations, and deploys with secrets supplied by GitHub Actions. Deployment requires the one-time Cloudflare and GitHub configuration in section 2.

## Future roadmap

Dedicated Discord slash commands, per guild competitions with verified guild membership, market hours and more realistic execution models, seasonal tournaments, achievements, user watchlists, historical charts, and richer market data. This first release intentionally ships the core Activity before adding Gateway events or features that would stress Cloudflare's free plan.