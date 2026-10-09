// The parity guard (#140, T10): each gate module's core, run in-process as the
// test helpers run it, prints what its wrapper prints when run as the install
// runs it: from a staged copy of the gate, with the stage as the working
// folder and NODE_OPTIONS removed. Per module, a pass, two different failures
// and a usage error; the lines must match byte for byte, and the exit code
// must equal `failed`. It refuses to run, as a failure and never a skip, under
// NODE_OPTIONS or a preload option, since the in-process side would then run
// under a preload the child side lacks. Its seen-to-fail runs under a preload
// are in gate-run.test.mjs, which starts this file as a child. On the probe
// floor by name (AGENTS.md).
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { MODULES, parityProblems, preloadRefusal, runCore, runWrapper, stageGate } from './gate-run.mjs';
import { REPO, failRules, read, realAgents, realOverlay, renderStage, tempDir, writeTree } from './helpers.mjs';

const SOURCE = join(REPO, 'claude', 'CLAUDE.md');
const dirs = (root, ...names) =>
  names.map(n => {
    mkdirSync(join(root, n), { recursive: true });
    return join(root, n);
  });

/** A stage seam A passes on: the pact's real text, rendered. */
function seamStage(root, files = {}) {
  writeTree(root, {
    'claude/CLAUDE.md': read(SOURCE),
    'AGENTS.md': read(join(REPO, 'AGENTS.md')),
    ...realAgents(),
    'claude/settings.overlay.json': realOverlay(),
    'cross/cross.mjs': read(join(REPO, 'cross', 'cross.mjs')),
    'familiars/.gitkeep': '',
    ...files,
  });
  renderStage(root);
  return [root];
}

const reviewInputs = root => {
  const [inp, home] = dirs(root, 'in', 'home');
  writeFileSync(join(inp, 'CLAUDE.md'), '# Rules\nRendered.\n');
  writeFileSync(join(inp, 'config.diff'), '--- default/CLAUDE.md\n+++ configured/CLAUDE.md\n@@ -1,0 +2,1 @@\n+x\n');
  return { home, rules: join(inp, 'CLAUDE.md'), diff: join(inp, 'config.diff') };
};

const projectIn = (root, config) => {
  const [proj, home] = dirs(root, 'proj', 'home');
  if (config !== undefined) {
    mkdirSync(join(proj, '.claude'));
    writeFileSync(join(proj, '.claude', 'pact-config.json'), config);
  }
  return ['check', proj, home];
};

const renderIn = (root, config) => {
  const [out, home] = dirs(root, 'out', 'home');
  if (config !== undefined) writeTree(home, { 'pact/config.json': config });
  return [SOURCE, out, home];
};

// Each input builds itself under an empty folder and returns the arguments.
// It is built twice, at the same path, once for each side, so a check that
// writes (render, review) meets the same empty target both times.
const INPUTS = {
  render: {
    pass: root => renderIn(root),
    'bad JSON': root => renderIn(root, '{'),
    'unknown mark': root => renderIn(root, JSON.stringify({ schema: 1, edits: [{ mark: 'move-9', op: 'remove' }] })),
    usage: () => [],
  },
  'seam-a': {
    pass: root => seamStage(root),
    'no description': root => seamStage(root, { 'claude/agents/parity-agent.md': '---\nname: parity-agent\ntools: [Read, Glob, Grep]\n---\n\nBody.\n' }),
    'unreadable overlay': root => seamStage(root, { 'claude/settings.overlay.json': '{' }),
    usage: () => [],
  },
  project: {
    pass: root => projectIn(root, '{"schema": 1, "settings": {"usage-pause": 60}}\n'),
    'no configuration': root => projectIn(root),
    'missing folder': root => ['check', join(root, 'none'), dirs(root, 'home')[0]],
    usage: () => [],
  },
  review: {
    pass: root => {
      const i = reviewInputs(root);
      return [join(root, 'review'), i.home, i.rules, i.diff];
    },
    'folder not empty': root => {
      const i = reviewInputs(root);
      writeTree(root, { 'review/notes.txt': 'mine\n' });
      return [join(root, 'review'), i.home, i.rules, i.diff];
    },
    'missing rules file': root => {
      const i = reviewInputs(root);
      return [join(root, 'review'), i.home, join(root, 'in', 'none.md'), i.diff];
    },
    usage: root => ['--skip', root, 'a', 'b'],
  },
};

/**
 * The guard on one input: build it, run it in-process through `runner`
 * (runCore unless planted), build it again at the same path, run the wrapper
 * from a stage as the install does, and return the in-process result with
 * each way the two differ. Refuses, failing the test, under a preload.
 */
function parity(t, module, input, runner = runCore) {
  const why = preloadRefusal();
  if (why) assert.fail(`the parity guard refuses to run: ${why}`);
  const base = tempDir(t, 'pact-parity-');
  const root = join(base, 'in');
  const stage = stageGate(join(base, 'stage'));
  mkdirSync(root);
  const inProcess = runner(module, INPUTS[module][input](root));
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root);
  const child = runWrapper(stage, module, INPUTS[module][input](root));
  return { inProcess, child, problems: parityProblems(inProcess, child) };
}

test('the parity guard covers exactly the four gate modules with a core', () => {
  assert.deepEqual(Object.keys(INPUTS).sort(), [...MODULES]);
});

for (const module of MODULES) {
  for (const input of Object.keys(INPUTS[module])) {
    test(`parity: ${module} ${input}: in-process and the wrapper print the same lines and exit code`, t => {
      const r = parity(t, module, input);
      assert.deepEqual(r.problems, [], `${module} ${input}\n--- in-process\n${r.inProcess.out}--- wrapper\n${r.child.out}`);
      assert.equal(r.inProcess.lines[r.inProcess.lines.length - 1], input === 'pass' ? 'RESULT: pass' : 'RESULT: fail', r.inProcess.out);
    });
  }

  // The inputs are what they say: one pass, two failures on different rules, a usage error.
  test(`parity: ${module}'s inputs are a pass, two different failures and a usage error`, t => {
    const rules = {};
    for (const input of Object.keys(INPUTS[module])) {
      const root = join(tempDir(t, 'pact-parity-'), 'in');
      mkdirSync(root);
      rules[input] = failRules(runCore(module, INPUTS[module][input](root)).stdout).sort();
    }
    const [, fail1, fail2] = Object.keys(INPUTS[module]);
    assert.deepEqual(rules.pass, []);
    assert.deepEqual(rules.usage, ['usage']);
    for (const f of [fail1, fail2]) assert.ok(rules[f].length > 0 && !rules[f].includes('usage') && !rules[f].includes('internal'), `${f}: ${rules[f]}`);
    assert.notDeepEqual(rules[fail1], rules[fail2]);
  });

  // Seen to fail: a runner that drops a line, and one that inverts failed.
  test(`bad case: the parity guard catches an in-process runner that drops a line, for ${module}`, t => {
    const dropping = (m, argv) => {
      const r = runCore(m, argv);
      const lines = r.lines.slice(1);
      return { ...r, lines, stdout: `${lines.join('\n')}\n` };
    };
    assert.deepEqual(parity(t, module, 'pass', dropping).problems, ['the lines differ']);
  });

  test(`bad case: the parity guard catches an in-process runner that inverts failed, for ${module}`, t => {
    const inverting = (m, argv) => {
      const r = runCore(m, argv);
      return { ...r, failed: !r.failed, code: r.failed ? 0 : 1 };
    };
    const { problems } = parity(t, module, Object.keys(INPUTS[module])[1], inverting);
    assert.equal(problems.length, 1, problems.join('; '));
    assert.match(problems[0], /^the exit code 1 does not match failed: false$/);
  });
}
