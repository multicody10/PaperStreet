import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { deployPortfolioCommand } from '../worker/registration';

const appId = '123456789012345678';
const commandId = '987654321098765432';
const key = 'a'.repeat(64);
const description = 'View your PaperStreet portfolio, holdings and profit or loss';

function harness(t: TestContext, original: object[] = []) {
  let row: { version: number; checked_at: number; last_attempt_at: number; last_result: string } | null = null;
  const commands = [...original];
  const calls: { url: string; method: string; body?: unknown }[] = [];
  const db = {
    prepare() {
      return {
        args: [] as unknown[],
        bind(...values: unknown[]) { this.args = values; return this; },
        async first() { return row; },
        async run() {
          row = {
            version: Number(this.args[1]), checked_at: Number(this.args[2]),
            last_attempt_at: Number(this.args[3]), last_result: String(this.args[4]),
          };
          return { success: true };
        },
      };
    },
  } as unknown as D1Database;
  const env = { DB: db, DISCORD_CLIENT_ID: appId, DISCORD_CLIENT_SECRET: 'mock-secret', DISCORD_PUBLIC_KEY: key };
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, options?: RequestInit) => {
    const url = String(input), method = options?.method ?? 'GET';
    assert.equal(options?.redirect, 'manual', 'Cloudflare Workers must not use redirect:error');
    const body = options?.body instanceof URLSearchParams
      ? Object.fromEntries(options.body.entries())
      : options?.body ? JSON.parse(String(options.body)) : undefined;
    calls.push({ url, method, body });
    if (url.endsWith('/oauth2/token')) return Response.json({ access_token: 'mock-oauth-token' });
    assert.equal(new Headers(options?.headers).get('Authorization'), 'Bearer mock-oauth-token');
    if (url.endsWith('/commands') && method === 'GET') return Response.json(commands);
    if (url.endsWith('/commands') && method === 'POST') {
      const created = { id: commandId, application_id: appId, ...(body as Record<string, unknown>) };
      commands.push(created);
      return Response.json(created);
    }
    throw new Error('Unexpected Discord endpoint');
  });
  return { env, calls, get row() { return row; } };
}

test('deployment registers /portfolio without changing Discord Launch command', async t => {
  const h = harness(t, [{
    id: '555555555555555555', application_id: appId, type: 4, name: 'Launch', handler: 2,
  }]);
  assert.equal(await deployPortfolioCommand(h.env, 10000), 'registered');
  assert.equal(h.row?.last_result, 'registered');
  const writes = h.calls.filter(call => call.method === 'POST' && call.url.endsWith('/commands'));
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].body, { type: 1, name: 'portfolio', description });
  assert.ok(h.calls.every(call => !call.url.includes('/commands/555555555555555555')));
  assert.ok(h.calls.every(call => call.method !== 'PATCH' && call.method !== 'DELETE'));
  assert.equal(await deployPortfolioCommand(h.env, 10030), 'verified');
  assert.equal(h.calls.filter(call => call.method === 'POST' && call.url.endsWith('/commands')).length, 1);
});

test('deployment verifies an existing command without overwriting it', async t => {
  const h = harness(t, [{
    id: commandId, application_id: appId, type: 1, name: 'portfolio', description,
  }]);
  assert.equal(await deployPortfolioCommand(h.env, 10000), 'verified');
  assert.equal(h.row?.last_result, 'verified');
  assert.equal(h.calls.filter(c => c.method === 'POST' && c.url.endsWith('/commands')).length, 0);
});

test('missing Discord secrets stop deployment rather than quietly skipping commands', async t => {
  const h = harness(t);
  h.env.DISCORD_CLIENT_SECRET = '';
  await assert.rejects(() => deployPortfolioCommand(h.env, 10000), /missing_discord_configuration/);
  assert.equal(h.calls.length, 0);
  assert.equal(h.row, null);
});

test('failed Discord API calls record errors and fail the deploy step', async t => {
  const h = harness(t);
  t.mock.restoreAll();
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    requests++;
    return new Response('Denied', { status: 401 });
  });
  await assert.rejects(() => deployPortfolioCommand(h.env, 10000), /oauth_http_401/);
  assert.equal(h.row?.last_result, 'oauth_http_401');
  await assert.rejects(() => deployPortfolioCommand(h.env, 10030), /oauth_http_401/);
  assert.equal(requests, 2);
});
