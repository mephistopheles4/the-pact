// Pact tools through the install script (#280, T1), end to end against a
// throwaway repo and a throwaway --home folder: the poster on, off, over a
// file the pact didn't write, changed since the install, and named by a
// configuration whose commit lacks it. Each refusal checks that nothing
// changed. Never touches ~/.claude.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { CLEANER_ASK, CLEANER_DENY, STOP_DENY, identityGitconfigText } from '../install-core.mjs';
import { home, install, listTree, makeRepo, passed, refused, total } from './install-harness.mjs';
import { tempDir } from './tree.mjs';

const LIVE = ['.pact', 'tools', 'poster.mjs'];

const entriesOf = h => JSON.parse(readFileSync(join(h, '.pact', 'install.json'), 'utf8')).entries;
/** The values the record's settings entries hold under `key`, in order. */
const recorded = (h, key) => entriesOf(h).filter(e => e.key === key).map(e => e.value);
/** The env keys the record's settings entries hold, with their values. */
const recordedEnv = h => Object.fromEntries(entriesOf(h).filter(e => e.key.startsWith('env.')).map(e => [e.key.slice('env.'.length), e.value]));
/** Add `rules` to the live deny list, leaving the rest of settings.json as it is. */
function addDeny(h, ...rules) {
  const p = join(h, '.claude', 'settings.json');
  const live = JSON.parse(readFileSync(p, 'utf8'));
  live.permissions.deny.push(...rules);
  writeFileSync(p, `${JSON.stringify(live)}\n`);
}
/** A settings entry as the install records one, for planting in a record. */
const planted = (key, value) => ({ harness: 'claude', path: '.claude/settings.json', key, value, sha256: createHash('sha256').update(JSON.stringify(value)).digest('hex') });

/** A home folder whose configuration sets `tools`. */
function homeWith(t, tools) {
  const h = home(t);
  mkdirSync(join(h, '.pact'), { recursive: true });
  writeFileSync(join(h, '.pact', 'config.json'), `${JSON.stringify({ schema: 1, tools })}\n`);
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
test('the poster on: the dry run warns, it installs at .pact/tools/poster.mjs byte for byte, and the installed copy refuses with no arguments and starts no gh', t => {
  const repo = makeRepo(t);
  const h = homeWith(t, ['poster']);
  const dry = installed(repo, h);
  assert.match(dry.stdout, /^Tools:\r?\n {2}poster: on\r?$/m, dry.out);
  assert.match(dry.stdout, /^ {2}WARN: the user configuration turns on the pact tool poster; it installs to \.pact\/tools\/poster\.mjs and posts and edits on GitHub as your gh account\. Permission rules on gh commands don't see its calls, and its scan is a backstop, not a guarantee\.\r?$/m, dry.out);
  assert.match(dry.stdout, /^Add: \d+\r?\n(?: {2}.*\r?\n)* {2}\.pact\/tools\/poster\.mjs\r?$/m, dry.out);
  assert.deepEqual(readFileSync(join(h, ...LIVE)), readFileSync(join(repo, 'claude', 'tools', 'poster.mjs')));
  const record = JSON.parse(readFileSync(join(h, '.pact', 'install.json'), 'utf8'));
  assert.ok(record.files.some(f => f.path === '.pact/tools/poster.mjs'), 'the record lists the tool');
  assert.match(readFileSync(join(h, '.claude', 'CLAUDE.md'), 'utf8'), /^- \*\*Post through the poster,\*\*/m, 'the rules file carries its rule');
  // Run from its install path, from an empty folder, with no gh on the path: it refuses before any gh call.
  const empty = tempDir(t, 'pact-poster-run-');
  const r = spawnSync(process.execPath, [join(h, ...LIVE)], { cwd: empty, encoding: 'utf8', env: { PATH: empty, SystemRoot: process.env.SystemRoot ?? '' } });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  const lines = r.stdout.trim().split(/\r?\n/);
  assert.deepEqual([lines[0], lines.at(-1)], ['REFUSED usage/surface argument 1', 'RESULT: refused 1']);
  assert.match(lines[1], /^NEXT: give a surface first: /, 'the refusal names its next step');
  assert.equal(lines.length, 3);
  assert.equal(r.stderr, '');
});

// #280 C2: off is the default, and turning it off deletes the copy the record lists.
test('the poster off: by default it never installs, and turning it off deletes the live copy', t => {
  const repo = makeRepo(t);
  const h = homeWith(t, ['poster']);
  installed(repo, h);
  assert.ok(existsSync(join(h, ...LIVE)));
  writeFileSync(join(h, '.pact', 'config.json'), `${JSON.stringify({ schema: 1, tools: [] })}\n`);
  const dry = installed(repo, h);
  assert.match(dry.stdout, /^Delete: 1\r?\n {2}\.pact\/tools\/poster\.mjs\r?$/m, dry.out);
  assert.equal(total(dry, 'Delete'), 1, dry.out);
  assert.match(dry.stdout, /^ {2}poster: off\r?$/m, dry.out);
  assert.doesNotMatch(dry.stdout, /WARN: the user configuration turns on the pact tool/, dry.out);
  assert.ok(!existsSync(join(h, ...LIVE)), 'the tool turned off is deleted');
  // #272 C1: the apply that deleted it kept a copy in its backup, and nothing else holds one.
  const posters = listTree(h).map(f => f.split(/[\\/]/).join('/')).filter(f => /poster/.test(f));
  assert.equal(posters.length, 1, posters.join('\n'));
  assert.match(posters[0], /^\.pact\/backups\/\d{8}T\d{9}Z-[0-9a-f]{7}(-\d{2})?\/\.pact\/tools\/poster\.mjs$/);
});

// unlisted-live, #280 C2
test('bad case: a live file at the tool path the record does not list refuses, and is left alone', t => {
  const repo = makeRepo(t);
  const h = homeWith(t, ['poster']);
  mkdirSync(join(h, '.pact', 'tools'));
  writeFileSync(join(h, ...LIVE), 'my own poster\n');
  refused(install(repo, h), /^REFUSED: \.pact\/tools\/poster\.mjs already exists, and the install record does not list it, so the pact did not put it there\. Move it, or take its name out of the tools list\./m);
  refusedUnchanged(repo, h, /^REFUSED: \.pact\/tools\/poster\.mjs already exists/m);
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
  assert.match(dry.stdout, /^Drift: 1\r?\n {2}\.pact\/tools\/poster\.mjs \(changed since the install\)\r?$/m, dry.out);
  assert.equal(total(dry, 'Drift'), 1, dry.out);
  assert.equal(total(dry, 'Yours, left as is'), 0, dry.out);
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

/**
 * Every file in a home folder but the install record and the backups (each
 * names the time it was made), as { 'rel/path': sha256 of its bytes }. The
 * home folder's own path is blanked in .claude/settings.json, which names it.
 */
function filesOf(h) {
  const out = {};
  for (const rel of listTree(h)) {
    const p = join(h, rel);
    const name = rel.split(/[\\/]/).join('/');
    if (!statSync(p).isFile() || name === '.pact/install.json' || name.startsWith('.pact/backups/')) continue;
    let bytes = readFileSync(p);
    if (name === '.claude/settings.json') bytes = Buffer.from(bytes.toString('utf8').split(h).join('<home>').split(h.replaceAll('\\', '/')).join('<home>').split(h.replaceAll('\\', '\\\\')).join('<home>'));
    out[name] = createHash('sha256').update(bytes).digest('hex');
  }
  return out;
}
/** The paths where two such maps differ. */
const differ = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => a[k] !== b[k]).sort();

// PACT-61 C1: with clef off, the apply writes and records what a commit without the tool writes; the dry run's tools block says off.
test('clef off: the apply writes and records the same files as a commit without the tool, and the dry run says clef: off', t => {
  const without = makeRepo(t, root => rmSync(join(root, 'claude', 'tools', 'clef.mjs'), { force: true }));
  const withClef = makeRepo(t);
  const [h1, h2] = [homeWith(t, []), homeWith(t, [])];
  const base = installed(without, h1);
  const dry = installed(withClef, h2);
  assert.match(base.stdout, /^ {2}clef: off \(not in this commit\)\r?$/m, base.out);
  assert.match(dry.stdout, /^ {2}clef: off\r?$/m, dry.out);
  assert.deepEqual(differ(filesOf(h2), filesOf(h1)), [], 'the same bytes in the same places');
  const record = h => JSON.parse(readFileSync(join(h, '.pact', 'install.json'), 'utf8')).files.map(f => `${f.path} ${f.sha256 ?? f.hash ?? ''}`).sort();
  assert.deepEqual(record(h2), record(h1), 'the same files recorded');
  assert.ok(!existsSync(join(h2, '.pact', 'tools', 'clef.mjs')));
});

// PACT-61 C2: with clef on, the apply adds .pact/tools/clef.mjs and nothing else; the dry run warns; the clef folder is left alone.
test('clef on: the dry run warns, the apply adds .pact/tools/clef.mjs and no other file, and an install and a turn-off leave the clef folder untouched', t => {
  const repo = makeRepo(t);
  const [off, on] = [homeWith(t, []), homeWith(t, ['clef'])];
  installed(repo, off);
  const folder = join(on, '.claude', 'pact-clef');
  mkdirSync(join(folder, 'runtime', 'b12211'), { recursive: true });
  writeFileSync(join(folder, 'runtime', 'b12211', 'llama-server.exe'), 'a downloaded file');
  writeFileSync(join(folder, 'setup.json'), '{"tag":"b12211"}\n');
  const before = filesOf(folder);
  const dry = installed(repo, on);
  assert.match(dry.stdout, /^ {2}clef: on\r?$/m, dry.out);
  assert.match(dry.stdout, /^ {2}WARN: the user configuration turns on the pact tool clef; it installs to \.pact\/tools\/clef\.mjs and, when you run its setup, downloads a llama\.cpp server build \(about 25–39 MB\) and a Clef model \(about 6\.7 GB\) from GitHub and Hugging Face, then runs them on this machine, listening on 127\.0\.0\.1 only\.\r?$/m, dry.out);
  const added = Object.keys(filesOf(on)).filter(f => !f.startsWith('.claude/pact-clef/') && !(f in filesOf(off)));
  assert.deepEqual(added, ['.pact/tools/clef.mjs']);
  assert.deepEqual(readFileSync(join(on, '.pact', 'tools', 'clef.mjs')), readFileSync(join(repo, 'claude', 'tools', 'clef.mjs')));
  assert.deepEqual(differ(filesOf(folder), before), [], 'an install leaves the clef folder as it was');
  writeFileSync(join(on, '.pact', 'config.json'), `${JSON.stringify({ schema: 1, tools: [] })}\n`);
  installed(repo, on);
  assert.ok(!existsSync(join(on, '.pact', 'tools', 'clef.mjs')), 'taking clef off removes the script');
  assert.deepEqual(differ(filesOf(folder), before), [], 'a turn-off leaves the clef folder as it was');
});

// #438 C13: the cleaner's deny rules come and go with it, and only those it added.
test('the cleaner on adds its deny rules beside the owner\'s and records them; off removes only rules both recorded and fixed', t => {
  const repo = makeRepo(t);
  const h = homeWith(t, ['cleaner']);
  const OWN = ['Bash(git branch -d *)', 'Bash(rm -rf ./mine *)'];
  const FOREIGN = 'Bash(foreign *)';
  writeFileSync(join(h, '.claude', 'settings.json'), `${JSON.stringify({ permissions: { deny: OWN } })}\n`);
  const deny = () => JSON.parse(readFileSync(join(h, '.claude', 'settings.json'), 'utf8')).permissions.deny;
  const record = () => JSON.parse(readFileSync(join(h, '.pact', 'install.json'), 'utf8'));
  const added = CLEANER_DENY.filter(r => r !== OWN[0]);
  const denies = () => recorded(h, 'permissions.deny');

  const on = installed(repo, h);
  for (const r of added) assert.ok(on.stdout.includes(`  + permissions.deny: ${r}`), r);
  assert.ok(!on.stdout.includes('rm -rf ./mine'), 'the dry run shows no live entry');
  assert.deepEqual(deny(), [...new Set([...OWN, ...CLEANER_DENY])].sort());
  assert.deepEqual(denies(), added, 'an identical rule the owner wrote before is not recorded');
  installed(repo, h);
  assert.deepEqual(denies(), added, 'a second install keeps the record');

  // A rule outside the fixed eighteen that the record lists stays.
  const r = record();
  r.entries.push(planted('permissions.deny', FOREIGN));
  writeFileSync(join(h, '.pact', 'install.json'), `${JSON.stringify(r, null, 2)}\n`);
  addDeny(h, FOREIGN);
  writeFileSync(join(h, '.pact', 'config.json'), `${JSON.stringify({ schema: 1, tools: [] })}\n`);
  const off = installed(repo, h);
  for (const x of added) assert.ok(off.stdout.includes(`  - permissions.deny: ${x}`), x);
  assert.deepEqual(deny(), [OWN[0], FOREIGN, OWN[1]].sort());
  assert.deepEqual(denies(), []);

  // A malformed record refuses; an install that never turned the cleaner on removes nothing.
  const good = record();
  for (const bad of ['Bash(x)', ['Bash(x)', 5]]) {
    writeFileSync(join(h, '.pact', 'install.json'), `${JSON.stringify({ ...good, entries: bad }, null, 2)}\n`);
    refused(install(repo, h), /^REFUSED: the install record's entries are not a list of settings entries/m);
  }
  const fresh = homeWith(t, []);
  writeFileSync(join(fresh, '.claude', 'settings.json'), `${JSON.stringify({ permissions: { deny: [...CLEANER_DENY] } })}\n`);
  installed(repo, fresh);
  assert.deepEqual(JSON.parse(readFileSync(join(fresh, '.claude', 'settings.json'), 'utf8')).permissions.deny, [...CLEANER_DENY].sort());
});

// #523 C20: end to end, the ask rules come and go with the cleaner, and the dry run says so.
test('the cleaner on adds its two ask rules and records them; off removes only recorded ones; an untouched settings.json draws a WARN naming both', t => {
  const repo = makeRepo(t);
  const h = homeWith(t, ['cleaner']);
  const own = 'Bash(mine)';
  writeFileSync(join(h, '.claude', 'settings.json'), `${JSON.stringify({ permissions: { ask: [own, CLEANER_ASK[0]] } })}\n`);
  const ask = () => JSON.parse(readFileSync(join(h, '.claude', 'settings.json'), 'utf8')).permissions.ask;
  const record = () => JSON.parse(readFileSync(join(h, '.pact', 'install.json'), 'utf8'));
  const dry = install(repo, h);
  passed(dry);
  assert.ok(dry.stdout.includes(`  + permissions.ask: ${CLEANER_ASK[1]}`), dry.out);
  assert.ok(!dry.stdout.includes(`  + permissions.ask: ${CLEANER_ASK[0]}`), 'a rule the owner already has is not added');
  installed(repo, h);
  assert.deepEqual(ask(), [own, ...CLEANER_ASK].sort());
  assert.deepEqual(recorded(h, 'permissions.ask'), [CLEANER_ASK[1]], 'an identical rule the owner wrote before is not recorded');
  installed(repo, h);
  assert.deepEqual(recorded(h, 'permissions.ask'), [CLEANER_ASK[1]], 'a second install keeps the record');
  writeFileSync(join(h, '.pact', 'config.json'), `${JSON.stringify({ schema: 1, tools: [] })}\n`);
  const off = installed(repo, h);
  assert.ok(off.stdout.includes(`  - permissions.ask: ${CLEANER_ASK[1]}`), off.out);
  assert.deepEqual(ask(), [own, CLEANER_ASK[0]].sort());
  assert.deepEqual(recorded(h, 'permissions.ask'), []);

  // A malformed record refuses.
  const good = record();
  for (const bad of ['Bash(x)', ['Bash(x)', 5]]) {
    writeFileSync(join(h, '.pact', 'install.json'), `${JSON.stringify({ ...good, entries: bad }, null, 2)}\n`);
    refused(install(repo, h), /^REFUSED: the install record's entries are not a list of settings entries/m);
  }

  // settings.json that is not strict JSON is left untouched (the install refuses to merge into it); the cleaner on, the dry run and the apply name the rules that are missing.
  const lax = homeWith(t, ['cleaner']);
  writeFileSync(join(lax, '.claude', 'settings.json'), '{"permissions": {},}\n');
  const warn = new RegExp(`^WARN: settings\\.json is left untouched, so the cleaner's two ask rules on remove --override are not added: ${CLEANER_ASK.map(r => r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(', ')}\\r?$`, 'm');
  const laxDry = install(repo, lax);
  passed(laxDry);
  assert.match(laxDry.stdout, warn, laxDry.out);
  const laxApply = install(repo, lax, { apply: true, extra: ['--rendered-hash', dryRunHash(laxDry)] });
  refused(laxApply, /^REFUSED: settings\.json is not a strict JSON object/m);
  assert.match(laxApply.stdout, warn, laxApply.out);
  assert.equal(readFileSync(join(lax, '.claude', 'settings.json'), 'utf8'), '{"permissions": {},}\n');
  // With the cleaner off, no such line.
  const off2 = homeWith(t, []);
  writeFileSync(join(off2, '.claude', 'settings.json'), '{"permissions": {},}\n');
  assert.doesNotMatch(install(repo, off2).stdout, /two ask rules/);
});

// #439 C4: a record from before `claude rm` joined the list, holding the sixteen git rules, gets the two added.
test('a sixteen-rule cleaner record gets the two claude rm rules on the next install', t => {
  const repo = makeRepo(t);
  const h = homeWith(t, ['cleaner']);
  const RM = ['Bash(claude rm *)', 'PowerShell(claude rm *)'];
  const sixteen = CLEANER_DENY.filter(r => !RM.includes(r));
  assert.equal(sixteen.length, 16);
  installed(repo, h);
  const rec = JSON.parse(readFileSync(join(h, '.pact', 'install.json'), 'utf8'));
  writeFileSync(join(h, '.pact', 'install.json'), `${JSON.stringify({ ...rec, entries: rec.entries.filter(e => !(e.key === 'permissions.deny' && RM.includes(e.value))) }, null, 2)}\n`);
  assert.deepEqual(recorded(h, 'permissions.deny'), sixteen, 'the planted record holds the sixteen');
  const live = JSON.parse(readFileSync(join(h, '.claude', 'settings.json'), 'utf8'));
  live.permissions.deny = sixteen;
  writeFileSync(join(h, '.claude', 'settings.json'), `${JSON.stringify(live)}\n`);
  const dry = install(repo, h);
  passed(dry);
  for (const r of RM) assert.ok(dry.stdout.includes(`  + permissions.deny: ${r}`), r);
  assert.equal(dry.stdout.split('\n').filter(l => l.includes('+ permissions.deny:')).length, 2, 'only the two are added');
  installed(repo, h);
  assert.deepEqual(JSON.parse(readFileSync(join(h, '.claude', 'settings.json'), 'utf8')).permissions.deny, [...CLEANER_DENY].sort());
  assert.deepEqual([...recorded(h, 'permissions.deny')].sort(), [...CLEANER_DENY].sort(), 'the record holds all eighteen');
});

/** A home folder whose configuration sets `tools` and, if given, the stop switch. */
function stopHome(t, tools, stop) {
  const h = home(t);
  mkdirSync(join(h, '.pact'), { recursive: true });
  setConfig(h, tools, stop);
  return h;
}
function setConfig(h, tools, stop) {
  const doc = { schema: 1, tools, ...(stop === undefined ? {} : { settings: { 'session-stop-deny': stop } }) };
  writeFileSync(join(h, '.pact', 'config.json'), `${JSON.stringify(doc)}\n`);
}

// #439 C1: the switch unset or false adds no claude stop rule, whatever the cleaner does.
test('session-stop-deny unset or false: no claude stop rule is added or recorded', t => {
  const repo = makeRepo(t);
  for (const stop of [undefined, false]) {
    const h = stopHome(t, ['cleaner'], stop);
    const dry = installed(repo, h);
    assert.ok(!dry.stdout.includes('claude stop'), 'the dry run shows no stop rule');
    const deny = JSON.parse(readFileSync(join(h, '.claude', 'settings.json'), 'utf8')).permissions.deny;
    assert.ok(deny.every(r => !STOP_DENY.includes(r)), 'settings.json holds no stop rule');
    assert.deepEqual(recorded(h, 'permissions.deny').filter(r => STOP_DENY.includes(r)), []);
  }
});

// #439 C2, C3: on, the install adds and records the eight rules; off removes only recorded ones on the list.
test('session-stop-deny on adds and records the eight rules; off removes only rules both recorded and fixed; the owner\'s identical rule stays', t => {
  const repo = makeRepo(t);
  const h = stopHome(t, [], true);
  const OWN = ['Bash(claude stop *)', 'Bash(rm -rf ./mine *)'];
  const FOREIGN = 'Bash(foreign *)';
  writeFileSync(join(h, '.claude', 'settings.json'), `${JSON.stringify({ permissions: { deny: OWN } })}\n`);
  const deny = () => JSON.parse(readFileSync(join(h, '.claude', 'settings.json'), 'utf8')).permissions.deny;
  const record = () => JSON.parse(readFileSync(join(h, '.pact', 'install.json'), 'utf8'));
  const added = STOP_DENY.filter(r => r !== OWN[0]);
  const denies = () => recorded(h, 'permissions.deny');

  const on = installed(repo, h);
  assert.deepEqual(added, STOP_DENY.slice(1));
  for (const r of added) assert.ok(on.stdout.includes(`  + permissions.deny: ${r}`), r);
  assert.ok(!on.stdout.includes('  + permissions.deny: Bash(claude stop *)'), 'a rule the owner already has is not added');
  assert.deepEqual(deny(), [...new Set([...OWN, ...STOP_DENY])].sort());
  // The cleaner is off, so the record's deny entries are the stop switch's alone.
  assert.deepEqual(denies(), added, 'an identical rule the owner wrote before is not recorded');
  installed(repo, h);
  assert.deepEqual(denies(), added, 'a second install keeps the record');

  // Two planted entries the record lists: a foreign rule, which stays in the live list and leaves the record, and one
  // of the cleaner's, which the record lists under the same key, so the cleaner's plan, off here, drops it.
  const r = record();
  r.entries.push(planted('permissions.deny', FOREIGN), planted('permissions.deny', CLEANER_DENY[0]));
  writeFileSync(join(h, '.pact', 'install.json'), `${JSON.stringify(r, null, 2)}\n`);
  addDeny(h, FOREIGN, CLEANER_DENY[0]);
  const kept = installed(repo, h);
  assert.deepEqual(denies(), added, 'an entry off the fixed list is never recorded again');
  assert.deepEqual(kept.stdout.split(/\r?\n/).filter(l => l.includes('- permissions.deny')), [`  - permissions.deny: ${CLEANER_DENY[0]}`], 'no stop rule is dropped while the switch is on, and no foreign rule ever');

  setConfig(h, [], false);
  const off = installed(repo, h);
  for (const x of added) assert.ok(off.stdout.includes(`  - permissions.deny: ${x}`), x);
  assert.ok(!off.stdout.includes(`- permissions.deny: ${FOREIGN}`), 'the foreign entry is not printed as dropped');
  assert.deepEqual(deny(), [OWN[0], FOREIGN, OWN[1]].sort());
  assert.deepEqual(denies(), []);
});

// #439 C3: each switch owns its own list; a rule of one planted in the other's record is never touched.
test('the stop plan and the cleaner plan each touch only their own fixed rules, with both switches on and off', t => {
  const repo = makeRepo(t);
  const h = stopHome(t, ['cleaner'], true);
  const deny = () => JSON.parse(readFileSync(join(h, '.claude', 'settings.json'), 'utf8')).permissions.deny;
  const record = () => JSON.parse(readFileSync(join(h, '.pact', 'install.json'), 'utf8'));
  const denies = () => recorded(h, 'permissions.deny');
  const bothOn = installed(repo, h);
  for (const r of STOP_DENY) assert.ok(bothOn.stdout.includes(`  + permissions.deny: ${r}`), r);
  assert.deepEqual([...deny()].sort(), [...CLEANER_DENY, ...STOP_DENY].sort());
  assert.deepEqual(denies(), [...CLEANER_DENY, ...STOP_DENY]);

  // The stop switch off drops the eight stop rules and leaves every cleaner rule.
  setConfig(h, ['cleaner'], false);
  installed(repo, h);
  assert.deepEqual([...deny()].sort(), [...CLEANER_DENY].sort());
  assert.deepEqual(denies(), [...CLEANER_DENY]);

  // The record lists both switches' rules under one key, each planted twice here: neither plan drops the other's.
  setConfig(h, ['cleaner'], true);
  installed(repo, h);
  const r = record();
  r.entries.push(planted('permissions.deny', STOP_DENY[0]), planted('permissions.deny', CLEANER_DENY[0]));
  writeFileSync(join(h, '.pact', 'install.json'), `${JSON.stringify(r, null, 2)}\n`);
  // Cleaner off, stop on: the cleaner's plan drops its own rules and leaves the stop rules planted in its record.
  setConfig(h, [], true);
  const cleanerOff = installed(repo, h);
  assert.deepEqual([...deny()].sort(), [...STOP_DENY].sort(), 'only the cleaner\'s own rules went');
  assert.ok(!cleanerOff.stdout.includes('- permissions.deny: Bash(claude stop *)'), 'a stop rule in the cleaner\'s record is not dropped');
  assert.deepEqual(denies(), [...STOP_DENY], 'the record holds the stop rules, and no cleaner rule');

  // Both off: each plan drops its own rules only.
  setConfig(h, [], false);
  installed(repo, h);
  assert.deepEqual(deny(), []);
  assert.deepEqual(denies(), []);
});

// #439 C7: a record whose stopDeny is not a list of strings refuses, as cleanerDeny does.
test('malformed settings entries in the record refuse', t => {
  const repo = makeRepo(t);
  const h = stopHome(t, [], true);
  installed(repo, h);
  const good = JSON.parse(readFileSync(join(h, '.pact', 'install.json'), 'utf8'));
  for (const bad of ['Bash(x)', ['Bash(x)', 5], { a: 1 }]) {
    writeFileSync(join(h, '.pact', 'install.json'), `${JSON.stringify({ ...good, entries: bad }, null, 2)}\n`);
    refused(install(repo, h), /^REFUSED: the install record's entries are not a list of settings entries/m);
  }
});

// #439 C8: with settings.json not strict JSON, the merge leaves it alone and the record keeps stopDeny.
// The apply refuses on such a file (the settings install tests cover that refusal), so the record is never rewritten there; the dry run plans no rule and the record stays byte for byte.
test('settings.json that is not strict JSON: the dry run plans no stop rule and the record\'s stopDeny stays as it was', t => {
  const repo = makeRepo(t);
  const h = stopHome(t, [], true);
  installed(repo, h);
  const recordFile = join(h, '.pact', 'install.json');
  const before = readFileSync(recordFile, 'utf8');
  assert.deepEqual(recorded(h, 'permissions.deny'), [...STOP_DENY]);
  const bad = '{ // a comment\n  "permissions": { "deny": [] }\n}\n';
  writeFileSync(join(h, '.claude', 'settings.json'), bad);
  setConfig(h, [], false);
  const dry = install(repo, h);
  passed(dry);
  assert.match(dry.stdout, /^WARN: settings\.json is not a strict JSON object/m, dry.out);
  assert.ok(!dry.stdout.includes('permissions.deny'), 'no rule is planned');
  refused(install(repo, h, { apply: true, extra: ['--rendered-hash', dryRunHash(dry)] }), /settings\.json is not a strict JSON object/);
  assert.equal(readFileSync(recordFile, 'utf8'), before, 'the record is untouched');
  assert.equal(readFileSync(join(h, '.claude', 'settings.json'), 'utf8'), bad, 'settings.json is untouched');
});

// ---------------------------------------------------------------- the agent-identity switch (#603, S7; C5, C8)

const APP = { app_id: 2000001, slug: 'example-owner-claude', bot_login: 'example-owner-claude[bot]', bot_id: 3000001 };
const PIN = `${JSON.stringify({ owner: { login: 'example-owner', id: 1000001 }, apps: { claude: APP } })}\n`;
const GH_APP_LIVE = ['.pact', 'tools', 'gh-app.mjs'];
const ENV_KEYS = ['GIT_CONFIG_GLOBAL', 'GIT_TERMINAL_PROMPT'];

/** The text setup writes for the claude app in this home folder, under the Node the install runs under. */
const gitconfigFor = h => identityGitconfigText({ userHome: h, nodePath: process.execPath, app: APP, xdg: existsSync(join(h, '.config', 'git', 'config')) });

/** A home folder whose configuration sets the identity switch, with setup's two files as asked: `pin` and `gitconfig` are the text to write, or null to leave the file out. */
function identityHome(t, on, { pin = PIN, gitconfig = gitconfigFor, tools = [], env } = {}) {
  const h = home(t);
  mkdirSync(join(h, '.pact'), { recursive: true });
  setIdentity(h, on, tools);
  if (pin !== null) writeFileSync(join(h, '.pact', 'github.json'), pin);
  const g = typeof gitconfig === 'function' ? gitconfig(h) : gitconfig;
  if (g !== null) writeFileSync(join(h, '.pact', 'gh-app-claude.gitconfig'), g);
  if (env !== undefined) writeFileSync(join(h, '.claude', 'settings.json'), `${JSON.stringify({ env })}\n`);
  return h;
}
function setIdentity(h, on, tools = []) {
  const doc = { schema: 1, tools, ...(on === undefined ? {} : { settings: { 'agent-identity': on } }) };
  writeFileSync(join(h, '.pact', 'config.json'), `${JSON.stringify(doc)}\n`);
}
const liveEnv = h => JSON.parse(readFileSync(join(h, '.claude', 'settings.json'), 'utf8')).env;
const recordOf = h => JSON.parse(readFileSync(join(h, '.pact', 'install.json'), 'utf8'));

// #603 C5: on, the dry run checks the gitconfig and warns, the install copies the helper, sets and records the two env keys beside the owner's own.
test('agent-identity on: the helper installs byte for byte, the two env keys are set and recorded beside the owner\'s, and the dry run says the gitconfig is as expected', t => {
  const repo = makeRepo(t);
  const h = identityHome(t, true, { env: { KEEP: 'mine' } });
  const dry = installed(repo, h);
  assert.match(dry.stdout, /^agent-identity: on\r?\n {2}gitconfig as expected: yes\r?$/m, dry.out);
  assert.match(dry.stdout, /^ {2}gh-app: on \(the agent-identity switch\)\r?$/m, dry.out);
  assert.match(dry.stdout, /^ {2}WARN: the agent-identity switch turns on the pact tool gh-app; it installs to \.pact\/tools\/gh-app\.mjs and mints GitHub App tokens/m, dry.out);
  assert.match(dry.stdout, /^ {2}set env\.GIT_CONFIG_GLOBAL \(the agent gitconfig\)\r?$/m, dry.out);
  assert.match(dry.stdout, /^ {2}set env\.GIT_TERMINAL_PROMPT = 0\r?$/m, dry.out);
  assert.deepEqual(readFileSync(join(h, ...GH_APP_LIVE)), readFileSync(join(repo, 'claude', 'tools', 'gh-app.mjs')));
  assert.deepEqual(liveEnv(h), { KEEP: 'mine', GIT_CONFIG_GLOBAL: `${h.replaceAll('\\', '/')}/.pact/gh-app-claude.gitconfig`, GIT_TERMINAL_PROMPT: '0' });
  assert.deepEqual(recordedEnv(h), { GIT_CONFIG_GLOBAL: liveEnv(h).GIT_CONFIG_GLOBAL, GIT_TERMINAL_PROMPT: '0' });
  assert.ok(recordOf(h).files.some(f => f.path === '.pact/tools/gh-app.mjs'), 'the record lists the tool');
  // A second install changes nothing.
  const again = installed(repo, h);
  assert.match(again.stdout, /^Nothing to do\.\r?$/m, again.out);
});

// #603 C5: off removes the tool and exactly the keys the install set, and a changed or missing gitconfig does not block turning it off.
test('agent-identity off: the tool and the two recorded env keys go, the owner\'s keys stay, and a missing gitconfig does not refuse', t => {
  const repo = makeRepo(t);
  const h = identityHome(t, true, { env: { KEEP: 'mine' } });
  installed(repo, h);
  setIdentity(h, false);
  rmSync(join(h, '.pact', 'gh-app-claude.gitconfig'));
  const dry = installed(repo, h);
  assert.match(dry.stdout, /^Delete: 1\r?\n {2}\.pact\/tools\/gh-app\.mjs\r?$/m, dry.out);
  assert.equal(total(dry, 'Delete'), 1, dry.out);
  assert.match(dry.stdout, /^ {2}- env\.GIT_CONFIG_GLOBAL\r?$/m, dry.out);
  assert.ok(!dry.stdout.includes('gitconfig as expected'), 'the check is skipped');
  assert.ok(!existsSync(join(h, ...GH_APP_LIVE)));
  assert.deepEqual(liveEnv(h), { KEEP: 'mine' });
  assert.deepEqual(recordedEnv(h), {});
});

// #603 C5: a key the owner changed after the install is theirs, so turning the switch off leaves it.
// A changed recorded entry is drift (spec 0007 S9), so the apply refuses and writes nothing.
test('agent-identity off leaves an env key the owner changed since the install', t => {
  const repo = makeRepo(t);
  const h = identityHome(t, true);
  installed(repo, h);
  const live = JSON.parse(readFileSync(join(h, '.claude', 'settings.json'), 'utf8'));
  live.env.GIT_CONFIG_GLOBAL = 'D:/mine';
  writeFileSync(join(h, '.claude', 'settings.json'), `${JSON.stringify(live)}\n`);
  setIdentity(h, false);
  const before = readFileSync(join(h, '.claude', 'settings.json'));
  const dry = install(repo, h);
  passed(dry);
  assert.match(dry.stdout, /^Drift: 1\r?\n {2}\.claude\/settings\.json env\.GIT_CONFIG_GLOBAL \(the pact's entry changed since the install\)\r?$/m, dry.out);
  assert.equal(total(dry, 'Drift'), 1, dry.out);
  refused(install(repo, h, { apply: true, extra: ['--rendered-hash', dryRunHash(dry)] }), /^REFUSED: live files changed since the last install\./m);
  assert.deepEqual(readFileSync(join(h, '.claude', 'settings.json')), before);
  assert.deepEqual(liveEnv(h), { GIT_CONFIG_GLOBAL: 'D:/mine', GIT_TERMINAL_PROMPT: '0' });
});

// #603 C8: unset or false, nothing of the switch lands: no tool, no env key, no record key, and no line in the dry run.
test('agent-identity unset or false: no helper, no env key, no record key, no identity line', t => {
  const repo = makeRepo(t);
  for (const on of [undefined, false]) {
    const h = identityHome(t, on, { pin: null, gitconfig: null });
    const dry = installed(repo, h);
    assert.ok(!existsSync(join(h, ...GH_APP_LIVE)));
    assert.ok(ENV_KEYS.every(k => !(k in (liveEnv(h) ?? {}))), 'no env key');
    assert.deepEqual(recordedEnv(h), {});
    assert.doesNotMatch(dry.stdout, /^agent-identity:|gitconfig as expected|gh-app/m, dry.out);
  }
});

// #603 C5: each way the switch's preconditions fail refuses, in the dry run and the apply, and changes nothing.
for (const row of [
  { id: 'no-pin', opts: { pin: null }, says: /\.pact\/github\.json holds no claude app; run gh-app\.mjs setup first/ },
  { id: 'pin-without-claude', opts: { pin: `${JSON.stringify({ owner: { login: 'o', id: 1 }, apps: {} })}\n` }, says: /holds no claude app/ },
  { id: 'pin-not-json', opts: { pin: '{' }, says: /holds no claude app/ },
  { id: 'no-gitconfig', opts: { gitconfig: null }, says: /gitconfig is missing; run gh-app\.mjs setup first/ },
  { id: 'other-node', opts: { gitconfig: h => gitconfigFor(h).replace(process.execPath.replaceAll('\\', '/'), '/usr/bin/other') }, says: /gitconfig as expected: no: node path differs, run gh-app.mjs refresh/ },
  { id: 'extra-include', opts: { gitconfig: h => gitconfigFor(h).replace('[user]', '  path = /elsewhere/config\n[user]') }, says: /gitconfig as expected: no: include list differs, run gh-app.mjs refresh/ },
  { id: 'other-line', opts: { gitconfig: h => `${gitconfigFor(h)}[core]\n  hooksPath = /x\n` }, says: /gitconfig as expected: no: other lines differ, run gh-app.mjs refresh/ },
  { id: 'owner-config-global', opts: { env: { GIT_CONFIG_GLOBAL: 'D:/mine' } }, says: /settings\.json already sets env GIT_CONFIG_GLOBAL/ },
  { id: 'owner-terminal-prompt', opts: { env: { GIT_TERMINAL_PROMPT: '1' } }, says: /settings\.json already sets env GIT_TERMINAL_PROMPT/ },
]) {
  test(`bad case: agent-identity on refuses with ${row.id}, in the dry run and the apply, and changes nothing`, t => {
    const repo = makeRepo(t);
    const h = identityHome(t, true, row.opts);
    const before = listTree(h);
    const dry = install(repo, h);
    refused(dry, row.says);
    refusedUnchanged(repo, h, row.says);
    assert.deepEqual(listTree(h), before);
  });
}

// #603 C5: a git config that appears under the user's XDG folder after setup is refused as a changed include list; setup run with it there passes.
test('agent-identity on: an XDG git config added after setup is refused, and one present at setup passes', t => {
  const repo = makeRepo(t);
  const h = identityHome(t, true);
  const xdg = join(h, '.config', 'git', 'config');
  mkdirSync(dirname(xdg), { recursive: true });
  writeFileSync(xdg, '[core]\n  autocrlf = false\n');
  const dry = install(repo, h);
  refused(dry, /gitconfig as expected: no: include list differs, run gh-app.mjs refresh/);
  writeFileSync(join(h, '.pact', 'gh-app-claude.gitconfig'), gitconfigFor(h));
  assert.match(gitconfigFor(h), /\.config\/git\/config/, 'the rewritten gitconfig includes the XDG file');
  passed(install(repo, h));
});

// #603 C5: the refusal text names the part that differs and prints no line of the file.
test('the gitconfig refusal prints only the fixed line, never a line of the file', t => {
  const repo = makeRepo(t);
  const h = identityHome(t, true, { gitconfig: hh => `${gitconfigFor(hh)}[core]\n  hooksPath = CANARY-LINE\n` });
  const r = install(repo, h);
  refused(r, /gitconfig as expected: no: other lines differ, run gh-app.mjs refresh/);
  assert.ok(!r.out.includes('CANARY-LINE'));
});

// #603 C5: a settings file that is not strict JSON is left untouched, and the dry run says the env keys are not set.
test('agent-identity on with a settings.json that is not strict JSON: the dry run warns, the apply refuses, and settings.json and the record are untouched', t => {
  const repo = makeRepo(t);
  const h = identityHome(t, true);
  const bad = '{ // a comment\n  "permissions": { "deny": [] }\n}\n';
  writeFileSync(join(h, '.claude', 'settings.json'), bad);
  const dry = install(repo, h);
  passed(dry);
  assert.match(dry.stdout, /^WARN: settings\.json is left untouched, so the agent-identity switch's two env keys are not set/m, dry.out);
  refused(install(repo, h, { apply: true, extra: ['--rendered-hash', dryRunHash(dry)] }), /settings\.json is not a strict JSON object/);
  assert.equal(readFileSync(join(h, '.claude', 'settings.json'), 'utf8'), bad, 'settings.json is untouched');
  assert.ok(!existsSync(join(h, '.pact', 'install.json')), 'no record is written');
});
