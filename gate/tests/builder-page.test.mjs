// The builder page (#53, slice 7): builder/scriptorium.html. The page is never
// installed and is not gate code; the installer is the authority on what it
// saves. These tests read the page as text and hold it to its content policy,
// check its carried pact text against the repo, and run its own logic in
// node:vm, with no page, and through the renderer. A save installed by the
// install script is in builder-install.test.mjs.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import vm from 'node:vm';
import { EXAMPLE_BUILDER_REL, PAGE_REL, buildPage, checkBuilder, pactData, personalPresets, personalPresetsDir, shippedPresets } from '../../builder/build.mjs';
import { DEFAULT_PARTS, MODEL_RE, PART_MARKS, compileParts, copyParts, partsProblems, partsTexts, upgradeParts } from '../../builder/parts.mjs';
import { BUILDER_KIT, KIT_RULES_REL, PACT_COMMANDS, PACT_TOOLS, expectedCopySet, isStaged } from '../install-core.mjs';
import { GATE, RENDER, REPO, lastLine } from './text.mjs';
import { tempDir } from './tree.mjs';

const WIN = process.platform === 'win32';
const PAGE = readFileSync(join(REPO, PAGE_REL), 'utf8');
const PAGE_NAME = basename(PAGE_REL);
// The page starts at Level 3 · Full, so a save from its start is the pact's default configuration (#183 T4a).
const DEFAULT_CONFIG = JSON.parse(readFileSync(join(REPO, 'builder', 'default-config', 'config.json'), 'utf8'));
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

// #262: the builder is part of the pact: the page is staged, and installs only into the builder kit, never to the Claude home folder's top.
test('the page is staged, and installs only into the builder kit', () => {
  // The Node install stages the paths its core's isStaged names (#153, S3, step 7).
  assert.ok(isStaged('claude/CLAUDE.md') && isStaged('gate/seam-a.mjs') && isStaged(PAGE_REL), 'the install stages claude/, gate/ and the builder');
  assert.deepEqual(expectedCopySet([PAGE_REL], ['scriptorium']), [[PAGE_REL, `pact/builder/${PAGE_REL}`]]);
  assert.deepEqual(expectedCopySet([PAGE_REL], []), []);
});

// ------------------------------------------------------------ the carried pact text

test('the page carries what builder/build.mjs builds from the repo now: the parts, the fixed clause and the settings', () => {
  assert.equal(buildPage(REPO, PAGE), PAGE, 'the page is out of date: run node builder/build.mjs');
});

/** A throwaway root holding the files builder/build.mjs reads, with `mutate` applied. */
function buildRoot(t, mutate) {
  const root = tempDir(t, 'pact-builder-root-');
  for (const d of ['claude', 'examples', 'familiars', join('docs', 'brand'), join('builder', 'presets')]) cpSync(join(REPO, d), join(root, d), { recursive: true });
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

// #262, data-lens F1: an @ path in a part or an agent file is a finding, never a refusal (ADR 0069); one in a description is not.
test('an @ path in a move or an agent file is a finding, and the file still passes; one in a skill description is not', t => {
  const moves = DEFAULT_PARTS.moves.map((m, i) => (i ? m : { ...m, text: 'Read @notes/creds.md first.' }));
  const agentFiles = { 'my-reviewer': '---\nname: my-reviewer\ndescription: Reviews.\n---\n\nSee @~/.ssh/config.\n' };
  const r = checkBuilder(REPO, builderFile(t, { ...GOOD, moves, agentFiles }, GOOD_BLOCKS));
  assert.deepEqual(r.refusals, []);
  assert.deepEqual(r.findings.filter(f => /file import/.test(f)).map(f => f.split(':')[0]), ['move 1', 'agentFiles my-reviewer']);
  const mention = checkBuilder(REPO, builderFile(t, { ...GOOD, yours: { skills: [{ name: 'mail', description: 'Writes to @team' }] } }, GOOD_BLOCKS));
  assert.deepEqual(mention.findings.filter(f => /file import/.test(f)), []);
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
  p.workflowGraph.offers[0].tiers = ['thorough'];
  assert.notEqual(compileParts(p).workflow, between(src, 'workflow'), 'a cell changed in the data');
  assert.notEqual(got.workflow, between(src.replace('| Deploy | I decide |', '| Deploy | I choose |'), 'workflow'), 'a cell changed in the rules file');
});

const graphWith = f => {
  const g = copyParts(DEFAULT_PARTS).workflowGraph;
  f(g);
  return { ...GOOD, workflowGraph: g };
};

// #262, owner decision in chat: any number of tiers, each with an id; an offer at
// these tiers compiles to their names, and the route names its tier.
test('a fourth tier compiles into its own column, and offers and the route name tiers by their names', () => {
  const p = copyParts(DEFAULT_PARTS);
  p.tiers.push({ id: 'expert', name: 'Expert', fits: 'Work only I can judge', plan: 'Opus, max', build: 'Opus, high' });
  p.sensitive.tier = 'expert';
  assert.deepEqual(partsProblems(p), []);
  const out = compileParts(p);
  assert.match(out.tiers, /^\| \*\*Expert\*\* \| Work only I can judge \| Opus, max \| Opus, high \|$/m);
  assert.match(out.workflow.split('\n')[0], /^\| Stage \| Quick \| Standard \| Thorough \| Expert \| Sensitive route \|/);
  assert.match(out.workflow, /`executability-lens`, `unstated-lens`: at standard and thorough;/);
  assert.match(out.sensitive.replace(/\s+/g, " "), /data migrations: expert, planned/);
  p.workflowGraph.offers[0].tiers = ['thorough', 'expert'];
  assert.match(compileParts(p).workflow, /`executability-lens`, `unstated-lens`: thorough and above;/);
});

// #262: a builder file from before tier ids keeps working, and compiles as it did.
test('a builder file with three tiers and no ids, and the retired conditions, is brought up to date', () => {
  const p = copyParts(DEFAULT_PARTS);
  p.tiers = p.tiers.map(({ id, ...t }) => t);
  for (const o of p.workflowGraph.offers) if (o.when === 'tiers') {
    o.when = 'standard-up';
    delete o.tiers;
  }
  assert.ok(partsProblems(p).length > 0, 'refused before the upgrade');
  assert.deepEqual(partsProblems(upgradeParts(p)), []);
  assert.deepEqual(compileParts(p), compileParts(DEFAULT_PARTS));
});

// #262: the builder refuses a tier list it can't compile, and a pointer at a tier that isn't there.
test('bad parts: no tiers or seven, an id twice, a skip, an offer or a route at a missing tier', () => {
  const bad = f => {
    const p = copyParts(DEFAULT_PARTS);
    f(p);
    return partsProblems(p).filter(x => x.level === 'error').map(x => x.text).join(' / ');
  };
  assert.match(bad(p => (p.tiers = [])), /1 to 6 tiers/);
  assert.match(bad(p => (p.tiers = Array.from({ length: 7 }, (_, i) => ({ ...p.tiers[0], id: `t${i}`, name: `T${i}` })))), /1 to 6 tiers/);
  assert.match(bad(p => (p.tiers[1].id = 'quick')), /tier quick: the id is used twice/);
  assert.match(bad(p => (p.tiers[1].name = 'quick')), /two tiers have one name/);
  assert.match(bad(p => (p.workflowGraph.stages[0].skipAt = ['gone'])), /stage plan: skipAt must list tiers/);
  assert.match(bad(p => (p.workflowGraph.offers[0].tiers = [])), /offer design-spec-pair: tiers, a list of the tiers/);
  assert.match(bad(p => (p.workflowGraph.offers[0].tiers = ['gone'])), /offer design-spec-pair: tiers, a list of the tiers/);
  assert.match(bad(p => (p.workflowGraph.offers[1].tiers = ['quick'])), /offer design-security-pair: tiers, a list of the tiers, only and always with when "tiers"/);
  assert.match(bad(p => (p.sensitive.tier = 'gone')), /the route's tier must be one of the tiers/);
});

// #262 C23: the builder's qualities checks, each with a bad case.
test('bad qualities: none or too many, a quality twice, a bar in a measure, no lens or five', () => {
  const bad = f => {
    const p = copyParts(DEFAULT_PARTS);
    f(p);
    return partsProblems(p).filter(x => x.level === 'error' && x.part === 'qualities').map(x => x.text).join(' / ');
  };
  assert.match(bad(p => (p.qualities = [])), /the list must hold 1 to 16 qualities/);
  assert.match(bad(p => (p.qualities = Array.from({ length: 17 }, (_, i) => ({ ...p.qualities[0], quality: `Q${i}` })))), /the list must hold 1 to 16 qualities/);
  assert.match(bad(p => (p.qualities[1].quality = p.qualities[0].quality)), /names one quality twice/);
  assert.match(bad(p => (p.qualities[0].measure = 'fast | cheap')), /row 1: the measure must be one line/);
  assert.match(bad(p => (p.qualities[0].lenses = [])), /row 1: 1 to 4 lenses/);
  assert.match(bad(p => (p.qualities[0].lenses = ['a-lens', 'b-lens', 'c-lens', 'd-lens', 'e-lens'])), /row 1: 1 to 4 lenses/);
});

// #287 C5, C9 (seam 2): the cost limits part's checks, each with a bad case.
test('bad cost limits: none or ten, an empty cost, a duplicate name in any case, a bar, an unknown field, an Enough naming a missing cost', () => {
  const bad = f => {
    const p = copyParts(DEFAULT_PARTS);
    f(p);
    return partsProblems(p).filter(x => x.level === 'error').map(x => `${x.part}: ${x.text}`).join(' / ');
  };
  assert.equal(bad(() => {}), '', 'the shipped part passes');
  assert.match(bad(p => (p.costLimits = [])), /cost-limits: the list must hold 1 to 9 cost rows/);
  assert.match(bad(p => (p.costLimits = Array.from({ length: 10 }, (_, i) => ({ ...p.costLimits[0], cost: `C${i}` })))), /cost-limits: the list must hold 1 to 9 cost rows/);
  assert.match(bad(p => (p.costLimits[0].cost = '  ')), /row 1: the cost must be one line of 1 to 60/);
  assert.match(bad(p => (p.costLimits[1].cost = ' tests ADDED ')), /names one cost twice/);
  assert.match(bad(p => (p.costLimits[0].counted = 'a | b')), /row 1: Counted as must be one line/);
  assert.match(bad(p => (p.costLimits[0].atLimit = 'a\nb')), /row 1: At the limit must be one line/);
  assert.match(bad(p => (p.costLimits[0].lenses = [])), /row 1: only cost, counted, limit and atLimit/);
  assert.match(bad(p => (p.qualities[0].enoughCosts = ['No such cost'])), /qualities: row 1: a cost it answers to has no row/);
  assert.equal(bad(p => (p.qualities[0].enoughCosts = [' tests ADDED'])), '', 'names match ignoring case and surrounding space');
  assert.match(bad(p => (p.qualities[0].enough = 'ASVS | L1')), /row 1: the Enough level must be one line/);
  assert.match(bad(p => (p.costLimits[0].limit = '2 | 3')), /row 1: the limit must be one line/);
  assert.match(bad(p => (p.qualities[0].enoughCosts = 'Tests added')), /row 1: the costs it answers to must list/);
  assert.match(bad(p => (p.qualities[0].enoughCosts = ['  '])), /row 1: the costs it answers to must list/);
  assert.match(bad(p => (p.qualities[0].enoughCosts = ['a | b'])), /row 1: the costs it answers to must list/);
  assert.equal(bad(p => {
    p.costLimits = Array.from({ length: 9 }, (_, i) => ({ ...p.costLimits[0], cost: `C${i}` }));
    p.qualities[0].enoughCosts = ['C0'];
    p.qualities[5].enoughCosts = ['C1'];
  }), '', 'nine rows are accepted');
  assert.equal(bad(p => (p.costLimits[0].limit = '')), '', 'an empty limit is the owner\'s judgment, not an error');
});

// #377 C2: the default ships the Lens pairs row after the three it had; Ultra Code keeps only those three.
test('the default cost limits end with the Lens pairs row, and Ultra Code carries the other three', () => {
  assert.deepEqual(DEFAULT_PARTS.costLimits.map(c => c.cost), ['Tests added', 'Hardening', 'Follow-up issues', 'Lens pairs']);
  assert.deepEqual(DEFAULT_PARTS.costLimits[3], { cost: 'Lens pairs', counted: 'Lens pairs run in one review round; a lens offered alone counts as a pair', limit: '2', atLimit: 'The next pair becomes a trade-off for me: which pair it would replace, and what it would check' });
  const ultra = shippedPresets(REPO, pactData(REPO)).find(p => p.id === 'ultra-code');
  assert.deepEqual(ultra.parts.costLimits, DEFAULT_PARTS.costLimits.slice(0, 3));
});

// #377 C3, C4 (replaces #287 C5): a cost no quality names limits the review itself, so the builder gives no finding, and the rules file and the page say so.
test('a cost no quality names draws no finding, and the rules file and the page say it limits the review itself', () => {
  const p = copyParts(DEFAULT_PARTS);
  p.costLimits.push({ cost: 'Review rounds', counted: 'Rounds', limit: '', atLimit: '' });
  assert.deepEqual(partsProblems(p).filter(x => x.part === 'cost-limits'), []);
  const rules = readFileSync(join(REPO, 'claude', 'CLAUDE.md'), 'utf8').replace(/\s+/g, ' ');
  assert.ok(rules.includes(`A cost that no quality's Enough names limits the review itself: count it each review round, by its Counted as, and follow its "At the limit"; the security pair, a lens a repo's own rules require and the lenses of a skill I typed count toward it, but it never holds them back, and a pair it holds back always comes to me as a trade-off, whatever its "At the limit" says.`), 'the Cost limits prose');
  assert.ok(PAGE.includes('Limits the review itself.'), 'the page names the reach');
  assert.ok(!PAGE.includes('This cost reaches no lens'), 'the page drops the caution');
});

// #287 C3: the Enough column and the shipped Functional suitability row.
test('the Enough column joins the qualities table only when a row sets a level or a cost, as "level, then each cost, with a middle dot between"', () => {
  const dot = String.fromCharCode(0xb7);
  const p = copyParts(DEFAULT_PARTS);
  const rows = parts => compileParts(parts).qualities.split('\n');
  assert.equal(rows(p)[0], '| Quality | Measure | Lens | Enough |');
  assert.equal(rows(p).find(l => l.startsWith('| Functional suitability |')), ['| Functional suitability | the acceptance claims | `behaviour-lens`, `integrity-lens`, `unstated-lens` | Tests added', 'Follow-up issues |'].join(` ${dot} `));
  assert.equal(rows(p).find(l => l.startsWith('| Security |')), `| Security | an ASVS 5.0 level or chapters | \`adversarial-lens\`, \`data-lens\` | Hardening ${dot} Follow-up issues |`);
  p.qualities[5].enough = 'ASVS L1';
  assert.ok(rows(p).find(l => l.startsWith('| Security |')).endsWith(`| ASVS L1 ${dot} Hardening ${dot} Follow-up issues |`));
  for (const q of p.qualities) {
    delete q.enough;
    delete q.enoughCosts;
  }
  assert.equal(rows(p)[0], '| Quality | Measure | Lens |', 'no row sets one: the table is as before #278');
  assert.equal(rows(p)[1], '| --- | --- | --- |');
});

// #287 C5: the cost and Enough fields join the content-policy walk.
test('a web address in a cost field or an Enough is read by the content policy', () => {
  const p = copyParts(DEFAULT_PARTS);
  p.costLimits[0].atLimit = 'see https://example.test/limits';
  p.costLimits[1].cost = 'https://example.test/cost-name';
  p.costLimits[1].counted = 'https://example.test/counted';
  p.costLimits[1].limit = 'https://example.test/limit';
  p.qualities[0].enough = 'see https://example.test/level';
  p.qualities[1].enoughCosts = ['https://example.test/cost'];
  const where = partsTexts(p).filter(([, t]) => /https:/.test(t)).map(([w]) => w);
  assert.deepEqual(where, ['qualities row 1', 'qualities row 2', 'cost limits row 1', 'cost limits row 2', 'cost limits row 2', 'cost limits row 2']);
});

// #287 C5: an old builder file takes the default cost limits.
test('a builder file from before #278 upgrades with the default cost limits, and one that has them keeps them', () => {
  const old = copyParts(DEFAULT_PARTS);
  delete old.costLimits;
  assert.deepEqual(upgradeParts(old).costLimits, DEFAULT_PARTS.costLimits);
  const mine = copyParts(DEFAULT_PARTS);
  mine.costLimits = [{ cost: 'Mine', counted: 'x', limit: '1', atLimit: 'y' }];
  assert.deepEqual(upgradeParts(mine).costLimits, mine.costLimits);
});

// #262 C23: a lens added to a quality reaches its row in the compiled qualities part.
test('a lens added to a quality reaches its row in the compiled qualities part', () => {
  const p = copyParts(DEFAULT_PARTS);
  p.qualities[0].lenses = [...p.qualities[0].lenses, 'reader-lens'];
  const rowOf = parts => compileParts(parts).qualities.split('\n').find(l => l.startsWith(`| ${p.qualities[0].quality} |`));
  assert.match(rowOf(p), /`unstated-lens`, `reader-lens` \| /);
  assert.doesNotMatch(rowOf(DEFAULT_PARTS), /reader-lens/);
});

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
  assert.deepEqual([kept.title, kept.lenses[2].asks, Object.keys(kept).sort()], ['Mine', 'Who needs what, unsaid?', ['costLimits', 'lenses', 'moves', 'qualities', 'schema', 'sensitive', 'tiers', 'title', 'workflowGraph', 'yours']]);
});

// #262 addendum 4: a builder file carries the agent files written on the page; a
// reopened page loads them back, a pact agent's file sets its model, and Save keeps them.
test('a builder file\'s agent files load into the page, set a pact agent\'s model, and come back in Save\'s builder.json', t => {
  const scout = readFileSync(join(REPO, 'claude', 'agents', 'scout.md'), 'utf8').replace(/^model: .*$/m, 'model: sonnet');
  const mine = '---\nname: my-reviewer\ndescription: Reads my diffs.\ntools: Read, Glob, Grep\nmodel: opus\neffort: low\n---\n\n# my-reviewer\n';
  const file = builderFile(t, { ...GOOD, agentFiles: { scout, 'my-reviewer': mine } }, GOOD_BLOCKS);
  assert.deepEqual(checkBuilder(REPO, file).refusals, []);
  const page = buildPage(REPO, PAGE, file);
  const out = JSON.parse(vm.runInContext(`${[...page.matchAll(SCRIPT_RE)][0][2]}\n;const s = initialState(); JSON.stringify({ scout: s.agents.scout, files: buildFiles(s).map(f => f.path), kept: JSON.parse(builderWith(null, s).text).agentFiles })`, vm.createContext({})));
  assert.equal(out.scout.model, 'sonnet');
  assert.deepEqual(out.files.filter(f => f.startsWith('agents/')), ['agents/my-reviewer.md', 'agents/scout.md']);
  assert.deepEqual(out.kept, { 'my-reviewer': mine, scout });
});

// #262 addendum 4: the builder check refuses agent files it can't carry.
test('bad builder file: agent files with a bad name, no text, or a web address are refused', t => {
  for (const [agentFiles, says] of [
    [{ 'Bad Name': 'x' }, /agentFiles entry 1 is not an agent name/],
    [{ mine: '' }, /agentFiles mine: the file must be text/],
    [{ mine: ['x'] }, /agentFiles mine: the file must be text/],
    [{ mine: `see ${'https:/'}/x.example` }, /agentFiles mine: holds text the page's content policy refuses/],
  ]) {
    const r = checkBuilder(REPO, builderFile(t, { ...GOOD, agentFiles }, GOOD_BLOCKS));
    assert.ok(r.refusals.some(m => says.test(m)), JSON.stringify(r.refusals));
  }
});

// #262: Reset comes back to where the page started, Level 3 · Full, not the plain pact.
test('reset puts the usage value, every part and every agent back to where the page started, Level 3 · Full, and undo puts it all back', () => {
  const s = L.initialState();
  assert.equal(L.atDefaults(s), true);
  assert.equal(L.atStart(s), false, 'the plain pact is not where the page starts');
  assert.equal(L.buildFiles(s).length, 1);
  s.usage = 90;
  s.parts.moves[1].text = 'Mine.';
  // Every agent off its default, and a model added, so a reset that misses one fails.
  for (const a of Object.keys(s.agents)) s.agents[a].model = s.agents[a].model === 'opus' ? 'sonnet' : 'opus';
  assert.equal(Object.keys(s.agents).length, 9);
  s.models.push('claude-opus-5-5');
  assert.equal(L.atDefaults(s), false);
  const changed = JSON.stringify(s);
  const before = L.resetAll(s);
  assert.equal(before, changed);
  assert.equal(L.atStart(s), true);
  const start = L.initialState();
  L.takePreset(start, L.PACT.presets.find(p => p.id === 'level-3-full'), L.presetPicks(L.PACT.presets.find(p => p.id === 'level-3-full')));
  assert.deepEqual(JSON.parse(JSON.stringify(s)), JSON.parse(JSON.stringify(start)));
  // A reset page saves Level 3 · Full: its workflow edit, no settings, no agents.
  // #183 T4a C4: what a reset page saves is the pact's default configuration, skills included once it has them.
  assert.deepEqual(JSON.parse(L.buildFiles(s).find(f => f.path === 'pact/config.json').text), DEFAULT_CONFIG);
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
function bootPage({ picker = false, folder = null, page = PAGE } = {}) {
  const script = [...page.matchAll(SCRIPT_RE)][0][2];
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

// #183 T4a (adversarial F1): Export names each skill source the configuration carries before Save, and the page's
// start state (the pact's default) gets the line exactly when the default names skills.
test('stub page: Export names each skill source the configuration carries before Save, and says nothing when there are none', () => {
  const SKILL = { repo: 'owner/skills', commit: 'a'.repeat(40), paths: ['skills/one', 'skills/two'] };
  const at = '    if (state.skills.length) notes.push(';
  const withSkills = PAGE.replace(at, `    state.skills = [${JSON.stringify(SKILL)}];\n${at}`);
  assert.notEqual(withSkills, PAGE, 'the plant must reach the Export notes');
  const P = bootPage({ page: withSkills });
  P.button(P.ids.actions, 'Export').click();
  assert.match(P.ids.output.text, /Check · skills · this configuration names skill sources that the cloud setup will fetch from #183 T4b on: owner\/skills at aaaaaaa, 2 paths\. Save them only if you chose them\./);
  const plain = bootPage();
  plain.button(plain.ids.actions, 'Export').click();
  const named = (DEFAULT_CONFIG.skills ?? []).map(s => `${s.repo} at ${s.commit.slice(0, 7)}, ${s.paths.length} path${s.paths.length === 1 ? '' : 's'}`).join('; ');
  if (named) assert.ok(plain.ids.output.text.includes(`fetch from #183 T4b on: ${named}. Save`), plain.ids.output.text);
  else assert.doesNotMatch(plain.ids.output.text, /Check · skills/);
});

// #262 addendum 3: Add agent in the Agents panel reaches the saved files, and the save note says a save never deletes.
test('stub page: Add agent in the Agents panel saves agents/<name>.md, and the save says it deletes nothing', () => {
  const P = bootPage();
  const panel = openAgents(P);
  P.find(panel, n => n.tag === 'input' && n.attrs['aria-label'] === 'New agent name')[0].value = 'my-reviewer';
  const add = P.find(P.ids.agents, n => n.tag === 'button' && n.attrs['aria-label'] === 'Add agent')[0];
  assert.equal(add.text, '+');
  add.click();
  P.button(P.ids.actions, 'Export').click();
  assert.match(P.ids.output.text, /agents\/my-reviewer\.md/);
  assert.match(P.ids.output.text, /a save deletes nothing/);
});

// #203 S6: the builder is the /scriptorium command, which only the owner starts; the repo skill is gone.
test('the page is named scriptorium, and the docs and the command name it so; the old names and the repo skill are gone', () => {
  assert.equal(PAGE_REL, 'builder/scriptorium.html');
  const command = join('claude', 'commands', 'scriptorium.md');
  for (const f of ['README.md', 'AGENTS.md', command, join('builder', 'build.mjs')]) {
    const text = readFileSync(join(REPO, f), 'utf8');
    assert.match(text, /scriptorium\.html/, `${f} does not name the page`);
    assert.doesNotMatch(text, /pact-config\.html|pact-builder/, `${f} still names the old page or skill`);
  }
  assert.match(readFileSync(join(REPO, command), 'utf8'), /^---\n(?:[^\n]*\n)*?disable-model-invocation: true\n(?:[^\n]*\n)*?---\n/);
  assert.equal(existsSync(join(REPO, '.claude', 'skills', 'scriptorium')), false, 'the repo skill is gone');
});

// #203 S6: /scriptorium compares a part it carries with the person's block through --texts.
test('--texts prints each part a builder file changes, as the page saves it, and nothing for a file that changes none', t => {
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  const cli = args => spawnSync(process.execPath, [join(REPO, 'builder', 'build.mjs'), ...args], { encoding: 'utf8', env });
  const tiers = copyParts(DEFAULT_PARTS.tiers);
  tiers[0].fits = 'Tiny work';
  const f = builderFile(t, { schema: 1, tiers });
  const r = cli(['--builder', f, '--texts']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const parts = upgradeParts({ ...copyParts(DEFAULT_PARTS), tiers });
  assert.equal(r.stdout.slice(r.stdout.indexOf('TEXT ')), `TEXT tiers\n${compileParts(parts).tiers}\nEND tiers\n`);
  const none = cli(['--builder', builderFile(t, { schema: 1 }), '--texts']);
  assert.match(none.stdout, /^TEXTS none/m);
  assert.equal(cli(['--builder', f, '--texts', '--check']).status, 2);
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
function pageLogic(page = PAGE) {
  const script = [...page.matchAll(SCRIPT_RE)][0][2];
  const ctx = vm.createContext({});
  const got = vm.runInContext(`${script}\n;({ PACT, initialState, problems, buildFiles, blockProblems, atDefaults, atStart, resetAll, restoreAll, keepCommands, OPT_COMMANDS, OPT_TOOLS, startState, partsChanged, builderWith, addAgent, resetPrompt, ownProblems, AGENT_TEMPLATE, fileTools, withTools, presetFromText, presetPicks, takePreset, startPicks, takeNote });`, ctx);
  const clone = v => (v === null || typeof v !== 'object' ? v : structuredClone(v));
  const out = { PACT: clone(got.PACT), OPT_COMMANDS: clone(got.OPT_COMMANDS), OPT_TOOLS: clone(got.OPT_TOOLS) };
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
  assert.deepEqual([...L.PACT.editable], ['moves', 'tiers', 'sensitive', 'workflow', 'lenses', 'qualities', 'cost-limits']);
});

test('with nothing changed, the page saves a configuration that sets nothing', () => {
  const s = L.initialState();
  assert.deepEqual(L.problems(s), []);
  assert.deepEqual(JSON.parse(JSON.stringify(L.buildFiles(s))), [{ path: 'pact/config.json', text: '{\n  "schema": 1\n}\n' }]);
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
  assert.equal(kept.files[0].path, 'pact/config.json');
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
  // The Claude folder: its pact folder holds config.json.
  const inPact = d => ({ getDirectoryHandle: async () => d });
  const fail = name => inPact({ getFileHandle: async () => { throw Object.assign(new Error('x'), { name }); } });
  const holding = text => inPact({ getFileHandle: async () => ({ getFile: async () => ({ text: async () => text }) }) });
  const none = await keepCommandsIn(fail('NotFoundError'), files);
  assert.equal(none.files, files, 'no config.json there: the files go as built');
  const unreadable = await keepCommandsIn(fail('NotReadableError'), files);
  assert.equal(unreadable.files, undefined, 'nothing to write');
  assert.match(unreadable.refuse, /could not be read, so nothing was written/);
  const kept = await keepCommandsIn(holding('{"schema":1,"commands":["finis"]}'), files);
  assert.deepEqual(JSON.parse(kept.files[0].text).commands, ['finis']);
  assert.match((await keepCommandsIn(holding('{'), files)).refuse, /not valid JSON/);
});

// #203 S10: the page writes the commands list once the person sets it, in the installer's order, never /scriptorium; until then a save keeps the folder's.
test('a commands list set on the page is saved in the installer\'s order without scriptorium, and wins over the folder\'s; left as is, the folder\'s is kept', () => {
  assert.deepEqual(L.OPT_COMMANDS.map(c => c.name), PACT_COMMANDS.filter(n => n !== 'scriptorium'));
  const s = L.startState();
  assert.equal(s.commands, null);
  const config = st => JSON.parse(L.buildFiles(st)[0].text);
  assert.equal(Object.hasOwn(config(s), 'commands'), false, 'left as is, no list');
  assert.deepEqual(JSON.parse(L.keepCommands(L.buildFiles(s), '{"schema":1,"commands":["finis"]}').files[0].text).commands, ['finis'], 'left as is keeps the folder\'s');
  s.commands = ['finis', 'scriptorium', 'make-it-so'];
  assert.deepEqual(config(s).commands, ['make-it-so', 'finis']);
  s.commands = [];
  assert.deepEqual(JSON.parse(L.keepCommands(L.buildFiles(s), '{"schema":1,"commands":["finis"]}').files[0].text).commands, [], 'the page\'s empty list wins');
});

// #262, owner decision after adversarial-lens F1: a shared file's agent files start unticked; its parts start ticked.
test('stub page: a shared file opened in Presets starts its agent file rows unticked and its parts ticked', async () => {
  const P = bootPage();
  P.button(P.ids.actions, 'Presets').click();
  const input = P.find(P.ids.presets, n => n.tag === 'input' && n.attrs['aria-label'] === 'Open a builder file')[0];
  const doc = { schema: 1, title: 'Shared', moves: L.PACT.parts.defaults.moves, agentFiles: { scout: '---\nname: scout\ndescription: Looks.\n---\n\nBody.\n' } };
  input.files = [{ name: 'shared.json', text: async () => JSON.stringify(doc) }];
  input.listeners.change.forEach(f => f({}));
  for (let i = 0; i < 10; i++) await new Promise(r => setTimeout(r, 0));
  const box = label => P.find(P.ids.presets, n => n.tag === 'input' && n.attrs['aria-label'] === `Take ${label}`)[0];
  assert.equal(box('Agent file: scout').checked, false);
  assert.equal(box('The moves').checked, true);
});

// #203 S10: one checkbox per opt-in command, /scriptorium on and locked, and Leave as is.
test('stub page: ticking /finis under Settings saves it; Leave as is drops the list again', () => {
  const P = bootPage();
  openSettings(P);
  const box = name => P.find(P.ids.settings, n => n.tag === 'input' && n.attrs['aria-label'] === name)[0];
  assert.equal(box('/scriptorium').checked && box('/scriptorium').disabled, true);
  box('/finis').checked = true;
  box('/finis').listeners.change.forEach(f => f({}));
  P.button(P.ids.actions, 'Export').click();
  assert.match(P.ids.output.text, /"commands": \[\s*"finis"\s*\]/);
  P.button(P.ids.settings, 'Leave as is').click();
  P.button(P.ids.actions, 'Export').click();
  assert.doesNotMatch(P.ids.output.text, /"commands"/);
});

test('stub page: the review step warns that a downloaded config.json holds no commands list, with or without a folder picker (#203, T2)', () => {
  for (const picker of [false, true]) {
    const P = bootPage({ picker });
    P.button(P.ids.actions, 'Export').click();
    const text = P.ids.output.text;
    assert.ok(P.find(P.ids.output, n => n.tag === 'button' && n.text === 'Download config.json').length, `picker ${picker}: a download button`);
    assert.match(text, /Unless you set the commands under Settings, a downloaded config\.json holds no commands list: if yours has one, copy its commands entry across, or the next install deletes those commands\./, `picker ${picker}`);
    assert.equal(/keeping a commands list config\.json already holds unless you set the commands under Settings/.test(text), picker, `picker ${picker}: the save note says Save keeps the list only where Save exists`);
  }
});
// #280 C5: the tools list works as the commands list does: left as is until set on the page, then saved as set.
test('a tools list set on the page is saved in the installer\'s order, and wins over the folder\'s; left as is, the folder\'s is kept', () => {
  assert.deepEqual(L.OPT_TOOLS.map(c => c.name), PACT_TOOLS);
  const s = L.startState();
  assert.equal(s.tools, null, 'off by default: left as is');
  const config = st => JSON.parse(L.buildFiles(st)[0].text);
  assert.equal(Object.hasOwn(config(s), 'tools'), false, 'left as is, no list');
  assert.deepEqual(JSON.parse(L.keepCommands(L.buildFiles(s), '{"schema":1,"tools":["poster"]}').files[0].text).tools, ['poster'], 'left as is keeps the folder\'s');
  assert.deepEqual(JSON.parse(L.keepCommands(L.buildFiles(s), '{"schema":1,"commands":["finis"],"tools":["poster"]}').files[0].text), { ...config(s), commands: ['finis'], tools: ['poster'] }, 'both lists kept');
  s.tools = ['poster'];
  assert.deepEqual(config(s).tools, ['poster']);
  s.tools = [];
  assert.deepEqual(JSON.parse(L.keepCommands(L.buildFiles(s), '{"schema":1,"tools":["poster"]}').files[0].text).tools, [], 'the page\'s empty list wins');
});

// #280 C5: no preset, and no shared builder file, turns a tool on.
test('no shipped preset carries tools, and a builder file holding tools is refused, by the page and by the build', t => {
  for (const f of readdirSync(join(REPO, 'builder', 'presets'))) assert.equal(Object.hasOwn(JSON.parse(readFileSync(join(REPO, 'builder', 'presets', f), 'utf8')), 'tools'), false, f);
  const doc = { schema: 1, moves: L.PACT.parts.defaults.moves, tools: ['poster'] };
  assert.match(L.presetFromText(JSON.stringify(doc)).refuse, /a builder file never turns a tool on/);
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  const cli = args => spawnSync(process.execPath, [join(REPO, 'builder', 'build.mjs'), ...args], { encoding: 'utf8', env });
  const r = cli(['--builder', builderFile(t, doc), '--check']);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /^REFUSE a top-level key that is not schema, title, yours, /m);
});

// #280 C5: a shared file holding tools leaves the page's own tools list as it was.
test('stub page: the poster row is off by default and says what it does; a shared file holding tools leaves the list as set', async () => {
  const P = bootPage();
  openSettings(P);
  const box = P.find(P.ids.settings, n => n.tag === 'input' && n.attrs['aria-label'] === 'poster')[0];
  assert.equal(box.checked, false, 'off by default');
  // The text as the row shows it on the page, beside its checkbox.
  const row = P.find(P.ids.settings, n => n.tag === 'label' && n.children.some(c => c.attrs && c.attrs['aria-label'] === 'poster'))[0].text;
  assert.match(row, /posts free text to GitHub as your gh account/i);
  assert.match(row, /its scan is a backstop, not a guarantee/);
  assert.match(row, /adds a rule to the rules file, which a dry run with --review-folder shows/);
  box.checked = true;
  box.listeners.change.forEach(f => f({}));
  P.button(P.ids.actions, 'Presets').click();
  const input = P.find(P.ids.presets, n => n.tag === 'input' && n.attrs['aria-label'] === 'Open a builder file')[0];
  input.files = [{ name: 'shared.json', text: async () => JSON.stringify({ schema: 1, moves: L.PACT.parts.defaults.moves, tools: [] }) }];
  input.listeners.change.forEach(f => f({}));
  for (let i = 0; i < 10; i++) await new Promise(r => setTimeout(r, 0));
  assert.match(P.ids.presets.text, /a builder file never turns a tool on/, 'the file was read and refused');
  P.button(P.ids.actions, 'Export').click();
  assert.match(P.ids.output.text, /"tools": \[\s*"poster"\s*\]/);
});

// The owner's request on #284: every checkbox's label text toggles it, so each box sits inside a label.
test('stub page: every checkbox under Settings and in a shared file\'s Presets sits inside a label', async () => {
  const P = bootPage();
  const boxes = root => P.find(root, n => n.tag === 'input' && n.attrs.type === 'checkbox');
  const labelled = root => P.find(root, n => n.tag === 'label').flatMap(l => boxes(l));
  openSettings(P);
  assert.ok(boxes(P.ids.settings).length >= 4, 'the commands and the tools');
  assert.equal(labelled(P.ids.settings).length, boxes(P.ids.settings).length);
  P.button(P.ids.actions, 'Presets').click();
  const input = P.find(P.ids.presets, n => n.tag === 'input' && n.attrs['aria-label'] === 'Open a builder file')[0];
  input.files = [{ name: 'shared.json', text: async () => JSON.stringify({ schema: 1, moves: L.PACT.parts.defaults.moves }) }];
  input.listeners.change.forEach(f => f({}));
  for (let i = 0; i < 10; i++) await new Promise(r => setTimeout(r, 0));
  assert.ok(boxes(P.ids.presets).length >= 1, 'a part to take');
  assert.equal(labelled(P.ids.presets).length, boxes(P.ids.presets).length);
});

// #280 C5: the download note's tools twin.
test('stub page: the review step warns that a downloaded config.json holds no tools list either', () => {
  const P = bootPage();
  P.button(P.ids.actions, 'Export').click();
  assert.match(P.ids.output.text, /Unless you set the tools under Settings, a downloaded config\.json holds no tools list: if yours has one, copy its tools entry across, or the next install deletes those tools\./);
});

// #183 C4: with no configuration of the person's, the pact's default renders (ADR 0094).
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
  // The page starts from Level 3 · Full, so even an untouched save carries its workflow.
  const kept = await save(fakeFolder({ 'config.json': '{"schema":1,"commands":["finis"]}' }));
  assert.deepEqual(JSON.parse(kept['config.json']), { ...DEFAULT_CONFIG, commands: ['finis'] });
  assert.deepEqual(await save(fakeFolder({ 'config.json': '{"schema":1,"commands":' })), {}, 'nothing is written');
  assert.deepEqual(JSON.parse((await save(fakeFolder({})))['config.json']), DEFAULT_CONFIG, 'no file there: the save goes as built');
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

// #262: the Tools field reads and writes the file's tools line; empty drops it, so the agent gets every tool.
test('the Tools field sets an agent file\'s tools line, adds one after the description, and drops it when empty', () => {
  const scout = L.PACT.agents.find(a => a.name === 'scout').file;
  assert.equal(L.fileTools(scout), '[Read, Glob, Grep]');
  assert.match(L.withTools(scout, 'Read, Grep'), /^tools: Read, Grep$/m);
  assert.equal(L.fileTools(L.withTools(scout, '')), '');
  const bare = '---\nname: x\ndescription: D.\n---\n\nBody.\n';
  assert.equal(L.withTools(bare, 'Read'), '---\nname: x\ndescription: D.\ntools: Read\n---\n\nBody.\n');
});

// #262 addendum 3: Add agent starts from a template the gate takes; a bad or taken name is refused.
test('Add agent starts a new agent from the template, and refuses a taken or malformed name; a broken file is the page\'s error', () => {
  const s = L.initialState();
  assert.match(L.addAgent(s, 'scout'), /already/);
  assert.match(L.addAgent(s, 'My Agent'), /lowercase/);
  assert.equal(L.addAgent(s, 'my-reviewer'), null);
  assert.match(s.own['my-reviewer'], /^---\nname: my-reviewer\n/);
  assert.match(s.own['my-reviewer'], /^tools: Read, Glob, Grep$/m);
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
  assert.deepEqual(L.PACT.agents.map(a => a.name), ['adversarial-lens', 'behaviour-lens', 'conventions-lens', 'data-lens', 'executability-lens', 'integrity-lens', 'reader-lens', 'scout', 'unstated-lens']);
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
  assert.match(L.buildFiles(s).find(f => f.path === 'pact/blocks/tiers.md').text, /claude-opus-5-5, xhigh/);
  // A model the gate would refuse is the page's error too.
  s.models.push('claude opus');
  assert.ok(L.problems(s).some(p => p.where === 'models' && p.level === 'error'));
});

// #262 S19: the builder's model shape is the renderer's.
test('the builder takes the renderer\'s model shape', () => {
  const render = readFileSync(join(GATE, 'render-core.mjs'), 'utf8');
  assert.equal(/const AGENT_MODEL_RE = (.*);/.exec(render)[1], String(MODEL_RE));
});

test('the page takes each lens\'s class from the renderer: five security-set, two of them egress, integrity-lens plain', () => {
  const cls = Object.fromEntries(L.PACT.agents.filter(a => a.configurable).map(a => [a.name, `${a.security ? 'security-set' : 'plain'} ${a.egress ? 'egress' : 'local'}`]));
  assert.deepEqual(cls, {
    'adversarial-lens': 'security-set egress',
    'behaviour-lens': 'security-set egress',
    'conventions-lens': 'plain local',
    'data-lens': 'security-set local',
    'executability-lens': 'security-set local',
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
    const p = join(h, ...f.path.split('/'));
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

// #262 addendum 4: a shipped preset carries only what its file gives; a refused one stops the build.
test('a shipped preset is carried with only the parts, models and agent files it gives; a refused preset stops the build', t => {
  const dir = tempDir(t, 'pact-presets-');
  writeFileSync(join(dir, 'level-1.json'), JSON.stringify({ schema: 1, title: 'Level 1', tiers: [{ id: 'only', name: 'Only', fits: 'All work', plan: 'none', build: 'Sonnet, medium' }], agentFiles: { mine: '---\nname: mine\n---\n' } }));
  const [p] = shippedPresets(REPO, pactData(REPO), dir);
  assert.deepEqual([p.id, p.title, Object.keys(p.parts), Object.keys(p.agentFiles)], ['level-1', 'Level 1', ['tiers'], ['mine']]);
  writeFileSync(join(dir, 'z-bad.json'), JSON.stringify({ schema: 1, tiers: [] }));
  assert.throws(() => shippedPresets(REPO, pactData(REPO), dir), /the preset z-bad\.json is refused: .*1 to 6 tiers/);
});

// #203 S6, C5: the builder runs as the installed kit, from the rules source, and writes its page only somewhere new, outside any repo or Claude folder.
test('the builder kit builds a page from a builder file, refuses to rebuild itself, and refuses an output in the kit, the Claude home, a .claude folder, a git work tree or over a file', t => {
  const home = join(tempDir(t, 'pact-kit-'), 'claude-home');
  const kit = join(home, 'pact', 'builder');
  // The gate's own kit list, the agents and presets by their folders, so the test runs the kit that installs.
  for (const rel of [...BUILDER_KIT.filter(r => r !== KIT_RULES_REL), 'claude/agents', 'builder/presets']) cpSync(join(REPO, rel), join(kit, rel), { recursive: true });
  cpSync(join(REPO, 'claude', 'CLAUDE.md'), join(kit, 'claude', 'rules.source.md'));
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  delete env.CLAUDE_CONFIG_DIR;
  const cli = args => spawnSync(process.execPath, [join(kit, 'builder', 'build.mjs'), ...args], { encoding: 'utf8', env, cwd: dirname(home) });
  const f = builderFile(t, GOOD, GOOD_BLOCKS);
  const ok = cli(['--builder', f]);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  const wrote = /^WROTE (.+)$/m.exec(ok.stdout)[1];
  t.after(() => rmSync(dirname(wrote), { recursive: true, force: true }));
  assert.deepEqual(pageProblems(readFileSync(wrote, 'utf8')), [], 'the page is written, by default in a new temporary folder');
  const self = cli([]);
  assert.equal(self.status, 1);
  assert.match(self.stdout, /never rebuilds its own page/);
  const repo = tempDir(t, 'pact-kit-repo-');
  mkdirSync(join(repo, '.git'));
  mkdirSync(join(repo, 'deep'));
  const dotClaude = join(tempDir(t, 'pact-kit-dot-'), '.claude');
  mkdirSync(dotClaude);
  for (const [out, why] of [
    [join(kit, 'mine.html'), /outside the builder kit/],
    [join(home, 'mine.html'), /outside the Claude home folder/],
    [join(dotClaude, 'mine.html'), /any \.claude folder/],
    [join(repo, 'deep', 'mine.html'), /outside any git work tree/],
    [wrote, /must be a new file/],
  ]) {
    const r = cli(['--builder', f, '--out', out]);
    assert.equal(r.status, 1, `${out}: ${r.stdout}`);
    assert.match(r.stdout, why);
  }
  cpSync(join(REPO, 'claude', 'CLAUDE.md'), join(kit, 'claude', 'CLAUDE.md'));
  const both = cli(['--builder', f, '--check']);
  assert.notEqual(both.status, 0);
  assert.match(both.stdout + both.stderr, /both claude\/CLAUDE\.md and claude\/rules\.source\.md/);
});

// The protected set, item 2: a shipped preset never drops the security pair on the sensitive route, or its one offer when the route wasn't taken.
// A preset's workflow names its own tiers, so it carries them: taken after another preset, it never keeps that one's tiers.
test('every shipped preset carries its tiers and a workflow that offers the security pair on the sensitive route and once more when it was not taken', () => {
  const presets = shippedPresets(REPO, pactData(REPO));
  assert.ok(presets.length >= 6, 'the six presets ship');
  for (const p of presets) {
    assert.ok(p.parts.tiers && p.parts.workflowGraph, p.id);
    const whens = p.parts.workflowGraph.offers.filter(o => o.on && ['adversarial-lens', 'data-lens'].every(a => o.agents.includes(a))).map(o => o.when);
    assert.ok(whens.includes('sensitive') && whens.includes('sensitive-declined'), p.id);
    // #262, behaviour-lens F4: the sensitive text names the stage that holds that one offer.
    const all = upgradeParts({ ...copyParts(DEFAULT_PARTS), ...copyParts(p.parts) });
    const declined = all.workflowGraph.offers.find(o => o.when === 'sensitive-declined');
    const stage = all.workflowGraph.stages.find(st => st.id === declined.stage).name;
    assert.match(compileParts(all).sensitive.replace(/\s+/g, ' '), new RegExp(`once more at ${stage} when`), p.id);
  }
});

// #262 addendum 4: a shared file is checked as the page can, and refused with why.
test('a shared file opens as a preset only when the page can use it, and says why when not', () => {
  assert.match(L.presetFromText('{').refuse, /not valid JSON/);
  assert.match(L.presetFromText('{"schema": 1, "presets": []}').refuse, /keys a builder file doesn't: presets/);
  assert.match(L.presetFromText('{"schema": 1, "tiers": []}').refuse, /tiers: tiers must list 1 to 6 tiers/);
  assert.match(L.presetFromText('{"schema": 1, "agentFiles": {"Bad": "x"}}').refuse, /^agentFiles entry 1 is not an agent name with a file$/);
  assert.match(L.presetFromText('{"schema": 1}').refuse, /gives no part, models, agent files or skill sources/);
  // Tiers without a workflow meet the pact's workflow: its offers take the tiers that exist.
  const r = L.presetFromText(JSON.stringify({ schema: 1, title: 'Two tiers', tiers: [{ id: 'light', name: 'Light', fits: 'Small', plan: 'none', build: 'Sonnet, medium' }, { id: 'full', name: 'Full', fits: 'The rest', plan: 'Opus, high', build: 'Sonnet, medium' }] }));
  assert.equal(r.refuse, undefined);
  assert.deepEqual(L.presetPicks(r.preset), ['part:tiers']);
});

// #302 C6: a saved builder file that still names the retired lens loads without the name, with a note, on both load paths; its agent file is not taken.
const staleDoc = () => {
  const g = copyParts(DEFAULT_PARTS).workflowGraph;
  g.offers = [
    { id: 'design-spec-pair', stage: 'design', when: 'tiers', tiers: ['standard', 'thorough'], words: '', agents: ['executability-lens', 'good-enough-lens'], on: true },
    { id: 'design-unstated', stage: 'design', when: 'tiers', tiers: ['standard', 'thorough'], words: '', agents: ['unstated-lens'], on: true },
    { id: 'only-old', stage: 'design', when: 'tiers', tiers: ['standard'], words: '', agents: ['good-enough-lens'], on: true },
    ...g.offers.filter(o => o.stage === 'test'),
    { id: 'test-unstated', stage: 'test', when: 'tiers', tiers: ['standard', 'thorough'], words: '', agents: ['unstated-lens'], on: true },
  ];
  return {
    schema: 1,
    workflowGraph: g,
    lenses: [{ agents: ['executability-lens', 'good-enough-lens'], label: 'the spec pair', asks: 'Would it run?' }, { agents: ['good-enough-lens'], label: 'old', asks: 'x' }, { agents: ['unstated-lens'], label: 'the gatekeeper', asks: 'y' }],
    qualities: [{ quality: 'Safety', measure: 'x', lenses: ['good-enough-lens', 'behaviour-lens'] }],
    agentFiles: { 'good-enough-lens': '---\nname: good-enough-lens\n---\nmine\n' },
  };
};

test('bad case: a shared file naming good-enough-lens loads with the name taken out and a note; a clean file carries none', () => {
  const r = L.presetFromText(JSON.stringify(staleDoc()));
  assert.equal(r.refuse, undefined, r.refuse);
  assert.equal(r.preset.droppedRetired, true);
  assert.ok(!JSON.stringify(r.preset).includes('good-enough-lens'), 'the retired name survived the load');
  const offers = r.preset.parts.workflowGraph.offers;
  assert.deepEqual(offers.filter(o => o.stage === 'design').map(o => [o.id, o.agents]), [['design-spec-pair', ['executability-lens', 'unstated-lens']]], 'the spec pair takes the second lens, and the emptied and the separate offers go');
  assert.deepEqual(offers.filter(o => o.stage === 'test').map(o => [o.id, o.agents]), [...DEFAULT_PARTS.workflowGraph.offers.filter(o => o.stage === 'test').map(o => [o.id, o.agents]), ['test-unstated', ['unstated-lens']]], 'the Test offers stay as given, an old lone one included');
  assert.deepEqual(r.preset.parts.lenses.map(x => x.agents), [['executability-lens', 'unstated-lens'], ['unstated-lens']], 'an emptied row goes');
  assert.deepEqual(r.preset.parts.qualities[0].lenses, ['behaviour-lens']);
  assert.equal(r.preset.agentFiles, undefined);
  assert.ok(PAGE.includes('named an agent the pact retired'), 'the take dialog carries the note');
  const clean = L.presetFromText(JSON.stringify({ schema: 1, qualities: [{ quality: 'Safety', measure: 'x', lenses: ['executability-lens'] }] }));
  assert.equal(clean.refuse, undefined, clean.refuse);
  assert.equal(clean.preset.droppedRetired, undefined);
});

test('bad case: a builder file naming good-enough-lens, built into a page, starts without the name and with the note flag', t => {
  const file = builderFile(t, staleDoc());
  const checked = checkBuilder(REPO, file);
  assert.deepEqual(checked.refusals, []);
  assert.ok(checked.findings.some(x => /names an agent the pact retired/.test(x)), checked.findings.join(' / '));
  const page = buildPage(REPO, PAGE, file);
  const got = vm.runInContext(`${[...page.matchAll(SCRIPT_RE)][0][2]}
;JSON.stringify({ s: initialState(), files: buildFiles(initialState()), flag: PACT.droppedRetired })`, vm.createContext({}));
  const { s, files, flag } = JSON.parse(got);
  assert.equal(flag, true);
  assert.ok(!JSON.stringify(s).includes('good-enough-lens'), 'the saved state kept the retired name');
  assert.ok(!files.some(x => /good-enough-lens/.test(x.path || x.name || '')), 'a save writes the retired agent file');
});

// #302 C6, #377 C4: the half-of-a-pair warning fires for a lone lens at any stage; unstated-lens alone at Test is no exception.
test('an offer of one lens of a pair draws the warning, unstated-lens alone at Test included', () => {
  const warns = p => partsProblems(p).filter(x => x.level === 'warn' && /half of/.test(x.text)).map(x => x.text);
  assert.deepEqual(warns(copyParts(DEFAULT_PARTS)), []);
  const lone = copyParts(DEFAULT_PARTS);
  lone.workflowGraph.offers.find(o => o.id === 'test-qa-pair').agents = ['behaviour-lens'];
  assert.match(warns(lone).join(), /offer test-qa-pair: half of/);
  const design = copyParts(DEFAULT_PARTS);
  design.workflowGraph.offers.find(o => o.id === 'design-spec-pair').agents = ['unstated-lens'];
  assert.match(warns(design).join(), /offer design-spec-pair: half of/);
  // A saved file that still carries the old one-lens row and its Test offer draws the warning too.
  const old = copyParts(DEFAULT_PARTS);
  old.lenses.push({ agents: ['unstated-lens'], label: 'the gatekeeper', asks: 'What need did nobody write down?' });
  old.workflowGraph.offers.push({ id: 'test-unstated', stage: 'test', when: 'tiers', tiers: ['standard', 'thorough'], words: '', agents: ['unstated-lens'], on: true });
  assert.match(warns(old).join(), /offer test-unstated: half of executability-lens and unstated-lens/);
  // A one-lens row added to a file never switches the warning off.
  const added = copyParts(DEFAULT_PARTS);
  added.lenses.push({ agents: ['adversarial-lens'], label: 'mine', asks: 'x' });
  added.workflowGraph.offers.push({ id: 'test-lone-adv', stage: 'test', when: 'every-build', words: '', agents: ['adversarial-lens'], on: true });
  assert.match(warns(added).join(), /offer test-lone-adv: half of/);
});

// #377 C1: every lens of the pact is offered in a pair, in the default, every preset and every example block.
test('no default lens row, and no offer in the default, a preset or an example block, names one pact lens alone', () => {
  const pact = new Set(DEFAULT_PARTS.lenses.flatMap(r => r.agents));
  assert.deepEqual(DEFAULT_PARTS.lenses.filter(r => r.agents.length < 2).map(r => r.label), []);
  const lone = (where, offers) => offers.filter(o => o.agents.length < 2).map(o => `${where}: ${o.id}`);
  const found = [...lone('default', DEFAULT_PARTS.workflowGraph.offers), ...shippedPresets(REPO, pactData(REPO)).flatMap(p => lone(p.id, p.parts.workflowGraph?.offers ?? []))];
  const blocks = join(REPO, 'examples', 'pact-config', 'blocks');
  for (const name of readdirSync(blocks).filter(n => n.endsWith('.md'))) {
    const text = readFileSync(join(blocks, name), 'utf8');
    // A lenses row's first cell, or one offer in a workflow cell: the pact lenses it names.
    const named = s => [...s.matchAll(/`([a-z-]+)`/g)].map(m => m[1]).filter(a => pact.has(a));
    const rows = text.split('\n').filter(l => l.startsWith('| `'));
    const firsts = name.startsWith('lenses-') ? rows.map(l => l.split('|')[1]) : [];
    const offers = name.startsWith('workflow-') ? text.split('\n').filter(l => l.startsWith('| ')).flatMap(l => l.split('|').flatMap(c => c.split('; ').filter(s => /^`[a-z-]+-lens`.*: /.test(s.trim())).map(s => s.split(':')[0]))) : [];
    for (const s of [...firsts, ...offers]) if (named(s).length === 1) found.push(`${name}: ${s.trim()}`);
  }
  assert.deepEqual(found, []);
});

test('a separate gatekeeper offer that reaches wider than the spec pair stays when a saved file is loaded', () => {
  const doc = staleDoc();
  doc.workflowGraph.offers.find(o => o.id === 'design-unstated').tiers = ['quick', 'standard', 'thorough'];
  const r = L.presetFromText(JSON.stringify(doc));
  assert.equal(r.refuse, undefined, r.refuse);
  assert.ok(r.preset.parts.workflowGraph.offers.some(o => o.id === 'design-unstated'), 'the wider offer was removed');
});

// #262 addendum 4: only what is ticked is taken; the rest stays the person's, and the parts agree with the tiers taken.
test('taking a preset replaces only the ticked parts and agent files, and the workflow follows the tiers taken', () => {
  const { preset } = L.presetFromText(JSON.stringify({ schema: 1, tiers: [{ id: 'light', name: 'Light', fits: 'Small', plan: 'none', build: 'Sonnet, medium' }, { id: 'full', name: 'Full', fits: 'The rest', plan: 'Opus, high', build: 'Sonnet, medium' }], moves: [{ lead: 'Theirs', text: 'Their move.' }], agentFiles: { scout: '---\nname: scout\nmodel: opus\neffort: low\n---\n', mine: '---\nname: mine\n---\n' } }));
  const s = L.initialState();
  const out = L.takePreset(s, preset, ['part:tiers', 'agent:scout']);
  assert.deepEqual(out, ['scout']);
  const got = JSON.parse(JSON.stringify(s));
  assert.deepEqual([got.parts.tiers.map(t => t.id), got.parts.moves[0].lead, Object.keys(got.own), got.agents.scout.model], [['light', 'full'], 'Sense the work', ['scout'], 'opus']);
  assert.equal(got.parts.sensitive.tier, 'full');
  assert.deepEqual(got.parts.workflowGraph.stages.find(x => x.id === 'design').skipAt, []);
});

// ------------------------------------------------------------ #283: a person's own presets

/** The installed kit laid out in a fresh Claude home; `cli` runs its build.mjs. */
function kitHome(t) {
  const home = join(tempDir(t, 'pact-own-'), 'claude-home');
  const kit = join(home, 'pact', 'builder');
  for (const rel of [...BUILDER_KIT.filter(r => r !== KIT_RULES_REL), 'claude/agents', 'builder/presets']) cpSync(join(REPO, rel), join(kit, rel), { recursive: true });
  cpSync(join(REPO, 'claude', 'CLAUDE.md'), join(kit, 'claude', 'rules.source.md'));
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  delete env.CLAUDE_CONFIG_DIR;
  const cli = args => spawnSync(process.execPath, [join(kit, 'builder', 'build.mjs'), ...args], { encoding: 'utf8', env, cwd: dirname(home) });
  return { home, kit, presets: join(home, 'pact', 'presets'), cli };
}

const ONE_TIER = [{ id: 'only', name: 'Only', fits: 'All work', plan: 'none', build: 'Sonnet, medium' }];
const findingLines = out => out.split('\n').filter(l => l.startsWith('FINDING presets')).map(l => l.replace(/\r$/, ''));

/** Run the kit's page on `f` and read the page it wrote. */
function ownPage(t, k, f) {
  const r = k.cli(['--builder', f]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const wrote = /^WROTE (.+)$/m.exec(r.stdout)[1];
  t.after(() => rmSync(dirname(wrote), { recursive: true, force: true }));
  return { r, text: readFileSync(wrote, 'utf8') };
}

// #283 C1
test('C1: the kit lists a person\'s good preset under ownPresets, with only what it gives, and prints no finding', t => {
  const k = kitHome(t);
  const f = builderFile(t, GOOD, GOOD_BLOCKS);
  const none = ownPage(t, k, f);
  assert.deepEqual(pageLogic(none.text).PACT.ownPresets, []);
  assert.deepEqual(findingLines(none.r.stdout), [], 'no presets folder is no finding');
  assert.ok(!/^LISTED/m.test(none.r.stdout));
  mkdirSync(k.presets, { recursive: true });
  writeFileSync(join(k.presets, 'mine.json'), JSON.stringify({ schema: 1, title: 'Mine', tiers: ONE_TIER, models: ['Opus'], agentFiles: { mine: '---\nname: mine\n---\n' } }));
  const { r, text } = ownPage(t, k, f);
  assert.deepEqual(findingLines(r.stdout), []);
  assert.deepEqual(r.stdout.split('\n').filter(l => l.startsWith('LISTED')).map(l => l.trim()), ['LISTED presets/mine.json']);
  const P = pageLogic(text).PACT;
  assert.equal(P.ownPresets.length, 1);
  const [p] = P.ownPresets;
  assert.deepEqual([p.id, p.title, Object.keys(p.parts), p.models, Object.keys(p.agentFiles)], ['mine', 'Mine', ['tiers'], ['Opus'], ['mine']]);
  assert.deepEqual(P.presets, pageLogic(none.text).PACT.presets, 'presets holds the shipped ones only');
  assert.deepEqual(P.presets, shippedPresets(REPO, pactData(REPO)));
});

// #283 C2
test('C2: a bad personal preset is left out with a finding on every run, no message quotes a file, and 16 are read at most', t => {
  const k = kitHome(t);
  mkdirSync(k.presets, { recursive: true });
  const put = (name, doc) => writeFileSync(join(k.presets, name), typeof doc === 'string' ? doc : JSON.stringify(doc));
  put('a-bad-tiers.json', { schema: 1, tiers: [] });
  put('a b.json', { schema: 1, models: ['Opus'] });
  put('a-null-tier.json', '{"schema":1,"tiers":[null]}');
  put('a-url.json', { schema: 1, agentFiles: { 'zebra quokka': `see ${'https:/'}/x.example` } });
  put('a-empty.json', { schema: 1 });
  put('a-badkey.json', { schema: 1, agentFiles: { 'zebra quokka': 'x' } });
  const pair = copyParts(DEFAULT_PARTS);
  pair.lenses.find(r => r.agents.join() === 'behaviour-lens,integrity-lens').label = 'walrus mango';
  pair.workflowGraph.offers.find(o => o.id === 'test-qa-pair').agents = ['behaviour-lens'];
  put('a-pair.json', { schema: 1, lenses: pair.lenses, workflowGraph: pair.workflowGraph });
  put('a-proto.json', '{"schema":1,"models":["Opus"],"yours":{"skills":[{"name":"a","__proto__":{"x":1}}]}}');
  for (let i = 1; i <= 20; i++) put(`g${String(i).padStart(2, '0')}.json`, { schema: 1, models: [`m${i}`] });
  const f = builderFile(t, GOOD, GOOD_BLOCKS);
  const check = k.cli(['--builder', f, '--check']);
  assert.equal(check.status, 0, check.stdout);
  const { r, text } = ownPage(t, k, f);
  const lines = findingLines(r.stdout);
  assert.deepEqual(findingLines(check.stdout), lines, 'the check and the page run print the same findings');
  const has = re => lines.filter(l => re.test(l));
  assert.equal(has(/presets\/a-bad-tiers\.json: left out: .*1 to 6 tiers/).length, 1);
  assert.equal(has(/^FINDING presets: a file in your presets folder has a name the page can't carry; it is left out$/).length, 1);
  assert.equal(has(/presets\/a-empty\.json: left out: it gives no part, models, agent files or skill sources$/).length, 1);
  assert.equal(has(/presets\/a-badkey\.json: left out: agentFiles entry 1 is not an agent name/).length, 1);
  assert.equal(has(/presets\/a-proto\.json: left out: .*__proto__/).length, 1);
  assert.equal(has(/presets\/a-pair\.json: workflow: offer test-qa-pair: half of behaviour-lens and integrity-lens on its own/).length, 1);
  assert.equal(has(/^FINDING presets: 11 more files in your presets folder are past the limit of 16 and are left out$/).length, 1);
  assert.equal(has(/presets\/a-url\.json: left out: /).length, 1);
  assert.equal(has(/presets\/a-null-tier\.json: left out: /).length, 1);
  assert.equal(lines.length, 9, lines.join('\n'));
  for (const bad of ['zebra', 'quokka', 'walrus', 'mango', 'a b']) assert.ok(!r.stdout.includes(bad) && !check.stdout.includes(bad), bad);
  const ids = pageLogic(text).PACT.ownPresets.map(p => p.id);
  assert.deepEqual(ids, ['a-pair', ...Array.from({ length: 9 }, (_, i) => `g${String(i + 1).padStart(2, '0')}`)]);
});

// #283 C7
test('C7: a presets folder that is a file stops nothing: one finding, no presets', t => {
  const k = kitHome(t);
  mkdirSync(join(k.home, 'pact'), { recursive: true });
  writeFileSync(k.presets, 'not a folder');
  const f = builderFile(t, GOOD, GOOD_BLOCKS);
  const one = ['FINDING presets: your presets folder could not be read; no presets were listed'];
  const check = k.cli(['--builder', f, '--check']);
  assert.equal(check.status, 0, check.stdout);
  assert.deepEqual(findingLines(check.stdout), one);
  const { r, text } = ownPage(t, k, f);
  assert.deepEqual(findingLines(r.stdout), one);
  assert.deepEqual(pageLogic(text).PACT.ownPresets, []);
  // A junction or link at the folder is not followed either.
  rmSync(k.presets);
  const elsewhere = tempDir(t, 'pact-own-elsewhere-');
  writeFileSync(join(elsewhere, 'x.json'), JSON.stringify({ schema: 1, models: ['Opus'] }));
  symlinkSync(elsewhere, k.presets, 'junction');
  const linked = k.cli(['--builder', f, '--check']);
  assert.equal(linked.status, 0, linked.stdout);
  assert.deepEqual(findingLines(linked.stdout), one);
  assert.ok(!/^LISTED/m.test(linked.stdout));
});

// #283 C3
test('C3: a personal level-3-full lands nowhere and shadows nothing', t => {
  const k = kitHome(t);
  mkdirSync(k.presets, { recursive: true });
  writeFileSync(join(k.presets, 'level-3-full.json'), JSON.stringify({ schema: 1, title: 'Fake', tiers: ONE_TIER }));
  const { text } = ownPage(t, k, builderFile(t, GOOD, GOOD_BLOCKS));
  const Lp = pageLogic(text);
  const shipped = shippedPresets(REPO, pactData(REPO)).find(p => p.id === 'level-3-full');
  assert.deepEqual(Lp.PACT.presets.find(p => p.id === 'level-3-full'), shipped);
  assert.equal(Lp.PACT.ownPresets.length, 1);
  assert.deepEqual(Lp.startState().parts.tiers, shipped.parts.tiers);
});

/** Run `expr` inside the page's script, so identity of its data holds. */
function inPage(page, expr) {
  const script = [...page.matchAll(SCRIPT_RE)][0][2];
  return JSON.parse(JSON.stringify(vm.runInContext(`${script}\n;(${expr})`, vm.createContext({}))));
}

// #283 C4
test('C4: only a shipped preset\'s agent rows start ticked; the head says why for the others', () => {
  const agent = JSON.stringify({ 'a-lens': '---\nname: a-lens\n---\n' });
  const got = inPage(PAGE, `(() => {
    PACT.presets[0].agentFiles = ${agent};
    PACT.ownPresets.push({ id: PACT.presets[0].id, title: 'Mine', parts: { tiers: PACT.presets[0].parts.tiers }, models: ['Opus'], agentFiles: ${agent} });
    const shared = presetFromText(${JSON.stringify(JSON.stringify({ schema: 1, tiers: ONE_TIER, models: ['Opus'], agentFiles: JSON.parse(agent) }))}).preset;
    return { shipped: startPicks(PACT.presets[0]), own: startPicks(PACT.ownPresets[0]), shared: startPicks(shared), ownNote: takeNote(PACT.ownPresets[0]), sharedNote: takeNote(shared), shippedNote: takeNote(PACT.presets[0]) };
  })()`);
  assert.ok(got.shipped.includes('agent:a-lens'));
  assert.ok(!got.own.some(k => k.startsWith('agent:')) && got.own.includes('part:tiers') && got.own.includes('models'));
  assert.ok(!got.shared.some(k => k.startsWith('agent:')) && got.shared.includes('part:tiers') && got.shared.includes('models'));
  assert.match(got.ownNote, new RegExp(`presets/${L.PACT.presets[0].id}\\.json in your presets folder`));
  assert.match(got.sharedNote, /A shared file's agent files start unticked/);
  assert.equal(got.shippedNote, '');
});

// #283 C5
test('C5: a clone reads no presets folder, and the committed page carries an empty ownPresets', () => {
  assert.equal(personalPresetsDir(REPO), null);
  assert.deepEqual(personalPresets(REPO, pactData(REPO)), { presets: [], findings: [] });
  assert.deepEqual(L.PACT.ownPresets, []);
});

test('a builder file whose JSON escapes decode to an invisible, direction-changing or control character is refused (#327)', t => {
  const dir = tempDir(t);
  const load = (name, json) => {
    const f = join(dir, name);
    writeFileSync(f, json);
    return checkBuilder(REPO, f);
  };
  assert.deepEqual(load('good.json', '{"schema":1,"title":"plain title"}').refusals, [], 'a clean file still loads');
  assert.deepEqual(load('tab-lf.json', '{"schema":1,"agentFiles":{"mine":"---\\nname: mine\\n---\\na\\tb\\n"}}').refusals, [], 'a tab and a line feed still pass');
  for (const [name, json] of [
    ['title-rlo.json', '{"schema":1,"title":"a\\u202eb"}'],
    ['key-zwsp.json', '{"schema":1,"agentFiles":{"zebra\\u200bquokka":"x"}}'],
    ['title-cr.json', '{"schema":1,"title":"a\\rb"}'],
    ['title-tag.json', '{"schema":1,"title":"a\\udb40\\udc01b"}'],
    ['lone-surrogate.json', '{"schema":1,"title":"a\\ud800b"}'],
    ['nested-control.json', '{"schema":1,"yours":{"skills":[{"name":"a","what":"x\\u0007y"}]}}'],
  ]) {
    const r = load(name, json);
    assert.equal(r.builder, null, name);
    assert.deepEqual(r.refusals, ['the builder file holds an escaped invisible, direction-changing or control character in a key or string'], name);
  }
});

test('a shared file opened on the page whose JSON escapes decode to an invisible, direction-changing or control character is refused (#327)', () => {
  const msg = 'it holds an escaped invisible, direction-changing or control character in a key or string';
  for (const json of [
    '{"schema":1,"title":"a\\u202eb","models":["Opus"]}',
    '{"schema":1,"models":["Op\\u200bus"]}',
    '{"schema":1,"zebra\\u200b":1}',
    '{"schema":1,"title":"a\\udb40\\udc01b","models":["Opus"]}',
    '{"schema":1,"title":"a\\ud800b","models":["Opus"]}',
    '{"schema":1,"agentFiles":{"mine":"---\\nname: mine\\n---\\nx\\u0007y\\n"}}',
  ]) assert.equal(L.presetFromText(json).refuse, msg, json);
  assert.equal(L.presetFromText('{"schema":1,"agentFiles":{"mine":"---\\nname: mine\\n---\\na\\tb\\n"}}').refuse, undefined, 'a tab and a line feed still pass');
});
