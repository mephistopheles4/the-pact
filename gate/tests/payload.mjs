// Test helpers that read the repo's payload (#151): the pact's rules file,
// AGENTS.md, its agents and familiars, the settings overlay and the cross
// script. A test that imports this file reads every agent file, so the runner
// picks it for any change to one. The agent list is read on first use, never
// at import.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { routeBeforeRun } from './gate-run.mjs';
import { REPO, ROLE_LEAD } from './text.mjs';
import { read, tempDir, writeTree } from './tree.mjs';

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
// Read on the first route, never at import.
let realAgentStems = null;
function realAgentSet() {
  realAgentStems ??= new Set(
    [
      ...readdirSync(join(REPO, 'claude', 'agents')),
      ...readdirSync(join(REPO, 'familiars')).filter(f => !f.endsWith('.contract.md')),
    ]
      .filter(f => f.endsWith('.md'))
      .map(f => f.slice(0, -3)),
  );
  return realAgentStems;
}
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
      if (f.endsWith('.md') && !f.endsWith('.contract.md')) stems.push(f.slice(0, -3));
    }
  }
  const real = realAgentSet();
  const extra = [...new Set(stems)].filter(s => !real.has(s)).sort();
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
  if (route) routeBeforeRun(root, routeTree);
  return root;
}
