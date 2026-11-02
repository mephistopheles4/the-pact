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

/** Every mark line in the source: { line, kind, name, indent }. */
function marks(lines) {
  const out = [];
  lines.forEach((l, i) => {
    const m = /^( *)<!-- pact:(begin|end) ([a-z][a-z0-9-]*) -->$/.exec(l);
    if (m) out.push({ line: i, indent: m[1], kind: m[2], name: m[3] });
  });
  return out;
}

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

test('no open mark encloses or overlaps a gated mark', () => {
  const all = marks(LINES);
  for (const n of OPEN_MARKS) {
    const [b, e] = all.filter(m => m.name === n);
    assert.deepEqual(all.filter(m => m.line > b.line && m.line < e.line), [], `${n} encloses another mark`);
  }
});
