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
export const PINNED = join(GATE, 'grimoire', 'check.mjs');

// The open marks the pact source carries (#53), written out here rather than
// read from gate/render.mjs, so the tests' expected render is their own.
export const OPEN_MARKS = Object.freeze(['config-notice', 'usage-pause', 'move-1', 'move-2', 'move-3', 'move-4-extra']);
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

/** The line of the pact's rules file that routes lookups, which the fixture router extends. */
export const ROLE_LEAD = '**Lookups and searches.**';

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
