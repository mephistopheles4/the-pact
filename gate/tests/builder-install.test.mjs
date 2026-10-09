// The builder page (#53, slice 7): builder/scriptorium.html. What the page
// saves installs like a hand-written file. Its own save logic runs in node:vm, with no page, into a
// throwaway -ClaudeHome that the install script then checks exactly as it
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
  const got = vm.runInContext(`${script}\n;({ PACT, initialState, problems, buildFiles, addPreset, blockProblems, slotText, slotOp, applyWorkflow, agentProblems, skillProblems, snapshotSlots, restoreSlots, atDefaults, resetAll, restoreAll, wizardSteps, stepSummary, overrides });`, ctx);
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
    const p = join(h, 'pact', ...f.path.split('/'));
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
  const r = install(repo, h, { apply: true, extra: ['-RenderedHash', dryRunHash(dry)] });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^Installed commit [0-9a-f]{40} with configuration [0-9a-f]{12}; all files verified\.\r?$/m, r.out);
  const rules = readFileSync(join(h, 'CLAUDE.md'), 'utf8');
  assert.match(rules, /^\*\*Configuration in effect\.\*\*/m);
  // The page is never installed.
  assert.ok(!listTree(h).some(p => p.toLowerCase().endsWith(PAGE_NAME.toLowerCase())), 'the page was installed');
  return { rules, files, h };
}

test('a configuration the page saves with a value and every preset installs through the dry run and -Apply', t => {
  const s = L.initialState();
  s.usage = 90;
  for (const p of L.PACT.presets) assert.equal(L.addPreset(s, p.mark, p.id), null);
  const { rules, files } = installSaved(t, s);
  assert.deepEqual(files.map(f => f.path), ['config.json', 'blocks/move-1.md', 'blocks/move-2.md', 'blocks/move-3.md', 'blocks/move-4-extra.md']);
  assert.match(rules, /the weekly limit is above 90%/);
  for (const p of L.PACT.presets) for (const line of p.text.split('\n')) assert.ok(rules.includes(`   ${line}\n`), `${p.id}: ${line}`);
  assert.match(rules, /Values set: usage-pause 90\. Parts edited: move-1 \(add-after\), move-2 \(add-after\), move-3 \(add-after\), move-4-extra \(add-after\)\./);
});

test('a configuration the page saves with your own text and a removal installs through the dry run and -Apply', t => {
  const s = L.initialState();
  s.usage = 60;
  s.agents['integrity-lens'] = { model: 'sonnet', effort: 'low' };
  s.slots['move-1'].replaced = true;
  s.slots['move-2'] = { replaced: false, cards: [{ kind: 'custom', text: 'Before the spec, ask me which open question I want answered first.\r\n' }] };
  s.slots['move-4-extra'] = { replaced: false, cards: [{ kind: 'custom', text: 'Say which tests you ran.' }, { kind: 'preset', id: 'move-4-docs-check' }, { kind: 'agent', name: 'my-reviewer', reads: 'the diff' }] };
  const { rules, h } = installSaved(t, s);
  assert.match(rules, /^ {3}Before the spec, ask me which open question I want answered first\.$/m);
  assert.match(rules, /^ {3}Say which tests you ran\.\n {3}After the checks, list each public interface/m);
  assert.match(rules, /^ {3}Then run `my-reviewer`, an agent from your own agents folder, on the diff, and post its report on the issue\.$/m);
  // move-1 was removed: its default text is gone. Control: the default render carries it.
  assert.doesNotMatch(rules, /I triage it: what kind of work it is/);
  assert.match(readFileSync(join(REPO, 'claude', 'CLAUDE.md'), 'utf8'), /I triage it: what kind of work it is/);
  assert.match(rules, /Values set: usage-pause 60\. Parts edited: move-1 \(remove\), move-2 \(add-after\), move-4-extra \(add-after\)\./);
  assert.match(rules, /^Agents set: integrity-lens \(sonnet, low effort\)\.$/m);
  assert.match(readFileSync(join(h, 'agents', 'integrity-lens.md'), 'utf8'), /^model: sonnet\neffort: low$/m);
});

test('bad case: text the page flags is refused by the install too, since the page is not a trust boundary', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const s = L.initialState();
  s.slots['move-3'] = { replaced: false, cards: [{ kind: 'custom', text: 'Also read @secrets.md first.' }] };
  assert.ok(L.problems(s).some(p => p.level === 'error' && /import/.test(p.text)));
  saveInto(h, s);
  const dry = install(repo, h);
  refused(dry);
  assert.match(dry.stdout, /FAIL block-text: /, dry.out);
  const r = install(repo, h, { apply: true, extra: ['-RenderedHash', sha256('x')] });
  refused(r);
  assert.ok(!existsSync(join(h, 'CLAUDE.md')), 'the refused configuration installed a rules file');
});
