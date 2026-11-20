import assert from 'node:assert/strict';
import { test } from 'node:test';
import NativeDOMException from 'node-domexception';

test('legacy DOMException imports use Node native constructor', () => {
  assert.equal(NativeDOMException, globalThis.DOMException);
  const error = new NativeDOMException('Aborted', 'AbortError');
  assert.equal(error.name, 'AbortError');
});
