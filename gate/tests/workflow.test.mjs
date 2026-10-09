// The commit-time layer's lockdown (#153, S11): the gate workflow reads the
// repo with a read-only token, holds no secret, never runs on
// pull_request_target, pins every action to a full commit SHA, leaves no
// token in the checkout, uploads nothing, and runs the dry run and the fast
// tier on the Node floor. It reads the file's text; it can't see what GitHub
// does with it, which the S15 CI probe records.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { REPO } from './text.mjs';

const WORKFLOW = join(REPO, '.github', 'workflows', 'gate.yml');

/** Where the workflow breaks its lockdown, as plain sentences; empty when it keeps it. */
function lockdownProblems(src) {
  const code = src.split('\n').filter(l => !/^\s*#/.test(l)).join('\n');
  const out = [];
  if (/pull_request_target|workflow_run/.test(code)) out.push('runs on a trigger that holds secrets or a write token');
  const perms = /^permissions:\n((?:[ \t]+.+\n)+)/m.exec(`${code}\n`);
  if (!perms || perms[1].trim() !== 'contents: read' || (code.match(/^\s*permissions:/gm) ?? []).length !== 1) out.push('asks for more than read access to the contents');
  if (/\bsecrets\.|\$\{\{\s*github\.token|GITHUB_TOKEN/.test(code)) out.push('reads a secret or the token');
  for (const m of code.matchAll(/uses:\s*(\S+)/g)) if (!/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/.test(m[1])) out.push(`uses ${m[1]}, not pinned to a full commit SHA`);
  const checkout = /uses: actions\/checkout@[0-9a-f]{40}[^\n]*\n((?: {8,}.+\n)*)/.exec(`${code}\n`);
  if (!checkout || !/persist-credentials: false/.test(checkout[1])) out.push('leaves the token in the checkout');
  if (/upload-artifact|actions\/cache/.test(code)) out.push('uploads or caches the workspace');
  if (!/node-version: '24'/.test(code)) out.push('runs another Node than the floor');
  if (!/env -u NODE_OPTIONS node gate\/install\.mjs --claude-home "\$RUNNER_TEMP\/pact-home"/.test(code)) out.push('does not run the install dry run');
  if (!/env -u NODE_OPTIONS node gate\/tests\/run\.mjs fast/.test(code)) out.push('does not run the fast tier');
  if (!/^ {2}pull_request:\s*$/m.test(code) || !/^ {2}push:\n {4}branches: \[main\]$/m.test(code)) out.push('does not run on every pull request and every push to main');
  return out;
}

test('the gate workflow keeps its lockdown', () => {
  assert.deepEqual(lockdownProblems(readFileSync(WORKFLOW, 'utf8')), []);
});

for (const [label, plant, says] of [
  ['runs on pull_request_target', s => s.replace('  pull_request:\n', '  pull_request_target:\n'), 'runs on a trigger that holds secrets or a write token'],
  ['asks for write access', s => s.replace('  contents: read', '  contents: write'), 'asks for more than read access to the contents'],
  ['adds a permission', s => s.replace('  contents: read', '  contents: read\n  pull-requests: write'), 'asks for more than read access to the contents'],
  ['reads a secret', s => s.replace("node-version: '24'", "node-version: '24'\n          token: ${{ secrets.X }}"), 'reads a secret or the token'],
  ['pins an action to a tag', s => s.replace(/actions\/setup-node@[0-9a-f]{40}/, 'actions/setup-node@v7'), 'uses actions/setup-node@v7, not pinned to a full commit SHA'],
  ['keeps the token in the checkout', s => s.replace('persist-credentials: false', 'persist-credentials: true'), 'leaves the token in the checkout'],
  ['uploads the workspace', s => s.replace('      - name: Gate suite', '      - uses: actions/upload-artifact@0000000000000000000000000000000000000000\n      - name: Gate suite'), 'uploads or caches the workspace'],
  ['drops the dry run', s => s.replace(/ {10}env -u NODE_OPTIONS node gate\/install\.mjs.*\n/, ''), 'does not run the install dry run'],
  ['runs an old Node', s => s.replace("node-version: '24'", "node-version: '20'"), 'runs another Node than the floor'],
]) {
  test(`bad case: the workflow lockdown check catches a workflow that ${label}`, () => {
    const src = readFileSync(WORKFLOW, 'utf8');
    const planted = plant(src);
    assert.notEqual(planted, src, 'the plant changed nothing');
    assert.ok(lockdownProblems(planted).includes(says), lockdownProblems(planted).join('\n'));
  });
}

test('dependabot keeps the pinned actions current, holding a release back two weeks', () => {
  const src = readFileSync(join(REPO, '.github', 'dependabot.yml'), 'utf8');
  assert.match(src, /package-ecosystem: github-actions/);
  assert.match(src, /default-days: 14/);
});
