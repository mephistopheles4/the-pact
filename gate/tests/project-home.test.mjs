// The project check's home-folder rule (#53, slice 5), run as the install
// runs it, with HOME and USERPROFILE pointed elsewhere: the check reads the
// real home folder from the OS, not from the environment. A child run, since
// the case sets its own environment. The project install end to end is in
// install-project.test.mjs.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { test } from 'node:test';
import { REPO } from './helpers.mjs';

const WIN = process.platform === 'win32';
const FOLD = WIN || process.platform === 'darwin';
const under = (inner, outer) => {
  const f = s => (FOLD ? s.toLowerCase() : s);
  const a = f(inner).split(sep).filter(Boolean);
  const b = f(outer).split(sep).filter(Boolean);
  return b.length <= a.length && b.every((s, i) => s === a[i]);
};

/** A new folder outside the real home folder: under the temp folder when that is outside it, else under ProgramData on Windows; null when neither can be made. */
function outsideHome(t) {
  const bases = [tmpdir(), WIN ? process.env.ProgramData : null].filter(b => b && !under(b, homedir()));
  for (const b of bases) {
    try {
      const d = mkdtempSync(join(b, 'pact-proj-'));
      t.after(() => rmSync(d, { recursive: true, force: true }));
      return d;
    } catch {}
  }
  return null;
}

test('bad case: HOME or USERPROFILE pointed elsewhere does not move the real home folder (check only)', t => {
  // The fake home and the Claude home named for the run both sit outside the
  // real home folder, so only the real home folder's own relation can refuse.
  const root = outsideHome(t);
  if (!root) {
    t.skip('no folder outside the home folder can be made here (not run)');
    return;
  }
  const fake = join(root, 'fake-home');
  const ch = join(root, 'claude');
  mkdirSync(fake);
  mkdirSync(ch);
  const env = { ...process.env, HOME: fake, USERPROFILE: fake };
  delete env.NODE_OPTIONS;
  const r = spawnSync(process.execPath, [join(REPO, 'gate', 'project.mjs'), 'check', homedir(), ch], { encoding: 'utf8', env });
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /^FAIL project-home: the project folder is your home folder, or holds it$/m, r.stdout);
});
