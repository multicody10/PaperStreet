import type { Candle, ChartHistory, HistoryRange, SymbolCode } from '../shared/stocks';
import { historyQueryWindow, isUsMarketOpen } from './market';
import { invalidateMemo, memoized } from './memo';

export interface AlpacaHistoryEnv {
  DB: D1Database;
  ALPACA_API_KEY_ID?: string;
  ALPACA_API_SECRET_KEY?: string;
}
type Frame = '15Min' | '1Day';
type Bar = { at: number; openCents: number; highCents: number; lowCents: number; closeCents: number };
type RawBar = { t?: unknown; o?: unknown; h?: unknown; l?: unknown; c?: unknown };
const DAY = 86400;
const MAX_PRICE_CENTS = 100_000_000;
const ET = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
});
const dateET = (at: number) => ET.format(new Date(at * 1000));
const seconds = (date: string) => Math.floor(Date.parse(date) / 1000);

export function parseAlpacaBar(raw: RawBar, frame: Frame, now: number): Bar | null {
  if (typeof raw.t !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(raw.t)) return null;
  const stamp = seconds(raw.t);
  if (!Number.isFinite(stamp) || stamp < seconds('2016-01-01T00:00:00Z') || stamp > now + 60) return null;
  const prices = [raw.o, raw.h, raw.l, raw.c];
  if (!prices.every(p => typeof p === 'number' && Number.isFinite(p) && p > 0 && p * 100 <= MAX_PRICE_CENTS)) return null;
  const [openCents, highCents, lowCents, closeCents] =
    (prices as number[]).map(p => Math.round(p * 100));
  if (lowCents > Math.min(openCents, closeCents) ||
      highCents < Math.max(openCents, closeCents) || lowCents > highCents) return null;
  const at = frame === '1Day' ? seconds(raw.t.slice(0, 10) + 'T17:00:00Z') : stamp;
  return { at, openCents, highCents, lowCents, closeCents };
}

export function aggregateAlpacaBars(bars: Bar[], bucketSeconds: number): Candle[] {
  const grouped = new Map<number, Candle>();
  const mondayOffset = bucketSeconds >= 7 * DAY ? 4 * DAY : 0;
  for (const bar of bars) {
    const bucket = Math.floor((bar.at - mondayOffset) / bucketSeconds);
    const found = grouped.get(bucket);
    if (found) {
      found.highCents = Math.max(found.highCents, bar.highCents);
      found.lowCents = Math.min(found.lowCents, bar.lowCents);
      found.closeCents = bar.closeCents;
      found.lastAt = bar.at;
      found.samples++;
    } else {
      grouped.set(bucket, { ...bar, firstAt: bar.at, lastAt: bar.at, samples: 1 });
    }
  }
  return [...grouped.values()];
}

async function refresh(symbol: SymbolCode, frame: Frame, env: AlpacaHistoryEnv, now: number) {
  const freshness = frame === '15Min' ? 20 * 60 : 60 * 60;
  const lease = now + 120;
  const lock = await env.DB.prepare(
    'INSERT INTO historical_sync(symbol,timeframe,refreshed_at,retry_after,lease_until) VALUES(?,?,0,0,?) ' +
    'ON CONFLICT(symbol,timeframe) DO UPDATE SET lease_until=excluded.lease_until ' +
    'WHERE historical_sync.refreshed_at<=? AND historical_sync.retry_after<=? ' +
    'AND historical_sync.lease_until<=? RETURNING symbol'
  ).bind(symbol, frame, lease, now - freshness, now, now).first<{ symbol: string }>();
  if (!lock) return;

  try {
    const progress = await env.DB.prepare(
      'SELECT refreshed_at FROM historical_sync WHERE symbol=? AND timeframe=?'
    ).bind(symbol, frame).first<{ refreshed_at: number }>();
    const start = frame === '15Min' ? now - 14 * DAY :
      progress?.refreshed_at ? now - 10 * DAY : seconds('2016-01-01T00:00:00Z');
    const end = now - 20 * 60; // The Basic historical feed restricts the latest 15 minutes.
    const endpoint = new URL('https://data.alpaca.markets/v2/stocks/' + symbol + '/bars');
    endpoint.searchParams.set('timeframe', frame);
    endpoint.searchParams.set('feed', 'iex');
    endpoint.searchParams.set('adjustment', 'split');
    endpoint.searchParams.set('start', new Date(start * 1000).toISOString());
    endpoint.searchParams.set('end', new Date(end * 1000).toISOString());
    endpoint.searchParams.set('limit', '10000');
    const bars = new Map<number, Bar>();
    let finished = false;
    for (let page = 0; page < 4; page++) {
      const response = await fetch(endpoint, {
        headers: { Accept: 'application/json', 'APCA-API-KEY-ID': env.ALPACA_API_KEY_ID!,
          'APCA-API-SECRET-KEY': env.ALPACA_API_SECRET_KEY! },
        signal: AbortSignal.timeout(9000),
      });
      if (!response.ok) throw new Error('Alpaca historical HTTP ' + response.status);
      const body = await response.json() as { bars?: unknown; next_page_token?: unknown };
      if (!Array.isArray(body.bars)) throw new Error('Invalid Alpaca bars response');
      for (const raw of body.bars) {
        if (!raw || typeof raw !== 'object') continue;
        const bar = parseAlpacaBar(raw as RawBar, frame, now);
        // A daily bar may still be forming while the exchange is open.
        if (!bar || (frame === '1Day' && isUsMarketOpen(now) && dateET(bar.at) === dateET(now))) continue;
        bars.set(bar.at, bar);
      }
      if (!body.next_page_token) { finished = true; break; }
      if (typeof body.next_page_token !== 'string') throw new Error('Invalid Alpaca pagination token');
      endpoint.searchParams.set('page_token', body.next_page_token);
    }
    if (!finished) throw new Error('Alpaca history exceeded page budget');

    const ordered = [...bars.values()].sort((a, b) => a.at - b.at);
    for (let i = 0; i < ordered.length; i += 75) {
      await env.DB.batch(ordered.slice(i, i + 75).map(bar =>
        env.DB.prepare(
          'INSERT INTO historical_ohlc(symbol,timeframe,at,open_cents,high_cents,low_cents,close_cents) ' +
          'VALUES(?,?,?,?,?,?,?) ON CONFLICT(symbol,timeframe,at) DO UPDATE SET ' +
          'open_cents=excluded.open_cents,high_cents=excluded.high_cents,' +
          'low_cents=excluded.low_cents,close_cents=excluded.close_cents'
        ).bind(symbol, frame, bar.at, bar.openCents, bar.highCents, bar.lowCents, bar.closeCents)
      ));
    }
    await env.DB.prepare(
      'UPDATE historical_sync SET refreshed_at=?,retry_after=0 WHERE symbol=? AND timeframe=? AND lease_until=?'
    ).bind(now, symbol, frame, lease).run();
    invalidateMemo('alpaca-history:' + symbol + ':');
  } catch {
    await env.DB.prepare(
      'UPDATE historical_sync SET retry_after=? WHERE symbol=? AND timeframe=? AND lease_until=?'
    ).bind(now + 180, symbol, frame, lease).run().catch(() => {});
    throw new Error('Alpaca historical data refresh failed');
  } finally {
    await env.DB.prepare(
      'UPDATE historical_sync SET lease_until=0 WHERE symbol=? AND timeframe=? AND lease_until=?'
    ).bind(symbol, frame, lease).run().catch(() => {});
  }
}

export async function alpacaHistory(
  symbol: SymbolCode, env: AlpacaHistoryEnv, range: HistoryRange,
  now = Math.floor(Date.now() / 1000),
): Promise<ChartHistory | null> {
  if (!env.ALPACA_API_KEY_ID || !env.ALPACA_API_SECRET_KEY) return null;
  const frame: Frame = range === '1D' || range === '1W' ? '15Min' : '1Day';
  let warning: string | undefined;
  try { await refresh(symbol, frame, env, now); }
  catch { warning = 'Alpaca refresh failed; using cached candles'; }

  const cached = await memoized('alpaca-history:' + symbol + ':' + range, 60000, async () => {
    const from = range === 'ALL' ? 0 : range === '1D' ? now - 14 * DAY :
      range === '1W' ? now - 7 * DAY :
      range === '1M' ? now - 30 * DAY :
      range === '3M' ? now - 90 * DAY : now - 365 * DAY;
    const { results } = await env.DB.prepare(
      'SELECT at,open_cents AS openCents,high_cents AS highCents,low_cents AS lowCents,' +
      'close_cents AS closeCents FROM historical_ohlc ' +
      'WHERE symbol=? AND timeframe=? AND at>=? ORDER BY at'
    ).bind(symbol, frame, from).all<Bar>();
    const latestDate = results.length ? dateET(results[results.length - 1].at) : '';
    const rows = range === '1D' ? results.filter(bar => dateET(bar.at) === latestDate) : results;
    const bucketSeconds = range === '1D' ? 900 : range === '1W' ? 3600 :
      historyQueryWindow(range, rows[0]?.at ?? now, now).bucketSeconds;
    return { candles: aggregateAlpacaBars(rows, bucketSeconds), bucketSeconds,
      source: 'alpaca' as const };
  });
  return { ...cached, warning };
}
