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

// #262: the moves are one part, every move in it: a bullet with its bold lead-in alone on its line, its body indented under it.
test('the moves part holds every move, each a bold lead-in with its body indented under it', () => {
  const b = at('<!-- pact:begin moves -->');
  const e = at('<!-- pact:end moves -->');
  assert.ok(b > MOVES_AT && e > b, 'the moves part sits in the moves section');
  const body = LINES.slice(b + 1, e);
  assert.ok(body.filter(l => /^- \*\*[^*]+\.\*\*$/.test(l)).length >= 4, 'four move bullets');
  assert.ok(body.every(l => /^- \*\*[^*]+\.\*\*$/.test(l) || /^ {2}\S/.test(l)), 'every line is a lead-in or its indented body');
  assert.ok(LINES.slice(MOVES_AT, e).filter(l => /^- \*\*/.test(l)).every(l => body.includes(l)), 'no move outside the part');
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

// #262 S8, C18: each part Scriptorium builds wraps its whole default, with the italic mark above it.
test('each part Scriptorium builds sits under its mark, flush against its text, with no blank line inside', () => {
  for (const n of ['tiers', 'sensitive', 'workflow', 'lenses', 'qualities', 'cost-limits']) {
    const b = at(`<!-- pact:begin ${n} -->`);
    const e = at(`<!-- pact:end ${n} -->`);
    assert.ok(b > 0 && e > b + 1, n);
    assert.deepEqual(LINES.slice(b - 2, b), ['*Scriptorium builds this.*', ''], n);
    assert.ok(LINES.slice(b + 1, e).every(l => l.trim() !== '' && !/^\s/.test(l)), `${n}: a block may hold no blank line and no leading space`);
    assert.equal(LINES[e + 1], '', n);
  }
});

// #287 C1: the Cost limits part sits under its own heading, after the Qualities part, with its fixed text between.
test('the Cost limits part sits under its own heading, after the Qualities part, before Guards', () => {
  const b = at('<!-- pact:begin cost-limits -->');
  const h = at('## Cost limits');
  assert.ok(at('<!-- pact:end qualities -->') < h && h < b, 'heading after Qualities, before the block');
  assert.ok(LINES.slice(h + 1, b).every(l => !l.startsWith('## ')), 'no other heading between');
  assert.ok(at('## Guards') > at('<!-- pact:end cost-limits -->'), 'Guards follows');
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