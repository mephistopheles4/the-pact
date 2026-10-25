// The Node install's source rules (#153, S3): the bootstrap's line budget, its
// imports and its syntax; the git calls it may make; and that the runner and
// every module it loads import only node: built-ins and files in the stage.
// These read the files' text; nothing here installs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { test } from 'node:test';
import { relativeImports } from './run.mjs';
import { GATE, tokens } from './text.mjs';

const BOOT = 'install.mjs';
const text = f => readFileSync(join(GATE, f), 'utf8');
/** Every module specifier in a source: a static import or export-from statement, or a dynamic import of a literal. */
const specifiers = src =>
  [/^\s*import\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm, /^\s*export\s+[^'"=;]*?\sfrom\s+['"]([^'"]+)['"]/gm, /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g].flatMap(re => [...src.matchAll(re)].map(m => m[1]));

/** Where the bootstrap breaks a source rule, as plain sentences; empty when it keeps them all. */
function bootProblems(src) {
  const out = [];
  if (src.split('\n').length - (src.endsWith('\n') ? 1 : 0) > 250) out.push('over its 250-line budget');
  for (const s of specifiers(src)) if (!s.startsWith('node:')) out.push(`imports ${s}`);
  if (/\bimport\s*\(|\brequire\s*\(|createRequire/.test(src)) out.push('loads code at run time');
  // Syntax newer than Node 16 would stop an old Node before the floor message.
  for (const [what, re] of [
    ['a logical assignment', /\?\?=|\|\|=|&&=/],
    ['a class static block', /\bstatic\s*\{/],
    ['a private name', /(^|[^\w$'"`/])#[A-Za-z_$]/m],
    ['a regular expression v flag', /\/[dgimsuy]*v[dgimsuy]*[,;)\s]/],
    ['top-level await', /^await\b/m],
    ['an array at() call', /\.at\(/],
    ['Object.hasOwn', /Object\.hasOwn\b/],
  ]) if (re.test(src.replace(/^#!.*\n/, ''))) out.push(`holds ${what}`);
  // Every git call is one literal array (an index such as treeLine[1] inside
  // it is fine), closed by ] and then ) or ,: a call extended past its bracket,
  // or given a variable, is one this check can't read.
  const gitCalls = [...src.matchAll(/\bgit\(\[((?:[^[\]]|\[[^[\]]*\])*)\][),]/g)].map(m => m[1]);
  if (gitCalls.length !== [...src.matchAll(/\bgit\s*\(/g)].length) out.push('runs git through a call the check cannot read');
  // And no other way to git (#407): the helper is defined once and only ever
  // called on a literal array, the git path is found once and used only by the
  // helper, and commit, which rev-list must list from, is declared once.
  const tok = tokens(src);
  const word = (i, v) => tok[i] && tok[i].t === 'word' && tok[i].v === v;
  const punct = (i, v) => tok[i] && tok[i].t === 'p' && tok[i].v === v;
  const at = v => tok.flatMap((x, i) => (word(i, v) ? [i] : []));
  const declared = v => at(v).filter(i => word(i - 1, 'const') || word(i - 1, 'let') || word(i - 1, 'var') || word(i - 1, 'function') || (punct(i + 1, '=') && punct(i + 2, '>'))).length;
  if (declared('git') !== 1 || at('git').some(i => !word(i - 1, 'const') && !(punct(i + 1, '(') && punct(i + 2, '[')))) out.push('runs git through a call the check cannot read');
  if (declared('gitPath') !== 1 || at('gitPath').length !== 3 || at('findGit').length !== 2) out.push('runs git outside its helper');
  if (declared('commit') !== 1) out.push('declares commit more than once');
  for (const c of gitCalls) {
    const sub = /^'([a-z-]+)'/.exec(c.trim());
    // rev-list only from the commit the bootstrap checked (#407): the list of its history.
    if (sub && sub[1] === 'rev-list' ? c.trim() !== "'rev-list', commit" : !sub || !['rev-parse', 'config', 'cat-file', 'ls-tree', 'diff-index', 'ls-files'].includes(sub[1])) out.push(`runs git ${sub ? sub[1] : c.trim()}`);
  }
  const configCalls = gitCalls.filter(c => c.trim().startsWith("'config'")).map(c => c.trim());
  if (JSON.stringify(configCalls) !== JSON.stringify(["'config', '--get', 'extensions.partialclone'", "'config', '--name-only', '--get-regexp', '^remote\\\\..*\\\\.promisor$'"])) out.push('reads git config beyond its two keys');
  if (!/\['--no-replace-objects', '-c', 'core\.fsmonitor=false', '-C', repo\]/.test(src)) out.push('runs git without --no-replace-objects and core.fsmonitor=false');
  if (!/const KEEP = \['PATH', 'SystemRoot', 'windir', 'HOME', 'USERPROFILE', 'TEMP', 'TMP', 'TMPDIR'\];/.test(src)) out.push("changes the environment allow-list");
  if (!/GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1', GIT_CONFIG_NOSYSTEM: '1', GIT_OPTIONAL_LOCKS: '0'/.test(src)) out.push("changes git's fixed variables");
  if (!/const LIMIT_MS = 300000;/.test(src)) out.push('changes the time limit');
  if (/\.stderr\.on\(/.test(src)) out.push("reads the runner's stderr");
  return out;
}

test('the bootstrap keeps its source rules: budget, node: imports only, Node 16 syntax, its git calls, its allow-list and its limit', () => {
  assert.deepEqual(bootProblems(text(BOOT)), []);
});

for (const [label, plant, says] of [
  ['passes its line budget', src => `${src}${'\n'.repeat(20)}`, 'over its 250-line budget'],
  ['imports a package', src => src.replace("import { tmpdir } from 'node:os';", "import { tmpdir } from 'os-helper';"), 'imports os-helper'],
  ['imports a gate file', src => src.replace("import { tmpdir } from 'node:os';", "import { tmpdir } from './paths.mjs';"), 'imports ./paths.mjs'],
  ['loads code at run time', src => src.replace('function main() {', "function main() {\n  import('./x.mjs');"), 'loads code at run time'],
  ['uses a logical assignment', src => src.replace('let work = null;', 'let work = null;\nwork ??= null;'), 'holds a logical assignment'],
  ['uses .at()', src => src.replace('let work = null;', 'let work = [].at(-1);'), 'holds an array at() call'],
  ['runs git status', src => src.replace("git(['rev-parse', 'HEAD'])", "git(['status', '--porcelain'])"), 'runs git status'],
  ['lists every ref\'s history', src => src.replace("git(['rev-list', commit])", "git(['rev-list', '--all'])"), 'runs git rev-list'],
  ['lists the remotes\' history too', src => src.replace("git(['rev-list', commit])", "git(['rev-list', commit, '--remotes'])"), 'runs git rev-list'],
  ['lists from HEAD, not the commit it checked', src => src.replace("git(['rev-list', commit])", "git(['rev-list', 'HEAD'])"), 'runs git rev-list'],
  ['runs git log', src => src.replace("git(['rev-list', commit])", "git(['log', commit])"), 'runs git log'],
  ['extends a git call past its bracket', src => src.replace("git(['rev-list', commit])", "git(['rev-list', commit].concat('--all'))"), 'runs git through a call the check cannot read'],
  ['runs git with a variable', src => src.replace("git(['rev-list', commit])", 'git(listArgs)'), 'runs git through a call the check cannot read'],
  ['puts a space before a git call\'s bracket', src => src.replace("git(['rev-list', commit])", "git (['rev-list', '--all'])"), 'runs git through a call the check cannot read'],
  ['calls git under another name', src => src.replace("git(['rev-list', commit])", "(0, git)(['rev-list', '--all'])"), 'runs git through a call the check cannot read'],
  ['calls git through call()', src => src.replace("git(['rev-list', commit])", "git.call(null, ['rev-list', '--all'])"), 'runs git through a call the check cannot read'],
  ['runs git without its helper', src => src.replace("git(['rev-list', commit]).stdout", "spawnSync(gitPath, ['rev-list', '--all']).stdout"), 'runs git outside its helper'],
  ['declares a second commit', src => src.replace("writeFileSync(join(work, 'reachable')", "{ const commit = '--all'; }\n  writeFileSync(join(work, 'reachable')"), 'declares commit more than once'],
  ['shadows commit with an arrow\'s parameter', src => src.replace("writeFileSync(join(work, 'reachable'), git(['rev-list', commit]).stdout, { flag: 'wx' });", "(commit => writeFileSync(join(work, 'reachable'), git(['rev-list', commit]).stdout, { flag: 'wx' }))('--all');"), 'declares commit more than once'],
  ['spawns findGit() itself', src => src.replace("git(['rev-list', commit]).stdout", "spawnSync(findGit(), ['rev-list', '--all']).stdout"), 'runs git outside its helper'],
  ['reads a remote address', src => src.replace("'extensions.partialclone']", "'remote.origin.url']"), 'reads git config beyond its two keys'],
  ['drops core.fsmonitor=false', src => src.replace("'-c', 'core.fsmonitor=false', ", ''), 'runs git without --no-replace-objects and core.fsmonitor=false'],
  ['widens the allow-list', src => src.replace("'TMPDIR'];", "'TMPDIR', 'NODE_PATH'];"), 'changes the environment allow-list'],
  ['reads the runner\'s stderr', src => src.replace('child.stderr.resume();', "child.stderr.on('data', d => say(String(d)));"), "reads the runner's stderr"],
  ['changes git\'s fixed variables', src => src.replace("GIT_OPTIONAL_LOCKS: '0'", "GIT_OPTIONAL_LOCKS: '1'"), "changes git's fixed variables"],
  ['uses a class static block', src => src.replace('let work = null;', 'let work = null;\nclass Z { static { } }'), 'holds a class static block'],
  ['uses a private name', src => src.replace('let work = null;', 'let work = null;\nclass Y { #p = 1; }'), 'holds a private name'],
  ['uses a regular expression v flag', src => src.replace('let work = null;', 'let work = null;\nconst R = /a/v;'), 'holds a regular expression v flag'],
  ['uses top-level await', src => `${src}\nawait null;\n`, 'holds top-level await'],
  ['uses Object.hasOwn', src => src.replace('let work = null;', "let work = null;\nObject.hasOwn({}, 'x');"), 'holds Object.hasOwn'],
]) {
  test(`bad case: the bootstrap source check catches a bootstrap that ${label}`, () => {
    const planted = plant(text(BOOT));
    assert.notEqual(planted, text(BOOT), 'the plant changed nothing');
    assert.ok(bootProblems(planted).includes(says), bootProblems(planted).join('\n'));
  });
}

/** Every gate module the runner loads, through relative imports (dynamic ones included), with each one's specifiers. */
function runnerModules() {
  const seen = new Map();
  const queue = ['gate/install-run.mjs'];
  while (queue.length) {
    const rel = queue.shift();
    if (seen.has(rel)) continue;
    const src = readFileSync(join(GATE, '..', ...rel.split('/')), 'utf8');
    const dynamic = [...src.matchAll(/import\(`\.\/\$\{file\}`\)/g)].length ? ['./render-core.mjs', './seam-a-core.mjs', './review-core.mjs', './project-core.mjs'] : [];
    const specs = [...specifiers(src), ...dynamic];
    seen.set(rel, specs);
    for (const s of [...relativeImports(src).filter(x => !x.includes('${')), ...dynamic]) queue.push(posix.normalize(posix.join(posix.dirname(rel), s)));
  }
  return seen;
}

test('the runner and every module it loads import only node: built-ins and files in the stage, never a package', () => {
  const mods = runnerModules();
  for (const f of ['gate/install-core.mjs', 'gate/install-io.mjs', 'gate/render-core.mjs', 'gate/seam-a-core.mjs', 'gate/review-core.mjs', 'gate/project-core.mjs']) assert.ok(mods.has(f), f);
  for (const [rel, specs] of mods) {
    assert.ok(!rel.startsWith('gate/tests/'), rel);
    for (const s of specs) assert.ok(s.startsWith('node:') || s.startsWith('./') || s.startsWith('../'), `${rel} imports ${s}`);
    for (const s of specs.filter(x => x.startsWith('.'))) assert.ok(posix.normalize(posix.join(posix.dirname(rel), s)).startsWith('gate/'), `${rel} imports ${s}, outside the stage's gate folder`);
  }
});

test('the runner refuses any preload and prints no error text', () => {
  const src = text('install-run.mjs');
  assert.match(src, /if \(process\.env\.NODE_OPTIONS !== undefined \|\| process\.execArgv\.length\) core\.stops\.preload\(\);/);
  assert.ok(!/\be\.message\b|\berr\.message\b|\be\.stack\b|String\(e\)|\$\{e\}/.test(src), 'no thrown error text reaches the output');
  assert.ok(!/\bconsole\./.test(src));
  assert.match(src, /say\('CHECKS DONE'\);\n {2}writing = true;/, 'CHECKS DONE comes right before the first write');
});
