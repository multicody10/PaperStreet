# PaperStreet

**PaperStreet is a Discord Activity for stock paper trading.** Each new player starts with **$1,000 in virtual cash**, builds a portfolio, and competes on a global equity leaderboard. It runs as an embedded Discord Activity with a dedicated `/portfolio` Discord slash command, all on Cloudflare Workers Free without a Gateway process.

The entire stack runs on **Cloudflare Workers Free**: a single Worker for the API, Worker Static Assets for the React interface, and a D1 SQLite database. No always-on servers or paid Workers features are required. A five-minute weekday UTC market-window Cron collects prices, processes queued orders and settles prior-session predictions. It does not run overnight or on weekends.

## Features

- Native Discord Activity authentication using the Embedded App SDK and Discord OAuth2.
- **Simplified stock pages:** removed the top-right Trade action, About Stock panel, and Key Metrics panel. The existing stock chart and order ticket use the reclaimed vertical space.
- **`/paperstreet` slash command:** opens PaperStreet directly from servers, DMs and group DMs via Discord's `LAUNCH_ACTIVITY` interaction response, without posting a game invitation. The default **Play / Launch** entry point uses the same silent handler. Players can still invite friends manually.
- **`/portfolio` slash command:** a polished Discord embed containing the invoking trader's equity, cash, invested value, all-time return and holdings, valued using genuine cached Finnhub prices. Supports user installs in servers, direct messages and group DMs, as well as guild installs. It never accepts another user's ID. A separate `/paperstreet` command launches the game, while the Activity's default Play entry point is configured to avoid automatic invitations.
- Immediate market buys and sells during regular US trading hours plus persistent queued market, limit and stop orders, including weekends and holidays, for the 12 supported stocks/ETFs.
- **Next-session predictions:** choose higher or lower than a verified reference quote, earn ten points for correct direction, and track prediction accuracy. The existing quote history resolves predictions only from verified session-closing prints, on the next open-market schedule after the predicted session.
- **Goals and achievements:** a screenshot-inspired progress dashboard with real achievement counts, completed and active objectives, a 10% portfolio-return milestone, four featured achievement cards, completion ring, category filters, detailed progress table and recent unlocks. The activity does not invent XP, levels or streaks.
- **Portfolio:** positions plus queued order management and executed **Trade History directly below Queued Orders**. Trade history is no longer a separate navigation page; legacy `#/history` links open Portfolio's History tab. Pending orders do not reserve funds or holdings; invalid balances are rejected at fill time.
- Server authoritative execution, signed expiring sessions, duplicate order protection, and atomic SQLite balances.
- **Discord trade announcements:** immediate trades create stylish buy/sell embeds in the proven Activity chat; queued fills post to that same channel and mention the player who placed the order even if offline. Pending announcements use a durable D1 outbox, Discord nonce deduplication and retries. Launching the Activity itself remains silent.
- Portfolio equity, weighted cost basis, unrealized profit/loss, trade history, and global leaderboard ranked by portfolio equity.
- The **Dashboard** watchlist shows **only stocks with shares currently held**; when no shares are held it provides a helpful empty state and an All Stocks link. Open Positions and Recent Paper Trades share one switchable activity card; the 10% equity milestone footer stays visible. The Goals page uses larger two-column featured achievements. All routes use a flat #0E0E0E base, muted gray cards and borders, green for gains/actions, and red for losses/sells.
- The **Dashboard** is a read-only trading overview with a real quote watchlist, interactive stock chart, portfolio equity summary, 10% growth milestone, achievements, open positions, recent paper trades and allocation. Its former right-side order ticket and redundant top-right recent-trades summary were removed. Orders are placed on individual stock pages.
- **Trade is now market discovery only:** a verified market ticker strip, selected-symbol OHLC overview with observed candles, and a full-width searchable and sortable stock/ETF quote table. The Market Movers, Market Breadth and Place Paper Order panels are removed. Clicking a stock row or ticker card navigates to its dedicated `#/trade/SYMBOL` page, where trading, quotes and predictions live.
- Interactive candlesticks across **1D, 1W, 1M, 3M, 1Y, All**. Hover, touch, or focus the chart and use the arrow keys to inspect open, high, low, and close. The Trade list shows where each last price sits within its reported session range.
- **Neutral black and white terminal:** truly gray/black surfaces and card borders, white typography, subtle gray selections, and green reserved for profitable market movement, thin active indicators and small progress signals. Red indicates negative returns and sell activity. At **1544 × 768**, charts have priority over secondary tables; narrower widths adapt using grid reflow, mobile tabs and measured Prev/Next pagination without page scrollbars.
- Cloudflare Free optimization: shared D1 quote storage, batched reads for all 12 assets, bounded in-isolate TTL caches with invalidation, coalesced requests, and page-specific frontend polling (2 minutes on Trade, 5 minutes elsewhere while visible). User-specific balances, session tokens and trade history are never shared between accounts.
- **Exchange calendar:** hover, focus, or tap the Markets Open / Markets Closed indicator to see the current New York exchange calendar, holidays, early closes and next opening time. The Activity and Worker share the same core session rules.
- **Alpaca historical candles when configured; collected observations as fallback:** The 1D, 1W, 1M, 3M, 1Y and All charts contain real Finnhub observations stored while PaperStreet is operating. A fresh database has no older prices to display, and missing historical points are never fabricated. No separate external history service is used.
- **Real market quotes only:** Finnhub last-trade prices and previous closes. The top market strip displays only actual supported cached quotes (SPY ETF and supported equities), not invented index levels. Allocation uses each user's actual holdings and cash; recent fills are labeled as recent history, not as an unsupported trading streak. No fictional quotes or invented historical chart data.

> This is a virtual-money game, not a brokerage. All prices originate from the market data provider, but quotes may be delayed and execution is not exchange-accurate. The game does not model fees, taxes, dividends, splits or corporate actions. Immediate fills run only during regular US exchange hours, with a recent verified in-session print. Queued orders are persisted and processed by the existing five-minute cron after the exchange opens. They may fill later than the opening tick, and limit/stop orders can remain pending. Orders are rejected at execution if funds or shares are insufficient. Predictions use the last verified observation near the target session's close; if no such observation exists, settlement remains pending rather than inventing a result. Historical simulated fills are preserved for audit when migrating an existing installation.

## Short selling
- Use **Short** to sell borrowed virtual shares and **Cover** to repurchase them. Close an opposite position before opening a new one on the same symbol.
- Opening a short locks 100% cash collateral plus all short-sale proceeds; neither can be spent. Short P/L is entry proceeds minus repurchase liability. Partial covers release a proportional share of collateral and proceeds.
- Each market-window cron uses verified current regular-session prices to liquidate isolated short positions below 25% maintenance margin (up to 40 per run). Price gaps can cause virtual debt; debt reduces equity and future realized proceeds repay it before becoming buying power. Liquidations appear in history. No borrowing fees or real-world borrow availability are simulated.
- Immediate and queued market, limit and stop orders use the same atomic ledger. Queued short and cover fills are announced through the existing verified Discord channel. Existing long positions and history are preserved by the additive migration.
- The portfolio, leaderboard and Discord portfolio embed include short liabilities. All funds and debt are virtual.

## After-hours gameplay

- **Goals** tracks actual achievements in trading, stock predictions and diversification, with completion stats, featured objectives, a progression table, recent unlocks and a portfolio growth milestone. Individual stock predictions remain exclusively on stock trade pages (e.g., `#/trade/AAPL`), with their own ticker-specific history and one entry per stock/session.
- **Individual stock trade pages** automatically select a queued market order when the exchange is closed. Queue market, limit or stop orders at any time, or place immediate orders while the exchange is open. Orders process on the next eligible scheduled run using verified regular-session quotes, not an assumed opening auction price.
- **Portfolio** shows positions, active/recent queued orders and trade history beneath those orders. On narrow windows, Portfolio's Positions/Queued Orders/History tabs display one panel at a time. Cancel pending orders before they are claimed; statuses persist. Pending orders do not reserve virtual cash or shares.
- The weekday market-window Cron in `wrangler.jsonc` runs from 13:00 through 20:55 UTC (to cover EST and EDT exchange hours) at five-minute intervals. The Worker exits immediately outside the actual US market session, including holidays and early closes. Predictions settle on the next open session, not after hours. This static UTC schedule cannot eliminate every pre-open and post-close no-op trigger around DST. Run D1 migrations (including `0009_after_hours_gameplay.sql`) before deploying the new Worker version. No new paid services are needed.

## 1. Discord Developer Portal

1. Create a Discord application at <https://discord.com/developers/applications> and note its **Application ID** and **OAuth2 Client Secret**.
2. Under **OAuth2**, add `https://127.0.0.1` as a redirect URI. The Embedded App SDK manages the Activity's authorize redirect automatically.
3. Under **Activities → Settings**, enable Activities.
4. Under **Activities → URL Mappings**, map `/` to your deployed Worker hostname, e.g. `paperstreet.YOUR_SUBDOMAIN.workers.dev` (hostname only, without `https://`). Requests to `/api/*` use the same mapped origin.
5. Configure the application's installation settings so players can launch PaperStreet using the **Play / Launch** entry point. Each successful deployment switches the existing Discord Entry Point to `APP_HANDLER` and the signed interactions endpoint replies `LAUNCH_ACTIVITY`, launching the game without posting an invitation. The separate `/paperstreet` slash command launches the same way.
6. Under **General Information → Interactions Endpoint URL**, set `https://paperstreet.gobydev.workers.dev/api/discord/interactions`. The endpoint verifies Discord's Ed25519 signature and responds to Discord's signed PING. If this URL was already configured, you do not need to change it.
7. Ensure `DISCORD_PUBLIC_KEY` is configured as a Worker secret from your application's **General Information** public key. The **Deploy PaperStreet** GitHub Actions workflow registers and verifies `/portfolio` immediately after deploying the Worker. It securely authenticates to the Worker using GitHub's short-lived OIDC token, and the Worker uses the existing `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` secrets. No local credential file, duplicate GitHub Discord secrets, Gateway bot, or paid plan is required.
8. Open `https://paperstreet.gobydev.workers.dev/api/commands/status` to inspect the registration status and any nonsecret error code. A successful deployment includes Discord command registration in its checks. Once `registered: true`, use `/portfolio` in Discord. Global commands can take some time to appear in clients.

**User install setup:** In the [Discord Developer Portal](https://discord.com/developers/applications), select PaperStreet → **Installation**. Enable **User Install** (and retain **Guild Install** for server-wide installations). Under **Default Install Settings**, set User Install's scope to `applications.commands`, with **Discord Provided Link** selected for the install link. No bot scope or server admin permission is required for user installs. Install PaperStreet to your own account (or reauthorize it after enabling User Install), then invoke `/portfolio` from server channels, DMs or group DMs. The deployed global command declares `integration_types: [0, 1]` and `contexts: [0, 1, 2]`. Server permissions for external apps can cause responses to be visible only to the invoking user. The command always accesses the invoker's own account.


## 2. Automatic Cloudflare deployment with GitHub Actions

Once set up, **every push or merged PR to `main` automatically tests, migrates D1, and deploys** the Activity and API to one Cloudflare Worker. You can also manually run **Actions → Deploy PaperStreet → Run workflow**. Pull requests only run checks and never deploy. No paid plan or always-on process is required.

### Enable Discord trade notifications

Create/reveal the token in [Discord Developer Portal](https://discord.com/developers/applications) → PaperStreet → **Bot**, and save it as the encrypted Cloudflare Worker secret `DISCORD_BOT_TOKEN`. Install the **bot** in each participating guild, granting **View Channel**, **Send Messages**, and **Embed Links** where PaperStreet is played. The existing Cloudflare Worker and Cron handle delivery; no Gateway process or paid hosting is required.

The Worker only accepts channel IDs that match a **Discord signature-verified Activity launch** from that authenticated player. The verified channel is stored with each order, so a queued fill stays in the correct chat even after the user leaves. Without a signed launch context or bot access (including most user-only installs and group DMs), announcements cannot be posted. Already queued orders created before this migration do not have a verified destination and will not emit notifications. Discord 403/404 errors permanently block that specific announcement; transient errors are retried.

### One-time configuration

1. **Create the D1 database** in your Cloudflare account under **Workers & Pages → D1** (name it `paperstreet`), or run `npx wrangler login` and `npx wrangler d1 create paperstreet` locally. Copy the resulting **database ID** (UUID). Do not create a new database for each deployment.
2. **Create a scoped Cloudflare API token** in [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens). Allow the account's **Workers Scripts: Edit** and **D1: Edit** permissions, scoped to the specific Cloudflare account. Obtain your **Account ID** from the Cloudflare dashboard. Keep the token private.
3. In [PaperStreet GitHub Actions secrets](https://github.com/multicody10/PaperStreet/settings/secrets/actions), create two repository **secrets**:
   - `CLOUDFLARE_API_TOKEN`: the scoped Cloudflare token.
   - `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account ID.
4. In [PaperStreet GitHub Actions variables](https://github.com/multicody10/PaperStreet/settings/variables/actions), create one repository **variable**:
   - `PAPERSTREET_D1_DATABASE_ID`: the D1 database UUID from step 1. This identifier is not a credential.
5. Merge this workflow into `main` (or choose **Run workflow**). The first deployment creates the `paperstreet` Worker, applies `migrations/0001_init.sql` to the remote D1 database, and prints the new `*.workers.dev` URL in the Actions logs. Later runs apply **only pending** migrations. A failed test or migration prevents deployment. The final workflow step registers and verifies `/portfolio`, `/paperstreet`, and the silent Play handler, reporting failure if any registration fails. The deployed Worker can remain live even when this last step reports an error.
6. **Before activating the real market** obtain a quote provider key and written approval to display/redistribute its market data to your Discord players (details in section 3). In **Cloudflare → Workers & Pages → paperstreet → Settings → Variables and Secrets**, add the following **Worker secrets**, then save/deploy the settings:
   - `DISCORD_CLIENT_ID`: your Discord Application ID.
   - `DISCORD_PUBLIC_KEY`: Discord's application public key, needed to verify signed slash command interactions.
   - `DISCORD_CLIENT_SECRET`: your Discord OAuth2 Client Secret.
   - `SESSION_SECRET`: a unique 64-character hexadecimal secret (`openssl rand -hex 32` in Git Bash).
   - `FINNHUB_API_KEY`: an authorized Finnhub API key, stored as **Secret**. Without this key PaperStreet displays no prices and disables trading.
7. Configure **Discord Developer Portal → Activities → URL Mappings** with `/` mapped to your deployed Worker hostname as described in section 1. Test launch from Discord.

**Security:** The post-deploy job requests a short-lived GitHub Actions OIDC identity token (`id-token: write`) and the Worker verifies its signature, repository ID, branch, and deploy workflow before allowing command registration. During the production build, GitHub Actions downloads the official public OIDC signing keys and embeds them in the Worker, avoiding dependence on Cloudflare's outbound JWKS fetch during command setup. Private keys and authentication tokens are never embedded. Discord secrets remain in Cloudflare; GitHub Actions never reads them. The GitHub token deploys the project and updates the database, but does **not** need your Discord credentials. Set Discord secrets on the **Cloudflare Worker**, not in GitHub or `wrangler.jsonc`. `PAPERSTREET_D1_DATABASE_ID` is substituted into the runner's temporary Wrangler configuration before build; the tracked placeholder is never committed as a real database ID. Deployment secrets are exposed only to the migration and deploy commands, not to dependency installation or tests. Do not separately connect a Cloudflare Workers Builds Git integration to the same Worker; otherwise two deployment systems could race.

### Optional manual deployment and development

If you prefer running Wrangler yourself, copy the D1 database ID into your local `wrangler.jsonc`, replacing the all-zero placeholder, then run `npm install --no-audit --no-fund && npm run db:remote && npm run deploy` after `npx wrangler login`. The GitHub Actions workflow does **not** require editing the tracked `wrangler.jsonc`.

For local development, copy `.dev.vars.example` to `.dev.vars`, fill in Discord credentials, and run:

```sh
npm install --no-audit --no-fund
npm run db:local
npm run dev
```

The local UI must be opened from a Discord Activity, not directly in a browser, because the Embedded App SDK requires Discord's iframe context. For local testing, make Vite accessible using `cloudflared tunnel --url http://localhost:5173` and temporarily map `/` to the tunnel hostname in the Discord Developer Portal. The OAuth2 Client Secret remains on the Worker; never expose it through a `VITE_` variable.

## UI layout targets

- **Desktop reference:** 1544 × 768 CSS pixels, including the PaperStreet top header and left navigation. `src/flat-terminal.css` is loaded after legacy styles to make the palette and desktop geometry authoritative.
- **Dashboard:** two equity/milestone cards, a large market watchlist + candle chart, and four bottom summary panels.
- **Trade:** five snapshot tickers followed by a chart-dominant workspace. A large observed-price chart occupies the left, while a compact searchable and paginated stock list is on the right. Narrow desktop viewports stack them, and mobile uses Overview/All Stocks tabs. No market-wide order entry, movers or breadth panels.
- **Individual stocks (`#/trade/SYMBOL`):** company and quote header, candle chart, paper order ticket, company description, key metrics, related stocks, personal fills and prediction card. Reduced-height windows tighten controls.
- **Goals:** five counters, a real-equity milestone, featured achievements, completion overview, paginated achievement list and unlock badges.
- **Portfolio:** four account metrics above positions, queued orders and executed history. **Leaderboard:** ranked-trader summary metrics above a paginated ranking list. Both are backed by existing account data.
- **Responsive:** content never relies on page scrollbars; measured `FitPager` slices large lists to the visible space, and phone-sized windows switch to panel tabs. The 1544 × 768 target is a design reference, not a fixed-size requirement. Actual viewport inspection within Discord is still recommended.

## 3. Real stock market data (required, no simulated fallback)

**All PaperStreet prices come from real US stock market quotes.** The backend fetches Finnhub `GET /api/v1/quote` with a private `FINNHUB_API_KEY`; it validates the quote price, previous close, and provider timestamp before caching anything. No client can supply execution prices, and the frontend never receives the provider key. When data is missing or invalid, the market displays an error instead of generating a fictional quote.

**Licensing:** [Finnhub's Terms of Service](https://finnhub.io/terms-of-service), under *Redistribution Rights and Personal Use*, expressly forbid sharing or redistributing data (including derived results) with third parties without **written permission**. Its standard website plans are personal-use-only. **An ordinary free API key does not grant rights to publish stock quotes to your Discord Activity users.** Obtain written permission or replace the provider with a service whose license explicitly permits the game's public data display before inviting players. Keep the Activity restricted to authorized testing until resolved. PaperStreet has no paid-tier dependency, but exchange redistribution rights may not be available at $0.

### Configure market data

1. Obtain a Finnhub key and suitable redistribution permissions for this usage. Store the key in **Cloudflare → Workers & Pages → paperstreet → Settings → Variables and Secrets → Add → Secret** as `FINNHUB_API_KEY`, or from Git Bash run `npx wrangler secret put FINNHUB_API_KEY` in a production-bound project.
2. Run the migration `0002_real_market.sql` (the GitHub Actions deployment applies pending migrations automatically) and deploy the Worker.
3. Verify `/api/config` reports `dataConfigured: true` and the authenticated `/api/market` endpoint returns quotes with `source: "finnhub"`. Do not share keys or bearer tokens in public logs.
4. Historical charts optionally use Alpaca IEX OHLC data (2016 onward) when configured, and fall back to collected Finnhub observations. Finnhub remains the sole pricing source for paper fills. A five-minute market-window Cron still collects live observations.

### Optional Alpaca historical candles (no paid plan needed)

Set the secrets `ALPACA_API_KEY_ID` and `ALPACA_API_SECRET_KEY` in Cloudflare Workers > paperstreet > Settings > Variables and Secrets. Keep the existing `FINNHUB_API_KEY` for live quotes and paper fills. Deploy after running migration `0014_alpaca_history.sql` (automated by GitHub Actions). `GET /api/config` exposes `historyConfigured` without exposing credentials.

On the first chart visit for each ticker, the Worker fetches genuine Alpaca stock OHLC candles from `https://data.alpaca.markets/v2/stocks/{symbol}/bars` using `feed=iex`. 1D and 1W use 15-minute bars, and longer ranges use split-adjusted daily bars back to 2016. Prices are stored in D1 separate from the Finnhub quote cache and virtual trade ledger. Subsequent visits use D1 cached candles with hour/intraday refresh budgets and database leases; provider failure retains cached history and falls back to observed Finnhub quotes if necessary. The latest 20 minutes are excluded to respect Alpaca Basic restrictions. IEX is one exchange, so OHLC may not match consolidated market candles.

**Licensing restriction:** Alpaca states that its API data may not be redistributed via third-party platforms: https://alpaca.markets/support/redistribute-alpaca-api . Private development is possible, but do not publish Alpaca-derived charts to Discord Activity users without explicit permission or appropriate redistribution rights.

### Quote freshness, permanent observations, and request limits

- The Worker caches successful responses in D1 for 5 minutes during regular hours and 1 hour while the market is closed. Shared D1 leases prevent duplicate upstream refreshes. All 12 asset quotes are read from D1 in one query rather than 12. At most five provider requests run concurrently to respect Workers Free limits.
- Small bounded in-isolate caches retain public market responses, quote rows, chart ranges and leaderboards for 12–90 seconds. Fresh quote writes invalidate quote and chart caches, while trades and Discord identity updates invalidate rankings. Account cash, holdings, history, and secrets are never stored in shared caches. Separate data centers may remain up to the TTL behind, but D1 remains authoritative for every trade.
- A single Free-plan Cron Trigger runs every five minutes only within weekday UTC hours 13–20, and fetches quotes only during valid US stock sessions; it is a background price collector, not an always-on server. Quote-history rows are deduplicated by actual Finnhub timestamps and **never pruned**. Price history range selection limits only query results and display granularity, not storage.
- `GET /api/chart?symbol=AAPL&range=ALL` prefers real Alpaca IEX OHLC history, backed by D1, and otherwise groups retained Finnhub observations into candles. The 1D, 1W, 1M, 3M and 1Y views use 15-minute, hourly, daily, daily and weekly intervals. All uses whole-day multiples to keep the series near 100 bars or fewer. The chart omits empty intervals. Each candle carries its first and last observation times, sample count and price extremes. The endpoint also returns closing points for older clients.
- Cloudflare D1 Free includes **5 million rows read/day, 100,000 rows written/day, and 5 GB storage**. As retained observations grow, monitor D1 row usage in the Cloudflare dashboard. Once storage is exhausted, no more records can be inserted until capacity is freed, so indefinite retention is subject to these physical limits.
- The last trade timestamp reported by Finnhub is retained. During exchange hours, quotes older than 20 minutes cannot be traded; outside exchange hours, the last verified provider quote can be traded for up to 7 days. **Stale prices may be displayed for context but are never executable.** Provider errors or concurrent refreshes can reuse a still-valid cached quote rather than unnecessarily stopping virtual trades; missing or expired quotes still block execution. Prices are never simulated.
- PaperStreet's **trading interface is available around the clock**, but immediate fills are allowed only during regular US stock sessions with a recent verified in-session quote. When closed, the ticket defaults to a queued order; the Worker fills eligible queued orders on market-window Cron runs, at a verified quote when its conditions match. Prices may be delayed. Quotes can be viewed outside market hours, but they do not permit immediate execution. This is a game, not a brokerage.
- Quotes can be delayed, incomplete, or limited to a specific exchange by the provider. A data API's market access and licensing, not the game, determine how recent and complete prices are.
- Existing virtual holdings/trades are preserved during migration and are revalued using actual quotes. Old simulated trades are *not* retroactively rewritten, so reset competition rankings separately before launching a fair real-price season.

## Starting cash and existing accounts

New Discord-authenticated accounts start with **$1,000** in virtual cash; this value is inserted by the Worker explicitly. Existing accounts retain their original cash and holdings. Migration `0003_starting_cash.sql` preserves the original $10,000 performance baseline for old accounts and records a $1,000 baseline for new ones, so leaderboard and return percentages remain comparable.

To change **one existing player's cash** to $1,000, first verify their exact Discord user ID in the Discord client's Developer Mode. In Cloudflare D1's console run `SELECT user_id,display_name,cash_cents,starting_cash_cents FROM players WHERE user_id='DISCORD_USER_ID';` and confirm the returned account is correct. Then run `UPDATE players SET cash_cents=100000, starting_cash_cents=100000 WHERE user_id='DISCORD_USER_ID';`. Do not commit real user IDs to GitHub. This changes virtual cash and its return baseline only; it does not delete holdings, trading history, or affect anyone else. Existing investments remain in the account's equity.

Discord avatars are displayed in the account header, compact leaderboard, and full leaderboard. On each verified Discord OAuth login, the Worker saves the player's validated avatar hash and legacy discriminator in D1; every leaderboard response builds a Discord CDN URL from this server-controlled metadata. Default Discord avatars are shown for accounts without custom pictures. Existing players' custom pictures will appear after they next sign in; until then, a default Discord avatar is displayed. Avatar updates never change balances, holdings, or trades.

## Navigation and page responsibilities

- `#/dashboard` is the default portfolio overview. It shows live watchlist quotes, a symbol-selectable chart, account equity, growth milestone, recent paper fills, positions, goals and allocation, **without an order ticket or redundant top-right trades counter**. Click a watchlist quote to update the chart or open the full stock trade page.
- `#/trade` is a full-width, read-only market discovery page. Stock/ETF ticker cards, OHLC, recorded price chart and sortable/searchable quote rows lead to individual `#/trade/SYMBOL` pages. There are **no order, movers or market breadth panels** on the market-wide Trade page.
- `#/trade/AAPL` (or any of the 12 supported stocks/ETFs) has a dedicated stock trading workspace styled after the attached NVIDIA reference: branded company header, current price and session quote metrics, responsive chart with 1D/1W/1M/3M/1Y/ALL, paper Buy/Sell ticket, factual company summary, key quote/position metrics, curated related supported tickers, actual recent fills for this ticker, and its own next-session prediction card with per-stock history. Each ticker loads the same shared component with symbol-specific, real API data. On mobile, Overview/Trade/Details/Predict tabs keep content within the Discord viewport. Queued orders and immediate fills use the unchanged server-authoritative APIs.
- `#/portfolio` and `#/leaderboard` remain dedicated information pages. The former `#/history` URL redirects logically to the Portfolio History panel, and the standalone History navigation entry is removed. Hash routes support direct links and browser Back/Forward without leaving Discord. Paper order forms are available only on individual stock pages.
- All views fit within the Discord iframe without scrollbars. Desktop displays multiple cards simultaneously; compact mobile screens use section tabs and paginated lists instead of clipping content.

## Resource design and constraints

- Single Worker + static SPA, no separate Pages project or always-running bot process.
- Indexed D1 tables and persistent history, batched market snapshot reads, coalesced quote fetches, and a single five-minute Free-plan Cron Trigger limited to weekday UTC market-window hours, guarded by the NYSE session calendar for quotes, queued fills and next-session prediction grading. Slash commands are registered once per production deployment using GitHub Actions OIDC. No paid background queues, paid cache products or 24-hour compute process.
- `GET /api/market` is scoped to a signed account; `POST /api/trade` obtains the execution quote itself rather than accepting a client supplied price. The client supplied expected price is only a slippage guard.
- Only the 12 preselected symbols are tradeable. Full market search and instant quote streaming would exceed the intended zero cost design.
- Free tiers have enforceable limits. If player volume grows, additional HTTP request rate limiting, data rights and provider access may be necessary.

## API

| Route | Access | Purpose |
| --- | --- | --- |
| `GET /api/health` | Public | Health check |
| `POST /api/discord/interactions` | Discord Ed25519 signature | Signed `/portfolio` invocation and PING; deferred embed response |
| `POST /api/internal/register-commands` | Verified GitHub Actions OIDC deployment token | Register and verify `/portfolio`, `/paperstreet` and the silent Play handler |
| `GET /api/commands/status` | Public | Nonsecret command registration status |
| `GET /api/config` | Public | Discord application ID, real provider and readiness |
| `POST /api/auth` | OAuth code | Exchange with Discord; issue signed game session |
| `GET /api/market` | Bearer session | Market quotes |
| `GET /api/chart?symbol=AAPL&range=ALL` | Bearer session | Alpaca IEX OHLC history when configured, otherwise collected Finnhub observations |
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

## Legal policies for Discord app verification

The public legal pages are published as static assets in the same Worker deployment as the Activity:

- Terms of Service: <https://paperstreet.gobydev.workers.dev/terms.html>
- Privacy Policy: <https://paperstreet.gobydev.workers.dev/privacy.html>

Enter these URLs in **Discord Developer Portal → PaperStreet → General Information** under the corresponding fields after deployment. These pages explain account data, public leaderboards, command visibility, data retention, and the account deletion request process. Keep them updated when data handling or game features change.
