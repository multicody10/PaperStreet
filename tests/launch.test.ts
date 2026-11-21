import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { synchronizeDiscordLaunch, checkDiscordLaunch, checkDiscordLaunchAfterAuth, launchConfigurationIssue, launchFailureCode } from '../worker/launch';

const appId = '123456789012345678';
const commandId = '987654321098765432';
const publicKey = 'a'.repeat(64);

function harness(t: TestContext, initialHandler = 2, responseAppId = appId) {
  let saved: { value: string; checked_at: number } | null = null;
  let handler = initialHandler;
  let patched = 0;
  let checked = 0;
  const prepare = (_sql: string) => {
    let args: unknown[] = [];
    return {
      bind(...values: unknown[]) { args = values; return this; },
      async first() { return saved; },
      async run() {
        saved = { value: String(args[1]), checked_at: Number(args[2]) };
        return { success: true };
      },
    };
  };
  const env = {
    DB: { prepare } as unknown as D1Database,
    DISCORD_CLIENT_ID: appId,
    DISCORD_CLIENT_SECRET: 'test-secret-not-for-logs',
    DISCORD_PUBLIC_KEY: publicKey,
  };
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (url.endsWith('/oauth2/token')) {
      assert.equal(init?.method, 'POST');
      const body = init?.body as URLSearchParams;
      assert.equal(body.get('scope'), 'applications.commands.update');
      assert.equal(body.get('client_id'), appId);
      return Response.json({ access_token: 'mock-access-token' });
    }
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer mock-access-token');
    if (url.endsWith('/commands')) {
      checked++;
      return Response.json([{ id: commandId, application_id: responseAppId, type: 4, handler }]);
    }
    if (url.endsWith('/commands/' + commandId)) {
      if (init?.method === 'PATCH') {
        assert.deepEqual(JSON.parse(String(init.body)), { handler: 1 });
        handler = 1;
        patched++;
      }
      return Response.json({ id: commandId, application_id: appId, type: 4, handler, version: '12' });
    }
    throw new Error('Unexpected Discord URL: ' + url);
  });
  return { env, get state() { return saved; }, get handler() { return handler; },
    get patched() { return patched; }, get checked() { return checked; } };
}

test('existing Cloudflare credentials migrate default Play command to APP_HANDLER', async t => {
  const h = harness(t);
  assert.equal(await synchronizeDiscordLaunch(h.env, 100000), 'updated');
  assert.equal(h.handler, 1);
  assert.equal(h.patched, 1);
  assert.deepEqual(h.state, { value: appId, checked_at: 100000 });
  assert.equal(await synchronizeDiscordLaunch(h.env, 100100), 'skipped');
  assert.equal(h.patched, 1);
  assert.equal(h.checked, 1);
});

test('first deploy re-registers APP_HANDLER and later verifies it daily without extra PATCH', async t => {
  const h = harness(t, 1);
  assert.equal(await synchronizeDiscordLaunch(h.env, 100000), 'updated');
  assert.equal(h.patched, 1);
  assert.equal(await synchronizeDiscordLaunch(h.env, 100000 + 86401), 'verified');
  assert.equal(h.patched, 1);
  assert.equal(h.checked, 2);
});

test('missing Cloudflare application credentials skips safely without Discord requests', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Should not fetch'); });
  const env = { DISCORD_CLIENT_ID: appId, DISCORD_CLIENT_SECRET: '', DISCORD_PUBLIC_KEY: publicKey, DB: {} as D1Database };
  assert.equal(await synchronizeDiscordLaunch(env), 'skipped');
});

test('wrong Discord application response does not change command registration', async t => {
  const h = harness(t, 2, '333333333333333333');
  // Wrong application response must never cause cross-app command mutations.
  await assert.rejects(() => synchronizeDiscordLaunch(h.env, 100000), /Expected one primary entry command/);
  assert.equal(h.patched, 0);
  assert.equal(h.state, null);
});

test('monitor reports safe configuration errors before calling the Discord API', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Discord must not be called'); });
  const saved: { key: string; code: string; checkedAt: number }[] = [];
  const db = {
    prepare() { return {
      bind(key: string, code: string, checkedAt: number) {
        saved.push({ key, code, checkedAt }); return this;
      }, async run() { return { success: true }; },
    }; },
  } as unknown as D1Database;
  const env = { DB: db, DISCORD_CLIENT_ID: appId, DISCORD_CLIENT_SECRET: '', DISCORD_PUBLIC_KEY: publicKey };
  assert.equal(launchConfigurationIssue(env), 'missing_client_secret');
  await checkDiscordLaunch(env, 10100);
  assert.deepEqual(saved, [{
    key: 'discord-primary-entry-sync-result-v1',
    code: 'missing_client_secret', checkedAt: 10100,
  }]);
});

test('Discord HTTP failures map to nonsecret error categories', () => {
  assert.equal(launchFailureCode(new Error('Discord command authorization: HTTP 401')), 'discord_oauth_401');
  assert.equal(launchFailureCode(new Error('Discord command API: HTTP 403')), 'discord_api_403');
  assert.equal(launchFailureCode(new Error('Discord command API: HTTP 500')), 'discord_api_unavailable');
  assert.equal(launchFailureCode(new Error('Expected one primary entry command for the PaperStreet application, got 0')), 'no_primary_entry_point');
  assert.equal(launchFailureCode(new Error('Sensitive token: abc')), 'worker_error');
});

test('unexpected fetch and response failures retain the exact safe phase', () => {
  for (const phase of [
    'd1_state_read_failed',
    'discord_oauth_fetch_failed',
    'discord_oauth_invalid_json',
    'discord_commands_fetch_failed',
    'discord_commands_invalid_json',
    'discord_update_fetch_failed',
    'discord_update_invalid_json',
    'discord_verify_fetch_failed',
    'discord_verify_invalid_json',
    'd1_state_write_failed',
  ]) {
    assert.equal(launchFailureCode(new Error(phase)), phase);
  }
});

test('authenticated session fallback skips Discord if a recent attempt exists', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    throw new Error('Unexpected external fetch');
  });
  const db = {
    prepare() {
      return { bind() { return this; }, async first() { return { checked_at: 2000 }; } };
    },
  } as unknown as D1Database;
  await checkDiscordLaunchAfterAuth({
    DB: db, DISCORD_CLIENT_ID: appId, DISCORD_CLIENT_SECRET: 'secret',
    DISCORD_PUBLIC_KEY: publicKey,
  }, 2100);
  assert.equal(calls, 0);
});

test('authenticated session fallback records configuration failure without a cron', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected network request'); });
  const records: unknown[][] = [];
  const db = {
    prepare() {
      return {
        bind(...args: unknown[]) { this.args = args; return this; },
        args: [] as unknown[],
        async first() { return null; },
        async run() { records.push(this.args); return { success: true }; },
      };
    },
  } as unknown as D1Database;
  await checkDiscordLaunchAfterAuth({
    DB: db, DISCORD_CLIENT_ID: appId, DISCORD_CLIENT_SECRET: '',
    DISCORD_PUBLIC_KEY: publicKey,
  }, 2110);
  assert.deepEqual(records, [['discord-primary-entry-sync-result-v1', 'missing_client_secret', 2110]]);
});
