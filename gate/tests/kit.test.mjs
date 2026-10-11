// The builder kit in the gate (#203, T3): seam A's kit checks, its copy set,
// the unrendered rules source's pact-text checks, and the kit's lists held to
// one another. Each bad case is a table row that must fail with its exact
// rule ids. Nothing here installs; kit-install.test.mjs runs the install.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { BUILDER_KIT as INSTALL_KIT, RULES_SOURCE_REL, isStaged } from '../install-core.mjs';
import { SOURCE_OPEN_MARKS } from '../pact-text.mjs';
import { BUILDER_KIT, KIT_BUILTINS, RULES_SOURCE, inBuilderKit } from '../shared.mjs';
import { COPY_FILES } from './copy-list.mjs';
import { renderStage, runCore, runSeamA } from './gate-run.mjs';
import { stage } from './payload.mjs';
import { moduleResult, table } from './tables.mjs';
import { REPO } from './text.mjs';

const read = rel => readFileSync(join(REPO, ...rel.split('/')), 'utf8');
const BUILD = 'builder/build.mjs';
const SHARED = 'gate/shared.mjs';

/** The kit's files as a stage holds them after the install's source copy, and the command that turns the kit on. */
function kitTree() {
  const out = {};
  for (const rel of BUILDER_KIT) out[rel] = read(rel === RULES_SOURCE ? 'claude/CLAUDE.md' : rel);
  out['familiars/scout.contract.md'] = read('familiars/scout.contract.md');
  out['claude/commands/scriptorium.md'] = read('claude/commands/scriptorium.md');
  return out;
}
/** A plant that replaces `from` with `to` in the file `key`. */
const rep = (key, from, to) => t => {
  assert.ok(t[key].includes(from), `${key} no longer holds the planted text`);
  return { ...t, [key]: t[key].replace(from, to) };
};
/** A plant that adds a line to the end of the file `key`. */
const line = (key, text) => t => ({ ...t, [key]: `${t[key]}${text}\n` });
/** A plant that takes the file `key` out of the stage. */
const drop = key => t => {
  const { [key]: _, ...rest } = t;
  return rest;
};

// ------------------------------------------------------------ seam A: the kit (S6)

for (const c of table('builder kit', {
  module: 'gate/seam-a.mjs',
  base: kitTree,
  run: (tree, t) => {
    const r = runSeamA(stage(t, tree), undefined, { commands: 'scriptorium' });
    return moduleResult(r.code, r.stdout, r.stderr);
  },
  rows: [
    { id: 'bare-package', plant: line(BUILD, "import left from 'left-pad';"), fails: ['kit-imports'], why: 'a bare package name' },
    { id: 'network-builtin', plant: line(BUILD, "import http from 'node:http';"), fails: ['kit-imports'], why: 'a built-in off the list, such as a network module' },
    { id: 'builtin-without-prefix', plant: line(BUILD, "import fs from 'fs';"), fails: ['kit-imports'], why: 'a built-in only by its node: name' },
    { id: 'require', plant: line(BUILD, "const fs = require('node:fs');"), fails: ['kit-imports'], why: 'require is refused anywhere' },
    { id: 'create-require', plant: line(BUILD, 'const r = createRequire(import.meta.url);'), fails: ['kit-imports'], why: 'createRequire too' },
    { id: 'dynamic-import', plant: line(BUILD, "const m = await import('node:fs');"), fails: ['kit-imports'], why: 'a dynamic import, even of a listed built-in' },
    { id: 'side-effect-import', plant: line(BUILD, "import 'node:fs';"), fails: ['kit-imports'], why: 'only the whole-line forms' },
    { id: 'reexport', plant: line(BUILD, "export { x } from 'left-pad';"), fails: ['kit-imports'], why: 'a re-export loads its module too' },
    { id: 'split-import', plant: line(BUILD, "import {\n  x,\n} from 'left-pad';"), fails: ['kit-imports'], why: 'an import split over lines fails on each part' },
    { id: 'relative-off-the-list', plant: line(BUILD, "import { check } from '../gate/seam-a-core.mjs';"), fails: ['kit-imports'], why: 'a relative path to a module the kit does not hold' },
    { id: 'relative-escaping', plant: line(BUILD, "import { x } from '../../x.mjs';"), fails: ['kit-imports'], why: 'a path out of the kit' },
    { id: 'relative-not-module', plant: line(BUILD, "import x from './scriptorium.html';"), fails: ['kit-imports'], why: 'a kit file that is not a module' },
    { id: 'in-a-gate-module', plant: line(SHARED, "import http from 'node:http';"), fails: ['kit-imports'], why: 'every kit module, the gate ones included' },
    { id: 'kit-file-missing', plant: drop('builder/scriptorium.html'), fails: ['kit-missing'], why: 'scriptorium is on, so every kit file must be staged' },
    { id: 'example-block-missing', plant: drop('examples/pact-config/blocks/move-4-own-agent.md'), fails: ['kit-missing'], why: "the example's block files too" },
    { id: 'source-missing', plant: drop(RULES_SOURCE), fails: ['kit-missing'], why: 'the rules source the install copies' },
    { id: 'refused-character', plant: line('examples/pact-config/builder.json', '\u202e'), fails: ['invisible'], why: 'every kit text file is scanned' },
    { id: 'source-unknown-mark', plant: rep(RULES_SOURCE, '<!-- pact:begin move-1 -->', '<!-- pact:begin move-9 -->'), fails: ['marker'], why: 'only the open marks the renderer knows' },
    { id: 'source-clause-changed', plant: rep(RULES_SOURCE, 'Auth, secrets, crypto, input validation and data migrations are always thorough', 'Auth and secrets are always thorough'), fails: ['required-clause', 'shared-block'], why: 'the gated clauses word for word, in the source too' },
    { id: 'source-move-gone', plant: rep(RULES_SOURCE, '4. **I stay the owner.**', '4) **I stay the owner.**'), fails: ['moves', 'anchor', 'routing'], why: 'the moves, as the rules file is held to them' },
  ],
})) test(c.name, c.fn);

test('seam A lists the kit under pact/builder/ only when scriptorium is on, every agent in both places, and checks the kit either way', t => {
  const root = stage(t, kitTree());
  const on = runSeamA(root, undefined, { commands: 'scriptorium' });
  assert.equal(on.code, 0, on.out);
  const pairs = [...on.stdout.matchAll(/^INSTALL [0-9a-f]{64} (\S+) (\S+)$/gm)].map(m => [m[1], m[2]]);
  for (const rel of BUILDER_KIT) assert.ok(pairs.some(([s, d]) => s === rel && d === `pact/builder/${rel}`), `${rel} is not in the kit`);
  for (const f of readdirSync(join(REPO, 'claude', 'agents'))) {
    assert.ok(pairs.some(([s, d]) => s === `claude/agents/${f}` && d === `pact/builder/claude/agents/${f}`), `${f} is not in the kit`);
    assert.ok(pairs.some(([s, d]) => s === `claude/agents/${f}` && d === `agents/${f}`), `${f} is not installed as an agent`);
  }
  assert.ok(!pairs.some(([, d]) => /(^|\/)CLAUDE\.md$/.test(d) && d !== 'CLAUDE.md'), 'the kit holds a CLAUDE.md');
  assert.ok(!pairs.some(([s, d]) => s === RULES_SOURCE && !d.startsWith('pact/builder/')), 'the rules source installs outside the kit');
  const off = runSeamA(root, undefined, { commands: 'none' });
  assert.equal(off.code, 0, off.out);
  assert.doesNotMatch(off.stdout, /^INSTALL \S+ \S+ pact\/builder\//m, off.out);
  const bad = kitTree();
  bad[BUILD] += "import http from 'node:http';\n";
  const badOff = runSeamA(stage(t, bad), undefined, { commands: 'none' });
  assert.equal(badOff.code, 1, 'a kit module is checked even with scriptorium off');
  assert.match(badOff.stdout, /^FAIL kit-imports: builder\/build\.mjs line \d+: /m);
});

test('control: with scriptorium off, a stage without the kit passes, as the cloud copy stages it', t => {
  const r = runSeamA(stage(t, {}), undefined, { commands: 'none' });
  assert.equal(r.code, 0, r.out);
});

test('the kit import rule reads past the word import inside a string, and past comments, in the real modules', t => {
  const tree = kitTree();
  tree[BUILD] += "const note = 'an import from node:http is refused';\n// import http from 'node:http';\n/*\n import http from 'node:http';\n*/\n";
  const r = runSeamA(stage(t, tree), undefined, { commands: 'scriptorium' });
  assert.equal(r.code, 0, r.out);
});

test('the open marks are allowed in the rules source only: the same unrendered bytes as claude/CLAUDE.md fail', t => {
  const root = stage(t, { 'claude/CLAUDE.md': read('claude/CLAUDE.md') }, { route: false });
  const r = runCore('seam-a', [root, '--commands', 'none']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.stdout, /^FAIL marker: claude\/CLAUDE\.md line \d+: an unknown block name$/m);
  renderStage(root);
  const rendered = runCore('seam-a', [root, '--commands', 'none']);
  assert.equal(rendered.code, 0, rendered.out);
});

// ------------------------------------------------------------ the lists, held to one another

test('the kit list is one list: the install keeps the same paths, frozen, and both name the same rules source', () => {
  assert.deepEqual([...INSTALL_KIT], [...BUILDER_KIT]);
  assert.ok(Object.isFrozen(BUILDER_KIT) && Object.isFrozen(INSTALL_KIT) && Object.isFrozen(KIT_BUILTINS));
  assert.equal(RULES_SOURCE, RULES_SOURCE_REL);
  assert.equal(RULES_SOURCE, 'claude/rules.source.md');
  assert.ok(!BUILDER_KIT.some(rel => /(^|\/)CLAUDE\.md$/.test(rel)), 'the kit names a CLAUDE.md');
  assert.ok(inBuilderKit('claude/agents/x.md') && !inBuilderKit('claude/agents/x/y.md') && !inBuilderKit('claude/CLAUDE.md'));
});

test('every kit file outside claude/, familiars/ and gate/ is staged by exact path, by the bootstrap, the core and the harness', () => {
  const boot = read('gate/install.mjs');
  for (const rel of BUILDER_KIT.filter(r => /^(builder|examples)\//.test(r))) {
    assert.ok(isStaged(rel), `${rel} is not staged`);
    assert.ok(boot.includes(`'${rel}'`) || boot.includes(`'${rel.split('/').at(-1).slice(0, -3)}'`), `the bootstrap does not stage ${rel}`);
    assert.ok(COPY_FILES.includes(rel), `the install harness does not copy ${rel}`);
  }
});

test("the kit holds every example block file, so /scriptorium can start from the example (q2's decision)", () => {
  const blocks = readdirSync(join(REPO, 'examples', 'pact-config', 'blocks')).filter(f => f.endsWith('.md')).map(f => `examples/pact-config/blocks/${f}`);
  assert.deepEqual(BUILDER_KIT.filter(r => r.startsWith('examples/pact-config/blocks/')).sort(), blocks.sort());
  const named = [...read('examples/pact-config/builder.json').matchAll(/"file": "([^"]+)"/g)].map(m => `examples/pact-config/${m[1]}`);
  for (const rel of named) assert.ok(BUILDER_KIT.includes(rel), `the example names ${rel}, which the kit does not hold`);
});

test("the kit's built-in list is exactly what its modules import, and its relative imports reach kit files", () => {
  const used = new Set();
  for (const rel of BUILDER_KIT.filter(r => r.endsWith('.mjs'))) {
    for (const m of read(rel).matchAll(/^import .* from '([^']+)';$/gm)) {
      if (m[1].startsWith('node:')) used.add(m[1]);
      else assert.ok(BUILDER_KIT.includes(join(rel, '..', m[1]).replaceAll('\\', '/')), `${rel} imports ${m[1]}, which is not in the kit`);
    }
  }
  assert.deepEqual([...used].sort(), [...KIT_BUILTINS].sort());
});

test("the rules source's open marks are the renderer's", () => {
  const m = /const OPEN_MARKS = Object\.freeze\(\[([^\]]*)\]\)/.exec(read('gate/render-core.mjs'));
  assert.ok(m, 'render-core.mjs no longer declares OPEN_MARKS as a frozen list');
  assert.deepEqual([...SOURCE_OPEN_MARKS], [...m[1].matchAll(/'([^']*)'/g)].map(x => x[1]));
});
