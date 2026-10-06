import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clamp } from '../src/clamp.mjs';

test('inside the range', () => assert.equal(clamp(5, 0, 10), 5));
test('below and above', () => {
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(11, 0, 10), 10);
});
test('a reversed range throws', () => assert.throws(() => clamp(1, 2, 0), RangeError));
