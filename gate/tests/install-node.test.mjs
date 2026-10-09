// The Node install end to end (#153, T2): the bootstrap and the runner against
// a throwaway repo and home, for what only a whole run can show. Each refusal
// the install decides is a table row in install-core.test.mjs; these cases
// cover the bootstrap's own controls and every install-io path.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, linkSync, mkdirSync, readdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { commitAll, git, home, makeRepo, nodeEnv, nodeInstall, nodePassed, nodeRefused, spawnNodeInstall, spawnNodeInstallAsync, WIN } from './install-harness.mjs';
import { tempDir } from './tree.mjs';

const edit = (root, rel, from, to) => {
  const p = join(root, ...rel.split('/'));
  const text = readFileSync(p, 'utf8');
  assert.ok(text.includes(from), `${rel} holds the plant's target`);
  writeFileSync(p, text.replace(from, to));
};
const workFolders = dir => readdirSync(dir).filter(n => n.startsWith('pact-install-'));
const lastLine = s => s.trimEnd().split('\n').at(-1);

test('node: a dry run on a clean tree passes, shows the pin, the check, the gate and the apply line, and writes nothing', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const r = nodeInstall(repo, h);
  nodePassed(r);
  const commit = git(repo, 'rev-parse', 'HEAD').trim();
  assert.match(r.stdout, new RegExp(`^Install from commit ${commit} into `, 'm'));
  assert.match(r.stdout, /^Pinned check: grimoire [0-9a-f]{40}, sha256 verified$/m);
  assert.match(r.stdout, /^seam-a\| RESULT: pass$/m);
  assert.match(r.stdout, /^Working tree: clean$/m);
  assert.match(r.stdout, /^Gate: no gate recorded at the last install$/m);
  const line = r.stdout.split('\n').find(l => l.includes(' --apply --commit '));
  assert.ok(line.includes(`--claude-home '${h}' --apply --commit ${commit}`), r.out);
  assert.ok(line.trim().startsWith(WIN ? '$env:NODE_OPTIONS = $null; node gate/install.mjs' : 'env -u NODE_OPTIONS node gate/install.mjs'), r.out);
  assert.deepEqual(readdirSync(h), []);
  assert.equal(r.stderr, '');
});

test('node: --apply installs the files byte for byte, writes the record and the guard, and the next dry run has nothing to do', t => {
  const repo = makeRepo(t);
  const h = home(t);
  nodePassed(nodeInstall(repo, h, { apply: true }));
  const record = JSON.parse(readFileSync(join(h, '.pact-install.json'), 'utf8'));
  assert.equal(record.commit, git(repo, 'rev-parse', 'HEAD').trim());
  assert.deepEqual(Object.keys(record), ['commit', 'digest', 'config', 'files', 'gate']);
  for (const f of record.files.filter(f => f.path.startsWith('agents/') && f.path !== 'agents/scout.md')) {
    assert.deepEqual(readFileSync(join(h, ...f.path.split('/'))), readFileSync(join(repo, 'claude', ...f.path.split('/'))), f.path);
  }
  assert.ok(record.gate.some(g => g.path === 'gate/install.mjs'));
  assert.ok(!record.gate.some(g => g.path.startsWith('gate/tests/')));
  const settings = JSON.parse(readFileSync(join(h, 'settings.json'), 'utf8'));
  assert.equal(settings.permissions.defaultMode, 'auto');
  const again = nodeInstall(repo, h);
  nodePassed(again);
  assert.match(again.stdout, /^Nothing to do\.$/m);
  assert.match(again.stdout, /^Gate: unchanged since the last install$/m);
});

test('node: --apply keeps the live settings: an exact large number, the owner\'s rules and the file mode (#177)', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const sf = join(h, 'settings.json');
  writeFileSync(sf, '{"big": 12345678901234567890.10, "permissions": {"allow": ["Read"]}}\n');
  if (!WIN) chmodSync(sf, 0o640);
  nodePassed(nodeInstall(repo, h, { apply: true }));
  const text = readFileSync(sf, 'utf8');
  assert.match(text, /"big": 12345678901234567890\.10,/);
  assert.ok(JSON.parse(text).permissions.allow.includes('Read'));
  if (!WIN) assert.equal(statSync(sf).mode & 0o777, 0o640);
});

test('node: a new settings file and the record are owner-only on Unix', t => {
  if (WIN) return t.skip('Windows sets no mode bits');
  const repo = makeRepo(t);
  const h = home(t);
  nodePassed(nodeInstall(repo, h, { apply: true }));
  assert.equal(statSync(join(h, 'settings.json')).mode & 0o777, 0o600);
  assert.equal(statSync(join(h, '.pact-install.json')).mode & 0o777, 0o600);
});

test('node: an installed file that is a hard link loses only its own name; the other file keeps its bytes', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const outside = join(tempDir(t, 'pact-outside-'), 'victim.md');
  writeFileSync(outside, 'victim\n');
  mkdirSync(join(h, 'agents'));
  linkSync(outside, join(h, 'agents', 'scout.md'));
  nodePassed(nodeInstall(repo, h, { apply: true }));
  assert.equal(readFileSync(outside, 'utf8'), 'victim\n');
  assert.deepEqual(readFileSync(join(h, 'agents', 'scout.md')), readFileSync(join(repo, 'familiars', 'scout.md')));
});

for (const [name, dirty] of [
  ['an untracked file', repo => writeFileSync(join(repo, 'stray.txt'), 'x')],
  ['an edited tracked file', repo => writeFileSync(join(repo, 'AGENTS.md'), `${readFileSync(join(repo, 'AGENTS.md'), 'utf8')}\nedit\n`)],
  [
    'a change staged in the index only',
    repo => {
      const p = join(repo, 'AGENTS.md');
      const was = readFileSync(p);
      writeFileSync(p, Buffer.concat([was, Buffer.from('staged\n')]));
      git(repo, 'add', 'AGENTS.md');
      writeFileSync(p, was);
    },
  ],
]) {
  test(`node: ${name} makes the tree dirty: the dry run says so, and --apply refuses`, t => {
    const repo = makeRepo(t);
    dirty(repo);
    const h = home(t);
    const r = nodeInstall(repo, h);
    nodePassed(r);
    assert.match(r.stdout, /^Working tree: DIRTY \(1 path\(s\)\)/m);
    nodeRefused(nodeInstall(repo, h, { apply: true }), /^REFUSED: the working tree is not clean\./m);
    assert.deepEqual(readdirSync(h), []);
  });
}

test('node: the dirty count never runs a clean filter, which git status would', t => {
  const repo = makeRepo(t);
  const dir = tempDir(t, 'pact-filter-');
  const marker = join(dir, 'marker');
  const script = join(dir, 'mark.js');
  writeFileSync(script, `require('fs').writeFileSync(${JSON.stringify(marker)}, 'ran');process.stdin.pipe(process.stdout);\n`);
  const fwd = s => s.replace(/\\/g, '/');
  git(repo, 'config', 'filter.mark.clean', `"${fwd(process.execPath)}" "${fwd(script)}"`);
  writeFileSync(join(repo, '.git', 'info', 'attributes'), '* filter=mark\n');
  const touch = () => writeFileSync(join(repo, 'AGENTS.md'), readFileSync(join(repo, 'AGENTS.md')));
  touch();
  git(repo, 'status', '--porcelain');
  assert.ok(existsSync(marker), 'control: git status runs the clean filter');
  execFileSync(process.execPath, ['-e', `require('fs').rmSync(${JSON.stringify(marker)})`]);
  touch();
  nodePassed(nodeInstall(repo, home(t)));
  assert.ok(!existsSync(marker), 'the Node install ran the clean filter');
});

test('node: a git planted in the folder the install runs from is never run', t => {
  const repo = makeRepo(t);
  const marker = join(repo, 'planted-ran');
  if (WIN) copyFileSync(process.execPath, join(repo, 'git.exe'));
  else {
    writeFileSync(join(repo, 'git'), `#!/bin/sh\ntouch "${marker}"\nexit 1\n`);
    chmodSync(join(repo, 'git'), 0o755);
  }
  const r = nodeInstall(repo, home(t), { path: ['.', dirname(process.execPath), ...nodeEnv().PATH.split(WIN ? ';' : ':')] });
  nodePassed(r);
  assert.ok(!existsSync(marker));
});

test('node: NODE_OPTIONS, an exec option or a git redirect refuses before anything is staged', t => {
  const repo = makeRepo(t);
  const h = home(t);
  nodeRefused(nodeInstall(repo, h, { env: { NODE_OPTIONS: '--max-old-space-size=200' } }), /^REFUSED: NODE_OPTIONS is set/m);
  const r = spawnNodeInstall(['--no-warnings', join(repo, 'gate', 'install.mjs'), '--claude-home', h], { cwd: repo, encoding: 'utf8', env: nodeEnv() });
  nodeRefused({ code: r.status, stdout: r.stdout, out: r.stdout + r.stderr }, /^REFUSED: NODE_OPTIONS is set, or node was started with an option/m);
  nodeRefused(nodeInstall(repo, h, { env: { GIT_DIR: join(repo, '.git') } }), /^REFUSED: GIT_DIR is set/m);
});

test('node: a partial clone refuses, and a credential in a remote address is never read or printed', t => {
  const repo = makeRepo(t);
  const h = home(t);
  git(repo, 'config', 'remote.origin.url', 'https://someone:MARKERSECRET123@example.invalid/r.git');
  git(repo, 'config', 'remote.origin.promisor', 'true');
  const r = nodeInstall(repo, h);
  nodeRefused(r, /partial clone/);
  assert.ok(!r.out.includes('MARKERSECRET123'));
  git(repo, 'config', '--unset', 'remote.origin.promisor');
  git(repo, 'config', 'extensions.partialclone', 'origin');
  nodeRefused(nodeInstall(repo, h), /partial clone/);
});

test('node: an uncommitted edit to the bootstrap is flagged in the dry run, and --apply refuses', t => {
  const repo = makeRepo(t);
  const h = home(t);
  writeFileSync(join(repo, 'gate', 'install.mjs'), `${readFileSync(join(repo, 'gate', 'install.mjs'), 'utf8')}// edit\n`);
  const r = nodeInstall(repo, h);
  nodePassed(r);
  assert.match(r.stdout, /^WARN: this install script differs from the committed copy; --apply will refuse\.$/m);
  nodeRefused(nodeInstall(repo, h, { apply: true }), /^REFUSED: this install script differs from the committed copy\./m);
});

test('node: --apply needs --commit, and a commit other than HEAD refuses', t => {
  const repo = makeRepo(t);
  const h = home(t);
  nodeRefused(nodeInstall(repo, h, { extra: ['--apply'] }), /^REFUSED: --apply needs --commit/m);
  nodeRefused(nodeInstall(repo, h, { apply: 'f'.repeat(40) }), /^REFUSED: the commit given with --commit is not the commit HEAD names now/m);
  assert.deepEqual(readdirSync(h), []);
});

test('node: a runner that exits 0 with any other last line is refused by the bootstrap', t => {
  const repo = makeRepo(t, root => edit(root, 'gate/install-run.mjs', "    say('RESULT: pass');\n    return;\n  }\n  core.checkApply({ configApplies,", "    say('RESULT: pass');\n    say('one more line');\n    return;\n  }\n  core.checkApply({ configApplies,"));
  nodeRefused(nodeInstall(repo, home(t)), /^REFUSED: the install runner did not end with a pass\./m);
});

test('node: a runner past its time limit is killed with its tree, the run refused, and the work folder removed', t => {
  const repo = makeRepo(t, root => edit(root, 'gate/install-run.mjs', 'async function main() {', 'async function main() {\n  setInterval(() => {}, 1000);\n  await new Promise(() => {});'));
  edit(repo, 'gate/install.mjs', 'const LIMIT_MS = 300000;', 'const LIMIT_MS = 3000;');
  const tmp = tempDir(t, 'pact-tmp-');
  const r = nodeInstall(repo, home(t), { env: { TEMP: tmp, TMP: tmp, TMPDIR: tmp } });
  nodeRefused(r, /^REFUSED: the install's checks did not finish within 3 s\. Nothing was changed\.$/m);
  assert.deepEqual(workFolders(tmp), []);
});

test('node: a signal stops the runner and removes the work folder', async t => {
  if (WIN) return t.skip('a console signal cannot be sent to one process on Windows');
  const repo = makeRepo(t, root => edit(root, 'gate/install-run.mjs', 'async function main() {', 'async function main() {\n  setInterval(() => {}, 1000);\n  await new Promise(() => {});'));
  const tmp = tempDir(t, 'pact-tmp-');
  const p = spawnNodeInstallAsync([join(repo, 'gate', 'install.mjs'), '--claude-home', home(t)], { cwd: repo, env: nodeEnv({ TEMP: tmp, TMP: tmp, TMPDIR: tmp }) });
  for (let i = 0; i < 200 && !workFolders(tmp).some(n => existsSync(join(tmp, n, 'stage', 'gate', 'install-run.mjs'))); i++) await new Promise(r => setTimeout(r, 50));
  await new Promise(r => setTimeout(r, 300));
  const exited = new Promise(r => p.on('exit', r));
  p.kill('SIGTERM');
  await exited;
  assert.deepEqual(workFolders(tmp), []);
});

test('node: the runner started from the working tree refuses', t => {
  const repo = makeRepo(t);
  const runner = join(repo, 'gate', 'install-run.mjs');
  for (const args of [[], [join(repo, 'pact-install-x'), 'a'.repeat(40), '0', 'no', '--']]) {
    const r = spawnNodeInstall([runner, ...args], { cwd: repo, encoding: 'utf8', env: nodeEnv() });
    assert.equal(r.status, 1, r.stdout);
    assert.equal(lastLine(r.stdout), 'RESULT: refused');
    assert.match(r.stdout, /^REFUSED: the install runner (was not started by|runs only from)/m);
  }
});

test('node: other pact-install folders in the temp folder are counted, never removed', t => {
  const repo = makeRepo(t);
  const tmp = tempDir(t, 'pact-tmp-');
  mkdirSync(join(tmp, 'pact-install-left'));
  const r = nodeInstall(repo, home(t), { env: { TEMP: tmp, TMP: tmp, TMPDIR: tmp } });
  nodePassed(r);
  assert.match(r.stdout, /^NOTE: 1 other pact-install-\* folder\(s\) in the temp folder/m);
  assert.deepEqual(workFolders(tmp), ['pact-install-left']);
});

const userConfig = (h, n = 90) => {
  mkdirSync(join(h, 'pact'), { recursive: true });
  writeFileSync(join(h, 'pact', 'config.json'), `{"schema": 1, "settings": {"usage-pause": ${n}}}\n`);
};
const renderedHash = r => /^ {2}rendered rules file: sha256 ([0-9a-f]{64})$/m.exec(r.stdout)?.[1];

test('node: a configuration binds --apply to the rendered hash, and the record names its digest', t => {
  const repo = makeRepo(t);
  const h = home(t);
  userConfig(h);
  const dry = nodeInstall(repo, h);
  nodePassed(dry);
  const hash = renderedHash(dry);
  assert.ok(hash, dry.out);
  assert.match(dry.stdout, /^ {2}WARN: the user configuration sets usage-pause to 90\.$/m);
  assert.ok(dry.stdout.split('\n').find(l => l.includes(' --apply ')).endsWith(`--rendered-hash ${hash}`), dry.out);
  nodeRefused(nodeInstall(repo, h, { apply: true }), /needs the full rendered hash the dry run showed/);
  userConfig(h, 80);
  nodeRefused(nodeInstall(repo, h, { apply: true, extra: ['--rendered-hash', hash] }), /is not the full hash of the rules file this run rendered/);
  userConfig(h, 90);
  nodePassed(nodeInstall(repo, h, { apply: true, extra: ['--rendered-hash', hash] }));
  const record = JSON.parse(readFileSync(join(h, '.pact-install.json'), 'utf8'));
  assert.match(record.digest, /^[0-9a-f]{12}$/);
  assert.equal(record.config[0].kind, 'user');
  assert.match(readFileSync(join(h, 'CLAUDE.md'), 'utf8'), /90%/);
});

test('node: --review-folder writes the rendered rules and the diff once every check passes, and installs nothing on a dry run', t => {
  const repo = makeRepo(t);
  const h = home(t);
  userConfig(h);
  const rev = join(tempDir(t, 'pact-rev-'), 'review');
  const r = nodeInstall(repo, h, { extra: ['--review-folder', rev] });
  nodePassed(r);
  assert.match(r.stdout, /^Review output: rendered-rules\.txt and config\.diff written to the review folder\.$/m);
  assert.deepEqual(readdirSync(rev).sort(), ['config.diff', 'rendered-rules.txt']);
  assert.deepEqual(readdirSync(h), ['pact']);
  const again = join(tempDir(t, 'pact-rev-'), 'review');
  nodeRefused(nodeInstall(repo, h, { apply: true, extra: ['--review-folder', again] }), /needs the full rendered hash/);
  assert.ok(!existsSync(again), 'a refused apply writes no review');
});

test('node: a configuration blocks folder that is a link refuses before the renderer runs', t => {
  const repo = makeRepo(t);
  const h = home(t);
  mkdirSync(join(h, 'pact'));
  try {
    symlinkSync(tempDir(t, 'pact-blocks-'), join(h, 'pact', 'blocks'), WIN ? 'junction' : 'dir');
  } catch (e) {
    if (e.code === 'EPERM') return t.skip('this account may not make a link here');
    throw e;
  }
  const r = nodeInstall(repo, h);
  nodeRefused(r, /^REFUSED: the configuration blocks folder is a link or other reparse point\./m);
  assert.ok(!/^render\| /m.test(r.stdout), 'the renderer never ran');
});

/** Plants `code` into a committed core's check(), at its start or just before it returns, with appendFileSync in scope as plantAppend. */
function plantCore(root, name, at, code) {
  const p = join(root, 'gate', `${name}-core.mjs`);
  const target = at === 'start' ? 'export function check(argv) {\n' : '  return { lines: report.lines, failed: report.failed };';
  const text = readFileSync(p, 'utf8');
  assert.equal(text.split(target).length, 2, `${name}-core.mjs holds the plant's target once`);
  writeFileSync(p, `import { appendFileSync as plantAppend } from 'node:fs';\n${text.replace(target, at === 'start' ? `${target}  ${code}\n` : `  ${code}\n${target}`)}`);
}
const junctionOrSkip = (t, target, path) => {
  try {
    symlinkSync(target, path, WIN ? 'junction' : 'dir');
    return true;
  } catch (e) {
    if (e.code !== 'EPERM') throw e;
    t.skip('this account may not make a link here');
    return false;
  }
};

test('node: a pact folder that is a link refuses before the renderer reads the user configuration', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const elsewhere = tempDir(t, 'pact-else-');
  writeFileSync(join(elsewhere, 'config.json'), '{"schema": 1, "settings": {"usage-pause": 90}}\n');
  if (!junctionOrSkip(t, elsewhere, join(h, 'pact'))) return;
  const r = nodeInstall(repo, h);
  nodeRefused(r, /^REFUSED: the user configuration file, or the pact folder that holds it, is a link or other reparse point\./m);
  assert.ok(!/^render\| /m.test(r.stdout), 'the renderer never ran');
});

test('node: a link inside the configuration blocks folder refuses before the renderer runs', t => {
  const repo = makeRepo(t);
  const h = home(t);
  mkdirSync(join(h, 'pact', 'blocks', '.hidden'), { recursive: true });
  if (!junctionOrSkip(t, tempDir(t, 'pact-else-'), join(h, 'pact', 'blocks', '.hidden', 'deep'))) return;
  nodeRefused(nodeInstall(repo, h), /^REFUSED: the configuration blocks folder holds a link or other reparse point\./m);
});

test('node: a configuration blocks folder that cannot be read refuses', t => {
  if (WIN || process.getuid?.() === 0) return t.skip('a folder this account cannot read can only be made on Unix, as a user other than root');
  const repo = makeRepo(t);
  const h = home(t);
  const locked = join(h, 'pact', 'blocks', 'locked');
  mkdirSync(locked, { recursive: true });
  chmodSync(locked, 0o000);
  t.after(() => chmodSync(locked, 0o700));
  nodeRefused(nodeInstall(repo, h), /^REFUSED: the configuration blocks folder could not be read\./m);
});

test('node: a renderer that writes into the stage refuses, with nothing written', t => {
  const repo = makeRepo(t, root => plantCore(root, 'render', 'start', "plantAppend('planted-by-render', 'x');"));
  const h = home(t);
  nodeRefused(nodeInstall(repo, h, { apply: true }), /^REFUSED: the renderer changed the stage\. Nothing was changed\.$/m);
  assert.deepEqual(readdirSync(h), []);
});

test('node: a review module that writes into the stage refuses, saying the review folder may hold its output', t => {
  const repo = makeRepo(t, root => plantCore(root, 'review', 'start', "plantAppend('planted-by-review', 'x');"));
  nodeRefused(nodeInstall(repo, home(t), { extra: ['--review-folder', join(tempDir(t, 'pact-rev-'), 'review')] }), /^REFUSED: the review module changed the stage\. The review folder may hold what the review module wrote; nothing was installed\.$/m);
});

// Seam A passes, then changes the staged rules file it checked: the review's re-hash and the apply's re-hash catch it.
const seamAThenEdit = root => plantCore(root, 'seam-a', 'end', "if (argv.length === 1) plantAppend(argv[0] + '/claude/CLAUDE.md', 'x');");

test('node: a staged rules file changed after the check refuses the review output before it is written', t => {
  const repo = makeRepo(t, seamAThenEdit);
  const rev = join(tempDir(t, 'pact-rev-'), 'review');
  nodeRefused(nodeInstall(repo, home(t), { extra: ['--review-folder', rev] }), /^REFUSED: the staged rules file changed after the check\. Nothing was changed\.$/m);
  assert.ok(!existsSync(rev));
});

test('node: a staged file changed after the check refuses --apply before any write', t => {
  const repo = makeRepo(t, seamAThenEdit);
  const h = home(t);
  nodeRefused(nodeInstall(repo, h, { apply: true }), /^REFUSED: the staged copy of CLAUDE\.md changed after the check\. Nothing was changed\.$/m);
  assert.deepEqual(readdirSync(h), []);
});

test('node: a commit with no runner refuses', t => {
  const repo = makeRepo(t);
  git(repo, 'rm', '-q', 'gate/install-run.mjs');
  commitAll(repo, 'no runner');
  nodeRefused(nodeInstall(repo, home(t)), /^REFUSED: the commit holds no install runner/m);
});
