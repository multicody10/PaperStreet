import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sign, generateKeyPairSync } from 'node:crypto';
import { loadPortfolio } from '../worker/portfolio';
import { portfolioEmbed, portfolioInteraction } from '../worker/commands';
import { STARTING_CASH_CENTS, type Portfolio } from '../shared/stocks';

const id = '123456789012345678';
const appId = '987654321098765432';
const now = Math.floor(Date.now() / 1000);
const keys = generateKeyPairSync('ed25519');
const keyHex = Buffer.from(keys.publicKey.export({ format: 'jwk' }).x!, 'base64url').toString('hex');
const url = 'https://paperstreet.example/api/discord/interactions';

function signed(payload: object, time = String(Math.floor(Date.now() / 1000))) {
  const body = JSON.stringify(payload);
  return new Request(url, {
    method: 'POST', body,
    headers: {
      'X-Signature-Timestamp': time,
      'X-Signature-Ed25519': sign(null, Buffer.from(time + body), keys.privateKey).toString('hex'),
    },
  });
}
function dbWithPortfolio(userId = id, hasPlayer = true) {
  const seen: { sql: string; args: unknown[] }[] = [];
  const db = {
    prepare(sql: string) {
      const query = { sql, args: [] as unknown[],
        bind(...args: unknown[]) { query.args = args; return query; },
        async first() {
          seen.push({ sql, args: query.args });
          if (sql.includes('FROM players')) return hasPlayer ? {
            display_name: 'Test Trader', cash_cents: 80_000, starting_cash_cents: STARTING_CASH_CENTS,
            avatar_hash: null, avatar_discriminator: null,
          } : null;
          if (sql.includes('FROM quote_cache')) return {
            price_cents: 12_000, previous_close_cents: 11_500, fetched_at: now,
            provider_at: now, mode: 'finnhub', open_cents: null, high_cents: null, low_cents: null,
          };
          return null;
        },
        async all() {
          seen.push({ sql, args: query.args });
          if (sql.includes('FROM holdings')) return {
            results: hasPlayer ? [{ symbol: 'AAPL', shares: 2, cost_basis_cents: 20_000 }] : [],
          };
          return { results: [] };
        },
      };
      return query;
    },
  } as unknown as D1Database;
  return { db, seen, userId };
}

test('portfolio command and HTTP API can use the same accurate D1 valuation', async () => {
  const { db } = dbWithPortfolio();
  const result = await loadPortfolio(id, { DB: db, FINNHUB_API_KEY: 'test-only' });
  assert.ok(result);
  assert.equal(result.portfolio.cashCents, 80_000);
  assert.equal(result.portfolio.investedCents, 24_000);
  assert.equal(result.portfolio.equityCents, 104_000);
  assert.equal(result.portfolio.profitCents, 4_000);
  assert.equal(result.portfolio.positions[0].profitCents, 4_000);
  assert.equal(result.portfolio.positions[0].shares, 2);
  const embed = portfolioEmbed(result.portfolio, result.avatarUrl);
  assert.match(embed.description!, /\$1,040\.00/);
  assert.match(embed.description!, /\+\$40\.00 \(\+4\.00%\)/);
  assert.equal(embed.fields?.[0].value, '$800.00');
  assert.equal(embed.fields?.[1].value, '$240.00');
  assert.match(embed.fields![3].value, /AAPL/);
});

test('missing player never creates an account and invalid user cannot access someone else', async () => {
  const { db } = dbWithPortfolio(id, false);
  assert.equal(await loadPortfolio(id, { DB: db }), null);
  assert.equal(await loadPortfolio('forged', { DB: db }), null);
});

test('embed safely formats usernames, losses and empty holdings', () => {
  const portfolio: Portfolio = {
    userId: id, displayName: '@everyone**\n', cashCents: 82_500,
    startingCashCents: 100_000, investedCents: 0,
    equityCents: 82_500, profitCents: -17_500, positions: [],
  };
  const embed = portfolioEmbed(portfolio);
  assert.equal(embed.color, 0xd95468);
  assert.doesNotMatch(embed.author!.name, /@|\*/);
  assert.match(embed.description!, /−\$175\.00/);
  assert.match(embed.fields![3].value, /No open positions/);
});

test('signed Discord PING is acknowledged; invalid signatures and old timestamps are rejected', async () => {
  const env = { DISCORD_PUBLIC_KEY: keyHex, DISCORD_CLIENT_ID: appId, DB: {} as D1Database };
  const ctx = { waitUntil() { throw new Error('PING must not schedule work'); } } as unknown as ExecutionContext;
  const pong = await portfolioInteraction(signed({ type: 1 }), env, ctx);
  assert.deepEqual(await pong.json(), { type: 1 });
  const bad = await portfolioInteraction(new Request(url, { method: 'POST', body: '{}' }), env, ctx);
  assert.equal(bad.status, 401);
  const expired = await portfolioInteraction(signed({ type: 1 }, String(now - 1200)), env, ctx);
  assert.equal(expired.status, 401);
});

test('slash command defers immediately and replies only with signed invoking user portfolio', async t => {
  const { db, seen } = dbWithPortfolio(id, false);
  const calls: { url: string; method: string; payload: unknown }[] = [];
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method ?? 'GET', payload: JSON.parse(String(init?.body)) });
    return new Response('', { status: 200 });
  });
  const tasks: Promise<unknown>[] = [];
  const env = { DISCORD_PUBLIC_KEY: keyHex, DISCORD_CLIENT_ID: appId, DB: db };
  const data = {
    application_id: appId, type: 2, token: 'valid-interaction-token-12345',
    member: { user: { id } }, data: { name: 'portfolio', type: 1, options: [{ name: 'user', value: '999999999999999999' }] },
  };
  const response = await portfolioInteraction(signed(data), env, { waitUntil(p) { tasks.push(p); } } as ExecutionContext);
  assert.deepEqual(await response.json(), { type: 5 });
  assert.equal(tasks.length, 1);
  await Promise.all(tasks);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /^https:\/\/discord\.com\/api\/v10\/webhooks\//);
  assert.equal(calls[0].method, 'PATCH');
  const payload = calls[0].payload as { embeds: { description: string }[]; allowed_mentions: { parse: string[] } };
  assert.match(payload.embeds[0].description, /Launch the \*\*PaperStreet Activity\*\*/);
  assert.deepEqual(payload.allowed_mentions, { parse: [] });
  assert.deepEqual(seen.filter(q => q.sql.includes('FROM players')).map(q => q.args[0]), [id]);
});

test('wrong command or other application cannot return another user\'s holdings', async () => {
  const env = { DISCORD_PUBLIC_KEY: keyHex, DISCORD_CLIENT_ID: appId, DB: {} as D1Database };
  const ctx = { waitUntil() { throw new Error('Untrusted command scheduled'); } } as unknown as ExecutionContext;
  for (const payload of [
    { type: 2, application_id: '333333333333333333', token: 'valid-interaction-token-12345', member: { user: { id } }, data: { name: 'portfolio', type: 1 } },
    { type: 2, application_id: appId, token: 'valid-interaction-token-12345', member: { user: { id } }, data: { name: 'unknown', type: 1 } },
  ]) {
    const reply = await portfolioInteraction(signed(payload), env, ctx);
    assert.equal((await reply.json() as { type: number }).type, 4);
  }
});

test('signed Play and /paperstreet launch without posting Game Invitations', async () => {
  const env = { DISCORD_PUBLIC_KEY: keyHex, DISCORD_CLIENT_ID: appId, DB: {} as D1Database };
  const ctx = { waitUntil() { throw new Error('Launch must not schedule a message'); } } as Pick<ExecutionContext, 'waitUntil'>;
  for (const context of [0, 1, 2]) {
    for (const command of [{ type: 4, name: 'Launch' }, {type: 1, name: 'paperstreet'}]) {
      const response = await portfolioInteraction(signed({
        type: 2, context, application_id: appId, token: 'valid-interaction-token-12345',
        data: command,
      }), env, ctx);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {type: 12});
    }
  }
  const otherApp = await portfolioInteraction(signed({
    type: 2, application_id: '333333333333333333',
    token: 'valid-interaction-token-12345', data: {type: 1, name: 'paperstreet'},
  }), env, ctx);
  assert.equal((await otherApp.json() as {type: number}).type, 4);
});
