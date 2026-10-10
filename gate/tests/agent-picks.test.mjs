// #151's pin (#140, T7): a one-agent-file change picks the install smoke set
// plus only the test files that read agent files. The helpers are split by
// what they touch, so a test that imports only helpers that never read the
// payload is not tied to the agents; the runner's rules (S5) are unchanged.
// The expected lists come from the audit on #151, read from each file's
// source, not from the pick: a file added later that reads agents, or one that
// stops, changes them here on purpose.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { COPY_DIRS, COPY_FILES } from './copy-list.mjs';
import { pick } from './run.mjs';
import { GATE } from './text.mjs';

const TESTS = join(GATE, 'tests');
const AGENT = 'claude/agents/scout.md';

/** The install-tier files that read the repo's agent files, or that the runner's text rule ties to them (#151's audit). */
const INSTALL_PICKS = Object.freeze([
  'agent-settings-install.test.mjs', // reads integrity-lens.md from the repo and the copy
  'install-edits.test.mjs', // lists the copy's agents for move 2
  'install-node.test.mjs', // compares the Node install's agents with the copy's, and names scout's paths (#166)
  'install-project.test.mjs', // names the live folder's agents in its own text
  'install-smoke.test.mjs', // the smoke set; compares every installed agent
  'install.test.mjs', // plants and routes agents, and lists the copy's
  'settings-install.test.mjs', // settings-rules.mjs reads the overlay through payload.mjs
]);

/** The install-tier files that reach the agents only through makeRepo's copy, which the smoke set covers (S5 rule 4). */
const INSTALL_NOT_PICKED = Object.freeze(['builder-install.test.mjs', 'config-install.test.mjs', 'cross-script-install.test.mjs', 'install-node-project.test.mjs']);

/** The fast-tier files that read no agent file (#151's audit). */
const FAST_NOT_PICKED = Object.freeze([
  'baseline-compare.test.mjs',
  'contained.test.mjs',
  'cores.test.mjs',
  'cross-checks.test.mjs',
  'cross-join.test.mjs',
  'cross-mutation.test.mjs',
  'cross-page.test.mjs',
  'cross-views.test.mjs',
  'docs-index.test.mjs',
  'fault-fixtures.test.mjs',
  'gate-run.test.mjs',
  'helper-imports.test.mjs',
  'no-skill-names.test.mjs',
  'pact-call.test.mjs',
  'paths.test.mjs',
  'project-home.test.mjs',
  'purity-guard.test.mjs',
  'render-project.test.mjs',
  'review.test.mjs',
  'run-guards.test.mjs',
  'shared.test.mjs',
  'tables.test.mjs',
]);

/** The helpers that read the payload, so a test that reaches one reads the agents. */
const AGENT_READERS = Object.freeze(['payload.mjs', 'settings-rules.mjs']);

function sourcesOf(dir, rel = '') {
  const out = new Map();
  for (const e of readdirSync(join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) for (const [k, v] of sourcesOf(dir, r)) out.set(k, v);
    else if (e.isFile() && /\.(?:mjs|cjs|js)$/.test(e.name)) out.set(r, readFileSync(join(dir, r), 'utf8'));
  }
  return out;
}

function entriesOf(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter(e => e.name.endsWith('.test.mjs'))
    .map(e => ({ name: e.name, file: e.isFile() }));
}

/** The changed tier's picks, without the fast tier beside them, for `changed`, over `sources`: Map(file, reason). */
function picks(sources, entries, changed = [AGENT]) {
  const r = pick({ tier: 'changed', entries, sources, copyList: { dirs: COPY_DIRS, files: COPY_FILES }, changed, withFast: false });
  assert.deepEqual(r.refused, []);
  return new Map(r.files.map(f => [f.file, f.reason]));
}

/** The install tier, as the runner reads it: the files the full tier gives an install reason. */
function installTier(sources, entries) {
  const r = pick({ tier: 'full', entries, sources, copyList: { dirs: COPY_DIRS, files: COPY_FILES } });
  return r.files.filter(f => f.reason.startsWith('install tier')).map(f => f.file);
}

test('#151: a one-agent-file change picks the smoke set plus only the install files that read agent files', () => {
  const sources = sourcesOf(TESTS);
  const entries = entriesOf(TESTS);
  const p = picks(sources, entries);
  const install = installTier(sources, entries);
  assert.deepEqual([...INSTALL_PICKS, ...INSTALL_NOT_PICKED].sort(), [...install].sort(), 'the audit covers every install-tier file');
  assert.deepEqual(install.filter(f => p.has(f)).sort(), [...INSTALL_PICKS]);
  assert.match(p.get('install-smoke.test.mjs'), /install smoke set: payload claude\/agents\/scout\.md/);
  for (const f of INSTALL_NOT_PICKED) assert.ok(!p.has(f), `${f}: ${p.get(f)}`);
});

test('#151: no fast-tier file that reads no agent file is picked, and every pick is tied to the agents by its own text or a payload reader', () => {
  const sources = sourcesOf(TESTS);
  const p = picks(sources, entriesOf(TESTS));
  for (const f of FAST_NOT_PICKED) {
    assert.ok(sources.has(f), `${f} is not a test file any more; update #151's audit`);
    assert.ok(!p.has(f), `${f}: ${p.get(f)}`);
  }
  for (const [f, why] of p) {
    const via = /^names \S+ in (\S+?)(?:;|$)/.exec(why)?.[1];
    if (via) assert.ok(AGENT_READERS.includes(via), `${f} is picked through ${via}, a helper that should not read the agents: ${why}`);
  }
});

// Planted test files, in a sources map of their own beside the real helpers,
// so the pick is seen to follow what a test imports.
test('#151: a test that imports only helpers that touch no payload is not picked; one that imports payload.mjs is', () => {
  const sources = sourcesOf(TESTS);
  const touchNothing = "import { lastLine } from './text.mjs';\nimport { tempDir } from './tree.mjs';\nimport { plantModule } from './gate-files.mjs';\nimport { runSeamA } from './gate-run.mjs';\n";
  sources.set('planted-plain.test.mjs', touchNothing);
  sources.set('planted-payload.test.mjs', `${touchNothing}import { stage } from './payload.mjs';\n`);
  const entries = [...entriesOf(TESTS), { name: 'planted-plain.test.mjs', file: true }, { name: 'planted-payload.test.mjs', file: true }];
  const p = picks(sources, entries);
  assert.ok(!p.has('planted-plain.test.mjs'), p.get('planted-plain.test.mjs'));
  assert.equal(p.get('planted-payload.test.mjs'), 'names claude/agents/scout.md in payload.mjs');
});

test('#151: control: a harness that imports the payload again ties every install file to the agents', () => {
  const sources = sourcesOf(TESTS);
  sources.set('install-harness.mjs', `import { routeTree } from './payload.mjs';\n${sources.get('install-harness.mjs')}`);
  const entries = entriesOf(TESTS);
  const p = picks(sources, entries);
  for (const f of INSTALL_NOT_PICKED) assert.equal(p.get(f), 'names claude/agents/scout.md in payload.mjs', f);
});
