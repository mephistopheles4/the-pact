// #262 addendum 3: the owner's own agent files, the install script end to end,
// against a throwaway repo and --claude-home. Never touches ~/.claude. The
// renderer's own cases, which never install, are in agent-settings.test.mjs.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { plantModule } from './gate-files.mjs';
import { home, install, listTree, makeRepo, refused } from './install-harness.mjs';

const sha256 = b => createHash('sha256').update(b).digest('hex');
const MINE = '---\nname: my-reviewer\ndescription: Reviews my diffs.\ntools: [Read, Grep]\nmodel: sonnet\n---\n\nRead the diff and say what you see.\n';
const SCOUT = '---\nname: scout\ndescription: My own scout.\nmodel: haiku\n---\n\nFind things, briefly.\n';

/** A configuration file and the own agent files `own` (file name -> text) in the Claude home `h`. */
function configure(h, own) {
  mkdirSync(join(h, 'pact', 'agents'), { recursive: true });
  writeFileSync(join(h, 'pact', 'config.json'), '{ "schema": 1 }\n');
  for (const [f, text] of Object.entries(own)) writeFileSync(join(h, 'pact', 'agents', f), text);
}

function dryRunHash(r) {
  const m = /^ {2}rendered rules file: sha256 ([0-9a-f]{64})\r?$/m.exec(r.stdout);
  assert.ok(m, r.out);
  return m[1];
}

const applied = (repo, h) => {
  const dry = install(repo, h);
  assert.equal(dry.code, 0, dry.out);
  const r = install(repo, h, { apply: true, extra: ['--rendered-hash', dryRunHash(dry)] });
  assert.equal(r.code, 0, r.out);
  return { dry, r };
};

// #262 addendum 3: an added agent and a replaced pact agent install as written, are recorded, and a dropped one is deleted.
test('own agent files install as written: one added, one replacing a pact agent; dropping them deletes the added one and puts the pact\'s back', t => {
  const repo = makeRepo(t);
  const h = home(t);
  configure(h, { 'my-reviewer.md': MINE, 'scout.md': SCOUT });
  const { dry, r } = applied(repo, h);
  assert.match(dry.stdout, new RegExp(`^ {2}agent file pact/agents/my-reviewer\\.md: sha256 ${sha256(MINE)}, no install recorded\\r?$`, 'm'), dry.out);
  assert.match(dry.stdout, /^ {2}WARN: the user configuration adds its own agent my-reviewer\.\r?$/m, dry.out);
  assert.match(dry.stdout, /^ {2}WARN: the user configuration replaces the pact agent scout with its own file\.\r?$/m, dry.out);
  assert.match(dry.stdout, /^seam-a\| RESULT: pass\r?$/m, dry.out);
  assert.match(r.stdout, /all files verified/, r.out);
  assert.equal(readFileSync(join(h, 'agents', 'my-reviewer.md'), 'utf8'), MINE);
  assert.equal(readFileSync(join(h, 'agents', 'scout.md'), 'utf8'), SCOUT);
  const manifest = JSON.parse(readFileSync(join(h, '.pact-install.json'), 'utf8'));
  assert.equal(manifest.files.find(f => f.path === 'agents/my-reviewer.md').sha256, sha256(MINE));
  assert.deepEqual(manifest.config.filter(c => c.kind === 'agent'), [{ kind: 'agent', name: 'my-reviewer', sha256: sha256(MINE) }, { kind: 'agent', name: 'scout', sha256: sha256(SCOUT) }]);
  assert.match(readFileSync(join(h, 'CLAUDE.md'), 'utf8'), /^Own agents: my-reviewer \(added\), scout \(replaces the pact's\)\.$/m);

  // Both files dropped: the added agent is deleted, the pact's scout comes back.
  rmSync(join(h, 'pact', 'agents'), { recursive: true });
  const again = applied(repo, h);
  assert.match(again.dry.stdout, /^Drift: 0\r?$/m, again.dry.out);
  assert.ok(!existsSync(join(h, 'agents', 'my-reviewer.md')), 'the dropped own agent was not deleted');
  assert.deepEqual(readFileSync(join(h, 'agents', 'scout.md')), readFileSync(join(repo, 'claude', 'agents', 'scout.md')));
});

// #262 addendum 3; the configuration digest binds the own files.
test('bad case: an own agent file changed between the dry run and -Apply refuses by the rendered hash, and writes nothing', t => {
  const repo = makeRepo(t);
  const h = home(t);
  configure(h, { 'my-reviewer.md': MINE });
  const hash = dryRunHash(install(repo, h));
  writeFileSync(join(h, 'pact', 'agents', 'my-reviewer.md'), MINE.replace('see.', 'saw.'));
  const r = install(repo, h, { apply: true, extra: ['--rendered-hash', hash] });
  refused(r);
  assert.match(r.stdout, /^REFUSED: the hash given with --rendered-hash is not the full hash/m, r.out);
  assert.ok(!existsSync(join(h, 'agents')), 'the refused install wrote agents');
});

// #262 addendum 3: an own agent never lands on an agent file the pact did not write.
test('bad case: an own agent whose path holds an agent the pact never wrote refuses, and writes nothing', t => {
  const repo = makeRepo(t);
  const h = home(t);
  configure(h, { 'my-reviewer.md': MINE });
  mkdirSync(join(h, 'agents'), { recursive: true });
  writeFileSync(join(h, 'agents', 'my-reviewer.md'), 'my hand-made agent\n');
  const r = install(repo, h);
  refused(r);
  assert.match(r.stdout, /^REFUSED: agents\/my-reviewer\.md already exists in the Claude home folder, and the install record does not list it/m, r.out);
  assert.equal(readFileSync(join(h, 'agents', 'my-reviewer.md'), 'utf8'), 'my hand-made agent\n');
  assert.ok(!existsSync(join(h, 'CLAUDE.md')));
});

// #262 addendum 3: seam A reads an own agent file like any agent; its name must match its file.
test('bad case: an own agent whose name differs from its file refuses at seam A', t => {
  const repo = makeRepo(t);
  const h = home(t);
  configure(h, { 'my-reviewer.md': MINE.replace('name: my-reviewer', 'name: other') });
  const r = install(repo, h);
  refused(r);
  assert.match(r.stdout, /^seam-a\| FAIL name-stem: /m, r.out);
});

// ------------------------------------------------------------ a renderer that lies about an own file

const R_OWN_PUSH = '  for (const o of own) report.lines.push(`OWN ${o.name} ${o.hash}`);';
const R_OWN_WRITE = "  for (const o of own) writeFileSync(join(out, `${OWN_OUTPUT_PREFIX}${o.name}.md`), o.buf, { flag: 'wx' });";

for (const [label, from, to, why] of [
  ['an own file hash other than its own', R_OWN_PUSH, `  for (const o of own) report.lines.push(\`OWN \${o.name} ${'a'.repeat(64)}\`);`, "the renderer's configuration digest is missing or does not match the configuration hashes it reported"],
  ['an OWN line twice', R_OWN_PUSH, `${R_OWN_PUSH}\n${R_OWN_PUSH}`, 'the renderer reported one own agent twice'],
  ['an own file with no OWN line', R_OWN_PUSH, '', "the renderer's configuration digest is missing or does not match the configuration hashes it reported"],
  ['an OWN line with no own file', R_OWN_WRITE, '', 'the renderer did not leave exactly its rules file of at most 1 MiB, its diff, and an agent file only for an agent setting it reported'],
  ['an own file other than the bytes it hashed', R_OWN_WRITE, "  for (const o of own) writeFileSync(join(out, `${OWN_OUTPUT_PREFIX}${o.name}.md`), Buffer.concat([o.buf, Buffer.from('x')]), { flag: 'wx' });", "an own agent file's hash does not match the one the renderer reported"],
]) {
  test(`bad case: a renderer that reports ${label} refuses, and nothing is installed`, t => {
    const repo = makeRepo(t, root => plantModule(join(root, 'gate'), 'render', from, to));
    const h = home(t);
    configure(h, { 'my-reviewer.md': MINE });
    const r = install(repo, h, { apply: true, extra: ['--rendered-hash', 'a'.repeat(64)] });
    refused(r);
    assert.match(r.stdout, new RegExp(`^REFUSED: ${why.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.`, 'm'), r.out);
    assert.ok(!listTree(h).some(f => f === 'CLAUDE.md' || f === '.pact-install.json' || f.startsWith('agents/')), listTree(h).join('\n'));
  });
}
