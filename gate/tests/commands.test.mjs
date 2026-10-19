// Pact commands in the gate (#203, T1): seam A's command kind and its
// --commands argument, and the renderer's commands key and COMMANDS line.
// Each bad case is a row that must fail with its exact rule ids. Every
// bad case plants its own command file; the shipped ones (#203, T2) are
// checked at the end. Nothing here installs; commands-install.test.mjs runs
// the install script.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { BUILDER_KIT as INSTALL_KIT, BUILDER_KIT_PATTERNS as INSTALL_KIT_PATTERNS, PACT_COMMANDS as INSTALL_COMMANDS } from '../install-core.mjs';
import { BUILDER_KIT, BUILDER_KIT_PATTERNS, PACT_COMMANDS } from '../shared.mjs';
import { renderStage, runCore, runSeamA } from './gate-run.mjs';
import { stage } from './payload.mjs';
import { REPO, assertFails, assertPasses, moduleResult } from './text.mjs';
import { tempDir } from './tree.mjs';

const CMD = 'claude/commands/finis.md';
const GOOD = ['---', 'description: Wrap this session up.', 'disable-model-invocation: true', '---', '', 'Wrap the session up, step by step.', ''].join('\n');
/** A plant that replaces `from` with `to` in the command file. */
const rep = (from, to, key = CMD) => t => ({ ...t, [key]: t[key].replace(from, to) });
/** A plant that adds a body line to the command file. */
const line = text => t => ({ ...t, [CMD]: `${t[CMD]}${text}\n` });

// ------------------------------------------------------------ seam A: the command file (S3)
// Since #262 seam A checks only a command file's path and name; what it says is the owner's to judge.

{
  const base = () => ({ [CMD]: GOOD });
  const run = (tree, t) => {
    const r = runSeamA(stage(t, tree), undefined, { commands: 'finis' });
    return moduleResult(r.code, r.stdout, r.stderr);
  };
  const rows = [
    { id: 'unlisted-name', plant: t => ({ ...t, 'claude/commands/ship-it.md': GOOD }), fails: ['command-file-name'], why: 'a fourth command needs a gate change' },
    { id: 'name-in-capitals', plant: () => ({ 'claude/commands/Finis.md': GOOD }), fails: ['command-file-name', 'commands-not-in-pact'], why: 'names are matched exactly, so finis is not in the stage' },
    { id: 'subfolder', plant: t => ({ ...t, 'claude/commands/more/finis.md': GOOD }), fails: ['command-path'], why: 'a command is exactly claude/commands/<name>.md' },
    { id: 'not-markdown', plant: t => ({ ...t, 'claude/commands/finis.txt': GOOD }), fails: ['command-file-name'], why: 'only a .md file is a command' },
  ];
  test('command file: base passes', async t => assertPasses(await run(base(), t)));
  for (const r of rows) test(`command file: ${r.id}`, async t => assertFails(await run(r.plant(base()), t), r.fails, r.says));
  test('command file: base passes after the rows', async t => assertPasses(await run(base(), t)));
}

test('seam A lists a command for install only when --commands names it', t => {
  const root = stage(t, { [CMD]: GOOD });
  const on = runSeamA(root, undefined, { commands: 'finis' });
  assert.equal(on.code, 0, on.out);
  assert.match(on.stdout, /^INSTALL [0-9a-f]{64} claude\/commands\/finis\.md commands\/finis\.md$/m, on.out);
  const off = runSeamA(root, undefined, { commands: 'none' });
  assert.equal(off.code, 0, off.out);
  assert.doesNotMatch(off.stdout, /^INSTALL .*commands\//m, off.out);
});

// The pact is vetted like a skill: a command's keys and body are the owner's to judge.
test('a command with a shell line, an argument, an include and any key passes and installs', t => {
  const body = '---\ndescription: x\nallowed-tools: Bash\n---\n\nRun !`git status` with $ARGUMENTS and read @notes.md.\n';
  const r = runSeamA(stage(t, { [CMD]: body }), undefined, { commands: 'finis' });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^INSTALL [0-9a-f]{64} claude\/commands\/finis\.md commands\/finis\.md$/m, r.out);
});

// ------------------------------------------------------------ seam A: --commands (S8)

/** Seam A's core on a staged tree, with `argv` after the stage root: rendered, as the install runs it. */
function seamWith(t, tree, argv) {
  const root = stage(t, tree);
  renderStage(root);
  const r = runCore('seam-a', [root, ...argv]);
  return moduleResult(r.code, r.stdout, r.stderr);
}
{
  const base = () => ({ [CMD]: GOOD, argv: JSON.stringify(['--commands', 'finis', '--tools', 'none']) });
  const run = ({ argv, ...tree }, t) => seamWith(t, tree, JSON.parse(argv));
  const rows = [
    { id: 'missing', plant: t => ({ ...t, argv: JSON.stringify(['--tools', 'none']) }), fails: ['commands-arg'], why: 'the list never defaults' },
    { id: 'given-twice', plant: t => ({ ...t, argv: JSON.stringify(['--commands', 'finis', '--commands', 'finis', '--tools', 'none']) }), fails: ['commands-arg'], why: 'given twice, even the same' },
    { id: 'no-value', plant: t => ({ ...t, argv: JSON.stringify(['--tools', 'none', '--commands']) }), fails: ['commands-arg'], why: 'a flag with nothing after it' },
    { id: 'unknown-option', plant: t => ({ ...t, argv: JSON.stringify(['--commands', 'finis', '--tools', 'none', '--kit', 'x']) }), fails: ['usage'], why: 'no other option' },
    { id: 'unknown-name', plant: t => ({ ...t, argv: JSON.stringify(['--commands', 'ship-it', '--tools', 'none']) }), fails: ['commands-name'], why: 'a name that is not a pact command' },
    { id: 'name-in-capitals', plant: t => ({ ...t, argv: JSON.stringify(['--commands', 'Finis', '--tools', 'none']) }), fails: ['commands-name'], why: 'matched exactly' },
    { id: 'none-and-a-name', plant: t => ({ ...t, argv: JSON.stringify(['--commands', 'none,finis', '--tools', 'none']) }), fails: ['commands-name'], why: 'none stands alone' },
    { id: 'empty-value', plant: t => ({ ...t, argv: JSON.stringify(['--commands', '', '--tools', 'none']) }), fails: ['commands-name'], why: 'an empty list is written none' },
    { id: 'spaces', plant: t => ({ ...t, argv: JSON.stringify(['--commands', 'finis, make-it-so', '--tools', 'none']) }), fails: ['commands-name'], why: 'names joined by commas alone' },
    { id: 'repeat', plant: t => ({ ...t, argv: JSON.stringify(['--commands', 'finis,finis', '--tools', 'none']) }), fails: ['commands-repeat'], why: 'one name twice' },
    { id: 'not-in-this-pact', plant: t => ({ ...t, argv: JSON.stringify(['--commands', 'finis,make-it-so', '--tools', 'none']) }), fails: ['commands-not-in-pact'], says: /make-it-so, but the stage holds no claude\/commands\/make-it-so\.md: it is not in this pact/, why: 'a listed name whose file is not in the stage' },
  ];
  test('seam a commands argument: base passes', async t => assertPasses(await run(base(), t)));
  for (const r of rows) test(`seam a commands argument: ${r.id}`, async t => assertFails(await run(r.plant(base()), t), r.fails, r.says));
  test('seam a commands argument: base passes after the rows', async t => assertPasses(await run(base(), t)));
}

test('the pact command list is one list: the install keeps the same names in the same order', () => {
  assert.deepEqual([...INSTALL_COMMANDS], [...PACT_COMMANDS]);
  assert.deepEqual([...PACT_COMMANDS], ['make-it-so', 'finis', 'scriptorium']);
  assert.ok(Object.isFrozen(PACT_COMMANDS) && Object.isFrozen(INSTALL_COMMANDS));
});

// #203 S8: seam A and the install each keep the builder kit's list; the two copies agree.
test('the builder kit is one list: the install keeps the same files and patterns', () => {
  assert.deepEqual([...INSTALL_KIT], [...BUILDER_KIT]);
  assert.deepEqual(INSTALL_KIT_PATTERNS.map(String), BUILDER_KIT_PATTERNS.map(String));
  assert.ok([BUILDER_KIT, INSTALL_KIT, BUILDER_KIT_PATTERNS, INSTALL_KIT_PATTERNS].every(Object.isFrozen));
});

// ------------------------------------------------------------ the renderer: the commands key (S7)

const SOURCE = join(REPO, 'claude', 'CLAUDE.md');
/** The renderer's core on the real source, against a home folder holding `config` (none when null). */
function renderWith(t, config) {
  const h = tempDir(t, 'pact-render-home-');
  if (config !== null) {
    mkdirSync(join(h, 'pact'));
    writeFileSync(join(h, 'pact', 'config.json'), config);
  }
  const out = tempDir(t, 'pact-render-out-');
  return runCore('render', [SOURCE, out, h]);
}
{
  const base = () => ({ config: '{"schema": 1, "commands": ["finis"]}' });
  const run = ({ config }, t) => {
    const r = renderWith(t, config);
    return moduleResult(r.code, r.stdout, r.stderr);
  };
  const rows = [
    { id: 'not-a-list', plant: () => ({ config: '{"schema": 1, "commands": "finis"}' }), fails: ['config-commands'], why: 'a list, not one name' },
    { id: 'an-object', plant: () => ({ config: '{"schema": 1, "commands": {"finis": true}}' }), fails: ['config-commands'], why: 'a list, not a map' },
    { id: 'unknown-name', plant: () => ({ config: '{"schema": 1, "commands": ["ship-it"]}' }), fails: ['config-commands'], why: 'a name that is not a pact command' },
    { id: 'name-in-capitals', plant: () => ({ config: '{"schema": 1, "commands": ["Finis"]}' }), fails: ['config-commands'], why: 'matched exactly' },
    { id: 'not-text', plant: () => ({ config: '{"schema": 1, "commands": [1]}' }), fails: ['config-commands'], why: 'a name is text' },
    { id: 'repeat', plant: () => ({ config: '{"schema": 1, "commands": ["finis", "finis"]}' }), fails: ['config-commands'], why: 'one name twice' },
    { id: 'none-as-a-name', plant: () => ({ config: '{"schema": 1, "commands": ["none"]}' }), fails: ['config-commands'], why: 'none is the line\'s word, not a name' },
    { id: 'key-in-capitals', plant: () => ({ config: '{"schema": 1, "Commands": ["finis"]}' }), fails: ['config-key'], why: 'keys are matched exactly' },
  ];
  test('render commands key: base passes', async t => assertPasses(await run(base(), t)));
  for (const r of rows) test(`render commands key: ${r.id}`, async t => assertFails(await run(r.plant(base()), t), r.fails, r.says));
  test('render commands key: base passes after the rows', async t => assertPasses(await run(base(), t)));
}

// #280 C1: the COMMANDS line comes last but for the TOOLS line.
test('the renderer always prints one COMMANDS line: none, or the names on in PACT_COMMANDS order', t => {
  const commandsLines = r => r.lines.filter(l => l.startsWith('COMMANDS'));
  assert.deepEqual(commandsLines(renderWith(t, null)), ['COMMANDS none']);
  assert.deepEqual(commandsLines(renderWith(t, '{"schema": 1}')), ['COMMANDS none']);
  assert.deepEqual(commandsLines(renderWith(t, '{"schema": 1, "commands": []}')), ['COMMANDS none']);
  const both = renderWith(t, '{"schema": 1, "commands": ["scriptorium", "make-it-so"]}');
  assert.equal(both.code, 0, both.out);
  assert.deepEqual(commandsLines(both), ['COMMANDS make-it-so,scriptorium']);
  assert.equal(both.lines.at(-3), 'COMMANDS make-it-so,scriptorium', 'the line comes last but for TOOLS, before RESULT');
});

test('the commands list changes the digest, so a list changed after the dry run changes the rendered hash', t => {
  const digest = r => r.lines.find(l => l.startsWith('DIGEST '));
  const rendered = r => r.lines.find(l => l.startsWith('RENDERED '));
  const a = renderWith(t, '{"schema": 1, "commands": ["finis"]}');
  const b = renderWith(t, '{"schema": 1, "commands": ["finis", "make-it-so"]}');
  assert.notEqual(digest(a), digest(b));
  assert.notEqual(rendered(a), rendered(b));
});

test('a project configuration may not hold commands', t => {
  const proj = tempDir(t, 'pact-project-');
  mkdirSync(join(proj, '.claude'));
  writeFileSync(join(proj, '.claude', 'pact-config.json'), '{"schema": 1, "settings": {"usage-pause": 50}, "commands": ["finis"]}');
  const r = runCore('render', ['project', tempDir(t, 'pact-render-out-'), tempDir(t, 'pact-render-home-'), proj]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.stdout, /^FAIL project-key: /m, r.out);
});

// ------------------------------------------------------------ the shipped commands (#203, T2)

const SHIPPED = ['make-it-so', 'finis'];
const shipped = name => readFileSync(join(REPO, 'claude', 'commands', `${name}.md`), 'utf8').replace(/\r\n/g, '\n');

test('the shipped /make-it-so and /finis pass seam A and are listed to install', t => {
  const root = stage(t, Object.fromEntries(SHIPPED.map(n => [`claude/commands/${n}.md`, shipped(n)])));
  const r = runSeamA(root, undefined, { commands: SHIPPED.join(',') });
  assert.equal(r.code, 0, r.out);
  for (const n of SHIPPED) {
    assert.match(r.stdout, new RegExp(`^INSTALL [0-9a-f]{64} claude/commands/${n}\\.md commands/${n}\\.md$`, 'm'), r.out);
  }
});

// The whole text of each body, so an added rule fails here and is read at review.
const BODIES = {
  'make-it-so': ['---', 'description: The owner\'s "accept all recommendations", meant to be typed by the owner.', 'disable-model-invocation: true', '---', '', '# /make-it-so', '', 'Accept every recommendation in your last message, and carry them out.', ''].join('\n'),
  finis: ['---', 'description: The owner\'s "we\'re done, archive this session", meant to be typed by the owner.', 'disable-model-invocation: true', '---', '', '# /finis', '', 'We\'re done: archive this session.', '', 'First check whether anything in it is outstanding, such as work not yet', 'committed or pushed, or a step left unfinished. If there is, say what it is', 'and don\'t archive. If there isn\'t, archive the session.', ''].join('\n'),
};

test('the shipped bodies are exactly the owner\'s plain meaning: accept every recommendation; archive only when nothing is outstanding', () => {
  for (const n of SHIPPED) assert.equal(shipped(n), BODIES[n], n);
});