// Test helpers that read the repo's payload (#151): the pact's rules file,
// AGENTS.md, its agents and familiars, and the settings overlay. A test that imports this file reads every agent file, so the runner
// picks it for any change to one. The agent list is read on first use, never
// at import.
import { cpSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './text.mjs';
import { read, tempDir, writeTree } from './tree.mjs';

/** Today's payload, copied from the repo, as the stage holds it. */
export function realPayload(root) {
  cpSync(join(REPO, 'claude'), join(root, 'claude'), { recursive: true });
  cpSync(join(REPO, 'AGENTS.md'), join(root, 'AGENTS.md'));
  cpSync(join(REPO, 'familiars'), join(root, 'familiars'), { recursive: true });
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
 * A stage built on the pact's real text (CLAUDE.md, the review file, AGENTS.md
 * and every agent), today's overlay, and the given files.
 */
export function stage(t, files = {}) {
  const root = tempDir(t);
  writeTree(root, {
    'claude/CLAUDE.md': read(join(REPO, 'claude', 'CLAUDE.md')),
    'claude/review.md': read(join(REPO, 'claude', 'review.md')),
    'AGENTS.md': read(join(REPO, 'AGENTS.md')),
    ...realAgents(),
    'claude/settings.overlay.json': realOverlay(),
    'familiars/.gitkeep': '',
    ...files,
  });
  return root;
}
