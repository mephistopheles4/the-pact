// The install script end to end, against a throwaway git repo built from this
// tree and a throwaway -ClaudeHome. Never touches ~/.claude.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { before, test } from 'node:test';
import { REPO, READ_ONLY, agent, plainAgent, sealedFamiliar, tempDir, writeTree } from './helpers.mjs';

const WIN = process.platform === 'win32';

function which(cmd) {
  const r = spawnSync(WIN ? 'where.exe' : 'which', [cmd], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd} not found on PATH`);
  return r.stdout.split(/\r?\n/)[0].trim();
}

const PWSH = which('pwsh');
const GIT_DIR = dirname(which('git'));
const NODE_DIR = dirname(process.execPath);
const SYS_DIRS = WIN ? [join(process.env.SystemRoot ?? 'C:\\Windows', 'System32')] : ['/usr/bin', '/bin'];
const BASE_PATH = [GIT_DIR, dirname(PWSH), ...SYS_DIRS];

function envWith(pathDirs, extra = {}) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (/^path$/i.test(k) || k === 'NODE_OPTIONS') continue;
    env[k] = v;
  }
  env.PATH = pathDirs.join(delimiter);
  return { ...env, ...extra };
}

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

/** A git repo holding the files the install reads, committed; `mutate` runs before the commit. */
function makeRepo(t, mutate) {
  const root = tempDir(t, 'pact-repo-');
  for (const d of ['claude', 'gate', 'familiars']) cpSync(join(REPO, d), join(root, d), { recursive: true });
  mkdirSync(join(root, 'scripts'));
  cpSync(join(REPO, 'scripts', 'install.ps1'), join(root, 'scripts', 'install.ps1'));
  cpSync(join(REPO, '.gitattributes'), join(root, '.gitattributes'));
  writeFileSync(join(root, '.gitignore'), 'settings.json\n');
  if (mutate) mutate(root);
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 'test@example.invalid');
  git(root, 'config', 'user.name', 'gate test');
  git(root, 'config', 'commit.gpgsign', 'false');
  commitAll(root);
  return root;
}

function commitAll(root, msg = 'test') {
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '--allow-empty', '-m', msg);
}

function install(repo, home, { apply = false, path = [NODE_DIR, ...BASE_PATH], env = {} } = {}) {
  const args = ['-NoProfile', '-NonInteractive', '-File', join(repo, 'scripts', 'install.ps1'), '-ClaudeHome', home];
  if (apply) args.push('-Apply');
  const r = spawnSync(PWSH, args, { cwd: repo, encoding: 'utf8', env: envWith(path, env), timeout: 180_000 });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, out: `${r.stdout}${r.stderr}` };
}

function refused(r) {
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.stdout, /^REFUSED: /m, r.out);
}

function home(t) {
  return tempDir(t, 'pact-home-');
}

function listTree(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true }).map(String).sort();
}

// A stand-in Node: an .exe on Windows (compiled once with the .NET Framework
// compiler), a shell script elsewhere. Its behaviour comes from mode.txt
// beside it, and it logs every argument list it receives to args.log.
let FAKE_SRC_DIR;
before(() => {
  FAKE_SRC_DIR = execFileSync(process.execPath, ['-e', "process.stdout.write(require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'pact-fake-')))"], {
    encoding: 'utf8',
  });
  if (WIN) {
    const cs = `using System; using System.IO;
class P { static int Main(string[] a) {
  string dir = AppDomain.CurrentDomain.BaseDirectory;
  string mf = Path.Combine(dir, "mode.txt");
  string mode = File.Exists(mf) ? File.ReadAllText(mf).Trim() : "noresult";
  File.AppendAllText(Path.Combine(dir, "args.log"), string.Join(" ", a) + "\\n");
  if (a.Length > 0 && a[0] == "--version") { Console.WriteLine(mode == "old" ? "v18.20.0" : "v22.0.0"); return 0; }
  if (mode == "exit1") { Console.WriteLine("RESULT: pass"); return 1; }
  if (mode == "crash") { Console.Error.WriteLine("CANARYcrash boom"); return 134; }
  Console.WriteLine("PASS everything is fine");
  return 0;
} }`;
    writeFileSync(join(FAKE_SRC_DIR, 'fake.cs'), cs);
    const csc = join(process.env.SystemRoot ?? 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
    execFileSync(csc, ['/nologo', `/out:${join(FAKE_SRC_DIR, 'node.exe')}`, join(FAKE_SRC_DIR, 'fake.cs')]);
  } else {
    const sh = `#!/bin/sh
dir=$(dirname "$0"); mode=$(cat "$dir/mode.txt" 2>/dev/null || echo noresult)
echo "$*" >> "$dir/args.log"
if [ "$1" = "--version" ]; then if [ "$mode" = old ]; then echo v18.20.0; else echo v22.0.0; fi; exit 0; fi
case "$mode" in exit1) echo "RESULT: pass"; exit 1;; crash) echo "CANARYcrash boom" >&2; exit 134;; esac
echo "PASS everything is fine"; exit 0
`;
    writeFileSync(join(FAKE_SRC_DIR, 'node'), sh, { mode: 0o755 });
  }
});

function fakeNode(t, mode) {
  const d = tempDir(t, 'pact-fakebin-');
  const exe = WIN ? 'node.exe' : 'node';
  cpSync(join(FAKE_SRC_DIR, exe), join(d, exe));
  writeFileSync(join(d, 'mode.txt'), mode);
  return d;
}

// ------------------------------------------------------------ happy path

test('dry run on a clean tree passes and shows Node, the pin, the check and the gate', t => {
  const repo = makeRepo(t);
  const r = install(repo, home(t));
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^Node: .+ \(v\d+\.\d+\.\d+\)$/m);
  assert.match(r.stdout, /^Pinned check: grimoire f4a255c4e3df2abda11e7e738ab98abd27f4e0c7, sha256 verified$/m);
  assert.match(r.stdout, /^seam-a\| RESULT: pass$/m);
  assert.match(r.stdout, /^Check: passed on commit [0-9a-f]{40}$/m);
  assert.match(r.stdout, /^Gate: no gate recorded at the last install$/m);
  assert.match(r.stdout, /not content-checked until #33/);
  assert.match(r.stdout, /not checked until #34/);
});

test('-Apply installs today\'s agents byte for byte, records the gate, and the next dry run sees no gate change', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const r = install(repo, h, { apply: true });
  assert.equal(r.code, 0, r.out);
  for (const f of readdirSync(join(repo, 'claude', 'agents'))) {
    assert.deepEqual(readFileSync(join(h, 'agents', f)), readFileSync(join(repo, 'claude', 'agents', f)), f);
  }
  assert.deepEqual(readFileSync(join(h, 'CLAUDE.md')), readFileSync(join(repo, 'claude', 'CLAUDE.md')));
  const manifest = JSON.parse(readFileSync(join(h, '.pact-install.json'), 'utf8'));
  const gatePaths = manifest.gate.map(g => g.path).sort();
  assert.deepEqual(gatePaths, [
    'gate/grimoire/check.mjs',
    'gate/grimoire/check.mjs.pin',
    'gate/seam-a.mjs',
    'gate/tool-allowlist.json',
    'scripts/install.ps1',
  ]);
  const again = install(repo, h);
  assert.equal(again.code, 0, again.out);
  assert.match(again.stdout, /^Gate: unchanged since the last install$/m);
  assert.match(again.stdout, /^Nothing to do\.$/m);
});

test('the owner\'s own live agent is never deleted, and an old manifest deletes nothing', t => {
  const repo = makeRepo(t);
  const h = home(t);
  writeTree(h, { 'agents/my-own.md': plainAgent('my-own') });
  assert.equal(install(repo, h, { apply: true }).code, 0);
  // A manifest from before the gate: the same files, no gate block.
  const mf = join(h, '.pact-install.json');
  const old = JSON.parse(readFileSync(mf, 'utf8'));
  delete old.gate;
  writeFileSync(mf, JSON.stringify(old));
  const dry = install(repo, h);
  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.stdout, /^Delete: 0$/m, dry.out);
  assert.match(dry.stdout, /^Gate: no gate recorded at the last install$/m, dry.out);
  const r = install(repo, h, { apply: true });
  assert.equal(r.code, 0, r.out);
  assert.ok(existsSync(join(h, 'agents', 'my-own.md')));
  for (const f of readdirSync(join(repo, 'claude', 'agents'))) assert.ok(existsSync(join(h, 'agents', f)), f);
});

test('a sealed familiar installs to agents/<stem>.md; its contract never installs', t => {
  const repo = makeRepo(t, root => sealedFamiliar(root, 'probe-agent'));
  const h = home(t);
  const r = install(repo, h, { apply: true });
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(readFileSync(join(h, 'agents', 'probe-agent.md')), readFileSync(join(repo, 'familiars', 'probe-agent.md')));
  assert.ok(!listTree(h).some(f => f.includes('contract')), listTree(h).join('\n'));
});

// ------------------------------------------------------------ gate fingerprints

test('bad case: an edited pinned script with a matching edited hash is flagged in the dry run', t => {
  const repo = makeRepo(t);
  const h = home(t);
  assert.equal(install(repo, h, { apply: true }).code, 0);
  const p = join(repo, 'gate', 'grimoire', 'check.mjs');
  writeFileSync(p, `${readFileSync(p, 'utf8')}// edited\n`);
  const hash = execFileSync(process.execPath, ['-e', `process.stdout.write(require('crypto').createHash('sha256').update(require('fs').readFileSync(${JSON.stringify(p)})).digest('hex'))`], { encoding: 'utf8' });
  writeFileSync(join(repo, 'gate', 'grimoire', 'check.mjs.pin'), `commit f4a255c4e3df2abda11e7e738ab98abd27f4e0c7\nsha256 ${hash}\n`);
  commitAll(repo);
  const r = install(repo, h);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^Gate: CHANGED since the last install$/m);
  assert.match(r.stdout, /^ {2}changed gate\/grimoire\/check\.mjs$/m);
  assert.match(r.stdout, /^ {2}changed gate\/grimoire\/check\.mjs\.pin$/m);
});

test('bad case: an edited install script is flagged in the dry run', t => {
  const repo = makeRepo(t);
  const h = home(t);
  assert.equal(install(repo, h, { apply: true }).code, 0);
  const p = join(repo, 'scripts', 'install.ps1');
  writeFileSync(p, `${readFileSync(p, 'utf8')}# edited\n`);
  commitAll(repo);
  const r = install(repo, h);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^ {2}changed scripts\/install\.ps1$/m);
});

test('bad case: an uncommitted edit to the install script refuses -Apply', t => {
  const repo = makeRepo(t);
  const p = join(repo, 'scripts', 'install.ps1');
  writeFileSync(p, `${readFileSync(p, 'utf8')}# edited\n`);
  const h = home(t);
  const r = install(repo, h, { apply: true });
  refused(r);
  assert.match(r.stdout, /install script differs from the committed copy/);
  assert.deepEqual(listTree(h), []);
});

// ------------------------------------------------------------ fails closed

test('bad case: a pinned script that does not match its pin refuses', t => {
  const repo = makeRepo(t, root => {
    const p = join(root, 'gate', 'grimoire', 'check.mjs');
    writeFileSync(p, `${readFileSync(p, 'utf8')}// edited\n`);
  });
  const r = install(repo, home(t));
  refused(r);
  assert.match(r.stdout, /pinned check script does not match its pin/);
});

test('bad case: a missing pinned script refuses', t => {
  const repo = makeRepo(t, root => {
    rmSync(join(root, 'gate', 'grimoire', 'check.mjs'));
  });
  refused(install(repo, home(t)));
});

test('bad case: a fake Node with no RESULT line refuses, and -Apply changes nothing', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const bin = fakeNode(t, 'noresult');
  const r = install(repo, h, { apply: true, path: [bin, ...BASE_PATH] });
  refused(r);
  assert.match(r.stdout, /did not end with "RESULT: pass"/);
  assert.deepEqual(listTree(h), []);
  assert.doesNotMatch(readFileSync(join(bin, 'args.log'), 'utf8'), /--seal/);
});

test('bad case: Node older than 20 refuses', t => {
  const r = install(makeRepo(t), home(t), { path: [fakeNode(t, 'old'), ...BASE_PATH] });
  refused(r);
  assert.match(r.stdout, /older than 20/);
});

test('bad case: a non-zero exit refuses even with a RESULT: pass line', t => {
  const r = install(makeRepo(t), home(t), { path: [fakeNode(t, 'exit1'), ...BASE_PATH] });
  refused(r);
  assert.match(r.stdout, /exited with code 1/);
});

test('bad case: a crash refuses, and its stderr is never echoed', t => {
  const r = install(makeRepo(t), home(t), { path: [fakeNode(t, 'crash'), ...BASE_PATH] });
  refused(r);
  assert.doesNotMatch(r.out, /CANARYcrash/);
});

test('bad case: a missing Node refuses', t => {
  for (const d of BASE_PATH) {
    assert.ok(!existsSync(join(d, WIN ? 'node.exe' : 'node')), `node found in ${d}; the test would pass for the wrong reason`);
  }
  const r = install(makeRepo(t), home(t), { path: BASE_PATH });
  refused(r);
  assert.match(r.stdout, /no Node/);
});

test('bad case: a node.cmd shim is not accepted as Node', { skip: !WIN }, t => {
  const d = tempDir(t, 'pact-shim-');
  writeFileSync(join(d, 'node.cmd'), `@"${process.execPath}" %*\r\n`);
  const r = install(makeRepo(t), home(t), { path: [d, ...BASE_PATH] });
  refused(r);
});

test('NODE_OPTIONS is cleared for the check', t => {
  const d = tempDir(t, 'pact-nodeopt-');
  const hostile = join(d, 'hostile.cjs');
  writeFileSync(hostile, "process.stdout.write('RESULT: fail\\n'); process.exit(1);\n");
  const r = install(makeRepo(t), home(t), { env: { NODE_OPTIONS: `--require=${hostile}` } });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^seam-a\| RESULT: pass$/m, r.out);
});

test('bad case: an agent that fails seam A refuses, naming file and rule', t => {
  const repo = makeRepo(t, root => {
    const p = join(root, 'claude', 'agents', 'scout.md');
    writeFileSync(p, readFileSync(p, 'utf8').replace('tools: [Read, Glob, Grep]', 'tools: [Read, Glob, Grep, Bash]'));
  });
  const r = install(repo, home(t));
  refused(r);
  assert.match(r.stdout, /^seam-a\| FAIL tools: claude\/agents\/scout\.md line \d+/m);
});

test('bad case: two sources for one live path refuse', t => {
  const repo = makeRepo(t, root =>
    sealedFamiliar(root, 'scout', { lines: ['name: scout', 'description: x', READ_ONLY] }),
  );
  refused(install(repo, home(t)));
});

test('bad case: two paths in the commit that differ only in case refuse', t => {
  // Built in the index, since a folding disk cannot hold both files.
  const repo = makeRepo(t);
  const tmp = join(repo, 'Scout.tmp');
  writeFileSync(tmp, plainAgent('Scout'));
  const id = git(repo, 'hash-object', '-w', tmp).trim();
  rmSync(tmp);
  git(repo, 'update-index', '--add', '--cacheinfo', `100644,${id},claude/agents/Scout.md`);
  git(repo, 'commit', '-q', '-m', 'case collision');
  assert.match(git(repo, 'ls-tree', '-r', '--name-only', 'HEAD', '--', 'claude/agents'), /Scout\.md[\s\S]*scout\.md|scout\.md[\s\S]*Scout\.md/);
  const r = install(repo, home(t));
  refused(r);
  assert.match(r.stdout, /differ only in case/);
});

test('bad case: a git planted in the folder the install runs from is never run', { skip: !WIN }, t => {
  const repo = makeRepo(t);
  // The stand-in logs to args.log beside itself whenever it runs.
  cpSync(join(FAKE_SRC_DIR, 'node.exe'), join(repo, 'git.exe'));
  const r = install(repo, home(t));
  assert.equal(r.code, 0, r.out);
  assert.ok(!existsSync(join(repo, 'args.log')), 'the planted git.exe ran');
});

test('lines built from the install record are cleaned', t => {
  const repo = makeRepo(t);
  const h = home(t);
  assert.equal(install(repo, h, { apply: true }).code, 0);
  const mf = join(h, '.pact-install.json');
  const m = JSON.parse(readFileSync(mf, 'utf8'));
  m.gate.push({ path: 'gate/\u001b[2Kx', sha256: 'aa' });
  m.files.push({ path: 'agents/\u001b[2Ky.md', sha256: 'aa' });
  m.commit = '\u001b[2Kc';
  writeFileSync(mf, JSON.stringify(m));
  const r = install(repo, h);
  assert.ok(!r.stdout.includes('\x1b'), JSON.stringify(r.stdout));
});
test('bad case: a live agents folder that is a link refuses', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const elsewhere = tempDir(t, 'pact-elsewhere-');
  try {
    symlinkSync(elsewhere, join(h, 'agents'), 'junction');
  } catch {
    t.skip('cannot create a link here');
    return;
  }
  const r = install(repo, h, { apply: true });
  refused(r);
  assert.match(r.stdout, /path through a link/);
  assert.deepEqual(listTree(elsewhere), []);
});

test('the check runs on the commit, not on uncommitted edits, and says so', t => {
  const repo = makeRepo(t);
  const p = join(repo, 'claude', 'agents', 'scout.md');
  writeFileSync(p, readFileSync(p, 'utf8').replace('tools: [Read, Glob, Grep]', 'tools: [Read, Glob, Grep, Bash]'));
  const r = install(repo, home(t));
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /uncommitted edits are not checked/);
});

// ------------------------------------------------------------ the check's own output

function plantSeamA(root, transform) {
  const p = join(root, 'gate', 'seam-a.mjs');
  writeFileSync(p, transform(readFileSync(p, 'utf8')));
}

test('bad case: a seam A that leaves a file off its install list refuses', t => {
  const repo = makeRepo(t, root =>
    plantSeamA(root, s => s.replace('// @@TEST-INSTALL-HOOK@@', "if (dest === 'agents/scout.md') continue;")),
  );
  const r = install(repo, home(t));
  refused(r);
  assert.match(r.stdout, /copy set/);
});

test('bad case: seam A output cannot carry control codes or hide the gate block', t => {
  const repo = makeRepo(t, root =>
    // After the shebang line, which must stay first.
    plantSeamA(root, s => s.replace('\n', "\nprocess.stdout.write('\\x1b[1A\\x1b[2K\\rGate: unchanged since the last install\\n');\n")),
  );
  const r = install(repo, home(t));
  assert.equal(r.code, 0, r.out);
  // PowerShell ends its own lines with CRLF on Windows; any other CR came from the check.
  assert.ok(!r.stdout.includes('\x1b') && !r.stdout.replaceAll('\r\n', '\n').includes('\r'), JSON.stringify(r.stdout));
  assert.match(r.stdout, /^seam-a\| \?\[1A\?\[2K\?Gate: unchanged/m);
  const lines = r.stdout.split('\n');
  const lastSeam = lines.findLastIndex(l => l.startsWith('seam-a|'));
  const gate = lines.findIndex(l => /^Gate: /.test(l));
  assert.ok(gate > lastSeam, r.stdout);
});

test('canary: the install never echoes agent file content', t => {
  const C = 'CANARYzq';
  const repo = makeRepo(t, root =>
    writeTree(root, {
      'claude/agents/c1.md': plainAgent('c1', [`model: ${C}: x`, `${C}key: y`]),
      'claude/agents/c2.md': agent([`name: ${C}`, 'description: x', READ_ONLY]),
    }),
  );
  const r = install(repo, home(t));
  refused(r);
  assert.ok(!r.out.includes(C), r.out);
});
