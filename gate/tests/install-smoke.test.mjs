// The install's smoke set (#140): its happy path, end to end, against a
// throwaway git repo built from this tree and a throwaway --claude-home. These
// cases moved here, unchanged, from install.test.mjs, so a payload change can
// run them without the whole install tier. Never touches ~/.claude.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { home, install, listTree, makeRepo } from './install-harness.mjs';

// #261 C7
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
    /^Partly checked: the gate checks the rendered CLAUDE\.md's pinned block word for word, its markers, its characters and that it imports no file, not its wording or meaning; line numbers in seam A's lines count the rendered file\.$/m,
  );
});

// #261 C3
test('--apply installs today\'s agents byte for byte, records the gate, and the next dry run sees no gate change', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const r = install(repo, h, { apply: true });
  assert.equal(r.code, 0, r.out);
  for (const f of readdirSync(join(repo, 'claude', 'agents'))) {
    assert.deepEqual(readFileSync(join(h, 'agents', f)), readFileSync(join(repo, 'claude', 'agents', f)), f);
  }
  const manifest = JSON.parse(readFileSync(join(h, '.pact-install.json'), 'utf8'));
  const gatePaths = manifest.gate.map(g => g.path).sort();
  // Written out, so a stray gate file fails it; the four cores came with #155.
  // The Node install's gate is the gate folder alone (#153, S9).
  assert.deepEqual(gatePaths, [
    'gate/clauses/install-go-ahead.md',
    'gate/clauses/stop-and-escalate.md',
    'gate/contained.mjs',
    'gate/grimoire/check.mjs',
    'gate/grimoire/check.mjs.pin',
    'gate/install-core.mjs',
    'gate/install-io.mjs',
    'gate/install-run.mjs',
    'gate/install.mjs',
    'gate/pact-text.mjs',
    'gate/paths.mjs',
    'gate/project-core.mjs',
    'gate/project.mjs',
    'gate/render-core.mjs',
    'gate/render.mjs',
    'gate/review-core.mjs',
    'gate/review.mjs',
    'gate/seam-a-core.mjs',
    'gate/seam-a.mjs',
    'gate/settings-allowlist.json',
    'gate/shared.mjs',
    'gate/tool-allowlist.json',
  ]);
  assert.ok(!listTree(h).some(f => /AGENTS/.test(f)), listTree(h).join('\n'));
  // #261 S5: the review file installs beside the cross script, byte for byte, and the manifest lists it.
  assert.deepEqual(readFileSync(join(h, 'pact', 'review.md')), readFileSync(join(repo, 'claude', 'review.md')));
  assert.ok(manifest.files.some(f => f.path === 'pact/review.md'), JSON.stringify(manifest.files));
  assert.ok(!existsSync(join(h, 'review.md')), 'the review file is never at the top of the Claude folder');
  // A sealed familiar installs as agents/<stem>.md; its contract never reaches the home folder (#210, move 4).
  assert.deepEqual(readFileSync(join(h, 'agents', 'scout.md')), readFileSync(join(repo, 'familiars', 'scout.md')));
  assert.ok(existsSync(join(repo, 'familiars', 'scout.contract.md')), 'the control: the repo holds a contract that could have installed');
  assert.ok(!listTree(h).some(f => /contract/i.test(f)), listTree(h).join('\n'));
  const again = install(repo, h);
  assert.equal(again.code, 0, again.out);
  assert.match(again.stdout, /^Gate: unchanged since the last install$/m);
  assert.match(again.stdout, /^Nothing to do\.$/m);
});
