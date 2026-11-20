import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSession, verifySession } from '../worker/session';

const secret = 'test-secret-is-long-enough-to-authenticate-correctly';
const userId = '123456789012345678';
test('signed session contains the correct subject and expires', async () => {
  const session = await createSession(secret, userId, 1000);
  assert.equal(await verifySession(secret, session, 1001), userId);
  assert.equal(await verifySession(secret, session, 4600), null);
});
test('forged and altered tokens cannot authenticate', async () => {
  const session = await createSession(secret, userId, 1000);
  assert.equal(await verifySession('different-secret-that-is-also-long-enough', session, 1001), null);
  assert.equal(await verifySession(secret, `${session}x`, 1001), null);
  assert.equal(await verifySession(secret, 'garbage', 1001), null);
});
test('rejects invalid Discord snowflakes and weak secrets', async () => {
  await assert.rejects(createSession(secret, 'not-a-user'));
  await assert.rejects(createSession('bad', userId));
});
