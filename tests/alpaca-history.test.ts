import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { aggregateAlpacaBars, parseAlpacaBar } from '../worker/alpaca-history';

const now = Date.parse('2026-11-21T18:00:00Z') / 1000;

test('Alpaca OHLC normalization validates timestamps, price ranges and cents', () => {
  const sample = { t: '2026-11-20T05:00:00Z', o: 185.11, h: 191.93, l: 184.09, c: 190.21 };
  assert.deepEqual(parseAlpacaBar(sample, '1Day', now), {
    at: Date.parse('2026-11-20T17:00:00Z') / 1000,
    openCents: 18511, highCents: 19193, lowCents: 18409, closeCents: 19021,
  });
  assert.equal(parseAlpacaBar({ ...sample, l: 190.99 }, '1Day', now), null);
  assert.equal(parseAlpacaBar({ ...sample, c: 0 }, '15Min', now), null);
  assert.equal(parseAlpacaBar({ ...sample, h: '190' }, '1Day', now), null);
  assert.equal(parseAlpacaBar({ ...sample, t: 'invalid' }, '1Day', now), null);
  assert.equal(parseAlpacaBar({ ...sample, t: '2030-01-01T05:00:00Z' }, '1Day', now), null);
});
test('aggregated candles preserve true opens, closes, price extremes and sample counts', () => {
  const rows = [
    { at: 3601, openCents: 100, highCents: 130, lowCents: 95, closeCents: 110 },
    { at: 3901, openCents: 110, highCents: 140, lowCents: 108, closeCents: 112 },
    { at: 7201, openCents: 105, highCents: 115, lowCents: 100, closeCents: 108 },
  ];
  const bars = aggregateAlpacaBars(rows, 3600);
  assert.equal(bars.length, 2);
  assert.deepEqual([bars[0].openCents,bars[0].highCents,bars[0].lowCents,bars[0].closeCents,bars[0].samples], [100,140,95,112,2]);
  assert.deepEqual([bars[1].openCents,bars[1].highCents,bars[1].lowCents,bars[1].closeCents,bars[1].samples], [105,115,100,108,1]);
});
test('Alpaca migration keeps OHLC and source refresh state outside quote_cache', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(readFileSync(new URL('../migrations/0014_alpaca_history.sql', import.meta.url), 'utf8'));
    db.prepare('INSERT INTO historical_ohlc VALUES(?,?,?,?,?,?,?)').run('NVDA','1Day',1763686800,18500,19100,18000,19000);
    const row = db.prepare('SELECT close_cents FROM historical_ohlc WHERE symbol=?').get('NVDA');
    assert.equal(row?.close_cents,19000);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='quote_cache'").get(),undefined);
  } finally { db.close(); }
});
