// Pact tools in the gate (#280, T1): the renderer's tools key, its TOOLS line
// and the poster's rule part, and seam A's tool kind and its --tools argument.
// Each bad case is a table row that must fail with its exact rule ids. Every
// seam A case plants its own tool file. Nothing here installs;
// the install-tier tools file runs the install script.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { PACT_TOOLS as INSTALL_TOOLS } from '../install-core.mjs';
import { PACT_TOOLS } from '../shared.mjs';
import { renderStage, runCore, runSeamA } from './gate-run.mjs';
import { stage } from './payload.mjs';
import { moduleResult, table } from './tables.mjs';
import { REPO } from './text.mjs';
import { tempDir } from './tree.mjs';

const TOOL = 'claude/tools/poster.mjs';
const GOOD = "console.log('a tool');\n";

// ------------------------------------------------------------ the tools list (C3)

// #280 C3
test('the pact tool list is one list: the install keeps the same names in the same order', () => {
  assert.deepEqual([...INSTALL_TOOLS], [...PACT_TOOLS]);
  assert.deepEqual([...PACT_TOOLS], ['poster']);
  assert.ok(Object.isFrozen(PACT_TOOLS) && Object.isFrozen(INSTALL_TOOLS));
});

// ------------------------------------------------------------ seam A: the tool file (C3)

// #280 C3
for (const c of table('tool file', {
  module: 'gate/seam-a.mjs',
  base: () => ({ [TOOL]: GOOD }),
  run: (tree, t) => {
    const r = runSeamA(stage(t, tree), undefined, { tools: 'poster' });
    return moduleResult(r.code, r.stdout, r.stderr);
  },
  rows: [
    { id: 'subfolder', plant: t => ({ ...t, 'claude/tools/more/poster.mjs': GOOD }), fails: ['tool-path'], why: 'a tool is exactly claude/tools/<name>.mjs' },
    { id: 'unlisted-name', plant: t => ({ ...t, 'claude/tools/sender.mjs': GOOD }), fails: ['tool-file-name'], why: 'a second tool needs a gate change' },
    { id: 'not-a-module', plant: t => ({ ...t, 'claude/tools/poster.md': GOOD }), fails: ['tool-file-name'], why: 'only a .mjs file is a tool' },
    { id: 'name-in-capitals', plant: () => ({ 'claude/tools/Poster.mjs': GOOD }), fails: ['tool-file-name', 'tools-not-in-pact'], why: 'names are matched exactly, so poster is not in the stage' },
    { id: 'hidden-character', plant: t => ({ ...t, [TOOL]: "console.log('a\u200btool');\n" }), fails: ['invisible'], why: 'the text scanner reads a tool file' },
  ],
})) test(c.name, c.fn);

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
for (const c of table('seam a tools argument', {
  module: 'gate/seam-a.mjs',
  base: () => ({ [TOOL]: GOOD, argv: args('--tools', 'poster') }),
  run: ({ argv, ...tree }, t) => seamWith(t, tree, JSON.parse(argv)),
  rows: [
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
  ],
})) test(c.name, c.fn);

// #280 C3
test('seam A takes --tools before or after --commands', t => {
  const r = seamWith(t, { [TOOL]: GOOD }, ['--tools', 'poster', '--commands', 'none']);
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
for (const c of table('render tools key', {
  module: 'gate/render.mjs',
  base: () => ({ config: '{"schema": 1, "tools": ["poster"]}' }),
  run: ({ config }, t) => {
    const r = renderWith(t, config);
    return moduleResult(r.code, r.stdout, r.stderr);
  },
  rows: [
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
  ],
})) test(c.name, c.fn);

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

// The first clause of the sentence on a lens report's fence reads "A table, wrap or link refusal" since #317 (q3 B on that issue).
// T2's approved text (#280, revision 5, with the three clauses #285 carries
// and the four changes from #285's Test; the owner approved it as q2 on #285),
// byte for byte.
const T2 = [
  '- **Post through the poster.** On a repo your gh login owns, post to GitHub',
  '  with `node ~/.claude/pact/tools/poster.mjs` in a POSIX shell, or',
  '  `node "$HOME/.claude/pact/tools/poster.mjs"` in PowerShell. Write each piece',
  '  of free text to a file in a scratch folder outside the repo, and run the',
  '  poster from that folder, never from the repo. Delete a file once its post',
  '  ends, whatever the result (verified, failed, unverified, mismatch or',
  '  unavailable), or once you drop it; keep one refused for a lens report',
  '  until I have answered, then delete it. Before the session ends, delete',
  '  every such file still there, whatever my answer. `verified` means what',
  '  landed is what was sent: the scan is a backstop, and the review',
  "  procedure's read before posting still comes first. When it refuses your",
  '  own prose or a Lens dispositions table, fix it in place and post again;',
  '  never fold, fence, quote, relabel or move a table to get past the check,',
  '  and never rerun a lens for it. A table, wrap or link refusal on a line',
  '  inside a lens report means its fence is too short: fix the fence, never',
  '  the report. A lens report it refuses for a secret, a personal detail, a',
  '  local path, a session id or hidden characters stays local: tell me where',
  '  it is, in chat only, and never post it or edit it to get past the scan.',
  '  If it ends unavailable, refuses for a reason no text fix clears, or',
  "  refuses twice for a reason you can't explain, stop and tell me.",
].join('\n');
const KEEP_RECORD = '- **Keep the record where the project keeps it.**';
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
  assert.match(after, /^- \*\*Keep the record[^\n]*\n(?: {2}[^\n]*\n)+- \*\*Post through the poster\.\*\*/, 'straight after the record bullet');
  assert.ok(/Lens\s+dispositions\s+table/.test(T2) && /fix\s+the\s+fence/.test(T2), 'the table and fence clauses');
});

// #280 C6: each shell gets its own form; a $HOME form in POSIX or a tilde form in PowerShell would resolve under the folder it runs from.
test("the rule gives the PowerShell form only through $HOME and the POSIX form only through a tilde", () => {
  const forms = [...T2.replace(/\n {2}/g, ' ').matchAll(/`(node [^`]+)` in (a POSIX shell|PowerShell)/g)].map(m => [m[2], m[1]]);
  assert.deepEqual(forms, [['a POSIX shell', 'node ~/.claude/pact/tools/poster.mjs'], ['PowerShell', 'node "$HOME/.claude/pact/tools/poster.mjs"']]);
  assert.ok(!/[A-Za-z]:\\|\/Users\/|\/home\//.test(T2), 'no absolute path');
});

// render, #280 C6: the renderer fills the part only where the source holds it, and holds it empty.
for (const c of table('render tool part', {
  module: 'gate/render.mjs',
  base: () => ({ source: readFileSync(SOURCE, 'utf8').replace(/\r\n/g, '\n') }),
  run: ({ source }, t) => {
    const dir = tempDir(t, 'pact-render-source-');
    writeFileSync(join(dir, 'CLAUDE.md'), source);
    const r = renderWith(t, '{"schema": 1, "tools": ["poster"]}', { source: join(dir, 'CLAUDE.md') });
    return moduleResult(r.code, r.stdout, r.stderr);
  },
  rows: [
    { id: 'part-missing', plant: t => ({ source: t.source.replace('<!-- pact:begin tool-poster -->\n<!-- pact:end tool-poster -->\n', '') }), fails: ['render'], says: /tool-poster: the part is not in the source/, why: 'a source with no part has nowhere to put the rule' },
    { id: 'part-not-empty', plant: t => ({ source: t.source.replace('<!-- pact:begin tool-poster -->\n', '<!-- pact:begin tool-poster -->\n- A rule already here.\n') }), fails: ['render'], says: /tool-poster: the part is not empty in the source/, why: 'the rule replaces nothing' },
  ],
})) test(c.name, c.fn);

// #280 C6: the source holds the part empty, among the open marks, outside the six parts an edit may target.
test('the source holds the tool-poster part empty, after the record bullet', () => {
  const src = readFileSync(SOURCE, 'utf8').replace(/\r\n/g, '\n');
  const i = src.indexOf('<!-- pact:begin tool-poster -->\n<!-- pact:end tool-poster -->\n');
  assert.ok(i > src.indexOf(KEEP_RECORD) && i < src.indexOf('- **Say a mismatch first.**'), 'between the record bullet and the next one');
});
