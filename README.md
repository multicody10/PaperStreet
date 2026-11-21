# PaperStreet

**PaperStreet is a Discord Activity for stock paper trading.** Each new player starts with **$1,000 in virtual cash**, builds a portfolio, and competes on a global equity leaderboard. It runs as an embedded Discord Activity with a dedicated `/portfolio` Discord slash command, all on Cloudflare Workers Free without a Gateway process.

The entire stack runs on **Cloudflare Workers Free**: a single Worker for the API, Worker Static Assets for the React interface, and a D1 SQLite database. No always-on servers, queues, paid Workers features, or background jobs are required.

## Features

- Native Discord Activity authentication using the Embedded App SDK and Discord OAuth2.
- **`/portfolio` slash command:** a polished Discord embed containing the invoking trader's equity, cash, invested value, all-time return and holdings, valued using genuine cached Finnhub prices. It never accepts another user's ID and does not change Discord's Activity Launch command.
- One click market buys and sells of whole shares from a deliberately limited set of 12 US stocks/ETFs.
- Server authoritative execution, signed expiring sessions, duplicate order protection, and atomic SQLite balances.
- Portfolio equity, weighted cost basis, unrealized profit/loss, trade history, and global leaderboard ranked by portfolio equity.
- Separate **Dashboard**, **Trade**, and **individual stock pages**, all responsive and viewport locked inside Discord. Dashboard displays portfolio value, positions, completed orders, leaderboard, and a read-only market snapshot; it contains no order ticket or trade execution controls.
- The Trade page contains searchable Finnhub stock quotes, market breadth, and largest movers. Selecting a symbol opens its dedicated stock page with verified quote details, observed history and buy/sell ticket. Trading remains available 24/7 at verified provider prices.
- Interactive candlesticks across **1D, 1W, 1M, 3M, 1Y, All**. Hover, touch, or focus the chart and use the arrow keys to inspect open, high, low, and close. The Trade list shows where each last price sits within its reported session range.
- Mobile responsive dark interface inside Discord, without external browser data APIs.
- Cloudflare Free optimization: shared D1 quote storage, batched reads for all 12 assets, bounded in-isolate TTL caches with invalidation, coalesced requests, and page-specific frontend polling (2 minutes on Trade, 5 minutes elsewhere while visible). User-specific balances, session tokens and trade history are never shared between accounts.
- **Real market quotes only:** Finnhub last-trade prices and previous closes. No fictional quotes, no simulated market mode, and no invented chart data.

> This is a virtual-money game, not a brokerage. All prices originate from the market data provider, but quotes may be delayed and execution is not exchange-accurate. The game does not model fees, taxes, dividends, splits or corporate actions. Virtual trades are available 24/7, including evenings, weekends and holidays, using the last verified provider quote. Prices may remain unchanged outside exchange hours. Orders are blocked only when market data is missing, invalid or older than the freshness limit. Historical simulated fills are preserved for audit when migrating an existing installation.

## 1. Discord Developer Portal

1. Create a Discord application at <https://discord.com/developers/applications> and note its **Application ID** and **OAuth2 Client Secret**.
2. Under **OAuth2**, add `https://127.0.0.1` as a redirect URI. The Embedded App SDK manages the Activity's authorize redirect automatically.
3. Under **Activities → Settings**, enable Activities.
4. Under **Activities → URL Mappings**, map `/` to your deployed Worker hostname, e.g. `paperstreet.YOUR_SUBDOMAIN.workers.dev` (hostname only, without `https://`). Requests to `/api/*` use the same mapped origin.
5. Configure the application's installation settings so players can launch PaperStreet using Discord's default Activity **Play / Launch** entry point. The `/portfolio` slash command does not modify that handler.
6. Under **General Information → Interactions Endpoint URL**, set `https://paperstreet.gobydev.workers.dev/api/discord/interactions`. The endpoint verifies Discord's Ed25519 signature and responds to Discord's signed PING. If this URL was already configured, you do not need to change it.
7. Ensure `DISCORD_PUBLIC_KEY` is configured as a Worker secret from your application's **General Information** public key. The five-minute Worker schedule registers `/portfolio` using the existing `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` Worker secrets. No local credential file, gateway bot, or paid plan is required.
8. Open `https://paperstreet.gobydev.workers.dev/api/commands/status` to inspect the registration status and any nonsecret error code. Once `registered: true`, use `/portfolio` in Discord. Global commands can take some time to appear in clients.


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
   - `DISCORD_PUBLIC_KEY`: Discord's application public key, needed to verify signed slash command interactions.
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
4. A fresh installation can display a dated session candle using the open, high, low and latest price from the existing Finnhub quote. If those fields are unavailable, a single observed price appears as a tick. A five-minute Cron Trigger records prices during exchange sessions, even with zero players online. Historical candle extremes cover only the prices PaperStreet sampled.

### Quote freshness, permanent observations, and request limits

- The Worker caches successful responses in D1 for 5 minutes during regular hours and 1 hour while the market is closed. Shared D1 leases prevent duplicate upstream refreshes. All 12 asset quotes are read from D1 in one query rather than 12. At most five provider requests run concurrently to respect Workers Free limits.
- Small bounded in-isolate caches retain public market responses, quote rows, chart ranges and leaderboards for 12–90 seconds. Fresh quote writes invalidate quote and chart caches, while trades and Discord identity updates invalidate rankings. Account cash, holdings, history, and secrets are never stored in shared caches. Separate data centers may remain up to the TTL behind, but D1 remains authoritative for every trade.
- A single Free-plan Cron Trigger runs every five minutes and fetches quotes only during valid US stock sessions; it is a background price collector, not an always-on server. Quote-history rows are deduplicated by actual Finnhub timestamps and **never pruned**. Price history range selection limits only query results and display granularity, not storage.
- `GET /api/chart?symbol=AAPL&range=ALL` groups retained observations into candles. The 1D, 1W, 1M, 3M and 1Y views use 15-minute, hourly, daily, daily and weekly intervals. All uses whole-day multiples to keep the series near 100 bars or fewer. The chart omits empty intervals. Each candle carries its first and last observation times, sample count and price extremes. The endpoint also returns closing points for older clients.
- Cloudflare D1 Free includes **5 million rows read/day, 100,000 rows written/day, and 5 GB storage**. As retained observations grow, monitor D1 row usage in the Cloudflare dashboard. Once storage is exhausted, no more records can be inserted until capacity is freed, so indefinite retention is subject to these physical limits.
- The last trade timestamp reported by Finnhub is retained. During exchange hours, quotes older than 20 minutes cannot be traded; outside exchange hours, the last verified provider quote can be traded for up to 7 days. **Stale prices may be displayed for context but are never executable.** Provider errors or concurrent refreshes can reuse a still-valid cached quote rather than unnecessarily stopping virtual trades; missing or expired quotes still block execution. Prices are never simulated.
- PaperStreet's **virtual exchange is always open**. The US stock exchange calendar is used only to determine whether the source price should be actively updating (20-minute freshness limit) or is an after-hours last-trade price (7-day freshness limit). Every order is filled at the server validated last verified Finnhub quote with the existing 1% expected-price guard. This is a game, not a real after-hours brokerage execution.
- Quotes can be delayed, incomplete, or limited to a specific exchange by the provider. A data API's market access and licensing, not the game, determine how recent and complete prices are.
- Existing virtual holdings/trades are preserved during migration and are revalued using actual quotes. Old simulated trades are *not* retroactively rewritten, so reset competition rankings separately before launching a fair real-price season.

## Starting cash and existing accounts

New Discord-authenticated accounts start with **$1,000** in virtual cash; this value is inserted by the Worker explicitly. Existing accounts retain their original cash and holdings. Migration `0003_starting_cash.sql` preserves the original $10,000 performance baseline for old accounts and records a $1,000 baseline for new ones, so leaderboard and return percentages remain comparable.

To change **one existing player's cash** to $1,000, first verify their exact Discord user ID in the Discord client's Developer Mode. In Cloudflare D1's console run `SELECT user_id,display_name,cash_cents,starting_cash_cents FROM players WHERE user_id='DISCORD_USER_ID';` and confirm the returned account is correct. Then run `UPDATE players SET cash_cents=100000, starting_cash_cents=100000 WHERE user_id='DISCORD_USER_ID';`. Do not commit real user IDs to GitHub. This changes virtual cash and its return baseline only; it does not delete holdings, trading history, or affect anyone else. Existing investments remain in the account's equity.

Discord avatars are displayed in the account header, compact leaderboard, and full leaderboard. On each verified Discord OAuth login, the Worker saves the player's validated avatar hash and legacy discriminator in D1; every leaderboard response builds a Discord CDN URL from this server-controlled metadata. Default Discord avatars are shown for accounts without custom pictures. Existing players' custom pictures will appear after they next sign in; until then, a default Discord avatar is displayed. Avatar updates never change balances, holdings, or trades.

## Navigation and page responsibilities

- `#/dashboard` is the default landing screen. It provides **read-only** portfolio metrics, holdings, recent fills, rankings, and market snapshot. The buy/sell form is not mounted on this screen.
- `#/trade` is the dedicated market overview, with symbol search, real quote lists, market breadth and biggest movers. Selecting any symbol opens its individual stock page instead of placing a trade from the list.
- `#/trade/AAPL` (or any of the 12 allowlisted symbols) is a dedicated stock detail and trading screen. It contains the provider timestamp, last/previous price, recorded chart, owned position, and order ticket. Portfolio trade shortcuts navigate to this screen with Sell selected.
- `#/portfolio`, `#/leaderboard`, and `#/history` remain dedicated information pages. Hash routes support direct links and browser Back/Forward without leaving the Discord Activity. Only the stock detail screen mounts the order form.
- All views stay within the Discord iframe. On small screens, long content scrolls inside the workspace rather than creating an outer page scrollbar.

## Resource design and constraints

- Single Worker + static SPA, no separate Pages project or always-running bot process.
- Indexed D1 tables and persistent history, batched market snapshot reads, coalesced quote fetches, and a single five-minute Free-plan Cron Trigger for both quote collection during market hours and idempotent `/portfolio` command registration. No paid background queues, paid cache products or 24-hour compute process.
- `GET /api/market` is scoped to a signed account; `POST /api/trade` obtains the execution quote itself rather than accepting a client supplied price. The client supplied expected price is only a slippage guard.
- Only the 12 preselected symbols are tradeable. Full market search and instant quote streaming would exceed the intended zero cost design.
- Free tiers have enforceable limits. If player volume grows, additional HTTP request rate limiting, data rights and provider access may be necessary.

## API

| Route | Access | Purpose |
| --- | --- | --- |
| `GET /api/health` | Public | Health check |
| `POST /api/discord/interactions` | Discord Ed25519 signature | Signed `/portfolio` invocation and PING; deferred embed response |
| `GET /api/commands/status` | Public | Nonsecret command registration status |
| `GET /api/config` | Public | Discord application ID, real provider and readiness |
| `POST /api/auth` | OAuth code | Exchange with Discord; issue signed game session |
| `GET /api/market` | Bearer session | Market quotes |
| `GET /api/chart?symbol=AAPL&range=ALL` | Bearer session | Full recorded history downsampled for display; all original observations retained |
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

The deprecated `node-domexception@1.0.0` transitive package is replaced with a checked-in, Node 22+ native `DOMException` adapter under `vendor/node-domexception`. Its package name/version and ESM default export preserve the API expected by legacy `fetch-blob` consumers; npm direct dependency and override ensure it is selected rather than the deprecated registry package. The regression test verifies the installed adapter exports the native constructor. Remove the adapter once upstream dependencies no longer need the package.

Wrangler can report a **local vs. Cloudflare Dashboard configuration difference** on deploy. Review the exact diff rather than suppressing it: as of the November 20 deployment, the differences were generated static asset metadata and optional D1 `database_name`/`migrations_dir` fields. Keep Wrangler configuration as the source of truth; reconcile any future destructive dashboard differences before merging.

## Future roadmap

Additional Discord slash commands, per guild competitions with verified guild membership, more realistic exchange execution and corporate action accounting, seasonal tournaments, achievements, watchlists, richer historical charts and broader symbol support. This first release intentionally ships the core Activity before adding Gateway events or features that would stress Cloudflare's free plan.
