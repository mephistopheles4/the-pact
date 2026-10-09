// The install's smoke set (#140): its happy path, end to end, against a
// throwaway git repo built from this tree and a throwaway -ClaudeHome. These
// cases moved here, unchanged, from install.test.mjs, so a payload change can
// run them without the whole install tier. Never touches ~/.claude.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { home, install, listTree, makeRepo } from './install-harness.mjs';

test('dry run on a clean tree passes and shows Node, the pin, the check and the gate', t => {
  const repo = makeRepo(t);
  const r = install(repo, home(t));
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^Node: .+ \(v\d+\.\d+\.\d+\)$/m);
  assert.match(r.stdout, /^Pinned check: grimoire f4a255c4e3df2abda11e7e738ab98abd27f4e0c7, sha256 verified$/m);
  assert.match(r.stdout, /^seam-a\| RESULT: pass$/m);
  assert.match(r.stdout, /^Check: passed on commit [0-9a-f]{40}$/m);
  assert.match(r.stdout, /^Gate: no gate recorded at the last install$/m);
  assert.doesNotMatch(r.stdout, /not content-checked until #33/);
  assert.match(
    r.stdout,
    /^Partly checked: the rendered CLAUDE\.md's marked clauses are checked word for word, and its open text for form, imports, routing and the roster, not for meaning; line numbers in seam A's lines count the rendered file\.$/m,
  );
});

test('-Apply installs today\'s agents byte for byte, records the gate, and the next dry run sees no gate change', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const r = install(repo, h, { apply: true });
  assert.equal(r.code, 0, r.out);
  for (const f of readdirSync(join(repo, 'claude', 'agents'))) {
    assert.deepEqual(readFileSync(join(h, 'agents', f)), readFileSync(join(repo, 'claude', 'agents', f)), f);
  }
  const manifest = JSON.parse(readFileSync(join(h, '.pact-install.json'), 'utf8'));
  const gatePaths = manifest.gate.map(g => g.path).sort();
  // Every file of the committed gate folder (the throwaway repo holds no tests), and the script (#155).
  const committed = (rel = 'gate') =>
    readdirSync(join(repo, ...rel.split('/'))).flatMap(n => (statSync(join(repo, ...rel.split('/'), n)).isDirectory() ? committed(`${rel}/${n}`) : [`${rel}/${n}`]));
  assert.deepEqual(gatePaths, [...committed(), 'scripts/install.ps1'].sort());
  for (const f of ['gate/seam-a.mjs', 'gate/render.mjs', 'gate/project.mjs', 'gate/review.mjs', 'gate/grimoire/check.mjs', 'gate/clauses/move-4.md']) assert.ok(gatePaths.includes(f), f);
  assert.ok(!listTree(h).some(f => /AGENTS/.test(f)), listTree(h).join('\n'));
  const again = install(repo, h);
  assert.equal(again.code, 0, again.out);
  assert.match(again.stdout, /^Gate: unchanged since the last install$/m);
  assert.match(again.stdout, /^Nothing to do\.$/m);
});
