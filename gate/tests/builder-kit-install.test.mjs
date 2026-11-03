// The builder kit through the install script (#203 S6, C5; #262), end to end
// against a throwaway repo and a throwaway --claude-home. Each repo plants the
// builder's files and a /scriptorium command over the shipped ones, so a case
// doesn't depend on the shipped text. Never touches ~/.claude.
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { applyBound, home, install, listTree, makeRepo, passed, refused } from './install-harness.mjs';
import { REPO } from './text.mjs';
import { tempDir } from './tree.mjs';

const SCRIPTORIUM = ['---', 'description: Build your pact configuration.', 'disable-model-invocation: true', '---', '', 'Build the page.', ''].join('\n');
const KIT_FROM_REPO = ['builder/build.mjs', 'builder/parts.mjs', 'builder/scriptorium.html', 'builder/presets', 'examples/pact-config/builder.json', 'docs/brand/scriptorium/scriptorium-mark.svg'];

/** A repo holding the builder and the scriptorium command, with `more` run after. */
function repoWithKit(t, more) {
  return makeRepo(t, root => {
    for (const rel of KIT_FROM_REPO) cpSync(join(REPO, rel), join(root, rel), { recursive: true });
    mkdirSync(join(root, 'claude', 'commands'), { recursive: true });
    writeFileSync(join(root, 'claude', 'commands', 'scriptorium.md'), SCRIPTORIUM);
    if (more) more(root);
  });
}

// #203 C5; #262: the kit installs with /scriptorium, with no commands list, and runs from the Claude home folder.
test('the builder kit installs with no commands list, holds the unrendered rules and no CLAUDE.md, and its builder writes a page outside any repo', t => {
  const repo = repoWithKit(t);
  const h = home(t);
  const dry = install(repo, h);
  passed(dry);
  assert.match(dry.stdout, /^ {2}\/scriptorium: on, always: part of the pact, with the builder kit under pact\/builder\/\r?$/m, dry.out);
  passed(applyBound(repo, h));
  const kit = join(h, 'pact', 'builder');
  assert.equal(readFileSync(join(h, 'commands', 'scriptorium.md'), 'utf8'), SCRIPTORIUM);
  assert.equal(readFileSync(join(kit, 'claude', 'rules.source.md'), 'utf8'), readFileSync(join(repo, 'claude', 'CLAUDE.md'), 'utf8'), 'the kit holds the unrendered rules');
  assert.ok(!listTree(kit).some(rel => /(^|[\\/])CLAUDE\.md$/.test(rel)), 'the kit holds no file named CLAUDE.md');
  assert.deepEqual(readdirSync(join(kit, 'claude', 'agents')).sort(), readdirSync(join(repo, 'claude', 'agents')).sort());
  assert.ok(existsSync(join(kit, 'gate', 'render-core.mjs')) && existsSync(join(kit, 'builder', 'presets', 'level-3-full.json')));
  assert.ok(!existsSync(join(h, 'rules.source.md')), 'the rules source goes only to the kit');

  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  delete env.CLAUDE_CONFIG_DIR;
  const work = tempDir(t, 'pact-kit-run-');
  const builder = join(work, 'builder.json');
  // One changed part, so the kit's own renderer runs on it.
  writeFileSync(builder, `${JSON.stringify({ schema: 1, title: 'Mine', moves: [{ lead: 'Mine', text: 'My one move.' }] })}\n`);
  const run = args => spawnSync(process.execPath, [join(kit, 'builder', 'build.mjs'), ...args], { encoding: 'utf8', env, cwd: work });
  const out = join(work, 'page.html');
  const ok = run(['--builder', builder, '--out', out]);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(readFileSync(out, 'utf8'), /<title>Scriptorium<\/title>/);
  const self = run([]);
  assert.equal(self.status, 1, self.stdout);
  assert.match(self.stdout, /never rebuilds its own page/);
  const inHome = run(['--builder', builder, '--out', join(h, 'page.html')]);
  assert.equal(inHome.status, 1, inHome.stdout);
  assert.match(inHome.stdout, /outside the Claude home folder/);
});

// #464 T8 C5, C6: the kit holds the text the page shows, and the live install is what it was.
test('the kit holds review.md, every command and the overlay, a page from the kit shows them, and none of them goes live any new way', t => {
  const repo = repoWithKit(t);
  const h = home(t);
  passed(applyBound(repo, h));
  const kit = join(h, 'pact', 'builder');
  const fromRepo = rel => readFileSync(join(repo, ...rel.split('/')), 'utf8');
  const commands = readdirSync(join(repo, 'claude', 'commands')).sort();
  assert.ok(commands.length > 1, 'the commit holds a command that is off');
  assert.deepEqual(readdirSync(join(kit, 'claude', 'commands')).sort(), commands);
  for (const rel of ['claude/review.md', 'claude/settings.overlay.json', ...commands.map(f => `claude/commands/${f}`)]) {
    assert.equal(readFileSync(join(kit, ...rel.split('/')), 'utf8'), fromRepo(rel), `${rel} is in the kit`);
  }
  assert.deepEqual(readdirSync(join(h, 'commands')), ['scriptorium.md'], 'a command that is off stays out of the live folder');
  assert.equal(readFileSync(join(h, 'pact', 'review.md'), 'utf8'), fromRepo('claude/review.md'));
  assert.ok(!listTree(h).some(rel => /settings\.overlay\.json$/.test(rel) && !rel.replaceAll('\\', '/').includes('pact/builder/')), 'the overlay is copied only to the kit');
  const overlay = JSON.parse(fromRepo('claude/settings.overlay.json'));
  const merged = JSON.parse(readFileSync(join(h, 'settings.json'), 'utf8'));
  assert.equal(merged.permissions.defaultMode, overlay.permissions.defaultMode, 'the overlay is still merged');
  assert.equal(merged.skipAutoPermissionPrompt, overlay.skipAutoPermissionPrompt, 'the overlay is still merged');

  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  delete env.CLAUDE_CONFIG_DIR;
  const work = tempDir(t, 'pact-kit-text-');
  const builder = join(work, 'builder.json');
  writeFileSync(builder, `${JSON.stringify({ schema: 1 })}\n`);
  const out = join(work, 'page.html');
  const ok = spawnSync(process.execPath, [join(kit, 'builder', 'build.mjs'), '--builder', builder, '--out', out], { encoding: 'utf8', env, cwd: work });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  const data = JSON.parse(/\/\* pact-data:begin \*\/ ([\s\S]*?) \/\* pact-data:end \*\//.exec(readFileSync(out, 'utf8'))[1]);
  assert.equal(data.pactText.review, fromRepo('claude/review.md'));
  assert.equal(data.pactText.settings, fromRepo('claude/settings.overlay.json'));
  assert.deepEqual(data.pactText.commands.map(c => c.name), commands.map(f => f.slice(0, -3)));
});

// rules-source-in-tree: the rules source is the install's own copy, never a file a commit brings.
test('bad case: a commit holding claude/rules.source.md refuses, and changes nothing', t => {
  const repo = repoWithKit(t, root => writeFileSync(join(root, 'claude', 'rules.source.md'), 'not the rules\n'));
  const h = home(t);
  const before = listTree(h);
  refused(install(repo, h, { apply: true }), /^REFUSED: the commit holds claude\/rules\.source\.md, a file only the install makes/m);
  assert.deepEqual(listTree(h), before);
});

// rules-source-hash: the kit's rules are the commit's own bytes.
test('bad case: a rules source that differs from the commit\'s rules refuses, and changes nothing', t => {
  const repo = repoWithKit(t, root => {
    const p = join(root, 'gate', 'install-run.mjs');
    const s = readFileSync(p, 'utf8');
    const line = 'copyFileSync(rulesStaged, live(stage, core.KIT_RULES_REL));';
    assert.equal(s.split(line).length, 2, 'the runner copies the rules source in one place');
    writeFileSync(p, s.replace(line, "writeFileSync(live(stage, core.KIT_RULES_REL), 'other rules\\n');"));
  });
  const h = home(t);
  const before = listTree(h);
  refused(install(repo, h, { apply: true }), /^REFUSED: the copy of claude\/CLAUDE\.md made for the builder kit does not match the commit's\./m);
  assert.deepEqual(listTree(h), before);
});

// kit-incomplete: /scriptorium never installs half a kit.
test('bad case: a commit with /scriptorium but without a kit file refuses, and changes nothing', t => {
  const repo = repoWithKit(t, root => rmSync(join(root, 'builder', 'parts.mjs')));
  const h = home(t);
  const before = listTree(h);
  const r = install(repo, h, { apply: true });
  refused(r, /^REFUSED: the commit holds \/scriptorium but not all of its builder kit: builder\/parts\.mjs\./m);
  assert.deepEqual(listTree(h), before);
});
