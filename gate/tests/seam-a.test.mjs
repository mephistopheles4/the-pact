// Seam A on staged fixture trees. Each planted bad case asserts the rule it
// must fail on, not just a failure.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { copyGate, plantModule } from './gate-files.mjs';
import { childSeamA, runSeamA } from './gate-run.mjs';
import { realOverlay, realPayload, stage } from './payload.mjs';
import { moduleResult, table } from './tables.mjs';
import { GATE, READ_ONLY, agent, contractText, failRules, lastLine, plainAgent } from './text.mjs';
import { tempDir } from './tree.mjs';

function expectFail(t, files, rule, prep) {
  const root = stage(t, files);
  if (prep) prep(root);
  const r = runSeamA(root);
  assert.equal(lastLine(r.stdout), 'RESULT: fail', r.out);
  assert.notEqual(r.code, 0, r.out);
  assert.ok(failRules(r.stdout).includes(rule), `expected rule "${rule}" in:\n${r.out}`);
  return r;
}

function expectPass(t, files, prep) {
  const root = stage(t, files);
  if (prep) prep(root);
  const r = runSeamA(root);
  assert.equal(r.code, 0, r.out);
  assert.equal(lastLine(r.stdout), 'RESULT: pass', r.out);
  return r;
}

const A = 'claude/agents/probe.md';

// ------------------------------------------------------------ the real tree

// #261 C3
test('seam A passes on the repo payload, and lists every file it would install', t => {
  const root = tempDir(t);
  realPayload(root);
  // A wrapper test (#155): seam A's pass cell stays a child run of the wrapper.
  const r = childSeamA(root);
  assert.equal(r.code, 0, r.out);
  assert.equal(lastLine(r.stdout), 'RESULT: pass', r.out);
  const installs = r.stdout.split('\n').filter(l => l.startsWith('INSTALL '));
  const dests = installs.map(l => l.split(' ')[3]).sort();
  assert.deepEqual(dests, [
    'CLAUDE.md',
    'agents/adversarial-lens.md',
    'agents/behaviour-lens.md',
    'agents/conventions-lens.md',
    'agents/data-lens.md',
    'agents/executability-lens.md',
    'agents/good-enough-lens.md',
    'agents/integrity-lens.md',
    'agents/reader-lens.md',
    'agents/scout.md',
    'agents/unstated-lens.md',
    // The review procedure file (#261), at its one fixed live path.
    'pact/review.md',
  ]);
  for (const l of installs) assert.match(l, /^INSTALL [0-9a-f]{64} \S+ \S+$/);
});

test('a minimal valid unmigrated agent passes', t => {
  expectPass(t, { [A]: plainAgent('probe') });
});

test('an install line carries the staged bytes hash', t => {
  const r = expectPass(t, { [A]: plainAgent('probe') });
  const line = r.stdout.split('\n').find(l => l.endsWith(' agents/probe.md'));
  assert.ok(line, r.out);
  const [, hash, src] = line.split(' ');
  assert.equal(src, 'claude/agents/probe.md');
  assert.match(hash, /^[0-9a-f]{64}$/);
});

// The pact is vetted like a skill: seam A says it checks install mechanics, not what the files say.
test('seam A makes no claim about the rules file\'s words', t => {
  const r = expectPass(t, {});
  assert.doesNotMatch(r.stdout, /^NOTE partly-checked/m);
});

test('the settings overlay is never listed for install', t => {
  const r = expectPass(t, {});
  assert.doesNotMatch(r.stdout, /^INSTALL .*settings\.overlay\.json/m);
});

// ------------------------------------------------------------ the allow-list (C5 row)

test('bad case: hooks as a nested map fails the reader', t => {
  expectFail(t, { [A]: plainAgent('probe', ['hooks:', '  PreToolUse: x']) }, 'block-list');
});

test('bad case: an inline mcpServers as a flow map fails the reader', t => {
  expectFail(t, { [A]: plainAgent('probe', ['mcpServers: {a: b}']) }, 'value');
});

// #262: how the tools line is written is not the gate's question; Claude Code takes a comma list, a quoted one or brackets.
test('a tools line in any form Claude Code takes passes: a comma list, a quoted list, and brackets with a scoped Bash and an MCP tool', t => {
  for (const line of ['tools: Read, Glob, Grep', 'tools: "Read, Grep"', "tools: '[Read, Glob, Grep]'", 'tools: [Read, Bash(git:*), mcp__github__get_issue]']) {
    expectPass(t, { [A]: plainAgent('probe', [], line) });
  }
});

test('bad case: a duplicate tools key', t => {
  expectFail(t, { [A]: plainAgent('probe', ['tools: [Read, Glob, Grep, Bash]']) }, 'duplicate-key');
});

// The pact is vetted like a skill: which tools and keys an agent holds is the owner's to judge, not seam A's.
test('an agent with any tools, any key or no tools line passes and installs', t => {
  const r = expectPass(t, {
    'claude/agents/probe.md': plainAgent('probe', ['hooks: x', 'permissionMode: default'], 'tools: [Read, Bash, WebFetch, mcp__any__*]'),
    'claude/agents/bare.md': plainAgent('bare', [], null),
  });
  assert.match(r.stdout, /^INSTALL [0-9a-f]{64} claude\/agents\/probe\.md agents\/probe\.md$/m);
  assert.match(r.stdout, /^INSTALL [0-9a-f]{64} claude\/agents\/bare\.md agents\/bare\.md$/m);
});

// One live path per file: two agents whose names differ only in case install to one path.
test('bad case: two agents whose names differ only in case', t => {
  const probe = join(tempDir(t), 'Case');
  mkdirSync(probe);
  writeFileSync(join(probe, 'a'), '');
  let folds = false;
  try {
    readFileSync(join(probe, 'A'));
    folds = true;
  } catch {}
  if (folds) return t.skip('this disk folds case, so it cannot hold both files');
  const r = expectFail(t, { 'claude/agents/probe.md': plainAgent('probe'), 'claude/agents/Probe.md': plainAgent('Probe') }, 'name-duplicate');
  assert.ok(failRules(r.stdout).includes('destination-duplicate'), r.out);
});

// Agents install only from claude/agents/; familiars/ holds each agent's contract.
test('bad case: an agent file in familiars is of no known kind', t => {
  const r = expectFail(t, { 'familiars/probe.md': plainAgent('probe') }, 'unclassified');
  assert.doesNotMatch(r.stdout, /^INSTALL .*familiars/m);
});

test('bad case: a name that differs from the stem', t => {
  expectFail(t, { [A]: plainAgent('other') }, 'name-stem');
});

test('an agent named like an object property is unlisted, not inherited', t => {
  expectPass(t, { 'claude/agents/constructor.md': plainAgent('constructor') });
  expectPass(t, { 'claude/agents/toString.md': plainAgent('toString') });
});

test('model, effort and metadata are allowed keys', t => {
  expectPass(t, { [A]: plainAgent('probe', ['model: opus', 'effort: low', 'metadata:', '  owner: pact']) });
});

// ------------------------------------------------------------ the strict reader

test('reader: a byte-order mark', t => {
  expectFail(t, { [A]: `﻿${plainAgent('probe')}` }, 'bom');
});

test('reader: a comment line', t => {
  expectFail(t, { [A]: plainAgent('probe', ['# note']) }, 'comment');
});

test('reader: a trailing comment after a value', t => {
  expectFail(t, { [A]: plainAgent('probe', ['model: opus # note']) }, 'value');
});

test('reader: a block list', t => {
  expectFail(t, { [A]: plainAgent('probe', [], 'tools:\n  - Read\n  - Glob\n  - Grep') }, 'block-list');
});

test('reader: a list item at column zero', t => {
  expectFail(t, { [A]: plainAgent('probe', ['- Read']) }, 'block-list');
});

test('reader: an indented line', t => {
  expectFail(t, { [A]: plainAgent('probe', ['  model: opus']) }, 'indented');
});

test('reader: an invisible character', t => {
  expectFail(t, { [A]: plainAgent('probe', ['model: op​us']) }, 'invisible');
});

test('reader: an invisible character in the body', t => {
  expectFail(t, { [A]: agent(['name: probe', 'description: x', READ_ONLY], 'Bo‮dy.\n') }, 'invisible');
});

test('reader: a control character', t => {
  expectFail(t, { [A]: plainAgent('probe', ['model: op\u0007us']) }, 'characters');
});

test('reader: a carriage return', t => {
  expectFail(t, { [A]: plainAgent('probe').replace('\n', '\r\n') }, 'characters');
});

test('reader: a tab in the body is allowed', t => {
  expectPass(t, { [A]: agent(['name: probe', 'description: x', READ_ONLY], '```\n\tcode\n```\n') });
});

test('reader: a tab in the frontmatter fails', t => {
  expectFail(t, { [A]: plainAgent('probe', ['model:\topus']) }, 'value');
});

test('reader: a blank line in the frontmatter fails', t => {
  expectFail(t, { [A]: plainAgent('probe', ['']) }, 'blank');
});

test('reader: a block scalar fails', t => {
  expectFail(t, { [A]: plainAgent('probe', ['model: >', '  opus']) }, 'value');
});

test('reader: three dashes inside a frontmatter line fail', t => {
  expectFail(t, { [A]: agent(['name: probe', 'description: a --- b', READ_ONLY]) }, 'delimiter');
});

test('reader: a value YAML reads as a boolean or a number fails', t => {
  expectFail(t, { [A]: plainAgent('probe', ['model: yes']) }, 'value');
  expectFail(t, { [A]: plainAgent('probe', ['effort: 0x10']) }, 'value');
});

test('reader: a colon-space inside a plain value fails', t => {
  expectFail(t, { [A]: agent(['name: probe', 'description: a: b', READ_ONLY]) }, 'value');
});

test('reader: a quoted value is read', t => {
  expectPass(t, { [A]: agent(['name: probe', 'description: "a: b"', READ_ONLY]) });
});

test('reader: a duplicate metadata key', t => {
  expectFail(t, { [A]: plainAgent('probe', ['metadata:', '  a: x', '  a: y']) }, 'duplicate-key');
});

test('reader: a comment after a tab in a metadata value', t => {
  expectFail(t, { [A]: plainAgent('probe', ['metadata:', '  a: x\t#c']) }, 'value');
});

test('reader: a tab in a metadata value', t => {
  expectFail(t, { [A]: plainAgent('probe', ['metadata:', '  a: x\ty']) }, 'value');
});

test('reader: metadata nested deeper than two spaces', t => {
  expectFail(t, { [A]: plainAgent('probe', ['metadata:', '    a: x']) }, 'indented');
});

test('reader: no frontmatter', t => {
  expectFail(t, { [A]: 'name: probe\n' }, 'frontmatter');
});

test('reader: an unclosed frontmatter', t => {
  expectFail(t, { [A]: '---\nname: probe\ndescription: x\ntools: [Read, Glob, Grep]\n' }, 'frontmatter');
});

test('reader: invalid UTF-8', t => {
  const root = stage(t, {});
  mkdirSync(join(root, 'claude', 'agents'), { recursive: true });
  writeFileSync(join(root, 'claude', 'agents', 'probe.md'), Buffer.concat([Buffer.from(plainAgent('probe')), Buffer.from([0xff, 0xfe])]));
  const r = runSeamA(root);
  assert.ok(failRules(r.stdout).includes('encoding'), r.out);
});

// ------------------------------------------------------------ classification

test('classification: a file of no known kind in the payload', t => {
  expectFail(t, { 'claude/notes.txt': 'x\n' }, 'unclassified');
});

test('classification: an agent in a subfolder', t => {
  expectFail(t, { 'claude/agents/sub/probe.md': plainAgent('probe') }, 'unclassified');
});

test('classification: a non-.md file among the agents', t => {
  expectFail(t, { 'claude/agents/probe.txt': 'x\n' }, 'unclassified');
});

test('classification: a file of no known kind in familiars', t => {
  expectFail(t, { 'familiars/notes.txt': 'x\n' }, 'unclassified');
});

test('classification: a subfolder in familiars', t => {
  expectFail(t, { 'familiars/sub/probe.md': plainAgent('probe') }, 'unclassified');
});

// unclassified, #203 S6: builder/ holds only what the builder kit lists.
test('classification: a builder file the builder kit does not list', t => {
  expectFail(t, { 'builder/notes.txt': 'x\n' }, 'unclassified');
});

test('classification: a path with unsafe characters', t => {
  expectFail(t, { 'claude/agents/pro be.md': plainAgent('pro be') }, 'path');
});

test('classification: a symlink in the stage', t => {
  const root = stage(t, {});
  mkdirSync(join(root, 'claude', 'agents'), { recursive: true });
  const target = join(root, 'elsewhere.md');
  writeFileSync(target, plainAgent('probe'));
  try {
    symlinkSync(target, join(root, 'claude', 'agents', 'probe.md'), 'file');
  } catch {
    t.skip('symlinks need privileges here');
    return;
  }
  const r = runSeamA(root);
  assert.ok(failRules(r.stdout).includes('path'), r.out);
});

// ------------------------------------------------------------ the review procedure file (#261, S5)

const RV = 'claude/review.md';
const review = body => `# Review\n\n${body}\n`;

// #261 C3
test('the review file installs to pact/review.md and nowhere else', t => {
  const r = expectPass(t, {});
  const lines = r.stdout.split('\n').filter(l => l.includes(' claude/review.md '));
  assert.equal(lines.length, 1, r.out);
  assert.match(lines[0], /^INSTALL [0-9a-f]{64} claude\/review\.md pact\/review\.md$/);
});

// review-file
test('bad case: no review file in the stage', t => {
  expectFail(t, {}, 'review-file', root => rmSync(join(root, 'claude', 'review.md')));
});

// unclassified, #261 C3: the classifier takes exactly the review file beyond today's kinds.
// unclassified
test('bad case: a second unknown file beside the review file is still refused', t => {
  expectFail(t, { 'claude/review2.md': review('More procedure.') }, 'unclassified');
});

// The review file's refusals (#261 C3): one row per hidden-text form, each where a container puts it, and the size cap.
const REVIEW_BASE = () => ({ [RV]: review('Read this, and cross the reports.') });
/** Seam A on the real payload with `tree`'s review file, in-process through its core. */
function seamAReview(tree, t) {
  const r = runSeamA(stage(t, tree));
  return { ...moduleResult(r.code, r.stdout), stdout: r.stdout };
}
const withReview = body => () => ({ [RV]: review(body) });

// ------------------------------------------------------------ familiars

test('a practice test is never installed', t => {
  const r = expectPass(t, { 'familiars/probe.practice-test.md': '# practice\n', 'familiars/probe.contract.md': contractText() });
  assert.doesNotMatch(r.stdout, /^INSTALL .*practice-test/m);
});

test('a contract with no agent beside it is not installed and passes', t => {
  const r = expectPass(t, { 'familiars/orphan.contract.md': contractText() });
  assert.doesNotMatch(r.stdout, /orphan/);
});

// ------------------------------------------------------------ the gate's own files

function gateCopy(t, edit) {
  const g = copyGate(tempDir(t));
  edit(g);
  return join(g, 'seam-a.mjs');
}

test('gate: no stage root is a usage failure', t => {
  const r = spawnSync(process.execPath, [join(GATE, 'seam-a.mjs')], { encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.equal(lastLine(r.stdout), 'RESULT: fail');
});

test('gate: an internal error prints one fixed line and no detail', t => {
  const script = gateCopy(t, g => plantModule(g, 'seam-a', '// @@TEST-CRASH-HOOK@@', "throw new Error('CANARY-crash-detail');"));
  const r = runSeamA(stage(t, {}), script);
  assert.equal(lastLine(r.stdout), 'RESULT: fail', r.out);
  assert.ok(failRules(r.stdout).includes('internal'), r.out);
  assert.doesNotMatch(r.out, /CANARY/);
});

// ------------------------------------------------------------ never echoes content

test('canary: no value, key, metadata key or duplicate key is echoed', t => {
  const C = 'CANARYzq';
  const files = {
    'claude/agents/a1.md': plainAgent('a1', [`model: ${C}: x`]),
    'claude/agents/a2.md': plainAgent('a2', [`${C}key: x`]),
    'claude/agents/a3.md': plainAgent('a3', ['metadata:', `  ${C.toLowerCase()}meta: x`, `  ${C.toLowerCase()}meta: y`]),
    'claude/agents/a4.md': plainAgent('a4', [`model: ${C}`, `model: ${C}`]),
    'claude/agents/a5.md': plainAgent('a5', [], `tools: [Read, Glob, Grep, ${C}]`),
    'claude/agents/a6.md': plainAgent('a6', [`# ${C}`]),
    'claude/agents/a7.md': agent([`name: ${C}`, 'description: x', READ_ONLY]),
    'claude/agents/a8.md': plainAgent('a8', [`description: "${C}"`]),
    'claude/agents/a9.md': plainAgent('a9', [`hooks: ${C}`]),
    'claude/agents/a10.md': plainAgent('a10', [`  ${C}: x`]),
  };
  const r = runSeamA(stage(t, files));
  assert.equal(lastLine(r.stdout), 'RESULT: fail', r.out);
  assert.ok(!r.out.includes(C) && !r.out.includes(C.toLowerCase()), r.out);
});

// ------------------------------------------------------------ the strict reader and the character rules, through seam A
// The cases the cut parity file held for seam A's own side (#264, the cross script is gone): each gate rule keeps its bad case.

const READER = [
  ['a key twice', 'settings-duplicate', (json, key) => json.replace('{', `{"${key}": 1,`)],
  ['a key twice, case-folded', 'settings-duplicate', (json, key) => json.replace('{', `{"${key[0].toUpperCase()}${key.slice(1)}": 1,`)],
  ['a key twice, written with an escape', 'settings-duplicate', (json, key) => json.replace('{', `{"${key.slice(0, -1)}\\u00${key.charCodeAt(key.length - 1).toString(16)}": 1,`)],
  ['nesting 66 deep', 'settings-read', json => json.replace('{', `{"deep": ${'['.repeat(66)}${']'.repeat(66)},`)],
  ['nesting 60 deep (passes the reader)', null, json => json.replace('{', `{"deep": ${'['.repeat(60)}${']'.repeat(60)},`)],
  ['a trailing comma', 'settings-read', json => json.replace(/}\s*$/, ',}')],
  ['text after the value', 'settings-read', json => `${json} x`],
  ['a byte-order mark', 'settings-read', json => `﻿${json}`],
  ['a single-quoted string', 'settings-read', json => json.replace('{', "{'q': 1,")],
];

for (const [name, rule, defect] of READER) {
  test(`reader: ${name} is ${rule ? `refused as ${rule}` : 'read'}`, t => {
    const r = runSeamA(stage(t, { 'claude/settings.overlay.json': defect(realOverlay(), 'outputStyle') }));
    const rules = failRules(r.stdout);
    if (rule) assert.ok(rules.includes(rule), r.out);
    else assert.ok(!rules.includes('settings-read') && !rules.includes('settings-duplicate'), r.out);
  });
}

const CHARACTERS = [
  [0x0000, 'characters'], [0x0007, 'characters'], [0x000d, 'characters'], [0x007f, 'characters'], [0x0085, 'characters'],
  [0x009b, 'characters'], [0x2028, 'characters'], [0x2029, 'characters'], [0xfffe, 'characters'],
  [0x00ad, 'invisible'], [0x061c, 'invisible'], [0x200b, 'invisible'], [0x200d, 'invisible'], [0x202e, 'invisible'],
  [0x2066, 'invisible'], [0x2060, 'invisible'], [0xfeff, 'invisible'], [0xe0041, 'invisible'],
  [0x00e9, null], [0x00a0, null], [0x4e2d, null],
];

for (const [cp, rule] of CHARACTERS) {
  test(`characters: U+${cp.toString(16).toUpperCase().padStart(4, '0')} is ${rule ? `refused as ${rule}` : 'allowed'}`, t => {
    const r = runSeamA(stage(t, { 'claude/agents/parity-agent.md': agent(['name: parity-agent', 'description: A test agent.', 'tools: [Read, Glob, Grep]'], `Body ${String.fromCodePoint(cp)} here.\n`) }));
    if (rule) assert.ok(failRules(r.stdout).includes(rule), r.out);
    else assert.equal(r.code, 0, r.out);
  });
}
