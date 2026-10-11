// Pact commands in the gate (#203, T1): seam A's command kind and its
// --commands argument, and the renderer's commands key and COMMANDS line.
// Each bad case is a table row that must fail with its exact rule ids. Every
// bad case plants its own command file; the shipped ones (#203, T2) are
// checked at the end. Nothing here installs; commands-install.test.mjs runs
// the install script.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { PACT_COMMANDS as INSTALL_COMMANDS } from '../install-core.mjs';
import { PACT_COMMANDS } from '../shared.mjs';
import { renderStage, runCore, runSeamA } from './gate-run.mjs';
import { stage } from './payload.mjs';
import { moduleResult, table } from './tables.mjs';
import { REPO } from './text.mjs';
import { tempDir } from './tree.mjs';

const CMD = 'claude/commands/finis.md';
const GOOD = ['---', 'description: Wrap this session up.', 'disable-model-invocation: true', '---', '', 'Wrap the session up, step by step.', ''].join('\n');
/** A plant that replaces `from` with `to` in the command file. */
const rep = (from, to, key = CMD) => t => ({ ...t, [key]: t[key].replace(from, to) });
/** A plant that adds a body line to the command file. */
const line = text => t => ({ ...t, [CMD]: `${t[CMD]}${text}\n` });

// ------------------------------------------------------------ seam A: the command file (S3)

for (const c of table('command file', {
  module: 'gate/seam-a.mjs',
  base: () => ({ [CMD]: GOOD }),
  run: (tree, t) => {
    const r = runSeamA(stage(t, tree), undefined, { commands: 'finis' });
    return moduleResult(r.code, r.stdout, r.stderr);
  },
  rows: [
    { id: 'inline-shell', plant: line('Now run !`git status` and report.'), fails: ['command-shell'], why: 'the inline form runs a shell command when the command loads' },
    { id: 'inline-shell-after-text', plant: line('x!`y'), fails: ['command-shell'], why: 'the inline form after any character, stricter than Claude Code' },
    { id: 'inline-shell-at-start', plant: line('!`ls`'), fails: ['command-shell'], why: 'the inline form at the start of a line' },
    { id: 'fenced-backticks', plant: line('```!\ngit status\n```'), fails: ['command-shell'], why: 'the fenced form with backticks' },
    { id: 'fenced-tildes', plant: line('~~~!\ngit status\n~~~'), fails: ['command-shell'], why: 'the fenced form with tildes' },
    { id: 'fenced-indented', plant: line('   ```!\n   git status\n   ```'), fails: ['command-shell'], why: 'a fence opener at any indent' },
    { id: 'fenced-tab-indented', plant: line('\t````!\ngit status\n````'), fails: ['command-shell'], why: 'a tab before a longer fence' },
    { id: 'fenced-space-before-mark', plant: line('```  !\ngit status\n```'), fails: ['command-shell'], why: 'whitespace before the mark' },
    { id: 'fenced-mark-after-info', plant: line('```bash !\ngit status\n```'), fails: ['command-shell'], why: 'a mark anywhere after the fence characters' },
    { id: 'fenced-deep-indent', plant: line('        ```!\ngit status\n        ```'), fails: ['command-shell'], why: 'any indent, not only up to three spaces' },
    { id: 'fenced-two-tabs', plant: line('\t\t~~~!\ngit status\n\t\t~~~'), fails: ['command-shell'], why: 'any indent of tabs' },
    { id: 'fenced-mid-line', plant: line('see ```!git status``` here'), fails: ['command-shell'], why: 'Claude Code finds the opener anywhere on a line' },
    { id: 'fenced-in-blockquote', plant: line('> ```!\n> git status\n> ```'), fails: ['command-shell'], why: 'an opener after a quote marker' },
    { id: 'fenced-in-list-item', plant: line('- ```!\n  git status\n  ```'), fails: ['command-shell'], why: 'an opener after a list bullet' },
    { id: 'argument-placeholder', plant: line('Wrap up $ARGUMENTS now.'), fails: ['command-argument'], why: 'typed text spliced into the body; a pact command takes no argument' },
    { id: 'argument-indexed', plant: line('Use $ARGUMENTS[0].'), fails: ['command-argument'], why: 'the indexed placeholder' },
    { id: 'argument-positional', plant: line('Use $1 here.'), fails: ['command-argument'], why: 'the positional placeholder' },
    { id: 'file-include', plant: line('Read @notes.md first.'), fails: ['command-include'], why: 'an at sign followed by text may include a file' },
    { id: 'file-include-home', plant: line('@~/.claude/CLAUDE.md'), fails: ['command-include'], why: 'an include at the start of a line' },
    { id: 'allowed-tools', plant: rep('disable-model-invocation: true', 'disable-model-invocation: true\nallowed-tools: Bash'), fails: ['command-keys'], why: 'a command never grants a tool' },
    { id: 'model-key', plant: rep('disable-model-invocation: true', 'disable-model-invocation: true\nmodel: opus'), fails: ['command-keys'], why: 'only the two keys' },
    { id: 'hooks-key', plant: rep('disable-model-invocation: true', 'disable-model-invocation: true\nhooks:\n  Stop: x'), fails: ['block-list', 'indented', 'command-keys'], why: 'hooks, as a nested map' },
    { id: 'name-key', plant: rep('description:', 'name: finis\ndescription:'), fails: ['command-keys'], why: 'even a harmless agent key' },
    { id: 'no-invocation-key', plant: rep('disable-model-invocation: true\n', ''), fails: ['command-invocation'], why: 'the model could start the command itself' },
    { id: 'invocation-false', plant: rep('invocation: true', 'invocation: false'), fails: ['value', 'command-invocation'], why: 'false, which YAML reads as a boolean' },
    { id: 'invocation-quoted', plant: rep('invocation: true', 'invocation: "true"'), fails: ['command-invocation'], why: 'a quoted true is text, not the boolean' },
    { id: 'invocation-capital', plant: rep('invocation: true', 'invocation: True'), fails: ['value', 'command-invocation'], why: 'exactly true, matched case-sensitively' },
    { id: 'no-description', plant: rep('description: Wrap this session up.\n', ''), fails: ['command-description'], why: 'a command says what it does' },
    { id: 'empty-description', plant: rep('description: Wrap this session up.', "description: ''"), fails: ['command-description'], why: 'an empty description' },
    { id: 'no-frontmatter', plant: t => ({ ...t, [CMD]: 'Just a body.\n' }), fails: ['frontmatter'], why: 'a command with no frontmatter' },
    { id: 'refused-character', plant: line('Wrap ‮up.'), fails: ['invisible'], why: 'the pact-text scan runs on a command' },
    { id: 'unlisted-name', plant: t => ({ ...t, 'claude/commands/ship-it.md': GOOD }), fails: ['command-file-name'], why: 'a fourth command needs a gate change' },
    { id: 'name-in-capitals', plant: () => ({ 'claude/commands/Finis.md': GOOD }), fails: ['command-file-name', 'commands-not-in-pact'], why: 'names are matched exactly, so finis is not in the stage' },
    { id: 'subfolder', plant: t => ({ ...t, 'claude/commands/more/finis.md': GOOD }), fails: ['command-path'], why: 'a command is exactly claude/commands/<name>.md' },
    { id: 'not-markdown', plant: t => ({ ...t, 'claude/commands/finis.txt': GOOD }), fails: ['command-file-name'], why: 'only a .md file is a command' },
  ],
})) test(c.name, c.fn);

test('seam A lists a command for install only when --commands names it, and checks it either way', t => {
  const root = stage(t, { [CMD]: GOOD });
  const on = runSeamA(root, undefined, { commands: 'finis' });
  assert.equal(on.code, 0, on.out);
  assert.match(on.stdout, /^INSTALL [0-9a-f]{64} claude\/commands\/finis\.md commands\/finis\.md$/m, on.out);
  assert.match(on.stdout, /^PASS command: claude\/commands\/finis\.md$/m, on.out);
  const off = runSeamA(root, undefined, { commands: 'none' });
  assert.equal(off.code, 0, off.out);
  assert.doesNotMatch(off.stdout, /^INSTALL .*commands\//m, off.out);
  assert.match(off.stdout, /^PASS command: claude\/commands\/finis\.md$/m, off.out);
  const bad = runSeamA(stage(t, { [CMD]: `${GOOD}!\`ls\`\n` }), undefined, { commands: 'none' });
  assert.equal(bad.code, 1, 'an unlisted command file is still checked');
});

test('seam A takes the inline and fenced forms only where they run nothing: no false hit on plain text', t => {
  const body = ['Use `git status` and say so!', 'A fence with no mark:', '```bash', 'echo hi', '```', 'An email is not written here, and ~ alone is fine.', 'A dollar sign alone, $, is no placeholder.', ''].join('\n');
  const r = runSeamA(stage(t, { [CMD]: `${GOOD}${body}` }), undefined, { commands: 'finis' });
  assert.equal(r.code, 0, r.out);
});

// ------------------------------------------------------------ seam A: --commands (S8)

/** Seam A's core on a staged tree, with `argv` after the stage root: rendered, as the install runs it. */
function seamWith(t, tree, argv) {
  const root = stage(t, tree);
  renderStage(root);
  const r = runCore('seam-a', [root, ...argv]);
  return moduleResult(r.code, r.stdout, r.stderr);
}
for (const c of table('seam a commands argument', {
  module: 'gate/seam-a.mjs',
  base: () => ({ [CMD]: GOOD, argv: JSON.stringify(['--commands', 'finis']) }),
  run: ({ argv, ...tree }, t) => seamWith(t, tree, JSON.parse(argv)),
  rows: [
    { id: 'missing', plant: t => ({ ...t, argv: '[]' }), fails: ['commands-arg'], why: 'the list never defaults' },
    { id: 'given-twice', plant: t => ({ ...t, argv: JSON.stringify(['--commands', 'finis', '--commands', 'finis']) }), fails: ['commands-arg'], why: 'given twice, even the same' },
    { id: 'no-value', plant: t => ({ ...t, argv: JSON.stringify(['--commands']) }), fails: ['commands-arg'], why: 'a flag with nothing after it' },
    { id: 'unknown-option', plant: t => ({ ...t, argv: JSON.stringify(['--commands', 'finis', '--kit', 'x']) }), fails: ['usage'], why: 'no other option' },
    { id: 'unknown-name', plant: t => ({ ...t, argv: JSON.stringify(['--commands', 'ship-it']) }), fails: ['commands-name'], why: 'a name that is not a pact command' },
    { id: 'name-in-capitals', plant: t => ({ ...t, argv: JSON.stringify(['--commands', 'Finis']) }), fails: ['commands-name'], why: 'matched exactly' },
    { id: 'none-and-a-name', plant: t => ({ ...t, argv: JSON.stringify(['--commands', 'none,finis']) }), fails: ['commands-name'], why: 'none stands alone' },
    { id: 'empty-value', plant: t => ({ ...t, argv: JSON.stringify(['--commands', '']) }), fails: ['commands-name'], why: 'an empty list is written none' },
    { id: 'spaces', plant: t => ({ ...t, argv: JSON.stringify(['--commands', 'finis, make-it-so']) }), fails: ['commands-name'], why: 'names joined by commas alone' },
    { id: 'repeat', plant: t => ({ ...t, argv: JSON.stringify(['--commands', 'finis,finis']) }), fails: ['commands-repeat'], why: 'one name twice' },
    { id: 'not-in-this-pact', plant: t => ({ ...t, argv: JSON.stringify(['--commands', 'finis,make-it-so']) }), fails: ['commands-not-in-pact'], says: /make-it-so, but the stage holds no claude\/commands\/make-it-so\.md: it is not in this pact/, why: 'a listed name whose file is not in the stage' },
  ],
})) test(c.name, c.fn);

test('the pact command list is one list: the install keeps the same names in the same order', () => {
  assert.deepEqual([...INSTALL_COMMANDS], [...PACT_COMMANDS]);
  assert.deepEqual([...PACT_COMMANDS], ['make-it-so', 'finis', 'scriptorium']);
  assert.ok(Object.isFrozen(PACT_COMMANDS) && Object.isFrozen(INSTALL_COMMANDS));
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
for (const c of table('render commands key', {
  module: 'gate/render.mjs',
  base: () => ({ config: '{"schema": 1, "commands": ["finis"]}' }),
  run: ({ config }, t) => {
    const r = renderWith(t, config);
    return moduleResult(r.code, r.stdout, r.stderr);
  },
  rows: [
    { id: 'not-a-list', plant: () => ({ config: '{"schema": 1, "commands": "finis"}' }), fails: ['config-commands'], why: 'a list, not one name' },
    { id: 'an-object', plant: () => ({ config: '{"schema": 1, "commands": {"finis": true}}' }), fails: ['config-commands'], why: 'a list, not a map' },
    { id: 'unknown-name', plant: () => ({ config: '{"schema": 1, "commands": ["ship-it"]}' }), fails: ['config-commands'], why: 'a name that is not a pact command' },
    { id: 'name-in-capitals', plant: () => ({ config: '{"schema": 1, "commands": ["Finis"]}' }), fails: ['config-commands'], why: 'matched exactly' },
    { id: 'not-text', plant: () => ({ config: '{"schema": 1, "commands": [1]}' }), fails: ['config-commands'], why: 'a name is text' },
    { id: 'repeat', plant: () => ({ config: '{"schema": 1, "commands": ["finis", "finis"]}' }), fails: ['config-commands'], why: 'one name twice' },
    { id: 'none-as-a-name', plant: () => ({ config: '{"schema": 1, "commands": ["none"]}' }), fails: ['config-commands'], why: 'none is the line\'s word, not a name' },
    { id: 'key-in-capitals', plant: () => ({ config: '{"schema": 1, "Commands": ["finis"]}' }), fails: ['config-key'], why: 'keys are matched exactly' },
  ],
})) test(c.name, c.fn);

test('the renderer always prints one COMMANDS line: none, or the names on in PACT_COMMANDS order', t => {
  const commandsLines = r => r.lines.filter(l => l.startsWith('COMMANDS'));
  assert.deepEqual(commandsLines(renderWith(t, null)), ['COMMANDS none']);
  assert.deepEqual(commandsLines(renderWith(t, '{"schema": 1}')), ['COMMANDS none']);
  assert.deepEqual(commandsLines(renderWith(t, '{"schema": 1, "commands": []}')), ['COMMANDS none']);
  const both = renderWith(t, '{"schema": 1, "commands": ["scriptorium", "make-it-so"]}');
  assert.equal(both.code, 0, both.out);
  assert.deepEqual(commandsLines(both), ['COMMANDS make-it-so,scriptorium']);
  assert.equal(both.lines.at(-2), 'COMMANDS make-it-so,scriptorium', 'the line comes last, before RESULT');
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
    assert.match(r.stdout, new RegExp(`^PASS command: claude/commands/${n}\\.md$`, 'm'), r.out);
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