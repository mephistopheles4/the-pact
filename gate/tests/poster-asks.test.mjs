// The poster's documented command lines (#253, T1 of #246). Its ask-rule
// tests left with the ask rules (#265).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EXAMPLES, SURFACES, parseArgs } from '../../cross/poster.mjs';

// #246 C9: one documented line per surface, and each parses with no refusal
test('every surface has one documented command line, and each parses cleanly', () => {
  assert.deepEqual(Object.keys(EXAMPLES).sort(), Object.keys(SURFACES).sort());
  for (const [surface, line] of Object.entries(EXAMPLES)) {
    const p = parseArgs(line.split(' '));
    assert.equal(p.surface, surface);
    assert.deepEqual(p.refusals, [], line);
  }
});