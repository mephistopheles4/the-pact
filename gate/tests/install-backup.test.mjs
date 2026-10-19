// The install's backups end to end (#272, S7 to S9): what an apply copies
// before its first write, the copy-back that undoes it, the refusals a test
// can set up from outside, the modes, the output and the bootstrap's lines.
// Each other refusal the backup step raises itself is a case in the file
// system module's tests, with its file operations injected.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { git, home, install, makeRepo, nodeEnv, passed, refused, spawnNodeInstallAsync, WIN } from './install-harness.mjs';
import { plainAgent } from './text.mjs';
import { writeTree } from './tree.mjs';

const NAME = /^\d{8}T\d{9}Z-[0-9a-f]{7}(-\d{2})?$/;
const STAGING_LEFT = /pact\/backups may hold a staging folder with a copy of your settings/;
const backupsDir = h => join(h, 'pact', 'backups');
const backups = h => (existsSync(backupsDir(h)) ? readdirSync(backupsDir(h)).sort() : []);
const manifestOf = (h, name) => JSON.parse(readFileSync(join(backupsDir(h), name, 'manifest.json'), 'utf8'));

/** A file in `root` with its one `from` replaced by `to`. */
function edit(root, rel, from, to) {
  const p = join(root, ...rel.split('/'));
  const s = readFileSync(p, 'utf8');
  assert.equal(s.split(from).length, 2, `${rel} holds the plant's target once`);
  writeFileSync(p, s.replace(from, () => to));
}

/** Every file under `h` with its bytes, leaving out pact/backups; folders, empty or not, are not listed (C2). */
function files(h, rel = '') {
  const out = [];
  for (const d of readdirSync(join(h, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${d.name}` : d.name;
    if (r === 'pact/backups') continue;
    if (d.isDirectory()) out.push(...files(h, r));
    else out.push(`${r} ${readFileSync(join(h, r)).toString('base64')}`);
  }
  return out.sort();
}

/** The documented copy-back: each copied file put back, each added path deleted. */
function copyBack(h, name) {
  for (const e of manifestOf(h, name).entries) {
    const live = join(h, ...e.path.split('/'));
    if (e.was === 'file') {
      mkdirSync(dirname(live), { recursive: true });
      copyFileSync(join(backupsDir(h), name, ...e.path.split('/')), live);
    } else rmSync(live, { force: true });
  }
}

/** A home that holds the person's own rules file, settings and agent, as before a first install. */
function ownHome(t) {
  const h = home(t);
  writeTree(h, { 'CLAUDE.md': 'my own rules\n', 'settings.json': '{"env": {"K": "v"}}\n', 'agents/my-own.md': plainAgent('my-own') });
  return h;
}

test('#272 C1: an apply first copies what it replaces into a dated backup, whose manifest lists each added path', t => {
  const repo = makeRepo(t);
  const h = ownHome(t);
  passed(install(repo, h, { apply: true }));
  const commit = git(repo, 'rev-parse', 'HEAD').trim();
  const [first] = backups(h);
  assert.equal(backups(h).length, 1);
  assert.match(first, NAME);
  assert.ok(first.endsWith(`-${commit.slice(0, 7)}`), first);
  assert.equal(readFileSync(join(backupsDir(h), first, 'CLAUDE.md'), 'utf8'), 'my own rules\n');
  assert.equal(readFileSync(join(backupsDir(h), first, 'settings.json'), 'utf8'), '{"env": {"K": "v"}}\n');
  const m = manifestOf(h, first);
  assert.deepEqual(Object.keys(m), ['format', 'commit', 'created', 'entries']);
  assert.equal(m.format, 'pact-backup-1');
  assert.equal(m.commit, commit);
  const paths = m.entries.map(e => e.path);
  assert.deepEqual(paths, [...paths].sort());
  assert.deepEqual(m.entries.find(e => e.path === 'CLAUDE.md'), { path: 'CLAUDE.md', was: 'file', sha256: createHash('sha256').update('my own rules\n').digest('hex'), bytes: 13 });
  assert.deepEqual(m.entries.find(e => e.path === '.pact-install.json'), { path: '.pact-install.json', was: 'absent' });
  const record = JSON.parse(readFileSync(join(h, '.pact-install.json'), 'utf8'));
  for (const f of record.files.filter(f => f.path !== 'CLAUDE.md')) assert.deepEqual(m.entries.find(e => e.path === f.path), { path: f.path, was: 'absent' }, f.path);
  assert.ok(!paths.includes('agents/my-own.md'), "the person's own agent is not the apply's to copy");
  // A later apply copies the record, and an overwritten pact file; settings.json only when the apply writes it.
  writeFileSync(join(repo, 'claude', 'agents', 'scout.md'), `${readFileSync(join(repo, 'claude', 'agents', 'scout.md'), 'utf8')}A changed line.\n`);
  git(repo, 'commit', '-qam', 'change scout');
  const scoutBefore = readFileSync(join(h, 'agents', 'scout.md'));
  const recordBefore = readFileSync(join(h, '.pact-install.json'));
  passed(install(repo, h, { apply: true }));
  const second = backups(h).find(n => n !== first);
  assert.deepEqual(readFileSync(join(backupsDir(h), second, 'agents', 'scout.md')), scoutBefore);
  assert.deepEqual(readFileSync(join(backupsDir(h), second, '.pact-install.json')), recordBefore);
  assert.ok(!manifestOf(h, second).entries.some(e => e.path === 'settings.json'), 'settings.json is copied only when the apply writes it');
});

test('#272 C2: copying a backup back by its manifest returns the home folder to its files before the apply', t => {
  const repo = makeRepo(t);
  const h = ownHome(t);
  const before = files(h);
  passed(install(repo, h, { apply: true }));
  assert.notDeepEqual(files(h), before);
  copyBack(h, backups(h)[0]);
  assert.deepEqual(files(h), before);
});

test('#272 C4: a staging folder an earlier apply left refuses --apply before any install write', t => {
  const repo = makeRepo(t);
  const h = ownHome(t);
  mkdirSync(join(backupsDir(h), '.staging-left'), { recursive: true });
  const before = files(h);
  refused(install(repo, h, { apply: true }), /^REFUSED: pact\/backups holds 1 staging folder.* Nothing was changed\.$/m);
  assert.deepEqual(files(h), before);
  assert.deepEqual(backups(h), ['.staging-left']);
});

test('#272 C5: a live file changed while the install ran refuses before any install write', t => {
  const repo = makeRepo(t, root => edit(root, 'gate/install-run.mjs', '// @@TEST-BACKUP-HOOK@@', "writeFileSync(join(home, 'CLAUDE.md'), 'changed during the run\\n');"));
  const h = ownHome(t);
  const r = install(repo, h, { apply: true });
  refused(r, /^REFUSED: CLAUDE\.md changed while the install ran.* Nothing was changed\.$/m);
  assert.equal(readFileSync(join(h, 'CLAUDE.md'), 'utf8'), 'changed during the run\n');
  assert.ok(!existsSync(join(h, '.pact-install.json')), 'nothing was installed');
  assert.deepEqual(backups(h), []);
});

test('#272 C6: on Linux and macOS the backup folders are 0700 and its files 0600', t => {
  if (WIN) return t.skip('Windows sets no mode bits; a backup takes its folder\'s access list (R47)');
  const repo = makeRepo(t);
  const h = ownHome(t);
  passed(install(repo, h, { apply: true }));
  writeFileSync(join(repo, 'claude', 'agents', 'scout.md'), `${readFileSync(join(repo, 'claude', 'agents', 'scout.md'), 'utf8')}A changed line.\n`);
  git(repo, 'commit', '-qam', 'change scout');
  passed(install(repo, h, { apply: true }));
  const walk = rel => {
    const p = join(backupsDir(h), rel);
    const st = statSync(p);
    assert.equal(st.mode & 0o777, st.isDirectory() ? 0o700 : 0o600, rel || 'pact/backups');
    if (st.isDirectory()) for (const n of readdirSync(p)) walk(rel ? `${rel}/${n}` : n);
  };
  walk('');
  assert.ok(backups(h).some(n => existsSync(join(backupsDir(h), n, 'agents', 'scout.md'))), 'a backup holds a subfolder');
});

test('#272 C9: the dry run and the apply say what the backup takes, and a refusal after the first write names it', t => {
  const repo = makeRepo(t);
  const h = home(t);
  writeFileSync(join(h, 'settings.json'), '{}\n');
  const dry = install(repo, h);
  passed(dry);
  assert.match(dry.stdout, /^settings\.json: would be merged\n(?:.*\n)*?Backup: 1 file\(s\) to copy into pact\/backups\/ before the first write \(settings\.json included\)$/m);
  const applyLine = dry.stdout.split('\n').find(l => l.includes(' --apply --commit '));
  mkdirSync(join(backupsDir(h), `.staging-x${String.fromCharCode(0x200b)}y`), { recursive: true });
  const warned = install(repo, h);
  passed(warned);
  assert.match(warned.stdout, /^WARN: pact\/backups holds 1 leftover staging folder\(s\) \(\.staging-x\?y\); each may hold a copy of your settings\. Check and delete them; --apply refuses while they are there\.$/m);
  assert.equal(warned.stdout.split('\n').find(l => l.includes(' --apply --commit ')), applyLine, 'the apply command does not change');
  rmSync(backupsDir(h), { recursive: true });
  // An entry the prune does not recognise is counted, and a pact/backups that is not a folder warns and refuses.
  mkdirSync(join(backupsDir(h), 'mine'), { recursive: true });
  assert.match(install(repo, h).stdout, /^WARN: pact\/backups holds 1 entry\(ies\) the install does not recognise as backups; the prune leaves them as they are, and they may hold copies of your settings\.$/m);
  rmSync(backupsDir(h), { recursive: true });
  writeFileSync(backupsDir(h), 'not a folder\n');
  const blocked = install(repo, h);
  passed(blocked);
  assert.match(blocked.stdout, /^WARN: pact\/backups is not a plain folder: a link, a file or another reparse point; --apply refuses until it is moved out of the way\.$/m);
  refused(install(repo, h, { apply: true }), /^REFUSED: pact\/backups, on the backup's path, is a link, another reparse point or not what the backup expects; .* Nothing was changed\.$/m);
  rmSync(backupsDir(h));
  const r = install(repo, h, { apply: true });
  passed(r);
  const lines = r.stdout.split('\n');
  const name = backups(h)[0];
  const at = s => lines.indexOf(s);
  assert.ok(at('BACKUP STARTED') >= 0 && at('BACKUP STARTED') < at(`backed up 1 file(s) to pact/backups/${name}`) && at(`backed up 1 file(s) to pact/backups/${name}`) < at('Applying.'), r.out);
  // With nothing to merge, settings.json is not copied, and the line says so by leaving the note off.
  assert.match(install(repo, h).stdout, /^Backup: 1 file\(s\) to copy into pact\/backups\/ before the first write$/m);
  const broken = makeRepo(t, root => edit(root, 'gate/install-run.mjs', "  say('Applying.');\n  for", "  say('Applying.');\n  throw new Error('planted');\n  for"));
  const h2 = ownHome(t);
  const after = install(broken, h2, { apply: true });
  refused(after, new RegExp(`^REFUSED: the install failed while it ran\\. The Claude home folder may hold part of this install\\. The files it replaced are in pact/backups/${backups(h2)[0]}; see Undo an apply in docs/install\\.md\\.$`, 'm'));
});

test('#272 C7: a refused apply prunes nothing, and the next verified apply prunes past the ten newest', t => {
  const h = ownHome(t);
  const old = Array.from({ length: 12 }, (_, i) => `2025${String(i + 101).padStart(4, '0')}T000000000Z-bbbbbbb`);
  for (const name of old) {
    mkdirSync(join(backupsDir(h), name), { recursive: true });
    writeFileSync(join(backupsDir(h), name, 'manifest.json'), `${JSON.stringify({ format: 'pact-backup-1', commit: 'b'.repeat(40), created: '', entries: [{ path: '.pact-install.json', was: 'file', sha256: 'f'.repeat(64), bytes: 1 }] })}\n`);
  }
  const broken = makeRepo(t, root => edit(root, 'gate/install-run.mjs', "  say('Applying.');\n  for", "  say('Applying.');\n  throw new Error('planted');\n  for"));
  refused(install(broken, h, { apply: true }));
  assert.equal(backups(h).length, 13, 'the refused apply took its backup and pruned nothing');
  const r = install(makeRepo(t), h, { apply: true });
  passed(r);
  // Both new backups were taken with no record before them (q8); the ten newest are those two and eight of the old.
  assert.deepEqual(backups(h).filter(n => old.includes(n)), old.slice(4));
  assert.match(r.stdout, new RegExp(`^pruned 4 old backup\\(s\\)\\n${old.slice(0, 4).map(n => `  ${n}`).join('\\n')}$`, 'm'));
});

// The four ways a run can end between BACKUP STARTED and CHECKS DONE (S9),
// each planted in the backup's started hook and committed, so the apply
// reaches it.
test('#272 C17: a run that ends after BACKUP STARTED, other than by the backup\'s own refusal, names the staging folder', async t => {
  const at = (plant, more) =>
    makeRepo(t, root => {
      edit(root, 'gate/install-run.mjs', '// @@TEST-BACKUP-STARTED-HOOK@@', plant);
      if (more) more(root);
    });
  const ended = (r, says) => {
    refused(r, says);
    assert.match(r.stdout, STAGING_LEFT, r.out);
    assert.doesNotMatch(r.stdout, /Nothing was changed\./, r.out);
  };
  ended(install(at("throw new Error('planted');"), ownHome(t), { apply: true }), /^REFUSED: the install failed while it ran\. /m);
  ended(install(at('process.exit(3);'), ownHome(t), { apply: true }), /^REFUSED: the install runner did not end with a pass\. /m);
  ended(install(at('for (;;) {}', root => edit(root, 'gate/install.mjs', 'const LIMIT_MS = 300000;', 'const LIMIT_MS = 20000;')), ownHome(t), { apply: true }), /^REFUSED: the install's checks did not finish within 20 s\. /m);
  if (WIN) return t.diagnostic('the signal case runs on Linux only: a console signal cannot be sent to one process on Windows');
  const repo = at('for (;;) {}');
  const p = spawnNodeInstallAsync([join(repo, 'gate', 'install.mjs'), '--claude-home', ownHome(t), '--apply', '--commit', git(repo, 'rev-parse', 'HEAD').trim()], { cwd: repo, env: nodeEnv() });
  let out = '';
  p.stdout.on('data', d => (out += d));
  for (let i = 0; i < 1200 && !out.includes('BACKUP STARTED'); i++) await new Promise(r => setTimeout(r, 50));
  assert.ok(out.includes('BACKUP STARTED'), out);
  const code = await new Promise(r => {
    p.on('close', r);
    p.kill('SIGTERM');
  });
  ended({ code, stdout: out, out }, /^REFUSED: the install was stopped by a signal\. /m);
});
