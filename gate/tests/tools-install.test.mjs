// Pact tools through the install script (#280, T1), end to end against a
// throwaway repo and a throwaway --claude-home: the poster on, off, over a
// file the pact didn't write, changed since the install, and named by a
// configuration whose commit lacks it. Each refusal checks that nothing
// changed. Never touches ~/.claude.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { CLEANER_DENY } from '../install-core.mjs';
import { home, install, listTree, makeRepo, passed, refused } from './install-harness.mjs';
import { tempDir } from './tree.mjs';

const LIVE = ['pact', 'tools', 'poster.mjs'];

/** A Claude home folder whose configuration sets `tools`. */
function homeWith(t, tools) {
  const h = home(t);
  mkdirSync(join(h, 'pact'), { recursive: true });
  writeFileSync(join(h, 'pact', 'config.json'), `${JSON.stringify({ schema: 1, tools })}\n`);
  return h;
}

function dryRunHash(r) {
  const m = /^ {2}rendered rules file: sha256 ([0-9a-f]{64})\r?$/m.exec(r.stdout);
  assert.ok(m, r.out);
  return m[1];
}

/** A dry run, then --apply with its hash. */
function installed(repo, h) {
  const dry = install(repo, h);
  passed(dry);
  passed(install(repo, h, { apply: true, extra: ['--rendered-hash', dryRunHash(dry)] }));
  return dry;
}

/** An --apply that refused, leaving the home folder exactly as it was. */
function refusedUnchanged(repo, h, says) {
  const before = listTree(h);
  const r = install(repo, h, { apply: true, extra: ['--rendered-hash', 'a'.repeat(64)] });
  refused(r, says);
  assert.deepEqual(listTree(h), before, 'a refused install changes nothing');
  return r;
}

// #280 C2, C4
test('the poster on: the dry run warns, it installs at pact/tools/poster.mjs byte for byte, and the installed copy refuses with no arguments and starts no gh', t => {
  const repo = makeRepo(t);
  const h = homeWith(t, ['poster']);
  const dry = installed(repo, h);
  assert.match(dry.stdout, /^Tools:\r?\n {2}poster: on\r?$/m, dry.out);
  assert.match(dry.stdout, /^ {2}WARN: the user configuration turns on the pact tool poster; it installs to pact\/tools\/poster\.mjs and posts and edits on GitHub as your gh account\. Permission rules on gh commands don't see its calls, and its scan is a backstop, not a guarantee\.\r?$/m, dry.out);
  assert.match(dry.stdout, /^Add: \d+\r?\n(?: {2}.*\r?\n)* {2}pact\/tools\/poster\.mjs\r?$/m, dry.out);
  assert.deepEqual(readFileSync(join(h, ...LIVE)), readFileSync(join(repo, 'claude', 'tools', 'poster.mjs')));
  const record = JSON.parse(readFileSync(join(h, '.pact-install.json'), 'utf8'));
  assert.ok(record.files.some(f => f.path === 'pact/tools/poster.mjs'), 'the record lists the tool');
  assert.match(readFileSync(join(h, 'CLAUDE.md'), 'utf8'), /^- \*\*Post through the poster\.\*\*/m, 'the rules file carries its rule');
  // Run from its install path, from an empty folder, with no gh on the path: it refuses before any gh call.
  const empty = tempDir(t, 'pact-poster-run-');
  const r = spawnSync(process.execPath, [join(h, ...LIVE)], { cwd: empty, encoding: 'utf8', env: { PATH: empty, SystemRoot: process.env.SystemRoot ?? '' } });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.deepEqual(r.stdout.trim().split(/\r?\n/), ['REFUSED usage/surface argument 1', 'RESULT: refused 1']);
  assert.equal(r.stderr, '');
});

// #280 C2: off is the default, and turning it off deletes the copy the record lists.
test('the poster off: by default it never installs, and turning it off deletes the live copy', t => {
  const repo = makeRepo(t);
  const h = homeWith(t, ['poster']);
  installed(repo, h);
  assert.ok(existsSync(join(h, ...LIVE)));
  writeFileSync(join(h, 'pact', 'config.json'), `${JSON.stringify({ schema: 1, tools: [] })}\n`);
  const dry = installed(repo, h);
  assert.match(dry.stdout, /^Delete: 1\r?\n {2}pact\/tools\/poster\.mjs\r?$/m, dry.out);
  assert.match(dry.stdout, /^ {2}poster: off\r?$/m, dry.out);
  assert.doesNotMatch(dry.stdout, /WARN: the user configuration turns on the pact tool/, dry.out);
  assert.ok(!existsSync(join(h, ...LIVE)), 'the tool turned off is deleted');
  // #272 C1: the apply that deleted it kept a copy in its backup, and nothing else holds one.
  const posters = listTree(h).map(f => f.split(/[\\/]/).join('/')).filter(f => /poster/.test(f));
  assert.equal(posters.length, 1, posters.join('\n'));
  assert.match(posters[0], /^pact\/backups\/\d{8}T\d{9}Z-[0-9a-f]{7}(-\d{2})?\/pact\/tools\/poster\.mjs$/);
});

// unlisted-live, #280 C2
test('bad case: a live file at the tool path the record does not list refuses, and is left alone', t => {
  const repo = makeRepo(t);
  const h = homeWith(t, ['poster']);
  mkdirSync(join(h, 'pact', 'tools'));
  writeFileSync(join(h, ...LIVE), 'my own poster\n');
  refused(install(repo, h), /^REFUSED: pact\/tools\/poster\.mjs already exists in the Claude home folder, and the install record does not list it, so the pact did not put it there\. Move it, or take its name out of the tools list\./m);
  refusedUnchanged(repo, h, /^REFUSED: pact\/tools\/poster\.mjs already exists/m);
  assert.equal(readFileSync(join(h, ...LIVE), 'utf8'), 'my own poster\n');
});

// apply-drift, #280 C2: a rewritten poster stops the next install, and is never the person's.
test('bad case: a changed live poster is drift, and --apply refuses', t => {
  const repo = makeRepo(t);
  const h = homeWith(t, ['poster']);
  installed(repo, h);
  writeFileSync(join(h, ...LIVE), 'rewritten\n');
  const dry = install(repo, h);
  passed(dry);
  assert.match(dry.stdout, /^Drift: 1\r?\n {2}pact\/tools\/poster\.mjs \(changed since the install\)\r?$/m, dry.out);
  assert.match(dry.stdout, /^Yours, left as is: 0\r?$/m, dry.out);
  const before = listTree(h);
  refused(install(repo, h, { apply: true, extra: ['--rendered-hash', dryRunHash(dry)] }), /^REFUSED: live files changed since the last install\./m);
  assert.deepEqual(listTree(h), before, 'a refused install changes nothing');
  assert.equal(readFileSync(join(h, ...LIVE), 'utf8'), 'rewritten\n');
});

// tools-not-in-pact, #280 C2: a configuration that turns on a tool the commit doesn't carry.
test('bad case: the poster turned on in a commit that lacks it refuses at seam A', t => {
  const repo = makeRepo(t, root => rmSync(join(root, 'claude', 'tools'), { recursive: true, force: true }));
  const h = homeWith(t, ['poster']);
  const r = refusedUnchanged(repo, h, /^REFUSED: the check failed\./m);
  assert.match(r.stdout, /^seam-a\| FAIL tools-not-in-pact: --tools names poster, but the stage holds no claude\/tools\/poster\.mjs: it is not in this pact\r?$/m, r.out);
});

// #438 C13: the cleaner's deny rules come and go with it, and only those it added.
test('the cleaner on adds its deny rules beside the owner\'s and records them; off removes only rules both recorded and fixed', t => {
  const repo = makeRepo(t);
  const h = homeWith(t, ['cleaner']);
  const OWN = ['Bash(git branch -d *)', 'Bash(rm -rf ./mine *)'];
  const FOREIGN = 'Bash(foreign *)';
  writeFileSync(join(h, 'settings.json'), `${JSON.stringify({ permissions: { deny: OWN } })}\n`);
  const deny = () => JSON.parse(readFileSync(join(h, 'settings.json'), 'utf8')).permissions.deny;
  const record = () => JSON.parse(readFileSync(join(h, '.pact-install.json'), 'utf8'));
  const added = CLEANER_DENY.filter(r => r !== OWN[0]);

  const on = installed(repo, h);
  for (const r of added) assert.ok(on.stdout.includes(`  + permissions.deny: ${r}`), r);
  assert.ok(!on.stdout.includes('rm -rf ./mine'), 'the dry run shows no live entry');
  assert.deepEqual(deny(), [...new Set([...OWN, ...CLEANER_DENY])].sort());
  assert.deepEqual(record().cleanerDeny, added, 'an identical rule the owner wrote before is not recorded');
  installed(repo, h);
  assert.deepEqual(record().cleanerDeny, added, 'a second install keeps the record');

  // A rule outside the sixteen that the record lists stays.
  const r = record();
  r.cleanerDeny.push(FOREIGN);
  writeFileSync(join(h, '.pact-install.json'), `${JSON.stringify(r, null, 2)}\n`);
  writeFileSync(join(h, 'settings.json'), `${JSON.stringify({ permissions: { deny: [...deny(), FOREIGN] } })}\n`);
  writeFileSync(join(h, 'pact', 'config.json'), `${JSON.stringify({ schema: 1, tools: [] })}\n`);
  const off = installed(repo, h);
  for (const x of added) assert.ok(off.stdout.includes(`  - permissions.deny: ${x}`), x);
  assert.deepEqual(deny(), [OWN[0], FOREIGN, OWN[1]].sort());
  assert.equal(record().cleanerDeny, undefined);

  // A malformed record refuses; an install that never turned the cleaner on removes nothing.
  const good = record();
  for (const bad of ['Bash(x)', ['Bash(x)', 5]]) {
    writeFileSync(join(h, '.pact-install.json'), `${JSON.stringify({ ...good, cleanerDeny: bad }, null, 2)}\n`);
    refused(install(repo, h), /^REFUSED: the install record's cleanerDeny is not a list of rule strings/m);
  }
  const fresh = homeWith(t, []);
  writeFileSync(join(fresh, 'settings.json'), `${JSON.stringify({ permissions: { deny: [...CLEANER_DENY] } })}\n`);
  installed(repo, fresh);
  assert.deepEqual(JSON.parse(readFileSync(join(fresh, 'settings.json'), 'utf8')).permissions.deny, [...CLEANER_DENY].sort());
});
