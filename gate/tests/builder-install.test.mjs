// The builder page (#53, slice 7): builder/scriptorium.html. What the page
// saves installs like a hand-written file. Its own save logic runs in node:vm, with no page, into a
// throwaway --claude-home that the install script then checks exactly as it
// checks a file written by hand. The page's other cases, which never install,
// are in builder-page.test.mjs.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import { PAGE_REL } from '../../builder/build.mjs';
import { REPO } from './text.mjs';
import { home, install, listTree, makeRepo, refused } from './install-harness.mjs';

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
  const script = [...PAGE.matchAll(SCRIPT_RE)][0][2];
  const ctx = vm.createContext({});
  const got = vm.runInContext(`${script}\n;({ PACT, initialState, problems, buildFiles, blockProblems, atDefaults, resetAll, restoreAll, addAgent });`, ctx);
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
