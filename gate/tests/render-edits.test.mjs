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
import { GATE, REPO, RENDER, failRules, lastLine, plainAgent, read, renderStage, runSeamA, stage, tempDir, withoutOpenMarks } from './helpers.mjs';

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

/** `src` with the lines between `mark`'s two mark lines replaced by fn(lines, indent). */
function editPart(src, mark, fn) {
  const re = new RegExp(`^( *)<!-- pact:begin ${mark} -->\\n((?:.*\\n)*?)\\1<!-- pact:end ${mark} -->\\n`, 'm');
  const m = re.exec(src);
  assert.ok(m, `no ${mark} part in the source`);
  const [, indent, body] = m;
  const now = body === '' ? [] : body.slice(0, -1).split('\n');
  const next = fn(now, indent);
  const part = `${indent}<!-- pact:begin ${mark} -->\n${next.map(l => `${l}\n`).join('')}${indent}<!-- pact:end ${mark} -->\n`;
  return src.slice(0, m.index) + part + src.slice(m.index + m[0].length);
}

const blockLines = buf => buf.toString('utf8').slice(0, -1).split('\n');

/** The configured render: each edit applied with its block re-indented, the usage value, the notice, open marks gone. */
function expected(src, { digest, value, edits }) {
  let s = src;
  if (value !== undefined) s = s.replace('the weekly limit is above 75%,', `the weekly limit is above ${value}%,`);
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

/** Apply a unified diff to `text`, checking each hunk's counts and context. Throws on any mismatch. */
function applyDiff(text, diff) {
  const src = text.split('\n');
  const lines = diff.split('\n');
  assert.equal(lines[0], '--- default/CLAUDE.md');
  assert.equal(lines[1], '+++ configured/CLAUDE.md');
  assert.equal(lines[lines.length - 1], '', 'the diff ends with a line feed');
  const out = [];
  let at = 0;
  let i = 2;
  while (i < lines.length - 1) {
    const h = /^@@ -(\d+),(\d+) \+(\d+),(\d+) @@$/.exec(lines[i]);
    assert.ok(h, `not a hunk header: ${lines[i]}`);
    const [oldStart, oldLen, , newLen] = h.slice(1).map(Number);
    const from = oldLen ? oldStart - 1 : oldStart;
    assert.ok(from >= at, 'hunks out of order');
    out.push(...src.slice(at, from));
    at = from;
    let o = 0;
    let n = 0;
    for (i += 1; i < lines.length - 1 && !lines[i].startsWith('@@'); i += 1) {
      const [sign, rest] = [lines[i][0], lines[i].slice(1)];
      if (sign === ' ' || sign === '-') {
        assert.equal(src[at], rest, `context or removed line ${at + 1} does not match`);
        at += 1;
        o += 1;
      }
      if (sign === ' ' || sign === '+') {
        out.push(rest);
        n += 1;
      }
      assert.ok(' -+'.includes(sign), `a diff line with no sign: ${lines[i]}`);
    }
    assert.deepEqual([o, n], [oldLen, newLen], 'a hunk count does not match its lines');
  }
  out.push(...src.slice(at));
  return out.join('\n');
}

// ------------------------------------------------------------ a configuration with edits

test('the shipped example edits install-ready: each block re-indented into its part, the notice names every edited part, the digest covers the blocks', t => {
  const config = readFileSync(EXAMPLE_EDITS);
  const blocks = exampleBlocks();
  const doc = JSON.parse(config);
  const edits = doc.edits.map(e => ({ ...e, path: e.file, bytes: e.file ? blocks[e.file] : null }));
  assert.ok(edits.length >= 3 && edits.every(e => e.bytes), 'every example edit names a shipped block');
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

test('a remove takes out the part\'s text and keeps the move\'s lead-in line', t => {
  const config = JSON.stringify(cfg([{ mark: 'move-1', op: 'remove' }]));
  const r = render(t, homeWith(t, config));
  assert.equal(r.code, 0, r.out);
  const edits = [{ mark: 'move-1', op: 'remove' }];
  assert.equal(r.bytes.toString('utf8'), expected(read(SOURCE), { digest: digestOf(Buffer.from(config), edits), edits }));
  assert.match(r.stdout, /^EDIT move-1 remove$/m);
  assert.match(r.bytes.toString('utf8'), /^1\. \*\*I sense the work before I process it\.\*\*\n2\. /m);
});

test('a replace keeps the move\'s number and lead-in, and the digest changes when only a block changes', t => {
  const config = JSON.stringify(cfg([{ mark: 'move-3', op: 'replace', file: 'm3.md' }]));
  const a = render(t, homeWith(t, config, { 'm3.md': 'First text.\n' }));
  const b = render(t, homeWith(t, config, { 'm3.md': 'Second text.\n' }));
  assert.equal(a.code, 0, a.out);
  assert.equal(b.code, 0, b.out);
  assert.match(a.bytes.toString('utf8'), /^3\. \*\*I checkpoint the seams\.\*\*\n {3}First text\.\n {3}<!-- pact:begin security-route -->$/m);
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
      '-the weekly limit is above 75%, wait for my go-ahead. Never cut or stop work',
      '+the weekly limit is above 90%, wait for my go-ahead. Never cut or stop work',
    ],
  );
  assert.equal(applyDiff(withoutOpenMarks(read(SOURCE)), d), r.bytes.toString('utf8'));
});

// ------------------------------------------------------------ re-indenting is load-bearing (seam 2)

test('re-indented block text stays inside its move: an agent named only in a move-4-extra block is routed', t => {
  const root = stage(t, { 'claude/agents/extra-agent.md': plainAgent('extra-agent') }, { route: false });
  const block = 'Then run `extra-agent` on the diff.\n';
  renderStage(root, homeWith(t, cfg([{ mark: 'move-4-extra', op: 'add-after', file: 'x.md' }]), { 'x.md': block }));
  assert.match(read(join(root, 'claude', 'CLAUDE.md')), /^ {3}Then run `extra-agent` on the diff\.$/m);
  const r = runSeamA(root);
  assert.equal(r.code, 0, r.out);
});

test('control: the same text at column 0, as an un-indented block would land, leaves move 4, and seam A fails routing', t => {
  const root = stage(t, { 'claude/agents/extra-agent.md': plainAgent('extra-agent') }, { route: false });
  const md = join(root, 'claude', 'CLAUDE.md');
  writeFileSync(md, editPart(read(md), 'move-4-extra', () => ['Then run `extra-agent` on the diff.']));
  const r = runSeamA(root);
  assert.notEqual(r.code, 0, r.out);
  assert.ok(failRules(r.stdout).includes('routing'), r.out);
});

// ------------------------------------------------------------ seam A on a rendered stage (seam 2)

/**
 * The installed agents named in move 2's part and nowhere else seam A's
 * routing reads: the other moves of "Implementing a change" and its
 * "Lookups and searches." line. Derived from the source, so a later change to
 * move 2's reviewers keeps this case true.
 */
function routedOnlyInMove2() {
  const src = read(SOURCE);
  const agents = readdirSync(join(REPO, 'claude', 'agents')).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3));
  const m2 = /<!-- pact:begin move-2 -->\n((?:.*\n)*?) *<!-- pact:end move-2 -->/.exec(src)[1];
  const section = /^## Implementing a change\n((?:.*\n)*?)(?=^## )/m.exec(src)[1];
  const moves = [...section.matchAll(/^([0-9]+)\. .*\n(?: .*\n)*/gm)].filter(m => m[1] !== '2').map(m => m[0]);
  const roles = section.split('\n').filter(l => l.startsWith('**Lookups and searches.**'));
  const spans = text => new Set([...text.matchAll(/`([^`]+)`/g)].map(x => x[1]));
  const elsewhere = spans([...moves, ...roles].join('\n'));
  return agents.filter(a => spans(m2).has(a) && !elsewhere.has(a));
}

test('seam A: a move-2 replace that keeps move 2\'s routed agents passes', t => {
  const keep = routedOnlyInMove2();
  const root = stage(t, {});
  const block = `I grill the idea, then write the spec. Route it: ${keep.map(a => `\`${a}\``).join(', ') || 'none'}.\n`;
  renderStage(root, homeWith(t, cfg([{ mark: 'move-2', op: 'replace', file: 'm2.md' }]), { 'm2.md': block }));
  const r = runSeamA(root);
  assert.equal(r.code, 0, r.out);
});

test('seam A: a move-2 replace that drops move 2\'s routed agents renders, then fails routing', t => {
  const dropped = routedOnlyInMove2();
  assert.ok(dropped.length > 0, 'the source routes no agent in move 2 alone, so this case cannot be planted');
  const root = stage(t, {});
  renderStage(root, homeWith(t, cfg([{ mark: 'move-2', op: 'replace', file: 'm2.md' }]), { 'm2.md': 'I grill the idea, then write the spec.\n' }));
  const r = runSeamA(root);
  assert.notEqual(r.code, 0, r.out);
  assert.ok(failRules(r.stdout).includes('routing'), r.out);
});

test('seam A: a block naming an uninstalled reviewer renders, then fails the roster', t => {
  const root = stage(t, {});
  assert.ok(!readdirSync(join(root, 'claude', 'agents')).includes('test-reviewer.md'));
  renderStage(root, homeWith(t, cfg([{ mark: 'move-4-extra', op: 'add-after', file: 'r.md' }]), { 'r.md': 'Then run `test-reviewer` on the tests.\n' }));
  const r = runSeamA(root);
  assert.notEqual(r.code, 0, r.out);
  assert.ok(failRules(r.stdout).includes('roster'), r.out);
});

test('seam A, the second layer: a configured block holding a setext heading fails structure (hand-built render: the renderer refuses it first)', t => {
  const root = stage(t, {});
  const md = join(root, 'claude', 'CLAUDE.md');
  writeFileSync(md, editPart(read(md), 'move-4-extra', (now, indent) => [`${indent}Title`, `${indent}===`]));
  const r = runSeamA(root);
  assert.notEqual(r.code, 0, r.out);
  assert.ok(failRules(r.stdout).includes('structure'), r.out);
  // And the renderer refuses the same text as a block, before seam A runs.
  refusedWith(render(t, homeWith(t, cfg([{ mark: 'move-4-extra', op: 'add-after', file: 'b.md' }]), { 'b.md': 'Title\n===\n' })), 'block-text', /a setext heading underline/);
});

// ------------------------------------------------------------ planted controls: the renderer's text checks are load-bearing

test('control: an @ import in open text passes today\'s seam A without the renderer, and the renderer refuses it as a block', t => {
  const root = stage(t, {});
  const md = join(root, 'claude', 'CLAUDE.md');
  writeFileSync(md, editPart(read(md), 'move-4-extra', (now, indent) => [`${indent}See @notes.md for more.`]));
  const r = runSeamA(root);
  assert.equal(r.code, 0, `seam A was expected to miss the import:\n${r.out}`);
  refusedWith(render(t, homeWith(t, cfg([{ mark: 'move-4-extra', op: 'add-after', file: 'b.md' }]), { 'b.md': 'See @notes.md for more.\n' })), 'block-text', /an @ followed by text/);
});

test('control: a heading and a numbered line outside the moves pass today\'s seam A without the renderer, and the renderer refuses them as a block', t => {
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

for (const clause of GATED) {
  for (const op of OPS) {
    test(`bad case: an edit to the gated clause ${clause} with ${op} refuses, naming the clause`, t => {
      const edit = op === 'remove' ? { mark: clause, op } : { mark: clause, op, file: 'ok.md' };
      refusedWith(render(t, homeWith(t, cfg([edit]), { 'ok.md': 'Text.\n' })), 'edit-gated', new RegExp(`edit 1: ${clause} is a gated clause; no edit may target it`));
    });
  }
}

test('the gated clauses refused are exactly gate/clauses/, install-go-ahead included', () => {
  assert.equal(GATED.length, 7, GATED.join(', '));
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

// ------------------------------------------------------------ the must-refuse table: the edit list

const EDIT_BAD = [
  // [label, edits, rule, reason]
  ['an unknown mark', [{ mark: 'move-9', op: 'remove' }], 'edit-mark', /edit 1: an unknown mark/],
  ['a mark in another case', [{ mark: 'Move-2', op: 'remove' }], 'edit-mark', /edit 1: an unknown mark/],
  ['a gated mark in another case', [{ mark: 'Risk-Floor', op: 'remove' }], 'edit-mark', /edit 1: an unknown mark/],
  ['a mark that is not text', [{ mark: 2, op: 'remove' }], 'edit-shape', /edit 1: mark must be text/],
  ['no mark', [{ op: 'remove' }], 'edit-shape', /edit 1: mark must be text/],
  ['an unknown operation', [{ mark: 'move-2', op: 'append', file: 'ok.md' }], 'edit-op', /edit 1: an unknown operation/],
  ['an operation in another case', [{ mark: 'move-2', op: 'Replace', file: 'ok.md' }], 'edit-op', /edit 1: an unknown operation/],
  ['no operation', [{ mark: 'move-2', file: 'ok.md' }], 'edit-op', /edit 1: an unknown operation/],
  ['an operation that is not text', [{ mark: 'move-2', op: ['replace'], file: 'ok.md' }], 'edit-op', /edit 1: an unknown operation/],
  ['the same mark twice', [{ mark: 'move-2', op: 'remove' }, { mark: 'move-2', op: 'replace', file: 'ok.md' }], 'edit-twice', /edit 2: move-2 is edited twice/],
  ['an edit that is not an object', ['move-2'], 'edit-shape', /edit 1: not an object/],
  ['an edit that is null', [null], 'edit-shape', /edit 1: not an object/],
  ['an unknown key in an edit', [{ mark: 'move-2', op: 'remove', when: 'always' }], 'edit-shape', /edit 1: a key that is not mark, op or file/],
  ['a __proto__ key in an edit', JSON.parse('[{"mark": "move-2", "op": "remove", "__proto__": {"file": "x"}}]'), 'edit-shape', /edit 1: a key that is not mark, op or file/],
  ['remove with a file', [{ mark: 'move-2', op: 'remove', file: 'ok.md' }], 'edit-shape', /edit 1: remove takes no file/],
  ['replace with no file', [{ mark: 'move-2', op: 'replace' }], 'edit-shape', /edit 1: replace needs a file/],
  ['add-after with no file', [{ mark: 'move-2', op: 'add-after' }], 'edit-shape', /edit 1: add-after needs a file/],
  ['over 16 edits', Array.from({ length: 17 }, () => ({ mark: 'move-1', op: 'remove' })), 'edit-count', /more than 16 edits/],
  ['edits as an object', {}, 'config-edits', /edits must be a list/],
  ['edits as a string', 'move-2', 'config-edits', /edits must be a list/],
];

for (const [label, edits, rule, reason] of EDIT_BAD) {
  test(`bad case: ${label} refuses`, t => {
    refusedWith(render(t, homeWith(t, cfg(edits), { 'ok.md': 'Text.\n' })), rule, reason);
  });
}

test('16 edits are not refused by the count: the same list refuses only for a mark edited twice', t => {
  const r = render(t, homeWith(t, cfg(Array.from({ length: 16 }, () => ({ mark: 'move-1', op: 'remove' })))));
  assert.doesNotMatch(r.stdout, /^FAIL edit-count/m, r.out);
  refusedWith(r, 'edit-twice', /edit 2: move-1 is edited twice/);
});

test('a refusal reports every bad edit, each by its position', t => {
  const r = render(t, homeWith(t, cfg([{ mark: 'risk-floor', op: 'remove' }, { mark: 'move-1', op: 'remove' }, { mark: 'nope', op: 'remove' }])));
  refusedWith(r, 'edit-gated', /edit 1: risk-floor/);
  assert.match(r.stdout, /^FAIL edit-mark: pact\/config\.json: edit 3: an unknown mark$/m, r.out);
});

// ------------------------------------------------------------ the must-refuse table: block paths, on their text

const PATH_BAD = [
  // [label, path, reason]
  ['an empty path', '', /the block path is empty or not text/],
  ['a path that is not text', 5, /the block path is empty or not text/],
  ['an absolute path', '/etc/passwd', /an absolute path, a network share or a device path/],
  ['a network share', '\\\\server\\share\\a.md', /an absolute path, a network share or a device path/],
  ['a network share with forward slashes', '//server/share/a.md', /an absolute path, a network share or a device path/],
  ['a device path', '\\\\?\\C:\\a.md', /an absolute path, a network share or a device path/],
  ['a device namespace path', '\\\\.\\pipe\\x', /an absolute path, a network share or a device path/],
  ['a drive path', 'C:/Users/a.md', /a drive or drive-relative path/],
  ['a drive-relative path', 'C:a.md', /a drive or drive-relative path/],
  ['a backslash separator', 'team\\a.md', /a backslash separator/],
  ['stream syntax', 'a.md:secret', /stream syntax/],
  ['a stream type', 'a.md::$DATA', /stream syntax/],
  ['a .. segment', '../config.json', /a \. or \.\. segment/],
  ['a .. segment inside', 'team/../a.md', /a \. or \.\. segment/],
  ['a . segment', './a.md', /a \. or \.\. segment/],
  ['an empty segment', 'team//a.md', /an empty path segment/],
  ['a trailing slash', 'team/', /an empty path segment/],
  ['a segment ending in a dot', 'a.md.', /a segment ending in a dot or a space/],
  ['a folder ending in a dot', 'team./a.md', /a segment ending in a dot or a space/],
  ['a segment ending in a space', 'a.md ', /a segment ending in a dot or a space/],
  ['a reserved device name', 'con', /a reserved device name/],
  ['a reserved device name with an extension', 'CON.md', /a reserved device name/],
  ['a reserved COM name', 'com1.txt', /a reserved device name/],
  ['a reserved LPT name in a folder', 'team/lpt9.md', /a reserved device name/],
  ['a reserved NUL name', 'Nul.md', /a reserved device name/],
  ['a space inside a name', 'my block.md', /a character outside letters, digits/],
  ['a non-ASCII letter', 'blöck.md', /a character outside letters, digits/],
  ['a tilde', '~/a.md', /a character outside letters, digits/],
  ['an environment reference', '%USERPROFILE%/a.md', /a character outside letters, digits/],
  ['a path over 200 characters', `${'a'.repeat(198)}.md`, /longer than 200 characters/],
  ['more than 8 segments', 'a/b/c/d/e/f/g/h/i.md', /more than 8 path segments/],
];

for (const [label, path, reason] of PATH_BAD) {
  test(`bad case: a block path with ${label} refuses on its text`, t => {
    refusedWith(render(t, homeWith(t, cfg([{ mark: 'move-4-extra', op: 'add-after', file: path }]))), 'block-path', reason);
  });
}

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
  ['an open end and a gated begin on one line', s => s.replace('   <!-- pact:end move-3 -->\n   <!-- pact:begin security-route -->\n', '   <!-- pact:end move-3 --> <!-- pact:begin security-route -->\n')],
  ['a gated end and an open begin on one line', s => s.replace('   <!-- pact:end move-4 -->\n   <!-- pact:begin move-4-extra -->\n', '   <!-- pact:end move-4 --><!-- pact:begin move-4-extra -->\n')],
];

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

test('a block\'s text never reaches the renderer\'s output lines on a pass', t => {
  const C = 'CANARYpass';
  const r = render(t, homeWith(t, edit1, { 'b.md': `${C} text.\n` }));
  assert.equal(r.code, 0, r.out);
  assert.ok(!r.stdout.includes(C), r.stdout);
  assert.ok(r.bytes.toString('utf8').includes(`   ${C} text.`));
});
