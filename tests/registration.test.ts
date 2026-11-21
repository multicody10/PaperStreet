import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { ensurePortfolioCommand } from '../worker/registration';

const id = '123456789012345678';
const key = 'a'.repeat(64);
const commandId = '987654321098765432';

function harness(t: TestContext, startingCommands: object[] = []) {
  let row: { version: number; checked_at: number; last_attempt_at: number; last_result: string } | null = null;
  const calls: { url: string; method: string; body?: unknown }[] = [];
  const db = {
    prepare() {
      return {
        values: [] as unknown[],
        bind(...values: unknown[]) { this.values = values; return this; },
        async first() { return row; },
        async run() {
          row = {
            version: Number(this.values[1]), checked_at: Number(this.values[2]),
            last_attempt_at: Number(this.values[3]), last_result: String(this.values[4]),
          };
          return { success: true };
        },
      };
    },
  } as unknown as D1Database;
  const env = { DB: db, DISCORD_CLIENT_ID: id, DISCORD_CLIENT_SECRET: 'mock-secret', DISCORD_PUBLIC_KEY: key };
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, options?: RequestInit): Promise<Response> => {
    const url = String(input);
    calls.push({ url, method: options?.method ?? 'GET', body: options?.body instanceof URLSearchParams
      ? Object.fromEntries(options.body.entries()) : options?.body ? JSON.parse(String(options.body)) : undefined });
    if (url.endsWith('/oauth2/token')) return Response.json({ access_token: 'mock-oauth-token' });
    assert.equal(new Headers(options?.headers).get('Authorization'), 'Bearer mock-oauth-token');
    if (url.endsWith('/commands') && options?.method !== 'POST') return Response.json(startingCommands);
    if (url.endsWith('/commands') && options?.method === 'POST') return Response.json({
      id: commandId, application_id: id, type: 1, name: 'portfolio',
      description: 'View your PaperStreet portfolio, holdings and profit or loss',
    });
    throw new Error('Unexpected Discord endpoint');
  });
  return { env, calls, get row() { return row; } };
}

test('scheduled registration creates /portfolio without updating Discord Launch', async t => {
  const h = harness(t, [{ id: '555555555555555555', application_id: id, type: 4, name: 'Launch', handler: 2 }]);
  await ensurePortfolioCommand(h.env, 10000);
  assert.equal(h.row?.last_result, 'registered');
  const commandWrites = h.calls.filter(c => c.method === 'POST' && c.url.endsWith('/commands'));
  assert.equal(commandWrites.length, 1);
  assert.deepEqual(commandWrites[0].body, {
    type: 1, name: 'portfolio', description: 'View your PaperStreet portfolio, holdings and profit or loss',
  });
  assert.ok(h.calls.every(c => !c.url.includes('/commands/555555555555555555')));
  assert.ok(h.calls.every(c => c.method !== 'PATCH' && c.method !== 'DELETE'));
  await ensurePortfolioCommand(h.env, 10300);
  assert.equal(commandWrites.length, 1);
  assert.equal(h.calls.length, 3);
});

test('already registered /portfolio is verified without POST or overwriting commands', async t => {
  const h = harness(t, [{
    id: commandId, application_id: id, type: 1, name: 'portfolio',
    description: 'View your PaperStreet portfolio, holdings and profit or loss',
  }]);
  await ensurePortfolioCommand(h.env, 10000);
  assert.equal(h.row?.last_result, 'verified');
  assert.equal(h.calls.filter(c => c.method === 'POST' && c.url.endsWith('/commands')).length, 0);
});

test('missing credentials are reported without contacting Discord', async t => {
  const h = harness(t);
  h.env.DISCORD_CLIENT_SECRET = '';
  await ensurePortfolioCommand(h.env, 10000);
  assert.equal(h.row?.last_result, 'missing_discord_configuration');
  assert.equal(h.calls.length, 0);
});

test('provider errors are recorded with bounded retry rate', async t => {
  const h = harness(t);
  t.mock.restoreAll();
  let attempts = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    attempts++;
    return new Response('Denied', { status: 401 });
  });
  await ensurePortfolioCommand(h.env, 10000);
  assert.equal(h.row?.last_result, 'oauth_http_401');
  await ensurePortfolioCommand(h.env, 10030);
  assert.equal(attempts, 1);
});
