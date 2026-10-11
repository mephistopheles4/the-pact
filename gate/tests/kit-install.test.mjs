// The builder kit through the install script (#203, T3, C5), end to end
// against a throwaway repo and a throwaway --claude-home: the kit installs
// with scriptorium, runs from there outside any clone and refuses where a page
// may not go, and is deleted when scriptorium is dropped. Each refused install
// is checked to have changed nothing. Never touches ~/.claude.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WIN, home, install, listTree, makeRepo, passed, refused } from './install-harness.mjs';
import { tempDir } from './tree.mjs';

const OLD_NODE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'old-node-faults.mjs');
const KIT = ['pact', 'builder'];
const BUILDER = { schema: 1, title: 'Mine', presets: [{ id: 'grill-first', title: 'Grill first', slot: 'move-2', text: 'Before the spec, use the `grill-me` skill.', why: 'I think better when grilled.' }], workflows: [{ id: 'mine', title: 'Mine', about: 'How I work.', presets: ['grill-first'] }], yours: { skills: [{ name: 'grill-me', description: 'Grill the plan' }] } };

/** A Claude home folder whose configuration turns on `commands`, with `more` beside it. */
function homeWith(t, commands, more = {}) {
  const h = home(t);
  mkdirSync(join(h, 'pact'), { recursive: true });
  writeFileSync(join(h, 'pact', 'config.json'), `${JSON.stringify({ schema: 1, commands, ...more })}\n`);
  return h;
}

function dryRunHash(r) {
  const m = /^ {2}rendered rules file: sha256 ([0-9a-f]{64})\r?$/m.exec(r.stdout);
  assert.ok(m, r.out);
  return m[1];
}

/** A dry run and an --apply with its hash, both passing. Returns the dry run. */
function installFully(repo, h) {
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

/** Every file under `dir`, '/'-joined. */
const filesUnder = dir => readdirSync(dir, { recursive: true, withFileTypes: true }).filter(e => e.isFile()).map(e => join(e.parentPath, e.name).slice(dir.length + 1).replaceAll('\\', '/')).sort();

test('the kit installs with scriptorium, runs from the Claude home outside any clone, refuses where a page may not go, and is deleted when scriptorium is dropped', t => {
  const repo = makeRepo(t);
  // An agent the owner sets off its default: the installed agent carries it, the kit's copy never does (q1).
  const h = homeWith(t, ['scriptorium'], { agents: { 'integrity-lens': { model: 'sonnet' } } });
  const dry = installFully(repo, h);
  assert.match(dry.stdout, /^ {2}WARN: the user configuration turns on the pact command \/scriptorium; it installs to commands\/scriptorium\.md, with the builder kit, the builder script and what it reads, under pact\/builder\/\.\r?$/m, dry.out);
  const kit = join(h, ...KIT);
  assert.equal(readFileSync(join(h, 'commands', 'scriptorium.md'), 'utf8'), readFileSync(join(repo, 'claude', 'commands', 'scriptorium.md'), 'utf8'));
  // The rules source is the committed rules file, unrendered, and the kit holds no CLAUDE.md.
  assert.deepEqual(readFileSync(join(kit, 'claude', 'rules.source.md')), readFileSync(join(repo, 'claude', 'CLAUDE.md')));
  assert.match(readFileSync(join(h, 'agents', 'integrity-lens.md'), 'utf8'), /^model: sonnet$/m, 'the override did not install');
  for (const f of readdirSync(join(repo, 'claude', 'agents'))) assert.deepEqual(readFileSync(join(kit, 'claude', 'agents', f)), readFileSync(join(repo, 'claude', 'agents', f)), `the kit's ${f} is not the committed file`);
  const files = filesUnder(kit);
  assert.ok(!files.some(f => /(^|\/)CLAUDE\.md$/i.test(f)), `the kit holds a CLAUDE.md: ${files.join(', ')}`);
  for (const f of ['builder/build.mjs', 'builder/scriptorium.html', 'gate/render.mjs', 'gate/render-core.mjs', 'gate/shared.mjs', 'gate/tool-allowlist.json', 'familiars/scout.md', 'examples/pact-config/builder.json', 'claude/agents/data-lens.md']) assert.ok(files.includes(f), `the kit lacks ${f}`);
  assert.ok(!files.some(f => f.startsWith('gate/') && !['gate/render.mjs', 'gate/render-core.mjs', 'gate/shared.mjs', 'gate/tool-allowlist.json'].includes(f)), 'a gate file off the kit list installed');

  // The kit, run from a temp folder outside any git work tree.
  const work = tempDir(t, 'pact-kit-work-');
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  const cli = (args, pre = []) => spawnSync(process.execPath, [...pre, join(kit, 'builder', 'build.mjs'), ...args], { encoding: 'utf8', env, cwd: work });
  const b = join(work, 'builder.json');
  writeFileSync(b, `${JSON.stringify(BUILDER, null, 2)}\n`);
  const check = cli(['--builder', b, '--check']);
  assert.equal(check.status, 0, check.stdout + check.stderr);
  assert.match(check.stdout, /^RESULT: pass/m);
  const scratch = tempDir(t, 'pact-kit-page-');
  const ok = cli(['--builder', b, '--out', join(scratch, 'page.html')]);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(readFileSync(join(scratch, 'page.html'), 'utf8'), /Grill first/);

  const refuses = (args, says, pre) => {
    const r = cli(args, pre);
    assert.equal(r.status, 1, `${args.join(' ')}: ${r.stdout}${r.stderr}`);
    assert.match(r.stdout, says);
  };
  const before = filesUnder(kit);
  refuses(['--builder', b, '--out', join(kit, 'builder', 'mine.html')], /outside the builder kit/);
  refuses(['--builder', b, '--out', join(h, 'mine.html')], /outside the Claude folder/);
  const dot = join(tempDir(t, 'pact-kit-dot-'), '.claude');
  mkdirSync(dot);
  refuses(['--builder', b, '--out', join(dot, 'mine.html')], /outside any \.claude folder/);
  const tree = tempDir(t, 'pact-kit-tree-');
  mkdirSync(join(tree, '.git'));
  mkdirSync(join(tree, 'pages'));
  refuses(['--builder', b, '--out', join(tree, 'pages', 'mine.html')], /outside any git work tree/);
  const link = join(tempDir(t, 'pact-kit-link-'), 'to-tree');
  let linked = true;
  try {
    symlinkSync(join(tree, 'pages'), link, WIN ? 'junction' : 'dir');
  } catch (e) {
    if (e.code !== 'EPERM' && e.code !== 'EACCES') throw e;
    linked = false;
  }
  if (linked) refuses(['--builder', b, '--out', join(link, 'mine.html')], /outside any git work tree/);
  refuses(['--builder', b, '--out', join(scratch, 'page.html')], /must not be a file that exists/);
  refuses([], /^REFUSE the builder kit never edits itself/m);
  refuses(['--check'], /^REFUSE the builder kit never edits itself/m);
  refuses(['--builder', b, '--check'], /^REFUSE the builder needs Node 24 or later; this is Node 22\.1\.0$/m, ['--import', pathToFileURL(OLD_NODE).href]);
  assert.deepEqual(filesUnder(kit), before, 'a refused run changed the kit');
  assert.ok(!existsSync(join(tree, 'pages', 'mine.html')) && !existsSync(join(dot, 'mine.html')) && !existsSync(join(h, 'mine.html')), 'a refused run wrote a page');

  // Dropping scriptorium deletes the command and the whole kit, through the record.
  writeFileSync(join(h, 'pact', 'config.json'), `${JSON.stringify({ schema: 1, commands: [], agents: { 'integrity-lens': { model: 'sonnet' } } })}\n`);
  const drop = installFully(repo, h);
  assert.match(drop.stdout, /^Delete: \d+\r?$/m, drop.out);
  assert.match(drop.stdout, /^ {2}pact\/builder\/builder\/build\.mjs\r?$/m, drop.out);
  assert.ok(!existsSync(join(h, 'commands', 'scriptorium.md')), 'the command is still there');
  assert.deepEqual(existsSync(kit) ? filesUnder(kit) : [], [], 'the kit is still there');
  assert.ok(existsSync(join(h, 'agents', 'data-lens.md')), 'an agent went with the kit');
});

test('with no commands list, the kit is staged and checked but never installs', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const r = install(repo, h, { apply: true });
  passed(r);
  assert.match(r.stdout, /^ {2}\/scriptorium: off\r?$/m, r.out);
  assert.ok(!existsSync(join(h, ...KIT)), 'the kit installed with no list');
});

test('bad case: a commit that carries claude/rules.source.md refuses, and changes nothing', t => {
  const repo = makeRepo(t, root => writeFileSync(join(root, 'claude', 'rules.source.md'), readFileSync(join(root, 'claude', 'CLAUDE.md'))));
  refusedUnchanged(repo, homeWith(t, ['scriptorium']), /^REFUSED: the commit holds claude\/rules\.source\.md; the install makes that file itself, from claude\/CLAUDE\.md, so a commit may not carry one\./m);
});

test('bad case: a commit that carries a claude/agents.source/ file refuses, and changes nothing', t => {
  const repo = makeRepo(t, root => {
    mkdirSync(join(root, 'claude', 'agents.source'));
    writeFileSync(join(root, 'claude', 'agents.source', 'data-lens.md'), readFileSync(join(root, 'claude', 'agents', 'data-lens.md')));
  });
  refusedUnchanged(repo, homeWith(t, ['scriptorium']), /^REFUSED: the commit holds claude\/agents\.source\/data-lens\.md; the install makes claude\/agents\.source\/ itself, from claude\/agents\/, so a commit may not carry it\./m);
});

test('bad case: a kit module that imports a network built-in refuses the install, which copies nothing', t => {
  const repo = makeRepo(t, root => {
    const p = join(root, 'builder', 'build.mjs');
    writeFileSync(p, `${readFileSync(p, 'utf8')}import http from 'node:http';\n`);
  });
  const r = refusedUnchanged(repo, homeWith(t, ['scriptorium']), /^REFUSED: the check failed\./m);
  assert.match(r.stdout, /^seam-a\| FAIL kit-imports: builder\/build\.mjs line \d+: an import from something other than a listed node: built-in or another builder kit module\r?$/m, r.out);
});

test('bad case: a live file at a kit path the record does not list refuses, and is left alone', t => {
  const repo = makeRepo(t);
  const h = homeWith(t, ['scriptorium']);
  mkdirSync(join(h, ...KIT, 'builder'), { recursive: true });
  writeFileSync(join(h, ...KIT, 'builder', 'build.mjs'), 'mine\n');
  refusedUnchanged(repo, h, /^REFUSED: pact\/builder\/builder\/build\.mjs already exists in the Claude home folder, and the install record does not list it/m);
  assert.equal(readFileSync(join(h, ...KIT, 'builder', 'build.mjs'), 'utf8'), 'mine\n');
});
