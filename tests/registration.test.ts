import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { deployPortfolioCommand } from '../worker/registration';

const appId = '123456789012345678';
const commandId = '987654321098765432';
const paperstreetId = '777777777777777777';
const launchId = '555555555555555555';
const key = 'a'.repeat(64);
const expected = [
  {type: 1, name: 'portfolio', description: 'View your PaperStreet portfolio, holdings and profit or loss',
    integration_types: [0, 1], contexts: [0, 1, 2]},
  {type: 1, name: 'paperstreet', description: 'Launch the PaperStreet stock trading Activity',
    integration_types: [0, 1], contexts: [0, 1, 2]},
];
type Command = {id?: string; application_id?: string; type?: number; name?: string; handler?: number; [key: string]: unknown};
function harness(t: TestContext, initial: Command[] = [], includeLaunch = true) {
  let row: {version: number; checked_at: number; last_attempt_at: number; last_result: string} | null = null;
  const commands = [...initial];
  if (includeLaunch && !commands.some(command => command.type === 4))
    commands.push({id: launchId, application_id: appId, type: 4, name: 'Launch', handler: 2});
  const calls: {url: string; method: string; body?: unknown}[] = [];
  const db = {
    prepare() {
      return {
        args: [] as unknown[],
        bind(...args: unknown[]) { this.args = args; return this; },
        async first() { return row; },
        async run() {
          row = {version: Number(this.args[1]), checked_at: Number(this.args[2]),
            last_attempt_at: Number(this.args[3]), last_result: String(this.args[4])};
          return {success: true};
        },
      };
    },
  } as unknown as D1Database;
  const env = {DB: db, DISCORD_CLIENT_ID: appId, DISCORD_CLIENT_SECRET: 'mock-secret',
    DISCORD_PUBLIC_KEY: key};
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = init?.method ?? 'GET';
    assert.equal(init?.redirect, 'manual', 'Cloudflare Workers must not use redirect:error');
    const body = init?.body instanceof URLSearchParams ? Object.fromEntries(init.body.entries())
      : init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({url, method, body});
    if (url.endsWith('/oauth2/token')) return Response.json({access_token: 'mock-oauth-token'});
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer mock-oauth-token');
    if (url.endsWith('/commands') && method === 'GET') return Response.json(commands);
    if (url.endsWith('/commands') && method === 'POST') {
      const data = body as Command;
      const index = commands.findIndex(cmd => cmd.type === data.type && cmd.name === data.name);
      const id = index >= 0 ? commands[index].id : data.name === 'portfolio' ? commandId : paperstreetId;
      const created = {id, application_id: appId, ...data};
      if (index >= 0) commands[index] = created;
      else commands.push(created);
      return Response.json(created);
    }
    if (method === 'PATCH' && url.endsWith('/commands/' + launchId)) {
      const index = commands.findIndex(cmd => cmd.id === launchId);
      if (index < 0) return Response.json({error:'Missing entry point'}, {status:404});
      const updated = {...commands[index], ...(body as object)};
      commands[index] = updated;
      return Response.json(updated);
    }
    throw new Error('Unexpected Discord request: ' + method + ' ' + url);
  });
  return {env, calls, commands, get row() { return row; }};
}

test('deployment registers /portfolio and /paperstreet and disables automatic game invitations', async t => {
  const h = harness(t);
  assert.equal(await deployPortfolioCommand(h.env, 10000), 'registered');
  assert.equal(h.row?.version, 3);
  assert.equal(h.row?.last_result, 'registered');
  const writes = h.calls.filter(c => c.method === 'POST' && c.url.endsWith('/commands'));
  assert.deepEqual(writes.map(c => c.body), expected);
  const patches = h.calls.filter(c => c.method === 'PATCH');
  assert.equal(patches.length, 1);
  assert.match(patches[0].url, /\/commands\/555555555555555555$/);
  assert.deepEqual(patches[0].body, {handler: 1});
  assert.ok(h.calls.every(c => c.method !== 'DELETE'));
  assert.equal(await deployPortfolioCommand(h.env, 10030), 'verified');
  assert.equal(h.calls.filter(c => c.method === 'POST' && c.url.endsWith('/commands')).length, 2);
  assert.equal(h.calls.filter(c => c.method === 'PATCH').length, 1);
});
test('an existing configuration is verified without unnecessary Discord writes', async t => {
  const h = harness(t, [
    {id: commandId, application_id: appId, ...expected[0]},
    {id: paperstreetId, application_id: appId, ...expected[1]},
    {id: launchId, application_id: appId, type: 4, name: 'Launch', handler: 1},
  ]);
  assert.equal(await deployPortfolioCommand(h.env, 10000), 'verified');
  assert.equal(h.row?.last_result, 'verified');
  assert.equal(h.calls.filter(c => c.method === 'POST' && c.url.endsWith('/commands')).length, 0);
  assert.equal(h.calls.filter(c => c.method === 'PATCH').length, 0);
});
test('legacy guild-only /portfolio is upgraded and /paperstreet supports user installs and DMs', async t => {
  const h = harness(t, [
    {id: commandId, application_id: appId, type: 1, name: 'portfolio', description: expected[0].description,
      integration_types: [0], contexts: [0, 1]},
  ]);
  assert.equal(await deployPortfolioCommand(h.env, 10000), 'registered');
  const writes = h.calls.filter(c => c.method === 'POST' && c.url.endsWith('/commands'));
  assert.deepEqual(writes.map(c => c.body), expected);
  assert.equal(h.row?.version, 3);
  assert.equal(await deployPortfolioCommand(h.env, 10030), 'verified');
});
test('adding /paperstreet preserves existing valid /portfolio and does not recreate Launch', async t => {
  const h = harness(t, [
    {id: commandId, application_id: appId, ...expected[0]},
    {id: launchId, application_id: appId, type: 4, name: 'Launch', handler: 1},
  ]);
  assert.equal(await deployPortfolioCommand(h.env, 10000), 'registered');
  const writes = h.calls.filter(c => c.method === 'POST' && c.url.endsWith('/commands'));
  assert.deepEqual(writes.map(c => c.body), [expected[1]]);
  assert.equal(h.calls.filter(c => c.method === 'PATCH').length, 0);
});
test('missing Discord secrets fail instead of silently skipping registration', async t => {
  const h = harness(t);
  h.env.DISCORD_CLIENT_SECRET = '';
  await assert.rejects(() => deployPortfolioCommand(h.env, 10000), /missing_discord_configuration/);
  assert.equal(h.calls.length, 0);
  assert.equal(h.row, null);
});
test('missing primary entry point is reported without creating an extra Launch command', async t => {
  const h = harness(t, [
    {id: commandId, application_id: appId, ...expected[0]},
    {id: paperstreetId, application_id: appId, ...expected[1]},
  ], false);
  await assert.rejects(() => deployPortfolioCommand(h.env, 10000), /launch_missing/);
  assert.equal(h.row?.last_result, 'launch_missing');
  assert.ok(h.calls.every(c => !(c.method === 'POST' && c.url.endsWith('/commands')) &&
    c.method !== 'PATCH'));
});
test('failed Discord API calls record errors and fail deployment', async t => {
  const h = harness(t);
  t.mock.restoreAll();
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    requests++;
    return new Response('Denied', {status:401});
  });
  await assert.rejects(() => deployPortfolioCommand(h.env, 10000), /oauth_http_401/);
  assert.equal(h.row?.last_result, 'oauth_http_401');
  await assert.rejects(() => deployPortfolioCommand(h.env, 10030), /oauth_http_401/);
  assert.equal(requests, 2);
});
