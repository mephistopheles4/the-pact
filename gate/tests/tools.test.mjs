// Pact tools in the gate (#280, T1): the renderer's tools key, its TOOLS line
// and the poster's rule part, and seam A's tool kind and its --tools argument.
// Each bad case is a row that must fail with its exact rule ids. Every
// seam A case plants its own tool file. Nothing here installs;
// the install-tier tools file runs the install script.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { CLEANER_ASK, CLEANER_DENY, PACT_TOOLS as INSTALL_TOOLS, STOP_DENY } from '../install-core.mjs';
import { CLEANER_ASK as SHARED_ASK, CLEANER_DENY as SHARED_DENY, PACT_TOOLS, STOP_DENY as SHARED_STOP } from '../shared.mjs';
import { renderStage, runCore, runSeamA } from './gate-run.mjs';
import { stage } from './payload.mjs';
import { REPO, assertFails, assertPasses, moduleResult } from './text.mjs';
import { tempDir } from './tree.mjs';

const TOOL = 'claude/tools/poster.mjs';
const GOOD = "console.log('a tool');\n";

// ------------------------------------------------------------ the tools list (C3)

// #280 C3
test('the pact tool list is one list: the install keeps the same names in the same order', () => {
  assert.deepEqual([...INSTALL_TOOLS], [...PACT_TOOLS]);
  assert.deepEqual([...PACT_TOOLS], ['poster', 'cleaner']);
  assert.ok(Object.isFrozen(PACT_TOOLS) && Object.isFrozen(INSTALL_TOOLS));
});

// ------------------------------------------------------------ seam A: the tool file (C3)

// #280 C3
{
  const base = () => ({ [TOOL]: GOOD });
  const run = (tree, t) => {
    const r = runSeamA(stage(t, tree), undefined, { tools: 'poster' });
    return moduleResult(r.code, r.stdout, r.stderr);
  };
  const rows = [
    { id: 'subfolder', plant: t => ({ ...t, 'claude/tools/more/poster.mjs': GOOD }), fails: ['tool-path'], why: 'a tool is exactly claude/tools/<name>.mjs' },
    { id: 'unlisted-name', plant: t => ({ ...t, 'claude/tools/sender.mjs': GOOD }), fails: ['tool-file-name'], why: 'a second tool needs a gate change' },
    { id: 'not-a-module', plant: t => ({ ...t, 'claude/tools/poster.md': GOOD }), fails: ['tool-file-name'], why: 'only a .mjs file is a tool' },
    { id: 'name-in-capitals', plant: () => ({ 'claude/tools/Poster.mjs': GOOD }), fails: ['tool-file-name', 'tools-not-in-pact'], why: 'names are matched exactly, so poster is not in the stage' },
    { id: 'hidden-character', plant: t => ({ ...t, [TOOL]: "console.log('a\u200btool');\n" }), fails: ['invisible'], why: 'the text scanner reads a tool file' },
  ];
  test('tool file: base passes', async t => assertPasses(await run(base(), t)));
  for (const r of rows) test(`tool file: ${r.id}`, async t => assertFails(await run(r.plant(base()), t), r.fails, r.says));
  test('tool file: base passes after the rows', async t => assertPasses(await run(base(), t)));
}

// #280 C2
test('seam A lists a tool for install only when --tools names it, at pact/tools/<name>.mjs', t => {
  const root = stage(t, { [TOOL]: GOOD });
  const on = runSeamA(root, undefined, { tools: 'poster' });
  assert.equal(on.code, 0, on.out);
  assert.match(on.stdout, /^INSTALL [0-9a-f]{64} claude\/tools\/poster\.mjs pact\/tools\/poster\.mjs$/m, on.out);
  const off = runSeamA(root, undefined, { tools: 'none' });
  assert.equal(off.code, 0, off.out);
  assert.doesNotMatch(off.stdout, /tools\//, off.out);
});

// #280 C3: a tool file that is off is still scanned, as a command is.
test('seam A scans a tool file that is off', t => {
  const r = runSeamA(stage(t, { [TOOL]: "console.log('a\u200btool');\n" }), undefined, { tools: 'none' });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stdout, /^FAIL invisible: claude\/tools\/poster\.mjs line 1: /m, r.out);
});

// ------------------------------------------------------------ seam A: --tools (C3)

/** Seam A's core on a staged tree, with `argv` after the stage root: rendered, as the install runs it. */
function seamWith(t, tree, argv) {
  const root = stage(t, tree);
  renderStage(root);
  const r = runCore('seam-a', [root, ...argv]);
  return moduleResult(r.code, r.stdout, r.stderr);
}
const args = (...a) => JSON.stringify(['--commands', 'none', ...a]);
// #280 C3
{
  const base = () => ({ [TOOL]: GOOD, argv: args('--tools', 'poster') });
  const run = ({ argv, ...tree }, t) => seamWith(t, tree, ['--compact', 'off', ...JSON.parse(argv)]);
  const rows = [
    { id: 'missing', plant: t => ({ ...t, argv: args() }), fails: ['tools-arg'], why: 'the list never defaults' },
    { id: 'given-twice', plant: t => ({ ...t, argv: args('--tools', 'poster', '--tools', 'poster') }), fails: ['tools-arg'], why: 'given twice, even the same' },
    { id: 'no-value', plant: t => ({ ...t, argv: args('--tools') }), fails: ['tools-arg'], why: 'a flag with nothing after it' },
    { id: 'unknown-name', plant: t => ({ ...t, argv: args('--tools', 'sender') }), fails: ['tools-name'], why: 'a name that is not a pact tool' },
    { id: 'name-in-capitals', plant: t => ({ ...t, argv: args('--tools', 'Poster') }), fails: ['tools-name'], why: 'matched exactly' },
    { id: 'none-and-a-name', plant: t => ({ ...t, argv: args('--tools', 'none,poster') }), fails: ['tools-name'], why: 'none stands alone' },
    { id: 'empty-value', plant: t => ({ ...t, argv: args('--tools', '') }), fails: ['tools-name'], why: 'an empty list is written none' },
    { id: 'repeat', plant: t => ({ ...t, argv: args('--tools', 'poster,poster') }), fails: ['tools-repeat'], why: 'one name twice' },
    { id: 'not-in-this-pact', plant: t => ({ argv: t.argv }), fails: ['tools-not-in-pact'], says: /--tools names poster, but the stage holds no claude\/tools\/poster\.mjs: it is not in this pact/, why: 'a listed name whose file is not in the stage' },
    { id: 'both-missing', plant: t => ({ ...t, argv: '[]' }), fails: ['commands-arg', 'tools-arg'], why: 'each list is required on its own' },
  ];
  test('seam a tools argument: base passes', async t => assertPasses(await run(base(), t)));
  for (const r of rows) test(`seam a tools argument: ${r.id}`, async t => assertFails(await run(r.plant(base()), t), r.fails, r.says));
  test('seam a tools argument: base passes after the rows', async t => assertPasses(await run(base(), t)));
}

// #280 C3
test('seam A takes --tools before or after --commands', t => {
  const r = seamWith(t, { [TOOL]: GOOD }, ['--tools', 'poster', '--commands', 'none', '--compact', 'off']);
  assert.equal(r.code, 0, r.out);
});

// ------------------------------------------------------------ the renderer: the tools key (C1)

const SOURCE = join(REPO, 'claude', 'CLAUDE.md');
/** The renderer's core on `source`, against a home folder holding `config` (none when null); `out` gets the output. */
function renderWith(t, config, { source = SOURCE, out = tempDir(t, 'pact-render-out-') } = {}) {
  const h = tempDir(t, 'pact-render-home-');
  if (config !== null) {
    mkdirSync(join(h, 'pact'));
    writeFileSync(join(h, 'pact', 'config.json'), config);
  }
  return { ...runCore('render', [source, out, h]), out };
}
// #280 C1
{
  const base = () => ({ config: '{"schema": 1, "tools": ["poster"]}' });
  const run = ({ config }, t) => {
    const r = renderWith(t, config);
    return moduleResult(r.code, r.stdout, r.stderr);
  };
  const rows = [
    { id: 'not-a-list', plant: () => ({ config: '{"schema": 1, "tools": "poster"}' }), fails: ['config-tools'], why: 'a list, not one name' },
    { id: 'an-object', plant: () => ({ config: '{"schema": 1, "tools": {"poster": true}}' }), fails: ['config-tools'], why: 'a list, not a map' },
    { id: 'unknown-name', plant: () => ({ config: '{"schema": 1, "tools": ["sender"]}' }), fails: ['config-tools'], why: 'a name that is not a pact tool' },
    { id: 'name-in-capitals', plant: () => ({ config: '{"schema": 1, "tools": ["Poster"]}' }), fails: ['config-tools'], why: 'matched exactly' },
    { id: 'not-text', plant: () => ({ config: '{"schema": 1, "tools": [1]}' }), fails: ['config-tools'], why: 'a name is text' },
    { id: 'repeat', plant: () => ({ config: '{"schema": 1, "tools": ["poster", "poster"]}' }), fails: ['config-tools'], why: 'one name twice' },
    { id: 'none-as-a-name', plant: () => ({ config: '{"schema": 1, "tools": ["none"]}' }), fails: ['config-tools'], why: "none is the line's word, not a name" },
    { id: 'key-in-capitals', plant: () => ({ config: '{"schema": 1, "Tools": ["poster"]}' }), fails: ['config-key'], why: 'keys are matched exactly' },
    // #280 C6: the poster's part is filled only by the tools list.
    { id: 'edit-tool-part', plant: () => ({ config: '{"schema": 1, "edits": [{"mark": "tool-poster", "op": "remove"}]}' }), fails: ['edit-mark'], says: /tool-poster is filled while its tool is on; no edit may target it/, why: 'no edit may target the part' },
  ];
  test('render tools key: base passes', async t => assertPasses(await run(base(), t)));
  for (const r of rows) test(`render tools key: ${r.id}`, async t => assertFails(await run(r.plant(base()), t), r.fails, r.says));
  test('render tools key: base passes after the rows', async t => assertPasses(await run(base(), t)));
}

// #280 C1
test('the renderer always prints one TOOLS line, straight after COMMANDS: none, or the tools on', t => {
  const at = r => r.lines.filter(l => /^(?:COMMANDS|TOOLS)\b/.test(l));
  assert.deepEqual(at(renderWith(t, null)), ['COMMANDS none', 'TOOLS none']);
  assert.deepEqual(at(renderWith(t, '{"schema": 1}')), ['COMMANDS none', 'TOOLS none']);
  assert.deepEqual(at(renderWith(t, '{"schema": 1, "tools": []}')), ['COMMANDS none', 'TOOLS none']);
  const on = renderWith(t, '{"schema": 1, "commands": ["finis"], "tools": ["poster"]}');
  assert.equal(on.code, 0, on.out);
  assert.deepEqual(on.lines.slice(-3), ['COMMANDS finis', 'TOOLS poster', 'RESULT: pass']);
});

// #280 C1: the digest. The part's own effect on the hash is held by the byte-for-byte test below (C6).
test('the tools list changes the digest and the rendered hash', t => {
  const line = (r, k) => r.lines.find(l => l.startsWith(`${k} `));
  const off = renderWith(t, '{"schema": 1, "tools": []}');
  const on = renderWith(t, '{"schema": 1, "tools": ["poster"]}');
  assert.notEqual(line(off, 'DIGEST'), line(on, 'DIGEST'));
  assert.notEqual(line(off, 'RENDERED'), line(on, 'RENDERED'));
});

// #280 C1
test('a project configuration may not hold tools', t => {
  const proj = tempDir(t, 'pact-project-');
  mkdirSync(join(proj, '.claude'));
  writeFileSync(join(proj, '.claude', 'pact-config.json'), '{"schema": 1, "settings": {"usage-pause": 50}, "tools": ["poster"]}');
  const r = runCore('render', ['project', tempDir(t, 'pact-render-out-'), tempDir(t, 'pact-render-home-'), proj]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.stdout, /^FAIL project-key: /m, r.out);
});

// ------------------------------------------------------------ the rules file: the poster's part (C6)

// #464 T4: the how-to moved into review.md's Posting section; the part is its one-line pointer.
const T2 = '- **Post through the poster,** as that section says.';
const KEEP_RECORD = '- **Keep the record** as';
const rendered = r => readFileSync(join(r.out, 'CLAUDE.md'), 'utf8');

// #280 C6, C7
test('with the poster off, the rules file is the no-configuration render byte for byte; on, it gains T2 text after the record bullet', t => {
  const none = rendered(renderWith(t, null));
  const off = rendered(renderWith(t, '{"schema": 1, "tools": []}'));
  const on = renderWith(t, '{"schema": 1, "tools": ["poster"]}');
  assert.equal(on.code, 0, on.out);
  const onText = rendered(on);
  // The notice names the digest, which differs; everything else in the off render is the no-configuration render.
  const noNotice = s => s.replace(/\n\*\*Configuration in effect\.\*\*[^\n]*\n[^\n]*\n/, '');
  assert.equal(noNotice(off), none);
  assert.ok(!none.includes('Post through the poster'), 'off, no rule names the poster');
  assert.equal(noNotice(onText).replace(`${T2}\n`, ''), none, 'on, the render differs only by the part');
  assert.equal(onText.split(T2).length, 2, 'the part holds T2 text once, byte for byte');
  const after = onText.slice(onText.indexOf(KEEP_RECORD));
  // The checkpoint-stops part may sit between them: it is part of the no-configuration render, and a configuration that turns it off drops it.
  assert.match(after, /^- \*\*Keep the record\*\*[^\n]*\n(?:- \*\*Checkpoints wait\.\*\*[^\n]*\n(?: {2}[^\n]*\n)*)?- \*\*Post through the poster,\*\*/, 'after the record bullet, with at most the checkpoints line between');
});

// render, #280 C6: the renderer fills the part only where the source holds it, and holds it empty.
{
  const base = () => ({ source: readFileSync(SOURCE, 'utf8').replace(/\r\n/g, '\n') });
  const run = ({ source }, t) => {
    const dir = tempDir(t, 'pact-render-source-');
    writeFileSync(join(dir, 'CLAUDE.md'), source);
    const r = renderWith(t, '{"schema": 1, "tools": ["poster"]}', { source: join(dir, 'CLAUDE.md') });
    return moduleResult(r.code, r.stdout, r.stderr);
  };
  const rows = [
    { id: 'part-missing', plant: t => ({ source: t.source.replace('<!-- pact:begin tool-poster -->\n<!-- pact:end tool-poster -->\n', '') }), fails: ['render'], says: /tool-poster: the part is not in the source/, why: 'a source with no part has nowhere to put the rule' },
    { id: 'part-not-empty', plant: t => ({ source: t.source.replace('<!-- pact:begin tool-poster -->\n', '<!-- pact:begin tool-poster -->\n- A rule already here.\n') }), fails: ['render'], says: /tool-poster: the part is not empty in the source/, why: 'the rule replaces nothing' },
  ];
  test('render tool part: base passes', async t => assertPasses(await run(base(), t)));
  for (const r of rows) test(`render tool part: ${r.id}`, async t => assertFails(await run(r.plant(base()), t), r.fails, r.says));
  test('render tool part: base passes after the rows', async t => assertPasses(await run(base(), t)));
}

// ------------------------------------------------------------ the cleaner's part and deny rules (#438)

// #464 T4: the how-to moved into the cleaner's own printed output.
const CLEANER_PART = '- **Remove worktrees only through the cleaner,** after my yes in chat.';

// #438 C14
test('with the cleaner on, the rules file holds its part after the poster\'s; off, it is the no-configuration render', t => {
  const none = rendered(renderWith(t, null));
  const noNotice = s => s.replace(/\n\*\*Configuration in effect\.\*\*[^\n]*\n[^\n]*\n/, '');
  const on = renderWith(t, '{"schema": 1, "tools": ["poster", "cleaner"]}');
  assert.equal(on.code, 0, on.out);
  assert.equal(noNotice(rendered(on)).replace(`${T2}\n${CLEANER_PART}\n`, ''), none, 'on, the render differs only by the two parts, the cleaner\'s second');
  assert.equal(noNotice(rendered(renderWith(t, '{"schema": 1, "tools": []}'))), none);
  assert.ok(!none.includes('cleaner'), 'off, no rule names the cleaner');
});

// #438 C13: the fixed list, pinned.
test('the cleaner\'s deny rules are the eighteen fixed rules', () => {
  // #439 S1.1: `claude rm *` joins the sixteen git rules, last in each shell's run.
  const p = [...['worktree remove *', '* worktree remove *', 'branch -d *', '* branch -d *', 'branch -D *', '* branch -D *', 'branch --delete *', '* branch --delete *'].map(x => `git ${x}`), 'claude rm *'];
  assert.deepEqual([...CLEANER_DENY], [...p.map(x => `Bash(${x})`), ...p.map(x => `PowerShell(${x})`)]);
  assert.ok(Object.isFrozen(CLEANER_DENY));
  assert.equal(CLEANER_DENY.length, 18);
  assert.equal(CLEANER_DENY[8], 'Bash(claude rm *)', 'the ninth rule');
  assert.equal(CLEANER_DENY[17], 'PowerShell(claude rm *)', 'the eighteenth rule');
  // #464 T8: the copy the page shows is this one.
  assert.deepEqual([...SHARED_DENY], [...CLEANER_DENY]);
  assert.ok(Object.isFrozen(SHARED_DENY));
});

// #523 C19: the cleaner's two ask rules, pinned, held equal in both files, and matching the spellings the docs give.
test('the cleaner\'s ask rules are the two fixed rules, equal in both files, and match the override\'s spellings under a glob where * is any run of characters', () => {
  assert.deepEqual([...CLEANER_ASK], ['Bash(*cleaner.mjs*remove*--override*)', 'PowerShell(*cleaner.mjs*remove*--override*)']);
  assert.ok(Object.isFrozen(CLEANER_ASK));
  assert.deepEqual([...SHARED_ASK], [...CLEANER_ASK]);
  assert.ok(Object.isFrozen(SHARED_ASK));
  const glob = rule => {
    const inner = /^(?:Bash|PowerShell)\((.*)\)$/.exec(rule)[1];
    return new RegExp(`^${inner.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`, 's');
  };
  const pair = 'a=0123456789abcdef';
  const hit = [
    `node "$HOME/.claude/pact/tools/cleaner.mjs" remove --override ${pair}`,
    `node "C:/x/.claude/pact/tools/cleaner.mjs" remove --override ${pair}`,
    `env -u NODE_OPTIONS node ~/.claude/pact/tools/cleaner.mjs remove --yes 0123456789 --override ${pair}`,
    `node.exe C:\\x\\cleaner.mjs remove --override ${pair}`,
    `& node "C:/x/cleaner.mjs" remove --override ${pair}`,
    `$env:NODE_OPTIONS = $null; node "C:/x/cleaner.mjs" remove --override ${pair}`,
  ];
  const miss = ['node "$HOME/.claude/pact/tools/cleaner.mjs" show', 'node "$HOME/.claude/pact/tools/cleaner.mjs" remove --yes 0123456789'];
  for (const rule of CLEANER_ASK) {
    for (const c of hit) assert.ok(glob(rule).test(c), `${rule} should match ${c}`);
    for (const c of miss) assert.ok(!glob(rule).test(c), `${rule} should not match ${c}`);
  }
});

// #439 C9: the stop switch's eight rules, pinned, and held equal in both files.
test('the stop switch\'s deny rules are the eight fixed rules, equal in both files and frozen', () => {
  const p = ['claude stop *', 'claude kill *', 'claude daemon stop *', 'claude respawn *'];
  assert.deepEqual([...STOP_DENY], [...p.map(x => `Bash(${x})`), ...p.map(x => `PowerShell(${x})`)]);
  assert.equal(STOP_DENY.length, 8);
  assert.ok(Object.isFrozen(STOP_DENY));
  assert.deepEqual([...SHARED_STOP], [...STOP_DENY]);
  assert.ok(Object.isFrozen(SHARED_STOP));
});

// #439 C5: a model of Claude Code's matcher, as S2.1 states it, and only that.
// (a) a trailing ` *`, the rule's only wildcard, matches the bare command and
// the command followed by a space and any text; (b) a mid `*` matches any
// text, spaces included; (c) a deny rule applies to each part of a compound
// command; (d) PowerShell rules match case-insensitively. Whether Bash rules
// are case-sensitive is not stated, so no case here depends on it.
function denies(rule, command) {
  const [, tool, pattern] = /^(Bash|PowerShell)\((.*)\)$/.exec(rule);
  const flags = tool === 'PowerShell' ? 'i' : '';
  const esc = s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const body = pattern.split('*');
  const re = pattern.endsWith(' *') && body.length === 2
    ? new RegExp(`^${esc(pattern.slice(0, -2))}( .*)?$`, flags)
    : new RegExp(`^${body.map(esc).join('.*')}$`, flags);
  const parts = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (quote) { cur += ch; if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    const two = command.slice(i, i + 2);
    if (two === '&&' || two === '||') { parts.push(cur); cur = ''; i++; continue; }
    if (ch === ';' || ch === '|') { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  parts.push(cur);
  return parts.some(p => re.test(p.trim()));
}

const RM_RULES = CLEANER_DENY.filter(r => r.includes('claude rm'));

// #439 C5: each new rule matches its bad cases under the model above, and none of the neighbours.
test('the matcher model: the new rules match their bad cases and none of the neighbours', () => {
  assert.deepEqual(RM_RULES, ['Bash(claude rm *)', 'PowerShell(claude rm *)']);
  const shells = rules => rules.map(r => [r, r.startsWith('PowerShell')]);
  // Each stop-switch rule matches its own command in its bad cases; the PowerShell forms also the cased one (S2.1 d).
  const STOP_CASES = new Map([
    ['claude stop *', ['claude stop 3fa9c1', 'claude stop', 'git status && claude stop 3fa9c1']],
    ['claude kill *', ['claude kill 3fa9c1', 'claude kill', 'git status && claude kill 3fa9c1']],
    ['claude daemon stop *', ['claude daemon stop --any', 'claude daemon stop --any --keep-workers', 'claude daemon stop']],
    ['claude respawn *', ['claude respawn --all', 'claude respawn 7c5dcf5d', 'claude respawn']],
  ]);
  for (const [rule, ps] of shells(STOP_DENY)) {
    const pattern = rule.slice(rule.indexOf('(') + 1, -1);
    for (const c of STOP_CASES.get(pattern)) assert.ok(denies(rule, c), `${rule} matches ${c}`);
    if (ps) assert.ok(denies(rule, STOP_CASES.get(pattern)[0].replace(/^claude/, 'Claude')), `${rule} matches the cased form`);
  }
  for (const [rule, ps] of shells(RM_RULES)) {
    for (const c of ['claude rm 3fa9c1', 'claude rm', 'claude rm 3fa9c1 --force-remove-worktree --discard-unpushed']) assert.ok(denies(rule, c), `${rule} matches ${c}`);
    if (ps) assert.ok(denies(rule, 'Claude RM 3fa9c1'), `${rule} matches the cased form`);
  }
  const NEIGHBOURS = ['claude --bg -w pact-1 "stop it, then rm the file"', 'claude attach 3fa9c1', 'claude agents', 'git rm x', 'claude stopwatch', 'claude rmdir x', 'claude killall', 'claude daemon status', 'claude daemon logs', 'claude respawnable', 'claude kill-switch'];
  for (const rule of [...STOP_DENY, ...RM_RULES]) {
    for (const c of NEIGHBOURS) assert.ok(!denies(rule, c), `${rule} must not match ${c}`);
  }
  // The model can say no: the mid-`*` shape the spec rejects does catch a session start.
  assert.ok(denies('Bash(claude * stop *)', 'claude --bg -w pact-1 please stop it now'));
  // No new rule holds a `*` other than its trailing one.
  for (const rule of [...STOP_DENY, ...RM_RULES]) assert.equal(rule.split('*').length, 2, `${rule} holds one star`);
  for (const rule of [...STOP_DENY, ...RM_RULES]) assert.ok(rule.endsWith(' *)'), `${rule} ends with a space and a star`);
});
