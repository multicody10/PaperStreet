import { STOCKS, type Quote, type SymbolCode } from '../shared/stocks';

export interface MarketEnv { DB: D1Database; MARKET_MODE?: string; FINNHUB_API_KEY?: string }
type CacheRow = { symbol: string; price_cents: number; previous_close_cents: number; fetched_at: number; mode: string };
const LOOKUP = new Map<SymbolCode, (typeof STOCKS)[number]>(STOCKS.map(stock => [stock.symbol, stock]));
const SLOT_SECONDS = 15 * 60;
const TTL_SECONDS = 90;

export function simulatedQuote(symbol: SymbolCode, now = Math.floor(Date.now() / 1000)): Quote {
  const stock = LOOKUP.get(symbol)!;
  const seed = [...symbol].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 17) % 997;
  const slot = Math.floor(now / SLOT_SECONDS);
  const value = (tick: number) => Math.round(stock.baseCents * (1 + 0.065 * Math.sin(tick / 41 + seed) + 0.023 * Math.sin(tick / 7 + seed * 0.31)));
  const priceCents = Math.max(1, value(slot));
  const previousCloseCents = Math.max(1, value(slot - 96));
  return { symbol, name: stock.name, priceCents, previousCloseCents,
    changePct: Math.round((priceCents / previousCloseCents - 1) * 10000) / 100,
    fetchedAt: slot * SLOT_SECONDS, source: 'simulated', stale: false };
}

// Server-authored history matches the same deterministic simulated quotes used to fill orders.
// No synthetic chart is ever shown for real quote mode, which has no historical feed.
export function simulatedHistory(symbol: SymbolCode, now = Math.floor(Date.now() / 1000)) {
  const end = Math.floor(now / SLOT_SECONDS) * SLOT_SECONDS;
  return Array.from({ length: 49 }, (_, index) => {
    const at = end - (48 - index) * SLOT_SECONDS;
    return { at, priceCents: simulatedQuote(symbol, at).priceCents };
  });
}

export async function quoteFor(symbol: SymbolCode, env: MarketEnv, now = Math.floor(Date.now() / 1000)): Promise<Quote> {
  const mode = env.MARKET_MODE === 'finnhub' ? 'finnhub' : 'simulated';
  const stock = LOOKUP.get(symbol)!;
  const cached = await env.DB.prepare('SELECT symbol, price_cents, previous_close_cents, fetched_at, mode FROM quote_cache WHERE symbol=?').bind(symbol).first<CacheRow>();
  const quoteFromCache = (stale: boolean): Quote => ({
    symbol, name: stock.name, priceCents: cached!.price_cents, previousCloseCents: cached!.previous_close_cents,
    changePct: Math.round((cached!.price_cents / cached!.previous_close_cents - 1) * 10000) / 100,
    fetchedAt: cached!.fetched_at, source: mode, stale,
  });
  if (mode === 'simulated') {
    const quote = simulatedQuote(symbol, now);
    if (cached?.mode === mode && cached.fetched_at === quote.fetchedAt) return quote;
    await storeQuote(env.DB, quote);
    return quote;
  }
  if (cached?.mode === mode && now - cached.fetched_at < TTL_SECONDS) return quoteFromCache(false);
  if (!env.FINNHUB_API_KEY) throw new Error('FINNHUB_API_KEY is not configured');
  try {
    const endpoint = new URL('https://finnhub.io/api/v1/quote');
    endpoint.searchParams.set('symbol', symbol);
    endpoint.searchParams.set('token', env.FINNHUB_API_KEY);
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(3500) });
    if (!response.ok) throw new Error(`Quote provider returned ${response.status}`);
    const payload = await response.json() as { c?: number; pc?: number };
    if (!Number.isFinite(payload.c) || !Number.isFinite(payload.pc) || (payload.c ?? 0) <= 0 || (payload.pc ?? 0) <= 0) throw new Error('Invalid quote');
    const quote: Quote = { symbol, name: stock.name, priceCents: Math.round(payload.c! * 100), previousCloseCents: Math.round(payload.pc! * 100),
      changePct: Math.round((payload.c! / payload.pc! - 1) * 10000) / 100, fetchedAt: now, source: 'finnhub', stale: false };
    await storeQuote(env.DB, quote);
    return quote;
  } catch {
    if (cached?.mode === mode) return quoteFromCache(true);
    throw new Error(`Quote unavailable for ${symbol}`);
  }
}
async function storeQuote(db: D1Database, quote: Quote) {
  await db.prepare(`INSERT INTO quote_cache(symbol,price_cents,previous_close_cents,fetched_at,mode)
    VALUES(?,?,?,?,?) ON CONFLICT(symbol) DO UPDATE SET price_cents=excluded.price_cents,
    previous_close_cents=excluded.previous_close_cents,fetched_at=excluded.fetched_at,mode=excluded.mode
    WHERE excluded.fetched_at >= quote_cache.fetched_at OR excluded.mode != quote_cache.mode`)
    .bind(quote.symbol, quote.priceCents, quote.previousCloseCents, quote.fetchedAt, quote.source).run();
}
export async function allQuotes(env: MarketEnv): Promise<Quote[]> {
  // A small, bounded symbol universe limits upstream API calls and D1 reads on the free tier.
  const quotes = await Promise.allSettled(STOCKS.map(s => quoteFor(s.symbol, env)));
  return quotes.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
}
