// The proof that no test is lost (#140, T5): a full run's record against the
// T1 baseline.
//
//   node gate/tests/baseline-compare.mjs <record>
//
// <record> is a file the runner wrote with --reporter junit --record. Beside
// the baseline, in fixtures/baseline-140/, sit three hand-kept lists:
// moves.tsv (one line per case that changed file or name), reporter-names.tsv
// (a case the report names differently from the baseline, by name, never by
// pattern) and env-cases.tsv (a case whose status depends on the machine, with
// a platform where it must pass). The compare fails when a baseline case has
// no home in the run, when a status differs, when a move does more than move a
// file (or name a table row its file registers), when the baseline's hash
// differs from the one held here, when the record is not one full-tier run
// that passed, with its cases under <repo>/gate/tests/, and when a hand-kept
// line holds a local path, the user or host name, or an email address. A leak
// is reported by file and line number only.
// It reads names from the baseline and the lists alone, and never prints a
// line of the record. Exit 0 on a pass, 1 on a fail, 2 on a usage error. Ordinary
// test code since #189; #189's second ticket deletes it.
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { hostname, userInfo } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leakedLines } from './run.mjs';

/** The T1 baseline's sha256 (#140, comment 6064685906). The baseline never changes; a new one is a new constant. */
export const BASELINE_SHA256 = '14af7916b6925e741ddbbc72de5add7f4018da0ebcbdafaed0564c1f91424c28';
export const LISTS_DIR = 'gate/tests/fixtures/baseline-140';
export const LIST_FILES = Object.freeze({ baseline: 'baseline.tsv', moves: 'moves.tsv', reporterNames: 'reporter-names.tsv', envCases: 'env-cases.tsv' });
export const PLATFORMS = Object.freeze(['linux', 'windows']);
export const STATUSES = Object.freeze(['pass', 'skip', 'fail']);
/** The module a table row is registered through, and its function, as a test file imports them. */
export const TABLES_MODULE = './tables.mjs';
export const TABLE_FN = 'table';
/** A case's home: a top-level test file in the tests folder. */
export const TEST_FILE = /^gate\/tests\/[A-Za-z0-9][A-Za-z0-9._-]*\.test\.mjs$/;
/** A table row's id: lower-case words joined by single dashes. */
export const ROW_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const key = (file, name) => `${file}\t${name}`;
/** A path as the compare prints it: any character outside a plain set replaced, as the runner does. */
const shownPath = p => p.replace(/[^A-Za-z0-9._/ ()-]/g, '?');
/** An email address's shape: a hand-kept line must never hold one. */
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;
/** The 1-based lines of `text` that hold a local path or one of `names` as a word (the runner's patterns), or an email address. */
const leaksIn = (text, names) => [...new Set([...leakedLines(text, names), ...text.split('\n').flatMap((l, i) => (EMAIL.test(l) ? [i + 1] : []))])].sort((a, b) => a - b);

// ------------------------------------------------------------ the record: pure

/** One unescape, as the T1 baseline was read: node's junit reporter escapes names twice, so the baseline keeps "&quot;". */
const unesc = s =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');

const attr = (tag, name) => {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? unesc(m[1]) : null;
};

const TAG_RE = /<(\/?)(testsuites|testsuite|testcase|skipped|failure|error)\b((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/g;
const ANY_TAG_RE = /<!--[\s\S]*?-->|<\?xml[^>]*\?>|<\/?[A-Za-z][\w:-]*(?:\s+[\w:-]+="[^"]*")*\s*\/?>/g;

/**
 * The cases in a record-mode junit run: { cases: [{ file, name, status }], platform } or { error }.
 * A case's name is its suite chain and its own name, joined by " > ", as the baseline names it.
 * The platform is read from the separator in the case's file paths: "\" is windows, "/" is linux.
 */
export function parseRecord(text) {
  const opens = [...text.matchAll(/<testsuites\b/g)];
  const closes = [...text.matchAll(/<\/testsuites>/g)];
  if (opens.length !== 1 || closes.length !== 1 || closes[0].index < opens[0].index) return { error: 'the record holds no single junit report' };
  const xml = text.slice(opens[0].index, closes[0].index + '</testsuites>'.length);
  // A failure, error or skip element holds the reporter's text (a stack, a reason), and record mode's placeholders
  // (<repo>, <user>) can sit in it; text anywhere else is not the report's.
  if (xml.replace(/<(failure|error|skipped)\b(?:\s+[\w:-]+="[^"]*")*\s*>[\s\S]*?<\/\1>/g, '').replace(ANY_TAG_RE, '').trim() !== '') return { error: 'the junit report holds text that is not a tag' };
  const suites = [];
  const cases = [];
  const seps = new Set();
  let open = null;
  let bad = null;
  for (const m of xml.matchAll(TAG_RE)) {
    const [, close, tag, rest, self] = m;
    if (tag === 'testsuite') {
      if (close) suites.pop();
      else if (!self) suites.push(attr(rest, 'name'));
    } else if (tag === 'testcase') {
      if (close) {
        if (!open) bad = 'a closing testcase tag with no open case';
        cases.push(open);
        open = null;
      } else {
        if (open) bad = 'a testcase inside a testcase';
        const f = attr(rest, 'file');
        // Only a path under the repo, as record mode writes it, counts: <repo>, a separator, gate, tests.
        const fm = f === null ? null : /^<repo>([\\/])gate\1tests\1([^\\/]+(?:\1[^\\/]+)*)$/.exec(f);
        if (fm) seps.add(fm[1]);
        const c = { file: fm ? `gate/tests/${fm[2].split(fm[1]).join('/')}` : '(outside gate/tests)', name: [...suites, attr(rest, 'name')].join(' > '), status: 'pass' };
        if (self) cases.push(c);
        else open = c;
      }
    } else if (!close && open) open.status = tag === 'skipped' ? (open.status === 'fail' ? 'fail' : 'skip') : 'fail';
  }
  if (open) bad = 'a testcase that never closes';
  if (bad) return { error: `the junit report is malformed: ${bad}` };
  if (cases.length === 0) return { error: 'the junit report holds no case' };
  if (seps.size === 0) return { error: 'the junit report names no test file under the repo for its cases (Node 20\'s junit reporter writes none)' };
  if (seps.size !== 1) return { error: 'the platform of the record cannot be read from its file paths' };
  return { cases, platform: seps.has('\\') ? 'windows' : 'linux' };
}

// ------------------------------------------------------------ the lists: pure

/** Lines of a hand-kept list: [{ line, cols }], skipping blank lines and lines that start with "#". */
function listRows(text) {
  const out = [];
  text.split('\n').forEach((l, i) => {
    const s = l.endsWith('\r') ? l.slice(0, -1) : l;
    if (s === '' || s.startsWith('#')) return;
    out.push({ line: i + 1, cols: s.split('\t') });
  });
  return out;
}

// ------------------------------------------------------------ a table's rows, read from a test file's source: pure

const PUNCT_REGEX_AFTER = new Set([...'(,=:[!&|?{};+-*%<>~^']);
const WORDS_REGEX_AFTER = new Set(['return', 'typeof', 'case', 'of', 'in', 'void', 'delete', 'throw', 'yield', 'await']);

/** A module's source as tokens: { t: 'str', v } for a string literal (a template only when it has no ${}), { t: 'tpl' } for one that has, { t: 're' } for a regex literal, { t: 'word', v }, { t: 'p', v }. Comments are dropped. */
export function tokens(src) {
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
const isOpen = tk => tk?.t === 'p' && OPENS.includes(tk.v);

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

/** The indexes of the tokens directly inside the bracket opening at `open`; a nested bracket gives its opening index only. */
function inside(toks, open) {
  const out = [];
  const end = closeOf(toks, open);
  for (let j = open + 1; j < end; j += 1) {
    out.push(j);
    if (isOpen(toks[j])) j = closeOf(toks, j);
  }
  return out;
}

/** Whether the token at `k` is a key of the object it sits directly in: `{ key:` or `, key:`. */
const isKey = (toks, k, key) => (toks[k].t === 'word' || toks[k].t === 'str') && toks[k].v === key && toks[k + 1]?.v === ':' && (toks[k - 1]?.v === '{' || toks[k - 1]?.v === ',');

/**
 * Every `table(...)` call in a test file's source: [{ name, ids, registered }].
 * `name` is the table's name when it is a string literal, else null. `ids`
 * are the row ids written as string literals on the objects that are direct
 * elements of the `rows` array of the call's spec object, and nowhere else,
 * so an `id` key in a base input or a plant is not a row. A call is
 * registered only when it heads a top-level loop that registers each test in
 * the file: `for (const c of table('<name>', { ... })) test(c.name, c.fn);`.
 * `imported` is whether the file imports `table` from ./tables.mjs under that
 * name; `aliased`, whether it imports it under another.
 */
export function tableCalls(src) {
  const toks = tokens(src);
  let imported = false;
  let aliased = false;
  for (let i = 0; i < toks.length; i += 1) {
    if (toks[i].v !== 'import' || toks[i + 1]?.v !== '{') continue;
    const close = toks.findIndex((tk, j) => j > i && tk.v === '}');
    if (close < 0 || toks[close + 1]?.v !== 'from' || toks[close + 2]?.t !== 'str' || toks[close + 2].v !== TABLES_MODULE) continue;
    for (let k = i + 2; k < close; k += 1) {
      if (toks[k].v !== TABLE_FN) continue;
      if (toks[k + 1]?.v === 'as') aliased = true;
      else imported = true;
    }
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
      const registered = head && want.every((w, k) => after[k] === w);
      const ids = new Set();
      if (name !== null && toks[i + 3]?.v === ',' && toks[i + 4]?.v === '{') {
        for (const j of inside(toks, i + 4)) {
          if (!isKey(toks, j, 'rows') || toks[j + 2]?.v !== '[') continue;
          for (const k of inside(toks, j + 2)) {
            if (toks[k].v !== '{') continue;
            for (const m of inside(toks, k)) if (isKey(toks, m, 'id') && toks[m + 2]?.t === 'str') ids.add(toks[m + 2].v);
          }
        }
      }
      calls.push({ name, ids, registered });
    }
    if (tk.t === 'p') {
      if (OPENS.includes(tk.v)) depth += 1;
      else if (CLOSES.includes(tk.v)) depth -= 1;
    }
  }
  return { calls, imported, aliased };
}

/**
 * The rows a test file registers: Map<table name, Set<row id>>, from the
 * calls `tableCalls` finds registered, in a file that imports `table` from
 * ./tables.mjs under that name. A row id held in a variable, a table built
 * in a loop or a function, or one never registered, is not found.
 */
export function registeredRows(src) {
  const { calls, imported } = tableCalls(src);
  const out = new Map();
  if (!imported) return out;
  for (const c of calls) {
    if (!c.registered || c.name === null) continue;
    const ids = out.get(c.name) ?? new Set();
    for (const id of c.ids) ids.add(id);
    out.set(c.name, ids);
  }
  return out;
}

// ------------------------------------------------------------ the compare: pure

/**
 * Compare a run with the baseline. `lists` holds the text of each file in
 * LIST_FILES (baseline as bytes); `record` is the record's text; `names` are
 * the words a hand-kept line must never hold (the host and user names);
 * `source(file)` returns a repo-relative test file's source, or null.
 * Returns { ok, lines, counts }: `lines` is what to print, the last a RESULT line.
 */
export function compare({ lists, record, names = [], source = () => null }) {
  const problems = [];
  const say = p => problems.push(p);
  const done = counts => {
    const result = problems.length ? `RESULT: compare fail, ${problems.length} problems` : `RESULT: compare pass, unchanged ${counts.unchanged}, moved ${counts.moved}, new ${counts.new}`;
    const lines = [...problems, ...(counts.unchanged === undefined ? [] : [`counts: unchanged ${counts.unchanged}, moved ${counts.moved}, new ${counts.new}`]), result];
    // A backstop: a printed line that would leak is withheld, never shown.
    const leaks = new Set(leaksIn(lines.join('\n'), names));
    return { ok: problems.length === 0, lines: lines.map((l, i) => (leaks.has(i + 1) ? '(a line withheld: it held a local path or name)' : l)), counts };
  };

  // 1. The hand-kept files hold no local path or name, before any line of theirs is read.
  const texts = {};
  for (const [k, f] of Object.entries(LIST_FILES)) {
    const v = lists[k];
    if (v === undefined || v === null) {
      say(`missing: ${LISTS_DIR}/${f}`);
      continue;
    }
    texts[k] = Buffer.isBuffer(v) ? v.toString('utf8') : v;
    for (const n of leaksIn(texts[k], names)) say(`leak: ${LISTS_DIR}/${f} line ${n} holds a local path or name`);
  }
  if (problems.length) return done({});

  // 2. The baseline is the T1 list, by hash.
  const bytes = Buffer.isBuffer(lists.baseline) ? lists.baseline : Buffer.from(lists.baseline, 'utf8');
  if (createHash('sha256').update(bytes).digest('hex') !== BASELINE_SHA256) say(`baseline: ${LISTS_DIR}/${LIST_FILES.baseline} does not match its sha256`);
  // A name can repeat within a file (three cross-checks names do), so each
  // name holds the statuses of all its cases, and every count must match.
  const baseline = new Map();
  texts.baseline.split('\n').forEach((l, i, all) => {
    if (l === '' && i === all.length - 1) return;
    const cols = l.split('\t');
    if (cols.length !== 3 || !STATUSES.includes(cols[0])) return say(`baseline: line ${i + 1} is not "<status>\\t<file>\\t<name>"`);
    const k = key(cols[1], cols[2]);
    if (!baseline.has(k)) baseline.set(k, { file: cols[1], name: cols[2], statuses: [] });
    baseline.get(k).statuses.push(cols[0]);
  });

  // 3. Reporter names: a baseline case the report names differently, each by name.
  const reported = new Map(); // baseline key -> the key the run uses
  for (const { line, cols } of listRows(texts.reporterNames)) {
    const where = `${LIST_FILES.reporterNames} line ${line}`;
    if (cols.length !== 3 || cols.some(c => c === '')) {
      say(`${where}: not "<file>\\t<baseline name>\\t<reported name>"`);
      continue;
    }
    const [file, from, to] = cols;
    if (!baseline.has(key(file, from))) say(`${where}: names no baseline case`);
    else if (reported.has(key(file, from))) say(`${where}: names a case a line above already names`);
    else if (from === to) say(`${where}: changes nothing`);
    else reported.set(key(file, from), key(file, to));
  }
  // Each baseline case under the name the report gives it.
  const asReported = new Map();
  for (const [k, c] of baseline) {
    const rk = reported.get(k) ?? k;
    if (asReported.has(rk)) say(`${LIST_FILES.reporterNames}: two baseline cases would share the name ${rk.replace('\t', ' : ')}`);
    asReported.set(rk, c);
  }

  // 4. Env cases: a baseline case whose status depends on the machine, and a platform where it must pass.
  const env = new Map(); // baseline key -> platform
  for (const { line, cols } of listRows(texts.envCases)) {
    const where = `${LIST_FILES.envCases} line ${line}`;
    if (cols.length !== 4 || cols.some(c => c === '')) {
      say(`${where}: not "<file>\\t<name>\\t<platform>\\t<why>"`);
      continue;
    }
    const [file, name, platform] = cols;
    if (!PLATFORMS.includes(platform)) say(`${where}: the platform is not one of ${PLATFORMS.join(', ')}`);
    else if (!baseline.has(key(file, name))) say(`${where}: names no baseline case`);
    else if (env.has(key(file, name))) say(`${where}: names a case a line above already names`);
    else env.set(key(file, name), platform);
  }

  // 5. Moves: a case that changed file, or became a table row in its own file.
  const moved = new Map(); // reported key -> new key
  const targets = new Map(); // new key -> line
  const landsOn = []; // lines whose target is a baseline case, valid or not
  const rowsOf = new Map();
  const rows = file => {
    if (!rowsOf.has(file)) {
      const src = source(file);
      rowsOf.set(file, src === null ? new Map() : registeredRows(src));
    }
    return rowsOf.get(file);
  };
  for (const { line, cols } of listRows(texts.moves)) {
    const where = `${LIST_FILES.moves} line ${line}`;
    if (cols.length !== 4 || cols.some(c => c === '')) {
      say(`${where}: not "<old file>\\t<old name>\\t<new file>\\t<new name>"`);
      continue;
    }
    const [of, on, nf, nn] = cols;
    const from = key(of, on);
    const to = key(nf, nn);
    if (asReported.has(to) && to !== from) landsOn.push({ to, line });
    if (!asReported.has(from)) {
      say(`${where}: moves no baseline case`);
      continue;
    }
    if (moved.has(from)) {
      say(`${where}: moves a case a line above already moves`);
      continue;
    }
    if (targets.has(to)) {
      say(`${where}: names the same target as line ${targets.get(to)}`);
      continue;
    }
    if (on === nn && of === nf) {
      say(`${where}: changes nothing`);
      continue;
    }
    if (on !== nn) {
      // A rename is only a case becoming a row of a table its own file registers.
      const cut = nn.lastIndexOf(': ');
      const table = cut > 0 ? nn.slice(0, cut) : null;
      const id = cut > 0 ? nn.slice(cut + 2) : null;
      if (of !== nf) {
        say(`${where}: changes a name and a file at once`);
        continue;
      }
      if (table === null || !ROW_ID.test(id)) {
        say(`${where}: changes a test's name, and the new name is not "<table>: <row id>"`);
        continue;
      }
      if (!rows(nf).get(table)?.has(id)) {
        say(`${where}: the new name is not a row its file registers`);
        continue;
      }
    }
    moved.set(from, to);
    targets.set(to, line);
  }
  for (const { to, line } of landsOn) if (!moved.has(to)) say(`${LIST_FILES.moves} line ${line}: its target is a baseline case that stays where it is`);

  // 6. The run.
  // The record is a full-tier run that passed: its header names the full tier, and its last line is the pass.
  // These fixed lines avoid common words such as runner: a word that is the user's name is withheld, as in the Linux image.
  const recLines = record.split('\n').map(l => (l.endsWith('\r') ? l.slice(0, -1) : l)).filter(l => l !== '');
  if (recLines.filter(l => l.startsWith('run: ')).length !== 1 || !recLines.some(l => /^run: tier full\b/.test(l))) say('record: it is not one full-tier run (its header names another tier, or none, or two)');
  if (!/^RESULT: full tier, \d+ files, pass$/.test(recLines.at(-1) ?? '')) say('record: its last line is not the full-tier pass');
  const run = parseRecord(record);
  if (run.error) {
    say(`record: ${run.error}`);
    return done({});
  }
  const got = new Map(); // key -> the statuses of the run's cases of that name
  for (const c of run.cases) {
    const k = key(c.file, c.name);
    if (!got.has(k)) got.set(k, []);
    got.get(k).push(c.status);
  }
  // node's junit reporter names the file that called test(). A case reported under a module that is not a test
  // file was registered from there, so the file it belongs to is unknown, and it can't be any case's home.
  const testFiles = new Set();
  for (const c of run.cases) if (!TEST_FILE.test(c.file) && !testFiles.has(c.file)) testFiles.add(c.file), say(`record: cases are reported under ${shownPath(c.file)}, which is not a top-level test file`);
  // A failed case fails the compare, baseline case or new. Its name is shown only when the lists hold it.
  for (const c of run.cases) if (c.status === 'fail') say(`record: a case failed in ${shownPath(c.file)}${asReported.has(key(c.file, c.name)) || targets.has(key(c.file, c.name)) ? `: ${c.name}` : ''}`);

  let unchanged = 0;
  let moves = 0;
  let homed = 0;
  for (const [rk, c] of asReported) {
    const at = moved.get(rk) ?? rk;
    const shown = `${c.file} : ${c.name}`;
    const statuses = got.get(at) ?? [];
    const want = c.statuses.length;
    if (statuses.length < want) {
      const part = want > 1 ? ` (${want - statuses.length} of ${want} cases of this name)` : '';
      say(moved.has(rk) ? `moved, target missing: ${shown} -> ${at.replace('\t', ' : ')}${part}` : `gone: ${shown}${part}`);
    }
    const found = Math.min(want, statuses.length);
    homed += found;
    if (moved.has(rk)) moves += found;
    else unchanged += found;
    const platform = env.get(key(c.file, c.name));
    if (platform) {
      if (run.platform === platform && statuses.includes('skip')) say(`skipped on ${platform}, where it must pass: ${shown}`);
      continue;
    }
    // Each baseline status must be met by a case of the same name and status; a fail is reported above.
    const left = [...statuses];
    for (const s of c.statuses) {
      const i = left.indexOf(s);
      if (i >= 0) left.splice(i, 1);
      else if (left.length && !left.includes('fail')) say(`status ${s} -> ${left[0]}: ${shown}`);
    }
  }
  return done({ unchanged, moved: moves, new: run.cases.length - homed });
}

// ------------------------------------------------------------ the shell

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');

/** The host and user names, read as the runner reads them for its record. */
function localNames() {
  let user = null;
  try {
    user = userInfo().username;
  } catch {
    user = process.env.USERNAME ?? process.env.USER ?? null;
  }
  return [hostname(), user].filter(Boolean);
}

export function main(argv) {
  const say = l => process.stdout.write(`${l}\n`);
  if (argv.length !== 1 || argv[0].startsWith('-')) {
    say('usage: node gate/tests/baseline-compare.mjs <record>');
    say('RESULT: compare refused, usage');
    return 2;
  }
  let record;
  try {
    record = readFileSync(resolve(argv[0]), 'utf8');
  } catch (e) {
    say(`record: not read (${String(e.code ?? 'read failed').replace(/[^A-Za-z0-9_-]/g, '?')})`);
    say('RESULT: compare refused, no record');
    return 2;
  }
  const lists = {};
  for (const [k, f] of Object.entries(LIST_FILES)) {
    try {
      lists[k] = readFileSync(join(REPO, LISTS_DIR, f));
    } catch {
      lists[k] = null;
    }
  }
  const source = file => {
    if (!/^gate\/tests\/[A-Za-z0-9._-]+\.test\.mjs$/.test(file)) return null;
    try {
      return readFileSync(join(REPO, file), 'utf8');
    } catch {
      return null;
    }
  };
  const { ok, lines } = compare({ lists, record, names: localNames(), source });
  for (const l of lines) say(l);
  return ok ? 0 : 1;
}

// Run main when started as a script, comparing real paths as the runner does,
// so a start through a link or a short name still runs it. A pass is exit 0
// with the RESULT line; exit 0 with no RESULT line is not a pass.
const real = p => {
  try {
    return realpathSync.native(p);
  } catch {
    return resolve(p);
  }
};
const self = real(fileURLToPath(import.meta.url));
const invoked = process.argv[1] ? real(process.argv[1]) : '';
if (process.platform === 'win32' ? invoked.toLowerCase() === self.toLowerCase() : invoked === self) process.exitCode = main(process.argv.slice(2));
