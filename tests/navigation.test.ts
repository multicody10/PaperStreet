import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appHash, parseAppHash } from '../src/navigation';

test('dashboard is the default read-only entry point', () => {
  assert.deepEqual(parseAppHash(''), { view: 'dashboard', symbol: 'AAPL' });
  assert.deepEqual(parseAppHash('#/dashboard'), { view: 'dashboard', symbol: 'AAPL' });
  assert.deepEqual(parseAppHash('#/unknown'), { view: 'dashboard', symbol: 'AAPL' });
  assert.equal(appHash('dashboard'), '#/dashboard');
});

test('trade market and individual stock detail use separate routes', () => {
  assert.deepEqual(parseAppHash('#/trade'), { view: 'trade', symbol: 'AAPL' });
  assert.deepEqual(parseAppHash('#/trade/NVDA'), { view: 'stock', symbol: 'NVDA' });
  assert.equal(appHash('stock', 'MSFT'), '#/trade/MSFT');
  for (const route of ['#/portfolio', '#/leaderboard', '#/history'])
    assert.equal(parseAppHash(route).view, route.slice(2));
});

test('only strictly supported symbols resolve as tradeable stock pages', () => {
  for (const route of ['#/trade/XYZ', '#/trade/aapl', '#/trade/AAPL/../../evil', '#/trade/%2F', '#/trade/'])
    assert.equal(parseAppHash(route).view, 'dashboard');
});
