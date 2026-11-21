import { STOCKS, HISTORY_RANGES, type Candle, type ChartHistory, type HistoryRange, type Quote, type SymbolCode } from '../shared/stocks';
import { memoized, invalidateMemo } from './memo';
import { easternMarketClock, marketSessionOn } from '../shared/marketCalendar';
import { historicalCandles } from './history';

export interface MarketEnv { DB: D1Database; FINNHUB_API_KEY?: string; ALPHA_VANTAGE_API_KEY?: string }
type CacheRow = { price_cents: number; previous_close_cents: number; fetched_at: number; provider_at: number | null; mode: string;
  open_cents: number | null; high_cents: number | null; low_cents: number | null };
type ProviderPayload = { c?: unknown; pc?: unknown; t?: unknown; o?: number; h?: number; l?: number };
const STOCK_NAMES = new Map<SymbolCode, string>(STOCKS.map(s => [s.symbol, s.name]));
const MARKET_CACHE_SECONDS = 300;
const CLOSED_CACHE_SECONDS = 3600;
const MAX_TRADE_AGE_SECONDS = 20 * 60; // During exchange hours, avoid fills against outdated quotes.
const MAX_OFFHOURS_AGE_SECONDS = 7 * 86400; // Last verified exchange price can be used on weekends and holidays.
const LEASE_SECONDS = 12;
const MAX_PRICE_CENTS = 100_000_000;

function calculateUsMarketOpen(now: number): boolean {
  const { date, minute } = easternMarketClock(new Date(now * 1000));
  const session = marketSessionOn(date);
  return session.kind !== 'closed' && minute >= 570 && minute < session.closeMinute;
}

let lastMarketMinute = -1;
let lastMarketOpen = false;
export function isUsMarketOpen(now = Math.floor(Date.now() / 1000)): boolean {
  const minute = Math.floor(now / 60);
  if (minute !== lastMarketMinute) {
    lastMarketMinute = minute;
    lastMarketOpen = calculateUsMarketOpen(now);
  }
  return lastMarketOpen;
}

export const isHistoryRange = (value: unknown): value is HistoryRange =>
  typeof value === 'string' && HISTORY_RANGES.includes(value as HistoryRange);
const HISTORY_SECONDS: Record<Exclude<HistoryRange, 'ALL'>, number> = {
  '1D': 86400, '1W': 7 * 86400, '1M': 30 * 86400,
  '3M': 90 * 86400, '1Y': 365 * 86400,
};
export function historyQueryWindow(range: HistoryRange, oldest: number, now: number) {
  // Never delete historical observations. Only limit which ones the chart requests.
  const startAt = range === 'ALL' ? oldest : Math.max(oldest, now - HISTORY_SECONDS[range]);
  const intervals = { '1D': 900, '1W': 3600, '1M': 86400, '3M': 86400, '1Y': 7 * 86400 };
  const bucketSeconds = range === 'ALL' ? Math.max(1, Math.ceil((now - startAt) / (100 * 86400))) * 86400 : intervals[range];
  return { startAt, bucketSeconds };
}

function sessionBar(open: number | null, high: number | null, low: number | null, close: number) {
  if (open === null || high === null || low === null ||
      ![open, high, low].every(Number.isSafeInteger) || low <= 0 || high > MAX_PRICE_CENTS ||
      low > Math.min(open, close) || high < Math.max(open, close)) return undefined;
  return { openCents: open, highCents: high, lowCents: low, closeCents: close };
}
const providerCents = (price: unknown) => typeof price === 'number' ? Math.round(price * 100) : null;

export function parseFinnhubQuote(symbol: SymbolCode, body: ProviderPayload, now = Math.floor(Date.now() / 1000)): Quote {
  const { c, pc, t } = body;
  if (![c, pc, t].every(Number.isFinite) || typeof c !== 'number' || typeof pc !== 'number' ||
      typeof t !== 'number' || c <= 0 || pc <= 0 || !Number.isSafeInteger(t) ||
      t <= 0 || t > now + 60 || t < now - 30 * 86400) throw new Error('Invalid or unavailable stock quote');
  const priceCents = Math.round(c * 100), previousCloseCents = Math.round(pc * 100);
  if (priceCents <= 0 || previousCloseCents <= 0 ||
      priceCents > MAX_PRICE_CENTS || previousCloseCents > MAX_PRICE_CENTS) throw new Error('Quote outside supported range');
  const marketOpen = isUsMarketOpen(now);
  return { symbol, name: STOCK_NAMES.get(symbol)!, priceCents, previousCloseCents,
    sessionBar: sessionBar(providerCents(body.o), providerCents(body.h), providerCents(body.l), priceCents),
    changePct: Math.round((priceCents / previousCloseCents - 1) * 10000) / 100,
    fetchedAt: t, source: 'finnhub', stale: now - t > (marketOpen ? MAX_TRADE_AGE_SECONDS : MAX_OFFHOURS_AGE_SECONDS), marketOpen };
}

// Quote freshness is necessary but not sufficient for fills: trade routes also check the session.
export const isQuoteExecutable = (quote: Quote): boolean =>
  quote.source === 'finnhub' && !quote.stale && Number.isSafeInteger(quote.priceCents) && quote.priceCents > 0;

type StoredRow = CacheRow & { symbol: SymbolCode };

function fromStored(symbol: SymbolCode, row: CacheRow | null, now: number): Quote | null {
  if (!row || row.mode !== 'finnhub' || !Number.isSafeInteger(row.price_cents) ||
      !Number.isSafeInteger(row.previous_close_cents) || row.price_cents <= 0 ||
      row.previous_close_cents <= 0 || row.price_cents > MAX_PRICE_CENTS ||
      row.previous_close_cents > MAX_PRICE_CENTS || !row.provider_at ||
      !Number.isSafeInteger(row.provider_at) || row.provider_at > now + 60 ||
      row.provider_at < now - 30 * 86400) return null;
  const marketOpen = isUsMarketOpen(now);
  return { symbol, name: STOCK_NAMES.get(symbol)!, priceCents: row.price_cents,
    sessionBar: sessionBar(row.open_cents, row.high_cents, row.low_cents, row.price_cents),
    previousCloseCents: row.previous_close_cents,
    changePct: Math.round((row.price_cents / row.previous_close_cents - 1) * 10000) / 100,
    fetchedAt: row.provider_at, source: 'finnhub',
    stale: now - row.provider_at > (marketOpen ? MAX_TRADE_AGE_SECONDS : MAX_OFFHOURS_AGE_SECONDS),
    marketOpen };
}

const inflight = new Map<SymbolCode, Promise<Quote>>();

export async function quoteFor(
  symbol: SymbolCode, env: MarketEnv, now = Math.floor(Date.now() / 1000),
  provided?: CacheRow | null,
): Promise<Quote> {
  if (!env.FINNHUB_API_KEY) throw new Error('Real market data is not configured');
  const row = provided === undefined
    ? await memoized<CacheRow | null>('quote:' + symbol, 12000, () =>
      env.DB.prepare(`SELECT price_cents,previous_close_cents,fetched_at,provider_at,mode,open_cents,high_cents,low_cents
        FROM quote_cache WHERE symbol=? AND mode='finnhub'`).bind(symbol).first<CacheRow>())
    : provided;
  const previous = fromStored(symbol, row, now);
  if (previous && now - row!.fetched_at < (previous.marketOpen ? MARKET_CACHE_SECONDS : CLOSED_CACHE_SECONDS))
    return previous;
  const pending = inflight.get(symbol);
  if (pending) return pending;
  const task = async (): Promise<Quote> => {
    const leaseUntil = now + LEASE_SECONDS;
    const lock = await env.DB.prepare(`INSERT INTO quote_refresh_lock(symbol,lease_until) VALUES(?,?)
      ON CONFLICT(symbol) DO UPDATE SET lease_until=excluded.lease_until
      WHERE quote_refresh_lock.lease_until <= ? RETURNING symbol`)
      .bind(symbol, leaseUntil, now).first<{ symbol: string }>();
    if (!lock) {
      if (previous) return previous;
      throw new Error('Market quote is being refreshed');
    }
    try {
      const endpoint = new URL('https://finnhub.io/api/v1/quote');
      endpoint.searchParams.set('symbol', symbol);
      endpoint.searchParams.set('token', env.FINNHUB_API_KEY!);
      const response = await fetch(endpoint, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(4500) });
      if (!response.ok) throw new Error(`Provider HTTP ${response.status}`);
      const quote = parseFinnhubQuote(symbol, await response.json() as ProviderPayload, now);
      await env.DB.prepare(`INSERT INTO quote_cache(symbol,price_cents,previous_close_cents,fetched_at,provider_at,mode,open_cents,high_cents,low_cents)
        VALUES(?,?,?,?,?,'finnhub',?,?,?) ON CONFLICT(symbol) DO UPDATE SET price_cents=excluded.price_cents,
        open_cents=excluded.open_cents,high_cents=excluded.high_cents,low_cents=excluded.low_cents,
        previous_close_cents=excluded.previous_close_cents,fetched_at=excluded.fetched_at,
        provider_at=excluded.provider_at,mode='finnhub' WHERE excluded.fetched_at >= quote_cache.fetched_at`)
        .bind(symbol, quote.priceCents, quote.previousCloseCents, now, quote.fetchedAt,
          quote.sessionBar?.openCents ?? null, quote.sessionBar?.highCents ?? null, quote.sessionBar?.lowCents ?? null).run();
      invalidateMemo('quote:' + symbol);
      invalidateMemo('market:rows');
      invalidateMemo('market:response');
      invalidateMemo('leaderboard');
      const inserted = await env.DB.prepare(`INSERT OR IGNORE INTO quote_history(symbol,observed_at,price_cents)
        VALUES(?,?,?)`).bind(symbol, quote.fetchedAt, quote.priceCents).run();
      if ((inserted.meta?.changes ?? 0) > 0) invalidateMemo('history:' + symbol + ':');
      return quote;
    } catch {
      if (previous) return previous;
      throw new Error(`Real quote unavailable for ${symbol}`);
    } finally {
      await env.DB.prepare('UPDATE quote_refresh_lock SET lease_until=0 WHERE symbol=? AND lease_until=?')
        .bind(symbol, leaseUntil).run().catch(() => {});
    }
  };
  const promise = task();
  inflight.set(symbol, promise);
  try { return await promise; } finally { inflight.delete(symbol); }
}

export async function allQuotes(env: MarketEnv, now = Math.floor(Date.now() / 1000)): Promise<Quote[]> {
  if (!env.FINNHUB_API_KEY) throw new Error('Real market data is not configured');
  // One indexed D1 query instead of a dozen separate reads per screen refresh.
  const rows = await memoized<StoredRow[]>('market:rows', 12000, async () => {
    const { results } = await env.DB.prepare(`SELECT symbol,price_cents,previous_close_cents,
      fetched_at,provider_at,mode,open_cents,high_cents,low_cents FROM quote_cache WHERE mode='finnhub'`).all<StoredRow>();
    return results;
  });
  const cache = new Map(rows.map(row => [row.symbol, row]));
  const found: Quote[] = [];
  // At most 5 parallel provider refreshes to stay below Workers Free's 6-connection ceiling.
  for (let i = 0; i < STOCKS.length; i += 5) {
    const settled = await Promise.allSettled(STOCKS.slice(i, i + 5).map(async stock => {
      const row = cache.get(stock.symbol);
      const quote = fromStored(stock.symbol, row ?? null, now);
      if (quote && now - row!.fetched_at < (quote.marketOpen ? MARKET_CACHE_SECONDS : CLOSED_CACHE_SECONDS))
        return quote;
      return quoteFor(stock.symbol, env, now, row ?? null);
    }));
    for (const result of settled)
      if (result.status === 'fulfilled') found.push(result.value);
  }
  return found;
}

export async function quoteHistory(
  symbol: SymbolCode, env: MarketEnv, range: HistoryRange = '1W',
  now = Math.floor(Date.now() / 1000),
): Promise<ChartHistory> {
  if (!env.FINNHUB_API_KEY) throw new Error('Real market data is not configured');
  return memoized('history:' + symbol + ':' + range, 90000, async () => {
    // For longer ranges prefer actual daily/weekly OHLC from the optional
    // backfill provider; preserve Finnhub's original observations as fallback.
    const archived = await historicalCandles(symbol,range,env,now);
    if (archived) return archived;
    // The WITHOUT ROWID table is indexed by (symbol, observed_at). All points are retained.
    const oldest = await env.DB.prepare(`SELECT observed_at AS at FROM quote_history
      WHERE symbol=? ORDER BY observed_at ASC LIMIT 1`).bind(symbol).first<{ at: number }>();
    const { startAt, bucketSeconds } = historyQueryWindow(range, oldest?.at ?? now, now);
    if (!oldest) return { candles: [], bucketSeconds };
    // Offset buckets to Monday 1970-01-05 UTC so weekly bars start on Mondays.
    const { results } = await env.DB.prepare(`WITH buckets AS (
        SELECT MIN(observed_at) AS firstAt, MAX(observed_at) AS lastAt,
          MIN(price_cents) AS lowCents, MAX(price_cents) AS highCents, COUNT(*) AS samples FROM quote_history
        WHERE symbol=? AND observed_at>=? AND observed_at<=?
        GROUP BY CAST((observed_at - 345600) / ? AS INTEGER)
      )
      SELECT buckets.*, first.price_cents AS openCents, last.price_cents AS closeCents FROM buckets
      JOIN quote_history first ON first.symbol=? AND first.observed_at=buckets.firstAt
      JOIN quote_history last ON last.symbol=? AND last.observed_at=buckets.lastAt
      ORDER BY firstAt`)
      .bind(symbol, startAt, now, bucketSeconds, symbol, symbol).all<Candle>();
    return { candles: results, bucketSeconds };
  });
}
