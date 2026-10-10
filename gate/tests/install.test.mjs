// The install script end to end, against a throwaway git repo built from this
// tree and a throwaway --claude-home. Never touches ~/.claude.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { basePath, commitAll, git, home, install, listTree, makeRepo, passed, refused, routingFails, WIN, wrapCheck } from './install-harness.mjs';
import { plantModule } from './gate-files.mjs';
import { routeTree } from './payload.mjs';
import { READ_ONLY, agent, plainAgent, withoutOpenMarks } from './text.mjs';
import { tempDir, writeTree } from './tree.mjs';

// The throwaway-repo builder, install runner and the small helpers are the harness's.
//
// These cases were written for scripts/install.ps1 and now run the Node
// install (#153, S13). A decision the install makes in a pure function is a
// row in install-core.test.mjs; a case stays here when only a whole run can
// show it, or when it checks that a refused install wrote nothing (#210).

/** A file in `root` with its one `from` replaced by `to`. */
function edit(root, rel, from, to) {
  const p = join(root, ...rel.split('/'));
  const s = readFileSync(p, 'utf8');
  assert.equal(s.split(from).length, 2, `${rel} holds the plant's target once`);
  writeFileSync(p, s.replace(from, () => to));
}

// ------------------------------------------------------------ happy path

test('a file under gate/tests is not staged, checked or recorded as part of the gate', t => {
  // The harness leaves gate/tests out of every throwaway repo, so plant one here.
  const repo = makeRepo(t, root => {
    mkdirSync(join(root, 'gate', 'tests'), { recursive: true });
    writeFileSync(join(root, 'gate', 'tests', 'planted.test.mjs'), "throw new Error('the install must not read this');\n");
  });
  const h = home(t);
  const r = install(repo, h, { apply: true });
  assert.equal(r.code, 0, r.out);
  const manifest = JSON.parse(readFileSync(join(h, '.pact-install.json'), 'utf8'));
  const inGate = manifest.gate.map(g => g.path).filter(p => p.startsWith('gate/tests/'));
  assert.deepEqual(inGate, []);
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

// ------------------------------------------------------------ gate fingerprints

// The one end-to-end case for the runner's gate block (#210, move 4): the
// in-process rows check the block's lines, this one that the runner hands it
// the last install's record and today's gate.
test('bad case: an edited install script is flagged in the dry run', t => {
  const repo = makeRepo(t);
  const h = home(t);
  assert.equal(install(repo, h, { apply: true }).code, 0);
  const p = join(repo, 'gate', 'install-run.mjs');
  writeFileSync(p, `${readFileSync(p, 'utf8')}// edited\n`);
  commitAll(repo);
  const r = install(repo, h);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^Gate: CHANGED since the last install$/m, r.out);
  assert.match(r.stdout, /^ {2}changed gate\/install-run\.mjs$/m, r.out);
});

test('bad case: an uncommitted edit to the install script refuses --apply', t => {
  const repo = makeRepo(t);
  const p = join(repo, 'gate', 'install.mjs');
  writeFileSync(p, `${readFileSync(p, 'utf8')}// edited\n`);
  const h = home(t);
  const dry = install(repo, h);
  passed(dry);
  assert.match(dry.stdout, /^WARN: this install script differs from the committed copy; --apply will refuse\.$/m, dry.out);
  const r = install(repo, h, { apply: true });
  refused(r, /^REFUSED: this install script differs from the committed copy\./m);
  assert.deepEqual(listTree(h), []);
});

// ------------------------------------------------------------ fails closed

test('bad case: a pinned script that does not match its pin refuses', t => {
  const repo = makeRepo(t, root => {
    const p = join(root, 'gate', 'grimoire', 'check.mjs');
    writeFileSync(p, `${readFileSync(p, 'utf8')}// edited\n`);
  });
  const r = install(repo, home(t));
  // The runner's own refusal, before seam A runs: seam A checks the pin too,
  // and its line alone would let a runner that skipped the check pass (#210).
  refused(r, /^REFUSED: the pinned check script does not match its pin\./m);
  assert.doesNotMatch(r.stdout, /^seam-a\| /m, r.out);
});

test('bad case: a missing pinned script refuses', t => {
  const repo = makeRepo(t, root => {
    rmSync(join(root, 'gate', 'grimoire', 'check.mjs'));
  });
  const r = install(repo, home(t));
  refused(r);
  assert.match(r.stdout, /^REFUSED: the pinned check script or its pin file is missing\./m, r.out);
});

// The Node install runs every check in-process on the Node that started it
// (S6, rows P2 and R4), so these cases plant faults in the renderer's core,
// and the Node lookup cases show that nothing on PATH is ever run as Node.

test('bad case: a renderer with no RESULT line refuses, and --apply changes nothing', t => {
  const repo = makeRepo(t, root => wrapCheck(root, 'render-core', { after: 'r.lines.pop();' }));
  const h = home(t);
  const r = install(repo, h, { apply: true });
  refused(r, /^REFUSED: the renderer did not end with "RESULT: pass"\./m);
  assert.deepEqual(listTree(h), []);
  assert.doesNotMatch(r.stdout, /^seam-a\| /m, 'seam A ran after the renderer failed');
});

// The bootstrap's floor is the current Node LTS (D4): a floor above this Node shows its refusal.
test('bad case: a Node older than the bootstrap\'s floor refuses', t => {
  const repo = makeRepo(t);
  edit(repo, 'gate/install.mjs', 'const FLOOR = 24;', 'const FLOOR = 999;');
  const r = install(repo, home(t));
  refused(r, /^REFUSED: the install needs Node 999 or later; this is Node /m);
  assert.doesNotMatch(r.stdout, /^Install from commit /m, r.out);
});

test('bad case: a crash refuses, and its stderr is never echoed', t => {
  const repo = makeRepo(t, root => wrapCheck(root, 'render-core', { before: "process.stderr.write('CANARYcrash boom\\n'); process.exit(134);" }));
  const r = install(repo, home(t));
  refused(r, /^REFUSED: the install runner did not end with a pass\./m);
  assert.doesNotMatch(r.out, /CANARYcrash/);
});

// No Node lookup happens (S6, P2): with no Node on PATH, the install still
// runs every check on the Node that started it.
test('with no Node on PATH, the install runs on the Node that started it', t => {
  for (const d of basePath()) {
    assert.ok(!existsSync(join(d, WIN ? 'node.exe' : 'node')), `node found in ${d}; the test would pass for the wrong reason`);
  }
  const r = install(makeRepo(t), home(t), { path: basePath() });
  passed(r);
  assert.ok(r.stdout.includes(`Node: ${process.execPath} (${process.version})`), r.out);
});

// A shim first on PATH is never run (S6, P2): the install passes on the Node that started it.
test('a node.cmd shim first on PATH is never run', { skip: !WIN && 'a .cmd shim runs only on Windows (not run)' }, t => {
  const d = tempDir(t, 'pact-shim-');
  const marker = join(d, 'ran');
  writeFileSync(join(d, 'node.cmd'), `@echo ran> "${marker}"\r\n@"${process.execPath}" %*\r\n`);
  const r = install(makeRepo(t), home(t), { path: [d, ...basePath()] });
  passed(r);
  assert.ok(!existsSync(marker), 'the node.cmd shim ran');
});

// The Node install refuses NODE_OPTIONS rather than clearing it (S3, step 1;
// S6, A7), so no check ever runs under it.
test('bad case: NODE_OPTIONS set refuses before any check runs', t => {
  const r = install(makeRepo(t), home(t), { env: { NODE_OPTIONS: '--max-old-space-size=200' } });
  refused(r, /^REFUSED: NODE_OPTIONS is set/m);
  assert.doesNotMatch(r.stdout, /^(render|seam-a)\| /m, r.out);
});

// The bootstrap's own case check, before anything is staged; the runner's
// copy in parseTree is a row in install-core.test.mjs (#210, move 4).
test('bad case: two paths in the commit that differ only in case refuse', t => {
  // Built in the index, since a folding disk cannot hold both files.
  const repo = makeRepo(t);
  const tmp = join(repo, 'Executability-lens.tmp');
  writeFileSync(tmp, plainAgent('Executability-lens'));
  const id = git(repo, 'hash-object', '-w', tmp).trim();
  rmSync(tmp);
  git(repo, 'update-index', '--add', '--cacheinfo', `100644,${id},claude/agents/Executability-lens.md`);
  git(repo, 'commit', '-q', '-m', 'case collision');
  assert.match(git(repo, 'ls-tree', '-r', '--name-only', 'HEAD', '--', 'claude/agents'), /Executability-lens\.md[\s\S]*executability-lens\.md|executability-lens\.md[\s\S]*Executability-lens\.md/);
  const r = install(repo, home(t));
  refused(r, /^REFUSED: the commit holds two paths that differ only in case: /m);
  assert.doesNotMatch(r.stdout, /^Pinned check: /m, 'the runner started, so the bootstrap did not refuse');
});

// The bootstrap walks PATH itself and skips relative entries (S6, G2), so on
// any OS a git in the working folder, or named by a "." on PATH, never runs.
test('bad case: a git planted in the folder the install runs from is never run', t => {
  const repo = makeRepo(t);
  const marker = join(repo, 'planted-ran');
  if (WIN) cpSync(process.execPath, join(repo, 'git.exe'));
  else {
    writeFileSync(join(repo, 'git'), `#!/bin/sh\ntouch "${marker}"\nexit 1\n`);
    chmodSync(join(repo, 'git'), 0o755);
  }
  const r = install(repo, home(t), { path: ['.', dirname(process.execPath), ...basePath()] });
  passed(r);
  assert.ok(!existsSync(marker), 'the planted git ran');
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
  const p = join(repo, 'claude', 'agents', 'executability-lens.md');
  writeFileSync(p, readFileSync(p, 'utf8').replace('tools: [Read, Glob, Grep]', 'tools: [Read, Glob, Grep, Bash]'));
  const r = install(repo, home(t));
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /uncommitted edits are not checked/);
});

// ------------------------------------------------------------ the check's own output


/** Replace the one `from` in seam A's files with `to`. */
function plantSeamAOnce(root, from, to) {
  plantModule(join(root, 'gate'), 'seam-a', from, to);
}

test('bad case: a seam A that leaves a file off its install list refuses', t => {
  const repo = makeRepo(t, root =>
    plantSeamAOnce(root, '// @@TEST-INSTALL-HOOK@@', "if (dest === 'agents/scout.md') continue;"),
  );
  const r = install(repo, home(t));
  refused(r);
  assert.match(r.stdout, /copy set/);
});

test('bad case: seam A output cannot carry control codes or hide the gate block', t => {
  const repo = makeRepo(t, root => wrapCheck(root, 'seam-a-core', { after: "r.lines.unshift('\\x1b[1A\\x1b[2K\\rGate: unchanged since the last install');" }));
  const r = install(repo, home(t));
  assert.equal(r.code, 0, r.out);
  assert.ok(!r.stdout.includes('\x1b') && !r.stdout.includes('\r'), JSON.stringify(r.stdout));
  assert.match(r.stdout, /^seam-a\| \?\[1A\?\[2K\?Gate: unchanged/m);
  const lines = r.stdout.split('\n');
  const lastSeam = lines.findLastIndex(l => l.startsWith('seam-a|'));
  const gate = lines.findIndex(l => /^Gate: /.test(l));
  assert.ok(gate > lastSeam, r.stdout);
});

test('canary: the install never echoes agent file content', t => {
  const C = 'CANARYzq';
  const repo = makeRepo(t, root => {
    writeTree(root, {
      'claude/agents/c1.md': plainAgent('c1', [`model: ${C}: x`, `${C}key: y`]),
      'claude/agents/c2.md': agent([`name: ${C}`, 'description: x', READ_ONLY]),
    });
    routeTree(root);
  });
  // c2's name differs from its stem, so seam A refuses it for routing as well.
  const r = install(repo, home(t), { unrouted: ['claude/agents/c2.md'] });
  refused(r);
  assert.ok(!r.out.includes(C), r.out);
});

// ------------------------------------------------------------ the pact text (#33)

function weakenGoAhead(s) {
  assert.ok(s.includes('only after they say so in chat'));
  return s.replace('only after they say so in chat', 'when ready');
}

test('bad case: a weakened install go-ahead in AGENTS.md at HEAD refuses', t => {
  const repo = makeRepo(t, root => writeFileSync(join(root, 'AGENTS.md'), weakenGoAhead(readFileSync(join(root, 'AGENTS.md'), 'utf8'))));
  const r = install(repo, home(t));
  refused(r);
  assert.match(r.stdout, /^seam-a\| FAIL required-clause: AGENTS\.md: install-go-ahead /m, r.out);
});

test('AGENTS.md is read from HEAD: a working-tree-only weakening is not what is checked', t => {
  const repo = makeRepo(t);
  const p = join(repo, 'AGENTS.md');
  writeFileSync(p, weakenGoAhead(readFileSync(p, 'utf8')));
  const r = install(repo, home(t));
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /uncommitted edits are not checked/);
});

test('bad case: an unrouted agent at HEAD refuses, naming its file', t => {
  const repo = makeRepo(t);
  // Planted after makeRepo and never routed, so seam A refuses it.
  writeTree(repo, { 'claude/agents/probe.md': plainAgent('probe') });
  commitAll(repo);
  const r = install(repo, home(t), { unrouted: ['claude/agents/probe.md'] });
  // Seam A's own verdict refuses, before the copy-set check could (#210, move 4).
  refused(r, /^REFUSED: the check failed\./m);
  assert.match(r.stdout, /^seam-a\| FAIL routing: claude\/agents\/probe\.md: /m, r.out);
  // The routing guard in install() reads this output: it must find the file, or a missed route would pass unseen.
  assert.deepEqual(routingFails(r.stdout), ['claude/agents/probe.md'], r.out);
  assert.throws(() => install(repo, home(t), { unrouted: 'claude/agents/probe.md' }), /unrouted is true or a list/);
});

// ------------------------------------------------------------ the check's runner, on real Node

test('bad case: a seam A crash refuses, and its stderr is never echoed', t => {
  const repo = makeRepo(t, root => plantSeamAOnce(root, '// @@TEST-CRASH-HOOK@@', "process.stderr.write('CANARYseam\\n'); process.exit(134);"));
  const r = install(repo, home(t));
  // The crash ends the runner's process; the bootstrap relays none of its stderr.
  refused(r, /^REFUSED: the install runner did not end with a pass\./m);
  assert.doesNotMatch(r.out, /CANARYseam/);
});

// ------------------------------------------------------------ the renderer (#53)

const sha256 = b => createHash('sha256').update(b).digest('hex');

// The renderer's lines the planted cases hook onto.
const R_HASH = '`RENDERED ${sha256(rendered)}`';
const R_RENDER = '  const { rendered, diff } = apply(lines, swaps);';

/** Replace the one `from` in the renderer's files with `to`. */
function plantRenderer(root, from, to) {
  plantModule(join(root, 'gate'), 'render', from, to);
}

/** The repo's committed rules file: its source bytes, and the no-file render the tests expect. */
function rulesOf(repo) {
  const source = readFileSync(join(repo, 'claude', 'CLAUDE.md'));
  const rendered = Buffer.from(withoutOpenMarks(source.toString('utf8')));
  assert.notDeepEqual(rendered, source, 'the source carries no open marks, so this test would pass for the wrong reason');
  return { source, rendered };
}

test('--apply installs the no-file render as the rules file, and the record holds its hash', t => {
  const repo = makeRepo(t);
  const { source, rendered } = rulesOf(repo);
  const h = home(t);
  const r = install(repo, h, { apply: true });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, new RegExp(`^render\\| RENDERED ${sha256(rendered)}$`, 'm'), r.out);
  assert.match(r.stdout, /^render\| CONFIG none$/m, r.out);
  assert.match(r.stdout, /^OK {7}CLAUDE\.md$/m, r.out);
  assert.deepEqual(readFileSync(join(h, 'CLAUDE.md')), rendered);
  const manifest = JSON.parse(readFileSync(join(h, '.pact-install.json'), 'utf8'));
  const entry = manifest.files.find(f => f.path === 'CLAUDE.md');
  assert.equal(entry.sha256, sha256(rendered));
  assert.notEqual(entry.sha256, sha256(source));
  const again = install(repo, h);
  assert.equal(again.code, 0, again.out);
  assert.match(again.stdout, /^Drift: 0$/m, again.out);
  assert.match(again.stdout, /^Nothing to do\.$/m, again.out);
});

test('the dry run shows a Configuration block that says there is no configuration, before the gate block', t => {
  const r = install(makeRepo(t), home(t));
  assert.equal(r.code, 0, r.out);
  const lines = r.stdout.replaceAll('\r\n', '\n').split('\n');
  const c = lines.indexOf('Configuration:');
  assert.ok(c >= 0, r.out);
  assert.equal(lines[c + 1], '  no configuration');
  assert.ok(c < lines.findIndex(l => /^Gate: /.test(l)), r.out);
});

test('bad case: the rules file changed in the stage after the check refuses --apply, with nothing written', t => {
  let source;
  const repo = makeRepo(t, root => {
    source = readFileSync(join(root, 'claude', 'CLAUDE.md'), 'utf8');
    // After seam A has hashed the rendered file, it puts the unrendered source back.
    plantSeamAOnce(root, "import { lstatSync, readFileSync, readdirSync } from 'node:fs';", "import { lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';");
    plantSeamAOnce(root, '// @@TEST-SETTINGS-HOOK@@', `writeFileSync(join(root, 'claude', 'CLAUDE.md'), ${JSON.stringify(source)});`);
  });
  rulesOf(repo);
  const h = home(t);
  const r = install(repo, h, { apply: true });
  refused(r);
  assert.match(r.stdout, /^REFUSED: the staged copy of CLAUDE\.md changed after the check\./m, r.out);
  assert.deepEqual(listTree(h), []);
});

test('bad case: a record whose rules-file hash is not the rendered bytes\' hash is drift, and --apply refuses', t => {
  const repo = makeRepo(t);
  const { source, rendered } = rulesOf(repo);
  const h = home(t);
  assert.equal(install(repo, h, { apply: true }).code, 0);
  // The hash an install that ignored the render would have recorded.
  const mf = join(h, '.pact-install.json');
  const m = JSON.parse(readFileSync(mf, 'utf8'));
  m.files.find(f => f.path === 'CLAUDE.md').sha256 = sha256(source);
  writeFileSync(mf, JSON.stringify(m));
  const dry = install(repo, h);
  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.stdout, /^Drift: 1$/m, dry.out);
  assert.match(dry.stdout, /^ {2}CLAUDE\.md \(changed since the install\)$/m, dry.out);
  const r = install(repo, h, { apply: true });
  refused(r, /^REFUSED: live files changed since the last install\./m);
  assert.deepEqual(readFileSync(join(h, 'CLAUDE.md')), rendered);
});

test('bad case: a renderer that reports a hash other than its output\'s refuses', t => {
  const repo = makeRepo(t, root => plantRenderer(root, R_HASH, "`RENDERED ${'0'.repeat(64)}`"));
  const h = home(t);
  const r = install(repo, h, { apply: true });
  refused(r);
  assert.match(r.stdout, /^REFUSED: the rendered rules file's hash does not match the one the renderer reported\./m, r.out);
  assert.deepEqual(listTree(h), []);
});

test('bad case: a renderer that adds a file to the stage refuses, with nothing written', t => {
  const repo = makeRepo(t, root => plantRenderer(root, R_RENDER, `  writeFileSync('planted.md', 'x\\n');\n${R_RENDER}`));
  const h = home(t);
  const r = install(repo, h, { apply: true });
  refused(r);
  assert.match(r.stdout, /^REFUSED: the renderer changed the stage\./m, r.out);
  assert.deepEqual(listTree(h), []);
});

test('bad case: a renderer that changes a staged file refuses', t => {
  const repo = makeRepo(t, root =>
    plantRenderer(root, R_RENDER, `  writeFileSync('gate/clauses/move-4.md', 'x\\n', { flag: 'a' });\n${R_RENDER}`),
  );
  const r = install(repo, home(t));
  refused(r);
  assert.match(r.stdout, /^REFUSED: the renderer changed the stage\./m, r.out);
});

test('the renderer and the rules file come from the commit: working-tree-only edits to them are not what runs', t => {
  const repo = makeRepo(t);
  const { rendered } = rulesOf(repo);
  writeFileSync(join(repo, 'gate', 'render.mjs'), "process.stdout.write('RESULT: fail\\n');\nprocess.exit(1);\n");
  const md = join(repo, 'claude', 'CLAUDE.md');
  writeFileSync(md, `${readFileSync(md, 'utf8')}CANARYworktree\n`);
  const r = install(repo, home(t));
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^render\| RESULT: pass$/m, r.out);
  assert.match(r.stdout, new RegExp(`^render\\| RENDERED ${sha256(rendered)}$`, 'm'), r.out);
  assert.match(r.stdout, /uncommitted edits are not checked/, r.out);
});

test('bad case: a renderer that adds a hidden file to the stage refuses', t => {
  const repo = makeRepo(t, root => {
    plantRenderer(root, "import { createHash } from 'node:crypto';", "import { createHash } from 'node:crypto';\nimport { spawnSync } from 'node:child_process';");
    plantRenderer(root, R_RENDER, `  writeFileSync('gate/.planted', 'x\\n');\n  if (process.platform === 'win32') spawnSync('attrib', ['+h', 'gate\\\\.planted']);\n${R_RENDER}`);
  });
  const r = install(repo, home(t));
  refused(r);
  assert.match(r.stdout, /^REFUSED: the renderer changed the stage\./m, r.out);
});

// The runner loads the renderer's core in-process (S3), so that is the file a commit can lack.
test('bad case: a commit with no renderer refuses', t => {
  const repo = makeRepo(t, root => rmSync(join(root, 'gate', 'render-core.mjs')));
  const r = install(repo, home(t));
  refused(r, /^REFUSED: the commit's gate\/render-core\.mjs could not be loaded\./m);
});

// Fail closed (#155): a core the runner can't load refuses before it runs.
test("bad case: a commit with seam A's core deleted refuses, since the runner can't load it", t => {
  const repo = makeRepo(t, root => rmSync(join(root, 'gate', 'seam-a-core.mjs')));
  const r = install(repo, home(t));
  refused(r, /^REFUSED: the commit's gate\/seam-a-core\.mjs could not be loaded\./m);
  assert.doesNotMatch(r.stdout, /^seam-a\| /m, r.out);
});

test('seam A checks the rendered bytes: a rendered file that weakens a clause refuses', t => {
  const repo = makeRepo(t, root =>
    plantRenderer(root, R_RENDER, "  const { rendered: whole, diff } = apply(lines, swaps);\n  const rendered = Buffer.from(whole.toString('utf8').replace('however small:', 'when large:'));"),
  );
  const r = install(repo, home(t));
  refused(r);
  assert.match(r.stdout, /^render\| RESULT: pass$/m, r.out);
  assert.match(r.stdout, /^seam-a\| FAIL required-clause: claude\/CLAUDE\.md: security-route /m, r.out);
});

