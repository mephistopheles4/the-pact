// The install's smoke set (#140): its happy path, end to end, against a
// throwaway git repo built from this tree and a throwaway --claude-home. These
// cases moved here, unchanged, from install.test.mjs, so a payload change can
// run them without the whole install tier. Never touches ~/.claude.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { home, install, listTree, makeRepo, refused } from './install-harness.mjs';

// #261 C7
test('dry run on a clean tree passes and shows Node, the check and the gate', t => {
  const repo = makeRepo(t);
  const r = install(repo, home(t));
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^Node: .+ \(v\d+\.\d+\.\d+\)$/m);
  assert.doesNotMatch(r.stdout, /^Pinned check/m);
  assert.match(r.stdout, /^seam-a\| RESULT: pass$/m);
  assert.match(r.stdout, /^Check: passed on commit [0-9a-f]{40}$/m);
  assert.match(r.stdout, /^Gate: no gate recorded at the last install$/m);
  assert.doesNotMatch(r.stdout, /not content-checked until #33/);
  assert.match(
    r.stdout,
    /^Not checked: what the pact's files say\. The gate checks install mechanics only; vet the pact as you would any skill\.$/m,
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
    'gate/contained.mjs',
    'gate/install-core.mjs',
    'gate/install-io.mjs',
    'gate/install-run.mjs',
    'gate/install.mjs',
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
  ]);
  assert.ok(!listTree(h).some(f => /AGENTS/.test(f)), listTree(h).join('\n'));
  // #261 S5: the review file installs byte for byte, and the manifest lists it.
  assert.deepEqual(readFileSync(join(h, 'pact', 'review.md')), readFileSync(join(repo, 'claude', 'review.md')));
  assert.ok(manifest.files.some(f => f.path === 'pact/review.md'), JSON.stringify(manifest.files));
  assert.ok(!existsSync(join(h, 'review.md')), 'the review file is never at the top of the Claude folder');
  // #280 C2: the poster is off by default, so neither its install path nor any other copy of it is in the home folder.
  assert.ok(existsSync(join(repo, 'claude', 'tools', 'poster.mjs')), 'the control: the repo holds the poster');
  assert.ok(!existsSync(join(h, 'pact', 'tools', 'poster.mjs')) && !listTree(h).some(f => /poster/.test(f)), listTree(h).join('\n'));
  // scout installs as agents/scout.md from claude/agents/ (#262 S18); no contract ever reaches the home folder (#210, at Test).
  assert.deepEqual(readFileSync(join(h, 'agents', 'scout.md')), readFileSync(join(repo, 'claude', 'agents', 'scout.md')));
  assert.ok(existsSync(join(repo, 'familiars', 'scout.contract.md')), 'the control: the repo holds a contract that could have installed');
  assert.ok(!listTree(h).some(f => /contract/i.test(f)), listTree(h).join('\n'));
  const again = install(repo, h);
  assert.equal(again.code, 0, again.out);
  assert.match(again.stdout, /^Gate: unchanged since the last install$/m);
  assert.match(again.stdout, /^Nothing to do\.$/m);
});

// #264: the cut drift cases, retargeted to a live file that still installs. A refused apply changes nothing (the repo's rule on cutting install cases).
test('bad case: a tampered live review file is drift, and --apply refuses and changes nothing', t => {
  const repo = makeRepo(t);
  const h = home(t);
  assert.equal(install(repo, h, { apply: true }).code, 0);
  const live = join(h, 'pact', 'review.md');
  writeFileSync(live, `${readFileSync(live, 'utf8')}\n// tampered\n`);
  const dry = install(repo, h);
  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.stdout, /^Drift: 1\r?$/m, dry.out);
  assert.match(dry.stdout, /^ {2}pact\/review\.md \(changed since the install\)\r?$/m, dry.out);
  refused(install(repo, h, { apply: true }));
  assert.match(readFileSync(live, 'utf8'), /tampered/, 'a refused apply changes nothing');
});

test('bad case: a deleted live review file is drift, and --apply refuses and changes nothing', t => {
  const repo = makeRepo(t);
  const h = home(t);
  assert.equal(install(repo, h, { apply: true }).code, 0);
  rmSync(join(h, 'pact', 'review.md'));
  const dry = install(repo, h);
  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.stdout, /^Drift: 1\r?$/m, dry.out);
  assert.match(dry.stdout, /^ {2}pact\/review\.md \(deleted since the install\)\r?$/m, dry.out);
  refused(install(repo, h, { apply: true }));
  assert.ok(!existsSync(join(h, 'pact', 'review.md')), 'a refused apply changes nothing');
});
