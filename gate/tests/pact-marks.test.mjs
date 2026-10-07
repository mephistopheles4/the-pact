// The open marks in the pact source (#53, slice 2), placed as the spec's
// "Marks" section says, and the no-configuration render of the real source.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { OPEN_MARKS, RENDER, REPO, SEAM_A, lastLine, read, runSeamA, stage, tempDir, withoutOpenMarks } from './helpers.mjs';

const SOURCE = join(REPO, 'claude', 'CLAUDE.md');
const LINES = read(SOURCE).split('\n');
const MOVES_AT = LINES.indexOf('## Implementing a change');

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
  const r = spawnSync(process.execPath, [RENDER, SOURCE, out], { encoding: 'utf8', env });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const want = withoutOpenMarks(read(SOURCE));
  assert.notEqual(want, read(SOURCE), 'the source carries no open marks, so this test would pass for the wrong reason');
  assert.equal(readFileSync(join(out, 'CLAUDE.md'), 'utf8'), want);
});

test('seam A refuses the unrendered source: the open marks are not marks it knows, so a skipped render fails closed', t => {
  const root = stage(t, {}, { route: false });
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  const r = spawnSync(process.execPath, [SEAM_A, root], { encoding: 'utf8', env });
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

test('each move keeps only its bold lead-in on its numbered line; moves 1 to 3 open their mark on the next line', () => {
  for (const n of [1, 2, 3, 4]) {
    const i = LINES.findIndex((l, j) => j > MOVES_AT && l.startsWith(`${n}. `));
    assert.match(LINES[i], /^[1-4]\. \*\*[^*]+\*\*$/, `move ${n}`);
    assert.equal(LINES[i + 1], `   <!-- pact:begin move-${n} -->`, `move ${n}`);
  }
});

test('each move mark closes inside its move, before the next move', () => {
  for (const n of [1, 2, 3]) {
    const e = at(`   <!-- pact:end move-${n} -->`);
    const next = LINES.findIndex((l, j) => j > MOVES_AT && l.startsWith(`${n + 1}. `));
    assert.ok(e > 0 && e < next, `move-${n}`);
    assert.ok(LINES.slice(at(`   <!-- pact:begin move-${n} -->`) + 1, e).every(l => l.startsWith('   ') && l.trim() !== ''), `move-${n}`);
  }
});

test('move-3 ends right before security-route opens, and move-4-extra is an empty slot right after move-4', () => {
  assert.equal(at('   <!-- pact:end move-3 -->') + 1, at('   <!-- pact:begin security-route -->'));
  assert.equal(at('   <!-- pact:end move-4 -->') + 1, at('   <!-- pact:begin move-4-extra -->'));
  assert.equal(at('   <!-- pact:begin move-4-extra -->') + 1, at('   <!-- pact:end move-4-extra -->'));
  assert.equal(LINES[at('   <!-- pact:end move-4-extra -->') + 1], '');
});

test('config-notice is an empty slot right after the last line of the "Where this config lives" paragraph', () => {
  const b = at('<!-- pact:begin config-notice -->');
  assert.equal(LINES[0], '## Where this config lives');
  assert.equal(LINES[1], '');
  assert.ok(b > 2 && LINES.slice(2, b).every(l => l !== ''), 'the notice must follow the paragraph with no blank line between');
  assert.equal(LINES[b + 1], '<!-- pact:end config-notice -->');
  assert.equal(LINES[b + 2], '');
});

test('usage-pause wraps the usage paragraph in "Watching usage"', () => {
  const h = at('## Watching usage');
  const b = at('<!-- pact:begin usage-pause -->');
  const e = at('<!-- pact:end usage-pause -->');
  assert.equal(b, h + 2);
  assert.ok(LINES.slice(b + 1, e).every(l => l !== ''));
  assert.ok(LINES.slice(b + 1, e).join(' ').includes('the weekly limit is above 75%'));
  assert.equal(LINES[e + 1], '');
});
