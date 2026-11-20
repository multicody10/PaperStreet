import { STOCKS, type Quote, type SymbolCode } from '../shared/stocks';

export interface MarketEnv { DB: D1Database; FINNHUB_API_KEY?: string }
type CacheRow = { price_cents: number; previous_close_cents: number; fetched_at: number; provider_at: number | null; mode: string };
type ProviderPayload = { c?: unknown; pc?: unknown; t?: unknown };
const STOCK_NAMES = new Map<SymbolCode, string>(STOCKS.map(s => [s.symbol, s.name]));
const MARKET_CACHE_SECONDS = 300;
const CLOSED_CACHE_SECONDS = 3600;
const MAX_TRADE_AGE_SECONDS = 20 * 60; // During exchange hours, avoid fills against outdated quotes.
const MAX_OFFHOURS_AGE_SECONDS = 7 * 86400; // Last verified exchange price can be used on weekends and holidays.
const LEASE_SECONDS = 12;
const MAX_PRICE_CENTS = 100_000_000;

function nthWeekday(year: number, month: number, weekday: number, nth: number): number {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return 1 + (weekday - first + 7) % 7 + (nth - 1) * 7;
}
function lastWeekday(year: number, month: number, weekday: number): number {
  const last = new Date(Date.UTC(year, month, 0));
  return last.getUTCDate() - (last.getUTCDay() - weekday + 7) % 7;
}
function observed(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay();
  if (weekday === 6) date.setUTCDate(date.getUTCDate() - 1);
  if (weekday === 0) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
function easterSunday(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k + 7 * 6) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = (h + l - 7 * m + 114) % 31 + 1;
  return new Date(Date.UTC(year, month - 1, day));
}
export function isUsMarketOpen(now = Math.floor(Date.now() / 1000)): boolean {
  const fields = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(new Date(now * 1000));
  const p = Object.fromEntries(fields.map(({ type, value }) => [type, value]));
  if (p.weekday === 'Sat' || p.weekday === 'Sun') return false;
  const year = Number(p.year), month = Number(p.month), day = Number(p.day);
  const date = `${p.year}-${p.month}-${p.day}`;
  const goodFriday = easterSunday(year);
  goodFriday.setUTCDate(goodFriday.getUTCDate() - 2);
  const holidays = new Set([
    observed(year - 1, 1, 1), observed(year, 1, 1), observed(year + 1, 1, 1),
    `${year}-01-${String(nthWeekday(year, 1, 1, 3)).padStart(2, '0')}`, // MLK Day
    `${year}-02-${String(nthWeekday(year, 2, 1, 3)).padStart(2, '0')}`, // Presidents' Day
    goodFriday.toISOString().slice(0, 10),
    `${year}-05-${String(lastWeekday(year, 5, 1)).padStart(2, '0')}`,
    observed(year, 6, 19), observed(year, 7, 4),
    `${year}-09-${String(nthWeekday(year, 9, 1, 1)).padStart(2, '0')}`,
    `${year}-11-${String(nthWeekday(year, 11, 4, 4)).padStart(2, '0')}`,
    observed(year, 12, 25),
  ]);
  if (holidays.has(date)) return false;
  const minutes = Number(p.hour) * 60 + Number(p.minute);
  if (minutes < 570) return false;
  const thanksgiving = nthWeekday(year, 11, 4, 4);
  const earlyClose = (month === 11 && day === thanksgiving + 1) ||
    (month === 7 && day === 3) || (month === 12 && day === 24);
  return minutes < (earlyClose ? 780 : 960);
}

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
    changePct: Math.round((priceCents / previousCloseCents - 1) * 10000) / 100,
    fetchedAt: t, source: 'finnhub', stale: now - t > (marketOpen ? MAX_TRADE_AGE_SECONDS : MAX_OFFHOURS_AGE_SECONDS), marketOpen };
}

// The virtual exchange remains available after hours; only quote validity controls execution.
export const isQuoteExecutable = (quote: Quote): boolean =>
  quote.source === 'finnhub' && !quote.stale && Number.isSafeInteger(quote.priceCents) && quote.priceCents > 0;

const inflight = new Map<SymbolCode, Promise<Quote>>();
export async function quoteFor(symbol: SymbolCode, env: MarketEnv, now = Math.floor(Date.now() / 1000)): Promise<Quote> {
  if (!env.FINNHUB_API_KEY) throw new Error('Real market data is not configured');
  const row = await env.DB.prepare(`SELECT price_cents,previous_close_cents,fetched_at,provider_at,mode
    FROM quote_cache WHERE symbol=? AND mode='finnhub'`).bind(symbol).first<CacheRow>();
  const cached = (): Quote | null => {
    if (!row?.provider_at || row.provider_at > now + 60) return null;
    const marketOpen = isUsMarketOpen(now);
    return { symbol, name: STOCK_NAMES.get(symbol)!, priceCents: row.price_cents,
      previousCloseCents: row.previous_close_cents,
      changePct: Math.round((row.price_cents / row.previous_close_cents - 1) * 10000) / 100,
      fetchedAt: row.provider_at, source: 'finnhub',
      stale: now - row.provider_at > (marketOpen ? MAX_TRADE_AGE_SECONDS : MAX_OFFHOURS_AGE_SECONDS), marketOpen };
  };
  const previous = cached();
  if (previous && now - row!.fetched_at < (previous.marketOpen ? MARKET_CACHE_SECONDS : CLOSED_CACHE_SECONDS)) return previous;
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
      await env.DB.prepare(`INSERT INTO quote_cache(symbol,price_cents,previous_close_cents,fetched_at,provider_at,mode)
        VALUES(?,?,?,?,?,'finnhub') ON CONFLICT(symbol) DO UPDATE SET price_cents=excluded.price_cents,
        previous_close_cents=excluded.previous_close_cents,fetched_at=excluded.fetched_at,
        provider_at=excluded.provider_at,mode='finnhub' WHERE excluded.fetched_at >= quote_cache.fetched_at`)
        .bind(symbol, quote.priceCents, quote.previousCloseCents, now, quote.fetchedAt).run();
      await env.DB.prepare(`INSERT OR IGNORE INTO quote_history(symbol,observed_at,price_cents) VALUES(?,?,?)`)
        .bind(symbol, quote.fetchedAt, quote.priceCents).run();
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

export async function allQuotes(env: MarketEnv): Promise<Quote[]> {
  if (!env.FINNHUB_API_KEY) throw new Error('Real market data is not configured');
  const settled = await Promise.allSettled(STOCKS.map(s => quoteFor(s.symbol, env)));
  return settled.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
}

export async function quoteHistory(symbol: SymbolCode, env: MarketEnv, now = Math.floor(Date.now() / 1000)) {
  if (!env.FINNHUB_API_KEY) throw new Error('Real market data is not configured');
  const { results } = await env.DB.prepare(`SELECT observed_at AS at,price_cents AS priceCents FROM quote_history
    WHERE symbol=? AND observed_at>=? ORDER BY observed_at DESC LIMIT 144`)
    .bind(symbol, now - 12 * 3600).all<{ at: number; priceCents: number }>();
  return results.reverse();
}
