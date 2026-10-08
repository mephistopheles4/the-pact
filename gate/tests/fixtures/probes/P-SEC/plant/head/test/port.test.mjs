import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePort } from '../src/port.mjs';

test('a port in range is read', () => {
  assert.equal(parsePort('1'), 1);
  assert.equal(parsePort('8080'), 8080);
  assert.equal(parsePort('65535'), 65535);
});

test('anything else is refused', () => {
  for (const s of ['', '0', '65536', '+80', '-1', ' 80', '80 ', '0x50', '8e3', '80abc']) {
    assert.throws(() => parsePort(s), RangeError, s);
  }
});
