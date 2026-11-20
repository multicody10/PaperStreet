import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { test } from 'node:test';
import worker from '../worker/index';

const keys = generateKeyPairSync('ed25519');
const env = {
  DISCORD_CLIENT_ID: '123456789012345678',
  DISCORD_PUBLIC_KEY: Buffer.from(keys.publicKey.export({ format: 'jwk' }).x!, 'base64url').toString('hex'),
};
const url = 'https://example.test/api/discord/interactions';
const launch = { type: 2, application_id: env.DISCORD_CLIENT_ID, data: { type: 4 } };

function signedRequest(payload: object, ageSeconds = 0) {
  const timestamp = String(Math.floor(Date.now() / 1000) - ageSeconds);
  const body = JSON.stringify(payload, null, 2);
  return new Request(url, {
    method: 'POST', body, headers: {
      'X-Signature-Timestamp': timestamp,
      'X-Signature-Ed25519': sign(null, Buffer.from(timestamp + body), keys.privateKey).toString('hex'),
    },
  });
}

test('Discord Play returns only the launch callback and endpoint verification returns Pong', async () => {
  for (const [payload, expected] of [[launch, 12], [{ type: 1 }, 1]] as const) {
    const response = await worker.fetch(signedRequest(payload), env);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { type: expected });
  }
});

test('unsigned, altered and expired launch requests are rejected', async () => {
  const unsigned = new Request(url, { method: 'POST', body: JSON.stringify(launch) });
  const altered = new Request(url, { method: 'POST', headers: signedRequest(launch).headers, body: '{"type":1}' });
  for (const request of [unsigned, altered, signedRequest(launch, 600)]) {
    assert.equal((await worker.fetch(request, env)).status, 401);
  }
});

test('other commands and applications cannot launch PaperStreet', async () => {
  for (const payload of [{ ...launch, data: { type: 1 } }, { ...launch, application_id: 'another-app' }]) {
    assert.equal((await worker.fetch(signedRequest(payload), env)).status, 400);
  }
});
