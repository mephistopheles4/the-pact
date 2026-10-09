import assert from 'node:assert/strict';
// Shared fixtures for the gate's tests. Everything is built in a fresh temp
// folder per test; nothing here touches the repo tree or ~/.claude.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { childEnv, runCore } from './gate-run.mjs';

export const GATE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const REPO = resolve(GATE, '..');
export const SEAM_A = join(GATE, 'seam-a.mjs');
export const RENDER = join(GATE, 'render.mjs');
export const PINNED = join(GATE, 'grimoire', 'check.mjs');

// ------------------------------------------------------------ a gate module's own text (#155)

/**
 * The files of gate module `name` (`render`, `seam-a`, `project` or `review`)
 * in `gateDir`: `<name>.mjs`, and `<name>-core.mjs` when it exists. A test that
 * reads or plants a module's text looks in both, so moving code between the
 * two can't leave it reading, or planting into, a file that no longer holds it.
 */
export function moduleFiles(gateDir, name) {
  const files = [join(gateDir, `${name}.mjs`)];
  const core = join(gateDir, `${name}-core.mjs`);
  if (existsSync(core)) files.push(core);
  return files;
}

/** The one file of module `name` that holds `text`; fails unless `text` occurs exactly once across the module's files. */
export function moduleFileHolding(gateDir, name, text) {
  const hits = moduleFiles(gateDir, name).flatMap(p => Array(readFileSync(p, 'utf8').split(text).length - 1).fill(p));
  assert.equal(hits.length, 1, `expected exactly one ${JSON.stringify(text)} in gate module ${name}, found ${hits.length}`);
  return hits[0];
}

/** The one match of `re` across module `name`'s files; fails unless there is exactly one. */
export function moduleMatch(gateDir, name, re) {
  const all = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  const hits = moduleFiles(gateDir, name).flatMap(p => [...readFileSync(p, 'utf8').matchAll(all)]);
  assert.equal(hits.length, 1, `expected exactly one match of ${re} in gate module ${name}, found ${hits.length}`);
  return hits[0];
}

/** Plant into module `name` in `gateDir`: replace its one `from` with `to`. Returns the planted file. */
export function plantModule(gateDir, name, from, to) {
  const p = moduleFileHolding(gateDir, name, from);
  writeFileSync(p, readFileSync(p, 'utf8').replace(from, () => to));
  return p;
}

/** A copy of every file in the gate folder outside its tests, under `dest`, as the install stages it. */
export function copyGate(dest) {
  const tests = join(GATE, 'tests');
  cpSync(GATE, dest, { recursive: true, filter: src => src !== tests });
  return dest;
}

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

export function tempDir(t, prefix = 'pact-test-') {
  const d = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
}

/** Write { 'rel/path': text } under root. */
export function writeTree(root, files) {
  for (const [rel, text] of Object.entries(files)) {
    const p = join(root, ...rel.split('/'));
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text);
  }
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

/** Today's payload, copied from the repo, as the stage holds it. */
export function realPayload(root) {
  cpSync(join(REPO, 'claude'), join(root, 'claude'), { recursive: true });
  cpSync(join(REPO, 'AGENTS.md'), join(root, 'AGENTS.md'));
  mkdirSync(join(root, 'cross'), { recursive: true });
  cpSync(join(REPO, 'cross', 'cross.mjs'), join(root, 'cross', 'cross.mjs'));
  cpSync(join(REPO, 'familiars'), join(root, 'familiars'), { recursive: true });
}

// The pact's own agents, from both sources, which its real text must route.
// The fixture router never adds them, so it can't hide a real unrouted agent.
const REAL_AGENTS = new Set(
  [
    ...readdirSync(join(REPO, 'claude', 'agents')),
    ...readdirSync(join(REPO, 'familiars')).filter(f => !f.endsWith('.contract.md') && !f.endsWith('.practice-test.md')),
  ]
    .filter(f => f.endsWith('.md'))
    .map(f => f.slice(0, -3)),
);
export const ROLE_LEAD = '**Lookups and searches.**';
const TEST_ROUTE_RE = / Test agents: [^\n]*$/;

/**
 * Route a fixture's test agents: add every agent stem in the tree that is not
 * one of the pact's own to the fixture CLAUDE.md's "Lookups and searches."
 * line, so a test about another rule isn't failed by routing. Idempotent.
 */
export function routeTree(root) {
  const md = join(root, 'claude', 'CLAUDE.md');
  if (!existsSync(md)) return;
  const stems = [];
  const agentsDir = join(root, 'claude', 'agents');
  if (existsSync(agentsDir)) for (const f of readdirSync(agentsDir)) if (f.endsWith('.md')) stems.push(f.slice(0, -3));
  const famDir = join(root, 'familiars');
  if (existsSync(famDir)) {
    for (const f of readdirSync(famDir)) {
      if (f.endsWith('.md') && !f.endsWith('.contract.md') && !f.endsWith('.practice-test.md')) stems.push(f.slice(0, -3));
    }
  }
  const extra = [...new Set(stems)].filter(s => !REAL_AGENTS.has(s)).sort();
  // A fixture that isn't valid UTF-8 is left byte for byte, never repaired.
  let before;
  try {
    before = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(readFileSync(md));
  } catch {
    return;
  }
  const lines = before.split('\n');
  const i = lines.findIndex(l => l.startsWith(ROLE_LEAD));
  if (i < 0) return;
  lines[i] = lines[i].replace(TEST_ROUTE_RE, '');
  if (extra.length) lines[i] += ` Test agents: ${extra.map(s => `\`${s}\``).join(', ')}.`;
  const after = lines.join('\n');
  if (after !== before) writeFileSync(md, after);
}

/** Today's settings overlay, as the repo holds it. */
export function realOverlay() {
  return readFileSync(join(REPO, 'claude', 'settings.overlay.json'), 'utf8');
}

// Stages whose test agents runSeamA routes before each run.
const ROUTED = new Set();

/** The pact's own agent files, as { 'claude/agents/<file>': text }. */
export function realAgents() {
  const out = {};
  for (const f of readdirSync(join(REPO, 'claude', 'agents')).sort()) {
    if (f.endsWith('.md')) out[`claude/agents/${f}`] = read(join(REPO, 'claude', 'agents', f));
  }
  return out;
}

/**
 * A stage built on the pact's real text (CLAUDE.md, AGENTS.md and every agent
 * it names, so the roster check sees each named reviewer installed), today's
 * overlay, the cross script, and the given files. Unless `route` is false,
 * runSeamA routes the stage's test agents first.
 */
export function stage(t, files = {}, { route = true } = {}) {
  const root = tempDir(t);
  writeTree(root, {
    'claude/CLAUDE.md': read(join(REPO, 'claude', 'CLAUDE.md')),
    'AGENTS.md': read(join(REPO, 'AGENTS.md')),
    ...realAgents(),
    'claude/settings.overlay.json': realOverlay(),
    'cross/cross.mjs': read(join(REPO, 'cross', 'cross.mjs')),
    'familiars/.gitkeep': '',
    ...files,
  });
  if (route) ROUTED.add(root);
  return root;
}

export function contractText(extraKeys = 'tools, model, effort') {
  return `# Contract: test\n\nVersion: 0.6.0\nTarget: claude\nExtra keys: ${extraKeys}\n`;
}

/** Write a familiar and its contract under root/familiars, then seal it with the pinned check (tests only). */
export function sealedFamiliar(root, name, { lines, contract, body } = {}) {
  const fm = lines ?? [`name: ${name}`, 'description: A test familiar.', READ_ONLY];
  writeTree(root, {
    [`familiars/${name}.md`]: agent(fm, body),
    [`familiars/${name}.contract.md`]: contract ?? contractText(),
  });
  const r = spawnSync(process.execPath, [PINNED, '--seal', join(root, 'familiars', `${name}.md`)], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`sealing ${name} failed:\n${r.stdout}${r.stderr}`);
}

/**
 * Run the real renderer on the stage's rules file and put its output in its
 * place, as the install script does before seam A. With no `claudeHome`, it
 * renders against an empty Claude home folder, so no configuration applies. A
 * stage with no rules file, or one that is not a regular file, is left as it
 * is for seam A to judge. Throws when the renderer refuses, since the install
 * would stop there.
 */
export function renderStage(root, claudeHome) {
  const md = join(root, 'claude', 'CLAUDE.md');
  let st;
  try {
    st = lstatSync(md);
  } catch {
    return;
  }
  if (!st.isFile()) return;
  const out = mkdtempSync(join(tmpdir(), 'pact-render-'));
  const empty = claudeHome ? null : mkdtempSync(join(tmpdir(), 'pact-render-home-'));
  try {
    // In-process through the renderer's core (#140, T10); parity.test.mjs proves it prints what the wrapper does.
    const r = runCore('render', [md, out, claudeHome ?? empty]);
    if (r.code !== 0 || lastLine(r.stdout) !== 'RESULT: pass') throw new Error(`the renderer refused the stage:\n${r.out}`);
    writeFileSync(md, readFileSync(join(out, 'CLAUDE.md')));
  } finally {
    rmSync(out, { recursive: true, force: true });
    if (empty) rmSync(empty, { recursive: true, force: true });
  }
}

/**
 * Seam A on a stage, after routing its test agents (unless `route` was false)
 * and rendering its rules file. The real seam A runs in-process through its
 * core (#140, T10); a `script` other than the real one is a planted copy, so
 * it runs as a child (childSeamA).
 */
export function runSeamA(root, script = SEAM_A) {
  if (script !== SEAM_A) return childSeamA(root, script);
  if (ROUTED.has(root)) routeTree(root);
  renderStage(root);
  const { code, stdout, stderr, out } = runCore('seam-a', [root]);
  return { code, stdout, stderr, out };
}

/**
 * Seam A's wrapper `script` on a stage, as a child, routed and rendered as
 * runSeamA does: for a planted copy, and for the wrapper tests that keep a
 * child run of the real one (#155).
 */
export function childSeamA(root, script = SEAM_A) {
  if (ROUTED.has(root)) routeTree(root);
  renderStage(root);
  const r = spawnSync(process.execPath, [script, root], { encoding: 'utf8', env: childEnv() });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, out: r.stdout + r.stderr };
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

export function read(p) {
  return readFileSync(p, 'utf8');
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
