// Tables of bad cases (#140, T5): the shape for a gate module's must-refuse
// cases. A table has a base input that passes and rows; a row is one plant on
// the base and the exact rule ids it must fail with. A new bad case is a new
// row, with no setup of its own.
//
//   for (const c of table('render edit list', {
//     module: 'gate/render.mjs',     // whose rule ids the rows name
//     base: () => tree,               // the passing input: { 'rel/path': text or bytes }
//     run: (tree, t) => result,       // { code, fails, last, out }; see moduleResult
//     everyRow: (result, t) => {},    // optional: more assertions on every row's result
//     rows: [{ id: 'unknown-mark', plant: tree => tree, fails: ['edit-mark'], says: /edit 1/, why: 'a mark the source lacks' }],
//   })) test(c.name, c.fn);
//
// It returns "<table>: base passes", "<table>: <row id>" for each row, and
// "<table>: base passes after the rows" as { name, fn }, and the test file
// registers each with node:test itself, in that loop. node's reporters name
// the file that called test(), so a test registered from here would be
// reported under this module, not under its own file. A row's test applies
// its plant to a fresh base and asserts exit 1, "RESULT: fail", and that the
// set of FAIL rule ids equals `fails` (equals, not includes), and that the
// output matches `says` when given. The base passing, and each row differing
// from it only by its plant, is what proves a row fails because of its plant:
// a runner that always passes fails every row, one that always fails fails
// the base. A malformed table throws when registered, which fails its file:
// no rows, a duplicate or odd row id, empty `fails`, a plant that leaves the
// input's bytes unchanged, or a rule id no string literal in the module or
// the gate files it imports holds (a grimoire/ id: the pinned check's).
// The table name and each row id must be string literals in the call, so a
// reader can find a row by searching the file for its name.
// Importing this file touches nothing; calling table() reads the module's
// sources once. Ordinary test code since #189.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { relativeImports, stringLiterals } from './run.mjs';

/** A row's id: lower-case words joined by dashes. */
export const ROW_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TABLES_MODULE = './tables.mjs';
const TABLE_FN = 'table';
/** A table's name: lower-case words, single spaces. */
export const TABLE_NAME = /^[a-z0-9]+(?: [a-z0-9]+)*$/;
const ROW_KEYS = new Set(['id', 'plant', 'fails', 'says', 'why']);
const SPEC_KEYS = new Set(['module', 'base', 'run', 'rows', 'everyRow']);
const MODULE = /^gate\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*\.mjs$/;
const PINNED = 'gate/grimoire/check.mjs';
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// ------------------------------------------------------------ inputs: pure

const isTree = v => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype && Object.values(v).every(x => typeof x === 'string' || Buffer.isBuffer(x));

/** A tree's bytes, for comparing two inputs: each path and its bytes, in path order. */
export function treeBytes(tree) {
  const parts = [];
  for (const k of Object.keys(tree).sort()) {
    const b = Buffer.isBuffer(tree[k]) ? tree[k] : Buffer.from(tree[k], 'utf8');
    parts.push(Buffer.from(`${k}\0${b.length}\0`), b);
  }
  return Buffer.concat(parts);
}

const cloneTree = tree => Object.fromEntries(Object.entries(tree).map(([k, v]) => [k, Buffer.isBuffer(v) ? Buffer.from(v) : v]));

/** A gate module's result from its exit code and output: the FAIL rule ids, the last line, and all of it for `says`. */
export function moduleResult(code, stdout, stderr = '') {
  const lines = stdout.split('\n').filter(l => l !== '');
  return {
    code,
    fails: lines.filter(l => l.startsWith('FAIL ')).map(l => l.slice(5).split(':')[0]),
    last: lines[lines.length - 1],
    out: stdout + stderr,
  };
}

// ------------------------------------------------------------ rule ids: reads the gate's sources

/** The string literals in `module` and every gate file it imports, directly or through others. */
export function moduleLiterals(module, read = rel => readFileSync(resolve(REPO, rel), 'utf8')) {
  const seen = new Set();
  const out = new Set();
  const queue = [module];
  while (queue.length) {
    const rel = queue.shift();
    if (seen.has(rel)) continue;
    seen.add(rel);
    const src = read(rel);
    for (const s of stringLiterals(src)) out.add(s);
    for (const spec of relativeImports(src)) {
      const next = posix.normalize(posix.join(posix.dirname(rel), spec));
      if (next.startsWith('gate/') && !next.startsWith('gate/tests/')) queue.push(next);
    }
  }
  return out;
}

// ------------------------------------------------------------ the shape: pure but for the sources

/** Each way `spec` is not a well-formed table named `name`, as plain sentences; empty when it is. */
export function problems(name, spec, read) {
  const out = [];
  if (typeof name !== 'string' || !TABLE_NAME.test(name)) out.push('the name is not lower-case words with single spaces');
  if (spec === null || typeof spec !== 'object') return [...out, 'no table given'];
  for (const k of Object.keys(spec)) if (!SPEC_KEYS.has(k)) out.push(`an unknown key ${JSON.stringify(k)}`);
  if (typeof spec.module !== 'string' || !MODULE.test(spec.module) || spec.module.startsWith('gate/tests/')) out.push('module is not a gate module path');
  if (typeof spec.base !== 'function') out.push('base is not a function');
  if (typeof spec.run !== 'function') out.push('run is not a function');
  if (spec.everyRow !== undefined && typeof spec.everyRow !== 'function') out.push('everyRow is not a function');
  if (!Array.isArray(spec.rows) || spec.rows.length === 0) return [...out, 'the table has no rows'];
  if (out.length) return out;

  let base;
  try {
    base = spec.base();
  } catch (e) {
    return [`base threw: ${e.message}`];
  }
  if (!isTree(base)) return ['base did not return a tree of text or bytes'];
  const baseBytes = treeBytes(base);

  let literals = null;
  const known = id => {
    if (id.startsWith('grimoire/')) return moduleLiterals(PINNED, read).has(id.slice('grimoire/'.length));
    literals ??= moduleLiterals(spec.module, read);
    return literals.has(id);
  };

  const ids = new Set();
  spec.rows.forEach((row, i) => {
    const at = `row ${i + 1}`;
    if (row === null || typeof row !== 'object') return out.push(`${at} is not an object`);
    for (const k of Object.keys(row)) if (!ROW_KEYS.has(k)) out.push(`${at} has an unknown key ${JSON.stringify(k)}`);
    if (typeof row.id !== 'string' || !ROW_ID.test(row.id)) out.push(`${at}'s id is not lower-case words joined by dashes`);
    else if (ids.has(row.id)) out.push(`${at}'s id ${row.id} repeats`);
    else ids.add(row.id);
    if (typeof row.why !== 'string' || row.why.trim() === '') out.push(`${at} gives no why`);
    if (row.says !== undefined && !(row.says instanceof RegExp)) out.push(`${at}'s says is not a pattern`);
    if (!Array.isArray(row.fails) || row.fails.length === 0) out.push(`${at} names no rule it fails`);
    else if (row.fails.some(f => typeof f !== 'string' || f === '')) out.push(`${at} names a rule that is not text`);
    else if (new Set(row.fails).size !== row.fails.length) out.push(`${at} names a rule twice`);
    else for (const f of row.fails) if (!known(f)) out.push(`${at} names the rule ${JSON.stringify(f)}, which ${f.startsWith('grimoire/') ? 'the pinned check' : spec.module} does not hold`);
    if (typeof row.plant !== 'function') return out.push(`${at}'s plant is not a function`);
    let planted;
    try {
      planted = row.plant(cloneTree(base));
    } catch (e) {
      return out.push(`${at}'s plant threw: ${e.message}`);
    }
    if (!isTree(planted)) out.push(`${at}'s plant did not return a tree of text or bytes`);
    else if (treeBytes(planted).equals(baseBytes)) out.push(`${at}'s plant leaves the input unchanged`);
  });
  return out;
}

// ------------------------------------------------------------ registering

const sorted = a => [...new Set(a)].sort();

/** A table's tests, as [{ name, fn }] for the test file to register in order. Throws, failing the file, when the table is malformed. */
export function table(name, spec) {
  const bad = problems(name, spec);
  if (bad.length) throw new Error(`table ${JSON.stringify(name)} is malformed: ${bad.join('; ')}`);
  const passes = r => {
    assert.equal(r.code, 0, r.out);
    assert.equal(r.last, 'RESULT: pass', r.out);
    assert.deepEqual(r.fails, [], r.out);
  };
  const tests = [{ name: `${name}: base passes`, fn: async t => passes(await spec.run(spec.base(), t)) }];
  for (const row of spec.rows) {
    tests.push({
      name: `${name}: ${row.id}`,
      fn: async t => {
        const r = await spec.run(row.plant(cloneTree(spec.base())), t);
        assert.equal(r.code, 1, r.out);
        assert.equal(r.last, 'RESULT: fail', r.out);
        assert.deepEqual(sorted(r.fails), sorted(row.fails), r.out);
        if (row.says) assert.match(r.out, row.says, r.out);
        if (spec.everyRow) await spec.everyRow(r, t);
      },
    });
  }
  // A row that leaks state into the process shows here: the base no longer passes.
  tests.push({ name: `${name}: base passes after the rows`, fn: async t => passes(await spec.run(spec.base(), t)) });
  return tests;
}

// ------------------------------------------------------------ the registering loop, read from a test file's source: pure

const PUNCT_REGEX_AFTER = new Set([...'(,=:[!&|?{};+-*%<>~^']);
const WORDS_REGEX_AFTER = new Set(['return', 'typeof', 'case', 'of', 'in', 'void', 'delete', 'throw', 'yield', 'await']);

/** A module's source as tokens: { t: 'str', v } for a string literal (a template only when it has no ${}), { t: 'tpl' } for one that has, { t: 're' } for a regex literal, { t: 'word', v }, { t: 'p', v }. Comments are dropped. */
function tokens(src) {
  const out = [];
  const n = src.length;
  let i = 0;
  const prev = () => out[out.length - 1];
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      const j = src.indexOf('\n', i);
      i = j < 0 ? n : j;
    } else if (c === '/' && src[i + 1] === '*') {
      const j = src.indexOf('*/', i + 2);
      i = j < 0 ? n : j + 2;
    } else if (c === '"' || c === "'") {
      let s = '';
      i += 1;
      while (i < n && src[i] !== c && src[i] !== '\n') {
        if (src[i] === '\\') {
          s += src[i + 1] ?? '';
          i += 2;
        } else s += src[i++];
      }
      i += 1;
      out.push({ t: 'str', v: s });
    } else if (c === '`') {
      let s = '';
      let plain = true;
      i += 1;
      while (i < n && src[i] !== '`') {
        if (src[i] === '\\') {
          s += src[i + 1] ?? '';
          i += 2;
        } else if (src[i] === '$' && src[i + 1] === '{') {
          plain = false;
          let depth = 1;
          i += 2;
          while (i < n && depth > 0) {
            const d = src[i];
            if (d === '"' || d === "'" || d === '`') {
              i += 1;
              while (i < n && src[i] !== d) i += src[i] === '\\' ? 2 : 1;
            } else if (d === '{') depth += 1;
            else if (d === '}') depth -= 1;
            i += 1;
          }
        } else s += src[i++];
      }
      i += 1;
      out.push(plain ? { t: 'str', v: s } : { t: 'tpl' });
    } else if (c === '/' && (!prev() || (prev().t === 'p' && PUNCT_REGEX_AFTER.has(prev().v)) || (prev().t === 'word' && WORDS_REGEX_AFTER.has(prev().v)))) {
      // A regex literal: skipped, and kept as one token that is no bracket.
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
      while (i < n && /[a-z]/.test(src[i])) i += 1;
      out.push({ t: 're' });
    } else if (/\s/.test(c)) i += 1;
    else if (/[A-Za-z0-9_$]/.test(c)) {
      let w = '';
      while (i < n && /[A-Za-z0-9_$]/.test(src[i])) w += src[i++];
      out.push({ t: 'word', v: w });
    } else {
      out.push({ t: 'p', v: c });
      i += 1;
    }
  }
  return out;
}

const OPENS = '([{';
const CLOSES = ')]}';

/** The index of the bracket that closes the one opening at `open`. */
function closeOf(toks, open) {
  let depth = 0;
  for (let j = open; j < toks.length; j += 1) {
    if (toks[j].t !== 'p') continue;
    if (OPENS.includes(toks[j].v)) depth += 1;
    else if (CLOSES.includes(toks[j].v) && --depth === 0) return j;
  }
  return toks.length;
}

/**
 * Every `table(...)` call in a test file's source, as { calls: [{ name,
 * registered }], aliased }. `name` is the table's name when it is a string
 * literal, else null. A call is registered only when it heads a top-level
 * loop that registers each test in the file:
 * `for (const c of table('<name>', { ... })) test(c.name, c.fn);`.
 * `aliased` is whether the file imports `table` from ./tables.mjs under
 * another name.
 */
function tableCalls(src) {
  const toks = tokens(src);
  let aliased = false;
  for (let i = 0; i < toks.length; i += 1) {
    if (toks[i].v !== 'import' || toks[i + 1]?.v !== '{') continue;
    const close = toks.findIndex((tk, j) => j > i && tk.v === '}');
    if (close < 0 || toks[close + 1]?.v !== 'from' || toks[close + 2]?.t !== 'str' || toks[close + 2].v !== TABLES_MODULE) continue;
    for (let k = i + 2; k < close; k += 1) if (toks[k].v === TABLE_FN && toks[k + 1]?.v === 'as') aliased = true;
  }
  const calls = [];
  let depth = 0;
  for (let i = 0; i < toks.length; i += 1) {
    const tk = toks[i];
    const prev = toks[i - 1]?.v;
    if (tk.t === 'word' && tk.v === TABLE_FN && toks[i + 1]?.v === '(' && !['.', 'function', 'import', 'as', '{', ','].includes(prev)) {
      const name = toks[i + 2]?.t === 'str' ? toks[i + 2].v : null;
      const close = closeOf(toks, i + 1);
      const v = toks[i - 2];
      // for ( const c of table ( ... ) ) test ( c . name , c . fn ) ; with the for at the top level
      const head = depth === 1 && toks[i - 5]?.v === 'for' && toks[i - 4]?.v === '(' && toks[i - 3]?.v === 'const' && v?.t === 'word' && prev === 'of';
      const after = toks.slice(close + 1, close + 12).map(x => x.v ?? `<${x.t}>`);
      const want = [')', 'test', '(', v?.v, '.', 'name', ',', v?.v, '.', 'fn', ')'];
      calls.push({ name, registered: head && want.every((w, k) => after[k] === w) });
    }
    if (tk.t === 'p') {
      if (OPENS.includes(tk.v)) depth += 1;
      else if (CLOSES.includes(tk.v)) depth -= 1;
    }
  }
  return { calls, aliased };
}

/**
 * Each `table(...)` call in a test file's source that is not registered as a
 * top-level `for (const c of table(...)) test(c.name, c.fn);`, by its table
 * name, or `(unnamed)`; and `(table imported under another name)` for an
 * aliased import. A table whose tests are never registered runs nothing, and
 * one inside a function or a branch may never run.
 */
export function unregisteredTables(src) {
  const { calls, aliased } = tableCalls(src);
  return [...(aliased ? ['(table imported under another name)'] : []), ...calls.filter(c => !c.registered).map(c => c.name ?? '(unnamed)')];
}