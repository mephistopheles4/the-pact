// The Node install's decisions (#153, T2), in-process: every refusal in
// gate/install-core.mjs is a table row seen to fail with its rule id, beside a
// base that passes. The rest are plain cases over the pure functions. Nothing
// here installs; install-node.test.mjs runs the whole script.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import * as core from '../install-core.mjs';
import { GATE } from './text.mjs';
import { table } from './tables.mjs';

const sha256 = b => createHash('sha256').update(b).digest('hex');
const H = c => c.repeat(64);
const ID = c => c.repeat(40);

/** A decision's result in the table's terms: a pass, or a fail naming the refusal's rule. */
function decided(fn) {
  try {
    fn();
    return { code: 0, fails: [], last: 'RESULT: pass', out: '' };
  } catch (e) {
    if (e instanceof core.Refusal) return { code: 1, fails: [e.rule], last: 'RESULT: fail', out: `REFUSED: ${e.why} ${e.outcome}` };
    throw e;
  }
}
/** A plant that replaces `from` with `to` in the tree's one value `key`. */
const rep = (from, to, key = 'in') => t => ({ ...t, [key]: t[key].replace(from, to) });
const set = (v, key = 'in') => t => ({ ...t, [key]: v });
const json = v => JSON.stringify(v);

// ------------------------------------------------------------ the command line (S4, A3 to A6)

const winArgs = () => ({ in: json(['--claude-home', 'C:\\Users\\user\\.claude', '--apply', '--commit', ID('a'), '--rendered-hash', H('b'), '--review-folder', 'D:\\review out']) });
for (const c of table('command line on windows', {
  module: 'gate/install-core.mjs',
  base: winArgs,
  run: t => decided(() => core.parseArgs(JSON.parse(t.in), 'win32')),
  rows: [
    { id: 'unknown-word', plant: rep('"--apply"', '"--aply"'), fails: ['args-unread'], says: /holds 1 word the script does not read \(--aply\)/, why: 'a misspelled option is never dropped' },
    { id: 'repeated-option', plant: t => ({ in: json([...JSON.parse(t.in), '--apply']) }), fails: ['args-unread'], why: 'an option given twice' },
    { id: 'repeated-valued-option', plant: t => ({ in: json([...JSON.parse(t.in), '--claude-home', 'C:\\other']) }), fails: ['args-unread'], says: /2 words/, why: 'a second value can never replace the first' },
    { id: 'equals-form', plant: rep('"--commit","', '"--commit=x","'), fails: ['args-unread'], why: 'the --name=value form is not read' },
    { id: 'prefix-match', plant: rep('"--apply"', '"--app"'), fails: ['args-unread'], why: 'no prefix matching' },
    { id: 'single-dash', plant: rep('"--apply"', '"-a"'), fails: ['args-unread'], why: 'no PowerShell-style short name' },
    { id: 'other-case', plant: rep('"--apply"', '"--APPLY"'), fails: ['args-unread'], why: 'case-sensitive' },
    { id: 'en-dash', plant: rep('"--apply"', '"\u2013apply"'), fails: ['args-unread'], why: 'a dash PowerShell would not rewrite for a native command' },
    { id: 'stray-word', plant: t => ({ in: json([...JSON.parse(t.in), H('c')]) }), fails: ['args-unread'], says: /holds 1 word the script does not read\. /, why: 'a hash typed without its option, and its value never shown' },
    { id: 'no-value', plant: t => ({ in: json([...JSON.parse(t.in).filter(w => w !== '--rendered-hash' && w !== H('b')), '--rendered-hash']) }), fails: ['args-no-value'], why: 'an option with nothing after it' },
    { id: 'relative-home', plant: rep('C:\\\\Users\\\\user\\\\.claude', 'claude-home'), fails: ['path-not-full'], why: 'a relative path names a different folder per reader' },
    { id: 'drive-relative', plant: rep('C:\\\\Users\\\\user\\\\.claude', 'C:claude'), fails: ['path-not-full'], why: 'C:foo is relative to a drive' },
    { id: 'root-relative', plant: rep('C:\\\\Users\\\\user\\\\.claude', '\\\\claude'), fails: ['path-not-full'], why: '\\foo is relative to the current drive' },
    { id: 'unc', plant: rep('C:\\\\Users\\\\user\\\\.claude', '\\\\\\\\server\\\\share'), fails: ['path-network'], why: 'a typed network path' },
    { id: 'unc-forward', plant: rep('C:\\\\Users\\\\user\\\\.claude', '//server/share'), fails: ['path-network'], why: 'a typed network path with forward slashes' },
    { id: 'device-question', plant: rep('C:\\\\Users\\\\user\\\\.claude', '\\\\\\\\?\\\\C:\\\\x'), fails: ['path-network'], why: 'a device-namespace path' },
    { id: 'device-dot', plant: rep('C:\\\\Users\\\\user\\\\.claude', '\\\\\\\\.\\\\C:\\\\x'), fails: ['path-network'], why: 'a device-namespace path' },
    { id: 'plain-quote', plant: rep('review out', "review'out"), fails: ['path-chars'], why: 'a quote would break the printed apply line' },
    { id: 'double-quote', plant: rep('review out', 'review\\"out'), fails: ['path-chars'], why: 'a double quote' },
    { id: 'left-single-curly', plant: rep('review out', 'review\u2018out'), fails: ['path-chars'], why: 'PowerShell reads a curly quote as a quote' },
    { id: 'right-single-curly', plant: rep('review out', 'review\u2019out'), fails: ['path-chars'], why: 'PowerShell reads a curly quote as a quote' },
    { id: 'left-double-curly', plant: rep('review out', 'review\u201cout'), fails: ['path-chars'], why: 'a curly double quote' },
    { id: 'right-double-curly', plant: rep('review out', 'review\u201dout'), fails: ['path-chars'], why: 'a curly double quote' },
    { id: 'control-character', plant: rep('review out', 'review\\u0007out'), fails: ['path-chars'], why: 'a control character' },
    { id: 'line-separator', plant: rep('review out', 'review\u2028out'), fails: ['path-chars'], why: 'a line separator' },
    { id: 'semicolon', plant: rep('review out', 'review;out'), fails: ['path-chars'], why: 'a statement separator' },
    { id: 'dollar', plant: rep('review out', 'review$out'), fails: ['path-chars'], why: 'a variable' },
    { id: 'backtick', plant: rep('review out', 'review`out'), fails: ['path-chars'], why: "PowerShell's escape" },
    { id: 'ampersand', plant: rep('review out', 'review&out'), fails: ['path-chars'], why: 'a call operator' },
    { id: 'stream-colon', plant: rep('review out', 'review:out'), fails: ['path-chars'], why: 'a colon past the drive names a stream' },
    { id: 'review-and-project', plant: t => ({ in: json([...JSON.parse(t.in), '--project-folder', 'C:\\proj']) }), fails: ['args-review-project'], why: 'a project install writes no review output' },
    { id: 'apply-without-commit', plant: t => ({ in: json(JSON.parse(t.in).filter(w => w !== '--commit' && w !== ID('a'))) }), fails: ['args-apply-commit'], why: 'every apply is bound to a dry run the owner saw' },
  ],
})) test(c.name, c.fn);

const unixArgs = () => ({ in: json(['--claude-home', '/home/user/.claude', '--project-folder', '/work/my project']) });
for (const c of table('command line on unix', {
  module: 'gate/install-core.mjs',
  base: unixArgs,
  run: t => decided(() => core.parseArgs(JSON.parse(t.in), 'linux')),
  rows: [
    { id: 'relative', plant: rep('/home/user/.claude', 'home/.claude'), fails: ['path-not-full'], why: 'a relative path' },
    { id: 'windows-drive', plant: rep('/home/user/.claude', 'C:/home'), fails: ['path-not-full'], why: 'a drive path is not full on Unix' },
    { id: 'backslash-root', plant: rep('/home/user/.claude', '\\\\home'), fails: ['path-not-full'], why: 'the Windows rule holds on every OS' },
    { id: 'double-slash', plant: rep('/home/user/.claude', '//server/share'), fails: ['path-network'], why: 'a typed network path' },
    { id: 'shell-metacharacter', plant: rep('my project', 'my|project'), fails: ['path-chars'], why: 'a pipe' },
    { id: 'tilde', plant: rep('/home/user/.claude', '~/.claude'), fails: ['path-not-full'], why: 'a shell expansion is not a full path' },
  ],
})) test(c.name, c.fn);

test('the command line: the base parses to its values, and an option given without --apply is still read', () => {
  const o = core.parseArgs(JSON.parse(winArgs().in), 'win32');
  assert.equal(o.apply, true);
  assert.equal(o.commit, ID('a'));
  assert.equal(o.renderedHash, H('b'));
  assert.deepEqual(o.paths, [['--claude-home', 'C:\\Users\\user\\.claude'], ['--review-folder', 'D:\\review out']]);
  const dry = core.parseArgs(['--rendered-hash', ''], 'win32');
  assert.equal(dry.renderedHash, '', 'an empty hash is given, so it is compared');
  assert.equal(core.parseArgs([], 'linux').apply, false);
});

test('the command line: a refusal never shows a value, only cleaned option names', () => {
  const r = decided(() => core.parseArgs(['--claude-home', 'C:\\secret-folder', '--x;y', 'C:\\secret-value'], 'win32'));
  assert.equal(r.code, 1);
  assert.ok(!r.out.includes('secret'), r.out);
  assert.match(r.out, /\(--x\?y\)/);
});

test('the command line: a value typed after = in an option word is never shown, only the name before it', () => {
  const r = decided(() => core.parseArgs(['--claude-home=C:\\SECRETMARK\\x'], 'win32'));
  assert.deepEqual(r.fails, ['args-unread']);
  assert.ok(!r.out.includes('SECRETMARK'), r.out);
  assert.match(r.out, /\(--claude-home\)/);
});

test('the apply line quotes each path and carries --project-folder, the commit and the hash (S12)', () => {
  const o = core.parseArgs(['--project-folder', 'C:\\work\\my project', '--claude-home', 'C:\\h'], 'win32');
  assert.equal(core.applyLine(o.paths, ID('a'), H('b'), 'win32'), `$env:NODE_OPTIONS = $null; node gate/install.mjs --claude-home 'C:\\h' --project-folder 'C:\\work\\my project' --apply --commit ${ID('a')} --rendered-hash ${H('b')}`);
  assert.equal(core.applyLine([], ID('a'), null, 'linux'), `env -u NODE_OPTIONS node gate/install.mjs --apply --commit ${ID('a')}`);
});

// ------------------------------------------------------------ the commit's tree (G7, G9)

const rec = (mode, type, id, rel) => `${mode} ${type} ${id}\t${rel}\0`;
const treeBase = () => ({ in: [rec('100644', 'blob', ID('1'), 'AGENTS.md'), rec('100644', 'blob', ID('2'), 'claude/CLAUDE.md'), rec('100644', 'blob', ID('3'), 'gate/seam-a.mjs'), rec('100755', 'blob', ID('4'), 'scripts/run.sh'), rec('100644', 'blob', ID('5'), 'gate/tests/x.test.mjs')].join('') });
for (const c of table('commit tree', {
  module: 'gate/install-core.mjs',
  base: treeBase,
  run: t => decided(() => core.parseTree(Buffer.from(t.in))),
  rows: [
    { id: 'bad-record', plant: t => ({ in: `${t.in}garbage\0` }), fails: ['tree-record'], why: 'a record git would never print' },
    { id: 'executable-mode', plant: rep(`100644 blob ${ID('2')}`, `100755 blob ${ID('2')}`), fails: ['tree-mode'], why: 'only plain files install' },
    { id: 'symlink-mode', plant: rep(`100644 blob ${ID('3')}`, `120000 blob ${ID('3')}`), fails: ['tree-mode'], why: 'a link in the commit' },
    { id: 'gitlink', plant: t => ({ in: `${t.in}${rec('160000', 'commit', ID('6'), 'claude/sub')}` }), fails: ['tree-mode'], why: 'a submodule in a staged folder' },
    { id: 'space-in-path', plant: rep('claude/CLAUDE.md', 'claude/CLAU DE.md'), fails: ['tree-segment'], why: 'a character outside the safe set' },
    { id: 'non-ascii-path', plant: rep('claude/CLAUDE.md', 'claude/CL\u00c4UDE.md'), fails: ['tree-segment'], why: 'a non-ASCII name' },
    { id: 'dot-dot-segment', plant: rep('gate/seam-a.mjs', 'gate/../seam-a.mjs'), fails: ['tree-segment'], why: 'a parent segment' },
    { id: 'case-collision', plant: t => ({ in: `${t.in}${rec('100644', 'blob', ID('7'), 'claude/claude.md')}` }), fails: ['tree-case'], why: 'two paths one folding file system writes as one' },
  ],
})) test(c.name, c.fn);

test('the commit tree: only the staged set is checked, and gate/tests is dropped', () => {
  const staged = core.parseTree(Buffer.from(treeBase().in));
  assert.deepEqual([...staged.keys()], ['AGENTS.md', 'claude/CLAUDE.md', 'gate/seam-a.mjs']);
  assert.ok(core.isStaged('cross/cross.mjs') && !core.isStaged('cross/other.mjs') && !core.isStaged('gate/tests/a.mjs'));
});

for (const c of table('staged blob', {
  module: 'gate/install-core.mjs',
  base: () => ({ id: ID('a'), actual: ID('a') }),
  run: t => decided(() => core.checkStagedBlob('claude/x.md', t.id, t.actual)),
  rows: [{ id: 'bytes-not-blob', plant: set(ID('b'), 'actual'), fails: ['stage-blob'], why: 'a staged file that changed after the bootstrap wrote it' }],
})) test(c.name, c.fn);

// ------------------------------------------------------------ the install record (G5, G6)

const recordBase = () => ({ in: json({ commit: ID('a'), digest: null, config: [], files: [{ path: 'CLAUDE.md', sha256: H('b') }], gate: [] }) });
for (const c of table('install record', {
  module: 'gate/install-core.mjs',
  base: recordBase,
  run: t => decided(() => core.parseRecord(t.in)),
  rows: [
    { id: 'not-json', plant: rep('{', '{,'), fails: ['record-unreadable'], why: 'a record that does not parse' },
    { id: 'no-commit', plant: rep(`"commit":"${ID('a')}",`, ''), fails: ['record-not-pact'], why: 'a record must name its commit' },
    { id: 'empty-commit', plant: rep(ID('a'), ''), fails: ['record-not-pact'], why: 'an empty commit is no commit' },
    { id: 'no-files', plant: t => ({ in: json({ ...JSON.parse(t.in), files: undefined }) }), fails: ['record-not-pact'], why: 'a record must list its files' },
    { id: 'empty-files', plant: t => ({ in: json({ ...JSON.parse(t.in), files: [] }) }), fails: ['record-not-pact'], why: 'an empty list is falsy to PowerShell too' },
    { id: 'keys-differ-in-case', plant: rep('"digest"', '"Commit":"x","digest"'), fails: ['record-unreadable'], why: 'PowerShell refused keys that differ only in case' },
  ],
})) test(c.name, c.fn);

test('the install record: keys are read without regard to case, a BOM is dropped, and ill-typed configuration entries are ignored', () => {
  const r = core.parseRecord(`\ufeff${json({ COMMIT: ID('a'), Files: [{ Path: 'x', SHA256: 'AB' }, 'junk'], config: [{ kind: 'user', sha256: H('c') }, { kind: 'block', sha256: H('d') }, { kind: 5, sha256: H('e') }], digest: 'ABCDEF012345', gate: [{ path: 'gate/a.mjs', sha256: H('f') }] })}`);
  assert.equal(r.commit, ID('a'));
  assert.deepEqual(r.files, [{ path: 'x', sha256: 'AB' }, { path: null, sha256: '' }]);
  assert.deepEqual([...r.config], [['user', H('c')]]);
  assert.equal(r.digest, null, 'a digest in capitals is not one');
  assert.deepEqual(r.gate, [['gate/a.mjs', H('f')]]);
  assert.equal(core.parseRecord(null), null);
});

test('the record the install writes keeps today\'s shape and order', () => {
  const text = core.recordText({ commit: ID('a'), digest: null, userHash: null, blockHashes: new Map(), repoFiles: new Map([['CLAUDE.md', H('b')]]), gateNow: new Map([['gate/x.mjs', H('c')]]) });
  assert.deepEqual(JSON.parse(text), { commit: ID('a'), digest: null, config: [], files: [{ path: 'CLAUDE.md', sha256: H('b') }], gate: [{ path: 'gate/x.mjs', sha256: H('c') }] });
  assert.ok(text.endsWith('}\n'));
  const back = core.parseRecord(core.recordText({ commit: ID('a'), digest: 'abcdef012345', userHash: H('1'), blockHashes: new Map([['a.md', H('2')]]), repoFiles: new Map([['x', H('3')]]), gateNow: new Map() }));
  assert.deepEqual([...back.config], [['user', H('1')], ['block a.md', H('2')]]);
  assert.equal(back.digest, 'abcdef012345');
});

// ------------------------------------------------------------ the gate's fingerprints (G11) and the cutover line (S9)

test('the gate block: changed, added and removed lines, compared without regard to case, and the self-differs warning', () => {
  const now = new Map([['gate/a.mjs', H('a')], ['gate/b.mjs', H('b')], ['gate/new.mjs', H('c')]]);
  assert.deepEqual(core.gateBlock(now, [], false), ['Gate: no gate recorded at the last install']);
  assert.deepEqual(core.gateBlock(now, [['gate/a.mjs', H('A')], ['gate/b.mjs', H('d')], ['gate/old\u0007.mjs', H('e')]], true), ['Gate: CHANGED since the last install', '  changed gate/b.mjs', '  added gate/new.mjs', '  removed gate/old?.mjs', 'WARN: this install script differs from the committed copy; --apply will refuse.']);
  assert.deepEqual(core.gateBlock(now, [...now], false), ['Gate: unchanged since the last install']);
});

test('the gate block names the cutover only when the change set is exactly the PowerShell installer out and the four install files in', () => {
  const rest = [['gate/seam-a-core.mjs', H('a')]];
  const now = new Map([...rest, ...core.INSTALL_FILES.map((f, i) => [f, H(String(i))])]);
  const then = [...rest, [core.OLD_INSTALLER, H('9')]];
  assert.match(core.gateBlock(now, then, false).at(-1), /expected change of the first Node install/);
  const changedToo = core.gateBlock(now, [['gate/seam-a-core.mjs', H('b')], [core.OLD_INSTALLER, H('9')]], false);
  assert.ok(!changedToo.some(l => /expected change/.test(l)), 'a changed core prints as today');
  const fewer = new Map([...now].filter(([k]) => k !== 'gate/install-io.mjs'));
  assert.ok(!core.gateBlock(fewer, then, false).some(l => /expected change/.test(l)), 'three of four is not the cutover');
});

// ------------------------------------------------------------ the pin (P1) and a check's verdict (R4, S-1, control 4)

for (const c of table('pin file', {
  module: 'gate/install-core.mjs',
  base: () => ({ in: `commit ${ID('a')}\nsha256 ${H('b')}\n`, sha: H('b') }),
  run: t => decided(() => core.parsePin(t.in, t.sha)),
  rows: [
    { id: 'crlf', plant: rep(/\n/g, '\r\n'), fails: ['pin-format'], why: 'exact bytes only' },
    { id: 'extra-line', plant: t => ({ ...t, in: `${t.in}x\n` }), fails: ['pin-format'], why: 'nothing after the hash' },
    { id: 'capital-hex', plant: rep(ID('a'), ID('A')), fails: ['pin-format'], why: 'lower-case hex only' },
    { id: 'script-not-pinned', plant: set(H('c'), 'sha'), fails: ['pin-mismatch'], why: 'an edited pinned script' },
  ],
})) test(c.name, c.fn);

for (const c of table('check verdict', {
  module: 'gate/install-core.mjs',
  base: () => ({ in: json({ lines: ['PASS x', 'RESULT: pass'], failed: false }) }),
  run: t => decided(() => core.checkVerdict(JSON.parse(t.in), 'the check')),
  rows: [
    { id: 'failed-with-pass-line', plant: rep('"failed":false', '"failed":true'), fails: ['verdict-failed'], why: 'a non-zero exit refuses even with a RESULT: pass line' },
    { id: 'no-result-line', plant: rep('"RESULT: pass"', '"done"'), fails: ['verdict-last-line'], why: 'no RESULT line' },
    { id: 'result-not-last', plant: rep('"RESULT: pass"]', '"RESULT: pass","x"]'), fails: ['verdict-last-line'], why: 'anything after the pass' },
    { id: 'pass-line-split', plant: rep('"RESULT: pass"', '"RESULT: pass\\nRESULT: fail"'), fails: ['verdict-last-line'], why: 'a line holding a newline is read as two, as the wrapper prints it' },
  ],
})) test(c.name, c.fn);

// ------------------------------------------------------------ the renderer's lines (R5 to R8)

const U = H('7');
const digestOf = text => sha256(Buffer.from(text, 'ascii')).slice(0, 12);
const D = digestOf(`user ${U}\nblock a.md ${H('e')}\n`);
const renderBase = () => ({ in: [`RENDERED ${H('a')}`, `DIFF ${H('d')}`, `CONFIG user ${U}`, `EDIT move-2 replace ${H('e')} a.md`, `DIGEST ${D}`, 'VALUE usage-pause 90', `AGENT data-lens sonnet high ${H('f')} security-set override local`, 'RESULT: pass'].join('\n') });
const renderRun = (project = false) => t => decided(() => core.parseRenderLines(t.in.split('\n'), { project, hash: sha256 }));
const noConfig = t => ({ in: t.in.replace(`CONFIG user ${U}`, 'CONFIG none') });
const noneBase = () => ({ in: [`RENDERED ${H('a')}`, `DIFF ${H('d')}`, 'CONFIG none', 'RESULT: pass'].join('\n') });
for (const c of table('renderer lines', {
  module: 'gate/install-core.mjs',
  base: renderBase,
  run: renderRun(),
  rows: [
    { id: 'two-output-hashes', plant: rep('DIFF', `RENDERED ${H('b')}\nDIFF`), fails: ['render-two-hashes'], why: 'two output hashes' },
    { id: 'hash-line-with-more', plant: rep(`RENDERED ${H('a')}`, `RENDERED ${H('a')} x`), fails: ['render-unknown-line'], why: 'anything after the hash' },
    { id: 'two-diff-hashes', plant: rep('CONFIG', `DIFF ${H('c')}\nCONFIG`), fails: ['render-two-diffs'], why: 'two diff hashes' },
    { id: 'no-diff-hash', plant: rep(`DIFF ${H('d')}\n`, ''), fails: ['render-counts'], why: 'no diff hash' },
    { id: 'no-output-hash', plant: rep(`RENDERED ${H('a')}\n`, ''), fails: ['render-counts'], why: 'no output hash' },
    { id: 'no-config-line', plant: rep(`CONFIG user ${U}\n`, ''), fails: ['render-counts'], why: 'no configuration line' },
    { id: 'two-config-lines', plant: rep('DIGEST', 'CONFIG none\nDIGEST'), fails: ['render-counts'], why: 'a user and a none configuration line' },
    { id: 'unknown-line', plant: rep('VALUE', 'INSTALL x y z\nVALUE'), fails: ['render-unknown-line'], why: 'a line that could feed another parse' },
    { id: 'edit-twice', plant: rep('DIGEST', 'EDIT move-2 remove\nDIGEST'), fails: ['render-edit-twice'], why: 'one open part edited twice' },
    { id: 'block-dot-dot', plant: rep(' a.md', ' ../a.md'), fails: ['render-block-path'], why: 'a block path with a .. segment' },
    { id: 'block-trailing-dot', plant: rep(' a.md', ' a.md.'), fails: ['render-block-path'], why: 'a block path ending in a dot' },
    { id: 'block-two-hashes', plant: rep('DIGEST', `EDIT move-3 replace ${H('9')} a.md\nDIGEST`), fails: ['render-block-changed'], why: 'a block that changed while it was read' },
    { id: 'part-not-open', plant: rep('EDIT move-2', 'EDIT move-5'), fails: ['render-unknown-line'], why: 'an edit to a part that is not open' },
    { id: 'gated-clause', plant: rep('EDIT move-2', 'EDIT security-route'), fails: ['render-unknown-line'], why: 'an edit to a gated clause' },
    { id: 'remove-names-file', plant: rep(`replace ${H('e')} a.md`, 'remove a.md'), fails: ['render-unknown-line'], why: 'a remove that names a file' },
    { id: 'block-left-out-of-digest', plant: rep(`DIGEST ${D}`, `DIGEST ${digestOf(`user ${U}\n`)}`), fails: ['render-digest'], why: 'a digest that leaves a block out' },
    { id: 'digest-not-the-hashes', plant: rep(`DIGEST ${D}`, 'DIGEST 0123456789ab'), fails: ['render-digest'], why: "a digest that is not the reported hashes'" },
    { id: 'no-digest', plant: rep(`DIGEST ${D}\n`, ''), fails: ['render-digest'], why: 'no digest with a configuration' },
    { id: 'two-digests', plant: rep('VALUE', `DIGEST ${D}\nVALUE`), fails: ['render-two-digests'], why: 'two digests' },
    { id: 'digest-wrong-length', plant: rep(`DIGEST ${D}`, `DIGEST ${D}0`), fails: ['render-unknown-line'], why: 'a digest of the wrong length' },
    { id: 'value-twice', plant: rep('VALUE usage-pause 90', 'VALUE usage-pause 90\nVALUE usage-pause 80'), fails: ['render-value-twice'], why: 'one setting twice' },
    { id: 'value-unknown-setting', plant: rep('VALUE usage-pause', 'VALUE other-thing'), fails: ['render-unknown-line'], why: 'a value for no known setting' },
    { id: 'value-out-of-range', plant: rep('usage-pause 90', 'usage-pause 101'), fails: ['render-unknown-line'], why: 'a value out of range' },
    { id: 'agent-twice', plant: rep('RESULT', `AGENT data-lens opus high ${H('f')} security-set override local\nRESULT`), fails: ['render-agent-twice'], why: 'one agent setting twice' },
    { id: 'agent-not-configurable', plant: rep('AGENT data-lens', 'AGENT scout'), fails: ['render-unknown-line'], why: 'an agent the configuration cannot set' },
    { id: 'agent-in-capitals', plant: rep('AGENT data-lens', 'AGENT Data-lens'), fails: ['render-unknown-line'], why: 'names are matched case-sensitively' },
    { id: 'digest-with-no-config', plant: t => noConfig(t), fails: ['render-none-extras'], why: 'a digest, value, edit or agent with no configuration' },
  ],
})) test(c.name, c.fn);

for (const c of table('renderer lines with no configuration', {
  module: 'gate/install-core.mjs',
  base: noneBase,
  run: renderRun(),
  rows: [
    { id: 'digest', plant: rep('RESULT', `DIGEST ${D}\nRESULT`), fails: ['render-none-extras'], why: 'a digest with no configuration' },
    { id: 'value', plant: rep('RESULT', 'VALUE usage-pause 90\nRESULT'), fails: ['render-none-extras'], why: 'a value with no configuration' },
    { id: 'edit', plant: rep('RESULT', 'EDIT move-1 remove\nRESULT'), fails: ['render-none-extras'], why: 'an edit with no configuration' },
    { id: 'agent', plant: rep('RESULT', `AGENT data-lens opus high ${H('f')} security-set override local\nRESULT`), fails: ['render-none-extras'], why: 'an agent setting with no configuration' },
  ],
})) test(c.name, c.fn);

for (const c of table('renderer lines on a project install', {
  module: 'gate/install-core.mjs',
  base: noneBase,
  run: renderRun(true),
  rows: [{ id: 'stage-render-read-config', plant: () => renderBase(), fails: ['render-project-config'], why: "the stage's render must read no configuration" }],
})) test(c.name, c.fn);

test('the renderer lines: the parse gives the hashes, the configuration, the edits, the values and the agent settings', () => {
  const p = core.parseRenderLines(renderBase().in.split('\n'), { project: false, hash: sha256 });
  assert.equal(p.renderHash, H('a'));
  assert.equal(p.digest, D);
  assert.deepEqual([...p.blockHashes], [['a.md', H('e')]]);
  assert.deepEqual(p.agentSets.get('data-lens'), { model: 'sonnet', effort: 'high', sha256: H('f'), security: true, override: true, egress: false });
  assert.deepEqual([...core.configNow(p)], [['user', U], ['block a.md', H('e')]]);
});

// ------------------------------------------------------------ the project install (J1 to J4)

const projCheckBase = () => ({ in: json({ lines: ['ROOT C:\\work\\proj', 'STATE new', 'RESULT: pass'], failed: false }) });
for (const c of table('project check', {
  module: 'gate/install-core.mjs',
  base: projCheckBase,
  run: t => decided(() => core.parseProjectCheck(JSON.parse(t.in), 'win32')),
  rows: [
    { id: 'failed', plant: rep('"failed":false', '"failed":true'), fails: ['project-check'], why: 'the project module refused the folder' },
    { id: 'no-pass-line', plant: rep('"RESULT: pass"', '"RESULT: fail"'), fails: ['project-check'], why: 'both parts of the verdict' },
    { id: 'extra-line', plant: rep('"STATE new",', '"STATE new","NOTE x",'), fails: ['project-check-lines'], why: 'exactly three lines' },
    { id: 'no-root-line', plant: rep('"ROOT C:\\\\work\\\\proj"', '"PATH C:\\\\work\\\\proj"'), fails: ['project-check-lines'], why: 'the folder first' },
    { id: 'root-not-full', plant: rep('ROOT C:\\\\work', 'ROOT work'), fails: ['project-check-root'], why: 'a real path is a full path' },
    { id: 'unknown-state', plant: rep('STATE new', 'STATE old'), fails: ['project-check-state'], why: 'new or update with a hash' },
    { id: 'update-short-hash', plant: rep('STATE new', `STATE update ${'a'.repeat(63)}`), fails: ['project-check-state'], why: 'a full hash' },
  ],
})) test(c.name, c.fn);

test('the project check: the root is parsed, never shown, and the state read', () => {
  assert.deepEqual(core.parseProjectCheck({ lines: ['ROOT /w/p', `STATE update ${H('a')}`, 'RESULT: pass'], failed: false }, 'linux'), { root: '/w/p', state: { kind: 'update', sha256: H('a') } });
  assert.equal(decided(() => core.checkProjectLinks(null)).code, 0);
  assert.deepEqual(decided(() => core.checkProjectLinks('.claude/rules')).fails, ['project-link']);
});

const PF = H('3');
const PD = digestOf(`user ${U}\nproject ${PF}\n`);
const projRenderBase = () => ({ in: [`RENDERED ${H('a')}`, `CONFIG user ${U}`, `PROJECT ${PF}`, `DIGEST ${PD}`, 'VALUE usage-pause 60', 'RESULT: pass'].join('\n') });
for (const c of table('project render lines', {
  module: 'gate/install-core.mjs',
  base: projRenderBase,
  run: t => decided(() => core.parseProjectRenderLines(t.in.split('\n'), sha256)),
  rows: [
    { id: 'two-output-hashes', plant: rep('CONFIG', `RENDERED ${H('b')}\nCONFIG`), fails: ['project-render-two-hashes'], why: 'two output hashes' },
    { id: 'two-user-lines', plant: rep('PROJECT', 'CONFIG none\nPROJECT'), fails: ['project-render-two-users'], why: 'two user configuration lines' },
    { id: 'two-project-hashes', plant: rep('DIGEST', `PROJECT ${H('4')}\nDIGEST`), fails: ['project-render-two-files'], why: 'two project file hashes' },
    { id: 'two-digests', plant: rep('VALUE', `DIGEST ${PD}\nVALUE`), fails: ['project-render-two-digests'], why: 'two digests' },
    { id: 'value-twice', plant: rep('RESULT', 'VALUE usage-pause 50\nRESULT'), fails: ['project-render-value-twice'], why: 'one setting twice' },
    { id: 'unknown-line', plant: rep('RESULT', 'DIFF x\nRESULT'), fails: ['project-render-unknown-line'], why: 'a line the install does not read' },
    { id: 'no-value', plant: rep('VALUE usage-pause 60\n', ''), fails: ['project-render-counts'], why: 'a project configuration sets a value' },
    { id: 'no-project-hash', plant: rep(`PROJECT ${PF}\n`, ''), fails: ['project-render-counts'], why: 'the project file is named' },
    { id: 'digest-wrong', plant: rep(`DIGEST ${PD}`, `DIGEST ${digestOf(`project ${PF}\n`)}`), fails: ['project-render-digest'], why: 'the digest leaves the user file out' },
    { id: 'no-digest', plant: rep(`DIGEST ${PD}\n`, ''), fails: ['project-render-digest'], why: 'a digest is required' },
  ],
})) test(c.name, c.fn);

test('the project render with no user file: the digest is the project file\'s alone', () => {
  const p = core.parseProjectRenderLines([`RENDERED ${H('a')}`, 'CONFIG none', `PROJECT ${PF}`, `DIGEST ${digestOf(`project ${PF}\n`)}`, 'VALUE usage-pause 60', 'RESULT: pass'], sha256);
  assert.equal(p.user, null);
  const block = core.projectBlock({ kind: 'update', sha256: H('a') }, p);
  assert.ok(block.includes('  rules file .claude/rules/pact-project.md: unchanged'));
  assert.ok(block.includes("  user configuration pact/config.json: none (the defaults bound the project's values)"));
});

for (const c of table('project output', {
  module: 'gate/install-core.mjs',
  base: () => ({ in: json([{ name: 'pact-project.md', file: true, link: false, size: 100 }]), hash: H('a') }),
  run: t => decided(() => core.checkProjectOutput(JSON.parse(t.in), t.hash, H('a'))),
  rows: [
    { id: 'second-file', plant: t => ({ ...t, in: json([...JSON.parse(t.in), { name: 'x', file: true, link: false, size: 1 }]) }), fails: ['project-output'], why: 'exactly the rules file' },
    { id: 'other-name', plant: rep('pact-project.md', 'pact.md'), fails: ['project-output'], why: 'by its exact name' },
    { id: 'a-link', plant: rep('"link":false', '"link":true'), fails: ['project-output'], why: 'a plain file' },
    { id: 'over-64kib', plant: rep('"size":100', `"size":${64 * 1024 + 1}`), fails: ['project-output'], why: 'at most 64 KiB' },
    { id: 'hash-not-reported', plant: set(H('b'), 'hash'), fails: ['project-rules-hash'], why: 'the reported bytes' },
  ],
})) test(c.name, c.fn);

for (const c of table('project write', {
  module: 'gate/install-core.mjs',
  base: () => ({ in: json({ lines: [`WROTE ${H('a')} ${H('b')}`, 'RESULT: pass'], failed: false }) }),
  run: t => decided(() => core.parseProjectWrite(JSON.parse(t.in), H('a'))),
  rows: [
    { id: 'other-hash', plant: rep(`WROTE ${H('a')}`, `WROTE ${H('c')}`), fails: ['project-write'], why: 'the bytes the dry run showed' },
    { id: 'extra-line', plant: rep('"RESULT: pass"', '"x","RESULT: pass"'), fails: ['project-write'], why: 'exactly two lines' },
    { id: 'failed', plant: rep('"failed":false', '"failed":true'), fails: ['project-write'], says: /may hold what the write left/, why: 'both parts of the verdict, and the refusal says what may be left' },
  ],
})) test(c.name, c.fn);

// ------------------------------------------------------------ the render output (R9, R10)

const outBase = () => ({ in: json([{ name: 'CLAUDE.md', file: true, link: false, size: 10 }, { name: 'config.diff', file: true, link: false, size: 0 }, { name: 'agent-data-lens.md', file: true, link: false, size: 5 }]) });
for (const c of table('render output', {
  module: 'gate/install-core.mjs',
  base: outBase,
  run: t => decided(() => core.checkRenderOutput(JSON.parse(t.in), ['data-lens'])),
  rows: [
    { id: 'second-file', plant: t => ({ in: json([...JSON.parse(t.in), { name: 'extra', file: true, link: false, size: 1 }]) }), fails: ['render-output'], why: 'a file the renderer should not leave' },
    { id: 'no-diff', plant: t => ({ in: json(JSON.parse(t.in).filter(e => e.name !== 'config.diff')) }), fails: ['render-output'], why: 'no diff file' },
    { id: 'no-agent-file', plant: t => ({ in: json(JSON.parse(t.in).filter(e => e.name !== 'agent-data-lens.md')) }), fails: ['render-output'], why: 'an AGENT line with no file' },
    { id: 'rules-is-folder', plant: rep('"name":"CLAUDE.md","file":true', '"name":"CLAUDE.md","file":false'), fails: ['render-output'], why: 'a folder in place of the rules file' },
    { id: 'diff-is-link', plant: rep('"name":"config.diff","file":true,"link":false', '"name":"config.diff","file":true,"link":true'), fails: ['render-output'], why: 'a link in the output' },
    { id: 'rules-over-1mib', plant: rep('"size":10', `"size":${1024 * 1024 + 1}`), fails: ['render-output'], why: 'a rules file over its cap' },
    { id: 'file-over-4mib', plant: rep('"size":0', `"size":${4 * 1024 * 1024 + 1}`), fails: ['render-output'], why: 'any file over 4 MiB' },
  ],
})) test(c.name, c.fn);

for (const c of table('rendered hashes', {
  module: 'gate/install-core.mjs',
  base: () => ({ rules: H('a'), diff: H('d') }),
  run: t => decided(() => core.checkRenderedHashes(t, { renderHash: H('a'), diffHash: H('d') })),
  rows: [
    { id: 'rules-hash', plant: set(H('b'), 'rules'), fails: ['render-rules-hash'], why: 'a renderer that reports a hash other than its output' },
    { id: 'diff-hash', plant: set(H('b'), 'diff'), fails: ['render-diff-hash'], why: "a diff hash that is not its diff's" },
  ],
})) test(c.name, c.fn);

const AGENT_OLD = '---\nname: data-lens\ndescription: d\ntools: [Read, Glob, Grep]\nmodel: opus\neffort: high\n---\nBody.\n';
const AGENT_NEW = AGENT_OLD.replace('model: opus', 'model: sonnet');
const agentBase = () => ({ old: AGENT_OLD, new: AGENT_NEW, set: json({ model: 'sonnet', effort: 'high', security: true, override: true, egress: false }) });
const agentRun = t => {
  const s = JSON.parse(t.set);
  const neu = Buffer.from(t.new, 'latin1');
  return decided(() => core.checkAgentFile('data-lens', { ...s, sha256: sha256(neu) }, t.old === 'NONE' ? null : Buffer.from(t.old, 'latin1'), t.size ? Buffer.alloc(Number(t.size)) : neu, t.hash ?? sha256(neu)));
};
for (const c of table('agent file', {
  module: 'gate/install-core.mjs',
  base: agentBase,
  run: agentRun,
  rows: [
    { id: 'not-committed', plant: set('NONE', 'old'), fails: ['agent-not-committed'], why: 'a setting for an agent the commit lacks' },
    { id: 'over-1mib', plant: t => ({ ...t, size: String(1024 * 1024 + 1) }), fails: ['agent-too-big'], why: 'a rendered agent over its cap' },
    { id: 'hash-not-reported', plant: t => ({ ...t, hash: H('0') }), fails: ['agent-hash'], why: 'a rendered agent file other than the reported one' },
    { id: 'rendered-not-utf8', plant: rep('Body.', 'Body.\xff', 'new'), fails: ['agent-utf8'], why: 'strict UTF-8 only' },
    { id: 'committed-not-utf8', plant: rep('Body.', 'Body.\xff', 'old'), fails: ['agent-utf8'], why: 'strict UTF-8 only' },
    { id: 'body-changed', plant: rep('Body.', 'Bodies.', 'new'), fails: ['agent-lines'], why: 'a change outside the frontmatter' },
    { id: 'description-changed', plant: rep('description: d', 'description: e', 'new'), fails: ['agent-lines'], why: 'a frontmatter line other than model and effort' },
    { id: 'tools-changed', plant: rep('tools: [Read, Glob, Grep]', 'tools: [Read, Glob, Grep, Bash]', 'new'), fails: ['agent-lines'], why: 'a lens gaining a tool through its rendered file' },
    { id: 'model-not-reported', plant: rep('"model":"sonnet"', '"model":"opus"', 'set'), fails: ['agent-lines'], why: 'the file must hold the reported values' },
    { id: 'two-model-lines', plant: t => ({ ...t, old: t.old.replace('description: d', 'model: x'), new: t.new.replace('description: d', 'model: sonnet') }), fails: ['agent-lines'], why: 'exactly one model line' },
    { id: 'line-count-differs', plant: rep('Body.\n', 'Body.\n\n', 'new'), fails: ['agent-lines'], why: 'a line added' },
    { id: 'override-word-false', plant: rep('"override":true', '"override":false', 'set'), fails: ['agent-override'], why: 'a changed file called default' },
    { id: 'override-word-true', plant: t => ({ ...t, new: AGENT_OLD, set: t.set.replace('"model":"sonnet"', '"model":"opus"') }), fails: ['agent-override'], why: 'an unchanged file called override' },
    { id: 'no-tools-line', plant: t => ({ ...t, old: t.old.replace('tools: [Read, Glob, Grep]\n', 'x: y\n'), new: t.new.replace('tools: [Read, Glob, Grep]\n', 'x: y\n') }), fails: ['agent-tools'], why: 'exactly one tools line in the committed file' },
    { id: 'egress-word-wrong', plant: rep('"egress":false', '"egress":true', 'set'), fails: ['agent-egress'], why: 'a read-only lens called egress' },
    { id: 'egress-not-security', plant: t => ({ ...t, old: t.old.replace('Grep]', 'Grep, Bash]'), new: t.new.replace('Grep]', 'Grep, Bash]'), set: t.set.replace('"security":true', '"security":false').replace('"egress":false', '"egress":true') }), fails: ['agent-egress-security'], why: 'an egress lens is security-set' },
  ],
})) test(c.name, c.fn);

// ------------------------------------------------------------ seam A's copy set and overlay (S-2, S-3)

const staged = new Map([['claude/CLAUDE.md', H('1')], ['claude/agents/a.md', H('2')], ['familiars/scout.md', H('3')], ['familiars/scout.contract.md', H('4')], ['cross/cross.mjs', H('5')], ['gate/x.mjs', H('6')], ['AGENTS.md', H('7')], [core.OVERLAY_REL, H('8')]]);
const copyBase = () => ({ in: [`INSTALL ${H('1')} claude/CLAUDE.md CLAUDE.md`, `INSTALL ${H('2')} claude/agents/a.md agents/a.md`, `INSTALL ${H('3')} familiars/scout.md agents/scout.md`, `INSTALL ${H('5')} cross/cross.mjs pact/cross.mjs`, 'RESULT: pass'].join('\n') });
for (const c of table('copy set', {
  module: 'gate/install-core.mjs',
  base: copyBase,
  run: t => decided(() => core.matchCopySet(t.in.split('\n'), core.expectedCopySet(staged.keys()), staged, ID('a'))),
  rows: [
    { id: 'listed-twice', plant: rep('RESULT', `INSTALL ${H('2')} claude/agents/a.md agents/a.md\nRESULT`), fails: ['copy-set-twice'], why: 'one file listed twice' },
    { id: 'file-left-off', plant: rep(`INSTALL ${H('2')} claude/agents/a.md agents/a.md\n`, ''), fails: ['copy-set-mismatch'], why: 'a seam A that leaves a file off its list' },
    { id: 'file-added', plant: rep('RESULT', `INSTALL ${H('7')} AGENTS.md AGENTS.md\nRESULT`), fails: ['copy-set-mismatch'], why: 'a file that never installs' },
    { id: 'other-destination', plant: rep('pact/cross.mjs', 'agents/cross.mjs'), fails: ['copy-set-mismatch'], why: 'the cross script sent to another live path' },
    { id: 'other-hash', plant: rep(`INSTALL ${H('1')}`, `INSTALL ${H('0')}`), fails: ['copy-set-mismatch'], why: 'bytes other than the staged ones' },
    { id: 'case-differs', plant: rep('claude/agents/a.md agents/a.md', 'claude/agents/A.md agents/a.md'), fails: ['copy-set-mismatch'], why: 'matched case-sensitively, as seam A matches' },
  ],
})) test(c.name, c.fn);

test('the copy set: contracts, practice tests, the overlay, AGENTS.md, gate files and .gitkeep never install', () => {
  const e = core.expectedCopySet(['claude/CLAUDE.md', 'claude/settings.overlay.json', 'familiars/.gitkeep', 'familiars/x.practice-test.md', 'familiars/x.contract.md', 'familiars/x.md', 'gate/a.mjs', 'AGENTS.md', 'cross/cross.mjs']);
  assert.deepEqual([...e], [['claude/CLAUDE.md', 'CLAUDE.md'], ['familiars/x.md', 'agents/x.md'], ['cross/cross.mjs', 'pact/cross.mjs']]);
});

const OVERLAY = json({ permissions: { defaultMode: 'auto', ask: ['PowerShell(x)'] } });
const overlayBase = () => ({ in: [`SETTINGS ${sha256(OVERLAY)} claude/settings.overlay.json`, 'RESULT: pass'].join('\n'), staged: sha256(OVERLAY), text: OVERLAY });
for (const c of table('settings overlay', {
  module: 'gate/install-core.mjs',
  base: overlayBase,
  run: t => decided(() => core.checkOverlay(t.in.split('\n'), sha256(t.text), t.staged === 'NONE' ? undefined : t.staged, t.text)),
  rows: [
    { id: 'no-settings-line', plant: rep(/^SETTINGS .*\n/, ''), fails: ['overlay-line'], why: 'seam A must report the overlay' },
    { id: 'two-settings-lines', plant: t => ({ ...t, in: `${t.in.split('\n')[0]}\n${t.in}` }), fails: ['overlay-line'], why: 'exactly one overlay hash' },
    { id: 'other-path', plant: rep('claude/settings.overlay.json', 'claude/other.json'), fails: ['overlay-line'], why: 'the overlay at its one path' },
    { id: 'no-overlay', plant: set('NONE', 'staged'), fails: ['overlay-missing'], why: 'a commit with no overlay' },
    { id: 'hash-not-checked', plant: t => ({ ...t, text: t.text.replace('auto', 'plan') }), fails: ['overlay-hash'], why: 'bytes other than the ones seam A passed' },
    { id: 'staged-hash-differs', plant: set(H('0'), 'staged'), fails: ['overlay-hash'], why: 'the commit holds other bytes' },
    { id: 'not-an-object', plant: t => ({ in: `SETTINGS ${sha256('[1]')} claude/settings.overlay.json\nRESULT: pass`, staged: sha256('[1]'), text: '[1]' }), fails: ['overlay-not-object'], why: 'the overlay must be one JSON object' },
  ],
})) test(c.name, c.fn);

// ------------------------------------------------------------ destinations and the plan (L1 to L3)

const noLink = () => false;
for (const c of table('install destinations', {
  module: 'gate/install-core.mjs',
  base: () => ({ in: json([['claude/CLAUDE.md', 'CLAUDE.md'], ['claude/agents/a.md', 'agents/a.md']]), link: '' }),
  run: t => decided(() => core.installDestinations(new Map(JSON.parse(t.in).map(([rel, dest]) => [rel, { dest, sha256: H('1') }])), rel => rel === t.link)),
  rows: [
    { id: 'unsafe', plant: rep('"agents/a.md"', '"../a.md"'), fails: ['dest-skip'], why: 'a destination outside the home folder' },
    { id: 'rooted', plant: rep('"agents/a.md"', '"/etc/a.md"'), fails: ['dest-skip'], why: 'a rooted destination' },
    { id: 'protected', plant: rep('"agents/a.md"', '"settings.json"'), fails: ['dest-skip'], why: "the owner's settings" },
    { id: 'protected-alias', plant: rep('"agents/a.md"', '"Settings.json. "'), fails: ['dest-skip'], why: 'Windows drops trailing dots and spaces' },
    { id: 'non-canonical', plant: rep('"agents/a.md"', '"agents/a.md."'), fails: ['dest-skip'], why: 'a name that is not plain' },
    { id: 'through-link', plant: set('agents/a.md', 'link'), fails: ['dest-skip'], why: 'a live agents folder that is a link' },
    { id: 'two-sources', plant: rep('"agents/a.md"', '"claude.md"'), fails: ['dest-twice'], why: 'two sources for one live path, folded' },
  ],
})) test(c.name, c.fn);

test('skip reasons: unsafe, protected, non-canonical and linked paths, as the PowerShell installer read them', () => {
  for (const p of ['', '../x', 'a/../b', '/x', '\\x', 'C:x', null, 5]) assert.equal(core.skipReason(p, noLink), 'unsafe path', String(p));
  for (const p of ['settings.json', 'SETTINGS.JSON', '.pact-install.json', 'pact/config.json', 'pact/config.json:stream', 'x/.credentials.json', 'projects/a', 'memory', 'skills/x/y', 'handover/z', 'pact/blocks/b.md']) assert.equal(core.skipReason(p, noLink), 'protected path', p);
  for (const p of ['agents/a b.md', 'agents/.x', 'agents/a.', 'a\\b']) assert.equal(core.skipReason(p, noLink), 'non-canonical path', p);
  assert.equal(core.skipReason('agents/a.md', () => true), 'path through a link');
  assert.equal(core.skipReason('agents/a.md', noLink), null);
});

test('the plan: drift, overwrite, add, delete and unchanged; a record hash in capitals is not drift; a first install deletes only the retired agents', () => {
  const liveFiles = new Map([['CLAUDE.md', H('1')], ['agents/a.md', H('9')], ['agents/old.md', H('3')], ['agents/builder.md', H('4')], ['agents/gone.md', null]]);
  const live = rel => (liveFiles.has(rel) ? { exists: true, file: liveFiles.get(rel) !== null, sha256: liveFiles.get(rel) } : { exists: false, file: false, sha256: null });
  const repoFiles = new Map([['CLAUDE.md', H('1')], ['agents/a.md', H('2')], ['agents/new.md', H('5')]]);
  const record = core.parseRecord(json({ commit: 'x', files: [{ path: 'CLAUDE.md', sha256: H('1').toUpperCase() }, { path: 'agents/old.md', sha256: H('3') }, { path: 'agents/a.md', sha256: H('8') }, { path: 'settings.json', sha256: H('0') }, { path: 'agents/missing.md', sha256: H('7') }] }));
  const p = core.plan(record, repoFiles, live, noLink);
  assert.deepEqual(p.drift, ['agents/a.md (changed since the install)', 'agents/missing.md (deleted since the install)']);
  assert.deepEqual(p.overwrite, ['agents/a.md']);
  assert.deepEqual(p.add, ['agents/new.md']);
  assert.deepEqual(p.delete, ['agents/old.md']);
  assert.deepEqual(p.warnings, ['protected path in the install record, skipped: settings.json']);
  assert.equal(p.same, 1);
  assert.deepEqual(core.plan(null, repoFiles, live, noLink).delete, ['agents/builder.md']);
});

// ------------------------------------------------------------ settings JSON and the merge (S8, L4 to L9)

test('S8: a number round-trips byte for byte, on the Node running the suite', () => {
  const text = '{"a":12345678901234567890.10,"b":[1e400,-0.0,0.1]}';
  const m = core.readSettings(text);
  assert.equal(core.settingsText(m), `${JSON.stringify(JSON.parse(text), null, 2).replace('12345678901234567000', '12345678901234567890.10').replace('null,\n    0,', '1e400,\n    -0.0,')}\n`);
  assert.match(core.settingsText(m), /"a": 12345678901234567890\.10,/);
  assert.match(core.settingsText(m), /1e400,\n\s+-0\.0,\n\s+0\.1\n/);
});

test('settings are read strictly: comments, trailing commas, another root and more than 64 levels are not an object; a BOM is dropped; the last of two keys wins', () => {
  for (const bad of ['{"a":1,}', '{/*c*/"a":1}', '[1]', '"x"', '1', 'null', '']) assert.equal(core.readSettings(bad), null, bad);
  assert.equal(core.readSettings(`${'['.repeat(64)}${']'.repeat(64)}`), null, 'not an object');
  assert.ok(core.readSettings(`{"a":${'['.repeat(63)}${']'.repeat(63)}}`) instanceof Map, '64 levels');
  assert.equal(core.readSettings(`{"a":${'['.repeat(64)}${']'.repeat(64)}}`), null, '65 levels');
  assert.equal(core.readSettings('\ufeff{"a":"x","a":"y"}').get('a'), 'y');
  assert.equal(core.readSettings('{"Permissions":{}}').has('permissions'), false, 'case-sensitive keys');
});

test('a __proto__ key in the live file or the overlay is a plain key, and pollutes nothing', () => {
  const live = core.readSettings('{"__proto__":{"polluted":true},"permissions":{"allow":["a"]}}');
  const overlay = core.readSettings('{"__proto__":{"also":true},"permissions":{"ask":["x"]}}');
  const merged = core.mergeSettings(live, overlay);
  assert.equal({}.polluted, undefined);
  assert.equal({}.also, undefined);
  const text = core.settingsText(merged);
  assert.deepEqual(Object.keys(JSON.parse(text)), ['__proto__', 'permissions']);
  assert.match(text, /"__proto__": \{\n\s+"polluted": true,\n\s+"also": true/);
});

test('the merge: the overlay wins, objects merge, the plugin keys stay the owner\'s, and rule lists are unioned and sorted ordinally (#110)', () => {
  const live = core.readSettings(json({ enabledPlugins: { mine: true }, env: { MINE: '1' }, model: 'x', permissions: { allow: ['b', 'B', 'a'], ask: ['z'], defaultMode: 'plan' } }));
  const overlay = core.readSettings(json({ enabledPlugins: { theirs: true }, env: { PACT: '1' }, model: 'y', permissions: { defaultMode: 'auto', ask: ['z', 'Y', '\u00e9'] } }));
  const m = JSON.parse(core.settingsText(core.mergeSettings(live, overlay)));
  assert.deepEqual(m.enabledPlugins, { mine: true });
  assert.deepEqual(m.env, { MINE: '1', PACT: '1' });
  assert.equal(m.model, 'y');
  assert.deepEqual(m.permissions, { allow: ['B', 'a', 'b'], ask: ['Y', 'z', '\u00e9'], defaultMode: 'auto' });
});

test('the changes are told from the overlay\'s side, rules escaped, and a live value never printed', () => {
  const live = core.readSettings(json({ env: { SECRET_THING: 'hunter2' }, permissions: { ask: ['a'] }, model: 'secretmodel' }));
  const overlay = core.readSettings(json({ env: { SECRET_THING: 'pact' }, permissions: { ask: ['a', 'PowerShell(*\u2013*)'] }, model: 'opus', other: { k: 1 } }));
  const lines = core.settingsChanges(live, overlay);
  assert.deepEqual(lines, ['  set env.SECRET_THING = "pact"', '  + permissions.ask: PowerShell(*\\u2013*)', '  set model = "opus"', '  set other = {"k":1}']);
  assert.ok(!lines.join('\n').includes('hunter2') && !lines.join('\n').includes('secretmodel'));
  assert.deepEqual(core.settingsChanges(core.readSettings('{"b":{"y":2,"x":1}}'), core.readSettings('{"b":{"x":1,"y":2}}')), [], 'a reorder is no change');
});

test('the live warnings: banned keys at any depth, missing ask rules, a mode not auto, own keys capped, env names only counted', () => {
  const own = Object.fromEntries(Array.from({ length: 22 }, (_, i) => [`k${String(i).padStart(2, '0')}`, 1]));
  const live = core.readSettings(json({ ...own, enabledPlugins: {}, deep: { x: [{ hooks: {} }] }, env: { A: 1, B: 2, P: 3 }, permissions: { ask: ['r1'], defaultMode: 'plan' } }));
  const overlay = core.readSettings(json({ env: { P: '1' }, permissions: { ask: ['r1', 'r2'] } }));
  const lines = core.liveSettingsLines(live, overlay, ['r1', 'r2']);
  assert.equal(lines[0], 'WARN: settings.json holds hooks, a command-running setting the pact never sets.');
  assert.equal(lines[1], "WARN: settings.json lacks 1 of the pact's ask rules; --apply adds them back.");
  assert.equal(lines[2], 'WARN: settings.json: permissions.defaultMode is not auto; --apply sets it.');
  assert.match(lines[3], /^NOTE: live keys the pact does not set \(yours, not checked\): deep, enabledPlugins, k00, .* and 4 more$/);
  assert.equal(lines[4], 'NOTE: live env names the pact does not set: 2');
});

test('bad case: a live rule that differs from a pact rule only by an invisible character is missing, not matched (#110)', () => {
  const rule = 'Bash(*nstall.mjs*)';
  for (const c of ['\u00ad', '\u200b', '\u2060']) {
    const near = rule.replace('nstall', `ns${c}tall`);
    const live = core.readSettings(json({ permissions: { ask: [near], defaultMode: 'auto' } }));
    const overlay = core.readSettings(json({ permissions: { ask: [rule] } }));
    assert.equal(core.liveSettingsLines(live, overlay, [rule])[0], "WARN: settings.json lacks 1 of the pact's ask rules; --apply adds them back.", JSON.stringify(c));
    assert.equal(core.guardHolds(live, [rule]), false, JSON.stringify(c));
  }
});

test('the guard after an apply: every pact ask rule exactly, and auto mode', () => {
  const ok = core.readSettings(json({ permissions: { defaultMode: 'auto', ask: ['a', 'b', 'c'] } }));
  assert.ok(core.guardHolds(ok, ['a', 'b']));
  assert.ok(!core.guardHolds(ok, ['A']), 'compared exactly');
  assert.ok(!core.guardHolds(core.readSettings(json({ permissions: { defaultMode: 'Auto', ask: ['a'] } })), ['a']));
  assert.ok(!core.guardHolds(null, []));
});

// ------------------------------------------------------------ binding and apply (H1, X1)

for (const c of table('hash and commit binding', {
  module: 'gate/install-core.mjs',
  base: () => ({ in: json({ renderedHash: H('a'), commit: ID('c') }) }),
  run: t => decided(() => core.checkBinding(JSON.parse(t.in), H('a'), ID('c'))),
  rows: [
    { id: 'wrong-hash', plant: rep(H('a'), H('b')), fails: ['hash-mismatch'], why: 'a configuration changed since the dry run' },
    { id: 'first-63', plant: rep(H('a'), 'a'.repeat(63)), fails: ['hash-mismatch'], why: 'a hash cut short' },
    { id: 'digest-length', plant: rep(H('a'), 'a'.repeat(12)), fails: ['hash-mismatch'], why: 'the digest is not the hash' },
    { id: 'capitals', plant: rep(H('a'), 'A'.repeat(64)), fails: ['hash-mismatch'], why: 'compared exactly' },
    { id: 'trailing-space', plant: rep(H('a'), `${H('a')} `), fails: ['hash-mismatch'], why: 'compared exactly' },
    { id: 'empty-hash', plant: rep(H('a'), ''), fails: ['hash-mismatch'], why: 'a hash given is compared even when empty' },
    { id: 'wrong-commit', plant: rep(ID('c'), ID('d')), fails: ['commit-mismatch'], why: 'the clone changed since the dry run' },
    { id: 'short-commit', plant: rep(ID('c'), 'c'.repeat(7)), fails: ['commit-mismatch'], why: 'the full id only' },
  ],
})) test(c.name, c.fn);

test('the binding: nothing given is nothing compared', () => {
  assert.equal(decided(() => core.checkBinding({ renderedHash: null, commit: null }, H('a'), ID('c'))).code, 0);
});

const applyBase = () => ({ in: json({ configApplies: true, hashGiven: true, selfDiffers: false, drift: false, dirty: false, settingsObject: true }) });
for (const c of table('apply refusals', {
  module: 'gate/install-core.mjs',
  base: applyBase,
  run: t => decided(() => core.checkApply(JSON.parse(t.in))),
  rows: [
    { id: 'no-hash-with-config', plant: rep('"hashGiven":true', '"hashGiven":false'), fails: ['apply-needs-hash'], why: 'a configuration applies' },
    { id: 'self-differs', plant: rep('"selfDiffers":false', '"selfDiffers":true'), fails: ['apply-self-differs'], why: 'an uncommitted edit to the install script' },
    { id: 'drift', plant: rep('"drift":false', '"drift":true'), fails: ['apply-drift'], says: /owner's decision/, why: 'live files changed since the last install' },
    { id: 'dirty', plant: rep('"dirty":false', '"dirty":true'), fails: ['apply-dirty'], why: 'the working tree is not clean' },
    { id: 'settings-not-object', plant: rep('"settingsObject":true', '"settingsObject":false'), fails: ['apply-settings'], why: "the guard can't be merged" },
  ],
})) test(c.name, c.fn);

test('apply: no configuration needs no hash', () => {
  assert.equal(decided(() => core.checkApply({ configApplies: false, hashGiven: false, selfDiffers: false, drift: false, dirty: false, settingsObject: true })).code, 0);
});

// ------------------------------------------------------------ the runner's start and its review (S3, V1)

const workBase = () => ({ in: json({ parentReal: 'C:\\T', tmpReal: 'c:\\t', name: 'pact-install-Ab12', hasGit: false, runnerReal: 'C:\\T\\pact-install-Ab12\\stage\\gate\\install-run.mjs', expectedRunnerReal: 'c:\\t\\pact-install-ab12\\stage\\gate\\install-run.mjs', fold: true }) });
for (const c of table('runner work folder', {
  module: 'gate/install-core.mjs',
  base: workBase,
  run: t => decided(() => core.checkWorkFolder(JSON.parse(t.in))),
  rows: [
    { id: 'not-in-temp', plant: rep('"parentReal":"C:\\\\T"', '"parentReal":"C:\\\\repo"'), fails: ['run-work-folder'], why: 'run from the clone' },
    { id: 'other-name', plant: rep('"name":"pact-install-Ab12"', '"name":"stage"'), fails: ['run-work-folder'], why: 'a folder the bootstrap did not make' },
    { id: 'holds-git', plant: rep('"hasGit":false', '"hasGit":true'), fails: ['run-work-folder'], why: 'a work folder that is a repo' },
    { id: 'runner-elsewhere', plant: rep('"runnerReal":"C:\\\\T', '"runnerReal":"C:\\\\X'), fails: ['run-work-folder'], why: 'the runner is not the stage copy' },
    { id: 'case-on-unix', plant: rep('"fold":true', '"fold":false'), fails: ['run-work-folder'], why: 'case is folded only where the system folds it' },
  ],
})) test(c.name, c.fn);

for (const c of table('runner command line', {
  module: 'gate/install-core.mjs',
  base: () => ({ in: json(['/tmp/pact-install-x', ID('a'), '3', 'no', '--', '--apply']) }),
  run: t => decided(() => core.parseRunnerArgs(JSON.parse(t.in))),
  rows: [
    { id: 'no-separator', plant: rep('"--",', ''), fails: ['run-args'], why: "the bootstrap's shape only" },
    { id: 'short-commit', plant: rep(ID('a'), 'a'.repeat(7)), fails: ['run-args'], why: 'a full commit id' },
    { id: 'bad-count', plant: rep('"3"', '"-1"'), fails: ['run-args'], why: 'a count of paths' },
    { id: 'bad-self', plant: rep('"no"', '"maybe"'), fails: ['run-args'], why: 'yes or no' },
  ],
})) test(c.name, c.fn);

for (const c of table('review lines', {
  module: 'gate/install-core.mjs',
  base: () => ({ in: json({ lines: [`REVIEW ${H('a')} ${H('d')}`, 'RESULT: pass'], failed: false }) }),
  run: t => decided(() => core.checkReviewLines(JSON.parse(t.in), H('a'), H('d'))),
  rows: [
    { id: 'other-hashes', plant: rep(`REVIEW ${H('a')}`, `REVIEW ${H('b')}`), fails: ['review-failed'], why: 'a review module that reports other hashes than this run rendered' },
    { id: 'extra-line', plant: rep('"RESULT: pass"', '"x","RESULT: pass"'), fails: ['review-failed'], why: 'exactly two lines' },
    { id: 'failed', plant: rep('"failed":false', '"failed":true'), fails: ['review-failed'], why: 'both parts of the verdict' },
  ],
})) test(c.name, c.fn);

// ------------------------------------------------------------ printing (control 5, L8) and pinned lists

test('a check line is cleaned, cut and prefixed; at most 400 are shown', () => {
  assert.equal(core.formatCheckLine('a\u001b[31mb\u202ec\u2028d', 'seam-a'), 'seam-a| a?[31mb?c?d');
  assert.equal(core.formatCheckLine('x'.repeat(301), 'r'), `r| ${'x'.repeat(300)}...`);
  const shown = core.showLines(Array.from({ length: 402 }, (_, i) => `l${i}`), 'p');
  assert.equal(shown.length, 401);
  assert.equal(shown.at(-1), 'p| (2 more lines not shown)');
  assert.deepEqual(core.outputLines(['a\nb', '', 'c']), ['a', 'b', 'c']);
  assert.equal(core.formatRule('Bash(\\ \u2013 x)'), 'Bash(\\u005c \\u2013 x)');
});

test('the configurable agents and the banned settings are the renderer\'s and seam A\'s lists', () => {
  const list = (file, name) => {
    const m = new RegExp(`const ${name} = Object\\.freeze\\(\\[([^\\]]*)\\]`).exec(readFileSync(join(GATE, file), 'utf8'));
    return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
  };
  assert.deepEqual([...core.AGENT_NAMES], list('render-core.mjs', 'CONFIGURABLE_AGENTS'));
  assert.deepEqual([...core.BANNED_SETTINGS], list('seam-a-core.mjs', 'BANNED_SETTINGS'));
});

test('the configuration block: a removed configuration, changed and new files, warnings, and the security override sentence', () => {
  const record = core.parseRecord(json({ commit: 'x', files: ['f'], config: [{ kind: 'user', sha256: H('0') }, { kind: 'block', path: 'gone.md', sha256: H('9') }] }));
  const none = core.parseRenderLines(noneBase().in.split('\n'), { project: false, hash: sha256 });
  assert.deepEqual(core.configBlock(none, H('a'), record), ['  no configuration', '  the last install had a configuration; this install removes it from the rules file']);
  const p = core.parseRenderLines(renderBase().in.split('\n'), { project: false, hash: sha256 });
  const b = core.configBlock(p, H('a'), record);
  assert.equal(b[0], `  user file pact/config.json: sha256 ${U}, CHANGED since the last install`);
  assert.equal(b[1], `  block file pact/blocks/a.md: sha256 ${H('e')}, new since the last install`);
  assert.equal(b[2], '  1 block file(s) the last install read are no longer used');
  assert.match(b.find(l => l.includes('data-lens')), /security-set lens, so this is an override, not security-tested/);
  assert.ok(core.configStale(core.configNow(p), record.config));
  assert.ok(!core.configStale(new Map([['user', H('0')]]), new Map([['user', H('0')]])));
});
