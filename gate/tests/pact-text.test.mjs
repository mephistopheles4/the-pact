// Seam A's pact-text checks, thinned by #261: the pinned blocks word for word,
// the marker grammar, no file import in the rules file, and no pact marker in
// an agent but executability-lens's named exemption. Each planted bad case
// asserts the rule it must fail on, on a fixture copy of the pact.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { PINNED } from '../shared.mjs';
import { copyGate } from './gate-files.mjs';
import { runSeamA } from './gate-run.mjs';
import { moduleResult, table } from './tables.mjs';
import { realPayload, stage } from './payload.mjs';
import { GATE, READ_ONLY, REPO, failRules, lastLine, plainAgent } from './text.mjs';
import { read, tempDir } from './tree.mjs';

const MD = 'claude/CLAUDE.md';
const AG = 'AGENTS.md';
const EX = 'claude/agents/executability-lens.md';
const PROBE = 'claude/agents/probe.md';

const BLOCKS = {
  'stop-and-escalate': MD,
  'install-go-ahead': AG,
};

// One weakening per block: text inside it, and what it becomes.
const WEAKEN = {
  'stop-and-escalate': ['with\n  your pick, and wait.', 'with\n  your pick.'],
  'install-go-ahead': ['only after they say so in chat', 'when ready'],
};
// One byte changed per block.
const ONE_BYTE = {
  'stop-and-escalate': ['and wait.', 'and wait!'],
  'install-go-ahead': ['in chat.', 'in chat,'],
};

function file(root, rel) {
  return join(root, ...rel.split('/'));
}

function edit(root, rel, fn) {
  const p = file(root, rel);
  writeFileSync(p, fn(readFileSync(p, 'utf8')));
}

/** The [begin, end] line indices of a block's marker lines in text. */
function blockLines(text, name) {
  const lines = text.split('\n');
  const b = lines.findIndex(l => l.trim() === `<!-- pact:begin ${name} -->`);
  const e = lines.findIndex(l => l.trim() === `<!-- pact:end ${name} -->`);
  assert.ok(b >= 0 && e > b, `fixture has no ${name} block`);
  return [b, e];
}

/** Replace `from` with `to` inside a block only. */
function inBlock(text, name, from, to) {
  const lines = text.split('\n');
  const [b, e] = blockLines(text, name);
  const inner = lines.slice(b + 1, e).join('\n');
  assert.ok(inner.includes(from), `${name} block lacks ${JSON.stringify(from)}`);
  return [...lines.slice(0, b + 1), ...inner.replace(from, to).split('\n'), ...lines.slice(e)].join('\n');
}

/** Remove a block, its markers included; returns { text, block } with the removed lines. */
function cutBlock(text, name) {
  const lines = text.split('\n');
  const [b, e] = blockLines(text, name);
  return { text: [...lines.slice(0, b), ...lines.slice(e + 1)].join('\n'), block: lines.slice(b, e + 1) };
}

function run(t, { files = {}, prep } = {}) {
  const root = stage(t, files);
  if (prep) prep(root);
  return { root, r: runSeamA(root) };
}

function expectFail(t, rule, opts) {
  const { r } = run(t, opts);
  assert.equal(lastLine(r.stdout), 'RESULT: fail', r.out);
  assert.notEqual(r.code, 0, r.out);
  assert.ok(failRules(r.stdout).includes(rule), `expected rule "${rule}" in:\n${r.out}`);
  return r;
}

function expectPass(t, opts) {
  const { r } = run(t, opts);
  assert.equal(r.code, 0, r.out);
  assert.equal(lastLine(r.stdout), 'RESULT: pass', r.out);
  return r;
}

// A line the rules file's Guards section holds, to plant text after.
const GUARDS = '## Guards\n';

// ------------------------------------------------------------ the real pact

// #261 C4
test('the real tree passes, with AGENTS.md staged', t => {
  const root = tempDir(t);
  realPayload(root);
  const r = runSeamA(root);
  assert.equal(r.code, 0, r.out);
  assert.equal(lastLine(r.stdout), 'RESULT: pass', r.out);
});

// Every block on PINNED has a home here, and each canonical text equals its block.
// #261 C4
test('every pinned block is in its file, and equals its canonical text', () => {
  assert.deepEqual(Object.keys(BLOCKS).sort(), [...PINNED].sort());
  for (const [name, rel] of Object.entries(BLOCKS)) {
    const text = read(join(REPO, ...rel.split('/')));
    const lines = text.split('\n');
    const [b, e] = blockLines(text, name);
    assert.equal(`${lines.slice(b + 1, e).join('\n')}\n`, read(join(GATE, 'clauses', `${name}.md`)), name);
  }
});

// ------------------------------------------------------------ pinned blocks

// The must-refuse table (#170): the base is the real pact text, and a row
// plants one change to a pinned block.
const pactText = () => ({ [MD]: read(join(REPO, ...MD.split('/'))), [AG]: read(join(REPO, ...AG.split('/'))) });
const swap = (name, [from, to]) => tree => ({ ...tree, [BLOCKS[name]]: inBlock(tree[BLOCKS[name]], name, from, to) });
const remove = name => tree => ({ ...tree, [BLOCKS[name]]: cutBlock(tree[BLOCKS[name]], name).text });

/** Seam A on the real payload with `tree`'s pact files, in-process through its core. */
function seamATree(tree, t) {
  const r = runSeamA(stage(t, tree));
  return { ...moduleResult(r.code, r.stdout), stdout: r.stdout };
}

// #261 C4
for (const c of table('pact text required clause', {
  module: 'gate/seam-a.mjs',
  base: pactText,
  run: seamATree,
  rows: [
    { id: 'weakened-stop-and-escalate', plant: swap('stop-and-escalate', WEAKEN['stop-and-escalate']), fails: ['required-clause'], says: /^FAIL required-clause: claude\/CLAUDE\.md: stop-and-escalate differs from its canonical text$/m, why: 'a weakened stop-and-ask' },
    { id: 'one-byte-stop-and-escalate', plant: swap('stop-and-escalate', ONE_BYTE['stop-and-escalate']), fails: ['required-clause'], says: /^FAIL required-clause: claude\/CLAUDE\.md: stop-and-escalate differs from its canonical text$/m, why: 'stop-and-ask changed by one byte' },
    { id: 'removed-stop-and-escalate', plant: remove('stop-and-escalate'), fails: ['required-clause'], says: /^FAIL required-clause: claude\/CLAUDE\.md: stop-and-escalate is missing$/m, why: 'a removed stop-and-ask' },
    { id: 'weakened-install-go-ahead', plant: swap('install-go-ahead', WEAKEN['install-go-ahead']), fails: ['required-clause'], says: /^FAIL required-clause: AGENTS\.md: install-go-ahead differs from its canonical text$/m, why: 'a weakened install go-ahead' },
    { id: 'one-byte-install-go-ahead', plant: swap('install-go-ahead', ONE_BYTE['install-go-ahead']), fails: ['required-clause'], says: /^FAIL required-clause: AGENTS\.md: install-go-ahead differs from its canonical text$/m, why: 'the install go-ahead changed by one byte' },
    { id: 'removed-install-go-ahead', plant: remove('install-go-ahead'), fails: ['required-clause'], says: /^FAIL required-clause: AGENTS\.md: install-go-ahead is missing$/m, why: 'a removed install go-ahead' },
    { id: 'old-spelling-install-go-ahead', plant: tree => ({ ...tree, [AG]: inBlock(inBlock(tree[AG], 'install-go-ahead', 'pass `--apply`', 'pass `-Apply`'), 'install-go-ahead', '`--apply` refuses', '`-Apply` refuses') }), fails: ['required-clause'], says: /^FAIL required-clause: AGENTS\.md: install-go-ahead differs from its canonical text$/m, why: 'the clause with the flag spelled as before the Node install, -Apply (#153, D1)' },
    { id: 'unknown-block-name', plant: tree => ({ ...tree, [MD]: tree[MD].replace(GUARDS, `${GUARDS}\n<!-- pact:begin risk-floor -->\nx\n<!-- pact:end risk-floor -->\n`) }), fails: ['marker'], says: /^FAIL marker: claude\/CLAUDE\.md line \d+: an unknown block name$/m, why: 'a marker naming a block that is not pinned, here a retired one' },
    // The marker grammar's fence rule, kept by the thin gate (#261 C5): a pinned block inside a fence reads as a code sample, so its markers fail and the block counts as missing.
    { id: 'pinned-block-in-fence', plant: tree => ({ ...tree, [MD]: tree[MD].replace('<!-- pact:begin stop-and-escalate -->\n', '```\n<!-- pact:begin stop-and-escalate -->\n').replace('<!-- pact:end stop-and-escalate -->\n', '<!-- pact:end stop-and-escalate -->\n```\n') }), fails: ['marker', 'required-clause'], says: /^FAIL marker: claude\/CLAUDE\.md line \d+: a comment inside a fenced code block$/m, why: 'the pinned block wrapped in a code fence' },
    { id: 'marker-no-space-after-opener', plant: tree => ({ ...tree, [MD]: tree[MD].replace(GUARDS, `${GUARDS}\n<!--pact:begin stop-and-escalate -->\n`) }), fails: ['marker'], why: 'a comment that is not an exact marker: no space after the opener' },
    { id: 'marker-in-capitals', plant: tree => ({ ...tree, [MD]: tree[MD].replace(GUARDS, `${GUARDS}\n<!-- PACT:begin stop-and-escalate -->\n`) }), fails: ['marker'], why: 'a comment that is not an exact marker: the prefix in capitals' },
    { id: 'marker-no-space-before-closer', plant: tree => ({ ...tree, [MD]: tree[MD].replace(GUARDS, `${GUARDS}\n<!-- pact:begin stop-and-escalate-->\n`) }), fails: ['marker'], why: 'a comment that is not an exact marker: no space before the closer' },
    { id: 'plain-comment', plant: tree => ({ ...tree, [MD]: tree[MD].replace(GUARDS, `${GUARDS}\n<!-- note -->\n`) }), fails: ['marker'], why: 'a comment that is no marker at all' },
  ],
})) test(c.name, c.fn);

// #261 C4
test('the required-clause table has a weakened, a one-byte and a removed row for every pinned block', () => {
  const src = read(join(GATE, 'tests', 'pact-text.test.mjs'));
  for (const name of PINNED) {
    for (const kind of ['weakened', 'one-byte', 'removed']) assert.ok(src.includes(`id: '${kind}-${name}'`), `no ${kind} row for ${name}`);
  }
});

// pact-file
test('bad case: a missing AGENTS.md', t => {
  expectFail(t, 'pact-file', { prep: root => rmSync(file(root, AG)) });
});

// pact-file
test('bad case: an AGENTS.md that is not a regular file', t => {
  expectFail(t, 'pact-file', {
    prep: root => {
      rmSync(file(root, AG));
      mkdirSync(file(root, AG));
    },
  });
});

// pact-file
test('bad case: a missing CLAUDE.md', t => {
  expectFail(t, 'pact-file', { prep: root => rmSync(file(root, MD)) });
});

// ------------------------------------------------------------ the marker grammar

// marker
test('bad case: a marker sharing its line with text', t => {
  expectFail(t, 'marker', { prep: root => edit(root, MD, s => s.replace('<!-- pact:begin stop-and-escalate -->\n- ', '<!-- pact:begin stop-and-escalate -->- ')) });
});

// marker
test('bad case: a block name used twice in one file', t => {
  expectFail(t, 'marker', {
    prep: root =>
      edit(root, MD, s => {
        const { block } = cutBlock(s, 'stop-and-escalate');
        return s.replace(GUARDS, `${GUARDS}\n${block.join('\n')}\n`);
      }),
  });
});

// marker
test('bad case: an unclosed block', t => {
  // The usage parts' marks go too: the renderer refuses an open mark inside an
  // unclosed pinned block before seam A runs, and this case is about seam A's
  // own marker check.
  expectFail(t, 'marker', {
    prep: root =>
      edit(root, MD, s =>
        ['<!-- pact:end stop-and-escalate -->\n', '<!-- pact:begin usage-pause -->\n', '<!-- pact:end usage-pause -->\n', '<!-- pact:begin usage-pause-session -->\n', '<!-- pact:end usage-pause-session -->\n'].reduce((t, m) => t.replace(m, ''), s),
      ),
  });
});

// marker
test('bad case: an end marker with no begin', t => {
  expectFail(t, 'marker', { prep: root => edit(root, MD, s => s.replace('<!-- pact:begin stop-and-escalate -->\n', '')) });
});

// marker
test('bad case: a pinned block in a file not listed for it', t => {
  expectFail(t, 'marker', {
    prep: root => {
      const block = cutBlock(read(file(root, AG)), 'install-go-ahead').block;
      edit(root, MD, s => s.replace(GUARDS, `${GUARDS}\n${block.join('\n')}\n`));
    },
  });
});

// ------------------------------------------------------------ no file import (#261, S5)

// rules-import
test('bad case: an @ import line in the rendered rules file', t => {
  const r = expectFail(t, 'rules-import', { prep: root => edit(root, MD, s => s.replace(GUARDS, `${GUARDS}\nSee @notes/more-rules.md for the rest.\n`)) });
  assert.match(r.stdout, /^FAIL rules-import: claude\/CLAUDE\.md line \d+: an @ followed by text/m, r.out);
});

// rules-import: the check reads the rules file only; the repo's own rules file is never installed.
test('an @ in AGENTS.md is not an import the rules-file check reads', t => {
  expectPass(t, { prep: root => edit(root, AG, s => `${s}\nWrite to @owner.\n`) });
});

// ------------------------------------------------------------ agents' markers

// marker
test('bad case: a marker in an agent that holds no block', t => {
  expectFail(t, 'marker', {
    files: { [PROBE]: plainAgent('probe', [], READ_ONLY).replace('Body.\n', 'Body.\n<!-- pact:begin risk-floor -->\nx\n<!-- pact:end risk-floor -->\n') },
  });
});

// marker: the exemption is by name; the same pair in another lens still fails (#261, S5).
// #261 C9
test("bad case: executability-lens's risk-floor marker planted in another lens", t => {
  const r = expectFail(t, 'marker', {
    prep: root => edit(root, 'claude/agents/good-enough-lens.md', s => s.replace('## How you work', '<!-- pact:begin risk-floor -->\nx\n<!-- pact:end risk-floor -->\n\n## How you work')),
  });
  assert.match(r.stdout, /^FAIL marker: claude\/agents\/good-enough-lens\.md line \d+: a pact marker in an agent$/m, r.out);
});

// marker: the exemption holds the pair once each, and nothing else.
// #261 C9
test('bad case: another comment in executability-lens', t => {
  expectFail(t, 'marker', { prep: root => edit(root, EX, s => `${s}\n<!-- pact:begin stop-and-escalate -->\n`) });
});

// #261 C9
test('bad case: the risk-floor pair twice in executability-lens', t => {
  expectFail(t, 'marker', { prep: root => edit(root, EX, s => `${s}\n<!-- pact:begin risk-floor -->\nx\n<!-- pact:end risk-floor -->\n`) });
});

// ------------------------------------------------------------ the pact files' characters

// invisible
test('bad case: an invisible character in CLAUDE.md', t => {
  expectFail(t, 'invisible', { prep: root => edit(root, MD, s => s.replace('## Guards', '## Gua​rds')) });
});

// bom
test('bad case: a byte-order mark on AGENTS.md', t => {
  expectFail(t, 'bom', { prep: root => edit(root, AG, s => `﻿${s}`) });
});

// characters
test('bad case: a carriage return in CLAUDE.md', t => {
  expectFail(t, 'characters', { prep: root => edit(root, MD, s => s.replace('\n', '\r\n')) });
});

// ------------------------------------------------------------ the canonical texts

function gateCopy(t, editGate) {
  const g = copyGate(tempDir(t));
  editGate(g);
  return join(g, 'seam-a.mjs');
}

// The canonical texts' own form (clause-text): a row plants one change in a gate copy's canonical text for the pinned stop-and-ask block.
const CANON = 'clauses/stop-and-escalate.md';
/** Seam A, from a gate copy holding `tree`'s canonical texts, on the real payload. */
function seamACanon(tree, t) {
  const script = gateCopy(t, g => {
    for (const [rel, text] of Object.entries(tree)) writeFileSync(join(g, ...rel.split('/')), text);
  });
  const r = runSeamA(stage(t, {}), script);
  return { ...moduleResult(r.code, r.stdout), stdout: r.stdout };
}
for (const c of table('pact text canonical text', {
  module: 'gate/seam-a.mjs',
  base: () => ({ [CANON]: read(join(GATE, ...CANON.split('/'))) }),
  run: seamACanon,
  rows: [
    { id: 'carriage-return', plant: tree => ({ [CANON]: tree[CANON].replace('\n', '\r\n') }), fails: ['clause-text'], why: 'a canonical text with a carriage return' },
    { id: 'no-final-newline', plant: tree => ({ [CANON]: tree[CANON].slice(0, -1) }), fails: ['clause-text'], why: 'a canonical text with no final line feed' },
    { id: 'two-final-newlines', plant: tree => ({ [CANON]: `${tree[CANON]}\n` }), fails: ['clause-text'], why: 'a canonical text with two final line feeds' },
  ],
})) test(c.name, c.fn);

// clause-text
test('bad case: a missing canonical text', t => {
  const script = gateCopy(t, g => rmSync(join(g, 'clauses', 'install-go-ahead.md')));
  const r = runSeamA(stage(t, {}), script);
  assert.equal(lastLine(r.stdout), 'RESULT: fail', r.out);
  assert.ok(failRules(r.stdout).includes('clause-text'), r.out);
});

// clause-text: a name added to PINNED with no file named for it fails closed.
// #261 C4
test('bad case: a pinned name the gate names no file for', t => {
  const script = gateCopy(t, g => {
    edit(g, 'shared.mjs', s => s.replace("const PINNED = Object.freeze(['stop-and-escalate', 'install-go-ahead']);", "const PINNED = Object.freeze(['stop-and-escalate', 'install-go-ahead', 'usage-pause']);"));
    writeFileSync(join(g, 'clauses', 'usage-pause.md'), 'x\n');
  });
  const r = runSeamA(stage(t, {}), script);
  assert.equal(lastLine(r.stdout), 'RESULT: fail', r.out);
  assert.match(r.stdout, /^FAIL clause-text: gate\/clauses\/usage-pause\.md: a pinned block with no file named for it in the gate$/m, r.out);
});

// ------------------------------------------------------------ never echoes content

// #261 C6
test('canary: no drifted text, unknown block name or comment text is echoed', t => {
  const C = 'canaryzq';
  const { r } = run(t, {
    prep: root => {
      edit(root, MD, s => inBlock(s, 'stop-and-escalate', 'and wait.', `and ${C} wait.`));
      edit(root, MD, s => s.replace(GUARDS, `${GUARDS}\n<!-- pact:begin ${C} -->\nx\n<!-- pact:end ${C} -->\n<!-- ${C} -->\n<!-- pact:begin ${C}-${C}-->\nSee @${C}.md.\n`));
    },
  });
  assert.equal(lastLine(r.stdout), 'RESULT: fail', r.out);
  assert.ok(!r.out.toLowerCase().includes(C), r.out);
});
