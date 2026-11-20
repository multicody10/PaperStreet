# PaperStreet

**PaperStreet is a Discord Activity for stock paper trading.** Every player starts with **$10,000 in virtual cash**, builds a portfolio, and competes on a global equity leaderboard. This first version runs as an embedded Discord Activity; the standalone slash command bot can be added later without operating a persistent Discord Gateway connection.

The entire stack runs on **Cloudflare Workers Free**: a single Worker for the API, Worker Static Assets for the React interface, and a D1 SQLite database. No always-on servers, queues, paid Workers features, or background jobs are required.

## Features

- Native Discord Activity authentication using the Embedded App SDK and Discord OAuth2.
- One click market buys and sells of whole shares from a deliberately limited set of 12 US stocks/ETFs.
- Server authoritative execution, signed expiring sessions, duplicate order protection, and atomic SQLite balances.
- Portfolio equity, weighted cost basis, unrealized profit/loss, trade history, and global leaderboard ranked by portfolio equity.
- Viewport locked desktop trading dashboard with scoped panel scrolling inside Discord, responsive compact navigation, and accessible stock/trade controls.
- Twelve hour price charts built from actual provider quote observations recorded in D1. Charts stay empty until two or more genuine observations exist.
- Mobile responsive dark interface inside Discord, without external browser data APIs.
- Stock quote caching in D1 with cross-request refresh leases, 12 supported symbols, and frontend refreshes every two minutes while visible.
- **Real market quotes only:** Finnhub last-trade prices and previous closes. No fictional quotes, no simulated market mode, and no invented chart data.

> This is a virtual-money game, not a brokerage. All prices originate from the market data provider, but quotes may be delayed and execution is not exchange-accurate. The game does not model fees, taxes, dividends, splits or corporate actions. Trades are disabled outside the US stock market's regular session, during major US market holidays, when data is stale, and when a provider is unavailable. Historical simulated fills are preserved for audit when migrating an existing installation.

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
6. **Before activating the real market** obtain a quote provider key and written approval to display/redistribute its market data to your Discord players (details in section 3). In **Cloudflare → Workers & Pages → paperstreet → Settings → Variables and Secrets**, add the following **Worker secrets**, then save/deploy the settings:
   - `DISCORD_CLIENT_ID`: your Discord Application ID.
   - `DISCORD_CLIENT_SECRET`: your Discord OAuth2 Client Secret.
   - `SESSION_SECRET`: a unique 64-character hexadecimal secret (`openssl rand -hex 32` in Git Bash).
   - `FINNHUB_API_KEY`: an authorized Finnhub API key, stored as **Secret**. Without this key PaperStreet displays no prices and disables trading.
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

## 3. Real stock market data (required, no simulated fallback)

**All PaperStreet prices come from real US stock market quotes.** The backend fetches Finnhub `GET /api/v1/quote` with a private `FINNHUB_API_KEY`; it validates the quote price, previous close, and provider timestamp before caching anything. No client can supply execution prices, and the frontend never receives the provider key. When data is missing or invalid, the market displays an error instead of generating a fictional quote.

**Licensing:** [Finnhub's Terms of Service](https://finnhub.io/terms-of-service), under *Redistribution Rights and Personal Use*, expressly forbid sharing or redistributing data (including derived results) with third parties without **written permission**. Its standard website plans are personal-use-only. **An ordinary free API key does not grant rights to publish stock quotes to your Discord Activity users.** Obtain written permission or replace the provider with a service whose license explicitly permits the game's public data display before inviting players. Keep the Activity restricted to authorized testing until resolved. PaperStreet has no paid-tier dependency, but exchange redistribution rights may not be available at $0.

### Configure market data

1. Obtain a Finnhub key and suitable redistribution permissions for this usage. Store the key in **Cloudflare → Workers & Pages → paperstreet → Settings → Variables and Secrets → Add → Secret** as `FINNHUB_API_KEY`, or from Git Bash run `npx wrangler secret put FINNHUB_API_KEY` in a production-bound project.
2. Run the migration `0002_real_market.sql` (the GitHub Actions deployment applies pending migrations automatically) and deploy the Worker.
3. Verify `/api/config` reports `dataConfigured: true` and the authenticated `/api/market` endpoint returns quotes with `source: "finnhub"`. Do not share keys or bearer tokens in public logs.
4. At first launch real price history is empty. The chart builds from actual provider quote observations over time. No paid candles endpoint or fabricated history is used.

### Quote freshness and request limits

- The Worker caches successful responses in D1 for 5 minutes during regular hours and 1 hour while the market is closed. Shared D1 leases prevent concurrent viewers from exhausting upstream rate limits with simultaneous refreshes. In-memory request coalescing also reduces duplication inside a Worker instance.
- The last trade timestamp reported by Finnhub is retained, and quotes older than 20 minutes while the market is open are marked stale. **Stale prices may be displayed for context but are never executable.** Provider errors return stale labeled data or a temporary error, never simulated prices.
- The server limits trading to regular NYSE weekday hours (9:30 AM–4:00 PM Eastern), handles common US stock exchange holidays and typical 1 PM early closes, and rejects order execution when the market is closed. Exchange calendar exceptions may require further maintenance.
- Quotes can be delayed, incomplete, or limited to a specific exchange by the provider. A data API's market access and licensing, not the game, determine how recent and complete prices are.
- Existing virtual holdings/trades are preserved during migration and are revalued using actual quotes. Old simulated trades are *not* retroactively rewritten, so reset competition rankings separately before launching a fair real-price season.

## Resource design and constraints

- Single Worker + static SPA, no separate Pages project or always-running bot process.
- On demand D1 reads; small indexed tables, shared quote cache, refresh leases, and indexed genuine price history observations. No scheduled polling or paid background queues.
- `GET /api/market` is scoped to a signed account; `POST /api/trade` obtains the execution quote itself rather than accepting a client supplied price. The client supplied expected price is only a slippage guard.
- Only the 12 preselected symbols are tradeable. Full market search and instant quote streaming would exceed the intended zero cost design.
- Free tiers have enforceable limits. If player volume grows, additional HTTP request rate limiting, data rights and provider access may be necessary.

## API

| Route | Access | Purpose |
| --- | --- | --- |
| `GET /api/health` | Public | Health check |
| `GET /api/config` | Public | Discord application ID, real provider and readiness |
| `POST /api/auth` | OAuth code | Exchange with Discord; issue signed game session |
| `GET /api/market` | Bearer session | Market quotes |
| `GET /api/chart?symbol=AAPL` | Bearer session | Observed real quote history (no fabricated backfill) |
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

### GitHub Actions runtime and warning triage

Both workflows pin official `actions/checkout` and `actions/setup-node` to reviewed Node 24-compatible commit SHAs. These actions run under Node 24, while the application build still uses Node 22 via `node-version: 22`. The workflows use a minimal read-only `GITHUB_TOKEN` and do not persist checkout credentials; automatic package manager caching is disabled until a reviewed lockfile is committed.

The npm notice `node-domexception@1.0.0: Use your platform's native DOMException instead` is an **upstream transitive dependency** warning, not a runtime error. Do not hide it by reducing npm log output or force a potentially incompatible override. To determine which parent dependency needs upgrading, run `npm explain node-domexception` after `npm install`, then update the owning dependency after compatibility testing.

Wrangler can report a **local vs. Cloudflare Dashboard configuration difference** on deploy. Review the exact diff rather than suppressing it: as of the November 20 deployment, the differences were generated static asset metadata and optional D1 `database_name`/`migrations_dir` fields. Keep Wrangler configuration as the source of truth; reconcile any future destructive dashboard differences before merging.

## Future roadmap

Dedicated Discord slash commands, per guild competitions with verified guild membership, more realistic exchange execution and corporate action accounting, seasonal tournaments, achievements, watchlists, richer historical charts and broader symbol support. This first release intentionally ships the core Activity before adding Gateway events or features that would stress Cloudflare's free plan.
