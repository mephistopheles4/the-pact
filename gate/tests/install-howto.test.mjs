// Keeps docs/install.md in step with what the install puts in place (#162):
// every key the settings overlay sets, and every agent it installs, is named
// in the how-to in backticks. AGENTS.md's "Keep the how-to in step" rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { realAgents, realOverlay } from './payload.mjs';
import { REPO } from './text.mjs';

/** The names the how-to must hold, from an overlay's JSON text and agent stems. */
export function requiredNames(overlayText, agentStems) {
  const overlay = JSON.parse(overlayText);
  const names = [];
  for (const [key, value] of Object.entries(overlay)) {
    if (key === 'env') names.push(...Object.keys(value));
    else if (key === 'permissions') names.push(...Object.keys(value).map((k) => `permissions.${k}`));
    else names.push(key);
  }
  return [...names, ...agentStems];
}

/** The required names a how-to text leaves out of backticks. */
export function missingFromHowto(howto, names) {
  return names.filter((n) => !howto.includes(`\`${n}\``));
}

function installedAgentStems() {
  const fromClaude = Object.keys(realAgents()).map((p) => p.slice('claude/agents/'.length, -'.md'.length));
  const familiars = readdirSync(join(REPO, 'familiars'))
    .filter((f) => f.endsWith('.md') && !f.endsWith('.contract.md') && !f.endsWith('.practice-test.md'))
    .map((f) => f.slice(0, -'.md'.length));
  return [...fromClaude, ...familiars];
}

test('docs/install.md names every overlay setting and every installed agent', () => {
  const stems = installedAgentStems();
  assert.ok(stems.length >= 10, `expected at least 10 installed agents, found ${stems.length}`);
  const howto = readFileSync(join(REPO, 'docs', 'install.md'), 'utf8');
  assert.deepEqual(missingFromHowto(howto, requiredNames(realOverlay(), stems)), []);
});

test('bad case: a new overlay key, env name or agent the how-to does not name is reported', () => {
  const overlay = JSON.stringify({ env: { NEW_FLAG: '1' }, permissions: { defaultMode: 'auto' }, newKey: true });
  const howto = 'sets `permissions.defaultMode` and lists `old-lens`.';
  assert.deepEqual(missingFromHowto(howto, requiredNames(overlay, ['old-lens', 'new-lens'])), ['NEW_FLAG', 'newKey', 'new-lens']);
});

test('control: a name only in plain text, not in backticks, does not count', () => {
  assert.deepEqual(missingFromHowto('the outputStyle key', ['outputStyle']), ['outputStyle']);
});
