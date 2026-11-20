import assert from 'node:assert/strict';
import { test } from 'node:test';
import { discordAvatarUrl } from '../worker/avatar';

const id = '123456789012345678';
const hash = 'a1b2c3d4e5f67890a1b2c3d4e5f67890';

test('Discord profile avatars use only verified CDN components', () => {
  assert.equal(discordAvatarUrl(id, hash), `https://cdn.discordapp.com/avatars/${id}/${hash}.png?size=128`);
  assert.equal(discordAvatarUrl(id, `a_${hash}`), `https://cdn.discordapp.com/avatars/${id}/a_${hash}.gif?size=128`);
  assert.equal(discordAvatarUrl(id, hash.toUpperCase()), `https://cdn.discordapp.com/avatars/${id}/${hash}.png?size=128`);
});

test('new and legacy Discord profiles use the correct default avatar', () => {
  assert.equal(discordAvatarUrl(id, null), 'https://cdn.discordapp.com/embed/avatars/0.png');
  assert.equal(discordAvatarUrl(id, null, '1234'), 'https://cdn.discordapp.com/embed/avatars/4.png');
  assert.equal(discordAvatarUrl(id, null, '0000'), 'https://cdn.discordapp.com/embed/avatars/0.png');
});

test('malformed hashes cannot escape the Discord CDN path', () => {
  assert.equal(discordAvatarUrl(id, '../../evil.com/avatar'), 'https://cdn.discordapp.com/embed/avatars/0.png');
  assert.throws(() => discordAvatarUrl('not-an-id', hash), /Invalid Discord user ID/);
});
