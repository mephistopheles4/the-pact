// The builder page (#53, slice 7): builder/scriptorium.html. The page is never
// installed and is not gate code; the installer is the authority on what it
// saves. These tests read the page as text and hold it to its content policy,
// check its carried pact text against the repo, and run its own save logic
// (in node:vm, with no page) into a throwaway -ClaudeHome that the install
// script then checks exactly as it checks a file written by hand.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import vm from 'node:vm';
import { EXAMPLE_BUILDER_REL, PAGE_REL, buildPage, checkBuilder } from '../../builder/build.mjs';
import { RENDER, REPO, lastLine, tempDir } from './helpers.mjs';
import { WIN, home, install, listTree, makeRepo, refused } from './install-harness.mjs';

const PAGE = readFileSync(join(REPO, PAGE_REL), 'utf8');
const sha256b64 = s => createHash('sha256').update(s, 'utf8').digest('base64');

// ------------------------------------------------------------ the page's checks

const CSP_META_RE = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/gi;
const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const STYLE_RE = /<style\b([^>]*)>([\s\S]*?)<\/style>/gi;

/** The page's markup with every script's and style's content taken out. */
const markupOf = html => html.replace(SCRIPT_RE, '<script$1></script>').replace(STYLE_RE, '<style$1></style>');

/** The policy's directives: name -> [source tokens]. */
function directives(content) {
  const out = new Map();
  for (const d of content.split(';')) {
    const [name, ...tokens] = d.trim().split(/\s+/);
    if (name) out.set(name.toLowerCase(), tokens);
  }
  return out;
}

/**
 * Every rule the page breaks, by code, in a fixed order. An empty list is a
 * pass. Each code has a planted bad page below that it is seen to catch.
 */
function pageProblems(html) {
  const found = new Set();
  const scripts = [...html.matchAll(SCRIPT_RE)];
  const styles = [...html.matchAll(STYLE_RE)];
  const metas = [...html.matchAll(CSP_META_RE)];
  const markup = markupOf(html);

  if (html.includes('\r')) found.add('cr');

  // No external URL: no scheme URL or protocol-relative URL anywhere, no
  // attribute that loads or sends anything, and no CSS that loads anything.
  if (/[a-z][a-z0-9+.-]*:\/\//i.test(html)) found.add('external-url');
  if (/["'`(=]\s*\/\/[^/\s]/.test(html)) found.add('external-url');
  if (/<[a-z][^>]*\s(?:src|href|action|formaction|srcset|poster|background|ping|data|codebase|manifest)\s*=/i.test(markup)) found.add('external-url');
  if (/<(?:link|base|iframe|frame|object|embed|img|audio|video|source|track|form|input[^>]*type\s*=\s*["']?image)\b/i.test(markup)) found.add('external-url');
  if (styles.some(s => /url\s*\(|@import/i.test(s[2]))) found.add('external-url');

  if (/\bfetch\s*\(/.test(html)) found.add('fetch');
  if (/\bimport\s*\(/.test(html)) found.add('import');
  if (/\binnerHTML\b/.test(html)) found.add('innerHTML');
  if (/\b(?:outerHTML|insertAdjacentHTML|srcdoc|createContextualFragment|DOMParser|parseHTMLUnsafe|setHTMLUnsafe)\b|\bdocument\s*\.\s*write(?:ln)?\b/.test(html)) found.add('html-sink');
  if (/\b(?:XMLHttpRequest|WebSocket|EventSource|sendBeacon|RTCPeerConnection|importScripts|SharedWorker|Worker\s*\()\b/.test(html)) found.add('network-api');

  // One script and one style, each a plain inline element.
  if (scripts.length !== 1 || scripts[0][1].trim() !== '') found.add('scripts');
  if (styles.length !== 1 || styles[0][1].trim() !== '') found.add('styles');
  // No inline handler or style attribute: the policy would block them, and a page that relies on one is broken.
  if (/<[a-z][^>]*\s(?:on[a-z]+|style)\s*=/i.test(markup)) found.add('inline-attr');

  // One policy meta tag, right after the charset, before any script or style.
  if (metas.length !== 1) found.add('csp-missing');
  else {
    const at = html.indexOf(metas[0][0]);
    const charset = html.search(/<meta charset="utf-8">/i);
    const firstCode = Math.min(...[html.search(/<script\b/i), html.search(/<style\b/i)].filter(i => i >= 0));
    if (charset < 0 || charset > at || at > firstCode || /<meta\b/i.test(html.slice(charset + 1, at))) found.add('csp-order');
    const d = directives(metas[0][1]);
    const only = (name, want) => JSON.stringify(d.get(name) ?? null) === JSON.stringify(want);
    if (!only('default-src', ["'none'"])) found.add('default-src');
    if (!only('connect-src', ["'none'"])) found.add('connect-src');
    if ([...d.values()].some(tokens => tokens.some(t => t.toLowerCase() === "'unsafe-inline'"))) found.add('unsafe-inline');
    if (scripts.length && !only('script-src', [`'sha256-${sha256b64(scripts[0][2])}'`])) found.add('script-hash');
    if (styles.length && !only('style-src', [`'sha256-${sha256b64(styles[0][2])}'`])) found.add('style-hash');
  }
  return [...found];
}

/** The page with its policy hashes (and carried data) rebuilt, as builder/build.mjs writes it. */
const rehash = html => buildPage(REPO, html);

/** The page with `code` added as the first line of its script, hashes rebuilt, so only the planted rule can fire. */
const inScript = code => rehash(PAGE.replace("<script>\n'use strict';\n", `<script>\n'use strict';\n${code}\n`));

/** The page with `markup` added at the start of its body. */
const inBody = markup => PAGE.replace('<body>\n', `<body>\n${markup}\n`);

const policyOf = html => [...html.matchAll(CSP_META_RE)][0][1];
const withPolicy = (html, fn) => html.replace(CSP_META_RE, (m, c) => m.replace(c, fn(c)));

test('the page passes every check: no external URL, no fetch(, no import(, no innerHTML, a strict policy with hashes', () => {
  assert.deepEqual(pageProblems(PAGE), []);
  assert.match(policyOf(PAGE), /default-src 'none'/);
  assert.match(policyOf(PAGE), /connect-src 'none'/);
});

const BAD_PAGES = [
  ['a script string holding an external URL', () => inScript("const u = 'https://example.invalid/x.json';"), 'external-url'],
  ['a protocol-relative URL', () => inScript("const u = '//example.invalid/x';"), 'external-url'],
  ['an image tag loading a URL', () => inBody('<img src="https://example.invalid/x.png" alt="">'), 'external-url'],
  ['a stylesheet link to a relative file', () => inBody('<link rel="stylesheet" href="x.css">'), 'external-url'],
  ['a CSS url()', () => rehash(PAGE.replace('<style>\n', '<style>\nbody { background: url(x.png); }\n')), 'external-url'],
  ['a fetch( call', () => inScript("fetch('x.json');"), 'fetch'],
  ['an import( call', () => inScript("import('./x.mjs');"), 'import'],
  ['an innerHTML write', () => inScript("document.body.innerHTML = '';"), 'innerHTML'],
  ['another HTML-writing call', () => inScript("document.body.insertAdjacentHTML('beforeend', '');"), 'html-sink'],
  ['a network API', () => inScript('const x = new XMLHttpRequest();'), 'network-api'],
  ['a second script', () => PAGE.replace('</body>', '<script>1</script>\n</body>'), 'scripts'],
  ['an external script', () => PAGE.replace('<script>', '<script src="x.js">'), 'scripts'],
  ['an inline handler attribute', () => inBody('<button onclick="go()">Go</button>'), 'inline-attr'],
  ['a style attribute', () => inBody('<p style="color: red">x</p>'), 'inline-attr'],
  ['a missing policy', () => PAGE.replace(CSP_META_RE, ''), 'csp-missing'],
  ['a policy after the style and script', () => PAGE.replace(CSP_META_RE, '').replace('</style>', `</style>\n${[...PAGE.matchAll(CSP_META_RE)][0][0]}`), 'csp-order'],
  ["default-src not 'none'", () => withPolicy(PAGE, c => c.replace("default-src 'none'", "default-src 'self'")), 'default-src'],
  ['default-src missing', () => withPolicy(PAGE, c => c.replace("default-src 'none'; ", '')), 'default-src'],
  ["connect-src not 'none'", () => withPolicy(PAGE, c => c.replace("connect-src 'none'", 'connect-src *')), 'connect-src'],
  ['connect-src missing', () => withPolicy(PAGE, c => c.replace("; connect-src 'none'", '')), 'connect-src'],
  ["'unsafe-inline' for the script", () => withPolicy(PAGE, c => c.replace(/script-src '[^']*'/, "script-src 'unsafe-inline'")), 'unsafe-inline'],
  ["'unsafe-inline' beside the hash", () => withPolicy(PAGE, c => c.replace(/(script-src '[^']*')/, "$1 'unsafe-inline'")), 'unsafe-inline'],
  ['a script changed after its hash was taken', () => PAGE.replace("'use strict';", '"use strict";'), 'script-hash'],
  ['a script hash for other text', () => withPolicy(PAGE, c => c.replace(/script-src 'sha256-[^']*'/, `script-src 'sha256-${sha256b64('other')}'`)), 'script-hash'],
  ['a style changed after its hash was taken', () => PAGE.replace('* { box-sizing: border-box; }', '* { box-sizing: content-box; }'), 'style-hash'],
  ['a carriage return', () => PAGE.replace('<head>\n', '<head>\r\n'), 'cr'],
];

for (const [name, make, code] of BAD_PAGES) {
  test(`bad page: ${name} is caught (${code})`, () => {
    const bad = make();
    assert.notEqual(bad, PAGE, 'the plant changed nothing');
    assert.ok(pageProblems(bad).includes(code), `expected ${code}, got ${JSON.stringify(pageProblems(bad))}`);
  });
}

test('bad pages planted in the script fail only their own check, so each check is shown on its own', () => {
  for (const [code, line] of [
    ['fetch', "fetch('x.json');"],
    ['import', "import('./x.mjs');"],
    ['innerHTML', "document.body.innerHTML = '';"],
  ]) {
    assert.deepEqual(pageProblems(inScript(line)), [code]);
  }
});

// ------------------------------------------------------------ where the page lives

test('the page is outside claude/ and every path the install stages, so it is never installed', () => {
  const ps1 = readFileSync(join(REPO, 'scripts', 'install.ps1'), 'utf8');
  const m = /Invoke-GitBytes @\('ls-tree', '-r', '-z', '--full-tree', 'HEAD', '--', ([^)]*)\)/.exec(ps1);
  assert.ok(m, 'the install script no longer stages through the expected ls-tree line');
  const roots = [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
  assert.ok(roots.includes('claude') && roots.includes('gate'), JSON.stringify(roots));
  for (const r of roots) assert.ok(PAGE_REL !== r && !PAGE_REL.startsWith(`${r}/`), `${PAGE_REL} sits under the staged path ${r}`);
});

// ------------------------------------------------------------ the carried pact text

test('the page carries what builder/build.mjs builds from the repo now: the moves, the clauses, the setting and the presets', () => {
  assert.equal(buildPage(REPO, PAGE), PAGE, 'the page is out of date: run node builder/build.mjs');
});

/** A throwaway root holding the files builder/build.mjs reads, with `mutate` applied. */
function buildRoot(t, mutate) {
  const root = tempDir(t, 'pact-builder-root-');
  for (const d of ['claude', 'examples', 'familiars']) cpSync(join(REPO, d), join(root, d), { recursive: true });
  // The renderer and what it reads: build.mjs runs it for the agents' classes.
  cpSync(join(REPO, 'gate'), join(root, 'gate'), { recursive: true, filter: s => !s.includes(`${join('gate', 'tests')}`) });
  mutate(root);
  return root;
}

test('control: a copied root with nothing changed rebuilds the committed page exactly', t => {
  assert.equal(buildPage(buildRoot(t, () => {}), PAGE), PAGE);
});

test('bad case: a gated clause changed in the pact source makes the committed page out of date', t => {
  const root = buildRoot(t, r => {
    const p = join(r, 'claude', 'CLAUDE.md');
    writeFileSync(p, readFileSync(p, 'utf8').replace('Never\n   substitute another agent', 'Never\n   swap in another agent'));
  });
  assert.notEqual(buildPage(root, PAGE), PAGE);
});

test('bad case: an example block changed makes the committed page out of date', t => {
  const root = buildRoot(t, r => writeFileSync(join(r, 'examples', 'pact-config', 'blocks', 'move-3-done-criteria.md'), 'Read me each done-criterion back.\n'));
  assert.notEqual(buildPage(root, PAGE), PAGE);
});

// ------------------------------------------------------------ builder files: the check, and pages from them

/** A builder file written into a fresh folder, with `blocks` beside it; returns its path. */
function builderFile(t, doc, blocks = {}) {
  const dir = tempDir(t, 'pact-builder-file-');
  for (const [rel, text] of Object.entries(blocks)) {
    const p = join(dir, ...rel.split('/'));
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text);
  }
  const f = join(dir, 'pact-builder.json');
  writeFileSync(f, typeof doc === 'string' ? doc : `${JSON.stringify(doc, null, 2)}\n`);
  return f;
}

const GOOD = {
  schema: 1,
  title: 'Test builder',
  presets: [
    { id: 'grill-first', title: 'Grill first', slot: 'move-2', text: 'Before the spec, use the `grill-me` skill.', why: 'I think better when grilled.' },
    { id: 'ship-check', title: 'Ship check', slot: 'move-4-extra', file: 'presets/ship.md', why: 'Name the rollback.' },
  ],
  workflows: [{ id: 'mine', title: 'Mine', about: 'My usual run.', presets: ['grill-first', 'ship-check'] }],
  yours: { skills: [{ name: 'grill-me', description: 'Grill the plan' }], commands: [{ name: 'ship', description: 'Ship it' }], agents: [{ name: 'my-reviewer', description: 'Reviews' }] },
};
const GOOD_BLOCKS = { 'presets/ship.md': 'Before a deploy, name the rollback step on the issue.\n' };

test('the example builder file passes the check, with one finding: it lists none of the person\'s own skills', () => {
  const r = checkBuilder(REPO, join(REPO, EXAMPLE_BUILDER_REL));
  assert.deepEqual(r.refusals, []);
  assert.deepEqual(r.findings, ['yours lists no skills, commands or agents; the page\'s "Yours" section will say so']);
});

test('a person\'s builder file passes, and its page carries their presets, workflow and own skills beside the pact\'s own spine', t => {
  const f = builderFile(t, GOOD, GOOD_BLOCKS);
  const r = checkBuilder(REPO, f);
  assert.deepEqual(r.refusals, []);
  assert.deepEqual(r.findings, []);
  const page = buildPage(REPO, PAGE, f);
  assert.deepEqual(pageProblems(page), []);
  const script = [...page.matchAll(SCRIPT_RE)][0][2];
  const D = JSON.parse(JSON.stringify(vm.runInContext(`${script}\n;PACT`, vm.createContext({}))));
  assert.equal(D.title, 'Test builder');
  assert.deepEqual(D.presets.map(p => [p.id, p.mark]), [['grill-first', 'move-2'], ['ship-check', 'move-4-extra']]);
  assert.equal(D.presets[1].text, 'Before a deploy, name the rollback step on the issue.');
  assert.deepEqual(D.yours.skills.map(x => x.name), ['grill-me']);
  // The spine and the locked clauses come from the clone, never from the builder file.
  assert.equal(JSON.stringify(D.moves), JSON.stringify(L.PACT.moves));
  assert.equal(JSON.stringify(D.always), JSON.stringify(L.PACT.always));
});

const BAD_BUILDERS = [
  ['not JSON', () => '{ nope', /not strict JSON/],
  ['a duplicate key', () => '{ "schema": 1, "schema": 1 }\n', /not strict JSON/],
  ['the pact\'s own text in the file', () => ({ ...GOOD, moves: [] }), /top-level key/],
  ['another schema', () => ({ ...GOOD, schema: 2 }), /schema must be 1/],
  ['a gated clause as a slot', () => ({ ...GOOD, presets: [{ id: 'x', title: 'X', slot: 'move-4', text: 'Hi.' }], workflows: [] }), /slot must be one of/],
  ['an unknown slot', () => ({ ...GOOD, presets: [{ id: 'x', title: 'X', slot: 'move-9', text: 'Hi.' }], workflows: [] }), /slot must be one of/],
  ['both text and file', () => ({ ...GOOD, presets: [{ id: 'x', title: 'X', slot: 'move-3', text: 'Hi.', file: 'a.md' }], workflows: [] }), /exactly one of text and file/],
  ['a file path that climbs out', () => ({ ...GOOD, presets: [{ id: 'x', title: 'X', slot: 'move-3', file: '../a.md' }], workflows: [] }), /no \. or \.\. segment/],
  ['an absolute file path', () => ({ ...GOOD, presets: [{ id: 'x', title: 'X', slot: 'move-3', file: 'C:/a.md' }], workflows: [] }), /must be relative/],
  ['a missing preset file', () => ({ ...GOOD, presets: [{ id: 'x', title: 'X', slot: 'move-3', file: 'nope.md' }], workflows: [] }), /could not be read|not a regular file/],
  ['a bad preset id', () => ({ ...GOOD, presets: [{ id: 'Bad Id', title: 'X', slot: 'move-3', text: 'Hi.' }], workflows: [] }), /id must be lowercase/],
  ['a duplicate preset id', () => ({ ...GOOD, presets: [GOOD.presets[0], GOOD.presets[0]], workflows: [] }), /used twice/],
  ['a workflow naming a missing preset', () => ({ ...GOOD, workflows: [{ id: 'w', title: 'W', about: 'A', presets: ['nope'] }] }), /does not define/],
  ['a bad skill name', () => ({ ...GOOD, yours: { skills: [{ name: 'bad name!' }] } }), /needs a name/],
  ['a pact agent listed as yours', () => ({ ...GOOD, yours: { agents: [{ name: 'data-lens' }] } }), /pact's own agents/],
  ['a two-line why', () => ({ ...GOOD, presets: [{ ...GOOD.presets[0], why: 'a\nb' }], workflows: [] }), /why must be one line/],
  ['a preset the renderer refuses (an import)', () => ({ ...GOOD, presets: [{ id: 'x', title: 'X', slot: 'move-3', text: 'Read @notes.md first.' }], workflows: [] }), /renderer refuses its text \(FAIL block-text/],
  ['a preset the renderer refuses (a heading)', () => ({ ...GOOD, presets: [{ id: 'x', title: 'X', slot: 'move-3', text: '# Heading' }], workflows: [] }), /renderer refuses its text/],
];

for (const [name, make, rule] of BAD_BUILDERS) {
  test(`bad builder file: ${name} is refused`, t => {
    const r = checkBuilder(REPO, builderFile(t, make(), GOOD_BLOCKS));
    assert.equal(r.builder, null);
    assert.ok(r.refusals.some(m => rule.test(m)), JSON.stringify(r.refusals));
  });
}

test('bad case: builder text the page\'s content policy refuses is refused by the check', t => {
  for (const doc of [
    { ...GOOD, yours: { skills: [{ name: 'x-y', description: 'Docs at https://example.invalid/x' }] } },
    { ...GOOD, title: 'Uses fetch(x)' },
    { ...GOOD, presets: [{ ...GOOD.presets[0], why: 'Sets innerHTML' }], workflows: [] },
  ]) {
    const r = checkBuilder(REPO, builderFile(t, doc, GOOD_BLOCKS));
    assert.equal(r.builder, null);
    assert.ok(r.refusals.some(m => /content policy refuses/.test(m)), JSON.stringify(r.refusals));
  }
});

/** The logic of a page built from builder file `f`, run in vm as for the shipped page. */
function logicOf(page) {
  const script = [...page.matchAll(SCRIPT_RE)][0][2];
  const got = vm.runInContext(`${script}\n;({ PACT, initialState, applyWorkflow, buildFiles, slotOp });`, vm.createContext({}));
  const clone = v => (v === null || typeof v !== 'object' ? v : JSON.parse(JSON.stringify(v)));
  const out = { PACT: clone(got.PACT) };
  for (const [k, fn] of Object.entries(got)) if (typeof fn === 'function') out[k] = (...a) => clone(fn(...a));
  return out;
}

test('a workflow with a stand-in preset turns that slot\'s Replace on, so the preset stands in for the text', t => {
  const doc = { ...GOOD, presets: [...GOOD.presets, { id: 'lean-move-3', title: 'Lean move 3', slot: 'move-3', text: 'Build each ticket in its own session, test-first.', standsIn: true, why: 'Shorter.' }], workflows: [{ id: 'lean', title: 'Lean', about: 'Short move 3.', presets: ['lean-move-3', 'ship-check'] }] };
  const page = buildPage(REPO, PAGE, builderFile(t, doc, GOOD_BLOCKS));
  const P = logicOf(page);
  const s = P.initialState();
  assert.equal(P.applyWorkflow(s, 'lean'), null);
  // applyWorkflow mutated the vm copy; run it again on a state the vm owns and read the files.
  const files = vm.runInContext(`${[...page.matchAll(SCRIPT_RE)][0][2]}\n;(() => { const s = initialState(); applyWorkflow(s, 'lean'); return JSON.stringify(buildFiles(s)); })()`, vm.createContext({}));
  const edits = JSON.parse(JSON.parse(files)[0].text).edits;
  assert.deepEqual(edits, [{ mark: 'move-3', op: 'replace', file: 'move-3.md' }, { mark: 'move-4-extra', op: 'add-after', file: 'move-4-extra.md' }]);
  const two = checkBuilder(REPO, builderFile(t, { ...doc, presets: [...doc.presets, { ...doc.presets[2], id: 'lean-two' }], workflows: [{ id: 'w', title: 'W', about: 'A', presets: ['lean-move-3', 'lean-two'] }] }, GOOD_BLOCKS));
  assert.ok(two.refusals.some(m => /two presets stand in for one slot/.test(m)), JSON.stringify(two.refusals));
});

test('undo puts back the slots exactly as they were before a workflow', () => {
  const s = L.initialState();
  s.slots['move-2'] = { replaced: true, cards: [{ kind: 'custom', text: 'Mine.' }] };
  const snap = L.snapshotSlots(s);
  L.applyWorkflow(s, 'close-the-loop');
  assert.notDeepEqual(JSON.parse(JSON.stringify(s.slots)), JSON.parse(snap));
  L.restoreSlots(s, snap);
  assert.deepEqual(JSON.parse(JSON.stringify(s.slots)), JSON.parse(snap));
});

test('reset puts the usage value, every slot and every agent back to the plain pact, and undo puts it all back', () => {
  const s = L.initialState();
  assert.equal(L.atDefaults(s), true);
  assert.equal(L.buildFiles(s).length, 1);
  L.applyWorkflow(s, 'close-the-loop');
  s.usage = 90;
  s.slots['move-2'] = { replaced: true, cards: [{ kind: 'custom', text: 'Mine.' }] };
  // Every lens off its default, so a reset that misses one fails.
  for (const a of Object.keys(s.agents)) s.agents[a].model = s.agents[a].model === 'opus' ? 'sonnet' : 'opus';
  assert.equal(Object.keys(s.agents).length, 7);
  assert.equal(L.atDefaults(s), false);
  const changed = JSON.stringify(s);
  const before = L.resetAll(s);
  assert.equal(before, changed);
  assert.equal(L.atDefaults(s), true);
  assert.deepEqual(JSON.parse(JSON.stringify(s)), L.initialState());
  // A reset page saves the plain configuration: no settings, no edits, no agents.
  assert.deepEqual(L.buildFiles(s), [{ path: 'config.json', text: '{\n  "schema": 1\n}\n' }]);
  L.restoreAll(s, before);
  assert.equal(JSON.stringify(s), changed);
});
test('findings never refuse: a preset with no why, and one naming a skill the file does not list', t => {
  const r = checkBuilder(REPO, builderFile(t, { ...GOOD, presets: [{ id: 'x', title: 'X', slot: 'move-3', text: 'Use the `ghost-skill` skill.' }], workflows: [] }));
  assert.deepEqual(r.refusals, []);
  assert.ok(r.findings.some(m => /no "why"/.test(m)), JSON.stringify(r.findings));
  assert.ok(r.findings.some(m => /not in yours/.test(m)), JSON.stringify(r.findings));
});

test('the command line writes a page from a builder file, and refuses to write over the shipped page or without a builder', t => {
  const f = builderFile(t, GOOD, GOOD_BLOCKS);
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  const cli = args => spawnSync(process.execPath, [join(REPO, 'builder', 'build.mjs'), ...args], { encoding: 'utf8', env });
  const out = join(tempDir(t, 'pact-builder-page-'), 'mine.html');
  const ok = cli(['--builder', f, '--out', out]);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /^RESULT: pass/m);
  assert.deepEqual(pageProblems(readFileSync(out, 'utf8')), []);
  const check = cli(['--builder', f, '--check']);
  assert.equal(check.status, 0, check.stdout);
  const over = cli(['--builder', f, '--out', join(REPO, PAGE_REL)]);
  assert.equal(over.status, 1, over.stdout);
  assert.match(over.stdout, /must be outside this clone/);
  // Any spelling of a path inside the clone, or of the builder file, is refused.
  for (const spelt of [join(REPO, 'builder', 'PACT-CONFIG.html'), join(REPO, 'builder', 'mine.html'), WIN ? REPO.charAt(0).toLowerCase() + REPO.slice(1) + '\\builder\\mine.html' : join(REPO, 'builder', 'mine.html')]) {
    const r = cli(['--builder', f, '--out', spelt]);
    assert.equal(r.status, 1, `${spelt}: ${r.stdout}`);
    assert.match(r.stdout, /must be outside this clone/);
  }
  const before = readFileSync(f);
  for (const spelt of [f, WIN ? f.charAt(0).toLowerCase() + f.slice(1) : f, WIN ? f.toUpperCase() : f]) {
    const r = cli(['--builder', f, '--out', spelt]);
    assert.equal(r.status, 1, `${spelt}: ${r.stdout}`);
    assert.match(r.stdout, /must not be the builder file/);
  }
  assert.deepEqual(readFileSync(f), before, 'the builder file was written over');
  assert.equal(readFileSync(join(REPO, PAGE_REL), 'utf8'), PAGE, 'the shipped page was written over');
  assert.equal(cli(['--out', out]).status, 2);
  const bad = cli(['--builder', builderFile(t, { schema: 2 }), '--out', join(tempDir(t, 'pact-builder-page-'), 'x.html')]);
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /^REFUSE schema must be 1$/m);
});

// ------------------------------------------------------------ the page's own logic, run without a page

/**
 * The page's script run in a fresh context with no document, so the page
 * never boots; its data and functions handed back. Results are cloned into
 * this realm, so assertions compare them as plain values.
 */
function pageLogic() {
  const script = [...PAGE.matchAll(SCRIPT_RE)][0][2];
  const ctx = vm.createContext({});
  const got = vm.runInContext(`${script}\n;({ PACT, initialState, problems, buildFiles, addPreset, blockProblems, slotText, slotOp, applyWorkflow, agentProblems, skillProblems, snapshotSlots, restoreSlots, atDefaults, resetAll, restoreAll });`, ctx);
  const clone = v => (v === null || typeof v !== 'object' ? v : structuredClone(v));
  const out = { PACT: clone(got.PACT) };
  for (const [k, f] of Object.entries(got)) if (typeof f === 'function') out[k] = (...a) => clone(f(...a));
  return out;
}

const L = pageLogic();

test('the page shows moves 1 to 4 as a fixed spine: gated clauses carry their text, open slots are the renderer\'s editable marks', () => {
  assert.deepEqual(L.PACT.moves.map(m => m.n), [1, 2, 3, 4]);
  const parts = L.PACT.moves.flatMap(m => m.parts);
  const gated = parts.filter(p => p.kind === 'gated');
  assert.deepEqual(gated.map(p => p.mark), ['security-route', 'never-substitute', 'move-4']);
  for (const g of [...gated, ...L.PACT.always]) {
    const clause = readFileSync(join(REPO, 'gate', 'clauses', `${g.mark}.md`), 'utf8').trim().split('\n').map(l => l.trim()).join('\n');
    assert.equal(g.text.split('\n').map(l => l.trim()).join('\n'), clause, `${g.mark} differs from gate/clauses/${g.mark}.md`);
  }
  assert.deepEqual(L.PACT.always.map(a => a.mark).sort(), ['no-skill-overrides', 'risk-floor', 'stop-and-escalate']);
  assert.deepEqual(parts.filter(p => p.kind === 'open').map(p => p.mark), ['move-1', 'move-2', 'move-3', 'move-4-extra']);
  assert.deepEqual([...L.PACT.editable], ['move-1', 'move-2', 'move-3', 'move-4-extra']);
});

test('the shipped page\'s presets are the example builder file\'s, each from its example block, in an editable slot', () => {
  const builder = JSON.parse(readFileSync(join(REPO, EXAMPLE_BUILDER_REL), 'utf8'));
  assert.deepEqual(L.PACT.presets.map(p => p.id), builder.presets.map(p => p.id));
  for (const p of L.PACT.presets) {
    const b = builder.presets.find(x => x.id === p.id);
    assert.equal(`${p.text}\n`, readFileSync(join(REPO, 'examples', 'pact-config', ...b.file.split('/')), 'utf8'));
    assert.ok(L.PACT.editable.includes(p.mark), p.mark);
    assert.deepEqual(L.blockProblems(`${p.text}\n`), [], p.id);
  }
});

test('with nothing changed, the page saves a configuration that sets nothing', () => {
  const s = L.initialState();
  assert.deepEqual(L.problems(s), []);
  assert.deepEqual(JSON.parse(JSON.stringify(L.buildFiles(s))), [{ path: 'config.json', text: '{\n  "schema": 1\n}\n' }]);
});

test('a preset goes only in its own slot, and always goes after the slot\'s text', () => {
  const s = L.initialState();
  assert.match(L.addPreset(s, 'move-2', 'move-1-no-wayfinder'), /belongs in the move-1 slot/);
  assert.equal(s.slots['move-2'].cards.length, 0);
  assert.equal(L.addPreset(s, 'move-1', 'move-1-no-wayfinder'), null);
  assert.equal(L.slotOp(s.slots['move-1']), 'add-after');
  assert.deepEqual(JSON.parse(L.buildFiles(s)[0].text).edits, [{ mark: 'move-1', op: 'add-after', file: 'move-1.md' }]);
});

test('a slot\'s edit follows from two things: whether its default is replaced, and whether it holds cards', () => {
  const card = { kind: 'custom', text: 'x' };
  assert.equal(L.slotOp({ replaced: false, cards: [] }), 'keep');
  assert.equal(L.slotOp({ replaced: false, cards: [card] }), 'add-after');
  assert.equal(L.slotOp({ replaced: true, cards: [card] }), 'replace');
  assert.equal(L.slotOp({ replaced: true, cards: [] }), 'remove');
});

test('two cards in one slot become one block file, joined with no blank line; remove carries no file', () => {
  const s = L.initialState();
  L.addPreset(s, 'move-4-extra', 'move-4-docs-check');
  L.addPreset(s, 'move-4-extra', 'move-4-own-agent');
  s.slots['move-1'].replaced = true;
  const files = JSON.parse(JSON.stringify(L.buildFiles(s)));
  assert.deepEqual(JSON.parse(files[0].text).edits, [
    { mark: 'move-1', op: 'remove' },
    { mark: 'move-4-extra', op: 'add-after', file: 'move-4-extra.md' },
  ]);
  const block = files.find(f => f.path === 'blocks/move-4-extra.md').text;
  const want = ['move-4-docs-check', 'move-4-own-agent'].map(id => readFileSync(join(REPO, 'examples', 'pact-config', 'blocks', `${id}.md`), 'utf8')).join('');
  assert.equal(block, want);
});

test('custom text with Windows line endings is saved with LF only', () => {
  const s = L.initialState();
  s.slots['move-3'] = { replaced: false, cards: [{ kind: 'custom', text: 'One line.\r\nTwo lines.\r\n\r\n' }] };
  assert.equal(L.buildFiles(s)[1].text, 'One line.\nTwo lines.\n');
});

test('the page warns when a move-2 edit drops an agent its default text routes to, and stops a save on an error', () => {
  const s = L.initialState();
  s.slots['move-2'] = { replaced: true, cards: [{ kind: 'custom', text: 'Think first, then write the spec.' }] };
  const warn = L.problems(s).filter(p => p.level === 'warn');
  assert.equal(warn.length, 1);
  assert.match(warn[0].text, /`unstated-lens`/);
  s.slots['move-3'] = { replaced: false, cards: [{ kind: 'custom', text: '' }] };
  assert.ok(L.problems(s).some(p => p.level === 'error' && p.where === 'move-3' && /card 1 is empty/.test(p.text)));
  s.usage = 101;
  assert.ok(L.problems(s).some(p => p.level === 'error' && p.where === 'usage-pause'));
});

test('a workflow sets every slot to its presets, after the default text, and keeps the usage value', () => {
  const s = L.initialState();
  s.usage = 60;
  s.slots['move-2'] = { replaced: true, cards: [{ kind: 'custom', text: 'x' }] };
  const w = L.PACT.workflows.find(x => x.presets.length);
  assert.equal(L.applyWorkflow(s, w.id), null);
  assert.equal(s.usage, 60);
  assert.deepEqual(L.slotOp(s.slots['move-2']), 'keep');
  const ids = Object.values(s.slots).flatMap(sl => sl.cards.map(c => c.id));
  assert.deepEqual(ids.sort(), [...w.presets].sort());
  for (const sl of Object.values(s.slots)) assert.equal(sl.replaced, false);
  assert.equal(L.applyWorkflow(s, 'pact-default'), null);
  assert.ok(Object.values(s.slots).every(sl => L.slotOp(sl) === 'keep'));
  assert.match(L.applyWorkflow(s, 'no-such-workflow'), /not on this page/);
});

test('a "Your agent" card writes one plain line naming the agent, and refuses a bad name or a pact agent\'s name', () => {
  const ok = { kind: 'agent', name: 'my-reviewer', reads: 'the diff' };
  assert.deepEqual(L.agentProblems(ok), []);
  assert.match(L.agentProblems({ ...ok, name: '' })[0], /lowercase letters/);
  assert.match(L.agentProblems({ ...ok, name: 'My Reviewer' })[0], /lowercase letters/);
  assert.match(L.agentProblems({ ...ok, name: '@x' })[0], /lowercase letters/);
  assert.match(L.agentProblems({ ...ok, name: 'data-lens' })[0], /pact's own agents/);
  assert.match(L.agentProblems({ ...ok, reads: 'everything' })[0], /something to read/);
  const s = L.initialState();
  s.slots['move-4-extra'] = { replaced: false, cards: [ok] };
  assert.deepEqual(L.problems(s), []);
  assert.equal(L.buildFiles(s)[1].text, 'Then run `my-reviewer`, an agent from your own agents folder, on the diff, and post its report on the issue.\n');
  s.slots['move-4-extra'].cards[0] = { ...ok, name: 'Bad Name' };
  assert.ok(L.problems(s).some(p => p.level === 'error' && /card 1: the agent name/.test(p.text)));
});

test('every pact lens takes a model and effort, scout is locked as sealed, and only a change from the file is written', () => {
  assert.deepEqual(L.PACT.agents.filter(a => a.configurable).map(a => a.name), ['adversarial-lens', 'behaviour-lens', 'data-lens', 'executability-lens', 'good-enough-lens', 'integrity-lens', 'unstated-lens']);
  assert.deepEqual(L.PACT.agents.filter(a => !a.configurable).map(a => [a.name, a.locked]), [['scout', 'sealed: its digest covers its own file']]);
  const s = L.initialState();
  assert.deepEqual(Object.keys(s.agents).sort(), L.PACT.agents.filter(a => a.configurable).map(a => a.name));
  assert.deepEqual(JSON.parse(L.buildFiles(s)[0].text), { schema: 1 });
  s.agents['integrity-lens'].effort = 'low';
  assert.deepEqual(JSON.parse(L.buildFiles(s)[0].text).agents, { 'integrity-lens': { effort: 'low' } });
  s.agents['integrity-lens'].model = 'sonnet';
  s.agents['data-lens'].model = 'sonnet';
  assert.deepEqual(JSON.parse(L.buildFiles(s)[0].text).agents, { 'data-lens': { model: 'sonnet' }, 'integrity-lens': { model: 'sonnet', effort: 'low' } });
  assert.deepEqual(L.PACT.agentChoices, { models: ['opus', 'sonnet'], efforts: ['low', 'medium', 'high'] });
});

test('the page takes each lens\'s class from the renderer: six security-set, two of them egress, integrity-lens plain', () => {
  const cls = Object.fromEntries(L.PACT.agents.filter(a => a.configurable).map(a => [a.name, `${a.security ? 'security-set' : 'plain'} ${a.egress ? 'egress' : 'local'}`]));
  assert.deepEqual(cls, {
    'adversarial-lens': 'security-set egress',
    'behaviour-lens': 'security-set egress',
    'data-lens': 'security-set local',
    'executability-lens': 'security-set local',
    'good-enough-lens': 'security-set local',
    'integrity-lens': 'plain local',
    'unstated-lens': 'security-set local',
  });
});

test('the page shows each pact agent with its model and effort, as its file sets them, and where the pact names it', () => {
  const names = readdirSync(join(REPO, 'claude', 'agents')).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)).sort();
  assert.deepEqual(L.PACT.agents.map(a => a.name), [...names, 'scout']);
  for (const a of L.PACT.agents) {
    const file = a.name === 'scout' ? join(REPO, 'familiars', 'scout.md') : join(REPO, 'claude', 'agents', `${a.name}.md`);
    const head = /^---\n([\s\S]*?)\n---\n/.exec(readFileSync(file, 'utf8'))[1];
    assert.match(head, new RegExp(`^model: ${a.model}$`, 'm'));
    assert.match(head, new RegExp(`^effort: ${a.effort}$`, 'm'));
  }
  const sr = L.PACT.agents.find(a => a.name === 'data-lens');
  assert.deepEqual(sr.runs.map(r => r.mark), ['security-route', 'move-4']);
});
// ------------------------------------------------------------ the page's checks against the renderer's

const sha256 = b => createHash('sha256').update(b).digest('hex');

/** Render the real pact with a user file whose one edit adds `block` after move-3; true when the renderer refuses. */
function rendererRefuses(t, block) {
  const h = tempDir(t, 'pact-builder-home-');
  mkdirSync(join(h, 'pact', 'blocks'), { recursive: true });
  writeFileSync(join(h, 'pact', 'config.json'), '{ "schema": 1, "edits": [ { "mark": "move-3", "op": "add-after", "file": "b.md" } ] }\n');
  writeFileSync(join(h, 'pact', 'blocks', 'b.md'), block);
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  const r = spawnSync(process.execPath, [RENDER, join(REPO, 'claude', 'CLAUDE.md'), tempDir(t, 'pact-builder-out-'), h], { encoding: 'utf8', env });
  assert.match(lastLine(r.stdout), /^RESULT: (pass|fail)$/, r.stdout + r.stderr);
  return r.status !== 0;
}

/** Render the real pact with the page's files for `state` in a throwaway home; the renderer's exit code and output. */
function renderSaved(t, state) {
  const h = tempDir(t, 'pact-builder-home-');
  for (const f of JSON.parse(JSON.stringify(L.buildFiles(state)))) {
    const p = join(h, 'pact', ...f.path.split('/'));
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, f.text);
  }
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  return spawnSync(process.execPath, [RENDER, join(REPO, 'claude', 'CLAUDE.md'), tempDir(t, 'pact-builder-out-'), h], { encoding: 'utf8', env });
}

test('every shipped workflow renders: the page finds no problem and the renderer passes it', t => {
  for (const w of L.PACT.workflows) {
    const s = L.initialState();
    assert.equal(L.applyWorkflow(s, w.id), null);
    assert.deepEqual(L.problems(s), [], w.id);
    const r = renderSaved(t, s);
    assert.equal(r.status, 0, `${w.id}: ${r.stdout}`);
  }
});

test('skill and command cards write one plain line each, and refuse a bad name or a two-line "when"', () => {
  const s = L.initialState();
  s.slots['move-2'] = { replaced: false, cards: [{ kind: 'skill', name: 'grill-me', when: 'the idea is still vague' }, { kind: 'command', name: 'team:review' }] };
  assert.deepEqual(L.problems(s), []);
  assert.equal(L.buildFiles(s)[1].text, 'Use the `grill-me` skill when the idea is still vague.\nAt this step, hand me the trigger: type `/team:review`.\n');
  assert.match(L.skillProblems({ kind: 'skill', name: 'bad name', when: '' })[0], /skill name/);
  assert.match(L.skillProblems({ kind: 'skill', name: 'ok', when: 'one\ntwo' })[0], /one line/);
  assert.match(L.skillProblems({ kind: 'command', name: '@x' })[0], /command name/);
});

test('a slot holding a skill, a command and your agent renders through the renderer', t => {
  const s = L.initialState();
  s.slots['move-3'] = { replaced: false, cards: [{ kind: 'skill', name: 'grill-me', when: '' }, { kind: 'command', name: 'ship' }] };
  s.slots['move-4-extra'] = { replaced: false, cards: [{ kind: 'agent', name: 'my-reviewer', reads: 'the diff' }] };
  assert.deepEqual(L.problems(s), []);
  const r = renderSaved(t, s);
  assert.equal(r.status, 0, r.stdout);
});

test('every preset on its own renders through the renderer', t => {
  for (const p of L.PACT.presets) {
    const s = L.initialState();
    L.addPreset(s, p.mark, p.id);
    const r = renderSaved(t, s);
    assert.equal(r.status, 0, `${p.id}: ${r.stdout}`);
  }
});

const BLOCKS = [
  ['a plain line', 'Read me the done-criteria back.\n', false],
  ['a tab inside a line', 'Read\tme the criteria.\n', false],
  ['a blank line', 'One.\n\nTwo.\n', true],
  ['a leading space', ' Indented.\n', true],
  ['a leading tab', '\tIndented.\n', true],
  ['a code fence', '```\n', true],
  ['an ATX heading', '# Heading\n', true],
  ['a setext underline', 'Title\n=====\n', true],
  ['a thematic break', '***\n', true],
  ['a numbered line', '1. First\n', true],
  ['an import', 'See @notes.md for more.\n', true],
  ['a comment opener', `Hidden ${'<'}!-- x --> text.\n`, true],
  ['a zero-width space', `Zero${String.fromCodePoint(0x200b)}width.\n`, true],
  ['a control character', `Bell${String.fromCodePoint(7)}.\n`, true],
  ['a carriage return', 'One.\r\nTwo.\r\n', true],
  ['an empty block', '\n', true],
  ['two trailing line feeds', 'One.\n\n', true],
  ['a block over 16 KiB', `${'a'.repeat(16 * 1024)}\n`, true],
];

for (const [name, block, refusedByPage] of BLOCKS) {
  test(`the page's block check agrees with the renderer: ${name}`, t => {
    assert.equal(L.blockProblems(block).length > 0, refusedByPage, JSON.stringify(L.blockProblems(block)));
    assert.equal(rendererRefuses(t, block), refusedByPage);
  });
}

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
  assert.ok(!listTree(h).some(p => /pact-config\.html$/i.test(p)));
  return { rules, files, h };
}

test('a configuration the page saves with a value and every preset installs through the dry run and -Apply', t => {
  const s = L.initialState();
  s.usage = 90;
  for (const p of L.PACT.presets) assert.equal(L.addPreset(s, p.mark, p.id), null);
  const { rules, files } = installSaved(t, s);
  assert.deepEqual(files.map(f => f.path), ['config.json', 'blocks/move-1.md', 'blocks/move-3.md', 'blocks/move-4-extra.md']);
  assert.match(rules, /the weekly limit is above 90%/);
  for (const p of L.PACT.presets) for (const line of p.text.split('\n')) assert.ok(rules.includes(`   ${line}\n`), `${p.id}: ${line}`);
  assert.match(rules, /Values set: usage-pause 90\. Parts edited: move-1 \(add-after\), move-3 \(add-after\), move-4-extra \(add-after\)\./);
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
  assert.doesNotMatch(rules, /I triage it \(`triage`\)/);
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
