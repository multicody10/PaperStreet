import assert from 'node:assert/strict';
import { test } from 'node:test';
import { simulatedQuote, simulatedHistory } from '../worker/market';
import { STOCKS, isSymbol, STARTING_CASH_CENTS } from '../shared/stocks';

test('stock symbols are strictly allowlisted', () => {
  assert.equal(isSymbol('AAPL'), true);
  assert.equal(isSymbol('AAPL; DROP TABLE players'), false);
  assert.equal(isSymbol('aapl'), false);
  assert.equal(isSymbol(null), false);
});
test('each simulated quote is deterministic per time slot and has a clear source', () => {
  for (const stock of STOCKS) {
    const a = simulatedQuote(stock.symbol, 1795210000);
    const b = simulatedQuote(stock.symbol, 1795210090);
    assert.deepEqual(a, b);
    assert.ok(a.priceCents > 0);
    assert.equal(a.source, 'simulated');
    assert.equal(a.stale, false);
  }
});
test('time advances market prices', () => {
  assert.notEqual(simulatedQuote('AAPL', 1795210000).priceCents, simulatedQuote('AAPL', 1795210000 + 900 * 10).priceCents);
});
test('starting balance is exactly $10,000', () => assert.equal(STARTING_CASH_CENTS, 1_000_000));

test('simulated price history is chronological and agrees with execution quotes', () => {
  const now = 1795210000;
  const points = simulatedHistory('AAPL', now);
  assert.equal(points.length, 49);
  assert.equal(points[0].at, points.at(-1)!.at - 48 * 900);
  for (let i = 0; i < points.length; i++) {
    assert.equal(points[i].priceCents, simulatedQuote('AAPL', points[i].at).priceCents);
    if (i > 0) assert.equal(points[i].at - points[i - 1].at, 900);
  }
});
