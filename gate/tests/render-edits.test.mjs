// Edits to open parts (#53, slice 4): the renderer as a module (seam 3), and
// seam A on a rendered stage (seam 2). Driven through the renderer's command
// line, as the install script runs it, and judged on what it prints and the
// files it writes. The expected render, digest and diff checks are built here,
// never taken from the renderer.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { linkSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { stage } from './payload.mjs';
import { GATE, RENDER, REPO, applyDiff, editPart, failRules, lastLine, plainAgent, withoutOpenMarks } from './text.mjs';
import { read, tempDir, writeTree } from './tree.mjs';
import { renderStage, runCore, runSeamA } from './gate-run.mjs';
import { moduleResult, table } from './tables.mjs';

const WIN = process.platform === 'win32';
const SOURCE = join(REPO, 'claude', 'CLAUDE.md');
const EXAMPLES = join(REPO, 'examples', 'pact-config');
const EXAMPLE_EDITS = join(EXAMPLES, 'config-with-edits.json');
const GATED = readdirSync(join(GATE, 'clauses'))
  .filter(f => f.endsWith('.md'))
  .map(f => f.slice(0, -3))
  .sort();
const OPS = ['replace', 'remove', 'add-after'];

const sha256 = b => createHash('sha256').update(b).digest('hex');

/** A Claude home folder with pact/config.json holding `config` and pact/blocks/<path> holding each block. */
function homeWith(t, config, blocks = {}) {
  const h = tempDir(t, 'pact-edit-home-');
  mkdirSync(join(h, 'pact', 'blocks'), { recursive: true });
  writeFileSync(join(h, 'pact', 'config.json'), typeof config === 'string' || Buffer.isBuffer(config) ? config : JSON.stringify(config));
  for (const [rel, text] of Object.entries(blocks)) {
    const p = join(h, 'pact', 'blocks', ...rel.split('/'));
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text);
  }
  return h;
}

/** The example blocks, as { path: bytes }. */
function exampleBlocks() {
  const out = {};
  for (const f of readdirSync(join(EXAMPLES, 'blocks'))) out[f] = readFileSync(join(EXAMPLES, 'blocks', f));
  return out;
}

const cfg = (edits, settings) => ({ schema: 1, ...(settings ? { settings } : {}), edits });

function render(t, home, src = SOURCE, { fault, faultFile } = {}) {
  const dir = tempDir(t, 'pact-render-out-');
  const log = join(tempDir(t), 'faults.log');
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  const pre = [];
  if (fault) {
    Object.assign(env, { PACT_FAULT: fault, PACT_FAULT_LOG: log, PACT_FAULT_FILE: faultFile ?? 'block' });
    pre.push('--import', pathToFileURL(join(REPO, 'gate', 'tests', 'fixtures', 'render-faults.mjs')).href);
  }
  const r = spawnSync(process.execPath, [...pre, RENDER, src, dir, home], { encoding: 'utf8', env });
  const get = n => {
    try {
      return readFileSync(join(dir, n));
    } catch {
      return null;
    }
  };
  let seen = [];
  try {
    seen = readFileSync(log, 'utf8').split('\n').filter(Boolean);
  } catch {}
  return { code: r.status, stdout: r.stdout, out: r.stdout + r.stderr, dir, bytes: get('CLAUDE.md'), diff: get('config.diff'), seen };
}

function refusedWith(r, rule, reason) {
  assert.equal(r.code, 1, r.out);
  assert.equal(lastLine(r.stdout), 'RESULT: fail', r.out);
  assert.match(r.stdout, new RegExp(`^FAIL ${rule}: `, 'm'), r.out);
  if (reason) assert.match(r.stdout, reason, r.out);
  assert.doesNotMatch(r.stdout, /^(RENDERED|DIFF|CONFIG|DIGEST|VALUE|EDIT) /m, r.out);
  assert.deepEqual(readdirSync(r.dir), [], 'a refused render writes no file');
}

function sourceFile(t, content) {
  const p = join(tempDir(t, 'pact-render-src-'), 'CLAUDE.md');
  writeFileSync(p, content);
  return p;
}

// ------------------------------------------------------------ the expected render, built here

const blockLines = buf => buf.toString('utf8').slice(0, -1).split('\n');

/** The configured render: each edit applied with its block re-indented, the usage value, the notice, open marks gone. */
function expected(src, { digest, value, edits }) {
  let s = src;
  if (value !== undefined) s = s.replace('When it is above 75%,', `When it is above ${value}%,`);
  for (const e of edits) {
    s = editPart(s, e.mark, (now, indent) => {
      const block = e.bytes ? blockLines(e.bytes).map(l => `${indent}${l}`) : [];
      return e.op === 'replace' ? block : e.op === 'remove' ? [] : [...now, ...block];
    });
  }
  const parts = edits.length ? edits.map(e => `${e.mark} (${e.op})`).join(', ') : 'none';
  s = editPart(s, 'config-notice', () => [
    '',
    `**Configuration in effect.** This file was rendered with the configuration \`${digest}\`.`,
    `Values set: ${value === undefined ? 'none' : `usage-pause ${value}`}. Parts edited: ${parts}.`,
  ]);
  return withoutOpenMarks(s);
}

/** The digest, from the user file and each block in edit order. */
function digestOf(configBytes, edits) {
  const blocks = edits.filter(e => e.bytes).map(e => `block ${e.path} ${sha256(e.bytes)}\n`);
  return sha256(`user ${sha256(configBytes)}\n${blocks.join('')}`).slice(0, 12);
}

// ------------------------------------------------------------ a configuration with edits

test('the shipped example edits install-ready: each block re-indented into its part, the notice names every edited part, the digest covers the blocks', t => {
  const config = readFileSync(EXAMPLE_EDITS);
  const blocks = exampleBlocks();
  const doc = JSON.parse(config);
  const edits = doc.edits.map(e => ({ ...e, path: e.file, bytes: e.file ? blocks[e.file] : null }));
  assert.ok(edits.length >= 3 && edits.every(e => e.bytes), 'every example edit names a shipped block');
  // #127: move 1 takes the preset set's block, added after the default text (the expected render below is built from the file, so pin it here).
  assert.deepEqual(doc.edits.find(e => e.mark === 'move-1'), { mark: 'move-1', op: 'add-after', file: 'move-1-matt-pocock.md' });
  const r = render(t, homeWith(t, config, blocks));
  assert.equal(r.code, 0, r.out);
  const digest = digestOf(config, edits);
  const want = expected(read(SOURCE), { digest, value: 90, edits });
  assert.equal(r.bytes.toString('utf8'), want);
  assert.deepEqual(r.stdout.split('\n'), [
    `RENDERED ${sha256(r.bytes)}`,
    `DIFF ${sha256(r.diff)}`,
    `CONFIG user ${sha256(config)}`,
    `DIGEST ${digest}`,
    'VALUE usage-pause 90',
    ...edits.map(e => `EDIT ${e.mark} ${e.op} ${sha256(e.bytes)} ${e.path}`),
    'COMMANDS none',
    'RESULT: pass',
    '',
  ]);
  // The diff takes the no-configuration render to this one, exactly.
  assert.equal(applyDiff(withoutOpenMarks(read(SOURCE)), r.diff.toString('utf8')), want);
});

test('each shipped example block is known-good on its own, under each operation that takes a file', t => {
  for (const [path, bytes] of Object.entries(exampleBlocks())) {
    for (const op of ['replace', 'add-after']) {
      const r = render(t, homeWith(t, cfg([{ mark: 'move-4-extra', op, file: path }]), { [path]: bytes }));
      assert.equal(r.code, 0, `${path} ${op}\n${r.out}`);
    }
  }
});

// #261 C14
// #262: a move's body is its part, so a remove leaves its lead-in alone.
test('a remove takes out the move\'s text and keeps its bullet and lead-in', t => {
  const config = JSON.stringify(cfg([{ mark: 'move-1', op: 'remove' }]));
  const r = render(t, homeWith(t, config));
  assert.equal(r.code, 0, r.out);
  const edits = [{ mark: 'move-1', op: 'remove' }];
  assert.equal(r.bytes.toString('utf8'), expected(read(SOURCE), { digest: digestOf(Buffer.from(config), edits), edits }));
  assert.match(r.stdout, /^EDIT move-1 remove$/m);
  assert.match(r.bytes.toString('utf8'), /^- \*\*Sense the work\.\*\*\n- \*\*Think before doing\.\*\*\n/m);
});

// #261 C14
// #262: a replace takes the move's whole text, under its lead-in.
test('a replace keeps the move\'s bullet and lead-in, and the digest changes when only a block changes', t => {
  const config = JSON.stringify(cfg([{ mark: 'move-3', op: 'replace', file: 'm3.md' }]));
  const a = render(t, homeWith(t, config, { 'm3.md': 'First text.\n' }));
  const b = render(t, homeWith(t, config, { 'm3.md': 'Second text.\n' }));
  assert.equal(a.code, 0, a.out);
  assert.equal(b.code, 0, b.out);
  assert.match(a.bytes.toString('utf8'), /^- \*\*Checkpoint the seams\.\*\*\n {2}First text\.\n- \*\*Stay the owner\.\*\*\n/m);
  const dA = /^DIGEST (\S+)$/m.exec(a.stdout)[1];
  const dB = /^DIGEST (\S+)$/m.exec(b.stdout)[1];
  assert.notEqual(dA, dB, 'a block change must show in the digest');
  assert.equal(/^CONFIG user (\S+)$/m.exec(a.stdout)[1], /^CONFIG user (\S+)$/m.exec(b.stdout)[1], 'the user file is the same');
});

test('with no edits, the digest is slice 3\'s: the user file\'s hash alone', t => {
  const config = Buffer.from('{"schema": 1, "settings": {"usage-pause": 90}, "edits": []}\n');
  const r = render(t, homeWith(t, config));
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, new RegExp(`^DIGEST ${sha256(`user ${sha256(config)}\n`).slice(0, 12)}$`, 'm'));
});

test('a block in a sub-folder of the blocks folder is read', t => {
  const r = render(t, homeWith(t, cfg([{ mark: 'move-4-extra', op: 'add-after', file: 'team/extra.md' }]), { 'team/extra.md': 'Extra step.\n' }));
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^EDIT move-4-extra add-after [0-9a-f]{64} team\/extra\.md$/m);
});

// #261 C10
test('with no configuration the diff is empty, and with a values-only one it shows only the value and the notice', t => {
  const none = render(t, tempDir(t));
  assert.equal(none.code, 0, none.out);
  assert.equal(none.diff.length, 0);
  const config = '{"schema": 1, "settings": {"usage-pause": 90}}';
  const r = render(t, homeWith(t, config));
  assert.equal(r.code, 0, r.out);
  const d = r.diff.toString('utf8');
  assert.deepEqual(
    d.split('\n').filter(l => /^[-+][^-+]/.test(l) || /^[-+]$/.test(l)),
    [
      '+',
      `+**Configuration in effect.** This file was rendered with the configuration \`${sha256(`user ${sha256(Buffer.from(config))}\n`).slice(0, 12)}\`.`,
      '+Values set: usage-pause 90. Parts edited: none.',
      '-  and tell me the figure and a rough cost. When it is above 75%, wait for my',
      '+  and tell me the figure and a rough cost. When it is above 90%, wait for my',
    ],
  );
  assert.equal(applyDiff(withoutOpenMarks(read(SOURCE)), d), r.bytes.toString('utf8'));
});

// ------------------------------------------------------------ re-indenting is load-bearing (seam 2)

// #261 C14
test('re-indented block text stays inside its move: a move-4-extra block lands at the bullet\'s indent, and seam A passes', t => {
  const root = stage(t, { 'claude/agents/extra-agent.md': plainAgent('extra-agent') });
  const block = 'Then run `extra-agent` on the diff.\n';
  renderStage(root, homeWith(t, cfg([{ mark: 'move-4-extra', op: 'add-after', file: 'x.md' }]), { 'x.md': block }));
  assert.match(read(join(root, 'claude', 'CLAUDE.md')), /^ {2}when to stop it\. Checks that could have failed are the evidence\.\n {2}Then run `extra-agent` on the diff\.$/m);
  const r = runSeamA(root);
  assert.equal(r.code, 0, r.out);
});

// ------------------------------------------------------------ seam A on a rendered stage (seam 2)

test('seam A: a block naming the user\'s own agent, not on the roster and not installed, passes', t => {
  const root = stage(t, {});
  renderStage(root, homeWith(t, cfg([{ mark: 'move-4-extra', op: 'add-after', file: 'own.md' }]), { 'own.md': 'Then run `my-reviewer`, my own agent, on the diff.\n' }));
  const r = runSeamA(root);
  assert.equal(r.code, 0, r.out);
});
// ------------------------------------------------------------ planted controls: the renderer's text checks are load-bearing

// block-text
test('a block holding a setext heading is refused by the renderer; seam A no longer checks form (#261)', t => {
  refusedWith(render(t, homeWith(t, cfg([{ mark: 'move-4-extra', op: 'add-after', file: 'b.md' }]), { 'b.md': 'Title\n===\n' })), 'block-text', /a setext heading underline/);
});

// rules-import: the second layer (#261, S5). The renderer refuses an @ import in a block first; seam A refuses one in the rendered rules file however it got there.
test('control: an @ import in open text fails seam A without the renderer, and the renderer refuses it as a block', t => {
  const root = stage(t, {});
  const md = join(root, 'claude', 'CLAUDE.md');
  writeFileSync(md, editPart(read(md), 'move-4-extra', (now, indent) => [`${indent}See @notes.md for more.`]));
  const r = runSeamA(root);
  assert.notEqual(r.code, 0, r.out);
  assert.ok(failRules(r.stdout).includes('rules-import'), r.out);
  refusedWith(render(t, homeWith(t, cfg([{ mark: 'move-4-extra', op: 'add-after', file: 'b.md' }]), { 'b.md': 'See @notes.md for more.\n' })), 'block-text', /an @ followed by text/);
});

// #261 C5
test('control: a heading and a numbered line pass seam A without the renderer, and the renderer refuses them as a block', t => {
  const root = stage(t, {});
  const md = join(root, 'claude', 'CLAUDE.md');
  writeFileSync(md, `${read(md)}\n## Extra steps\n\n1. Do this first.\n`);
  const r = runSeamA(root);
  assert.equal(r.code, 0, `seam A was expected to miss the heading and the numbered line:\n${r.out}`);
  const bad = render(t, homeWith(t, cfg([{ mark: 'move-4-extra', op: 'add-after', file: 'b.md' }]), { 'b.md': '## Extra steps\n1. Do this first.\n' }));
  refusedWith(bad, 'block-text', /line 1: an ATX heading/);
  assert.match(bad.stdout, /line 2: a numbered list line/);
});

// ------------------------------------------------------------ gated marks and renderer-owned parts


// #261 C4
test('the pinned blocks refused are exactly gate/clauses/, install-go-ahead included', () => {
  assert.equal(GATED.length, 2, GATED.join(', '));
  assert.ok(GATED.includes('install-go-ahead'));
});

for (const op of OPS) {
  test(`bad case: an edit to usage-pause with ${op} refuses: it is set only through its setting`, t => {
    const edit = op === 'remove' ? { mark: 'usage-pause', op } : { mark: 'usage-pause', op, file: 'ok.md' };
    refusedWith(render(t, homeWith(t, cfg([edit]), { 'ok.md': 'Text.\n' })), 'edit-setting', /usage-pause is set only through its setting/);
  });
  test(`bad case: an edit to config-notice with ${op} refuses: the renderer fills it`, t => {
    const edit = op === 'remove' ? { mark: 'config-notice', op } : { mark: 'config-notice', op, file: 'ok.md' };
    refusedWith(render(t, homeWith(t, cfg([edit]), { 'ok.md': 'Text.\n' })), 'edit-notice', /config-notice is filled by the renderer/);
  });
}

// ------------------------------------------------------------ the must-refuse tables (#140, T5)

// Both tables share a base: a Claude home whose configuration adds one good
// block after move-4-extra, which renders. A row plants one configuration.
const OK_EDIT = { mark: 'move-4-extra', op: 'add-after', file: 'ok.md' };
const editHome = () => ({ 'pact/config.json': JSON.stringify(cfg([OK_EDIT])), 'pact/blocks/ok.md': 'Text.\n' });
const withEdits = edits => home => ({ ...home, 'pact/config.json': JSON.stringify(cfg(edits)) });
const withPath = path => withEdits([{ ...OK_EDIT, file: path }]);

/**
 * The renderer on a home built from `tree`, in-process through its core
 * (#140, T10): the tables' runner. parity.test.mjs proves the core prints
 * what the wrapper the install runs prints. This file's fault cases stay
 * child runs through render(), since their preload patches the whole process.
 */
function renderTree(tree, t) {
  const h = tempDir(t, 'pact-edit-home-');
  writeTree(h, tree);
  const dir = tempDir(t, 'pact-render-out-');
  const r = { ...runCore('render', [SOURCE, dir, h]), dir };
  // `says` reads stdout alone, where the renderer prints its FAIL lines, as the loops this replaces did.
  return { ...moduleResult(r.code, r.stdout), stdout: r.stdout, dir: r.dir };
}

/** What every refusal keeps: no render, digest or diff line is printed, and no file is written. */
function refusedOnly(r) {
  assert.doesNotMatch(r.stdout, /^(RENDERED|DIFF|CONFIG|DIGEST|VALUE|EDIT) /m, r.out);
  assert.deepEqual(readdirSync(r.dir), [], 'a refused render writes no file');
}

// ------------------------------------------------------------ the must-refuse table: the edit list

// #261 C4
for (const c of table('render edit list', {
  module: 'gate/render.mjs',
  base: editHome,
  run: renderTree,
  everyRow: refusedOnly,
  rows: [
    { id: 'unknown-mark', plant: withEdits([{ mark: 'move-9', op: 'remove' }]), fails: ['edit-mark'], says: /edit 1: an unknown mark/, why: 'an unknown mark' },
    { id: 'mark-in-another-case', plant: withEdits([{ mark: 'Move-2', op: 'remove' }]), fails: ['edit-mark'], says: /edit 1: an unknown mark/, why: 'a mark in another case' },
    // edit-gated, #261 C4: no edit may target a pinned block, with any operation.
    { id: 'pinned-stop-and-escalate-remove', plant: withEdits([{ mark: 'stop-and-escalate', op: 'remove' }]), fails: ['edit-gated'], says: /edit 1: stop-and-escalate is a pinned block; no edit may target it/, why: 'removing the pinned stop-and-ask block' },
    { id: 'pinned-stop-and-escalate-replace', plant: withEdits([{ mark: 'stop-and-escalate', op: 'replace', file: 'ok.md' }]), fails: ['edit-gated'], says: /edit 1: stop-and-escalate is a pinned block; no edit may target it/, why: 'replacing the pinned stop-and-ask block' },
    { id: 'pinned-stop-and-escalate-add-after', plant: withEdits([{ mark: 'stop-and-escalate', op: 'add-after', file: 'ok.md' }]), fails: ['edit-gated'], says: /edit 1: stop-and-escalate is a pinned block; no edit may target it/, why: 'adding after the pinned stop-and-ask block' },
    { id: 'pinned-install-go-ahead-remove', plant: withEdits([{ mark: 'install-go-ahead', op: 'remove' }]), fails: ['edit-gated'], says: /edit 1: install-go-ahead is a pinned block; no edit may target it/, why: 'removing the pinned install go-ahead' },
    { id: 'pinned-install-go-ahead-replace', plant: withEdits([{ mark: 'install-go-ahead', op: 'replace', file: 'ok.md' }]), fails: ['edit-gated'], says: /edit 1: install-go-ahead is a pinned block; no edit may target it/, why: 'replacing the pinned install go-ahead' },
    { id: 'pinned-install-go-ahead-add-after', plant: withEdits([{ mark: 'install-go-ahead', op: 'add-after', file: 'ok.md' }]), fails: ['edit-gated'], says: /edit 1: install-go-ahead is a pinned block; no edit may target it/, why: 'adding after the pinned install go-ahead' },
    { id: 'gated-mark-in-another-case', plant: withEdits([{ mark: 'Stop-And-Escalate', op: 'remove' }]), fails: ['edit-mark'], says: /edit 1: an unknown mark/, why: 'a pinned mark in another case' },
    // #261: a block the gate retired is no mark at all.
    { id: 'retired-gated-mark', plant: withEdits([{ mark: 'risk-floor', op: 'remove' }]), fails: ['edit-mark'], says: /edit 1: an unknown mark/, why: 'a retired gated clause, now an unknown mark' },
    { id: 'mark-not-text', plant: withEdits([{ mark: 2, op: 'remove' }]), fails: ['edit-shape'], says: /edit 1: mark must be text/, why: 'a mark that is not text' },
    { id: 'no-mark', plant: withEdits([{ op: 'remove' }]), fails: ['edit-shape'], says: /edit 1: mark must be text/, why: 'no mark' },
    { id: 'unknown-op', plant: withEdits([{ mark: 'move-2', op: 'append', file: 'ok.md' }]), fails: ['edit-op'], says: /edit 1: an unknown operation/, why: 'an unknown operation' },
    { id: 'op-in-another-case', plant: withEdits([{ mark: 'move-2', op: 'Replace', file: 'ok.md' }]), fails: ['edit-op'], says: /edit 1: an unknown operation/, why: 'an operation in another case' },
    { id: 'no-op', plant: withEdits([{ mark: 'move-2', file: 'ok.md' }]), fails: ['edit-op'], says: /edit 1: an unknown operation/, why: 'no operation' },
    { id: 'op-not-text', plant: withEdits([{ mark: 'move-2', op: ['replace'], file: 'ok.md' }]), fails: ['edit-op'], says: /edit 1: an unknown operation/, why: 'an operation that is not text' },
    { id: 'same-mark-twice', plant: withEdits([{ mark: 'move-2', op: 'remove' }, { mark: 'move-2', op: 'replace', file: 'ok.md' }]), fails: ['edit-twice'], says: /edit 2: move-2 is edited twice/, why: 'the same mark twice' },
    { id: 'edit-not-object', plant: withEdits(['move-2']), fails: ['edit-shape'], says: /edit 1: not an object/, why: 'an edit that is not an object' },
    { id: 'edit-null', plant: withEdits([null]), fails: ['edit-shape'], says: /edit 1: not an object/, why: 'an edit that is null' },
    { id: 'unknown-key', plant: withEdits([{ mark: 'move-2', op: 'remove', when: 'always' }]), fails: ['edit-shape'], says: /edit 1: a key that is not mark, op or file/, why: 'an unknown key in an edit' },
    { id: 'proto-key', plant: withEdits(JSON.parse('[{"mark": "move-2", "op": "remove", "__proto__": {"file": "x"}}]')), fails: ['edit-shape'], says: /edit 1: a key that is not mark, op or file/, why: 'a __proto__ key in an edit' },
    { id: 'remove-with-file', plant: withEdits([{ mark: 'move-2', op: 'remove', file: 'ok.md' }]), fails: ['edit-shape'], says: /edit 1: remove takes no file/, why: 'remove with a file' },
    { id: 'replace-without-file', plant: withEdits([{ mark: 'move-2', op: 'replace' }]), fails: ['edit-shape'], says: /edit 1: replace needs a file/, why: 'replace with no file' },
    { id: 'add-after-without-file', plant: withEdits([{ mark: 'move-2', op: 'add-after' }]), fails: ['edit-shape'], says: /edit 1: add-after needs a file/, why: 'add-after with no file' },
    { id: 'over-16-edits', plant: withEdits(Array.from({ length: 17 }, () => ({ mark: 'move-1', op: 'remove' }))), fails: ['edit-count'], says: /more than 16 edits/, why: 'over 16 edits' },
    { id: 'edits-as-object', plant: withEdits({}), fails: ['config-edits'], says: /edits must be a list/, why: 'edits as an object' },
    { id: 'edits-as-string', plant: withEdits('move-2'), fails: ['config-edits'], says: /edits must be a list/, why: 'edits as a string' },
    // #142: the session setting's part, like the weekly one's, is filled only from its setting.
    { id: 'session-setting-part', plant: withEdits([{ mark: 'usage-pause-session', op: 'replace', file: 'ok.md' }]), fails: ['edit-setting'], says: /edit 1: usage-pause-session is set only through its setting/, why: 'an edit to the session setting\'s part' },
    // block-text on the parts Scriptorium builds (#262, S9): each part, and each of the two refusals.
    { id: 'tiers-comment-opener', plant: h => ({ ...withEdits([{ mark: 'tiers', op: 'replace', file: 'ok.md' }])(h), 'pact/blocks/ok.md': '| Tier | <!-- x --> |\n' }), fails: ['block-text'], says: /an HTML comment opener/, why: 'a comment opener in a tiers block' },
    { id: 'sensitive-at-import', plant: h => ({ ...withEdits([{ mark: 'sensitive', op: 'replace', file: 'ok.md' }])(h), 'pact/blocks/ok.md': 'Read @notes.md first.\n' }), fails: ['block-text'], says: /an @ followed by text/, why: 'an @ import in a sensitive block' },
    { id: 'workflow-comment-opener', plant: h => ({ ...withEdits([{ mark: 'workflow', op: 'add-after', file: 'ok.md' }])(h), 'pact/blocks/ok.md': '<!-- pact:end workflow -->\n' }), fails: ['block-text'], says: /an HTML comment opener/, why: 'a forged mark in a workflow block' },
    { id: 'lenses-at-import', plant: h => ({ ...withEdits([{ mark: 'lenses', op: 'replace', file: 'ok.md' }])(h), 'pact/blocks/ok.md': '| `my-lens` | See @rules.md |\n' }), fails: ['block-text'], says: /an @ followed by text/, why: 'an @ import in a lenses block' },
  ],
})) test(c.name, c.fn);

test('16 edits are not refused by the count: the same list refuses only for a mark edited twice', t => {
  const r = render(t, homeWith(t, cfg(Array.from({ length: 16 }, () => ({ mark: 'move-1', op: 'remove' })))));
  assert.doesNotMatch(r.stdout, /^FAIL edit-count/m, r.out);
  refusedWith(r, 'edit-twice', /edit 2: move-1 is edited twice/);
});

// edit-gated
test('a refusal reports every bad edit, each by its position', t => {
  const r = render(t, homeWith(t, cfg([{ mark: 'stop-and-escalate', op: 'remove' }, { mark: 'move-1', op: 'remove' }, { mark: 'nope', op: 'remove' }])));
  refusedWith(r, 'edit-gated', /edit 1: stop-and-escalate/);
  assert.match(r.stdout, /^FAIL edit-mark: pact\/config\.json: edit 3: an unknown mark$/m, r.out);
});

// ------------------------------------------------------------ the must-refuse table: block paths, on their text

for (const c of table('render block path', {
  module: 'gate/render.mjs',
  base: editHome,
  run: renderTree,
  everyRow: refusedOnly,
  rows: [
    { id: 'empty', plant: withPath(''), fails: ['block-path'], says: /the block path is empty or not text/, why: 'an empty path' },
    { id: 'not-text', plant: withPath(5), fails: ['block-path'], says: /the block path is empty or not text/, why: 'a path that is not text' },
    { id: 'absolute', plant: withPath('/etc/passwd'), fails: ['block-path'], says: /an absolute path, a network share or a device path/, why: 'an absolute path' },
    { id: 'network-share', plant: withPath('\\\\server\\share\\a.md'), fails: ['block-path'], says: /an absolute path, a network share or a device path/, why: 'a network share' },
    { id: 'network-share-forward-slashes', plant: withPath('//server/share/a.md'), fails: ['block-path'], says: /an absolute path, a network share or a device path/, why: 'a network share with forward slashes' },
    { id: 'device-path', plant: withPath('\\\\?\\C:\\a.md'), fails: ['block-path'], says: /an absolute path, a network share or a device path/, why: 'a device path' },
    { id: 'device-namespace', plant: withPath('\\\\.\\pipe\\x'), fails: ['block-path'], says: /an absolute path, a network share or a device path/, why: 'a device namespace path' },
    { id: 'drive', plant: withPath('C:/Users/a.md'), fails: ['block-path'], says: /a drive or drive-relative path/, why: 'a drive path' },
    { id: 'drive-relative', plant: withPath('C:a.md'), fails: ['block-path'], says: /a drive or drive-relative path/, why: 'a drive-relative path' },
    { id: 'backslash', plant: withPath('team\\a.md'), fails: ['block-path'], says: /a backslash separator/, why: 'a backslash separator' },
    { id: 'stream', plant: withPath('a.md:secret'), fails: ['block-path'], says: /stream syntax/, why: 'stream syntax' },
    { id: 'stream-type', plant: withPath('a.md::$DATA'), fails: ['block-path'], says: /stream syntax/, why: 'a stream type' },
    { id: 'dot-dot', plant: withPath('../config.json'), fails: ['block-path'], says: /a \. or \.\. segment/, why: 'a .. segment' },
    { id: 'dot-dot-inside', plant: withPath('team/../a.md'), fails: ['block-path'], says: /a \. or \.\. segment/, why: 'a .. segment inside' },
    { id: 'dot', plant: withPath('./a.md'), fails: ['block-path'], says: /a \. or \.\. segment/, why: 'a . segment' },
    { id: 'empty-segment', plant: withPath('team//a.md'), fails: ['block-path'], says: /an empty path segment/, why: 'an empty segment' },
    { id: 'trailing-slash', plant: withPath('team/'), fails: ['block-path'], says: /an empty path segment/, why: 'a trailing slash' },
    { id: 'segment-ends-in-dot', plant: withPath('a.md.'), fails: ['block-path'], says: /a segment ending in a dot or a space/, why: 'a segment ending in a dot' },
    { id: 'folder-ends-in-dot', plant: withPath('team./a.md'), fails: ['block-path'], says: /a segment ending in a dot or a space/, why: 'a folder ending in a dot' },
    { id: 'segment-ends-in-space', plant: withPath('a.md '), fails: ['block-path'], says: /a segment ending in a dot or a space/, why: 'a segment ending in a space' },
    { id: 'reserved-name', plant: withPath('con'), fails: ['block-path'], says: /a reserved device name/, why: 'a reserved device name' },
    { id: 'reserved-name-with-extension', plant: withPath('CON.md'), fails: ['block-path'], says: /a reserved device name/, why: 'a reserved device name with an extension' },
    { id: 'reserved-com', plant: withPath('com1.txt'), fails: ['block-path'], says: /a reserved device name/, why: 'a reserved COM name' },
    { id: 'reserved-lpt-in-folder', plant: withPath('team/lpt9.md'), fails: ['block-path'], says: /a reserved device name/, why: 'a reserved LPT name in a folder' },
    { id: 'reserved-nul', plant: withPath('Nul.md'), fails: ['block-path'], says: /a reserved device name/, why: 'a reserved NUL name' },
    { id: 'space-in-name', plant: withPath('my block.md'), fails: ['block-path'], says: /a character outside letters, digits/, why: 'a space inside a name' },
    { id: 'non-ascii', plant: withPath('blöck.md'), fails: ['block-path'], says: /a character outside letters, digits/, why: 'a non-ASCII letter' },
    { id: 'tilde', plant: withPath('~/a.md'), fails: ['block-path'], says: /a character outside letters, digits/, why: 'a tilde' },
    { id: 'environment-reference', plant: withPath('%USERPROFILE%/a.md'), fails: ['block-path'], says: /a character outside letters, digits/, why: 'an environment reference' },
    { id: 'over-200-characters', plant: withPath(`${'a'.repeat(198)}.md`), fails: ['block-path'], says: /longer than 200 characters/, why: 'a path over 200 characters' },
    { id: 'over-8-segments', plant: withPath('a/b/c/d/e/f/g/h/i.md'), fails: ['block-path'], says: /more than 8 path segments/, why: 'more than 8 segments' },
  ],
})) test(c.name, c.fn);

test('a path refused on its text is refused before any file is opened, even when the file it names is there and good', t => {
  const h = homeWith(t, cfg([{ mark: 'move-4-extra', op: 'add-after', file: '../outside.md' }]));
  writeFileSync(join(h, 'pact', 'outside.md'), 'Good text.\n');
  const r = render(t, h, SOURCE, { fault: 'count', faultFile: 'block' });
  refusedWith(r, 'block-path', /a \. or \.\. segment/);
  assert.deepEqual(r.seen, [], 'no block file was opened');
});

test('a console name a reserved-name check must not catch reads as a normal block', t => {
  const r = render(t, homeWith(t, cfg([{ mark: 'move-4-extra', op: 'add-after', file: 'console.md' }]), { 'console.md': 'Text.\n' }));
  assert.equal(r.code, 0, r.out);
});

// ------------------------------------------------------------ the must-refuse table: block text

const TEXT_BAD = [
  // [label, bytes, rule, reason]
  ['an empty block', '', 'block-text', /empty/],
  ['a block of one line feed', '\n', 'block-text', /empty/],
  ['a block with no final line feed', 'Text.', 'block-text', /must end with exactly one line feed/],
  ['a block ending in two line feeds', 'Text.\n\n', 'block-text', /must end with exactly one line feed/],
  ['an HTML comment', 'Text <!-- hidden --> here.\n', 'block-text', /an HTML comment opener/],
  ['a forged mark', '<!-- pact:end move-4 -->\n', 'block-text', /an HTML comment opener/],
  ['an @ import', 'See @notes.md.\n', 'block-text', /an @ followed by text/],
  ['an @ import of a home file', 'Read @~/.ssh/config now.\n', 'block-text', /an @ followed by text/],
  ['an @ import in a code span', 'Run `@notes.md` first.\n', 'block-text', /an @ followed by text/],
  ['an @ in an address', 'Mail a@b.example.\n', 'block-text', /an @ followed by text/],
  ['an @ before a tab', 'Tab @\there.\n', 'block-text', /an @ followed by text/],
  ['a blank line', 'One.\n\nTwo.\n', 'block-text', /line 2: a blank line/],
  ['a line of spaces', 'One.\n   \nTwo.\n', 'block-text', /line 2: a blank line/],
  ['a leading space', ' Indented.\n', 'block-text', /line 1: a leading space or tab/],
  ['a leading tab', '\tIndented.\n', 'block-text', /line 1: a leading space or tab/],
  ['a backtick code fence', '```\ncode\n```\n', 'block-text', /line 1: a code fence/],
  ['a tilde code fence', '~~~js\n', 'block-text', /line 1: a code fence/],
  ['an ATX heading', '# Heading\n', 'block-text', /line 1: an ATX heading/],
  ['a level-6 ATX heading', '###### Heading\n', 'block-text', /line 1: an ATX heading/],
  ['an empty ATX heading', 'Text.\n#\n', 'block-text', /line 2: an ATX heading/],
  ['a setext = underline', 'Title\n===\n', 'block-text', /line 2: a setext heading underline/],
  ['a setext - underline', 'Title\n---\n', 'block-text', /line 2: a setext heading underline/],
  ['a thematic break of stars', '***\n', 'block-text', /line 1: a thematic break/],
  ['a thematic break of underscores', '___\n', 'block-text', /line 1: a thematic break/],
  ['a spaced thematic break', '* * *\n', 'block-text', /line 1: a thematic break/],
  ['a numbered line', '1. First.\n', 'block-text', /line 1: a numbered list line/],
  ['a numbered line with a parenthesis', 'Text.\n2) Second.\n', 'block-text', /line 2: a numbered list line/],
  ['a bare number and dot', '10.\n', 'block-text', /line 1: a numbered list line/],
  ['CRLF line endings', 'One.\r\nTwo.\r\n', 'block-crlf', /CRLF \(Windows\) line endings; save it with LF line endings only/],
  ['a lone carriage return', 'One.\rTwo.\n', 'block-crlf', /a carriage return/],
  ['a byte-order mark', '\ufeffText.\n', 'bom', /a byte-order mark/],
  ['a control character', 'Bell \u0007.\n', 'characters', /a control or line-separator character/],
  ['a hidden character', 'Zero\u200bwidth.\n', 'invisible', /an invisible or direction-changing character/],
  ['a direction override', 'Flip \u202e.\n', 'invisible', /an invisible or direction-changing character/],
];

for (const [label, text, rule, reason] of TEXT_BAD) {
  test(`bad case: a block with ${label} refuses`, t => {
    const r = render(t, homeWith(t, cfg([{ mark: 'move-4-extra', op: 'add-after', file: 'b.md' }]), { 'b.md': text }));
    refusedWith(r, rule, reason);
    assert.match(r.stdout, new RegExp(`^FAIL ${rule}: pact/blocks/b\\.md`, 'm'), 'the refusal names the block file');
  });
}

test('bad case: a block that is not valid UTF-8 refuses', t => {
  const bytes = Buffer.concat([Buffer.from('Text '), Buffer.from([0xff, 0xfe]), Buffer.from('.\n')]);
  refusedWith(render(t, homeWith(t, cfg([{ mark: 'move-4-extra', op: 'add-after', file: 'b.md' }]), { 'b.md': bytes })), 'encoding', /not valid UTF-8/);
});

test('the block-text rules leave ordinary text alone: an @ before a space, a bullet, a number mid-line, a hash mid-line', t => {
  const block = 'Meet @ noon, then:\n- run the checks;\n- note step 1. in the log;\nTag it #done when it passes.\n';
  const r = render(t, homeWith(t, cfg([{ mark: 'move-4-extra', op: 'add-after', file: 'b.md' }]), { 'b.md': block }));
  assert.equal(r.code, 0, r.out);
});

test('a block of exactly 16 KiB is read; one byte more refuses, by the cap', t => {
  const line = `${'a'.repeat(79)}\n`;
  const at = Buffer.from(line.repeat(204) + 'b'.repeat(16 * 1024 - 80 * 204 - 1) + '\n');
  assert.equal(at.length, 16 * 1024);
  const ok = render(t, homeWith(t, cfg([{ mark: 'move-4-extra', op: 'add-after', file: 'b.md' }]), { 'b.md': at }));
  assert.equal(ok.code, 0, ok.out);
  const over = Buffer.concat([Buffer.from('c'), at]);
  refusedWith(render(t, homeWith(t, cfg([{ mark: 'move-4-extra', op: 'add-after', file: 'b.md' }]), { 'b.md': over })), 'block-size', /larger than 16 KiB/);
});

test('bad case: a render that blocks push past 1 MiB refuses, though every block is within its cap', t => {
  const parts = [
    '<!-- pact:begin config-notice -->',
    '<!-- pact:end config-notice -->',
    '<!-- pact:begin move-4-extra -->',
    '<!-- pact:end move-4-extra -->',
    '',
  ].join('\n');
  const pad = 1024 * 1024 - 1000 - Buffer.byteLength(parts);
  const src = Buffer.concat([Buffer.from(parts), Buffer.alloc(pad - 1, 0x61), Buffer.from('\n')]);
  const block = 'x'.repeat(2000) + '\n';
  refusedWith(render(t, homeWith(t, cfg([{ mark: 'move-4-extra', op: 'add-after', file: 'b.md' }]), { 'b.md': block }), sourceFile(t, src)), 'size', /would be larger than 1 MiB/);
  const none = render(t, tempDir(t), sourceFile(t, src));
  assert.equal(none.code, 0, none.out);
});

// ------------------------------------------------------------ block files on disk: the per-file checks, in Node

const edit1 = cfg([{ mark: 'move-4-extra', op: 'add-after', file: 'b.md' }]);

test('bad case: a block file that does not exist refuses', t => {
  refusedWith(render(t, homeWith(t, edit1)), 'block-file', /edit 1: the block file, or a folder on its path, does not exist/);
});

test('bad case: a missing blocks folder refuses', t => {
  const h = tempDir(t);
  mkdirSync(join(h, 'pact'));
  writeFileSync(join(h, 'pact', 'config.json'), JSON.stringify(edit1));
  refusedWith(render(t, h), 'block-file', /does not exist/);
});

test('bad case: a block path that is a folder refuses', t => {
  const h = homeWith(t, edit1);
  mkdirSync(join(h, 'pact', 'blocks', 'b.md'));
  refusedWith(render(t, h), 'block-file', /the block file is not a regular file/);
});

test('bad case: a blocks folder that is a file refuses', t => {
  const h = tempDir(t);
  mkdirSync(join(h, 'pact'));
  writeFileSync(join(h, 'pact', 'config.json'), JSON.stringify(edit1));
  writeFileSync(join(h, 'pact', 'blocks'), 'x');
  refusedWith(render(t, h), 'block-file', /the blocks folder is not a folder/);
});

test('bad case: a block file that is a dangling link refuses', t => {
  const h = homeWith(t, edit1);
  symlinkSync(join(tempDir(t), 'gone'), join(h, 'pact', 'blocks', 'b.md'), 'junction');
  refusedWith(render(t, h), 'block-file', /the block file is a link/);
});

test('bad case: a block file that is a link to a good file refuses', t => {
  const real = join(tempDir(t), 'b.md');
  writeFileSync(real, 'Good text.\n');
  const h = homeWith(t, edit1);
  try {
    symlinkSync(real, join(h, 'pact', 'blocks', 'b.md'), 'file');
  } catch {
    t.skip('cannot create a file link here (not run)');
    return;
  }
  refusedWith(render(t, h), 'block-file', /the block file is a link/);
});

test('bad case: a blocks folder that is a link to a folder of good blocks refuses', t => {
  const elsewhere = tempDir(t);
  writeFileSync(join(elsewhere, 'b.md'), 'Good text.\n');
  const h = tempDir(t);
  mkdirSync(join(h, 'pact'));
  writeFileSync(join(h, 'pact', 'config.json'), JSON.stringify(edit1));
  symlinkSync(elsewhere, join(h, 'pact', 'blocks'), 'junction');
  refusedWith(render(t, h), 'block-file', /the blocks folder is a link/);
});

test('bad case: a block reached through a linked parent folder refuses', t => {
  const elsewhere = tempDir(t);
  writeFileSync(join(elsewhere, 'b.md'), 'Good text.\n');
  const h = homeWith(t, cfg([{ mark: 'move-4-extra', op: 'add-after', file: 'team/b.md' }]));
  symlinkSync(elsewhere, join(h, 'pact', 'blocks', 'team'), 'junction');
  refusedWith(render(t, h), 'block-file', /a folder on the block path is a link/);
});

test('bad case: a block file with a second hard link refuses', t => {
  const h = homeWith(t, edit1, { 'b.md': 'Good text.\n' });
  try {
    linkSync(join(h, 'pact', 'blocks', 'b.md'), join(tempDir(t), 'second.md'));
  } catch {
    t.skip('cannot create a hard link here (not run)');
    return;
  }
  refusedWith(render(t, h), 'block-file', /the block file has more than one link/);
});

test('bad case: a block file swapped for another between its lstat and its open refuses', t => {
  refusedWith(render(t, homeWith(t, edit1, { 'b.md': 'Good text.\n' }), SOURCE, { fault: 'swap-before-open' }), 'block-file', /the block file changed while it was opened/);
});

test('bad case: a block file given a second name between its lstat and its open refuses, by the link count', t => {
  refusedWith(render(t, homeWith(t, edit1, { 'b.md': 'Good text.\n' }), SOURCE, { fault: 'hardlink-before-open' }), 'block-file', /the block file changed while it was opened/);
});

test('bad case: a block file whose real path is elsewhere refuses', t => {
  refusedWith(render(t, homeWith(t, edit1, { 'b.md': 'Good text.\n' }), SOURCE, { fault: 'realpath-elsewhere' }), 'block-file', /the block file resolves somewhere else/);
});

test('bad case: a block file swapped for a link between its lstat and its open refuses, by O_NOFOLLOW', { skip: WIN && 'Windows defines no O_NOFOLLOW (not run)' }, t => {
  refusedWith(render(t, homeWith(t, edit1, { 'b.md': 'Good text.\n' }), SOURCE, { fault: 'link-before-open' }), 'block-file', /the block file could not be opened/);
});

test('bad case: a read error on the blocks folder other than "does not exist" refuses', t => {
  refusedWith(render(t, homeWith(t, edit1, { 'b.md': 'Good text.\n' }), SOURCE, { fault: 'lstat-blocks-eacces' }), 'block-file', /the blocks folder could not be read/);
});

test('each block file is opened once and read once, and a large one is read no further than the cap', t => {
  const small = render(t, homeWith(t, edit1, { 'b.md': 'Good text.\n' }), SOURCE, { fault: 'count' });
  assert.equal(small.code, 0, small.out);
  assert.equal(small.seen.filter(l => l.startsWith('open ')).length, 1, small.seen.join('\n'));
  assert.ok(!small.seen.includes('readFileSync'), small.seen.join('\n'));
  const big = render(t, homeWith(t, edit1, { 'b.md': `${'a'.repeat(1024 * 1024)}\n` }), SOURCE, { fault: 'count' });
  refusedWith(big, 'block-size', /larger than 16 KiB/);
  assert.equal(big.seen.filter(l => l.startsWith('open ')).length, 1, big.seen.join('\n'));
  const got = big.seen.filter(l => l.startsWith('read ')).reduce((n, l) => n + Number(l.split(' ')[2]), 0);
  assert.ok(got <= 16 * 1024 + 1, `read ${got} bytes of a 1 MiB file`);
});

// ------------------------------------------------------------ placement: an open mark sharing a line with a gated mark

const SHARE = [
  ['an open end and a gated begin on one line', s => s.replace('<!-- pact:end config-notice -->\n', '').replace('<!-- pact:begin stop-and-escalate -->\n', '<!-- pact:end config-notice --> <!-- pact:begin stop-and-escalate -->\n')],
  ['a gated end and an open begin on one line', s => s.replace('<!-- pact:end stop-and-escalate -->\n<!-- pact:begin usage-pause -->\n', '<!-- pact:end stop-and-escalate --><!-- pact:begin usage-pause -->\n')],
];

// placement
for (const [label, change] of SHARE) {
  for (const [withConfig, home] of [
    ['with a configuration', t => homeWith(t, cfg([{ mark: 'move-1', op: 'remove' }]))],
    ['with no configuration', t => tempDir(t)],
  ]) {
    test(`bad case: ${label} refuses, ${withConfig}`, t => {
      const before = read(SOURCE);
      const src = change(before);
      assert.notEqual(src, before, 'the planted change did not apply');
      refusedWith(render(t, home(t), sourceFile(t, src)), 'placement', /an open mark that is not alone on its line/);
    });
  }
}

// ------------------------------------------------------------ no echo

test('refusals name only the renderer\'s own names and positions: no mark, op, path or block text from a file is echoed', t => {
  const C = 'CANARYedit';
  const cases = [
    [cfg([{ mark: C, op: 'remove' }]), {}],
    [cfg([{ mark: 'move-2', op: C, file: 'ok.md' }]), { 'ok.md': 'Text.\n' }],
    [cfg([{ mark: 'move-2', op: 'replace', file: `${C}/../x.md` }]), {}],
    [cfg([{ mark: 'move-2', op: 'replace', file: `${C} x.md` }]), {}],
    [cfg([{ mark: 'move-2', op: 'replace', file: `/${C}.md` }]), {}],
    [cfg([{ mark: 'move-2', op: 'replace', [C]: 1 }]), {}],
    [cfg([{ mark: 'move-4-extra', op: 'add-after', file: 'b.md' }]), { 'b.md': `# ${C}\n@${C}\n<!-- ${C} -->\n` }],
    [cfg([{ mark: 'move-4-extra', op: 'add-after', file: 'b.md' }]), { 'b.md': `${C}\r\n` }],
  ];
  for (const [config, blocks] of cases) {
    const r = render(t, homeWith(t, config, blocks));
    assert.equal(r.code, 1, r.out);
    assert.ok(!r.out.includes(C), r.out);
  }
});

// #261 C14
test('a block\'s text never reaches the renderer\'s output lines on a pass', t => {
  const C = 'CANARYpass';
  const r = render(t, homeWith(t, edit1, { 'b.md': `${C} text.\n` }));
  assert.equal(r.code, 0, r.out);
  assert.ok(!r.stdout.includes(C), r.stdout);
  assert.ok(r.bytes.toString('utf8').includes(`  ${C} text.`));
});
