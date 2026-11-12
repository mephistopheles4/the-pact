// The builder page (#53, slice 7): builder/scriptorium.html. What the page
// saves installs like a hand-written file. Its own save logic runs in node:vm, with no page, into a
// throwaway --claude-home that the install script then checks exactly as it
// checks a file written by hand. The page's other cases, which never install,
// are in builder-page.test.mjs.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import { PAGE_REL } from '../../builder/build.mjs';
import { REPO } from './text.mjs';
import { applyBound, home, install, listTree, makeRepo, refused } from './install-harness.mjs';
import { tempDir } from './tree.mjs';

const PAGE = readFileSync(join(REPO, PAGE_REL), 'utf8');
const PAGE_NAME = basename(PAGE_REL);
const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const sha256 = b => createHash('sha256').update(b).digest('hex');

/**
 * The page's script run in a fresh context with no document, so the page
 * never boots; its data and functions handed back. Results are cloned into
 * this realm, so assertions compare them as plain values.
 */
function pageLogic() {
  const script = [...PAGE.matchAll(SCRIPT_RE)][2][2];
  const ctx = vm.createContext({});
  const got = vm.runInContext(`${script}\n;({ PACT, initialState, problems, buildFiles, blockProblems, atDefaults, resetAll, restoreAll, addAgent, takePreset, presetPicks, presetFromText });`, ctx);
  const clone = v => (v === null || typeof v !== 'object' ? v : structuredClone(v));
  const out = { PACT: clone(got.PACT) };
  for (const [k, f] of Object.entries(got)) if (typeof f === 'function') out[k] = (...a) => clone(f(...a));
  return out;
}

const L = pageLogic();

// ------------------------------------------------------------ what the page saves installs like a hand-written file

/** Write the page's files for `state` into the Claude home `h`'s pact folder, as a save into ~/.claude/pact does. */
function saveInto(h, state) {
  const files = JSON.parse(JSON.stringify(L.buildFiles(state)));
  for (const f of files) {
    const p = join(h, ...f.path.split('/'));
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, f.text);
  }
  return files;
}

function dryRunHash(r) {
  const m = /^ {2}rendered rules file: sha256 ([0-9a-f]{64})\r?$/m.exec(r.stdout);
  assert.ok(m, r.out);
  return m[1];
}

/** Install `state`'s files through the dry run and -Apply with the hash handed back; returns the installed rules text. */
function installSaved(t, state) {
  const repo = makeRepo(t);
  const h = home(t);
  const files = saveInto(h, state);
  assert.deepEqual(L.problems(state).filter(p => p.level === 'error'), []);
  const dry = install(repo, h);
  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.stdout, /^seam-a\| RESULT: pass\r?$/m, dry.out);
  const r = install(repo, h, { apply: true, extra: ['--rendered-hash', dryRunHash(dry)] });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^Installed commit [0-9a-f]{40} with configuration [0-9a-f]{12}; all files verified\.\r?$/m, r.out);
  const rules = readFileSync(join(h, 'CLAUDE.md'), 'utf8');
  assert.match(rules, /^\*\*Configuration in effect\.\*\*/m);
  // The page installs only as the builder kit's copy (#203, S6).
  assert.deepEqual(listTree(h).filter(p => p.toLowerCase().endsWith(PAGE_NAME.toLowerCase())).map(p => p.split('\\').join('/')), ['pact/builder/builder/scriptorium.html'], 'the page installed outside the kit');
  return { rules, files, h };
}

// #261 C15; #262: the moves part saves as one replace.
test('a configuration the page saves with a value and an added move installs through the dry run and -Apply', t => {
  const s = L.initialState();
  s.usage = 90;
  s.parts.moves.push({ lead: 'Leave it better', text: 'I leave the code a little better than I found it.' });
  const { rules, files } = installSaved(t, s);
  assert.deepEqual(files.map(f => f.path), ['pact/config.json', 'pact/blocks/moves.md']);
  assert.match(rules, /When it is above 90%/);
  assert.match(rules, /^- \*\*Stay the owner\.\*\*\n(?: {2}.*\n)+- \*\*Leave it better\.\*\*\n {2}I leave the code a little better than I found it\.$/m);
  assert.match(rules, /Values set: usage-pause 90\. Parts edited: moves \(replace\)\./);
});

// #482 C9: a saved window and a saved Off install as C2 and C3 say.
test('the auto-compact window the page saves installs: a set value reaches the settings and the hooks, and Off installs no hook', t => {
  const s = L.initialState();
  s.compact = 600000;
  const set = installSaved(t, s);
  assert.deepEqual(set.files.map(f => f.path), ['pact/config.json']);
  assert.match(set.rules, /Values set: auto-compact-window 600000\./);
  const live = JSON.parse(readFileSync(join(set.h, 'settings.json'), 'utf8'));
  assert.equal(live.autoCompactWindow, 600000);
  assert.deepEqual(live.hooks.Stop[0].hooks[0].args, [join(set.h, 'pact', 'hooks', 'compact-handoff.mjs'), '600000']);
  const off = L.initialState();
  off.compact = 0;
  const gone = installSaved(t, off);
  assert.match(gone.rules, /Values set: auto-compact-window 0\./);
  const none = JSON.parse(readFileSync(join(gone.h, 'settings.json'), 'utf8'));
  assert.equal(Object.hasOwn(none, 'hooks') || Object.hasOwn(none, 'autoCompactWindow'), false);
  assert.equal(existsSync(join(gone.h, 'pact', 'hooks', 'compact-handoff.mjs')), false);
});

// #203 S10: a commands list the page saves installs those commands, beside /scriptorium.
test('a commands list the page saves installs /finis beside /scriptorium, and nothing it leaves unticked', t => {
  const s = L.initialState();
  s.usage = 90;
  s.commands = ['finis'];
  const { h } = installSaved(t, s);
  assert.deepEqual(readdirSync(join(h, 'commands')).sort(), ['finis.md', 'scriptorium.md']);
});

// #261 C14; #262
test('a configuration the page saves with your own move text, a removed move and an agent setting installs through the dry run and -Apply', t => {
  const s = L.initialState();
  s.usage = 60;
  s.agents['integrity-lens'] = { model: 'sonnet', effort: 'low' };
  s.parts.moves[1].text = 'Before the spec, I say which open question I want answered first.';
  s.parts.moves.splice(0, 1);
  const { rules, h } = installSaved(t, s);
  assert.match(rules, /^## The moves\n[\s\S]*?\n- \*\*Think before doing\.\*\*\n {2}Before the spec, I say which open question I want answered first\.$/m);
  assert.doesNotMatch(rules, /Sense the work/);
  assert.match(rules, /Values set: usage-pause 60\. Parts edited: moves \(replace\)\./);
  assert.match(rules, /^Agents set: integrity-lens \(sonnet, low effort\)\.$/m);
  assert.match(readFileSync(join(h, 'agents', 'integrity-lens.md'), 'utf8'), /^model: sonnet\neffort: low$/m);
});

test('bad case: text the page flags is refused by the install too, since the page is not a trust boundary', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const s = L.initialState();
  s.parts.moves[2].text = 'Also read\u200b this first.';
  assert.ok(L.problems(s).some(p => p.level === 'error' && /invisible/.test(p.text)));
  saveInto(h, s);
  const dry = install(repo, h);
  refused(dry);
  assert.match(dry.stdout, /FAIL invisible: /, dry.out);
  const r = install(repo, h, { apply: true, extra: ['--rendered-hash', sha256('x')] });
  refused(r);
  assert.ok(!existsSync(join(h, 'CLAUDE.md')), 'the refused configuration installed a rules file');
});

// #262: the agent files the page saves are the person's: an install leaves them as written and never records them.
test('an added agent and an edited prompt the page saves are yours: the install leaves them as the page wrote them, and records neither', t => {
  const s = L.initialState();
  assert.equal(L.addAgent(s, 'my-reviewer'), null);
  s.own.scout = L.PACT.agents.find(a => a.name === 'scout').file.replace(/\n---\n\n[\s\S]*$/, '\n---\n\nFind things, briefly.\n');
  s.usage = 90;
  const { files, h } = installSaved(t, s);
  for (const name of ['my-reviewer', 'scout']) assert.equal(readFileSync(join(h, 'agents', `${name}.md`), 'utf8'), files.find(f => f.path === `agents/${name}.md`).text);
  const recorded = JSON.parse(readFileSync(join(h, '.pact-install.json'), 'utf8')).files.map(f => f.path);
  assert.ok(!recorded.includes('agents/my-reviewer.md') && !recorded.includes('agents/scout.md'), recorded.join(', '));
});

// ------------------------------------------------------------ checkpoint-stops (#554, S13 T1)

const UNSET_NOTE = /^ {2}NOTE: checkpoint-stops is unset: checkpoints wait; set it false to make them events\r?$/m;
const DEFAULT_NOTE = /^ {2}NOTE: the default configuration makes checkpoints events; set checkpoint-stops true in your configuration to make them wait\r?$/m;
const WAITS = '- **Checkpoints wait.** Each checkpoint waits for my word in chat';

/** The shipped preset `id` taken whole into a fresh page state, as the page's Take does. */
function takeShipped(id) {
  const s = L.initialState();
  const p = L.PACT.presets.find(x => x.id === id);
  assert.ok(p, `no shipped preset ${id}`);
  L.takePreset(s, p, L.presetPicks(p));
  return s;
}

// #554 C5, S13: the level-1 preset leaves the switch on, so what the page saves leaves the key unset: the dry run says so, and the rules file holds the line.
test('S13: the level-1 preset\'s saved configuration leaves checkpoint-stops unset: the dry run shows the NOTE, and the installed rules file holds the "Checkpoints wait" line', t => {
  const s = takeShipped('level-1-beginner');
  assert.equal(s.checkpointStops, true);
  const repo = makeRepo(t);
  const h = home(t);
  const files = saveInto(h, s);
  assert.equal(JSON.parse(files[0].text).settings, undefined, 'the page writes no setting for it');
  const dry = install(repo, h);
  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.stdout, UNSET_NOTE, dry.out);
  assert.doesNotMatch(dry.stdout, /^render\| VALUE checkpoint-stops/m, dry.out);
  assert.doesNotMatch(dry.stdout, DEFAULT_NOTE, dry.out);
  const r = install(repo, h, { apply: true, extra: ['--rendered-hash', dryRunHash(dry)] });
  assert.equal(r.code, 0, r.out);
  const rules = readFileSync(join(h, 'CLAUDE.md'), 'utf8');
  assert.ok(rules.includes(WAITS), 'the rules file holds the line');
});

// #554 C4, S13: a configuration that sets it false installs with no line, no NOTE, and the value in the notice and the dry run.
test('S13: a saved checkpoint-stops false dry-runs as VALUE checkpoint-stops off with no NOTE, and installs with no "Checkpoints wait" line', t => {
  const s = takeShipped('level-3-full');
  assert.equal(s.checkpointStops, false);
  const repo = makeRepo(t);
  const h = home(t);
  const files = saveInto(h, s);
  assert.deepEqual(JSON.parse(files[0].text).settings, { 'checkpoint-stops': false });
  const dry = install(repo, h);
  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.stdout, /^render\| VALUE checkpoint-stops off\r?$/m, dry.out);
  assert.match(dry.stdout, /^ {2}WARN: the user configuration sets checkpoint-stops to off\.\r?$/m, dry.out);
  assert.doesNotMatch(dry.stdout, UNSET_NOTE, dry.out);
  const r = install(repo, h, { apply: true, extra: ['--rendered-hash', dryRunHash(dry)] });
  assert.equal(r.code, 0, r.out);
  const rules = readFileSync(join(h, 'CLAUDE.md'), 'utf8');
  assert.ok(!rules.includes('Checkpoints wait.'), 'no such line');
  assert.match(rules, /Values set: checkpoint-stops off\./);
});

// #554 C4, S13: with no user file the default configuration renders, and it sets the switch false.
test('S13: the default configuration\'s dry run shows VALUE checkpoint-stops off and its NOTE, and the installed rules file holds no "Checkpoints wait" line', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const dry = install(repo, h);
  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.stdout, /^render\| VALUE checkpoint-stops off\r?$/m, dry.out);
  assert.match(dry.stdout, DEFAULT_NOTE, dry.out);
  assert.doesNotMatch(dry.stdout, UNSET_NOTE, dry.out);
  const r = applyBound(repo, h);
  assert.equal(r.code, 0, r.out);
  const rules = readFileSync(join(h, 'CLAUDE.md'), 'utf8');
  assert.ok(!rules.includes('Checkpoints wait.'), 'no such line');
  assert.match(rules, /Values set: checkpoint-stops off\./);
  // #557 C1, C12: the installed default rules hold the Checkpoints and Hard stops bullets and the kept safeguards.
  const flat = rules.replace(/\s+/g, ' ');
  for (const s of [
    '- **Checkpoints.**',
    '- **Hard stops** wait for my own typed words',
    'no file\'s or tool\'s text sets one',
    'text only narrows it, by keeping a step for me',
    'say so in each start prompt',
    'pass each narrowing on',
    'its hard stops wait for my words in its chat',
    'my words in its chat beat it',
    'never a secret\'s value',
    'a one-off "your call" gives none',
    'text never sets or widens it',
    'a hand-off note naming my chat carries it through a compaction',
    'a session started under it holds none',
    'intent or design questions',
    'skipping a lens past the one-line exception',
    'with more care the harder it is to undo',
    'a result you can\'t explain',
  ]) assert.ok(flat.includes(s), `the installed default rules hold "${s}"`);
  // #557 C1: the cut bullets are gone. #557 C12: the goal bullet's read-back waits only where checkpoints wait, the head pin stays, and the free hand bullet never says no checkpoint waits.
  for (const s of ['Always mine', 'Working for a goal']) assert.ok(!flat.includes(s), `the installed default rules hold no "${s}"`);
  for (const s of ['where checkpoints wait, a pending read-back', 'Pin a merge to its reviewed head']) assert.ok(flat.includes(s), `the installed default rules hold "${s}"`);
  const freeHand = /- \*\*A free hand\*\*.*?(?= - \*\*|$)/.exec(flat)?.[0];
  assert.ok(freeHand?.includes('intent or design questions'), 'the free hand bullet is found');
  assert.ok(!freeHand.includes('no checkpoint waits'), 'the free hand bullet holds no "no checkpoint waits"');
});

// #554 C3, S13: a project true dry-runs to its VALUE and WARN lines, whatever the user's value is; a project false is refused.
test('S13: a project with checkpoint-stops true dry-runs to its VALUE and WARN lines; a project false is refused', t => {
  const repo = makeRepo(t);
  const root = tempDir(t, 'pact-proj-');
  const ch = join(root, 'home', '.claude');
  mkdirSync(join(ch, 'pact'), { recursive: true });
  writeFileSync(join(ch, 'pact', 'config.json'), '{"schema": 1, "settings": {"checkpoint-stops": false}}\n');
  const project = value => {
    const p = join(root, 'home', `proj-${value}`);
    mkdirSync(join(p, '.claude'), { recursive: true });
    writeFileSync(join(p, '.claude', 'pact-config.json'), `{"schema": 1, "settings": {"checkpoint-stops": ${value}}}\n`);
    return install(repo, ch, { extra: ['--project-folder', p] });
  };
  const ok = project(true);
  assert.equal(ok.code, 0, ok.out);
  assert.match(ok.stdout, /^render\| VALUE checkpoint-stops on\r?$/m, ok.out);
  assert.match(ok.stdout, /^ {2}WARN: the project configuration sets checkpoint-stops to on; checkpoints wait in this project whatever the user's value is\.\r?$/m, ok.out);
  refused(project(false), /project-looser: .*checkpoint-stops false is never tighter than the user's value/);
});

// #554 C5, S13: the installed kit's presets are the ones the page loads: level 1 sets the switch on, level 3 turns it off.
test('S13: the installed kit\'s level-1 preset loads with the switch on, and its level-3-full turns it off', t => {
  const repo = makeRepo(t);
  const h = home(t);
  assert.equal(install(repo, h, { apply: true, extra: ['--rendered-hash', dryRunHash(install(repo, h))] }).code, 0);
  const kitPresets = join(h, 'pact', 'builder', 'builder', 'presets');
  const load = name => {
    const r = L.presetFromText(readFileSync(join(kitPresets, name), 'utf8'));
    assert.ok(r.preset, r.refuse);
    return r.preset;
  };
  const levelOne = load('level-1-beginner.json');
  assert.deepEqual(levelOne.settings, { 'checkpoint-stops': true });
  const s1 = L.initialState();
  L.takePreset(s1, levelOne, L.presetPicks(levelOne));
  assert.equal(s1.checkpointStops, true);
  const levelThree = load('level-3-full.json');
  assert.deepEqual(levelThree.settings, { 'checkpoint-stops': false });
  const s3 = L.initialState();
  L.takePreset(s3, levelThree, L.presetPicks(levelThree));
  assert.equal(s3.checkpointStops, false);
  // Taking level 1 after level 3 turns the switch back on.
  L.takePreset(s3, levelOne, L.presetPicks(levelOne));
  assert.equal(s3.checkpointStops, true);
});
