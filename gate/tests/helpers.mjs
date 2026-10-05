// Shared fixtures for the gate's tests. Everything is built in a fresh temp
// folder per test; nothing here touches the repo tree or ~/.claude.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GATE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const REPO = resolve(GATE, '..');
export const SEAM_A = join(GATE, 'seam-a.mjs');
export const PINNED = join(GATE, 'grimoire', 'check.mjs');

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

export function runSeamA(root, script = SEAM_A) {
  if (ROUTED.has(root)) routeTree(root);
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  const r = spawnSync(process.execPath, [script, root], { encoding: 'utf8', env });
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
