// The gate's test runner (#140): one fail-closed command per tier.
//
//   node gate/tests/run.mjs <fast|full> [--reporter <spec|tap|dot|junit>] [--record <file>] [--list]
//
// full is every top-level test file in this folder. The install tier is every
// test file that reaches install-harness.mjs through its imports, or names the
// install script in a string literal; fast is full minus the install tier.
// The runner starts this same Node (process.execPath) with --test, the cap of
// four files at once, and an explicit file list, with NODE_OPTIONS and
// NODE_TEST_CONTEXT cleared. It never reports a pass it didn't earn: an empty
// pick, a refused name or a usage error exits 2 without starting node, and a
// killed node, a node that didn't start or a non-zero status exits 1. Its own
// lines go to stderr, so node's reporter output on stdout stays clean; the
// last line names the tier, the file count and the result. --record writes a
// scrubbed copy of everything printed to a file outside the repo, and exits 3
// if a local path survives the scrub. --list prints the pick and runs nothing.
// It reads no git. The install skips this folder before any check, so this
// file is never staged or installed. On the probe floor by name (AGENTS.md).
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir, userInfo } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { posix } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { COPY_DIRS, COPY_FILES } from './copy-list.mjs';

export const TIERS = Object.freeze(['fast', 'full']);
export const REPORTERS = Object.freeze(['spec', 'tap', 'dot', 'junit']);
export const CAP = 4;
export const TEST_SUFFIX = '.test.mjs';
/** A top-level test-file name the runner accepts; anything else refuses the run. */
export const PLAIN_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.test\.mjs$/;
export const HARNESS = 'install-harness.mjs';
export const INSTALL_SCRIPT = 'install.ps1';
const MODULE_RE = /\.(?:mjs|cjs|js)$/;

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

/**
 * The files a tier runs, each with its reason. `entries` are the top-level
 * entries whose names end in the test suffix, as { name, file } (file: a
 * regular file). `sources` maps each module under the tests folder, by its
 * posix path relative to that folder, to its text. `copyList` is the
 * install's copy list, kept for the tiers that map changed paths.
 * Returns { files: [{ file, reason }], refused: [{ name, why }] }.
 */
export function pick({ tier, entries, sources, copyList }) {
  if (!TIERS.includes(tier)) throw new Error(`unknown tier: ${tier}`);
  void copyList;
  const refused = [];
  const tests = [];
  for (const e of [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    if (!PLAIN_NAME.test(e.name)) refused.push({ name: e.name, why: 'a name outside the plain set' });
    else if (!e.file) refused.push({ name: e.name, why: 'not a regular file' });
    else tests.push(e.name);
  }
  const files = [];
  for (const name of tests) {
    const chain = harnessChain(name, sources);
    const install = chain ? `install tier: imports ${chain.slice(1).join(' -> ')}` : namesInstallScript(sources.get(name) ?? '') ? `install tier: names ${INSTALL_SCRIPT}` : null;
    if (tier === 'full') files.push({ file: name, reason: install ?? 'fast tier' });
    else if (!install) files.push({ file: name, reason: 'fast tier: does not run the install' });
  }
  return { files, refused };
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

/** A scrub function for { repo, home, tmp, user } with their placeholders, longest form first. */
export function makeScrub({ repo, home, tmp, user, aliases = [], win = process.platform === 'win32' }) {
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
  const userRe = user && user.length >= 2 ? new RegExp(`(?<![A-Za-z0-9])${escapeRe(user)}(?![A-Za-z0-9])`, flags) : null;
  return text => {
    let out = text;
    for (const [re, ph] of res) out = out.replace(re, ph);
    if (userRe) out = out.replace(userRe, '<user>');
    return out;
  };
}

const LEAK_RES = [/(?<![A-Za-z0-9+.-])[A-Za-z]:[\\/]/, /(?<![A-Za-z0-9.-])\/(?:home|Users)\/[^/\s<]/, /\\Users\\[^\\\s<]/i];

/** The 1-based numbers of the lines that still hold a drive-letter or home-prefix path. */
export function leakedLines(text) {
  const out = [];
  text.split('\n').forEach((l, i) => {
    if (LEAK_RES.some(re => re.test(l))) out.push(i + 1);
  });
  return out;
}

// ------------------------------------------------------------ the shell

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const SHOWN = s => s.replace(/[^A-Za-z0-9._/ -]/g, '?');

function usage(say, why) {
  say(`run: ${SHOWN(why)}`);
  say('usage: node gate/tests/run.mjs <fast|full> [--reporter <spec|tap|dot|junit>] [--record <file>] [--list]');
  say(`RESULT: refused, ${SHOWN(why)}`);
  return 2;
}

export function parseArgs(argv) {
  const opts = { tier: null, reporter: null, record: null, list: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const eq = a.indexOf('=');
    const [flag, inline] = a.startsWith('--') && eq > 0 ? [a.slice(0, eq), a.slice(eq + 1)] : [a, null];
    if (flag === '--reporter' || flag === '--record') {
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

function inside(parent, child) {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function cleanEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!/^(?:NODE_OPTIONS|NODE_TEST_CONTEXT)$/i.test(k)) env[k] = v;
  return env;
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
  let user = null;
  try {
    user = userInfo().username;
  } catch {
    user = process.env.USERNAME ?? process.env.USER ?? null;
  }
  const real = p => {
    try {
      return realpathSync.native(p);
    } catch {
      return p;
    }
  };
  const scrubs = [makeScrub({ repo: REPO, home: homedir(), tmp: t, user, aliases }), makeScrub({ repo: real(REPO), home: real(homedir()), tmp: real(t), user: null, aliases })];
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

  const entries = readdirSync(HERE, { withFileTypes: true })
    .filter(e => e.name.endsWith(TEST_SUFFIX))
    .map(e => ({ name: e.name, file: e.isFile() }));
  const { files, refused } = pick({ tier, entries, sources: readSources(HERE), copyList: { dirs: COPY_DIRS, files: COPY_FILES } });
  say(`run: tier ${tier}, cap ${CAP}${reporter ? `, reporter ${reporter}` : ''}${list ? ', list only' : ''}`);
  if (refused.length) {
    for (const r of refused) say(`refused: gate/tests/${SHOWN(r.name)} (${r.why})`);
    say(`RESULT: ${tier} tier, ${files.length} files, refused (${refused.length} test-file names refused)`);
    return 2;
  }
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

  let result;
  let code;
  if (outcome.error) (result = `fail (node did not start: ${SHOWN(String(outcome.error))})`), (code = 1);
  else if (outcome.signal) (result = `fail (node killed by ${outcome.signal})`), (code = 1);
  else if (outcome.code !== 0) (result = `fail (exit ${outcome.code})`), (code = 1);
  else (result = 'pass'), (code = 0);
  const last = `RESULT: ${tier} tier, ${files.length} files, ${result}`;

  if (recordPath) {
    record.push(`${last}\n`);
    const text = localScrub()(record.join(''));
    const leaks = leakedLines(text);
    if (leaks.length) {
      say(`record: not written, ${leaks.length} lines still held a local path (lines ${leaks.slice(0, 20).join(', ')}${leaks.length > 20 ? ', ...' : ''})`);
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

const self = fileURLToPath(import.meta.url);
const invoked = process.argv[1] ? resolve(process.argv[1]) : '';
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
