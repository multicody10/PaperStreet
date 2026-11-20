import assert from 'node:assert/strict';
import { test } from 'node:test';
import { invalidateMemo, memoized } from '../worker/memo';

test('repeat and concurrent reads reuse a single loader', async () => {
  let loads = 0;
  const load = async () => { loads++; return { real: 42 }; };
  const [a, b] = await Promise.all([
    memoized('test:coalesce', 60000, load),
    memoized('test:coalesce', 60000, load),
  ]);
  assert.deepEqual(a, b);
  assert.deepEqual(await memoized('test:coalesce', 60000, load), a);
  assert.equal(loads, 1);
  invalidateMemo('test:');
  await memoized('test:coalesce', 60000, load);
  assert.equal(loads, 2);
});

test('invalidating during a pending load prevents stale cache resurrection', async () => {
  let resolve!: (value: number) => void;
  const old = memoized('test:race', 60000, () => new Promise<number>(done => { resolve = done; }));
  invalidateMemo('test:race');
  assert.equal(await memoized('test:race', 60000, async () => 2), 2);
  resolve(1);
  assert.equal(await old, 1);
  assert.equal(await memoized('test:race', 60000, async () => 3), 2);
});

test('failed loads are not retained and unrelated keys remain cached', async () => {
  let attempts = 0;
  await assert.rejects(() => memoized('test:failed', 60000, async () => {
    attempts++; throw new Error('provider unavailable');
  }), /provider unavailable/);
  assert.equal(await memoized('test:failed', 60000, async () => ++attempts), 2);
  const x = await memoized('safe:unrelated', 60000, async () => 99);
  invalidateMemo('test:');
  assert.equal(await memoized('safe:unrelated', 60000, async () => 1), x);
});
