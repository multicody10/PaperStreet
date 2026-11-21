import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { test } from 'node:test';
import { portfolioInteraction } from '../worker/commands';

const appId = '123456789012345678';
const userId = '987654321098765432';
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const key = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');

for (const { label, context, identity } of [
  { label: 'user-installed server command', context: 0, identity: { member: { user: { id: userId } } } },
  { label: 'user-installed direct message command', context: 2, identity: { user: { id: userId } } },
  { label: 'user-installed group DM command', context: 2, identity: { user: { id: userId } } },
  { label: 'bot direct message command', context: 1, identity: { user: { id: userId } } },
]) {
  test('/portfolio accepts signed ' + label + ' for the invoking user', async t => {
    const lookedUp: string[] = [];
    const db = {
      prepare() {
        return {
          bind(id: string) { lookedUp.push(id); return this; },
          async first() {
            return { display_name: 'Trader', cash_cents: 100000,
              starting_cash_cents: 100000, avatar_hash: null, avatar_discriminator: null };
          },
          async all() { return { results: [] }; },
        };
      },
    } as unknown as D1Database;
    const messages: { url: string; method: string; body: Record<string, unknown> }[] = [];
    t.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL, init?: RequestInit) => {
      messages.push({ url: String(url), method: init?.method ?? 'GET',
        body: JSON.parse(String(init?.body)) as Record<string, unknown> });
      return Response.json({ id: 'response' });
    });
    const payload = JSON.stringify({
      type: 2, context, application_id: appId, token: 'example-interaction-token',
      authorizing_integration_owners: { '1': userId },
      data: { type: 1, name: 'portfolio' }, ...identity,
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign(null, Buffer.from(timestamp + payload), privateKey).toString('hex');
    const request = new Request('https://paperstreet.example/api/discord/interactions', {
      method: 'POST', body: payload,
      headers: { 'X-Signature-Ed25519': signature, 'X-Signature-Timestamp': timestamp },
    });
    const tasks: Promise<unknown>[] = [];
    const result = await portfolioInteraction(request, {
      DB: db, DISCORD_CLIENT_ID: appId, DISCORD_PUBLIC_KEY: key,
    }, { waitUntil(task: Promise<unknown>) { tasks.push(task); } });
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { type: 5 });
    assert.equal(tasks.length, 1);
    await Promise.all(tasks);
    assert.deepEqual(lookedUp, [userId, userId]);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].method, 'PATCH');
    assert.match(messages[0].url, /\/webhooks\/123456789012345678\/example-interaction-token\/messages\/@original$/);
    const embeds = messages[0].body.embeds as { title?: string }[];
    assert.equal(embeds[0].title, '📊 PaperStreet Portfolio');
    assert.deepEqual(messages[0].body.allowed_mentions, { parse: [] });
  });
}
