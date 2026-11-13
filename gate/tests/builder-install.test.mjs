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

// ------------------------------------------------------------ checkpoint-stops, retired (#564)

const NOTE = /^ {2}NOTE: checkpoints never wait; each is the session's own logged pick, and only hard stops wait for you \(ADR 0157\)\.\r?$/m;
const WAITS = 'Checkpoints wait';

/** The shipped preset `id` taken whole into a fresh page state, as the page's Take does. */
function takeShipped(id) {
  const s = L.initialState();
  const p = L.PACT.presets.find(x => x.id === id);
  assert.ok(p, `no shipped preset ${id}`);
  L.takePreset(s, p, L.presetPicks(p));
  return s;
}

// #564 C4a, C7: a preset's saved configuration holds no settings, the dry run says checkpoints never wait, and the installed rules hold no wait line.
test('S13: a shipped preset\'s saved configuration holds no settings key for checkpoints: the dry run shows the NOTE and no WARN, and the installed rules hold no "Checkpoints wait" line', t => {
  for (const id of ['level-1-beginner', 'level-3-full']) {
    const s = takeShipped(id);
    assert.equal(s.checkpointStops, undefined, 'the page state holds no such switch');
    const repo = makeRepo(t);
    const h = home(t);
    const files = saveInto(h, s);
    assert.equal(JSON.parse(files[0].text).settings, undefined, 'the page writes no settings');
    const dry = install(repo, h);
    assert.equal(dry.code, 0, dry.out);
    assert.match(dry.stdout, NOTE, dry.out);
    assert.doesNotMatch(dry.stdout, /checkpoint-stops/, dry.out);
    const r = install(repo, h, { apply: true, extra: ['--rendered-hash', dryRunHash(dry)] });
    assert.equal(r.code, 0, r.out);
    assert.ok(!readFileSync(join(h, 'CLAUDE.md'), 'utf8').includes(WAITS), 'no such line');
  }
});

// #564 C3, S7.2a: a user file that still sets the key, either value, installs as without it, with the WARN.
test('S13: a configuration that still sets checkpoint-stops dry-runs to the retired-key WARN and the NOTE, and installs with no "Checkpoints wait" line', t => {
  const words = { true: 'checkpoints no longer wait', false: 'false changes nothing' };
  for (const value of ['true', 'false']) {
    const repo = makeRepo(t);
    const h = home(t);
    mkdirSync(join(h, 'pact'), { recursive: true });
    writeFileSync(join(h, 'pact', 'config.json'), `{"schema": 1, "settings": {"checkpoint-stops": ${value}}}\n`);
    const dry = install(repo, h);
    assert.equal(dry.code, 0, dry.out);
    assert.match(dry.stdout, new RegExp(`^render\\| RETIRED-SETTING checkpoint-stops ${value}\\r?$`, 'm'), dry.out);
    assert.doesNotMatch(dry.stdout, /VALUE checkpoint-stops/, dry.out);
    assert.match(dry.stdout, new RegExp(`^ {2}WARN: the user configuration sets checkpoint-stops, which the pact retired[:;] ${words[value]}`, 'm'), dry.out);
    assert.match(dry.stdout, NOTE, dry.out);
    const r = install(repo, h, { apply: true, extra: ['--rendered-hash', dryRunHash(dry)] });
    assert.equal(r.code, 0, r.out);
    const rules = readFileSync(join(h, 'CLAUDE.md'), 'utf8');
    assert.ok(!rules.includes(WAITS) && !rules.includes('checkpoint-stops'), 'the installed rules never name the key');
  }
});

// #564 C1, C4a, S11.2: with no user file the default renders, with the NOTE and the kept safeguards, and no wait line.
test('S13: the default configuration\'s dry run shows the NOTE and no checkpoint-stops line, and the installed rules file holds no "Checkpoints wait" line', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const dry = install(repo, h);
  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.stdout, NOTE, dry.out);
  assert.doesNotMatch(dry.stdout, /checkpoint-stops/, dry.out);
  const r = applyBound(repo, h);
  assert.equal(r.code, 0, r.out);
  const rules = readFileSync(join(h, 'CLAUDE.md'), 'utf8');
  assert.ok(!rules.includes(WAITS), 'no such line');
  assert.ok(!rules.includes('checkpoint-stops'), 'the notice names no such value');
  // The installed default rules hold the Checkpoints and Hard stops bullets and the kept safeguards.
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
    'skipping a lens past the one-line exception',
    'with more care the harder it is to undo',
    'a result you can\'t explain',
  ]) assert.ok(flat.includes(s), `the installed default rules hold "${s}"`);
  // The cut bullets are gone, the head pin stays, no read-back or checkpoint wait remains, and the goal and free hand bullets grant no wait.
  for (const s of ['Always mine', 'Working for a goal', 'where checkpoints wait', 'no checkpoint waits', 'a pending read-back waits', 'take your own pick on lens offers']) assert.ok(!flat.includes(s), `the installed default rules hold no "${s}"`);
  assert.ok(flat.includes('Pin a merge to its reviewed head'), 'the installed default rules hold "Pin a merge to its reviewed head"');
  const freeHand = /- \*\*A free hand\*\*.*?(?= - \*\*|$)/.exec(flat)?.[0];
  assert.ok(freeHand?.includes('Holding one, say so in each start prompt'), 'the free hand bullet is found, and keeps its definition');
});

// #564 C4, S7.2b: a project file that sets the key, either value, dry-runs to the project WARN; false is no longer refused.
test('S13: a project with checkpoint-stops true or false dry-runs to the project WARN, and one holding only the key says to remove the file', t => {
  const repo = makeRepo(t);
  const root = tempDir(t, 'pact-proj-');
  const ch = join(root, 'home', '.claude');
  mkdirSync(join(ch, 'pact'), { recursive: true });
  writeFileSync(join(ch, 'pact', 'config.json'), '{"schema": 1, "settings": {"checkpoint-stops": false}}\n');
  const project = (name, body) => {
    const p = join(root, 'home', `proj-${name}`);
    mkdirSync(join(p, '.claude'), { recursive: true });
    writeFileSync(join(p, '.claude', 'pact-config.json'), body);
    return install(repo, ch, { extra: ['--project-folder', p] });
  };
  const yes = project('true', '{"schema": 1, "settings": {"usage-pause": 60, "checkpoint-stops": true}}\n');
  assert.equal(yes.code, 0, yes.out);
  assert.match(yes.stdout, /^render\| RETIRED-SETTING checkpoint-stops true\r?$/m, yes.out);
  assert.match(yes.stdout, /^ {2}WARN: the project configuration sets checkpoint-stops, which the pact retired: checkpoints no longer wait in this project\. Take the key out\.\r?$/m, yes.out);
  const no = project('false', '{"schema": 1, "settings": {"usage-pause": 60, "checkpoint-stops": false}}\n');
  assert.equal(no.code, 0, no.out);
  assert.match(no.stdout, /^ {2}WARN: the project configuration sets checkpoint-stops, which the pact retired; false changes nothing\. Take the key out\.\r?$/m, no.out);
  const only = project('only', '{"schema": 1, "settings": {"checkpoint-stops": true}}\n');
  assert.equal(only.code, 0, only.out);
  assert.match(only.stdout, /Take the key out\. It is the file's only setting, so remove the file\./, only.out);
});
