// The gate's test runner (#140): one fail-closed command per tier.
//
//   node gate/tests/run.mjs <changed|fast|full> [--base <ref>] [--reporter <spec|tap|dot|junit>] [--record <file>] [--list]
//
// full is every top-level test file in this folder. The install tier is every
// test file that reaches install-harness.mjs through its imports, or names the
// install script in a string literal; fast is full minus the install tier.
// changed is the everyday run (#145): the tests the changed paths can reach,
// by the mapping rules in pick, with the reason for each file. Its changed set
// is what differs from the merge-base of HEAD and --base (default main), plus
// untracked files git doesn't ignore. With no --base, the base is the branch
// refs/heads/main, never a tag or other ref of that name.
// The runner starts this same Node (process.execPath) with --test, the cap of
// four files at once, and an explicit file list, with NODE_OPTIONS and
// NODE_TEST_CONTEXT cleared. It never reports a pass it didn't earn: an empty
// pick, a refused name or a usage error exits 2 without starting node, and a
// killed node, a node that didn't start or a non-zero status exits 1. Its own
// lines go to stderr, so node's reporter output on stdout stays clean; the
// last line names the tier, the file count and the result. --record writes a
// scrubbed copy of everything printed to a file outside the repo, and exits 3
// if a local path, the user name or the host name survives the scrub. --list
// prints the pick and runs nothing. Start it with NODE_OPTIONS cleared, as
// AGENTS.md shows: clearing it for the child can't reach this process.
// Only changed reads git: fast and full read the file system alone. The base
// is resolved to a commit before any other git call. The install skips this
// folder before any check, so this file is never staged or installed. On the
// probe floor by name (AGENTS.md).
import { spawn, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir, hostname, tmpdir, userInfo } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { posix } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { COPY_DIRS, COPY_FILES } from './copy-list.mjs';

export const TIERS = Object.freeze(['changed', 'fast', 'full']);
export const REPORTERS = Object.freeze(['spec', 'tap', 'dot', 'junit']);
export const CAP = 4;
export const TEST_SUFFIX = '.test.mjs';
/** A top-level test-file name the runner accepts; anything else refuses the run. */
export const PLAIN_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.test\.mjs$/;
export const HARNESS = 'install-harness.mjs';
// The PowerShell installer's file name. The installer left at the cutover (#166),
// but a test that names it, such as one of a rollback to an older commit, is
// still put in the install tier. The Node install runs through the harness.
export const INSTALL_SCRIPT = 'install.ps1';
/** The install smoke set: the install's happy path, run for every payload change. */
export const SMOKE = 'install-smoke.test.mjs';
export const DEFAULT_BASE = 'main';
/** The gate's code is this folder outside the tests folder, and the install script. */
const GATE_DIR = 'gate';
const TESTS_DIR = 'gate/tests';
/**
 * S6's rule (#145): the fast tier was re-timed quiet at 50.1 s, within 60 s,
 * so changed runs the fast tier beside its picks.
 */
export const CHANGED_WITH_FAST = true;
/** More changed paths than this select every test, with no per-path mapping. */
export const MAX_CHANGED = 2000;
const MODULE_RE = /\.(?:mjs|cjs|js)$/;
/** A path as the runner prints it: any character outside a plain set replaced. */
export const SHOWN = s => s.replace(/[^A-Za-z0-9._/ -]/g, '?');

// ------------------------------------------------------------ pick: pure

const IMPORT_RES = [
  /\bfrom\s*(['"`])([^'"`\n]+)\1/g,
  /\bimport\s*(['"`])([^'"`\n]+)\1/g,
  /\bimport\s*\(\s*(['"`])([^'"`\n]+)\1\s*\)/g,
  /\brequire\s*\(\s*(['"`])([^'"`\n]+)\1\s*\)/g,
];

/** The relative import specifiers in a module's source, comments included (a superset is the safe side). */
export function relativeImports(src) {
  const out = [];
  for (const re of IMPORT_RES) for (const m of src.matchAll(re)) if (m[2].startsWith('./') || m[2].startsWith('../')) out.push(m[2]);
  return out;
}

function skipBalanced(src, i) {
  // i is just past "${"; return the index just past the matching "}".
  let depth = 1;
  while (i < src.length && depth > 0) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      i += 1;
      while (i < src.length && src[i] !== c) i += src[i] === '\\' ? 2 : 1;
    } else if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    i += 1;
  }
  return i;
}

const REGEX_AFTER = new Set([...'(,=:[!&|?{};+-*%<>~^']);
const REGEX_AFTER_WORDS = new Set(['return', 'typeof', 'case', 'of', 'in', 'void', 'delete', 'throw', 'yield', 'await']);

/** The string literals in a module's source, in order; a template literal gives its static pieces. */
export function stringLiterals(src) {
  const out = [];
  let i = 0;
  let prev = '';
  let word = '';
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      const j = src.indexOf('\n', i);
      i = j < 0 ? n : j;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const j = src.indexOf('*/', i + 2);
      i = j < 0 ? n : j + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      let s = '';
      i += 1;
      while (i < n && src[i] !== c && src[i] !== '\n') {
        if (src[i] === '\\') {
          s += src[i + 1] ?? '';
          i += 2;
        } else s += src[i++];
      }
      i += 1;
      out.push(s);
      prev = '"';
      word = '';
      continue;
    }
    if (c === '`') {
      let s = '';
      i += 1;
      while (i < n && src[i] !== '`') {
        if (src[i] === '\\') {
          s += src[i + 1] ?? '';
          i += 2;
        } else if (src[i] === '$' && src[i + 1] === '{') {
          out.push(s);
          s = '';
          i = skipBalanced(src, i + 2);
        } else s += src[i++];
      }
      i += 1;
      out.push(s);
      prev = '"';
      word = '';
      continue;
    }
    if (c === '/' && (prev === '' || REGEX_AFTER.has(prev) || REGEX_AFTER_WORDS.has(word))) {
      // A regex literal: skip it, minding classes and escapes.
      i += 1;
      let inClass = false;
      while (i < n && src[i] !== '\n') {
        if (src[i] === '\\') i += 2;
        else if (src[i] === '[') (inClass = true), (i += 1);
        else if (src[i] === ']') (inClass = false), (i += 1);
        else if (src[i] === '/' && !inClass) break;
        else i += 1;
      }
      i += 1;
      prev = ')';
      word = '';
      continue;
    }
    if (/\s/.test(c)) {
      i += 1;
      continue;
    }
    if (/[A-Za-z0-9_$]/.test(c)) word = /[A-Za-z0-9_$]/.test(prev) ? word + c : c;
    else word = '';
    prev = c;
    i += 1;
  }
  return out;
}

/** Whether a module's own source names the install script: written out, or in consecutive string literals. */
export function namesInstallScript(src) {
  const name = INSTALL_SCRIPT.toLowerCase();
  if (src.toLowerCase().includes(name)) return true;
  const lits = stringLiterals(src).map(s => s.toLowerCase());
  return ['', '/', '\\', '.'].some(j => lits.join(j).includes(name));
}

/** The chain of modules from `from` to the harness, through relative imports, or null. */
function harnessChain(from, sources) {
  const seen = new Set([from]);
  const queue = [[from]];
  while (queue.length) {
    const chain = queue.shift();
    const at = chain[chain.length - 1];
    for (const spec of relativeImports(sources.get(at) ?? '')) {
      const to = posix.normalize(posix.join(posix.dirname(at), spec));
      if (to.startsWith('../') || seen.has(to) || !sources.has(to)) continue;
      if (to === HARNESS) return [...chain, to];
      seen.add(to);
      queue.push([...chain, to]);
    }
  }
  return null;
}

/** Every module `from` reaches through relative imports inside the tests folder, itself excluded. */
function reach(from, sources) {
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) {
    const at = queue.shift();
    for (const spec of relativeImports(sources.get(at) ?? '')) {
      const to = posix.normalize(posix.join(posix.dirname(at), spec));
      if (to.startsWith('../') || seen.has(to) || !sources.has(to)) continue;
      seen.add(to);
      queue.push(to);
    }
  }
  seen.delete(from);
  return seen;
}

/**
 * The text a module can name a path in, folded to lower case with forward
 * slashes: its source as written, and its string literals run together, with
 * and without a slash between them (a superset is the safe side).
 */
function namingText(src) {
  const lits = stringLiterals(src);
  return [src, lits.join('/'), lits.join('')].map(s => s.replace(/\\+/g, '/').replace(/\/{2,}/g, '/').toLowerCase()).join('\n');
}

/**
 * The forms in which a test can name a repo path: its file name, and every run
 * of two or more consecutive segments, which covers the path written out from
 * any folder and each parent folder of at least two segments.
 */
export function pathNames(path) {
  const segs = path.toLowerCase().split('/').filter(Boolean);
  const out = new Set(segs.length ? [segs[segs.length - 1]] : []);
  for (let i = 0; i < segs.length; i += 1) for (let j = i + 2; j <= segs.length; j += 1) out.add(segs.slice(i, j).join('/'));
  return [...out];
}

const under = (path, dir) => path === dir || path.startsWith(`${dir}/`);

/**
 * The files a tier runs, each with its reason. `entries` are the top-level
 * entries whose names end in the test suffix, as { name, file } (file: a
 * regular file). `sources` maps each module under the tests folder, by its
 * posix path relative to that folder, to its text. For changed, `copyList` is
 * the install's copy list as { dirs, files }, `changed` the changed paths,
 * repo-relative with forward slashes, and `withFast` whether the fast tier
 * runs beside the picks (S6).
 * Returns { files: [{ file, reason }], refused: [{ name, why }], unmapped: [path] }.
 */
export function pick({ tier, entries, sources, copyList, changed = [], withFast = CHANGED_WITH_FAST }) {
  if (!TIERS.includes(tier)) throw new Error(`unknown tier: ${tier}`);
  const refused = [];
  const tests = [];
  for (const e of [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    if (!PLAIN_NAME.test(e.name)) refused.push({ name: e.name, why: 'a name outside the plain set' });
    else if (!e.file) refused.push({ name: e.name, why: 'not a regular file' });
    else tests.push(e.name);
  }
  const install = new Map();
  for (const name of tests) {
    const chain = harnessChain(name, sources);
    install.set(name, chain ? `install tier: imports ${chain.slice(1).map(SHOWN).join(' -> ')}` : namesInstallScript(sources.get(name) ?? '') ? `install tier: names ${INSTALL_SCRIPT}` : null);
  }
  if (tier !== 'changed') {
    const files = [];
    for (const name of tests) {
      if (tier === 'full') files.push({ file: name, reason: install.get(name) ?? 'fast tier' });
      else if (!install.get(name)) files.push({ file: name, reason: 'fast tier: does not run the install' });
    }
    return { files, refused, unmapped: [] };
  }

  if (!copyList) throw new Error('changed needs the copy list');
  const installScript = copyList.files.find(f => posix.basename(f) === INSTALL_SCRIPT);
  const payloadDirs = copyList.dirs.filter(d => d !== GATE_DIR);
  const payloadFiles = copyList.files.filter(f => f !== installScript);
  const isPayload = p => payloadDirs.some(d => under(p, d)) || payloadFiles.includes(p);
  const reached = new Map(tests.map(t => [t, reach(t, sources)]));
  const texts = new Map([...sources].map(([k, v]) => [k, namingText(v)]));

  const why = new Map();
  const add = (file, reason) => {
    if (!why.has(file)) why.set(file, []);
    if (!why.get(file).includes(reason)) why.get(file).push(reason);
  };
  const all = reason => tests.forEach(t => add(t, reason));
  const unmapped = [];
  const paths = [...new Set(changed)].sort();
  // Past the bound, mapping each path costs more than it saves: run everything.
  if (paths.length > MAX_CHANGED) all(`over ${MAX_CHANGED} changed paths (${paths.length})`);
  for (const path of paths.length > MAX_CHANGED ? [] : paths) {
    const shown = SHOWN(path);
    // Rule 3: gate code selects the full tier.
    if ((under(path, GATE_DIR) && !under(path, TESTS_DIR)) || path === installScript) {
      all(`gate code changed: ${shown}`);
      continue;
    }
    let mapped = false;
    const rel = under(path, TESTS_DIR) ? path.slice(TESTS_DIR.length + 1) : null;
    // Rule 1: a changed test file runs itself.
    if (rel !== null && tests.includes(rel)) {
      add(rel, 'changed');
      mapped = true;
    }
    // Rule 2: a changed module in the tests folder runs every test that imports it, through any chain.
    if (rel !== null && sources.has(rel)) {
      for (const t of tests) {
        if (t !== rel && reached.get(t).has(rel)) {
          add(t, `imports changed ${shown}`);
          mapped = true;
        }
      }
    }
    // Rules 4 and 5: every test that names the path, in its own text or a
    // helper's. A test file or module that is in the tests folder now counts
    // as named only by a form that holds its file name, so a test that loads
    // it by path is picked, and one that names only the tests folder is not.
    const file = posix.basename(path).toLowerCase();
    const names = rel !== null && (tests.includes(rel) || sources.has(rel)) ? pathNames(path).filter(n => n === file || n.endsWith(`/${file}`)) : pathNames(path);
    for (const t of tests) {
      // A test that imports the path is already picked by rule 2.
      if (t === rel || reached.get(t).has(rel)) continue;
      const via = [t, ...[...reached.get(t)].sort()].find(m => names.some(n => texts.get(m)?.includes(n)));
      if (via !== undefined) {
        add(t, via === t ? `names ${shown}` : `names ${shown} in ${SHOWN(via)}`);
        mapped = true;
      }
    }
    // Rule 4: a payload path also runs the install smoke set.
    if (isPayload(path)) {
      if (!tests.includes(SMOKE)) throw new Error(`the install smoke set, ${SMOKE}, is missing`);
      add(SMOKE, `install smoke set: payload ${shown}`);
    }
    // Rule 6: a path no rule maps runs the fast tier (the smoke set is already in for a payload path).
    if (!mapped) {
      unmapped.push(path);
      for (const t of tests) if (!install.get(t)) add(t, 'fast tier: a changed path is unmapped');
    }
  }
  if (withFast) for (const t of tests) if (!install.get(t)) add(t, 'fast tier');
  const files = tests.filter(t => why.has(t)).map(t => ({ file: t, reason: why.get(t).join('; ') }));
  return { files, refused, unmapped };
}

// ------------------------------------------------------------ record-mode scrub: pure

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function splitSegs(p) {
  return p.split(/[\\/]+/).filter(s => s !== '');
}

/**
 * The text forms a local path can take in output: as given, with either
 * slash, with doubled backslashes, and as a file URL. `aliases` are pairs of
 * [shortForm, longForm] (8.3 names) used to derive short forms of each path.
 */
export function pathForms(p, aliases = [], win = process.platform === 'win32') {
  const bases = new Set([p]);
  for (const [short, long] of aliases) {
    for (const [from, to] of [
      [long, short],
      [short, long],
    ]) {
      const fs = splitSegs(from);
      const ts = splitSegs(to);
      if (fs.length !== ts.length) continue;
      const ps = splitSegs(p);
      for (let k = fs.length; k >= 1; k -= 1) {
        const head = fs.slice(0, k);
        const same = win ? head.every((s, i) => ps[i]?.toLowerCase() === s.toLowerCase()) : head.every((s, i) => ps[i] === s);
        if (same && ps.length >= k) {
          bases.add([...ts.slice(0, k), ...ps.slice(k)].join(win ? '\\' : '/'));
          break;
        }
      }
    }
  }
  const forms = new Set();
  for (const b of bases) {
    const back = b.replace(/\//g, '\\');
    const fwd = b.replace(/\\/g, '/');
    forms.add(b);
    forms.add(back);
    forms.add(fwd);
    forms.add(back.replace(/\\/g, '\\\\'));
    try {
      // The path part of its file URL, so "file://" stays and the placeholder follows it.
      const href = pathToFileURL(b).href.replace(win ? /^file:\/\/\// : /^file:\/\//, '');
      forms.add(href);
      forms.add(decodeURI(href));
    } catch {
      // not a path a URL can hold; the plain forms stand
    }
  }
  return [...forms].filter(f => f.length >= 3);
}

/** A whole-word, case-folded match for a name such as the user or host name, or null for one too short to match safely. */
function wordRe(word, flags) {
  return word && word.length >= 2 ? new RegExp(`(?<![A-Za-z0-9])${escapeRe(word)}(?![A-Za-z0-9])`, flags) : null;
}

/** A scrub function for { repo, home, tmp, user, host } with their placeholders, longest form first. */
export function makeScrub({ repo, home, tmp, user, host, aliases = [], win = process.platform === 'win32' }) {
  const pairs = [];
  for (const [p, ph] of [
    [repo, '<repo>'],
    [tmp, '<tmp>'],
    [home, '<home>'],
  ]) {
    if (p) for (const f of pathForms(p, aliases, win)) pairs.push([f, ph]);
  }
  pairs.sort((a, b) => b[0].length - a[0].length);
  const flags = win ? 'gi' : 'g';
  const res = pairs.map(([f, ph]) => [new RegExp(escapeRe(f), flags), ph]);
  const names = [
    [wordRe(host, 'gi'), '<host>'],
    [wordRe(user, flags), '<user>'],
  ].filter(([re]) => re);
  return text => {
    let out = text;
    for (const [re, ph] of res) out = out.replace(re, ph);
    for (const [re, ph] of names) out = out.replace(re, ph);
    return out;
  };
}

const LEAK_RES = [
  // A drive-letter path, not the scheme of a URL.
  /(?<![A-Za-z0-9+.-])[A-Za-z]:[\\/]/,
  // A home-prefix path.
  /(?<![A-Za-z0-9.-])\/(?:home|Users)\/[^/\s<]/,
  /\\Users\\[^\\\s<]/i,
  // A drive as a leading folder (Git Bash, MSYS), or under /mnt (WSL).
  /(?<![A-Za-z0-9.-])\/[A-Za-z]\/(?:Users|home)\//i,
  /(?<![A-Za-z0-9.-])\/mnt\/[A-Za-z]\//,
  // A network share: \\host\share.
  /(?:^|[\s'"=(\[])\\\\[A-Za-z0-9._$-]+\\[A-Za-z0-9._$-]+/,
];

/**
 * The 1-based numbers of the lines that still hold a local path, or one of
 * `words` (such as the host or user name) as a whole word, case-folded.
 */
export function leakedLines(text, words = []) {
  const wordRes = words.map(w => wordRe(w, 'i')).filter(Boolean);
  const out = [];
  text.split('\n').forEach((l, i) => {
    if (LEAK_RES.some(re => re.test(l)) || wordRes.some(re => re.test(l))) out.push(i + 1);
  });
  return out;
}

/** What node's ending means: { result, code }. Only a clean exit 0 with no error or signal is a pass. */
export function verdict({ error, code, signal }) {
  if (error) return { result: `fail (node did not start: ${SHOWN(String(error))})`, code: 1 };
  if (signal) return { result: `fail (node killed by ${SHOWN(String(signal))})`, code: 1 };
  if (code !== 0) return { result: `fail (exit ${code})`, code: 1 };
  return { result: 'pass', code: 0 };
}

// ------------------------------------------------------------ the shell

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');

function usage(say, why) {
  say(`run: ${SHOWN(why)}`);
  say('usage: node gate/tests/run.mjs <changed|fast|full> [--base <ref>] [--reporter <spec|tap|dot|junit>] [--record <file>] [--list]');
  say(`RESULT: refused, ${SHOWN(why)}`);
  return 2;
}

export function parseArgs(argv) {
  const opts = { tier: null, reporter: null, record: null, base: null, list: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const eq = a.indexOf('=');
    const [flag, inline] = a.startsWith('--') && eq > 0 ? [a.slice(0, eq), a.slice(eq + 1)] : [a, null];
    if (flag === '--reporter' || flag === '--record' || flag === '--base') {
      const v = inline ?? argv[(i += 1)];
      if (v === undefined || v === '') return { error: `${flag} needs a value` };
      opts[flag.slice(2)] = v;
    } else if (a === '--list') opts.list = true;
    else if (a.startsWith('-')) return { error: `unknown option ${a}` };
    else if (opts.tier !== null) return { error: `a second tier ${a}` };
    else opts.tier = a;
  }
  if (opts.tier === null) return { error: 'no tier' };
  if (!TIERS.includes(opts.tier)) return { error: `unknown tier ${opts.tier}` };
  if (opts.reporter !== null && !REPORTERS.includes(opts.reporter)) return { error: `unknown reporter ${opts.reporter}` };
  if (opts.base !== null && opts.tier !== 'changed') return { error: `--base is for the changed tier only` };
  if (opts.base !== null && opts.base.startsWith('-')) return { error: `a base that starts with a dash` };
  return { opts };
}

function readSources(dir, rel = '') {
  const out = new Map();
  for (const e of readdirSync(join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) for (const [k, v] of readSources(dir, r)) out.set(k, v);
    else if (e.isFile() && MODULE_RE.test(e.name)) out.set(r, readFileSync(join(dir, r), 'utf8'));
  }
  return out;
}

/** `p` with links, junctions and short (8.3) names resolved, through its nearest existing ancestor. */
function realish(p) {
  const rest = [];
  let at = resolve(p);
  for (;;) {
    try {
      return join(realpathSync.native(at), ...rest);
    } catch {
      const up = dirname(at);
      if (up === at) return resolve(p);
      rest.unshift(basename(at));
      at = up;
    }
  }
}

/** Whether `child` is `parent` or under it, compared as real paths. */
function inside(parent, child) {
  const rel = relative(realish(parent), realish(child));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function cleanEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!/^(?:NODE_OPTIONS|NODE_TEST_CONTEXT)$/i.test(k)) env[k] = v;
  return env;
}

/**
 * git's environment: the runner's own, minus every GIT_ variable but tracing,
 * so an inherited GIT_DIR, work tree, index or config can't point the changed
 * set at another repo or rewrite how git reads this one.
 */
function gitEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!/^GIT_/i.test(k) || /^GIT_TRACE$/i.test(k)) env[k] = v;
  return env;
}

/** Run git in the repo with no shell; { out } on exit 0, else { error }. */
function gitRun(args) {
  const r = spawnSync('git', ['-c', 'core.fsmonitor=false', '-c', 'core.quotePath=false', ...args], { cwd: REPO, env: gitEnv(), encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (r.error) return { error: `git did not start (${SHOWN(String(r.error.code ?? 'spawn failed'))})` };
  if (r.status !== 0) return { error: `git ${args[0]} exited ${r.status}` };
  return { out: r.stdout };
}

const nulList = s => s.split('\0').filter(p => p !== '');

/**
 * The changed set (S5): paths that differ between the merge-base of HEAD and
 * `base` and the working tree, staged or not, deleted and renamed files by
 * both paths, plus untracked files git doesn't ignore. The base is resolved to
 * a commit before any other git call. Returns { base, mergeBase, paths } or { error }.
 */
export function changedSet(base, shown = base) {
  if (base.startsWith('-')) return { error: 'a base that starts with a dash' };
  const sha = gitRun(['rev-parse', '--verify', '--quiet', '--end-of-options', `${base}^{commit}`]);
  if (sha.error) return { error: `the base ${shown} does not resolve to a commit` };
  const commit = sha.out.trim();
  if (!/^[0-9a-f]{40,64}$/.test(commit)) return { error: `the base ${shown} does not resolve to a commit` };
  // Paths are read relative to the repo's top, so the runner must sit at it:
  // in a tree nested inside another repo, every path would carry a prefix and
  // gate code would no longer select the full tier.
  const prefix = gitRun(['rev-parse', '--show-prefix']);
  if (prefix.error || prefix.out.trim() !== '') return { error: 'the runner is not at the top of its own git repository' };
  const mb = gitRun(['merge-base', commit, 'HEAD']);
  if (mb.error) return { error: `no merge-base of ${shown} and HEAD (${mb.error})` };
  const mergeBase = mb.out.trim();
  // --no-renames lists a rename as its deletion and its addition, so both
  // paths count. The working tree and the index are read separately, so a
  // staged change that the working copy undoes still counts.
  const diff = gitRun(['diff', '--no-renames', '--no-ext-diff', '--name-only', '-z', mergeBase, '--']);
  if (diff.error) return { error: diff.error };
  const staged = gitRun(['diff', '--cached', '--no-renames', '--no-ext-diff', '--name-only', '-z', mergeBase, '--']);
  if (staged.error) return { error: staged.error };
  const others = gitRun(['ls-files', '--others', '--exclude-standard', '--full-name', '-z']);
  if (others.error) return { error: others.error };
  return { base: commit, mergeBase, paths: [...new Set([...nulList(diff.out), ...nulList(staged.out), ...nulList(others.out)])].sort() };
}

/** The names a record must never hold as whole words: the host and user names. */
function localNames() {
  let user = null;
  try {
    user = userInfo().username;
  } catch {
    user = process.env.USERNAME ?? process.env.USER ?? null;
  }
  return { user, host: hostname() };
}

function localScrub() {
  const aliases = [];
  const t = tmpdir();
  try {
    const long = realpathSync.native(t);
    if (long !== t) aliases.push([t, long]);
  } catch {
    // no alias from an unreadable temp folder
  }
  const { user, host } = localNames();
  const real = p => {
    try {
      return realpathSync.native(p);
    } catch {
      return p;
    }
  };
  const scrubs = [makeScrub({ repo: REPO, home: homedir(), tmp: t, user, host, aliases }), makeScrub({ repo: real(REPO), home: real(homedir()), tmp: real(t), user: null, aliases })];
  return text => scrubs.reduce((s, f) => f(s), text);
}

export async function main(argv) {
  const record = [];
  const say = line => {
    process.stderr.write(`${line}\n`);
    record.push(`${line}\n`);
  };
  const parsed = parseArgs(argv);
  if (parsed.error) return usage(say, parsed.error);
  const { tier, reporter, list } = parsed.opts;
  let recordPath = null;
  if (parsed.opts.record !== null) {
    recordPath = resolve(parsed.opts.record);
    if (inside(REPO, recordPath)) return usage(say, '--record must name a file outside the repo');
  }

  let changed = [];
  let base = null;
  if (tier === 'changed') {
    // The default base is the branch itself, by its full name, so a tag or
    // another ref called main can't stand in for it.
    const given = parsed.opts.base;
    const set = given === null ? changedSet(`refs/heads/${DEFAULT_BASE}`, DEFAULT_BASE) : changedSet(given);
    if (set.error) return usage(say, set.error);
    changed = set.paths;
    base = `, base ${SHOWN(given ?? DEFAULT_BASE)} (${set.base.slice(0, 7)}), merge-base ${set.mergeBase.slice(0, 7)}, ${changed.length} changed paths`;
  }

  const entries = readdirSync(HERE, { withFileTypes: true })
    .filter(e => e.name.endsWith(TEST_SUFFIX))
    .map(e => ({ name: e.name, file: e.isFile() }));
  const { files, refused, unmapped } = pick({ tier, entries, sources: readSources(HERE), copyList: { dirs: COPY_DIRS, files: COPY_FILES }, changed });
  say(`run: tier ${tier}${base ?? ''}, cap ${CAP}${reporter ? `, reporter ${reporter}` : ''}${list ? ', list only' : ''}`);
  if (refused.length) {
    for (const r of refused) say(`refused: gate/tests/${SHOWN(r.name)} (${r.why})`);
    say(`RESULT: ${tier} tier, ${files.length} files, refused (${refused.length} test-file names refused)`);
    return 2;
  }
  for (const p of unmapped) say(`unmapped: ${SHOWN(p)} (no rule maps it, so the fast tier runs)`);
  // A reason is built from fixed text and names already passed through SHOWN.
  for (const f of files) say(`pick: gate/tests/${f.file} (${f.reason})`);
  if (files.length === 0) {
    say(`RESULT: ${tier} tier, 0 files, refused (an empty pick runs nothing)`);
    return 2;
  }
  if (list) {
    for (const f of files) process.stdout.write(`gate/tests/${f.file}\t${f.reason}\n`);
    say(`RESULT: ${tier} tier, ${files.length} files, listed, not run`);
    return 0;
  }

  const rep = reporter ?? (process.stdout.isTTY ? 'spec' : null);
  const args = ['--test', `--test-concurrency=${CAP}`, ...(rep ? [`--test-reporter=${rep}`] : []), ...files.map(f => `gate/tests/${f.file}`)];
  const outcome = await new Promise(done => {
    let child;
    try {
      child = spawn(process.execPath, args, { cwd: REPO, env: cleanEnv(), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    } catch (e) {
      done({ error: e.code ?? 'spawn failed' });
      return;
    }
    let settled = false;
    const finish = r => {
      if (!settled) (settled = true), done(r);
    };
    for (const [stream, out] of [
      [child.stdout, process.stdout],
      [child.stderr, process.stderr],
    ]) {
      const dec = new StringDecoder('utf8');
      stream.on('data', d => {
        out.write(d);
        record.push(dec.write(d));
      });
      stream.on('end', () => record.push(dec.end()));
    }
    child.on('error', e => finish({ error: e.code ?? 'spawn failed' }));
    child.on('close', (code, signal) => finish({ code, signal }));
  });

  const { result, code } = verdict(outcome);
  const last = `RESULT: ${tier} tier, ${files.length} files, ${result}`;

  if (recordPath) {
    record.push(`${last}\n`);
    const text = localScrub()(record.join(''));
    const { user, host } = localNames();
    const leaks = leakedLines(text, [host, user]);
    if (leaks.length) {
      say(`record: not written, ${leaks.length} lines still held a local path or name (lines ${leaks.slice(0, 20).join(', ')}${leaks.length > 20 ? ', ...' : ''})`);
      say(`${last}; record refused`);
      return 3;
    }
    try {
      writeFileSync(recordPath, text);
    } catch (e) {
      say(`record: not written (${SHOWN(String(e.code ?? 'write failed'))})`);
      say(`${last}; record refused`);
      return 3;
    }
  }
  process.stderr.write(`${last}\n`);
  return code;
}

// Run main when started as a script. Both sides are compared as real paths:
// node gives argv[1] as typed but import.meta.url with links resolved, so a
// plain compare would skip main, and exit 0 having run nothing, when the
// runner is started through a link, a junction or a short name.
const self = realish(fileURLToPath(import.meta.url));
const invoked = process.argv[1] ? realish(process.argv[1]) : '';
if (process.platform === 'win32' ? invoked.toLowerCase() === self.toLowerCase() : invoked === self) {
  main(process.argv.slice(2)).then(
    c => {
      process.exitCode = c;
    },
    e => {
      process.stderr.write(`RESULT: fail (runner error: ${SHOWN(String(e?.message ?? e))})\n`);
      process.exitCode = 1;
    },
  );
}
