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

/** The clone address the install prompt must name (#153, S12); it changes only when the repo moves. */
export const CLONE_ADDRESS = 'https://github.com/mephistopheles4/the-pact';

/** The install prompt's quoted text: the blockquote under the how-to's "Install by prompt" heading, or null. */
export function installPrompt(howto) {
  const at = howto.indexOf('\n## Install by prompt\n');
  if (at < 0) return null;
  const next = howto.indexOf('\n## ', at + 1);
  const quote = howto.slice(at, next < 0 ? undefined : next).split('\n').filter((l) => l.startsWith('> ')).map((l) => l.slice(2)).join('\n');
  return quote || null;
}

/** Whether a prompt names exactly the clone address, as the one address, and leaves the apply to the person. */
export function promptNamesAddress(prompt) {
  return prompt !== null && prompt.includes(`\`${CLONE_ADDRESS}\`, and no other address`) && prompt.includes('`node gate/install.mjs`') && prompt.includes("I'll run it myself");
}

function installedAgentStems() {
  const fromClaude = Object.keys(realAgents()).map((p) => p.slice('claude/agents/'.length, -'.md'.length));
  const familiars = readdirSync(join(REPO, 'familiars'))
    .filter((f) => f.endsWith('.md') && !f.endsWith('.contract.md'))
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

test("docs/install.md's install prompt names the exact clone address, runs the install script, and leaves the apply to the person", () => {
  const howto = readFileSync(join(REPO, 'docs', 'install.md'), 'utf8');
  assert.ok(promptNamesAddress(installPrompt(howto)), installPrompt(howto) ?? 'no "Install by prompt" section with a quoted prompt');
});

test('bad case: a prompt naming a look-alike address, or a fork, or no prompt at all, is caught', () => {
  const tail = ', and no other address. Run `node gate/install.mjs`. I\'ll run it myself.';
  const at = (address) => `# x\n\n## Install by prompt\n\n> Clone from \`${address}\`${tail}\n`;
  assert.ok(promptNamesAddress(installPrompt(at(CLONE_ADDRESS))), 'control: the real address passes');
  for (const address of [`${CLONE_ADDRESS}-fork`, CLONE_ADDRESS.replace('mephistopheles4', 'mephistophe1es4'), CLONE_ADDRESS.replace('https', 'http')]) {
    assert.ok(!promptNamesAddress(installPrompt(at(address))), address);
  }
  assert.ok(!promptNamesAddress(installPrompt('# x\n\n## Install\n\nnothing\n')));
});
// The apply guard's misses, as #153's S10 names them, stay named in the ADR that holds the guard.
test("ADR 0042 names the apply guard's four misses and supersedes ADR 0020", () => {
  const adr = readFileSync(join(REPO, 'docs', 'adr', '0042-the-apply-guard-asks-on-any-command-naming-the-install.md'), 'utf8');
  for (const miss of ['- (a) a string built at run time', '- (b) the script named without its file name', '- (c) a session that imports the cores', '- (d) the file name in another letter case']) assert.ok(adr.includes(miss), miss);
  assert.match(adr, /^## Supersedes\n\n\[ADR 0020\]/m);
});