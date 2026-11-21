import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { parseFinnhubQuote, quoteHistory } from '../worker/market';

test('the first quote can supply a session candle without compromising a usable last price', () => {
  const now = 1795200000;
  const payload = { t: now, c: 100.2, pc: 99.76, o: 99.87, h: 100.93, l: 99.41 };
  const parse = (changes: Partial<typeof payload>) => parseFinnhubQuote('AAPL', { ...payload, ...changes }, now);
  assert.deepEqual(parse({}).sessionBar, { openCents: 9987, highCents: 10093, lowCents: 9941, closeCents: 10020 });
  for (const change of [{ o: undefined }, { h: 100 }, { l: 0 }, { o: 120 }, { h: NaN }]) {
    assert.equal(parse(change).sessionBar, undefined);
    assert.equal(parse(change).priceCents, 10020);
  }
});

test('history aggregates first, last and interior extremes and skips empty intervals', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    for (const file of ['0001_init', '0002_real_market', '0005_quote_session_range']) {
      db.exec(readFileSync(new URL(`../migrations/${file}.sql`, import.meta.url), 'utf8'));
    }
    const base = Math.floor(1795200000 / 900) * 900;
    const insert = db.prepare('INSERT INTO quote_history VALUES (?,?,?)');
    for (const [offset, cents] of [[15, 100], [78, 144], [300, 92], [456, 103], [2700, 110]]) {
      insert.run('AAPL', base + offset, cents);
    }
    insert.run('NVDA', base + 120, 999);
    insert.run('AAPL', base - 2 * 86400, 300);
    const env = { FINNHUB_API_KEY: 'fixture', DB: {
      prepare(sql: string) {
        const stmt = db.prepare(sql);
        return { bind: (...args: (number | string)[]) => ({
          first: () => stmt.get(...args), all: () => ({ results: stmt.all(...args) }),
        }) };
      },
    } as unknown as D1Database };
    const history = await quoteHistory('AAPL', env, '1D', base + 3000);
    assert.equal(history.bucketSeconds, 900);
    assert.deepEqual(history.candles.map(bar => ({ ...bar })), [
      { firstAt: base + 15, lastAt: base + 456, lowCents: 92, highCents: 144, samples: 4, openCents: 100, closeCents: 103 },
      { firstAt: base + 2700, lastAt: base + 2700, lowCents: 110, highCents: 110, samples: 1, openCents: 110, closeCents: 110 },
    ]);
  } finally {
    db.close();
  }
});
