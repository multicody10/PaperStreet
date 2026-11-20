import assert from 'node:assert/strict';
import { test } from 'node:test';
import { historyQueryWindow, isUsMarketOpen, isHistoryRange, isQuoteExecutable, parseFinnhubQuote } from '../worker/market';
import { STOCKS, isSymbol, STARTING_CASH_CENTS } from '../shared/stocks';

const et = (date: string) => Math.floor(Date.parse(date) / 1000);
test('stock symbols are strictly allowlisted', () => {
  assert.equal(isSymbol('AAPL'), true);
  assert.equal(isSymbol('AAPL; DROP TABLE players'), false);
  assert.equal(isSymbol('aapl'), false);
  assert.equal(isSymbol(null), false);
  assert.equal(STOCKS.length, 12);
});
test('new accounts start with virtual $1,000', () => assert.equal(STARTING_CASH_CENTS, 100_000));
test('exchange session respects NY time, DST and major holidays', () => {
  assert.equal(isUsMarketOpen(et('2026-11-20T15:00:00Z')), true); // Fri 10 AM EST
  assert.equal(isUsMarketOpen(et('2026-11-20T21:00:00Z')), false); // Fri 4 PM EST
  assert.equal(isUsMarketOpen(et('2026-07-07T14:00:00Z')), true); // Tue 10 AM EDT
  assert.equal(isUsMarketOpen(et('2026-11-21T15:00:00Z')), false); // Saturday
  assert.equal(isUsMarketOpen(et('2026-11-26T15:00:00Z')), false); // Thanksgiving
  assert.equal(isUsMarketOpen(et('2026-04-03T15:00:00Z')), false); // Good Friday
  assert.equal(isUsMarketOpen(et('2026-11-27T17:59:00Z')), true); // Black Friday before 1 PM
  assert.equal(isUsMarketOpen(et('2026-11-27T18:00:00Z')), false); // Early close
});
test('valid provider quote contains real source timestamp and correctly computed cents', () => {
  const now = et('2026-11-20T15:00:00Z');
  const quote = parseFinnhubQuote('AAPL', { c: 192.345, pc: 190.12, t: now - 15 }, now);
  assert.equal(quote.priceCents, 19235);
  assert.equal(quote.previousCloseCents, 19012);
  assert.equal(quote.fetchedAt, now - 15);
  assert.equal(quote.source, 'finnhub');
  assert.equal(quote.stale, false);
  assert.equal(quote.marketOpen, true);
});
test('outdated quotes are marked stale during trading hours', () => {
  const now = et('2026-11-20T15:00:00Z');
  assert.equal(parseFinnhubQuote('AAPL', { c: 200, pc: 199, t: now - 3600 }, now).stale, true);
  assert.equal(parseFinnhubQuote('AAPL', { c: 200, pc: 199, t: now - 900 }, now).stale, false);
});
test('virtual trades use verified Finnhub prices around the clock', () => {
  const fridayClose = et('2026-11-20T20:59:00Z');
  const price = { c: 192.35, pc: 190.12, t: fridayClose };
  for (const at of [
    et('2026-11-20T22:00:00Z'), // Friday after hours
    et('2026-11-21T15:00:00Z'), // Saturday
    et('2026-11-22T15:00:00Z'), // Sunday
    et('2026-11-23T14:00:00Z'), // Monday premarket
  ]) {
    const quote = parseFinnhubQuote('AAPL', price, at);
    assert.equal(quote.marketOpen, false);
    assert.equal(quote.stale, false);
    assert.equal(isQuoteExecutable(quote), true);
    assert.equal(quote.fetchedAt, fridayClose);
  }
});

test('very old prices cannot execute even on weekends or holidays', () => {
  const now = et('2026-11-28T15:00:00Z'); // Saturday, eight days after the last trade
  const quote = parseFinnhubQuote('AAPL', { c: 192.35, pc: 190.12, t: et('2026-11-20T20:59:00Z') }, now);
  assert.equal(quote.marketOpen, false);
  assert.equal(quote.stale, true);
  assert.equal(isQuoteExecutable(quote), false);
});

test('a stale quote during a live session cannot execute', () => {
  const now = et('2026-11-20T15:00:00Z');
  const quote = parseFinnhubQuote('AAPL', { c: 200, pc: 199, t: now - 3600 }, now);
  assert.equal(quote.marketOpen, true);
  assert.equal(quote.stale, true);
  assert.equal(isQuoteExecutable(quote), false);
});

test('invalid or unverifiable provider quotes are never accepted', () => {
  const now = et('2026-11-20T15:00:00Z');
  for (const raw of [
    { c: 0, pc: 190, t: now }, { c: 123, pc: 0, t: now },
    { c: 123, pc: 120 }, { c: 123, pc: 120, t: now + 120 },
    { c: 1e12, pc: 120, t: now }, { c: '123', pc: 120, t: now },
    { c: 123, pc: 120, t: NaN }, { c: 123, pc: 120, t: 0 },
  ]) assert.throws(() => parseFinnhubQuote('AAPL', raw, now));
});

test('UI time ranges select observations without deleting historical records', () => {
  const now = et('2026-11-20T20:00:00Z');
  const oldest = now - 2 * 365 * 86400;
  assert.deepEqual(historyQueryWindow('ALL', oldest, now).startAt, oldest);
  assert.equal(historyQueryWindow('1D', oldest, now).startAt, now - 86400);
  assert.equal(historyQueryWindow('1W', oldest, now).startAt, now - 7 * 86400);
  assert.equal(historyQueryWindow('1M', oldest, now).startAt, now - 30 * 86400);
  assert.equal(historyQueryWindow('3M', oldest, now).startAt, now - 90 * 86400);
  assert.equal(historyQueryWindow('1Y', oldest, now).startAt, now - 365 * 86400);
  assert.ok(historyQueryWindow('ALL', oldest, now).bucketSeconds >= 3600);
  for (const range of ['1D', '1W', '1M', '3M', '1Y', 'ALL'])
    assert.equal(isHistoryRange(range), true);
  assert.equal(isHistoryRange('infinity'), false);
  assert.equal(isHistoryRange('../../'), false);
});

test('fixed price history bucket spacing is bounded to about 240 actual data points', () => {
  const now = et('2026-11-20T20:00:00Z');
  for (const range of ['1D', '1W', '1M', '3M', '1Y', 'ALL'] as const) {
    const { startAt, bucketSeconds } = historyQueryWindow(range, now - 4 * 365 * 86400, now);
    assert.ok((now - startAt) / bucketSeconds <= 240);
    assert.ok(bucketSeconds >= 60);
  }
});
