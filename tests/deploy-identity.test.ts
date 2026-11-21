import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { test, type TestContext } from 'node:test';
import { verifyProductionDeployIdentity, inspectProductionDeployIdentity } from '../worker/deploy-identity';
import worker from '../worker/index';

const endpoint = 'https://paperstreet.gobydev.workers.dev/api/internal/register-commands';
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = {
  ...publicKey.export({ format: 'jwk' }), kid: 'github-test-key', use: 'sig', alg: 'RS256',
};
const now = Math.floor(Date.now() / 1000);
const claims = {
  iss: 'https://token.actions.githubusercontent.com',
  aud: endpoint,
  repository: 'multicody10/PaperStreet',
  repository_id: '1465928317',
  ref: 'refs/heads/main',
  workflow_ref: 'multicody10/PaperStreet/.github/workflows/deploy.yml@refs/heads/main',
  event_name: 'push',
  sha: 'e'.repeat(40),
  iat: now - 30, nbf: now - 30, exp: now + 300,
};
function jwt(body: Record<string, unknown> = claims) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: jwk.kid })).toString('base64url');
  const content = Buffer.from(JSON.stringify(body)).toString('base64url');
  const signature = sign('RSA-SHA256', Buffer.from(header + '.' + content), privateKey).toString('base64url');
  return [header, content, signature].join('.');
}
function mockJwks(t: TestContext) {
  t.mock.method(globalThis, 'fetch', async (resource: RequestInfo | URL, options?: RequestInit) => {
    assert.equal(String(resource), 'https://token.actions.githubusercontent.com/.well-known/jwks');
    assert.equal(options?.redirect, 'manual', 'Cloudflare Workers must not use redirect:error');
    return Response.json({ keys: [jwk] });
  });
}
test('signed GitHub production deployment is authorized with an exact audience', async t => {
  mockJwks(t);
  assert.equal(await verifyProductionDeployIdentity('Bearer ' + jwt(), endpoint, now), true);
  assert.equal(await verifyProductionDeployIdentity('Bearer ' + jwt({ ...claims, event_name: 'workflow_dispatch' }), endpoint, now), true);
});

test('unsigned, wrong repo, wrong workflow, and wrong branch cannot register commands', async t => {
  mockJwks(t);
  const invalidClaims = [
    { ...claims, repository_id: '1' },
    { ...claims, repository: 'someone-else/PaperStreet' },
    { ...claims, ref: 'refs/heads/development' },
    { ...claims, workflow_ref: 'multicody10/PaperStreet/.github/workflows/checks.yml@refs/heads/main' },
    { ...claims, event_name: 'pull_request' },
    { ...claims, aud: 'https://evil.example/api/internal/register-commands' },
    { ...claims, exp: now - 1 },
    { ...claims, nbf: now + 500 },
    { ...claims, sha: 'not_a_commit_sha' },
  ];
  for (const item of invalidClaims)
    assert.equal(await verifyProductionDeployIdentity('Bearer ' + jwt(item), endpoint, now), false);
  assert.equal(await verifyProductionDeployIdentity(undefined, endpoint, now), false);
  assert.equal(await verifyProductionDeployIdentity('Bearer not-a-jwt', endpoint, now), false);
});

test('deployment JWT diagnostics classify wrong audience without exposing claims', async () => {
  const result = await inspectProductionDeployIdentity('Bearer ' + jwt({
    ...claims, aud: 'https://wrong.example/',
  }), endpoint, now);
  assert.deepEqual(result, { valid: false, reason: 'audience' });
});

test('a modified JWT payload with valid syntax is rejected by RSA signature verification', async t => {
  mockJwks(t);
  const token = jwt();
  const alteredBody = Buffer.from(JSON.stringify({ ...claims, sha: 'f'.repeat(40) })).toString('base64url');
  const altered = [token.split('.')[0], alteredBody, token.split('.')[2]].join('.');
  assert.equal(await verifyProductionDeployIdentity('Bearer ' + altered, endpoint, now), false);
});

test('an unauthenticated HTTP request cannot execute command registration', async () => {
  const res = await worker.fetch(new Request(endpoint, { method: 'POST' }), {} as never);
  assert.equal(res.status, 401);
  assert.equal((await res.json() as { error: string }).error, 'oidc_format');
});

test('authorized deployment registers /portfolio and never changes Activity Launch', async t => {
  const calls: { url: string; method: string }[] = [];
  t.mock.method(globalThis, 'fetch', async (resource: RequestInfo | URL, options?: RequestInit) => {
    const url = String(resource);
    const method = options?.method ?? 'GET';
    calls.push({ url, method });
    if (url.endsWith('/.well-known/jwks')) return Response.json({ keys: [jwk] });
    if (url.endsWith('/oauth2/token')) return Response.json({ access_token: 'test-access-token' });
    assert.equal(new Headers(options?.headers).get('Authorization'), 'Bearer test-access-token');
    if (url.endsWith('/commands') && method === 'GET') return Response.json([
      { id: '888888888888888888', name: 'Launch', type: 4, application_id: '123456789012345678', handler: 2 },
    ]);
    if (url.endsWith('/commands') && method === 'POST')
      return Response.json({
        id: '999999999999999999', application_id: '123456789012345678',
        name: 'portfolio', type: 1, description: 'View your PaperStreet portfolio, holdings and profit or loss',
        integration_types: [0, 1], contexts: [0, 1, 2],
      });
    throw new Error('Unexpected URL: ' + url);
  });
  let row: object | null = null;
  const db = {
    prepare(_sql: string) {
      return {
        values: [] as unknown[],
        bind(...args: unknown[]) { this.values = args; return this; },
        async first() { return row; },
        async run() { row = { status: this.values[4] }; return { success: true }; },
      };
    },
  } as unknown as D1Database;
  const env = {
    DB: db,
    DISCORD_CLIENT_ID: '123456789012345678',
    DISCORD_CLIENT_SECRET: 'mock-secret',
    DISCORD_PUBLIC_KEY: 'a'.repeat(64),
  };
  const res = await worker.fetch(new Request(endpoint, {
    method: 'POST', headers: { Authorization: 'Bearer ' + jwt() },
  }), env);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { command: '/portfolio', result: 'registered' });
  assert.ok(calls.some(c => c.url.endsWith('/commands') && c.method === 'POST'));
  assert.ok(calls.every(c => c.method !== 'PATCH' && c.method !== 'DELETE'));
});
