import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import worker from '../worker/index';
import { settlePredictions } from '../worker/gameplay';
import type { MarketEnv } from '../worker/market';

const seconds = (iso: string) => Date.parse(iso) / 1000;

test('UTC cron only targets the weekday window containing all EST and EDT US sessions', () => {
  const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8')) as
    { triggers: { crons: string[] } };
  assert.deepEqual(config.triggers.crons, ['*/5 13-20 * * 1-5']);
});

test('scheduled handler performs no work outside regular market hours', () => {
  let backgroundJobs = 0;
  const ctx = { waitUntil() { backgroundJobs++; } } as unknown as ExecutionContext;
  const env = { FINNHUB_API_KEY: 'fake-test-key' } as Parameters<typeof worker.scheduled>[1];
  const closed = [
    '2026-11-21T15:00:00Z', // Saturday
    '2026-11-26T16:00:00Z', // Thanksgiving
    '2026-11-20T14:25:00Z', // Before a winter opening
    '2026-11-20T21:00:00Z', // After winter close
    '2026-07-07T20:00:00Z', // After summer close
    '2026-11-27T18:00:00Z', // Black Friday early close
  ];
  for (const iso of closed)
    worker.scheduled({ scheduledTime: Date.parse(iso) } as ScheduledController, env, ctx);
  assert.equal(backgroundJobs, 0);
});

test('predictions are not settled from an unfinished same-day session', async () => {
  const statements: string[] = [];
  const db = {
    prepare(sql: string) {
      statements.push(sql);
      return { bind() { return { async all() { return { results: [] }; } }; } };
    },
  };
  const env = { DB: db } as unknown as MarketEnv;
  assert.equal(await settlePredictions(env, seconds('2026-11-20T20:55:00Z')), 0);
  assert.match(statements[0], /target_date<\?/);
  assert.doesNotMatch(statements[0], /target_date<=\?/);
});
