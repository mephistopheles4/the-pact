// The open marks in the pact source (#53, slice 2), placed as the spec's
// "Marks" section says, and the no-configuration render of the real source.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { runSeamA } from './gate-run.mjs';
import { stage } from './payload.mjs';
import { OPEN_MARKS, RENDER, REPO, SEAM_A, lastLine, withoutOpenMarks } from './text.mjs';
import { read, tempDir } from './tree.mjs';

const SOURCE = join(REPO, 'claude', 'CLAUDE.md');
const LINES = read(SOURCE).split('\n');
const MOVES_AT = LINES.indexOf('## The moves');
// The moves' parts, in move order (#261): each sits under its move's bullet.
const MOVE_PARTS = ['move-1', 'move-2', 'move-3', 'move-4-extra'];

/** Every mark line in the source: { line, kind, name, indent }. */
function marks(lines) {
  const out = [];
  lines.forEach((l, i) => {
    const m = /^( *)<!-- pact:(begin|end) ([a-z][a-z0-9-]*) -->$/.exec(l);
    if (m) out.push({ line: i, indent: m[1], kind: m[2], name: m[3] });
  });
  return out;
}

const at = s => LINES.indexOf(s);

test('with no configuration, the installed pact is its source with the open-mark lines removed', t => {
  const out = tempDir(t, 'pact-render-out-');
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  // An empty Claude home folder: no configuration.
  const r = spawnSync(process.execPath, [RENDER, SOURCE, out, tempDir(t, 'pact-render-home-')], { encoding: 'utf8', env });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const want = withoutOpenMarks(read(SOURCE));
  assert.notEqual(want, read(SOURCE), 'the source carries no open marks, so this test would pass for the wrong reason');
  assert.equal(readFileSync(join(out, 'CLAUDE.md'), 'utf8'), want);
});

// #261 C4
test('seam A refuses the unrendered source: the open marks are not marks it knows, so a skipped render fails closed', t => {
  const root = stage(t);
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  const r = spawnSync(process.execPath, [SEAM_A, root, '--commands', 'none'], { encoding: 'utf8', env });
  assert.notEqual(r.status, 0, r.stdout);
  assert.equal(lastLine(r.stdout), 'RESULT: fail', r.stdout);
  assert.match(r.stdout, /^FAIL marker: claude\/CLAUDE\.md line \d+: an unknown block name$/m, r.stdout);
  // The same stage, rendered first, passes.
  assert.equal(runSeamA(root).code, 0);
});

test('the pact source carries each open mark once, as a begin then an end, each alone on its line', () => {
  const all = marks(LINES);
  for (const n of OPEN_MARKS) {
    const own = all.filter(m => m.name === n);
    assert.deepEqual(own.map(m => m.kind), ['begin', 'end'], n);
    assert.equal(own[0].indent, own[1].indent, n);
  }
  // Every comment in the source is an exact mark line, so none shares a line with text or another mark.
  assert.deepEqual(LINES.filter(l => l.includes('<!--') && !/^ *<!-- pact:(begin|end) [a-z][a-z0-9-]* -->$/.test(l)), []);
});

test('no open mark encloses or overlaps a gated mark', () => {
  const all = marks(LINES);
  for (const n of OPEN_MARKS) {
    const [b, e] = all.filter(m => m.name === n);
    assert.deepEqual(all.filter(m => m.line > b.line && m.line < e.line), [], `${n} encloses another mark`);
  }
});

// #261 C1
// #262: each move's body is its part, so the whole move text is editable and its lead-in is not.
test('each move is a bullet with a bold lead-in alone on its line, and its part holds the move\'s whole body, indented under it', () => {
  const bullets = LINES.map((l, i) => (i > MOVES_AT && /^- \*\*[^*]+\.\*\*$/.test(l) ? i : -1)).filter(i => i >= 0);
  assert.ok(bullets.length >= 4, 'four move bullets');
  MOVE_PARTS.forEach((name, k) => {
    const b = at(`  <!-- pact:begin ${name} -->`);
    const e = at(`  <!-- pact:end ${name} -->`);
    assert.equal(b, bullets[k] + 1, `${name} opens right under move ${k + 1}'s lead-in`);
    assert.ok(e > b + 1 && LINES.slice(b + 1, e).every(l => /^ {2}\S/.test(l)), `${name} holds the body, at the bullet's indent, with no blank line`);
    assert.ok(k === 3 || e + 1 === bullets[k + 1], `${name} ends where the next move starts`);
  });
});

// #261 C1; #262 S8: the line under the title names the parts Scriptorium builds.
test('config-notice is an empty slot right after the lines under the title', () => {
  assert.deepEqual(LINES.slice(0, 7), [
    '# The pact',
    '',
    'To change the pact, edit its repo and install it. Parts marked *Scriptorium',
    'builds this* come from my configuration; the text under them is the default.',
    '<!-- pact:begin config-notice -->',
    '<!-- pact:end config-notice -->',
    '',
  ]);
});

// #262 S8: each part Scriptorium builds wraps its whole default, with the italic mark above it.
test('each part Scriptorium builds sits under its mark, flush against its text, with no blank line inside', () => {
  for (const n of ['tiers', 'sensitive', 'workflow', 'lenses']) {
    const b = at(`<!-- pact:begin ${n} -->`);
    const e = at(`<!-- pact:end ${n} -->`);
    assert.ok(b > 0 && e > b + 1, n);
    assert.deepEqual(LINES.slice(b - 2, b), ['*Scriptorium builds this.*', ''], n);
    assert.ok(LINES.slice(b + 1, e).every(l => l.trim() !== '' && !/^\s/.test(l)), `${n}: a block may hold no blank line and no leading space`);
    assert.equal(LINES[e + 1], '', n);
  }
});

// #261 C1
test('usage-pause wraps the usage bullet in "Guards", right after the pinned stop-and-ask block', () => {
  const h = at('## Guards');
  const b = at('<!-- pact:begin usage-pause -->');
  const e = at('<!-- pact:end usage-pause -->');
  assert.ok(b > h);
  assert.equal(at('<!-- pact:end stop-and-escalate -->') + 1, b);
  assert.ok(LINES.slice(b + 1, e).every(l => l !== ''));
  assert.ok(LINES.slice(b + 1, e).join(' ').includes('When it is above 75%, wait for my'));
  // #142: the session limit's part follows, empty, so an unset session limit renders nothing.
  assert.deepEqual(LINES.slice(e + 1, e + 4), ['<!-- pact:begin usage-pause-session -->', '<!-- pact:end usage-pause-session -->', '']);
});