// The user configuration file through the install script (#53, slice 3), end
// to end against a throwaway repo and a throwaway -ClaudeHome. Never touches
// ~/.claude.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { PWSH, WIN, home, install, listTree, makeRepo, refused } from './install-harness.mjs';
import { REPO, tempDir, withoutOpenMarks } from './helpers.mjs';

const CONFIG_REL = ['pact', 'config.json'];
const EXAMPLE = readFileSync(join(REPO, 'examples', 'pact-config', 'config.json'));

const sha256 = b => createHash('sha256').update(b).digest('hex');
const digestOf = bytes => sha256(`user ${sha256(bytes)}\n`).slice(0, 12);

/** The user configuration file's path under the Claude home `h`, with its folder made. */
function configPath(h) {
  mkdirSync(join(h, 'pact'), { recursive: true });
  return join(h, ...CONFIG_REL);
}

// ------------------------------------------------------------ fail-closed "no file"

test('bad case: a configuration path that is a folder refuses, and -Apply writes nothing', t => {
  const repo = makeRepo(t);
  const h = home(t);
  mkdirSync(configPath(h));
  const r = install(repo, h, { apply: true });
  refused(r);
  assert.match(r.stdout, /^render\| FAIL config-file: pact\/config\.json: the user configuration file is not a regular file\r?$/m, r.out);
  assert.ok(!listTree(h).includes('CLAUDE.md'), listTree(h).join('\n'));
});

test('bad case: a configuration path that is a dangling link refuses, and -Apply writes nothing', t => {
  const repo = makeRepo(t);
  const h = home(t);
  // A junction to a folder that does not exist: plantable on Windows without
  // the symlink privilege, and a dangling link to Node and to the attribute test.
  symlinkSync(join(tempDir(t), 'gone'), configPath(h), 'junction');
  const r = install(repo, h, { apply: true });
  refused(r);
  // The install's own attribute test refuses it, before the renderer runs.
  assert.match(r.stdout, /^REFUSED: the user configuration file, or the pact folder that holds it, is a link or other reparse point\./m, r.out);
  assert.doesNotMatch(r.stdout, /^render\| /m, r.out);
  assert.ok(!listTree(h).includes('CLAUDE.md'), listTree(h).join('\n'));
});

/** Make `p` unreadable to this user; returns a function that undoes it, or null when it can't be planted. */
function denyRead(p) {
  if (WIN) {
    const deny = spawnSync('icacls', [p, '/deny', '*S-1-1-0:(R)'], { encoding: 'utf8' });
    if (deny.status !== 0) return null;
    return () => spawnSync('icacls', [p, '/remove:d', '*S-1-1-0'], { encoding: 'utf8' });
  }
  chmodSync(p, 0o000);
  try {
    readFileSync(p);
    chmodSync(p, 0o600);
    return null; // still readable (root): can't be planted here
  } catch {
    return () => chmodSync(p, 0o600);
  }
}

test('bad case: an unreadable configuration file refuses, and -Apply writes nothing', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const p = configPath(h);
  writeFileSync(p, '{"schema": 1, "settings": {"usage-pause": 90}}\n');
  const undo = denyRead(p);
  if (!undo) {
    t.skip('cannot make a file unreadable here (not run)');
    return;
  }
  let r;
  try {
    assert.throws(() => readFileSync(p), 'the planted file is still readable, so the test would pass for the wrong reason');
    r = install(repo, h, { apply: true });
  } finally {
    undo();
  }
  refused(r);
  assert.match(r.stdout, /^render\| FAIL config-file: pact\/config\.json: /m, r.out);
  assert.ok(!listTree(h).includes('CLAUDE.md'), listTree(h).join('\n'));
});

// ------------------------------------------------------------ a configured install, bound to its dry run

/** The rules file a configuration with usage-pause `value` should install, built here from the repo's source. */
function expectedRules(repo, bytes, value) {
  let s = readFileSync(join(repo, 'claude', 'CLAUDE.md'), 'utf8');
  const usage = 'the weekly limit is above 75%, wait for my go-ahead.';
  assert.equal(s.split(usage).length, 2);
  s = s.replace(usage, `the weekly limit is above ${value}%, wait for my go-ahead.`);
  const slot = '<!-- pact:begin config-notice -->\n';
  assert.equal(s.split(slot).length, 2);
  s = s.replace(
    slot,
    `${slot}\n**Configuration in effect.** This file was rendered with the configuration \`${digestOf(bytes)}\`.\nValues set: usage-pause ${value}. Parts edited: none.\n`,
  );
  return Buffer.from(withoutOpenMarks(s));
}

/** The full rendered hash a dry run printed in its Configuration block. */
function dryRunHash(r) {
  const m = /^ {2}rendered rules file: sha256 ([0-9a-f]{64})\r?$/m.exec(r.stdout);
  assert.ok(m, r.out);
  return m[1];
}

/** Nothing of the install was written: no rules file, no record, no agents. */
function nothingWritten(h) {
  const tree = listTree(h);
  assert.ok(!tree.some(f => f === 'CLAUDE.md' || f === '.pact-install.json' || f.startsWith('agents')), tree.join('\n'));
}

test('the shipped example installs: the dry run shows it, -Apply with the full rendered hash installs 90% with the notice, and the record names it', t => {
  const repo = makeRepo(t);
  const h = home(t);
  writeFileSync(configPath(h), EXAMPLE);
  const want = expectedRules(repo, EXAMPLE, 90);

  const dry = install(repo, h);
  assert.equal(dry.code, 0, dry.out);
  const lines = dry.stdout.replaceAll('\r\n', '\n').split('\n');
  const c = lines.indexOf('Configuration:');
  assert.deepEqual(lines.slice(c + 1, c + 7), [
    `  user file pact/config.json: sha256 ${sha256(EXAMPLE)}, no install recorded`,
    `  configuration digest: ${digestOf(EXAMPLE)}`,
    `  rendered rules file: sha256 ${sha256(want)}`,
    '  WARN: the user configuration sets usage-pause to 90.',
    '  Open text is checked for form, imports, routing and the roster, not for meaning.',
    'Working tree: clean',
  ]);
  assert.ok(c < lines.findIndex(l => /^Gate: /.test(l)), dry.out);
  assert.match(dry.stdout, new RegExp(`^Dry run only\\. After the owner's go-ahead, pass -Apply -RenderedHash ${sha256(want)}\\r?$`, 'm'), dry.out);

  const r = install(repo, h, { apply: true, extra: ['-RenderedHash', dryRunHash(dry)] });
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(readFileSync(join(h, 'CLAUDE.md')), want);
  const text = readFileSync(join(h, 'CLAUDE.md'), 'utf8');
  assert.ok(text.includes('the weekly limit is above 90%') && !text.includes('above 75%'));
  const manifest = JSON.parse(readFileSync(join(h, '.pact-install.json'), 'utf8'));
  assert.equal(manifest.digest, digestOf(EXAMPLE));
  assert.deepEqual(manifest.config, [{ kind: 'user', sha256: sha256(EXAMPLE) }]);
  assert.equal(manifest.files.find(f => f.path === 'CLAUDE.md').sha256, sha256(want));
  assert.match(r.stdout, new RegExp(`^Installed commit [0-9a-f]{40} with configuration ${digestOf(EXAMPLE)}; all files verified\\.\\r?$`, 'm'), r.out);
  assert.deepEqual(readFileSync(configPath(h)), EXAMPLE, 'the install never writes the user file');

  const again = install(repo, h);
  assert.equal(again.code, 0, again.out);
  assert.match(again.stdout, new RegExp(`^ {2}user file pact/config\\.json: sha256 ${sha256(EXAMPLE)}, unchanged since the last install\\r?$`, 'm'), again.out);
  assert.match(again.stdout, new RegExp(`^Last install: [0-9a-f]{40} with configuration ${digestOf(EXAMPLE)}\\r?$`, 'm'), again.out);
  assert.match(again.stdout, /^Nothing to do\.\r?$/m, again.out);
});

test('with no configuration file the install is as in slice 2: the notice slot stays empty, and the record names no configuration', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const r = install(repo, h, { apply: true });
  assert.equal(r.code, 0, r.out);
  const rendered = Buffer.from(withoutOpenMarks(readFileSync(join(repo, 'claude', 'CLAUDE.md'), 'utf8')));
  assert.deepEqual(readFileSync(join(h, 'CLAUDE.md')), rendered);
  assert.ok(!rendered.toString('utf8').includes('Configuration in effect'));
  const manifest = JSON.parse(readFileSync(join(h, '.pact-install.json'), 'utf8'));
  assert.equal(manifest.digest, null);
  assert.deepEqual(manifest.config, []);
  assert.match(r.stdout, /^Installed commit [0-9a-f]{40} with no configuration; all files verified\.\r?$/m, r.out);
});

test('with no configuration, a matching hash is accepted: a hash given is compared, not required', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const rendered = Buffer.from(withoutOpenMarks(readFileSync(join(repo, 'claude', 'CLAUDE.md'), 'utf8')));
  const r = install(repo, h, { apply: true, extra: ['-RenderedHash', sha256(rendered)] });
  assert.equal(r.code, 0, r.out);
});

test('a configuration changed since the last install is shown as changed, and the install is not "nothing to do"', t => {
  const repo = makeRepo(t);
  const h = home(t);
  writeFileSync(configPath(h), EXAMPLE);
  assert.equal(install(repo, h, { apply: true, extra: ['-RenderedHash', dryRunHash(install(repo, h))] }).code, 0);
  const next = Buffer.from('{"schema": 1, "settings": {"usage-pause": 80}}\n');
  writeFileSync(configPath(h), next);
  const r = install(repo, h);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, new RegExp(`^ {2}user file pact/config\\.json: sha256 ${sha256(next)}, CHANGED since the last install\\r?$`, 'm'), r.out);
  assert.match(r.stdout, /^ {2}WARN: the user configuration sets usage-pause to 80\.\r?$/m, r.out);
  assert.doesNotMatch(r.stdout, /usage-pause to 90/, r.out);
  assert.match(r.stdout, /^Overwrite: 1\r?$/m, r.out);
  assert.doesNotMatch(r.stdout, /^Nothing to do/m, r.out);
});

test('a record that names another configuration hash is stale: the dry run says changed, and not "nothing to do"', t => {
  const repo = makeRepo(t);
  const h = home(t);
  writeFileSync(configPath(h), EXAMPLE);
  assert.equal(install(repo, h, { apply: true, extra: ['-RenderedHash', dryRunHash(install(repo, h))] }).code, 0);
  // Only the record changes: the render, and so every installed file, stays the same.
  const mf = join(h, '.pact-install.json');
  const m = JSON.parse(readFileSync(mf, 'utf8'));
  m.config[0].sha256 = 'b'.repeat(64);
  writeFileSync(mf, JSON.stringify(m));
  const r = install(repo, h);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^Overwrite: 0\r?$/m, r.out);
  assert.match(r.stdout, /, CHANGED since the last install\r?$/m, r.out);
  assert.doesNotMatch(r.stdout, /^Nothing to do/m, r.out);
});

test('after a no-configuration install, the dry run says so, and a new file is "new since the last install"', t => {
  const repo = makeRepo(t);
  const h = home(t);
  assert.equal(install(repo, h, { apply: true }).code, 0);
  writeFileSync(configPath(h), EXAMPLE);
  const r = install(repo, h);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^Last install: [0-9a-f]{40} with no configuration\r?$/m, r.out);
  assert.match(r.stdout, new RegExp(`^ {2}user file pact/config\\.json: sha256 ${sha256(EXAMPLE)}, new since the last install\\r?$`, 'm'), r.out);
});
test('a configuration removed since the last install is named in the dry run', t => {
  const repo = makeRepo(t);
  const h = home(t);
  writeFileSync(configPath(h), EXAMPLE);
  assert.equal(install(repo, h, { apply: true, extra: ['-RenderedHash', dryRunHash(install(repo, h))] }).code, 0);
  rmSync(configPath(h));
  const r = install(repo, h);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^ {2}no configuration\r?\n {2}the last install had a configuration; this install removes it from the rules file\r?$/m, r.out);
  assert.doesNotMatch(r.stdout, /^Nothing to do/m, r.out);
});

// The -Apply binding's bad cases. Each refuses with nothing of the install written.
const BINDING = 'the hash given with -RenderedHash is not the full hash of the rules file this run rendered';
const NEEDS_HASH = 'a configuration applies, so -Apply needs the full rendered hash the dry run showed';

test('bad case: -Apply with a wrong hash refuses', t => {
  const repo = makeRepo(t);
  const h = home(t);
  writeFileSync(configPath(h), EXAMPLE);
  const r = install(repo, h, { apply: true, extra: ['-RenderedHash', 'a'.repeat(64)] });
  refused(r);
  assert.match(r.stdout, new RegExp(`^REFUSED: ${BINDING}`, 'm'), r.out);
  nothingWritten(h);
});

for (const [label, cut] of [
  ['the first 63 characters', h => h.slice(0, 63)],
  ['the 12-character digest length', h => h.slice(0, 12)],
  ['the hash in capitals', h => h.toUpperCase()],
  ['the hash with a trailing space', h => `${h} `],
]) {
  test(`bad case: -Apply with ${label} of the hash refuses`, t => {
    const repo = makeRepo(t);
    const h = home(t);
    writeFileSync(configPath(h), EXAMPLE);
    const good = dryRunHash(install(repo, h));
    const r = install(repo, h, { apply: true, extra: ['-RenderedHash', cut(good)] });
    refused(r);
    assert.match(r.stdout, new RegExp(`^REFUSED: ${BINDING}`, 'm'), r.out);
    nothingWritten(h);
  });
}

test('bad case: -Apply with no hash refuses when a configuration applies', t => {
  const repo = makeRepo(t);
  const h = home(t);
  writeFileSync(configPath(h), EXAMPLE);
  const r = install(repo, h, { apply: true });
  refused(r);
  assert.match(r.stdout, new RegExp(`^REFUSED: ${NEEDS_HASH}`, 'm'), r.out);
  nothingWritten(h);
});

test('bad case: -Apply with an empty hash refuses: a hash given is compared even when empty', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const r = install(repo, h, { apply: true, extra: ['-RenderedHash', ''] });
  refused(r);
  assert.match(r.stdout, new RegExp(`^REFUSED: ${BINDING}`, 'm'), r.out);
  nothingWritten(h);
});

test('bad case: a configuration that appears after a no-configuration dry run refuses -Apply given no hash', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const dry = install(repo, h);
  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.stdout, /^ {2}no configuration\r?$/m, dry.out);
  writeFileSync(configPath(h), EXAMPLE);
  const r = install(repo, h, { apply: true });
  refused(r);
  assert.match(r.stdout, new RegExp(`^REFUSED: ${NEEDS_HASH}`, 'm'), r.out);
  nothingWritten(h);
});

test('bad case: a configuration deleted after a configured dry run refuses -Apply given its hash', t => {
  const repo = makeRepo(t);
  const h = home(t);
  writeFileSync(configPath(h), EXAMPLE);
  const hash = dryRunHash(install(repo, h));
  rmSync(configPath(h));
  const r = install(repo, h, { apply: true, extra: ['-RenderedHash', hash] });
  refused(r);
  assert.match(r.stdout, /^render\| CONFIG none\r?$/m, r.out);
  assert.match(r.stdout, new RegExp(`^REFUSED: ${BINDING}`, 'm'), r.out);
  nothingWritten(h);
});

test('bad case: a configuration changed between the dry run and -Apply refuses', t => {
  const repo = makeRepo(t);
  const h = home(t);
  writeFileSync(configPath(h), EXAMPLE);
  const hash = dryRunHash(install(repo, h));
  writeFileSync(configPath(h), '{"schema": 1, "settings": {"usage-pause": 100}}\n');
  const r = install(repo, h, { apply: true, extra: ['-RenderedHash', hash] });
  refused(r);
  assert.match(r.stdout, new RegExp(`^REFUSED: ${BINDING}`, 'm'), r.out);
  nothingWritten(h);
});

test('bad case: a wrong hash refuses a dry run too', t => {
  const repo = makeRepo(t);
  const h = home(t);
  writeFileSync(configPath(h), EXAMPLE);
  const r = install(repo, h, { extra: ['-RenderedHash', '0'.repeat(64)] });
  refused(r);
  assert.match(r.stdout, new RegExp(`^REFUSED: ${BINDING}`, 'm'), r.out);
});

test('bad case: a refused configuration changes nothing on disk under -Apply, and names only the setting', t => {
  const repo = makeRepo(t);
  const h = home(t);
  writeFileSync(configPath(h), '{"schema": 1, "settings": {"usage-pause": 101}}\n');
  const r = install(repo, h, { apply: true, extra: ['-RenderedHash', 'a'.repeat(64)] });
  refused(r);
  assert.match(r.stdout, /^render\| FAIL config-value: pact\/config\.json: usage-pause must be a whole number from 0 to 100\r?$/m, r.out);
  assert.match(r.stdout, /^REFUSED: the renderer exited with code 1\./m, r.out);
  nothingWritten(h);
});

// ------------------------------------------------------------ the reparse-attribute test, before the renderer

test('bad case: a pact folder that is a link refuses before the renderer runs', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const elsewhere = tempDir(t);
  writeFileSync(join(elsewhere, 'config.json'), EXAMPLE);
  symlinkSync(elsewhere, join(h, 'pact'), 'junction');
  const r = install(repo, h, { apply: true });
  refused(r);
  assert.match(r.stdout, /^REFUSED: the user configuration file, or the pact folder that holds it, is a link or other reparse point\./m, r.out);
  assert.doesNotMatch(r.stdout, /^render\| /m, r.out);
  nothingWritten(h);
});

test('bad case: a blocks folder that is a link refuses before the renderer runs', t => {
  const repo = makeRepo(t);
  const h = home(t);
  mkdirSync(join(h, 'pact'));
  symlinkSync(tempDir(t), join(h, 'pact', 'blocks'), 'junction');
  const r = install(repo, h);
  refused(r);
  assert.match(r.stdout, /^REFUSED: the configuration blocks folder is a link or other reparse point\./m, r.out);
  assert.doesNotMatch(r.stdout, /^render\| /m, r.out);
});

test('bad case: a link deep in the blocks folder, under a hidden name, refuses before the renderer runs', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const deep = join(h, 'pact', 'blocks', 'sub', '.hidden');
  mkdirSync(deep, { recursive: true });
  if (WIN) spawnSync('attrib', ['+h', deep]);
  symlinkSync(tempDir(t), join(deep, 'link'), 'junction');
  const r = install(repo, h);
  refused(r);
  assert.match(r.stdout, /^REFUSED: the configuration blocks folder holds a link or other reparse point\./m, r.out);
  assert.doesNotMatch(r.stdout, /^render\| /m, r.out);
});

test('a blocks folder of plain files and folders passes the attribute test', t => {
  const repo = makeRepo(t);
  const h = home(t);
  mkdirSync(join(h, 'pact', 'blocks', 'sub'), { recursive: true });
  writeFileSync(join(h, 'pact', 'blocks', 'sub', 'a.md'), 'Text.\n');
  const r = install(repo, h);
  assert.equal(r.code, 0, r.out);
});

// ------------------------------------------------------------ protected paths

test('the user file and its blocks folder are never deleted, whatever the record says', t => {
  const repo = makeRepo(t);
  const h = home(t);
  writeFileSync(configPath(h), EXAMPLE);
  mkdirSync(join(h, 'pact', 'blocks'));
  writeFileSync(join(h, 'pact', 'blocks', 'a.md'), 'Text.\n');
  assert.equal(install(repo, h, { apply: true, extra: ['-RenderedHash', dryRunHash(install(repo, h))] }).code, 0);
  const mf = join(h, '.pact-install.json');
  const m = JSON.parse(readFileSync(mf, 'utf8'));
  const planted = ['pact/config.json', 'PACT/Config.JSON', 'pact/config.json.', 'pact/blocks/a.md', 'Pact/Blocks/a.md', 'pact/blocks'];
  for (const path of planted) m.files.push({ path, sha256: 'a'.repeat(64) });
  writeFileSync(mf, JSON.stringify(m));
  const dry = install(repo, h);
  assert.equal(dry.code, 0, dry.out);
  for (const path of planted) assert.ok(dry.stdout.includes(`WARN: protected path in the install record, skipped: ${path}`), `${path}\n${dry.out}`);
  assert.match(dry.stdout, /^Delete: 0\r?$/m, dry.out);
  assert.match(dry.stdout, /^Drift: 0\r?$/m, dry.out);
  const r = install(repo, h, { apply: true, extra: ['-RenderedHash', dryRunHash(dry)] });
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(readFileSync(configPath(h)), EXAMPLE);
  assert.ok(existsSync(join(h, 'pact', 'blocks', 'a.md')));
  assert.ok(existsSync(join(h, 'pact', 'cross.mjs')), 'the cross script still installs beside the user file');
  const after = JSON.parse(readFileSync(mf, 'utf8'));
  assert.ok(!after.files.some(f => /^pact\/(config|blocks)/i.test(f.path)), 'the record never lists the user file or its blocks');
});

// ------------------------------------------------------------ the renderer's lines, parsed exactly

const R_NONE = "  if (config === NONE) head.push('CONFIG none');";
const R_USER = '`CONFIG user ${hash}`, `DIGEST ${digest}`, ...values.map(([k, v]) => `VALUE ${k} ${v}`)';

function plantRenderer(root, from, to) {
  const p = join(root, 'gate', 'render.mjs');
  const s = readFileSync(p, 'utf8');
  assert.equal(s.split(from).length, 2, `expected exactly one ${JSON.stringify(from)}`);
  writeFileSync(p, s.replace(from, () => to));
}

for (const [label, withConfig, from, to, why] of [
  ['a digest with no configuration', false, R_NONE, "  if (config === NONE) head.push('CONFIG none', 'DIGEST 000000000000');", 'the renderer reported a digest, a value, an edit or an agent setting with no configuration'],
  ['a value with no configuration', false, R_NONE, "  if (config === NONE) head.push('CONFIG none', 'VALUE usage-pause 90');", 'the renderer reported a digest, a value, an edit or an agent setting with no configuration'],
  ['a digest that is not the reported hash\'s', true, R_USER, R_USER.replace('`DIGEST ${digest}`', '`DIGEST 000000000000`'), "the renderer's configuration digest is missing or does not match the configuration hashes it reported"],
  ['no digest with a configuration', true, R_USER, R_USER.replace('`DIGEST ${digest}`, ', ''), "the renderer's configuration digest is missing or does not match the configuration hashes it reported"],
  ['two digests', true, R_USER, R_USER.replace('`DIGEST ${digest}`', '`DIGEST ${digest}`, `DIGEST ${digest}`'), 'the renderer reported two configuration digests'],
  ['one setting twice', true, R_USER, `${R_USER}, 'VALUE usage-pause 90'`, 'the renderer reported one setting twice'],
  ['a user and a none configuration line', true, R_USER, `${R_USER}, 'CONFIG none'`, 'the renderer did not report exactly one output hash, one diff hash and one configuration line'],
  ['a value for no known setting', true, R_USER, `${R_USER}, 'VALUE usage-paws 90'`, 'the renderer printed a line the install does not read'],
  ['a value out of range', true, R_USER, `${R_USER}, 'VALUE usage-pause 101'`, 'the renderer printed a line the install does not read'],
  ['a digest of the wrong length', true, R_USER, R_USER.replace('`DIGEST ${digest}`', '`DIGEST ${digest}0`'), 'the renderer printed a line the install does not read'],
]) {
  test(`bad case: a renderer that reports ${label} refuses`, t => {
    const repo = makeRepo(t, root => plantRenderer(root, from, to));
    const h = home(t);
    if (withConfig) writeFileSync(configPath(h), EXAMPLE);
    const r = install(repo, h, { apply: true, extra: withConfig ? ['-RenderedHash', 'a'.repeat(64)] : [] });
    refused(r);
    assert.match(r.stdout, /^render\| RESULT: pass\r?$/m, r.out);
    assert.match(r.stdout, new RegExp(`^REFUSED: ${why.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.`, 'm'), r.out);
    nothingWritten(h);
  });
}

// ------------------------------------------------------------ how the script reads its own command line

test('bad case: a hash typed after -Apply without its parameter name, and no -ClaudeHome, refuses and installs nowhere', t => {
  const repo = makeRepo(t);
  // A throwaway home folder, so the default -ClaudeHome can never be the real one.
  const fakeHome = tempDir(t, 'pact-fakehome-');
  const hash = 'a'.repeat(64);
  const env = { ...process.env, HOME: fakeHome, USERPROFILE: fakeHome };
  delete env.NODE_OPTIONS;
  // As typed: install.ps1 -Apply <hash>. Bound by position, the hash would
  // become -ClaudeHome, a new folder named after it.
  const r = spawnSync(PWSH, ['-NoProfile', '-NonInteractive', '-File', join(repo, 'scripts', 'install.ps1'), '-Apply', hash], { cwd: repo, encoding: 'utf8', env, timeout: 180_000 });
  const out = `${r.stdout}${r.stderr}`;
  assert.notEqual(r.status, 0, out);
  assert.ok(!existsSync(join(repo, hash)), `a folder named after the hash was created:\n${out}`);
  // The script's body never ran, whichever home folder PowerShell took.
  assert.doesNotMatch(r.stdout, /Install from commit/, out);
  assert.match(r.stdout, /^REFUSED: -ClaudeHome must be a full path/m, out);
  // PowerShell keeps its own startup data under the home folder; no pact file may appear there.
  assert.ok(!existsSync(join(fakeHome, '.claude')), out);
});
test('bad case: a relative -ClaudeHome refuses before anything runs, even after a change of location', t => {
  // The process starts in one folder and PowerShell moves to another before
  // running the script, so a relative path could name two different places.
  const repo = makeRepo(t);
  const psAt = tempDir(t, 'pact-psloc-');
  const procAt = tempDir(t, 'pact-proccwd-');
  mkdirSync(join(psAt, 'h', 'pact', 'blocks', 'sub'), { recursive: true });
  symlinkSync(tempDir(t), join(psAt, 'h', 'pact', 'blocks', 'sub', 'link'), 'junction');
  mkdirSync(join(procAt, 'h', 'pact', 'blocks', 'sub'), { recursive: true });
  const q = s => `'${s.replaceAll("'", "''")}'`;
  const cmd = `Set-Location -LiteralPath ${q(psAt)}; & ${q(join(repo, 'scripts', 'install.ps1'))} -ClaudeHome h; exit $LASTEXITCODE`;
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  const r = spawnSync(PWSH, ['-NoProfile', '-NonInteractive', '-Command', cmd], { cwd: procAt, encoding: 'utf8', env, timeout: 180_000 });
  const out = `${r.stdout}${r.stderr}`;
  assert.notEqual(r.status, 0, out);
  // It once named two folders: PowerShell's location for the attribute test,
  // the process's working folder for .NET. Now it is refused outright.
  assert.match(r.stdout, /^REFUSED: -ClaudeHome must be a full path/m, out);
  assert.doesNotMatch(r.stdout, /Install from commit/, out);
});

// ------------------------------------------------------------ an upgrade from a slice-2 record, and the user file's edit guard

test('a record from before configurations (no config, no digest) reads as no configuration: a new file is "new since the last install"', t => {
  const repo = makeRepo(t);
  const h = home(t);
  assert.equal(install(repo, h, { apply: true }).code, 0);
  const mf = join(h, '.pact-install.json');
  const m = JSON.parse(readFileSync(mf, 'utf8'));
  delete m.config;
  delete m.digest;
  writeFileSync(mf, JSON.stringify(m));
  const none = install(repo, h);
  assert.equal(none.code, 0, none.out);
  assert.match(none.stdout, /^ {2}no configuration\r?$/m, none.out);
  assert.doesNotMatch(none.stdout, /the last install had a configuration/, none.out);
  writeFileSync(configPath(h), EXAMPLE);
  const r = install(repo, h);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^Last install: [0-9a-f]{40} with no configuration\r?$/m, r.out);
  assert.match(r.stdout, /, new since the last install\r?$/m, r.out);
  assert.doesNotMatch(r.stdout, /^Nothing to do/m, r.out);
  const a = install(repo, h, { apply: true, extra: ['-RenderedHash', dryRunHash(r)] });
  assert.equal(a.code, 0, a.out);
});

test('the settings overlay asks before any edit to the user file or its blocks folder', () => {
  const overlay = JSON.parse(readFileSync(join(REPO, 'claude', 'settings.overlay.json'), 'utf8'));
  assert.ok(overlay.permissions.ask.includes('Edit(~/.claude/pact/**)'), overlay.permissions.ask.join('\n'));
});

test('bad case: -InformationAction Ignore is a word the script does not read: it refuses, and the refusal still prints', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const r = install(repo, h, { extra: ['-InformationAction', 'Ignore'] });
  refused(r);
  assert.match(r.stdout, /^REFUSED: the command line holds 2 words the script does not read \(-InformationAction\)/m, r.out);
  assert.doesNotMatch(r.stdout, /Install from commit/, r.out);
});

test('bad case: a misspelled hash option is not dropped: after a configured dry run and a deleted configuration, -Apply refuses', t => {
  const repo = makeRepo(t);
  const h = home(t);
  writeFileSync(configPath(h), EXAMPLE);
  const hash = dryRunHash(install(repo, h));
  rmSync(configPath(h));
  const r = install(repo, h, { apply: true, extra: ['-RenderHash', hash] });
  refused(r);
  assert.match(r.stdout, /^REFUSED: the command line holds 2 words the script does not read \(-RenderHash\)/m, r.out);
  assert.ok(!r.stdout.includes(hash), 'a value from the command line was printed');
  nothingWritten(h);
});

test('bad case: a stray word after the named options refuses, and is not printed', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const rendered = Buffer.from(withoutOpenMarks(readFileSync(join(repo, 'claude', 'CLAUDE.md'), 'utf8')));
  const r = install(repo, h, { apply: true, extra: ['-RenderedHash', sha256(rendered), 'CANARYstray'] });
  refused(r);
  assert.match(r.stdout, /^REFUSED: the command line holds 1 word the script does not read\./m, r.out);
  assert.ok(!r.out.includes('CANARYstray'), r.out);
  nothingWritten(h);
});