// The commit-time layer's lockdown (#153, S11): the gate workflow reads the
// repo with a read-only token, holds no secret, never runs on
// pull_request_target, pins every action to a full commit SHA, leaves no
// token in the checkout, uploads nothing, and runs the dry run and the fast
// tier on the Node floor. Every other workflow file keeps the same lockdown,
// and none may define a job named gate, the required check's name (#166). It
// reads the files' text; it can't see what GitHub does with them, which the
// S15 CI probe records.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { REPO } from './text.mjs';

const WORKFLOWS = join(REPO, '.github', 'workflows');
const WORKFLOW = join(WORKFLOWS, 'gate.yml');
const codeOf = src => src.split('\n').filter(l => !/^\s*#/.test(l)).join('\n');

/** Where any workflow file breaks the lockdown every workflow keeps, as plain sentences; empty when it keeps it. */
function commonProblems(src) {
  const code = codeOf(src);
  const out = [];
  if (/pull_request_target|workflow_run/.test(code)) out.push('runs on a trigger that holds secrets or a write token');
  const perms = /^permissions:\n((?:[ \t]+.+\n)+)/m.exec(`${code}\n`);
  if (!perms || perms[1].trim() !== 'contents: read' || (code.match(/^\s*permissions:/gm) ?? []).length !== 1) out.push('asks for more than read access to the contents');
  if (/\bsecrets\.|\$\{\{\s*github\.token|GITHUB_TOKEN/.test(code)) out.push('reads a secret or the token');
  for (const m of code.matchAll(/uses:\s*(\S+)/g)) if (!/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/.test(m[1])) out.push(`uses ${m[1]}, not pinned to a full commit SHA`);
  const checkout = /uses: actions\/checkout@[0-9a-f]{40}[^\n]*\n((?: {8,}.+\n)*)/.exec(`${code}\n`);
  if (/uses: actions\/checkout@/.test(code) && (!checkout || !/persist-credentials: false/.test(checkout[1]))) out.push('leaves the token in the checkout');
  if (/upload-artifact|actions\/cache/.test(code)) out.push('uploads or caches the workspace');
  return out;
}

/** Where the gate workflow breaks its lockdown, as plain sentences; empty when it keeps it. */
function lockdownProblems(src) {
  const code = codeOf(src);
  const out = commonProblems(src);
  if (!/uses: actions\/checkout@/.test(code)) out.push('does not check the repo out');
  if (!/node-version: '24'/.test(code)) out.push('runs another Node than the floor');
  if (!/env -u NODE_OPTIONS node gate\/install\.mjs --claude-home "\$RUNNER_TEMP\/pact-home"/.test(code)) out.push('does not run the install dry run');
  if (!/env -u NODE_OPTIONS node gate\/tests\/run\.mjs fast/.test(code)) out.push('does not run the fast tier');
  if (!/^ {2}pull_request:\s*$/m.test(code) || !/^ {2}push:\n {4}branches: \[main\]$/m.test(code)) out.push('does not run on every pull request and every push to main');
  return out;
}

/** Where the workflow folder breaks the lockdown: the gate workflow's own, every other file's common lockdown, and no other job named gate. */
function folderProblems(files) {
  const out = [];
  if (!files.has('gate.yml')) out.push('has no gate.yml');
  for (const [name, src] of files) {
    const problems = name === 'gate.yml' ? lockdownProblems(src) : commonProblems(src);
    out.push(...problems.map(p => `${name} ${p}`));
    if (name !== 'gate.yml' && /^ {2}gate:\s*$|^\s+name:\s*['"]?gate['"]?\s*$/m.test(codeOf(src))) out.push(`${name} defines a job or check named gate`);
  }
  return out;
}
const realFolder = () => new Map(readdirSync(WORKFLOWS).filter(n => /\.ya?ml$/.test(n)).map(n => [n, readFileSync(join(WORKFLOWS, n), 'utf8')]));

test('the gate workflow keeps its lockdown', () => {
  assert.deepEqual(lockdownProblems(readFileSync(WORKFLOW, 'utf8')), []);
});

test('every workflow file keeps the lockdown, and only the gate workflow names a gate job', () => {
  assert.deepEqual(folderProblems(realFolder()), []);
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
  ['runs on workflow_run', s => s.replace('  pull_request:\n', '  pull_request:\n  workflow_run:\n'), 'runs on a trigger that holds secrets or a write token'],
  ['reads the job token', s => s.replace("node-version: '24'", "node-version: '24'\n          token: ${{ github.token }}"), 'reads a secret or the token'],
  ['reads GITHUB_TOKEN', s => s.replace('      - name: Gate suite', '      - env:\n          T: GITHUB_TOKEN\n        name: Gate suite'), 'reads a secret or the token'],
  ['caches the workspace', s => s.replace('      - name: Gate suite', '      - uses: actions/cache@0000000000000000000000000000000000000000\n      - name: Gate suite'), 'uploads or caches the workspace'],
  ['drops the fast tier', s => s.replace(/ {8}run: env -u NODE_OPTIONS node gate\/tests\/run\.mjs fast\n?/, '        run: echo skipped\n'), 'does not run the fast tier'],
  ['drops the pull_request trigger', s => s.replace('  pull_request:\n', ''), 'does not run on every pull request and every push to main'],
  ['drops the push trigger', s => s.replace('  push:\n    branches: [main]\n', ''), 'does not run on every pull request and every push to main'],
]) {
  test(`bad case: the workflow lockdown check catches a workflow that ${label}`, () => {
    const src = readFileSync(WORKFLOW, 'utf8');
    const planted = plant(src);
    assert.notEqual(planted, src, 'the plant changed nothing');
    assert.ok(lockdownProblems(planted).includes(says), lockdownProblems(planted).join('\n'));
  });
}

const OTHER = "name: other\non:\n  pull_request:\npermissions:\n  contents: read\njobs:\n  lint:\n    runs-on: ubuntu-24.04\n    steps:\n      - run: echo ok\n";
for (const [label, other, says] of [
  ['asks for write access', OTHER.replace('contents: read', 'contents: write'), 'other.yml asks for more than read access to the contents'],
  ['runs on pull_request_target', OTHER.replace('  pull_request:', '  pull_request_target:'), 'other.yml runs on a trigger that holds secrets or a write token'],
  ['defines a job named gate', OTHER.replace('  lint:', '  gate:'), 'other.yml defines a job or check named gate'],
  ['names a job gate', OTHER.replace('    runs-on:', '    name: gate\n    runs-on:'), 'other.yml defines a job or check named gate'],
]) {
  test(`bad case: the folder check catches a second workflow file that ${label}`, () => {
    const files = realFolder();
    assert.deepEqual(folderProblems(new Map([...files, ['other.yml', OTHER]])), [], 'control: a locked-down second file passes');
    assert.ok(folderProblems(new Map([...files, ['other.yml', other]])).includes(says), folderProblems(new Map([...files, ['other.yml', other]])).join('\n'));
  });
}

test('dependabot keeps the pinned actions current, holding a release back two weeks', () => {
  const src = readFileSync(join(REPO, '.github', 'dependabot.yml'), 'utf8');
  assert.match(src, /package-ecosystem: github-actions/);
  assert.match(src, /default-days: 14/);
});
