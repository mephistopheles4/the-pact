// The builder page (#53, slice 7): builder/scriptorium.html. The page is never
// installed and is not gate code; the installer is the authority on what it
// saves. These tests read the page as text and hold it to its content policy,
// check its carried pact text against the repo, and run its own logic in
// node:vm, with no page, and through the renderer. A save installed by the
// install script is in builder-install.test.mjs.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import vm from 'node:vm';
import { EXAMPLE_BUILDER_REL, PAGE_REL, buildPage, checkBuilder } from '../../builder/build.mjs';
import { DEFAULT_PARTS, MODEL_RE, PART_MARKS, compileParts, copyParts } from '../../builder/parts.mjs';
import { isStaged } from '../install-core.mjs';
import { GATE, RENDER, REPO, lastLine } from './text.mjs';
import { tempDir } from './tree.mjs';

const WIN = process.platform === 'win32';
const PAGE = readFileSync(join(REPO, PAGE_REL), 'utf8');
const PAGE_NAME = basename(PAGE_REL);
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
  // The Node install stages the paths its core's isStaged names (#153, S3, step 7).
  assert.ok(isStaged('claude/CLAUDE.md') && isStaged('gate/seam-a.mjs'), 'the install no longer stages claude/ and gate/');
  assert.ok(!isStaged(PAGE_REL), `${PAGE_REL} is a path the install stages`);
});

// ------------------------------------------------------------ the carried pact text

test('the page carries what builder/build.mjs builds from the repo now: the parts, the fixed clause and the settings', () => {
  assert.equal(buildPage(REPO, PAGE), PAGE, 'the page is out of date: run node builder/build.mjs');
});

/** A throwaway root holding the files builder/build.mjs reads, with `mutate` applied. */
function buildRoot(t, mutate) {
  const root = tempDir(t, 'pact-builder-root-');
  for (const d of ['claude', 'examples', 'familiars', join('docs', 'brand')]) cpSync(join(REPO, d), join(root, d), { recursive: true });
  // The renderer and what it reads: build.mjs runs it for the agents' classes.
  cpSync(join(REPO, 'gate'), join(root, 'gate'), { recursive: true, filter: s => !s.includes(`${join('gate', 'tests')}`) });
  mutate(root);
  return root;
}

test('control: a copied root with nothing changed rebuilds the committed page exactly', t => {
  assert.equal(buildPage(buildRoot(t, () => {}), PAGE), PAGE);
});

// #261 C12
test('bad case: a pinned block changed in the pact source makes the committed page out of date', t => {
  const root = buildRoot(t, r => {
    const p = join(r, 'claude', 'CLAUDE.md');
    const was = readFileSync(p, 'utf8');
    assert.ok(was.includes('your pick, and wait.'));
    writeFileSync(p, was.replace('your pick, and wait.', 'your pick, and stop.'));
  });
  assert.notEqual(buildPage(root, PAGE), PAGE);
});

test('bad case: the example builder file changed makes the committed page out of date', t => {
  const root = buildRoot(t, r => writeFileSync(join(r, ...EXAMPLE_BUILDER_REL.split('/')), '{ "schema": 1, "title": "Another builder" }\n'));
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
  yours: { skills: [{ name: 'grill-me', description: 'Grill the plan' }], commands: [{ name: 'ship', description: 'Ship it' }], agents: [{ name: 'my-reviewer', description: 'Reviews' }] },
};
const GOOD_BLOCKS = {};

test('the example builder file passes the check, with one finding: it lists none of the person\'s own skills', () => {
  const r = checkBuilder(REPO, join(REPO, EXAMPLE_BUILDER_REL));
  assert.deepEqual(r.refusals, []);
  assert.deepEqual(r.findings, ['yours lists no skills, commands or agents; the page\'s "Yours" section will say so']);
});

test('a person\'s builder file passes, and its page carries their own skills beside the pact\'s own text', t => {
  const f = builderFile(t, GOOD, GOOD_BLOCKS);
  const r = checkBuilder(REPO, f);
  assert.deepEqual(r.refusals, []);
  assert.deepEqual(r.findings, []);
  const page = buildPage(REPO, PAGE, f);
  assert.deepEqual(pageProblems(page), []);
  const script = [...page.matchAll(SCRIPT_RE)][0][2];
  const D = JSON.parse(JSON.stringify(vm.runInContext(`${script}\n;PACT`, vm.createContext({}))));
  assert.equal(D.title, 'Test builder');
  assert.deepEqual(D.yours.skills.map(x => x.name), ['grill-me']);
  // The parts' text and the fixed clause come from the clone, never from the builder file.
  assert.equal(JSON.stringify(D.parts.text), JSON.stringify(L.PACT.parts.text));
  assert.equal(JSON.stringify(D.always), JSON.stringify(L.PACT.always));
});

const BAD_BUILDERS = [
  ['not JSON', () => '{ nope', /not strict JSON/],
  ['a duplicate key', () => '{ "schema": 1, "schema": 1 }\n', /not strict JSON/],
  ['another schema', () => ({ ...GOOD, schema: 2 }), /schema must be 1/],
  // #262: presets and workflows left the builder; a file holding either is refused.
  ['a presets list', () => ({ ...GOOD, presets: [] }), /presets and workflows left the builder/],
  ['a bad skill name', () => ({ ...GOOD, yours: { skills: [{ name: 'bad name!' }] } }), /needs a name/],
  ['a pact agent listed as yours', () => ({ ...GOOD, yours: { agents: [{ name: 'data-lens' }] } }), /pact's own agents/],
  // #262 C16: the Models list holds models of the gate's shape, each once.
  ['a model that is a web address', () => ({ ...GOOD, models: ['Opus', 'https:/x.example/m'.replace(':/', ':/' + '/')] }), /models: holds text the page's content policy refuses/],
  ['one model twice', () => ({ ...GOOD, models: ['Opus', 'opus'] }), /models: the models list names one model twice/],
  ['an empty models list', () => ({ ...GOOD, models: [] }), /models: the models list must hold 1 to 32/],
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
    { ...GOOD, yours: { skills: [{ name: 'x-y', description: 'Sets innerHTML' }] } },
  ]) {
    const r = checkBuilder(REPO, builderFile(t, doc, GOOD_BLOCKS));
    assert.equal(r.builder, null);
    assert.ok(r.refusals.some(m => /content policy refuses/.test(m)), JSON.stringify(r.refusals));
  }
});

// ------------------------------------------------------------ the four parts Scriptorium builds (#262)

const between = (text, m) => (new RegExp(`<!-- pact:begin ${m} -->\\n([\\s\\S]*?)\\n<!-- pact:end ${m} -->`).exec(text) || [])[1];

// #262 S9: the default graph, and the other three parts, compile byte for byte to the rules file's text.
test('the default parts compile byte for byte to the four parts in the rules file; one cell changed on either side fails', () => {
  const src = readFileSync(join(REPO, 'claude', 'CLAUDE.md'), 'utf8');
  const got = compileParts(DEFAULT_PARTS);
  for (const m of PART_MARKS) assert.equal(got[m], between(src, m), m);
  const p = copyParts(DEFAULT_PARTS);
  p.workflowGraph.offers[0].when = 'thorough';
  assert.notEqual(compileParts(p).workflow, between(src, 'workflow'), 'a cell changed in the data');
  assert.notEqual(got.workflow, between(src.replace('| Deploy | I decide |', '| Deploy | I choose |'), 'workflow'), 'a cell changed in the rules file');
});

const graphWith = f => {
  const g = copyParts(DEFAULT_PARTS).workflowGraph;
  f(g);
  return { ...GOOD, workflowGraph: g };
};

// #262, the owner's skill node: a skill on a stage compiles into a Skills column; the default table has none.
test('a skill on the graph compiles into a Skills column, offered or used and when; the default table has no such column', () => {
  assert.doesNotMatch(compileParts(DEFAULT_PARTS).workflow, /Skills, and when/);
  const p = copyParts(DEFAULT_PARTS);
  p.workflowGraph.skills = [{ id: 'build-tdd', stage: 'build', skill: 'tdd', mode: 'used', when: 'every-build', words: '', on: true }];
  const lines = compileParts(p).workflow.split('\n');
  assert.match(lines[0], /\| Lenses offered, and when \| Skills, and when \| Other ways out \|$/);
  assert.match(lines.find(l => l.startsWith('| Build |')), /\| none \| `tdd`: used, every build \| \|$/);
  assert.match(lines.find(l => l.startsWith('| Plan |')), /\| none \| none \| \|$/);
});

// #262: the builder's skill check refuses a skill name that is no skill or command name.
test('bad builder file: a skill whose name is no skill or command name is refused', t => {
  const r = checkBuilder(REPO, builderFile(t, graphWith(g => (g.skills = [{ id: 'k', stage: 'build', skill: 'run this; rm', mode: 'used', when: 'every-build', words: '', on: true }])), GOOD_BLOCKS));
  assert.equal(r.builder, null);
  assert.ok(r.refusals.some(m => /skill k: the skill's name must be/.test(m)), JSON.stringify(r.refusals));
});

// #262 S2, S9: the builder refuses a stage with two default ways on.
test('bad builder file: a stage with two default ways on is refused', t => {
  const r = checkBuilder(REPO, builderFile(t, graphWith(g => g.links.push({ from: 'test', to: 'maintain', when: '', on: true })), GOOD_BLOCKS));
  assert.equal(r.builder, null);
  assert.ok(r.refusals.some(m => /stage test has two default ways on/.test(m)), JSON.stringify(r.refusals));
});

// #262 S2, S9: the builder refuses default ways on that go round in a circle.
test('bad builder file: default ways on in a circle are refused', t => {
  const r = checkBuilder(REPO, builderFile(t, graphWith(g => (g.links.find(l => l.from === 'maintain').when = '')), GOOD_BLOCKS));
  assert.equal(r.builder, null);
  assert.ok(r.refusals.some(m => /go round in a circle/.test(m)), JSON.stringify(r.refusals));
});

// #262 S9, data F2: the content policy covers the graph's text.
test('bad builder file: a web address in a link condition is refused by the content policy', t => {
  const r = checkBuilder(REPO, builderFile(t, graphWith(g => (g.links.find(l => l.when).when = 'the spec at https://example.invalid/x changes')), GOOD_BLOCKS));
  assert.equal(r.builder, null);
  assert.ok(r.refusals.some(m => /^link \d+: holds text the page's content policy refuses/.test(m)), JSON.stringify(r.refusals));
});

// #262 S2, D9: a person's parts load into the page, and the page saves each changed part as a replace edit.
test('a builder file\'s parts load into its page; the page saves only the parts whose text changed, and keeps the rest of builder.json', t => {
  const doc = { ...GOOD, sensitive: { ...copyParts(DEFAULT_PARTS).sensitive, items: ['auth', 'payments'] } };
  const file = builderFile(t, doc, GOOD_BLOCKS);
  assert.deepEqual(checkBuilder(REPO, file).refusals, []);
  const page = buildPage(REPO, PAGE, file);
  const files = vm.runInContext(`${[...page.matchAll(SCRIPT_RE)][0][2]}\n;JSON.stringify(buildFiles(initialState()))`, vm.createContext({}));
  const [config, ...blocks] = JSON.parse(files);
  assert.deepEqual(JSON.parse(config.text).edits, [{ mark: 'sensitive', op: 'replace', file: 'sensitive.md' }]);
  assert.match(blocks[0].text, /sensitive\nwork is auth and payments: thorough/);
  // The shipped page at its defaults saves no part, so it raises no security-defaults line.
  assert.deepEqual(L.partsChanged(L.initialState()), {});
  const s = L.initialState();
  s.parts.lenses[2].asks = 'Who needs what, unsaid?';
  const kept = JSON.parse(L.builderWith('{"schema": 1, "title": "Mine", "yours": {}}', s).text);
  assert.deepEqual([kept.title, kept.lenses[2].asks, Object.keys(kept).sort()], ['Mine', 'Who needs what, unsaid?', ['lenses', 'moves', 'schema', 'sensitive', 'tiers', 'title', 'workflowGraph', 'yours']]);
});

test('reset puts the usage value, every part and every agent back to the plain pact, and undo puts it all back', () => {
  const s = L.initialState();
  assert.equal(L.atDefaults(s), true);
  assert.equal(L.buildFiles(s).length, 1);
  s.usage = 90;
  s.parts.moves[1].text = 'Mine.';
  // Every agent off its default, and a model added, so a reset that misses one fails.
  for (const a of Object.keys(s.agents)) s.agents[a].model = s.agents[a].model === 'opus' ? 'sonnet' : 'opus';
  assert.equal(Object.keys(s.agents).length, 10);
  s.models.push('claude-opus-5-5');
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
// #262: no setting is marked; a security-set lens off its default saves like a plain one, and no problem is found.
test('a security-set lens off its default saves like a plain one, with no warning', () => {
  const s = L.initialState();
  s.agents['integrity-lens'].effort = 'low';
  s.agents['behaviour-lens'].effort = 'low';
  s.agents['data-lens'].model = 'haiku';
  assert.deepEqual(JSON.parse(L.buildFiles(s)[0].text).agents, { 'behaviour-lens': { effort: 'low' }, 'data-lens': { model: 'haiku' }, 'integrity-lens': { effort: 'low' } });
  assert.deepEqual(L.problems(s), []);
});

// ------------------------------------------------------------ the page on a stub DOM

/** Boot the page's script against a small stand-in for the DOM; returns the elements by id and helpers. */
function bootPage({ picker = false, folder = null } = {}) {
  const script = [...PAGE.matchAll(SCRIPT_RE)][0][2];
  class N {
    constructor(tag) { Object.assign(this, { tag, children: [], attrs: {}, hidden: false, textContent: '', listeners: {}, style: {}, dataset: {}, value: '' }); this.classList = { add() {}, remove() {}, toggle() {} }; }
    append(...c) { this.children.push(...c.map(x => (typeof x === 'string' ? Object.assign(new N('#text'), { textContent: x }) : x))); }
    replaceChildren(...c) { this.children = []; this.append(...c); }
    setAttribute(k, v) { this.attrs[k] = v; }
    getAttribute(k) { return this.attrs[k]; }
    removeAttribute(k) { delete this.attrs[k]; }
    addEventListener(e, f) { (this.listeners[e] ||= []).push(f); }
    remove() {}
    focus() {}
    click() { (this.listeners.click || []).forEach(f => f({})); if (this.onclick) this.onclick({}); }
    get text() { return [this.textContent, ...this.children.map(c => c.text)].join(' ').replace(/\s+/g, ' ').trim(); }
  }
  const ids = {};
  const document = { createElement: t => new N(t), createTextNode: t => Object.assign(new N('#text'), { textContent: t }), getElementById: id => (ids[id] ||= new N('div')), documentElement: new N('html'), body: new N('body'), addEventListener() {} };
  const window = { localStorage: { getItem: () => null, setItem() {} }, scrollTo() {}, addEventListener() {}, isSecureContext: picker, ...(picker ? { showDirectoryPicker: async () => { if (folder) return folder; throw Object.assign(new Error('x'), { name: 'AbortError' }); } } : {}) };
  vm.runInContext(script, vm.createContext({ document, window, Node: N, URL, Blob: class {}, setTimeout, clearTimeout, requestAnimationFrame: () => 0 }));
  const find = (n, pred, out = []) => { if (pred(n)) out.push(n); n.children.forEach(c => find(c, pred, out)); return out; };
  const button = (root, label) => find(root, n => n.tag === 'button' && n.text.startsWith(label))[0];
  return { ids, find, button };
}

/** Open Settings on a stub page and return the dialog's node. */
const openSettings = P => {
  P.button(P.ids.actions, 'Settings').click();
  return P.ids.settings;
};

/** Open Agents on a stub page, pick `name` when given, and return the dialog's node. */
const openAgents = (P, name) => {
  P.button(P.ids.actions, 'Agents').click();
  if (name) P.find(P.ids.agents, n => n.tag === 'button' && n.text === name)[0].click();
  return P.ids.agents;
};

/** Type `text` into a box on a stub page, as the input event would. */
const typeInto = (box, text) => {
  box.value = text;
  box.listeners.input.forEach(f => f({}));
};

// The page's stub tests on labels and layout folded into this one smoke test (#262): the page boots, opens its
// dialogs, and an edited move reaches the saved configuration. How the page looks is the owner's to judge, in a browser.
// #262: a move typed with Windows line endings saves as one reflowed paragraph.
test('stub page: the page boots, Settings and Agents open, and an edited move saves as a replace edit with LF only', () => {
  const P = bootPage();
  assert.ok(openAgents(P, 'data-lens').children.length, 'Agents opens');
  openSettings(P);
  typeInto(P.find(P.ids.settings, n => n.tag === 'textarea' && n.attrs['aria-label'] === 'Move 1 text')[0], 'I sense the work\r\nmy own way.');
  P.button(P.ids.actions, 'Export').click();
  assert.match(P.ids.output.text, /"mark": "moves",\s*"op": "replace"/);
  assert.match(P.ids.output.text, /I sense the work my own way\./);
  assert.doesNotMatch(P.ids.output.text, /\r/);
});

// #262 addendum 3: Add agent in the Agents panel reaches the saved files, and the save note says a save never deletes.
test('stub page: Add agent in the Agents panel saves agents/<name>.md, and the save says it deletes nothing', () => {
  const P = bootPage();
  const panel = openAgents(P);
  P.find(panel, n => n.tag === 'input' && n.attrs['aria-label'] === 'New agent name')[0].value = 'my-reviewer';
  P.button(P.ids.agents, 'Add agent').click();
  P.button(P.ids.actions, 'Export').click();
  assert.match(P.ids.output.text, /agents\/my-reviewer\.md/);
  assert.match(P.ids.output.text, /A save never deletes/);
});

test('the page is named scriptorium, and the docs and the skill name it so; the old name and the old skill name are gone', () => {
  assert.equal(PAGE_REL, 'builder/scriptorium.html');
  for (const f of ['README.md', 'AGENTS.md', join('.claude', 'skills', 'scriptorium', 'SKILL.md'), join('builder', 'build.mjs')]) {
    const text = readFileSync(join(REPO, f), 'utf8');
    assert.match(text, /scriptorium\.html/, `${f} does not name the page`);
    assert.doesNotMatch(text, /pact-config\.html|pact-builder/, `${f} still names the old page or skill`);
  }
  assert.match(readFileSync(join(REPO, '.claude', 'skills', 'scriptorium', 'SKILL.md'), 'utf8'), /^name: scriptorium$/m);
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
  for (const spelt of [join(REPO, 'builder', PAGE_NAME.toUpperCase()), join(REPO, 'builder', 'mine.html'), WIN ? REPO.charAt(0).toLowerCase() + REPO.slice(1) + '\\builder\\mine.html' : join(REPO, 'builder', 'mine.html')]) {
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
  const got = vm.runInContext(`${script}\n;({ PACT, initialState, problems, buildFiles, blockProblems, atDefaults, resetAll, restoreAll, keepCommands, partsChanged, builderWith, addAgent, resetPrompt, ownProblems, AGENT_TEMPLATE });`, ctx);
  const clone = v => (v === null || typeof v !== 'object' ? v : structuredClone(v));
  const out = { PACT: clone(got.PACT) };
  for (const [k, f] of Object.entries(got)) if (typeof f === 'function') out[k] = (...a) => clone(f(...a));
  return out;
}

const L = pageLogic();

// #262: the moves are one part, its default the four moves by their lead-ins; the fixed clause carries its text.
test('the page holds the moves as one part, named by their lead-ins, beside the fixed clause and the other parts', () => {
  assert.deepEqual(L.PACT.parts.defaults.moves.map(m => m.lead), ['Sense the work', 'Think before doing', 'Checkpoint the seams', 'Stay the owner']);
  const src = readFileSync(join(REPO, 'claude', 'CLAUDE.md'), 'utf8');
  for (const g of L.PACT.always) {
    const clause = new RegExp(`<!-- pact:begin ${g.mark} -->\\n([\\s\\S]*?)<!-- pact:end ${g.mark} -->`).exec(src)[1].trim().split('\n').map(l => l.trim()).join('\n');
    assert.equal(g.text.split('\n').map(l => l.trim()).join('\n'), clause, `${g.mark} differs from its block in claude/CLAUDE.md`);
  }
  assert.deepEqual(L.PACT.always.map(a => a.mark), ['stop-and-escalate']);
  assert.deepEqual([...L.PACT.editable], ['moves', 'tiers', 'sensitive', 'workflow', 'lenses', 'qualities']);
});

test('with nothing changed, the page saves a configuration that sets nothing', () => {
  const s = L.initialState();
  assert.deepEqual(L.problems(s), []);
  assert.deepEqual(JSON.parse(JSON.stringify(L.buildFiles(s))), [{ path: 'config.json', text: '{\n  "schema": 1\n}\n' }]);
});

test('a save keeps a commands list already in the folder\'s config.json, and won\'t replace one it can\'t read (#203, T2)', () => {
  const s = L.initialState();
  s.parts.moves[0].text = 'I sense the work my own way.';
  const files = L.buildFiles(s);
  assert.equal(files.length, 2, 'a block file to carry through');
  assert.deepEqual(L.keepCommands(files, null), { files }, 'no file there');
  assert.deepEqual(L.keepCommands(files, '{"schema":1,"settings":{"usage-pause":80}}'), { files }, 'a file with no commands key');
  assert.deepEqual(L.keepCommands(files, '[]'), { files }, 'JSON that is not an object holds no list to keep');
  const kept = L.keepCommands(files, '{"schema":1,"settings":{"usage-pause":80},"commands":["make-it-so","finis"]}');
  assert.deepEqual(JSON.parse(kept.files[0].text), { ...JSON.parse(files[0].text), commands: ['make-it-so', 'finis'] });
  assert.equal(kept.files[0].path, 'config.json');
  assert.deepEqual(kept.files.slice(1), files.slice(1), 'block files pass through unchanged');
  assert.deepEqual(JSON.parse(L.keepCommands(files, '{"commands":[]}').files[0].text).commands, [], 'an empty list is kept too');
  const twice = L.keepCommands(files, '{"schema":1,"commands":["finis"],"Commands":["make-it-so"]}');
  assert.equal(twice.files, undefined, 'a key given twice, case folded, writes nothing');
  assert.match(twice.refuse, /gives a key twice/);
  assert.deepEqual(JSON.parse(L.keepCommands(files, '{"commands":["finis"],"agents":{"commands":{}}}').files[0].text).commands, ['finis'], 'a nested key of the same name is not a repeat');
  const bad = L.keepCommands(files, '{"schema":1,"commands":["finis"');
  assert.equal(bad.files, undefined, 'nothing to write');
  assert.match(bad.refuse, /config\.json/);
});

test('a save reads the folder\'s config.json through keepCommands: none there, a refusal on a read error, and a kept list (#203, T2)', async () => {
  const script = [...PAGE.matchAll(SCRIPT_RE)][0][2];
  const ctx = vm.createContext({});
  const { keepCommandsIn, buildFiles, initialState } = vm.runInContext(`${script}\n;({ keepCommandsIn, buildFiles, initialState });`, ctx);
  const files = buildFiles(initialState());
  const fail = name => ({ getFileHandle: async () => { throw Object.assign(new Error('x'), { name }); } });
  const holding = text => ({ getFileHandle: async () => ({ getFile: async () => ({ text: async () => text }) }) });
  const none = await keepCommandsIn(fail('NotFoundError'), files);
  assert.equal(none.files, files, 'no config.json there: the files go as built');
  const unreadable = await keepCommandsIn(fail('NotReadableError'), files);
  assert.equal(unreadable.files, undefined, 'nothing to write');
  assert.match(unreadable.refuse, /could not be read, so nothing was written/);
  const kept = await keepCommandsIn(holding('{"schema":1,"commands":["finis"]}'), files);
  assert.deepEqual(JSON.parse(kept.files[0].text).commands, ['finis']);
  assert.match((await keepCommandsIn(holding('{'), files)).refuse, /not valid JSON/);
});

test('stub page: the review step warns that a downloaded config.json holds no commands list, with or without a folder picker (#203, T2)', () => {
  for (const picker of [false, true]) {
    const P = bootPage({ picker });
    P.button(P.ids.actions, 'Export').click();
    const text = P.ids.output.text;
    assert.ok(P.find(P.ids.output, n => n.tag === 'button' && n.text === 'Download config.json').length, `picker ${picker}: a download button`);
    assert.match(text, /A downloaded config\.json holds no commands list: if yours has one, copy its commands entry across, or the next install deletes those commands\./, `picker ${picker}`);
    assert.equal(/keeping a commands list config\.json already holds/.test(text), picker, `picker ${picker}: the save note says Save keeps the list only where Save exists`);
  }
});
test('stub page: Save to a picked folder keeps its commands list, and writes nothing over a config.json that isn\'t JSON (#203, T2)', async () => {
  /** A stand-in folder holding `held` (name -> text); `written` collects what Save writes. */
  const fakeFolder = held => {
    const written = {};
    const dir = {
      name: 'pact',
      written,
      async getFileHandle(name, opts = {}) {
        if (!Object.hasOwn(held, name) && !opts.create) throw Object.assign(new Error('x'), { name: 'NotFoundError' });
        return { getFile: async () => ({ text: async () => held[name] }), createWritable: async () => ({ write: async text => { written[name] = text; }, close: async () => {} }) };
      },
      async getDirectoryHandle() { return dir; },
    };
    return dir;
  };
  const save = async folder => {
    const P = bootPage({ picker: true, folder });
    P.button(P.ids.actions, 'Export').click();
    P.button(P.ids.output, 'Save to a folder').click();
    for (let i = 0; i < 20; i++) await new Promise(r => setTimeout(r, 0));
    return folder.written;
  };
  const kept = await save(fakeFolder({ 'config.json': '{"schema":1,"commands":["finis"]}' }));
  assert.deepEqual(JSON.parse(kept['config.json']), { schema: 1, commands: ['finis'] });
  assert.deepEqual(await save(fakeFolder({ 'config.json': '{"schema":1,"commands":' })), {}, 'nothing is written');
  assert.deepEqual(JSON.parse((await save(fakeFolder({})))['config.json']), { schema: 1 }, 'no file there: the save goes as built');
});
// #262: a moves edit saves the whole part as one replace; an empty move stops a save.
test('an edited move saves the moves part as one replace, and an empty move stops a save', () => {
  const s = L.initialState();
  s.parts.moves[2].text = 'One line, then two.';
  assert.deepEqual(JSON.parse(L.buildFiles(s)[0].text).edits, [{ mark: 'moves', op: 'replace', file: 'moves.md' }]);
  assert.deepEqual(L.problems(s), []);
  s.parts.moves[2].text = '';
  assert.ok(L.problems(s).some(p => p.level === 'error' && p.where === 'moves'), JSON.stringify(L.problems(s)));
  s.usage = 101;
  assert.ok(L.problems(s).some(p => p.level === 'error' && p.where === 'usage-pause'));
});

// #262 addendum 3: a prompt edited on the page saves the agent's whole file, its model and effort lines from the pickers, and no setting.
test('an edited prompt saves the agent\'s whole file into agents/, its model and effort from the pickers, and no agents setting for it', () => {
  const s = L.initialState();
  const scout = L.PACT.agents.find(a => a.name === 'scout');
  s.own.scout = scout.file.replace(/\n---\n\n[\s\S]*$/, '\n---\n\nFind things, briefly.\n');
  s.agents.scout.model = 'haiku';
  assert.deepEqual(L.ownProblems(s), []);
  const files = L.buildFiles(s);
  assert.equal(JSON.parse(files[0].text).agents, undefined, 'an own file sets its own model; the renderer refuses both');
  const f = files.find(x => x.path === 'agents/scout.md');
  assert.match(f.text, /^model: haiku$/m);
  assert.match(f.text, /\n---\n\nFind things, briefly\.\n$/);
  // Back to default: no file, no setting beyond the picker's.
  L.resetPrompt(s, 'scout');
  assert.equal(L.buildFiles(s).some(x => x.path.startsWith('agents/')), false);
});

// #262 addendum 3: Add agent starts from a template the gate takes; a bad or taken name is refused.
test('Add agent starts a new agent from the template, and refuses a taken or malformed name; a broken file is the page\'s error', () => {
  const s = L.initialState();
  assert.match(L.addAgent(s, 'scout'), /already/);
  assert.match(L.addAgent(s, 'My Agent'), /lowercase/);
  assert.equal(L.addAgent(s, 'my-reviewer'), null);
  assert.match(s.own['my-reviewer'], /^---\nname: my-reviewer\n/);
  assert.match(s.own['my-reviewer'], /^tools: \[Read, Glob, Grep\]$/m);
  assert.deepEqual(L.ownProblems(s), []);
  assert.ok(L.buildFiles(s).some(x => x.path === 'agents/my-reviewer.md'));
  s.own['my-reviewer'] = s.own['my-reviewer'].replace('name: my-reviewer', 'name: other');
  assert.ok(L.problems(s).some(p => p.level === 'error' && p.where === 'my-reviewer'), JSON.stringify(L.problems(s)));
  // Removing a new agent drops its file and its picker.
  L.resetPrompt(s, 'my-reviewer');
  assert.equal(s.agents['my-reviewer'], undefined);
  assert.equal(L.atDefaults(s), true);
});

// #262 C13: scout is set like any lens.
test('every pact agent takes a model and effort, scout included, and only a change from the file is written', () => {
  assert.deepEqual(L.PACT.agents.map(a => a.name), ['adversarial-lens', 'behaviour-lens', 'conventions-lens', 'data-lens', 'executability-lens', 'good-enough-lens', 'integrity-lens', 'reader-lens', 'scout', 'unstated-lens']);
  assert.ok(L.PACT.agents.every(a => a.configurable));
  const s = L.initialState();
  assert.deepEqual(Object.keys(s.agents).sort(), L.PACT.agents.map(a => a.name));
  assert.deepEqual(JSON.parse(L.buildFiles(s)[0].text), { schema: 1 });
  s.agents['integrity-lens'].effort = 'low';
  assert.deepEqual(JSON.parse(L.buildFiles(s)[0].text).agents, { 'integrity-lens': { effort: 'low' } });
  s.agents['integrity-lens'].model = 'sonnet';
  s.agents['data-lens'].model = 'sonnet';
  assert.deepEqual(JSON.parse(L.buildFiles(s)[0].text).agents, { 'data-lens': { model: 'sonnet' }, 'integrity-lens': { model: 'sonnet', effort: 'low' } });
  assert.deepEqual(L.PACT.agentChoices, { efforts: ['low', 'medium', 'high', 'xhigh', 'max'] });
  s.agents.scout.effort = 'low';
  assert.deepEqual(JSON.parse(L.buildFiles(s)[0].text).agents.scout, { effort: 'low' });
});

// #262 C16
test('the Models list feeds the agents and the tiers: a model ID reaches config.json and the tier text exactly as typed', () => {
  const s = L.initialState();
  assert.deepEqual(s.models, ['Opus', 'Sonnet', 'Haiku', 'Fable']);
  s.models.push('claude-opus-5-5');
  s.agents['integrity-lens'].model = 'claude-opus-5-5';
  s.agents['integrity-lens'].effort = 'xhigh';
  s.agents.scout.model = 'fable';
  s.parts.tiers[2].build = 'claude-opus-5-5, xhigh';
  assert.deepEqual(L.problems(s).filter(p => p.level === 'error'), []);
  const config = JSON.parse(L.buildFiles(s)[0].text);
  assert.deepEqual(config.agents['integrity-lens'], { model: 'claude-opus-5-5', effort: 'xhigh' });
  assert.deepEqual(config.agents.scout, { model: 'fable' });
  assert.match(L.buildFiles(s).find(f => f.path === 'blocks/tiers.md').text, /claude-opus-5-5, xhigh/);
  // A model the gate would refuse is the page's error too.
  s.models.push('claude opus');
  assert.ok(L.problems(s).some(p => p.where === 'models' && p.level === 'error'));
});

// #262 S19: the builder's model shape is the renderer's.
test('the builder takes the renderer\'s model shape', () => {
  const render = readFileSync(join(GATE, 'render-core.mjs'), 'utf8');
  assert.equal(/const AGENT_MODEL_RE = (.*);/.exec(render)[1], String(MODEL_RE));
});

test('the page takes each lens\'s class from the renderer: six security-set, two of them egress, integrity-lens plain', () => {
  const cls = Object.fromEntries(L.PACT.agents.filter(a => a.configurable).map(a => [a.name, `${a.security ? 'security-set' : 'plain'} ${a.egress ? 'egress' : 'local'}`]));
  assert.deepEqual(cls, {
    'adversarial-lens': 'security-set egress',
    'behaviour-lens': 'security-set egress',
    'conventions-lens': 'plain local',
    'data-lens': 'security-set local',
    'executability-lens': 'security-set local',
    'good-enough-lens': 'security-set local',
    'integrity-lens': 'plain local',
    'reader-lens': 'plain local',
    scout: 'plain local',
    'unstated-lens': 'security-set local',
  });
});

// #261 C12
test('the page shows each pact agent with its model and effort, as its file sets them, and where the pact names it', () => {
  const names = readdirSync(join(REPO, 'claude', 'agents')).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)).sort();
  assert.deepEqual(L.PACT.agents.map(a => a.name), names);
  for (const a of L.PACT.agents) {
    const file = join(REPO, 'claude', 'agents', `${a.name}.md`);
    const head = /^---\n([\s\S]*?)\n---\n/.exec(readFileSync(file, 'utf8'))[1];
    assert.match(head, new RegExp(`^model: ${a.model}$`, 'm'));
    assert.match(head, new RegExp(`^effort: ${a.effort}$`, 'm'));
  }
  // #262 S8: the moves name no lens; each lens is named by its offers in the workflow and its row in the roster, and scout by neither.
  for (const a of L.PACT.agents) assert.deepEqual(a.runs.map(r => r.mark), a.name === 'scout' ? [] : ['workflow', 'lenses'], a.name);
});
// ------------------------------------------------------------ the page's checks against the renderer's

/** Render the real pact with a user file whose one edit adds `block` after the moves; true when the renderer refuses. */
function rendererRefuses(t, block) {
  const h = tempDir(t, 'pact-builder-home-');
  mkdirSync(join(h, 'pact', 'blocks'), { recursive: true });
  writeFileSync(join(h, 'pact', 'config.json'), '{ "schema": 1, "edits": [ { "mark": "moves", "op": "add-after", "file": "b.md" } ] }\n');
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

// #262: the page's saved files for an edited move and an added one render through the renderer.
test('an edited and an added move render through the renderer', t => {
  const s = L.initialState();
  s.parts.moves[0].text = 'I sense the work my own way.';
  s.parts.moves.push({ lead: 'Leave it better', text: 'I leave the code a little better than I found it.' });
  assert.deepEqual(L.problems(s), []);
  const r = renderSaved(t, s);
  assert.equal(r.status, 0, r.stdout);
});

const BLOCKS = [
  ['a plain line', 'Read me the done-criteria back.\n', false],
  ['a tab inside a line', 'Read\tme the criteria.\n', false],
  ['a blank line', 'One.\n\nTwo.\n', false],
  ['a leading space', ' Indented.\n', false],
  ['a leading tab', '\tIndented.\n', false],
  ['a code fence', '```\n', false],
  ['an ATX heading', '# Heading\n', false],
  ['a setext underline', 'Title\n=====\n', false],
  ['a thematic break', '***\n', false],
  ['a numbered line', '1. First\n', false],
  ['an import', 'See @notes.md for more.\n', false],
  ['a comment opener', `Hidden ${'<'}!-- x --> text.\n`, false],
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
