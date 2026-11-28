// PACT-93, T3 of spec 0005 (U7): the end-to-end run's own checks, each seen to
// fail on a bad case. Nothing here downloads or runs the real server.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { forwardTimeoutMs } from '../../claude/tools/clef.mjs';
import { goneCheck, judgeCase, lineCheck, parseArgs, writeLine } from './clef-e2e.mjs';
import { REPO } from './text.mjs';
import { tempDir } from './tree.mjs';

const CASES = JSON.parse(readFileSync(join(REPO, 'docs', 'clef-cases.json'), 'utf8')).cases;
const caseOf = id => CASES.find(c => c.id === id);
const BUDGET = forwardTimeoutMs('cpu');
const yes = { q: { noul: 0.95 } };
const pick = top => ({ q: { choice: top, probabilities: { inbound: 0.05, outbound: 0.05, local: 0.05, [top]: 0.9 } } });
const joint = (goal, approves) => ({ sets_goal: { noul: goal }, approves: { noul: approves } });

// #PACT-93 C-U7
test('judgeCase: an answer in the baseline band or with its top option passes, for each kind of case', () => {
  assert.deepEqual(judgeCase(caseOf('secret-to-log'), yes, 10, BUDGET), { said: 'q=yes', problems: [] });
  assert.deepEqual(judgeCase(caseOf('stranger-pr-comment'), pick('inbound'), 10, BUDGET), { said: 'q=inbound', problems: [] });
  assert.deepEqual(judgeCase(caseOf('merge-once-green'), joint(0.1, 0.9), BUDGET, BUDGET), { said: 'sets_goal=no approves=yes', problems: [] });
});

// #PACT-93 C-U7 (spec 0005 U7: each check seen to fail)
for (const [label, id, answer, ms, says] of [
  ['a wrong band', 'secret-to-log', { q: { noul: 0.5 } }, 10, 'q is unsure, not yes'],
  ['a wrong top option', 'stranger-pr-comment', pick('local'), 10, 'q picks local, not inbound'],
  ['a joint case with one question wrong', 'merge-once-green', joint(0.9, 0.9), 10, 'sets_goal is yes, not no'],
  ['a missing field in the answer', 'stranger-pr-comment', { q: { choice: 'inbound' } }, 10, 'the answer is not the shape the supervisor checks'],
  ['an answer past the budget', 'secret-to-log', yes, BUDGET + 1, `the answer took ${BUDGET + 1} ms, past ${BUDGET}`],
]) {
  test(`judgeCase fails ${label}`, () => {
    assert.deepEqual(judgeCase(caseOf(id), answer, ms, BUDGET).problems, [says]);
  });
}

// #PACT-93 C-U7 (spec 0005 U7 step 5)
for (const [label, seen, says] of [
  ['setpriv: the supervisor is the parent', { line: 'setpriv', supervisor: 10, parent: 10, grandparent: 1 }, null],
  ['keeper: the supervisor is the grandparent', { line: 'keeper', supervisor: 10, parent: 11, grandparent: 10 }, null],
  ['setpriv: another parent fails', { line: 'setpriv', supervisor: 10, parent: 11, grandparent: 10 }, "on the setpriv line the server's parent is not the supervisor"],
  ['keeper: the supervisor as the parent fails', { line: 'keeper', supervisor: 10, parent: 10, grandparent: 1 }, "on the keeper line the server's parent is the supervisor"],
  ['keeper: another grandparent fails', { line: 'keeper', supervisor: 10, parent: 11, grandparent: 1 }, "on the keeper line the supervisor is not the server's grandparent"],
]) {
  test(`lineCheck, ${label}`, () => {
    assert.equal(lineCheck(seen), says);
  });
}

// #PACT-93 C-U7 (spec 0005 U7 step 7)
test('goneCheck: names each process left alive, and none when all are gone', () => {
  const pids = { server: 1, supervisor: 2, keeper: 3 };
  assert.deepEqual(goneCheck(pids, () => false), []);
  assert.deepEqual(goneCheck(pids, pid => pid === 3), ['keeper']);
});

// #PACT-93 C-U8
test('writeLine: writes a line, and refuses one holding a secret, naming neither', () => {
  const wrote = [];
  const write = l => wrote.push(l);
  writeLine('step ready 12 s', ['RUNID', 'KEYVALUE'], write);
  for (const secret of ['RUNID', 'KEYVALUE']) {
    assert.throws(() => writeLine(`url?t=${secret}&x`, ['RUNID', 'KEYVALUE'], write), e => !e.message.includes(secret) && /not written/.test(e.message));
  }
  assert.deepEqual(wrote, ['step ready 12 s']);
});

// #PACT-93 C-U8
test('parseArgs: takes a scratch folder outside the repo and a CPU platform key, and refuses anything else', t => {
  const outside = tempDir(t, 'clef-e2e-');
  assert.deepEqual(parseArgs([outside, 'linux-arm64-cpu']), { scratch: outside, key: 'linux-arm64-cpu' });
  for (const [argv, says] of [
    [[outside], /two arguments/],
    [[outside, 'linux-x64-cpu', 'more'], /two arguments/],
    [[outside, 'linux-x64-vulkan'], /platform key/],
    [[outside, 'darwin-arm64-cpu'], /platform key/],
    [[outside, 'toString'], /platform key/],
    [[REPO, 'linux-x64-cpu'], /outside the repo/],
    [[join(REPO, 'gate', 'scratch'), 'linux-x64-cpu'], /outside the repo/],
    [[join(REPO, '..'), 'linux-x64-cpu'], /outside the repo/],
    [['relative/scratch', 'linux-x64-cpu'], /full path/],
  ]) assert.throws(() => parseArgs(argv), says, argv.join(' '));
});
