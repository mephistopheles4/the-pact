// Test helpers that touch nothing (#151): the gate's paths, built from this
// file's own location, and text built or read in memory. Importing this file,
// or calling anything in it, reads no file and starts no process.
import assert from 'node:assert/strict';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GATE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const REPO = resolve(GATE, '..');
export const SEAM_A = join(GATE, 'seam-a.mjs');
export const RENDER = join(GATE, 'render.mjs');

// The open marks the pact source carries (#53), written out here rather than
// read from gate/render.mjs, so the tests' expected render is their own.
export const OPEN_MARKS = Object.freeze(['config-notice', 'usage-pause', 'usage-pause-session', 'tool-poster', 'moves', 'tiers', 'sensitive', 'workflow', 'lenses', 'qualities', 'cost-limits']);
const OPEN_MARK_LINE_RE = new RegExp(`^ *<!-- pact:(?:begin|end) (?:${OPEN_MARKS.join('|')}) -->$`);

/** The no-configuration render, computed independently: `text` with its open-mark lines removed. */
export function withoutOpenMarks(text) {
  return text
    .split('\n')
    .filter(l => !OPEN_MARK_LINE_RE.test(l))
    .join('\n');
}

/** An agent file from frontmatter lines and a body. */
export function agent(lines, body = 'Body.\n') {
  return `---\n${lines.join('\n')}\n---\n\n${body}`;
}

export const READ_ONLY = 'tools: [Read, Glob, Grep]';

/** A minimal valid unmigrated agent named `name`. */
export function plainAgent(name, extra = [], tools = READ_ONLY) {
  return agent([`name: ${name}`, 'description: A test agent.', ...(tools === null ? [] : [tools]), ...extra]);
}

export function contractText(extraKeys = 'tools, model, effort') {
  return `# Contract: test\n\nVersion: 0.6.0\nTarget: claude\nExtra keys: ${extraKeys}\n`;
}

/** The FAIL rule names in seam A's output. */
export function failRules(stdout) {
  return stdout
    .split('\n')
    .filter(l => l.startsWith('FAIL '))
    .map(l => l.slice(5).split(':')[0]);
}

export function lastLine(stdout) {
  const ls = stdout.split('\n').filter(l => l !== '');
  return ls[ls.length - 1];
}

// ------------------------------------------------------------ bad cases as rows (#140, plain loops since #272)

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

/** A base input's result passes: exit 0, `RESULT: pass` last, and no FAIL line. */
export function assertPasses(r) {
  assert.equal(r.code, 0, r.out);
  assert.equal(r.last, 'RESULT: pass', r.out);
  assert.deepEqual(r.fails, [], r.out);
}

const sortedSet = a => [...new Set(a)].sort();

/**
 * A row's result fails as it should: exit 1, `RESULT: fail` last, the set of
 * FAIL rule ids equal to `ids` (equal, not includes), and the output matching
 * `says` when it is given.
 */
export function assertFails(r, ids, says) {
  assert.equal(r.code, 1, r.out);
  assert.equal(r.last, 'RESULT: fail', r.out);
  assert.deepEqual(sortedSet(r.fails), sortedSet(ids), r.out);
  if (says) assert.match(r.out, says, r.out);
}

// ------------------------------------------------------------ a module's source as tokens

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

// ------------------------------------------------------------ edits to open parts (#94), built independently of the renderer

/** `src` with the lines between `mark`'s two mark lines replaced by fn(lines, indent). */
export function editPart(src, mark, fn) {
  const re = new RegExp(`^( *)<!-- pact:begin ${mark} -->\\n((?:.*\\n)*?)\\1<!-- pact:end ${mark} -->\\n`, 'm');
  const m = re.exec(src);
  assert.ok(m, `no ${mark} part in the source`);
  const [, indent, body] = m;
  const now = body === '' ? [] : body.slice(0, -1).split('\n');
  const next = fn(now, indent);
  const part = `${indent}<!-- pact:begin ${mark} -->\n${next.map(l => `${l}\n`).join('')}${indent}<!-- pact:end ${mark} -->\n`;
  return src.slice(0, m.index) + part + src.slice(m.index + m[0].length);
}

/** Apply a unified diff to `text`, checking each hunk's counts and context. Throws on any mismatch. */
export function applyDiff(text, diff) {
  const src = text.split('\n');
  const lines = diff.split('\n');
  assert.equal(lines[0], '--- default/CLAUDE.md');
  assert.equal(lines[1], '+++ configured/CLAUDE.md');
  assert.equal(lines[lines.length - 1], '', 'the diff ends with a line feed');
  const out = [];
  let at = 0;
  let i = 2;
  while (i < lines.length - 1) {
    const h = /^@@ -(\d+),(\d+) \+(\d+),(\d+) @@$/.exec(lines[i]);
    assert.ok(h, `not a hunk header: ${lines[i]}`);
    const [oldStart, oldLen, , newLen] = h.slice(1).map(Number);
    const from = oldLen ? oldStart - 1 : oldStart;
    assert.ok(from >= at, 'hunks out of order');
    out.push(...src.slice(at, from));
    at = from;
    let o = 0;
    let n = 0;
    for (i += 1; i < lines.length - 1 && !lines[i].startsWith('@@'); i += 1) {
      const [sign, rest] = [lines[i][0], lines[i].slice(1)];
      if (sign === ' ' || sign === '-') {
        assert.equal(src[at], rest, `context or removed line ${at + 1} does not match`);
        at += 1;
        o += 1;
      }
      if (sign === ' ' || sign === '+') {
        out.push(rest);
        n += 1;
      }
      assert.ok(' -+'.includes(sign), `a diff line with no sign: ${lines[i]}`);
    }
    assert.deepEqual([o, n], [oldLen, newLen], 'a hunk count does not match its lines');
  }
  out.push(...src.slice(at));
  return out.join('\n');
}

/**
 * Skip a test whose environment is wrong, except on Linux under CI (#311): the
 * gate job is where the Linux-only cases run, and a skip counts as a pass, so
 * there the wrong environment fails the test instead.
 */
export function skipUnlessLinuxCi(t, reason, { platform = process.platform, ci = process.env.CI } = {}) {
  if (platform === 'linux' && ci) assert.fail(`Linux CI must run this case, but: ${reason}`);
  t.skip(reason);
}
