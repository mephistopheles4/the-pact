// The poster's documented command lines against the overlay's real ask rules
// (#253, T1 of #246), under the matcher model the settings helpers carry. Its
// known limits stay as that model states them: escapes and line
// continuations are not modelled. Its own file, because the rule lists read
// the payload.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EXAMPLES, SURFACES, parseArgs } from '../../cross/poster.mjs';
import { realOverlay } from './payload.mjs';
import { asks } from './settings-rules.mjs';

const RULES = JSON.parse(realOverlay()).permissions.ask;
const LAUNCH = {
  PowerShell: '$env:NODE_OPTIONS = $null; node "$HOME/.claude/pact/poster.mjs"',
  Bash: 'env -u NODE_OPTIONS node "$HOME/.claude/pact/poster.mjs"',
};

// #246 C9: one documented line per surface, and each parses with no refusal
test('every surface has one documented command line, and each parses cleanly', () => {
  assert.deepEqual(Object.keys(EXAMPLES).sort(), Object.keys(SURFACES).sort());
  for (const [surface, line] of Object.entries(EXAMPLES)) {
    const p = parseArgs(line.split(' '));
    assert.equal(p.surface, surface);
    assert.deepEqual(p.refusals, [], line);
  }
});

// No documented line asks. A title or body file holding "ruleset" or
// "protection" can't change this: only the file's name reaches the line.
for (const tool of Object.keys(LAUNCH)) {
  for (const [surface, line] of Object.entries(EXAMPLES)) {
    // #246 C9
    test(`${surface}, under ${tool}: the documented line trips no ask rule`, () => {
      assert.equal(asks(RULES, tool, `${LAUNCH[tool]} ${line}`), false);
    });
  }
}

// #246 C9: recorded, not wanted. A file name holding "high" and "protection"
// asks, through the ruleset guard's broad gh rules; the reference page tells
// sessions to name body files plainly.
test('a body file named high-protection.md asks under both tools', () => {
  for (const tool of Object.keys(LAUNCH)) {
    assert.equal(asks(RULES, tool, `${LAUNCH[tool]} ${EXAMPLES['issue-comment'].replace('comment.md', 'high-protection.md')}`), true, tool);
  }
});
