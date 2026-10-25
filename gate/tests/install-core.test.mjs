// The Node install's decisions (#153, T2), in-process: every refusal in
// gate/install-core.mjs is a row seen to fail with its rule id, beside a
// base that passes. The rest are plain cases over the pure functions. Nothing
// here installs; install-node.test.mjs runs the whole script.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import * as core from '../install-core.mjs';
import { GATE, REPO, assertFails, assertPasses } from './text.mjs';

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
{
  const base = winArgs;
  const run = t => decided(() => core.parseArgs(JSON.parse(t.in), 'win32'));
  const rows = [
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
  ];
  test('command line on windows: base passes', async t => assertPasses(await run(base(), t)));
  for (const r of rows) test(`command line on windows: ${r.id}`, async t => assertFails(await run(r.plant(base()), t), r.fails, r.says));
  test('command line on windows: base passes after the rows', async t => assertPasses(await run(base(), t)));
}

const unixArgs = () => ({ in: json(['--claude-home', '/home/user/.claude', '--project-folder', '/work/my project']) });
{
  const base = unixArgs;
  const run = t => decided(() => core.parseArgs(JSON.parse(t.in), 'linux'));
  const rows = [
    { id: 'relative', plant: rep('/home/user/.claude', 'home/.claude'), fails: ['path-not-full'], why: 'a relative path' },
    { id: 'windows-drive', plant: rep('/home/user/.claude', 'C:/home'), fails: ['path-not-full'], why: 'a drive path is not full on Unix' },
    { id: 'backslash-root', plant: rep('/home/user/.claude', '\\\\home'), fails: ['path-not-full'], why: 'the Windows rule holds on every OS' },
    { id: 'double-slash', plant: rep('/home/user/.claude', '//server/share'), fails: ['path-network'], why: 'a typed network path' },
    { id: 'shell-metacharacter', plant: rep('my project', 'my|project'), fails: ['path-chars'], why: 'a pipe' },
    { id: 'tilde', plant: rep('/home/user/.claude', '~/.claude'), fails: ['path-not-full'], why: 'a shell expansion is not a full path' },
    { id: 'relative-project', plant: rep('/work/my project', 'work/my project'), fails: ['path-not-full'], why: 'the project folder is held to the same rule as the home folder' },
  ];
  test('command line on unix: base passes', async t => assertPasses(await run(base(), t)));
  for (const r of rows) test(`command line on unix: ${r.id}`, async t => assertFails(await run(r.plant(base()), t), r.fails, r.says));
  test('command line on unix: base passes after the rows', async t => assertPasses(await run(base(), t)));
}

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
{
  const base = treeBase;
  const run = t => decided(() => core.parseTree(Buffer.from(t.in)));
  const rows = [
    { id: 'bad-record', plant: t => ({ in: `${t.in}garbage\0` }), fails: ['tree-record'], why: 'a record git would never print' },
    { id: 'executable-mode', plant: rep(`100644 blob ${ID('2')}`, `100755 blob ${ID('2')}`), fails: ['tree-mode'], why: 'only plain files install' },
    { id: 'symlink-mode', plant: rep(`100644 blob ${ID('3')}`, `120000 blob ${ID('3')}`), fails: ['tree-mode'], why: 'a link in the commit' },
    { id: 'gitlink', plant: t => ({ in: `${t.in}${rec('160000', 'commit', ID('6'), 'claude/sub')}` }), fails: ['tree-mode'], why: 'a submodule in a staged folder' },
    { id: 'space-in-path', plant: rep('claude/CLAUDE.md', 'claude/CLAU DE.md'), fails: ['tree-segment'], why: 'a character outside the safe set' },
    { id: 'non-ascii-path', plant: rep('claude/CLAUDE.md', 'claude/CL\u00c4UDE.md'), fails: ['tree-segment'], why: 'a non-ASCII name' },
    { id: 'dot-dot-segment', plant: rep('gate/seam-a.mjs', 'gate/../seam-a.mjs'), fails: ['tree-segment'], why: 'a parent segment' },
    { id: 'case-collision', plant: t => ({ in: `${t.in}${rec('100644', 'blob', ID('7'), 'claude/claude.md')}` }), fails: ['tree-case'], why: 'two paths one folding file system writes as one' },
  ];
  test('commit tree: base passes', async t => assertPasses(await run(base(), t)));
  for (const r of rows) test(`commit tree: ${r.id}`, async t => assertFails(await run(r.plant(base()), t), r.fails, r.says));
  test('commit tree: base passes after the rows', async t => assertPasses(await run(base(), t)));
}

// #280 C2: the poster stages with the rest of the payload; a folder outside the staged set stages nothing.
test('the commit tree: only the staged set is checked, and gate/tests is dropped', () => {
  const staged = core.parseTree(Buffer.from(treeBase().in));
  assert.deepEqual([...staged.keys()], ['AGENTS.md', 'claude/CLAUDE.md', 'gate/seam-a.mjs']);
  assert.ok(core.isStaged('claude/tools/poster.mjs') && !core.isStaged('tools/poster.mjs') && !core.isStaged('docs/x.mjs') && !core.isStaged('gate/tests/a.mjs') && core.isStaged('gate/seam-a.mjs'));
});

{
  const base = () => ({ id: ID('a'), actual: ID('a') });
  const run = t => decided(() => core.checkStagedBlob('claude/x.md', t.id, t.actual));
  const rows = [{ id: 'bytes-not-blob', plant: set(ID('b'), 'actual'), fails: ['stage-blob'], why: 'a staged file that changed after the bootstrap wrote it' }];
  test('staged blob: base passes', async t => assertPasses(await run(base(), t)));
  for (const r of rows) test(`staged blob: ${r.id}`, async t => assertFails(await run(r.plant(base()), t), r.fails, r.says));
  test('staged blob: base passes after the rows', async t => assertPasses(await run(base(), t)));
}

// ------------------------------------------------------------ the install record (G5, G6)

const recordBase = () => ({ in: json({ commit: ID('a'), digest: null, config: [], files: [{ path: 'CLAUDE.md', sha256: H('b') }], gate: [] }) });
{
  const base = recordBase;
  const run = t => decided(() => core.parseRecord(t.in));
  const rows = [
    { id: 'not-json', plant: rep('{', '{,'), fails: ['record-unreadable'], why: 'a record that does not parse' },
    { id: 'no-commit', plant: rep(`"commit":"${ID('a')}",`, ''), fails: ['record-not-pact'], why: 'a record must name its commit' },
    { id: 'empty-commit', plant: rep(ID('a'), ''), fails: ['record-not-pact'], why: 'an empty commit is no commit' },
    { id: 'no-files', plant: t => ({ in: json({ ...JSON.parse(t.in), files: undefined }) }), fails: ['record-not-pact'], why: 'a record must list its files' },
    { id: 'empty-files', plant: t => ({ in: json({ ...JSON.parse(t.in), files: [] }) }), fails: ['record-not-pact'], why: 'an empty list is falsy to PowerShell too' },
    { id: 'keys-differ-in-case', plant: rep('"digest"', '"Commit":"x","digest"'), fails: ['record-unreadable'], why: 'PowerShell refused keys that differ only in case' },
  ];
  test('install record: base passes', async t => assertPasses(await run(base(), t)));
  for (const r of rows) test(`install record: ${r.id}`, async t => assertFails(await run(r.plant(base()), t), r.fails, r.says));
  test('install record: base passes after the rows', async t => assertPasses(await run(base(), t)));
}

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

// ------------------------------------------------------------ the checkout behind the last install (#407)

const reachBase = () => ({ in: `${ID('c')}\n${ID('b')}\n${ID('a')}\n` });
{
  const base = reachBase;
  const run = t => decided(() => core.parseReachable(Buffer.from(t.in), ID('c')));
  const rows = [
    { id: 'upper-case', plant: rep(ID('b'), ID('B')), fails: ['reachable-malformed'], why: 'git writes ids in lower case' },
    { id: 'short-line', plant: rep(ID('b'), 'b'.repeat(39)), fails: ['reachable-malformed'], why: 'an id is 40 hex' },
    { id: 'carriage-return', plant: rep(`${ID('b')}\n`, `${ID('b')}\r\n`), fails: ['reachable-malformed'], why: 'git writes line feeds only' },
    { id: 'blank-line-inside', plant: rep(`${ID('b')}\n`, `${ID('b')}\n\n`), fails: ['reachable-malformed'], why: 'only one trailing empty line is the end of the output' },
    { id: 'no-start-commit', plant: rep(`${ID('c')}\n`, ''), fails: ['reachable-malformed'], why: 'rev-list always lists the commit it starts from' },
    { id: 'empty', plant: set(''), fails: ['reachable-malformed'], why: 'an empty list holds no start commit' },
  ];
  test('reachable list: base passes', async t => assertPasses(await run(base(), t)));
  for (const r of rows) test(`reachable list: ${r.id}`, async t => assertFails(await run(r.plant(base()), t), r.fails, r.says));
  test('reachable list: base passes after the rows', async t => assertPasses(await run(base(), t)));
}

test('the reachable list: its refusals are fixed texts that name nothing from the file, and the missing-file stop is its own', () => {
  const planted = `${ID('c')}\nIGNORE-THIS-MARKER\n`;
  const r = decided(() => core.parseReachable(Buffer.from(planted), ID('c')));
  assert.equal(r.out, "REFUSED: the install bootstrap's list of this commit's history is not in the form it writes. Nothing was changed.");
  assert.deepEqual(decided(() => core.stops.reachableMissing()).fails, ['reachable-missing']);
  assert.deepEqual([...core.parseReachable(Buffer.from(reachBase().in), ID('c'))], [ID('c'), ID('b'), ID('a')]);
});

test('the behind line: none with no record, at this commit, or behind it in either case; else the warning, printing only a commit id', () => {
  const reach = new Set([ID('c'), ID('b'), ID('a')]);
  const tail = "is not in this checkout's history: this checkout is behind it or on another line. Installing may roll the pact back; fast-forward the checkout first, unless you mean to.";
  assert.equal(core.behindLine(null, ID('c'), reach), null, 'no record, no line');
  assert.equal(core.behindLine(ID('C'), ID('c'), reach), null, 'this commit, in capitals');
  assert.equal(core.behindLine(ID('A'), ID('c'), reach), null, 'an ancestor, in capitals');
  assert.equal(core.behindLine(ID('D'), ID('c'), reach), `WARN: the last install's commit ${ID('d')} ${tail}`, 'not in the list: the id, lower-cased');
  assert.equal(core.behindLine('IGNORE-THIS-MARKER \u0007 look here', ID('c'), reach), `WARN: the last install's commit, a commit id the install does not read, ${tail}`, 'words never reach the line');
  assert.equal(core.behindLine(`${ID('a')}0`, ID('c'), reach), `WARN: the last install's commit, a commit id the install does not read, ${tail}`, 'a 41-character value is no id');
});

// ------------------------------------------------------------ the gate's fingerprints (G11)

test('the gate block: changed, added and removed lines, compared without regard to case, and the self-differs warning', () => {
  const now = new Map([['gate/a.mjs', H('a')], ['gate/b.mjs', H('b')], ['gate/new.mjs', H('c')]]);
  assert.deepEqual(core.gateBlock(now, [], false), ['Gate: no gate recorded at the last install']);
  assert.deepEqual(core.gateBlock(now, [['gate/a.mjs', H('A')], ['gate/b.mjs', H('d')], ['gate/old\u0007.mjs', H('e')]], true), ['Gate: CHANGED since the last install', '  changed gate/b.mjs', '  added gate/new.mjs', '  removed gate/old?.mjs', 'WARN: this install script differs from the committed copy; --apply will refuse.']);
  assert.deepEqual(core.gateBlock(now, [...now], false), ['Gate: unchanged since the last install']);
});

// ------------------------------------------------------------ a check's verdict (R4, S-1, control 4)

{
  const base = () => ({ in: json({ lines: ['PASS x', 'RESULT: pass'], failed: false }) });
  const run = t => decided(() => core.checkVerdict(JSON.parse(t.in), 'the check'));
  const rows = [
    { id: 'failed-with-pass-line', plant: rep('"failed":false', '"failed":true'), fails: ['verdict-failed'], why: 'a non-zero exit refuses even with a RESULT: pass line' },
    { id: 'no-result-line', plant: rep('"RESULT: pass"', '"done"'), fails: ['verdict-last-line'], why: 'no RESULT line' },
    { id: 'result-not-last', plant: rep('"RESULT: pass"]', '"RESULT: pass","x"]'), fails: ['verdict-last-line'], why: 'anything after the pass' },
    { id: 'pass-line-split', plant: rep('"RESULT: pass"', '"RESULT: pass\\nRESULT: fail"'), fails: ['verdict-last-line'], why: 'a line holding a newline is read as two, as the wrapper prints it' },
  ];
  test('check verdict: base passes', async t => assertPasses(await run(base(), t)));
  for (const r of rows) test(`check verdict: ${r.id}`, async t => assertFails(await run(r.plant(base()), t), r.fails, r.says));
  test('check verdict: base passes after the rows', async t => assertPasses(await run(base(), t)));
}

// ------------------------------------------------------------ the renderer's lines (R5 to R8)

const U = H('7');
const digestOf = text => sha256(Buffer.from(text, 'ascii')).slice(0, 12);
const D = digestOf(`user ${U}\nblock a.md ${H('e')}\n`);
const renderBase = () => ({ in: [`RENDERED ${H('a')}`, `DIFF ${H('d')}`, `CONFIG user ${U}`, `EDIT moves replace ${H('e')} a.md`, `DIGEST ${D}`, 'VALUE usage-pause 90', `AGENT data-lens sonnet high ${H('f')} security-set override local`, 'COMMANDS finis', 'TOOLS poster', 'RESULT: pass'].join('\n') });
const renderRun = (project = false) => t => decided(() => core.parseRenderLines(t.in.split('\n'), { project, hash: sha256 }));
const noConfig = t => ({ in: t.in.replace(`CONFIG user ${U}`, 'CONFIG none').replace('COMMANDS finis', 'COMMANDS none').replace('TOOLS poster', 'TOOLS none') });
const noneBase = () => ({ in: [`RENDERED ${H('a')}`, `DIFF ${H('d')}`, 'CONFIG none', 'COMMANDS none', 'TOOLS none', 'RESULT: pass'].join('\n') });
// #261 C4
{
  const base = renderBase;
  const run = renderRun();
  const rows = [
    { id: 'two-output-hashes', plant: rep('DIFF', `RENDERED ${H('b')}\nDIFF`), fails: ['render-two-hashes'], why: 'two output hashes' },
    // #302 C3: a retired name in a block is a warning line the install reads, once per part and only for a retired agent.
    { id: 'retired-name-twice', plant: rep('RESULT', 'RETIRED-NAME block moves good-enough-lens\nRETIRED-NAME block moves good-enough-lens\nRESULT'), fails: ['render-retired-twice'], why: 'one retired name reported twice for one part' },
    { id: 'retired-name-not-retired', plant: rep('RESULT', 'RETIRED-NAME block moves scout\nRESULT'), fails: ['render-unknown-line'], why: 'a live agent is no retired name' },
    { id: 'retired-name-no-block', plant: rep('RESULT', 'RETIRED-NAME block tiers good-enough-lens\nRESULT'), fails: ['render-retired-no-block'], why: 'a part with no edit block cannot name a retired agent' },
    { id: 'hash-line-with-more', plant: rep(`RENDERED ${H('a')}`, `RENDERED ${H('a')} x`), fails: ['render-unknown-line'], why: 'anything after the hash' },
    { id: 'two-diff-hashes', plant: rep('CONFIG', `DIFF ${H('c')}\nCONFIG`), fails: ['render-two-diffs'], why: 'two diff hashes' },
    { id: 'no-diff-hash', plant: rep(`DIFF ${H('d')}\n`, ''), fails: ['render-counts'], why: 'no diff hash' },
    { id: 'no-output-hash', plant: rep(`RENDERED ${H('a')}\n`, ''), fails: ['render-counts'], why: 'no output hash' },
    { id: 'no-config-line', plant: rep(`CONFIG user ${U}\n`, ''), fails: ['render-counts'], why: 'no configuration line' },
    { id: 'two-config-lines', plant: rep('DIGEST', 'CONFIG none\nDIGEST'), fails: ['render-counts'], why: 'a user and a none configuration line' },
    { id: 'unknown-line', plant: rep('VALUE', 'INSTALL x y z\nVALUE'), fails: ['render-unknown-line'], why: 'a line that could feed another parse' },
    { id: 'edit-twice', plant: rep('DIGEST', 'EDIT moves remove\nDIGEST'), fails: ['render-edit-twice'], why: 'one open part edited twice' },
    { id: 'block-dot-dot', plant: rep(' a.md', ' ../a.md'), fails: ['render-block-path'], why: 'a block path with a .. segment' },
    { id: 'block-trailing-dot', plant: rep(' a.md', ' a.md.'), fails: ['render-block-path'], why: 'a block path ending in a dot' },
    { id: 'block-two-hashes', plant: rep('DIGEST', `EDIT tiers replace ${H('9')} a.md\nDIGEST`), fails: ['render-block-changed'], why: 'a block that changed while it was read' },
    { id: 'part-not-open', plant: rep('EDIT moves', 'EDIT move-5'), fails: ['render-unknown-line'], why: 'an edit to a part that is not open' },
    { id: 'gated-clause', plant: rep('EDIT moves', 'EDIT stop-and-escalate'), fails: ['render-unknown-line'], why: 'an edit to a pinned block' },
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
    { id: 'agent-not-configurable', plant: rep('AGENT data-lens', 'AGENT my-reviewer'), fails: ['render-unknown-line'], why: 'an agent the configuration cannot set' },
    // #262 C14: the install's AGENT parser takes the renderer's model shape and five efforts, and nothing else.
    { id: 'agent-model-too-long', plant: rep('AGENT data-lens sonnet', `AGENT data-lens ${'a'.repeat(129)}`), fails: ['render-unknown-line'], why: 'a model over 128 characters' },
    { id: 'agent-effort-unknown', plant: rep('sonnet high', 'sonnet ultra'), fails: ['render-unknown-line'], why: 'an effort outside the five' },
    { id: 'agent-in-capitals', plant: rep('AGENT data-lens', 'AGENT Data-lens'), fails: ['render-unknown-line'], why: 'names are matched case-sensitively' },
    { id: 'digest-with-no-config', plant: t => noConfig(t), fails: ['render-none-extras'], why: 'a digest, value, edit or agent with no configuration' },
    { id: 'no-commands-line', plant: rep('COMMANDS finis\n', ''), fails: ['render-commands-missing'], why: 'the renderer must say which commands are on (#203)' },
    { id: 'two-commands-lines', plant: rep('COMMANDS finis', 'COMMANDS finis\nCOMMANDS none'), fails: ['render-commands-twice'], why: 'exactly one commands line' },
    { id: 'commands-unknown-name', plant: rep('COMMANDS finis', 'COMMANDS ship-it'), fails: ['render-unknown-line'], why: 'a name that is not a pact command' },
    { id: 'commands-repeat', plant: rep('COMMANDS finis', 'COMMANDS finis,finis'), fails: ['render-unknown-line'], why: 'one name twice' },
    { id: 'commands-out-of-order', plant: rep('COMMANDS finis', 'COMMANDS finis,make-it-so'), fails: ['render-unknown-line'], why: 'names in PACT_COMMANDS order only' },
    { id: 'commands-none-and-name', plant: rep('COMMANDS finis', 'COMMANDS none,finis'), fails: ['render-unknown-line'], why: 'none stands alone' },
    { id: 'commands-spaced', plant: rep('COMMANDS finis', 'COMMANDS make-it-so, finis'), fails: ['render-unknown-line'], why: 'commas alone between names' },
    // #280 C3: the TOOLS line, as the COMMANDS line, and always straight after it.
    { id: 'no-tools-line', plant: rep('TOOLS poster\n', ''), fails: ['render-tools-missing'], why: 'the renderer must say which tools are on' },
    { id: 'two-tools-lines', plant: rep('TOOLS poster', 'TOOLS poster\nTOOLS none'), fails: ['render-tools-twice'], why: 'exactly one tools line' },
    { id: 'tools-unknown-name', plant: rep('TOOLS poster', 'TOOLS sender'), fails: ['render-unknown-line'], why: 'a name that is not a pact tool' },
    { id: 'tools-repeat', plant: rep('TOOLS poster', 'TOOLS poster,poster'), fails: ['render-unknown-line'], why: 'one name twice' },
    { id: 'tools-none-and-name', plant: rep('TOOLS poster', 'TOOLS none,poster'), fails: ['render-unknown-line'], why: 'none stands alone' },
    { id: 'line-between-commands-and-tools', plant: t => ({ in: t.in.replace(`AGENT data-lens sonnet high ${H('f')} security-set override local\n`, '').replace('COMMANDS finis\n', `COMMANDS finis\nAGENT data-lens sonnet high ${H('f')} security-set override local\n`) }), fails: ['render-unknown-line'], says: /TOOLS line does not come straight after its COMMANDS line/, why: 'straight after, not merely later' },
    { id: 'tools-line-out-of-order', plant: t => ({ in: t.in.replace('COMMANDS finis\nTOOLS poster', 'TOOLS poster\nCOMMANDS finis') }), fails: ['render-unknown-line'], why: 'the TOOLS line comes straight after the COMMANDS line' },
    // #183 T4a C5: SKILL lines, one per skill path, only after the TOOLS line, each name once, 100 at most.
    { id: 'skill-before-tools', plant: rep('COMMANDS finis', 'SKILL a/b cccccccccccccccccccccccccccccccccccccccc skills/x\nCOMMANDS finis'), fails: ['render-unknown-line'], why: 'a skill line before the TOOLS line' },
    { id: 'skill-dot-dot', plant: rep('RESULT', 'SKILL a/b cccccccccccccccccccccccccccccccccccccccc skills/../x\nRESULT'), fails: ['render-unknown-line'], why: 'a .. segment in a skill path' },
    { id: 'skill-dot-segment', plant: rep('RESULT', 'SKILL a/b cccccccccccccccccccccccccccccccccccccccc skills/./x\nRESULT'), fails: ['render-unknown-line'], why: 'a . segment in a skill path' },
    { id: 'skill-inner-dash', plant: rep('RESULT', 'SKILL a/b cccccccccccccccccccccccccccccccccccccccc -skills/x\nRESULT'), fails: ['render-unknown-line'], why: 'a segment a git command could read as an option' },
    { id: 'skill-repo-dots', plant: rep('RESULT', 'SKILL a/.. cccccccccccccccccccccccccccccccccccccccc skills/x\nRESULT'), fails: ['render-unknown-line'], why: 'a repo name of only dots' },
    { id: 'skill-repo-dot-git', plant: rep('RESULT', 'SKILL a/b.git cccccccccccccccccccccccccccccccccccccccc skills/x\nRESULT'), fails: ['render-unknown-line'], why: 'a repo name ending in .git' },
    { id: 'skill-name-dash', plant: rep('RESULT', 'SKILL a/b cccccccccccccccccccccccccccccccccccccccc skills/-x\nRESULT'), fails: ['render-unknown-line'], why: 'a skill name that starts with a dash' },
    { id: 'skill-short-commit', plant: rep('RESULT', 'SKILL a/b ccccccccccccccccccccccccccccccccccccccc skills/x\nRESULT'), fails: ['render-unknown-line'], why: 'a commit that is not 40 hex' },
    { id: 'skill-name-twice', plant: rep('RESULT', 'SKILL a/b cccccccccccccccccccccccccccccccccccccccc skills/x\nSKILL a/c cccccccccccccccccccccccccccccccccccccccc other/X\nRESULT'), fails: ['render-skill-twice'], why: 'two paths that install under one name, in any case' },
    { id: 'skill-count', plant: t => ({ in: t.in.replace('RESULT', `${Array.from({ length: 101 }, (_, i) => `SKILL a/b cccccccccccccccccccccccccccccccccccccccc s/k${i}`).join('\n')}\nRESULT`) }), fails: ['render-skill-count'], why: 'more than 100 skill paths' },
    { id: 'default-digest-over-user', plant: rep(`CONFIG user ${U}`, `CONFIG default ${U}`), fails: ['render-digest'], why: "the default's digest is taken over \"default\", so a user digest does not stand in" },
  ];
  test('renderer lines: base passes', async t => assertPasses(await run(base(), t)));
  for (const r of rows) test(`renderer lines: ${r.id}`, async t => assertFails(await run(r.plant(base()), t), r.fails, r.says));
  test('renderer lines: base passes after the rows', async t => assertPasses(await run(base(), t)));
}

{
  const base = noneBase;
  const run = renderRun();
  const rows = [
    { id: 'digest', plant: rep('RESULT', `DIGEST ${D}\nRESULT`), fails: ['render-none-extras'], why: 'a digest with no configuration' },
    { id: 'value', plant: rep('RESULT', 'VALUE usage-pause 90\nRESULT'), fails: ['render-none-extras'], why: 'a value with no configuration' },
    { id: 'edit', plant: rep('RESULT', 'EDIT moves remove\nRESULT'), fails: ['render-none-extras'], why: 'an edit with no configuration' },
    { id: 'retired-name', plant: rep('RESULT', 'RETIRED-NAME block moves good-enough-lens\nRESULT'), fails: ['render-none-extras'], why: 'a retired name in a block with no configuration (#302 C3)' },
    { id: 'agent', plant: rep('RESULT', `AGENT data-lens opus high ${H('f')} security-set override local\nRESULT`), fails: ['render-none-extras'], why: 'an agent setting with no configuration' },
    { id: 'no-config-line', plant: rep('CONFIG none\n', ''), fails: ['render-counts'], why: 'no configuration line at all' },
    { id: 'two-none-lines', plant: rep('CONFIG none', 'CONFIG none\nCONFIG none'), fails: ['render-counts'], why: 'two configuration lines, both none' },
    { id: 'command-on', plant: rep('COMMANDS none', 'COMMANDS finis'), fails: ['render-none-extras'], says: /a pact command with no configuration/, why: 'a named list with CONFIG none (#203)' },
    { id: 'no-commands-line', plant: rep('COMMANDS none\n', ''), fails: ['render-commands-missing'], why: 'COMMANDS none is still printed' },
    // #280 C3
    { id: 'tool-on', plant: rep('TOOLS none', 'TOOLS poster'), fails: ['render-none-extras'], says: /a pact tool with no configuration/, why: 'a named tool with CONFIG none' },
    { id: 'no-tools-line', plant: rep('TOOLS none\n', ''), fails: ['render-tools-missing'], why: 'TOOLS none is still printed' },
    // #183 T4a C5
    { id: 'skill', plant: rep('RESULT', 'SKILL a/b cccccccccccccccccccccccccccccccccccccccc skills/x\nRESULT'), fails: ['render-none-extras'], says: /a skill source with no configuration/, why: 'a skill path with CONFIG none' },
  ];
  test('renderer lines with no configuration: base passes', async t => assertPasses(await run(base(), t)));
  for (const r of rows) test(`renderer lines with no configuration: ${r.id}`, async t => assertFails(await run(r.plant(base()), t), r.fails, r.says));
  test('renderer lines with no configuration: base passes after the rows', async t => assertPasses(await run(base(), t)));
}

{
  const base = noneBase;
  const run = renderRun(true);
  const rows = [{ id: 'stage-render-read-config', plant: () => renderBase(), fails: ['render-project-config'], why: "the stage's render must read no configuration" }];
  test('renderer lines on a project install: base passes', async t => assertPasses(await run(base(), t)));
  for (const r of rows) test(`renderer lines on a project install: ${r.id}`, async t => assertFails(await run(r.plant(base()), t), r.fails, r.says));
  test('renderer lines on a project install: base passes after the rows', async t => assertPasses(await run(base(), t)));
}

// #183 T4a C6: the pact's default parses with its skill paths, and the skills block says the install fetches none of them.
test('the renderer lines: the pact\'s default parses with its skill paths, and the skills block counts them by repo and fetches none', () => {
  const text = renderBase().in.replace(`CONFIG user ${U}`, `CONFIG default ${U}`).replace(`DIGEST ${D}`, `DIGEST ${digestOf(`default ${U}\nblock a.md ${H('e')}\n`)}`).replace('RESULT', 'SKILL a/b cccccccccccccccccccccccccccccccccccccccc skills/x\nSKILL a/b cccccccccccccccccccccccccccccccccccccccc skills/y\nSKILL c/d dddddddddddddddddddddddddddddddddddddddd z\nRESULT');
  const p = core.parseRenderLines(text.split('\n'), { project: false, hash: sha256 });
  assert.equal(p.config.kind, 'default');
  assert.deepEqual(p.skills.map(k => [k.repo, k.path, k.name]), [['a/b', 'skills/x', 'x'], ['a/b', 'skills/y', 'y'], ['c/d', 'z', 'z']]);
  assert.deepEqual(core.skillsBlock(p), [
    'skills: 3 paths from 2 repos, fetched only by the cloud setup',
    '  a/b at cccccccccccc: 2 paths',
    '  c/d at dddddddddddd: 1 path',
    '  This install fetches and installs none of them; a session here uses one only if you installed it yourself, or if a repo you work in carries a skill of that name, which it then uses.',
  ]);
  assert.deepEqual(core.skillsBlock(core.parseRenderLines(renderBase().in.split('\n'), { project: false, hash: sha256 })), []);
});

// #262 C4 (#142): the session limit's value line reaches both parses, home and project.
test('the renderer lines: a usage-pause-session value parses beside the weekly one, in a home and a project render', () => {
  const home = core.parseRenderLines(renderBase().in.replace('VALUE usage-pause 90', 'VALUE usage-pause 90\nVALUE usage-pause-session 80').split('\n'), { project: false, hash: sha256 });
  assert.deepEqual([...home.values], [['usage-pause', '90'], ['usage-pause-session', '80']]);
  const proj = core.parseProjectRenderLines(projRenderBase().in.replace('VALUE usage-pause 60', 'VALUE usage-pause-session 70').split('\n'), sha256);
  assert.deepEqual([...proj.values], [['usage-pause-session', '70']]);
});

test('the renderer lines: the parse gives the hashes, the configuration, the edits, the values and the agent settings', () => {
  const p = core.parseRenderLines(renderBase().in.split('\n'), { project: false, hash: sha256 });
  assert.equal(p.renderHash, H('a'));
  assert.equal(p.digest, D);
  assert.deepEqual([...p.blockHashes], [['a.md', H('e')]]);
  assert.deepEqual(p.agentSets.get('data-lens'), { model: 'sonnet', effort: 'high', sha256: H('f'), security: true, override: true, egress: false });
  assert.deepEqual([...core.configNow(p)], [['user', U], ['block a.md', H('e')]]);
  assert.deepEqual(p.commands, ['finis']);
  assert.deepEqual(core.parseRenderLines(noneBase().in.split('\n'), { project: false, hash: sha256 }).commands, []);
  assert.deepEqual(core.parseRenderLines(renderBase().in.replace('COMMANDS finis', 'COMMANDS make-it-so,finis,scriptorium').split('\n'), { project: false, hash: sha256 }).commands, ['make-it-so', 'finis', 'scriptorium']);
});

// ------------------------------------------------------------ the project install (J1 to J4)

const projCheckBase = () => ({ in: json({ lines: ['ROOT C:\\work\\proj', 'STATE new', 'RESULT: pass'], failed: false }) });
{
  const base = projCheckBase;
  const run = t => decided(() => core.parseProjectCheck(JSON.parse(t.in), 'win32'));
  const rows = [
    { id: 'failed', plant: rep('"failed":false', '"failed":true'), fails: ['project-check'], why: 'the project module refused the folder' },
    { id: 'no-pass-line', plant: rep('"RESULT: pass"', '"RESULT: fail"'), fails: ['project-check'], why: 'both parts of the verdict' },
    { id: 'extra-line', plant: rep('"STATE new",', '"STATE new","NOTE x",'), fails: ['project-check-lines'], why: 'exactly three lines' },
    { id: 'no-root-line', plant: rep('"ROOT C:\\\\work\\\\proj"', '"PATH C:\\\\work\\\\proj"'), fails: ['project-check-lines'], why: 'the folder first' },
    { id: 'root-not-full', plant: rep('ROOT C:\\\\work', 'ROOT work'), fails: ['project-check-root'], why: 'a real path is a full path' },
    { id: 'unknown-state', plant: rep('STATE new', 'STATE old'), fails: ['project-check-state'], why: 'new or update with a hash' },
    { id: 'update-short-hash', plant: rep('STATE new', `STATE update ${'a'.repeat(63)}`), fails: ['project-check-state'], why: 'a full hash' },
  ];
  test('project check: base passes', async t => assertPasses(await run(base(), t)));
  for (const r of rows) test(`project check: ${r.id}`, async t => assertFails(await run(r.plant(base()), t), r.fails, r.says));
  test('project check: base passes after the rows', async t => assertPasses(await run(base(), t)));
}

test('the project check: the root is parsed, never shown, and the state read', () => {
  assert.deepEqual(core.parseProjectCheck({ lines: ['ROOT /w/p', `STATE update ${H('a')}`, 'RESULT: pass'], failed: false }, 'linux'), { root: '/w/p', state: { kind: 'update', sha256: H('a') } });
  assert.equal(decided(() => core.checkProjectLinks(null)).code, 0);
  assert.deepEqual(decided(() => core.checkProjectLinks('.claude/rules')).fails, ['project-link']);
});

const PF = H('3');
const PD = digestOf(`user ${U}\nproject ${PF}\n`);
const projRenderBase = () => ({ in: [`RENDERED ${H('a')}`, `CONFIG user ${U}`, `PROJECT ${PF}`, `DIGEST ${PD}`, 'VALUE usage-pause 60', 'RESULT: pass'].join('\n') });
{
  const base = projRenderBase;
  const run = t => decided(() => core.parseProjectRenderLines(t.in.split('\n'), sha256));
  const rows = [
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
    // #262 C21: a project's own qualities list is reported once, as a row count of 1 to 9.
    { id: 'qualities-twice', plant: rep('RESULT', 'QUALITIES 3\nQUALITIES 3\nRESULT'), fails: ['project-render-two-qualities'], why: 'one qualities list' },
    // #302 C3: a retired name in a qualities list is a warning line, once, and only for a retired agent.
    { id: 'retired-name-twice', plant: rep('RESULT', 'RETIRED-NAME qualities good-enough-lens\nRETIRED-NAME qualities good-enough-lens\nRESULT'), fails: ['project-render-two-retired'], why: 'one retired name reported twice' },
    { id: 'retired-name-not-retired', plant: rep('RESULT', 'RETIRED-NAME qualities scout\nRESULT'), fails: ['project-render-unknown-line'], why: 'a live agent is no retired name' },
    { id: 'retired-name-no-qualities', plant: rep('RESULT', 'RETIRED-NAME qualities good-enough-lens\nRESULT'), fails: ['project-render-retired-no-qualities'], why: 'no qualities list to name it in' },
    { id: 'qualities-zero', plant: rep('RESULT', 'QUALITIES 0\nRESULT'), fails: ['project-render-unknown-line'], why: 'a list holds a row' },
    { id: 'qualities-too-many', plant: rep('RESULT', 'QUALITIES 10\nRESULT'), fails: ['project-render-unknown-line'], why: 'at most nine rows, one per quality' },
    // #288 C8: a project's own Cost limits are reported once, as a row count of 1 to 9.
    { id: 'cost-limits-twice', plant: rep('RESULT', 'COST-LIMITS 2\nCOST-LIMITS 2\nRESULT'), fails: ['project-render-two-cost-limits'], why: 'one Cost limits list' },
    { id: 'cost-limits-zero', plant: rep('RESULT', 'COST-LIMITS 0\nRESULT'), fails: ['project-render-unknown-line'], why: 'a list holds a row' },
    { id: 'cost-limits-too-many', plant: rep('RESULT', 'COST-LIMITS 10\nRESULT'), fails: ['project-render-unknown-line'], why: 'at most nine rows, as the render caps them' },
    // #299 C4: the places of the cost rows no quality names: once, with a Cost limits list, ascending, within its count.
    { id: 'unnamed-twice', plant: rep('RESULT', 'COST-LIMITS 4\nCOST-LIMITS-UNNAMED 2\nCOST-LIMITS-UNNAMED 3\nRESULT'), fails: ['project-render-two-unnamed'], why: 'one unnamed-rows line' },
    { id: 'unnamed-no-cost-limits', plant: rep('RESULT', 'COST-LIMITS-UNNAMED 1\nRESULT'), fails: ['project-render-unnamed-no-cost-limits'], why: 'no Cost limits list to point into' },
    { id: 'unnamed-out-of-order', plant: rep('RESULT', 'COST-LIMITS-UNNAMED 3 2\nCOST-LIMITS 4\nRESULT'), fails: ['project-render-unnamed-order'], why: 'ascending, whatever the line order' },
    { id: 'unnamed-repeated', plant: rep('RESULT', 'COST-LIMITS 4\nCOST-LIMITS-UNNAMED 2 2\nRESULT'), fails: ['project-render-unnamed-order'], why: 'a position once' },
    { id: 'unnamed-past-count', plant: rep('RESULT', 'COST-LIMITS 2\nCOST-LIMITS-UNNAMED 1 3\nRESULT'), fails: ['project-render-unnamed-range'], why: 'no position past the last cost row' },
    { id: 'unnamed-zero', plant: rep('RESULT', 'COST-LIMITS 2\nCOST-LIMITS-UNNAMED 0\nRESULT'), fails: ['project-render-unknown-line'], why: 'positions start at 1' },
    { id: 'unnamed-two-spaces', plant: rep('RESULT', 'COST-LIMITS 4\nCOST-LIMITS-UNNAMED 2  4\nRESULT'), fails: ['project-render-unknown-line'], why: 'single spaces between positions' },
    { id: 'unnamed-empty', plant: rep('RESULT', 'COST-LIMITS 2\nCOST-LIMITS-UNNAMED\nRESULT'), fails: ['project-render-unknown-line'], why: 'a line with no positions is not the line' },
  ];
  test('project render lines: base passes', async t => assertPasses(await run(base(), t)));
  for (const r of rows) test(`project render lines: ${r.id}`, async t => assertFails(await run(r.plant(base()), t), r.fails, r.says));
  test('project render lines: base passes after the rows', async t => assertPasses(await run(base(), t)));
}

// #288 C8, C10, C11: the Cost limits line is read, counts toward "the render set something", and the dry run names it.
test('the project render with Cost limits and no value passes; the security-defaults line names them with their row count, and a qualities list without them gets a note', () => {
  const lines = (...extra) => [`RENDERED ${H('a')}`, 'CONFIG none', `PROJECT ${PF}`, `DIGEST ${digestOf(`project ${PF}\n`)}`, ...extra, 'RESULT: pass'];
  const both = core.parseProjectRenderLines(lines('QUALITIES 3', 'COST-LIMITS 2'), sha256);
  assert.equal(both.costLimits, 2);
  assert.equal(core.projectSecurityLine(both), "WARN: SECURITY DEFAULTS: the project configuration sets its own qualities list (3 rows) and its own Cost limits (2 rows), which take the place of yours in this project; read its rows in the project's .claude/pact-config.json before you install.");
  assert.equal(core.projectNoteLine(both), null, 'Cost limits are set: no note');
  assert.equal(core.parseProjectRenderLines(lines('QUALITIES 9', 'COST-LIMITS 9'), sha256).costLimits, 9, 'nine rows, the top of the range');
  // The render refuses Cost limits without qualities; if one ever reported them alone, the line would still print.
  const alone = core.parseProjectRenderLines(lines('COST-LIMITS 1'), sha256);
  assert.equal(alone.costLimits, 1, 'a Cost limits line alone is something the render set');
  assert.equal(core.projectSecurityLine(alone), "WARN: SECURITY DEFAULTS: the project configuration sets its own Cost limits (1 row), which takes the place of yours in this project; read its rows in the project's .claude/pact-config.json before you install.");
  assert.equal(core.projectSecurityLine(core.parseProjectRenderLines(lines('QUALITIES 1', 'COST-LIMITS 1'), sha256)).includes('(1 row) and its own Cost limits (1 row)'), true);
  // A pre-#278 project configuration: the same line and no Cost limits.
  const old = core.parseProjectRenderLines(lines('QUALITIES 3'), sha256);
  assert.equal(old.costLimits, 0);
  assert.equal(core.projectSecurityLine(old), "WARN: SECURITY DEFAULTS: the project configuration sets its own qualities list (3 rows), which takes the place of yours in this project; read its rows in the project's .claude/pact-config.json before you install.");
  assert.equal(core.projectNoteLine(old), "NOTE: the project configuration sets its own qualities list and no Cost limits, so none of its qualities names your Cost limits and they limit the review itself there; add costLimits, and name them in the enoughCosts of each quality they should hold back.");
  assert.equal(core.projectNoteLine(core.parseProjectRenderLines(projRenderBase().in.split('\n'), sha256)), null, 'no qualities list: no note');
});

// #299 C3, C5, #377 C5: the unnamed places are read as a list, and the Project block notes them once, worded by the count.
test('the project render reads the unnamed cost rows as a list, and the Project block prints one NOTE line worded by how many', () => {
  const lines = (...extra) => [`RENDERED ${H('a')}`, 'CONFIG none', `PROJECT ${PF}`, `DIGEST ${digestOf(`project ${PF}\n`)}`, ...extra, 'RESULT: pass'];
  const parse = (...extra) => core.parseProjectRenderLines(lines(...extra), sha256);
  assert.deepEqual(parse('QUALITIES 1', 'COST-LIMITS 4', 'COST-LIMITS-UNNAMED 2 4').unnamedCosts, [2, 4]);
  assert.deepEqual(parse('QUALITIES 1', 'COST-LIMITS 4').unnamedCosts, [], 'no line: an empty list');
  assert.deepEqual(parse('QUALITIES 1', 'COST-LIMITS 9', 'COST-LIMITS-UNNAMED 1 2 3 4 5 6 7 8 9').unnamedCosts, [1, 2, 3, 4, 5, 6, 7, 8, 9], 'up to the count');
  const warns = (...extra) => core.projectBlock({ kind: 'new' }, parse('QUALITIES 1', ...extra)).filter(l => l.includes('named by no quality'));
  // #377 C5: a NOTE, not a WARN: such a row limits the review itself in that project.
  const tail = "named by no quality's enoughCosts, so ";
  assert.deepEqual(warns('COST-LIMITS 4', 'COST-LIMITS-UNNAMED 2'), [`  NOTE: the project configuration's Cost limits row 2 is ${tail}it limits the review itself in this project; to hold back a quality's lenses instead, name it in that quality's enoughCosts in the project's .claude/pact-config.json.`]);
  assert.deepEqual(warns('COST-LIMITS 4', 'COST-LIMITS-UNNAMED 2 4'), [`  NOTE: the project configuration's Cost limits rows 2 and 4 are ${tail}they limit the review itself in this project; to hold back a quality's lenses instead, name each in that quality's enoughCosts in the project's .claude/pact-config.json.`]);
  assert.deepEqual(warns('COST-LIMITS 7', 'COST-LIMITS-UNNAMED 2 4 7'), [`  NOTE: the project configuration's Cost limits rows 2, 4 and 7 are ${tail}they limit the review itself in this project; to hold back a quality's lenses instead, name each in that quality's enoughCosts in the project's .claude/pact-config.json.`]);
  assert.deepEqual(warns('COST-LIMITS 4'), [], 'none unnamed: no line');
  const block = core.projectBlock({ kind: 'new' }, parse('QUALITIES 1', 'RETIRED-NAME qualities good-enough-lens', 'COST-LIMITS 4', 'COST-LIMITS-UNNAMED 2'));
  const at = block.findIndex(l => l.includes('row 2 is'));
  assert.ok(block.findIndex(l => l.includes('retired')) < at && at < block.length - 1, 'after the retired-name warnings, before the closing line');
});

// #262 C21, C22: a project with only a qualities list renders, and its dry run leads with the security-defaults line.
test('the project render with a qualities list and no value passes, and the project security-defaults line names it; with no list there is none', () => {
  const p = core.parseProjectRenderLines([`RENDERED ${H('a')}`, 'CONFIG none', `PROJECT ${PF}`, `DIGEST ${digestOf(`project ${PF}\n`)}`, 'QUALITIES 3', 'RESULT: pass'], sha256);
  assert.equal(p.qualities, 3);
  assert.equal(core.projectSecurityLine(p), "WARN: SECURITY DEFAULTS: the project configuration sets its own qualities list (3 rows), which takes the place of yours in this project; read its rows in the project's .claude/pact-config.json before you install.");
  assert.equal(core.projectSecurityLine(core.parseProjectRenderLines(projRenderBase().in.split('\n'), sha256)), null);
});

test('the project render with no user file: the digest is the project file\'s alone', () => {
  const p = core.parseProjectRenderLines([`RENDERED ${H('a')}`, 'CONFIG none', `PROJECT ${PF}`, `DIGEST ${digestOf(`project ${PF}\n`)}`, 'VALUE usage-pause 60', 'RESULT: pass'], sha256);
  assert.equal(p.user, null);
  const block = core.projectBlock({ kind: 'update', sha256: H('a') }, p);
  assert.ok(block.includes('  rules file .claude/rules/pact-project.md: unchanged'));
  assert.ok(block.includes("  user configuration pact/config.json: none (the defaults bound the project's values)"));
  // A record names a file by its hash, which anyone can write: a hash that differs is never called the pact's.
  const other = core.projectBlock({ kind: 'update', sha256: H('b') }, p);
  assert.ok(other.includes(`  rules file .claude/rules/pact-project.md: would replace the existing file its record names (sha256 ${H('b')}); the record is a file in the project, not proof the pact wrote it`));
  assert.ok(!other.join('\n').includes('the pact recorded'));
});

{
  const base = () => ({ in: json([{ name: 'pact-project.md', file: true, link: false, size: 100 }]), hash: H('a') });
  const run = t => decided(() => core.checkProjectOutput(JSON.parse(t.in), t.hash, H('a')));
  const rows = [
    { id: 'second-file', plant: t => ({ ...t, in: json([...JSON.parse(t.in), { name: 'x', file: true, link: false, size: 1 }]) }), fails: ['project-output'], why: 'exactly the rules file' },
    { id: 'other-name', plant: rep('pact-project.md', 'pact.md'), fails: ['project-output'], why: 'by its exact name' },
    { id: 'a-link', plant: rep('"link":false', '"link":true'), fails: ['project-output'], why: 'a plain file' },
    { id: 'over-64kib', plant: rep('"size":100', `"size":${64 * 1024 + 1}`), fails: ['project-output'], why: 'at most 64 KiB' },
    { id: 'hash-not-reported', plant: set(H('b'), 'hash'), fails: ['project-rules-hash'], why: 'the reported bytes' },
  ];
  test('project output: base passes', async t => assertPasses(await run(base(), t)));
  for (const r of rows) test(`project output: ${r.id}`, async t => assertFails(await run(r.plant(base()), t), r.fails, r.says));
  test('project output: base passes after the rows', async t => assertPasses(await run(base(), t)));
}

{
  const base = () => ({ in: json({ lines: [`WROTE ${H('a')} ${H('b')}`, 'RESULT: pass'], failed: false }) });
  const run = t => decided(() => core.parseProjectWrite(JSON.parse(t.in), H('a')));
  const rows = [
    { id: 'other-hash', plant: rep(`WROTE ${H('a')}`, `WROTE ${H('c')}`), fails: ['project-write'], why: 'the bytes the dry run showed' },
    { id: 'extra-line', plant: rep('"RESULT: pass"', '"x","RESULT: pass"'), fails: ['project-write'], why: 'exactly two lines' },
    { id: 'failed', plant: rep('"failed":false', '"failed":true'), fails: ['project-write'], says: /may hold what the write left/, why: 'both parts of the verdict, and the refusal says what may be left' },
  ];
  test('project write: base passes', async t => assertPasses(await run(base(), t)));
  for (const r of rows) test(`project write: ${r.id}`, async t => assertFails(await run(r.plant(base()), t), r.fails, r.says));
  test('project write: base passes after the rows', async t => assertPasses(await run(base(), t)));
}

// ------------------------------------------------------------ the render output (R9, R10)

const outBase = () => ({ in: json([{ name: 'CLAUDE.md', file: true, link: false, size: 10 }, { name: 'config.diff', file: true, link: false, size: 0 }, { name: 'agent-data-lens.md', file: true, link: false, size: 5 }]) });
{
  const base = outBase;
  const run = t => decided(() => core.checkRenderOutput(JSON.parse(t.in), ['data-lens']));
  const rows = [
    { id: 'second-file', plant: t => ({ in: json([...JSON.parse(t.in), { name: 'extra', file: true, link: false, size: 1 }]) }), fails: ['render-output'], why: 'a file the renderer should not leave' },
    { id: 'no-diff', plant: t => ({ in: json(JSON.parse(t.in).filter(e => e.name !== 'config.diff')) }), fails: ['render-output'], why: 'no diff file' },
    { id: 'no-agent-file', plant: t => ({ in: json(JSON.parse(t.in).filter(e => e.name !== 'agent-data-lens.md')) }), fails: ['render-output'], why: 'an AGENT line with no file' },
    { id: 'rules-is-folder', plant: rep('"name":"CLAUDE.md","file":true', '"name":"CLAUDE.md","file":false'), fails: ['render-output'], why: 'a folder in place of the rules file' },
    { id: 'diff-is-link', plant: rep('"name":"config.diff","file":true,"link":false', '"name":"config.diff","file":true,"link":true'), fails: ['render-output'], why: 'a link in the output' },
    { id: 'rules-over-1mib', plant: rep('"size":10', `"size":${1024 * 1024 + 1}`), fails: ['render-output'], why: 'a rules file over its cap' },
    { id: 'file-over-4mib', plant: rep('"size":0', `"size":${4 * 1024 * 1024 + 1}`), fails: ['render-output'], why: 'any file over 4 MiB' },
  ];
  test('render output: base passes', async t => assertPasses(await run(base(), t)));
  for (const r of rows) test(`render output: ${r.id}`, async t => assertFails(await run(r.plant(base()), t), r.fails, r.says));
  test('render output: base passes after the rows', async t => assertPasses(await run(base(), t)));
}

{
  const base = () => ({ rules: H('a'), diff: H('d') });
  const run = t => decided(() => core.checkRenderedHashes(t, { renderHash: H('a'), diffHash: H('d') }));
  const rows = [
    { id: 'rules-hash', plant: set(H('b'), 'rules'), fails: ['render-rules-hash'], why: 'a renderer that reports a hash other than its output' },
    { id: 'diff-hash', plant: set(H('b'), 'diff'), fails: ['render-diff-hash'], why: "a diff hash that is not its diff's" },
  ];
  test('rendered hashes: base passes', async t => assertPasses(await run(base(), t)));
  for (const r of rows) test(`rendered hashes: ${r.id}`, async t => assertFails(await run(r.plant(base()), t), r.fails, r.says));
  test('rendered hashes: base passes after the rows', async t => assertPasses(await run(base(), t)));
}

const AGENT_OLD = '---\nname: data-lens\ndescription: d\ntools: [Read, Glob, Grep]\nmodel: opus\neffort: high\n---\nBody.\n';
const AGENT_NEW = AGENT_OLD.replace('model: opus', 'model: sonnet');
const agentBase = () => ({ old: AGENT_OLD, new: AGENT_NEW, set: json({ model: 'sonnet', effort: 'high', security: true, override: true, egress: false }) });
const agentRun = t => {
  const s = JSON.parse(t.set);
  const neu = Buffer.from(t.new, 'latin1');
  return decided(() => core.checkAgentFile('data-lens', { ...s, sha256: sha256(neu) }, t.old === 'NONE' ? null : Buffer.from(t.old, 'latin1'), t.size ? Buffer.alloc(Number(t.size)) : neu, t.hash ?? sha256(neu)));
};
{
  const base = agentBase;
  const run = agentRun;
  const rows = [
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
  ];
  test('agent file: base passes', async t => assertPasses(await run(base(), t)));
  for (const r of rows) test(`agent file: ${r.id}`, async t => assertFails(await run(r.plant(base()), t), r.fails, r.says));
  test('agent file: base passes after the rows', async t => assertPasses(await run(base(), t)));
}

// ------------------------------------------------------------ seam A's copy set and overlay (S-2, S-3)

const staged = new Map([['claude/CLAUDE.md', H('1')], ['claude/agents/a.md', H('2')], ['claude/agents/scout.md', H('3')], ['familiars/scout.contract.md', H('4')], ['gate/x.mjs', H('6')], ['AGENTS.md', H('7')], [core.OVERLAY_REL, H('8')], ['claude/review.md', H('d')]]);
const copyBase = () => ({ in: [`INSTALL ${H('1')} claude/CLAUDE.md CLAUDE.md`, `INSTALL ${H('2')} claude/agents/a.md agents/a.md`, `INSTALL ${H('3')} claude/agents/scout.md agents/scout.md`, `INSTALL ${H('d')} claude/review.md pact/review.md`, 'RESULT: pass'].join('\n') });
// #261 C3
{
  const base = copyBase;
  const run = t => decided(() => core.matchCopySet(t.in.split('\n'), core.expectedCopySet(staged.keys()), staged, ID('a')));
  const rows = [
    { id: 'listed-twice', plant: rep('RESULT', `INSTALL ${H('2')} claude/agents/a.md agents/a.md\nRESULT`), fails: ['copy-set-twice'], why: 'one file listed twice' },
    { id: 'file-left-off', plant: rep(`INSTALL ${H('2')} claude/agents/a.md agents/a.md\n`, ''), fails: ['copy-set-mismatch'], why: 'a seam A that leaves a file off its list' },
    { id: 'file-added', plant: rep('RESULT', `INSTALL ${H('7')} AGENTS.md AGENTS.md\nRESULT`), fails: ['copy-set-mismatch'], why: 'a file that never installs' },
    { id: 'other-destination', plant: rep('pact/review.md', 'agents/review.md'), fails: ['copy-set-mismatch'], why: 'the review file sent to another live path' },
    { id: 'other-hash', plant: rep(`INSTALL ${H('1')}`, `INSTALL ${H('0')}`), fails: ['copy-set-mismatch'], why: 'bytes other than the staged ones' },
    { id: 'case-differs', plant: rep('claude/agents/a.md agents/a.md', 'claude/agents/A.md agents/a.md'), fails: ['copy-set-mismatch'], why: 'matched case-sensitively, as seam A matches' },
    { id: 'gate-file', plant: rep('RESULT', `INSTALL ${H('6')} gate/x.mjs pact/builder/gate/x.mjs\nRESULT`), fails: ['copy-set-gate'], why: 'a gate file installs only as a builder kit entry (#203)' },
    // #261 C3: both readings map the review file to one fixed live path; a seam A that sends it anywhere else disagrees.
    { id: 'review-elsewhere', plant: rep('claude/review.md pact/review.md', 'claude/review.md review.md'), fails: ['copy-set-mismatch'], why: 'the review file at the top of the Claude folder, where the general rule would put it' },
    { id: 'gate-file-elsewhere', plant: rep('RESULT', `INSTALL ${H('6')} gate/x.mjs pact/x.mjs\nRESULT`), fails: ['copy-set-gate'], why: 'nor anywhere else' },
  ];
  test('copy set: base passes', async t => assertPasses(await run(base(), t)));
  for (const r of rows) test(`copy set: ${r.id}`, async t => assertFails(await run(r.plant(base()), t), r.fails, r.says));
  test('copy set: base passes after the rows', async t => assertPasses(await run(base(), t)));
}

// The copy set with pact commands (#203, S8): pairs, each side working out its own.
const cmdStaged = new Map([...staged, ['claude/commands/finis.md', H('9')], ['claude/commands/make-it-so.md', H('b')]]);
const cmdCopyBase = () => ({ in: copyBase().in.replace('RESULT', `INSTALL ${H('9')} claude/commands/finis.md commands/finis.md\nRESULT`), list: 'finis' });
{
  const base = cmdCopyBase;
  const run = t => {
    const st = t.extra ? new Map([...cmdStaged, [`claude/commands/${t.extra}.md`, H('c')]]) : cmdStaged;
    return decided(() => core.matchCopySet(t.in.split('\n'), core.expectedCopySet(st.keys(), t.list ? t.list.split(',') : []), st, ID('a')));
  };
  const rows = [
    { id: 'listed-command-left-off', plant: rep(`INSTALL ${H('9')} claude/commands/finis.md commands/finis.md\n`, ''), fails: ['copy-set-mismatch'], why: 'seam A must list a command the list names' },
    { id: 'unlisted-command-added', plant: rep('RESULT', `INSTALL ${H('b')} claude/commands/make-it-so.md commands/make-it-so.md\nRESULT`), fails: ['copy-set-mismatch'], why: 'the two sides read different lists' },
    { id: 'install-side-list-differs', plant: t => ({ ...t, list: 'finis,make-it-so' }), fails: ['copy-set-mismatch'], why: 'the install side names a command seam A did not list' },
    { id: 'extra-pair', plant: rep('RESULT', `INSTALL ${H('9')} claude/commands/finis.md commands/extra.md\nRESULT`), fails: ['copy-set-mismatch'], why: 'one source to a second live path no rule gives' },
    { id: 'pair-twice', plant: rep('RESULT', `INSTALL ${H('9')} claude/commands/finis.md commands/finis.md\nRESULT`), fails: ['copy-set-twice'], why: 'a pair listed twice' },
    { id: 'unknown-file-as-null', plant: t => ({ ...t, in: t.in.replace('RESULT', `INSTALL ${H('c')} claude/commands/ship-it.md null\nRESULT`), extra: 'ship-it' }), fails: ['copy-set-mismatch'], why: 'a file of no known kind never matches, even a line naming null' },
    { id: 'other-command-path', plant: rep('commands/finis.md\n', 'agents/finis.md\n'), fails: ['copy-set-mismatch'], why: 'a command goes to commands/<name>.md' },
  ];
  test('copy set with commands: base passes', async t => assertPasses(await run(base(), t)));
  for (const r of rows) test(`copy set with commands: ${r.id}`, async t => assertFails(await run(r.plant(base()), t), r.fails, r.says));
  test('copy set with commands: base passes after the rows', async t => assertPasses(await run(base(), t)));
}

// The copy set with pact tools (#280 C2): a tool pairs to its own live path only when on.
const toolStaged = new Map([...staged, ['claude/tools/poster.mjs', H('9')]]);
const toolCopyBase = () => ({ in: copyBase().in.replace('RESULT', `INSTALL ${H('9')} claude/tools/poster.mjs pact/tools/poster.mjs\nRESULT`), list: 'poster' });
// #280 C2
{
  const base = toolCopyBase;
  const run = t => decided(() => core.matchCopySet(t.in.split('\n'), core.expectedCopySet(toolStaged.keys(), [], t.list ? t.list.split(',') : []), toolStaged, ID('a')));
  const rows = [
    { id: 'listed-tool-left-off', plant: rep(`INSTALL ${H('9')} claude/tools/poster.mjs pact/tools/poster.mjs\n`, ''), fails: ['copy-set-mismatch'], why: 'seam A must list a tool the list names' },
    { id: 'tool-off-but-listed', plant: t => ({ ...t, list: '' }), fails: ['copy-set-mismatch'], why: 'off, a tool never installs' },
    { id: 'tool-at-home-root', plant: rep('pact/tools/poster.mjs', 'tools/poster.mjs'), fails: ['copy-set-mismatch'], why: "the general claude/ rule's path is not the tool's" },
  ];
  test('copy set with tools: base passes', async t => assertPasses(await run(base(), t)));
  for (const r of rows) test(`copy set with tools: ${r.id}`, async t => assertFails(await run(r.plant(base()), t), r.fails, r.says));
  test('copy set with tools: base passes after the rows', async t => assertPasses(await run(base(), t)));
}

// #280 C2
test('the copy set with tools: a listed tool pairs to pact/tools/, an unlisted one is left out, an unknown one or a subfolder pairs with null', () => {
  const rels = ['claude/CLAUDE.md', 'claude/tools/poster.mjs', 'claude/tools/sender.mjs', 'claude/tools/sub/poster.mjs'];
  assert.deepEqual(core.expectedCopySet(rels, [], ['poster']), [['claude/CLAUDE.md', 'CLAUDE.md'], ['claude/tools/poster.mjs', 'pact/tools/poster.mjs'], ['claude/tools/sender.mjs', null], ['claude/tools/sub/poster.mjs', null]]);
  assert.deepEqual(core.expectedCopySet(['claude/tools/poster.mjs']), [], 'no list installs no tool');
});

test('the copy set with commands: a listed command pairs, an unlisted pact command is left out, an unknown one pairs with null', () => {
  const e = core.expectedCopySet(['claude/CLAUDE.md', 'claude/commands/finis.md', 'claude/commands/make-it-so.md', 'claude/commands/ship-it.md', 'claude/commands/sub/finis.md', 'gate/a.mjs'], ['finis']);
  assert.deepEqual(e, [['claude/CLAUDE.md', 'CLAUDE.md'], ['claude/commands/finis.md', 'commands/finis.md'], ['claude/commands/ship-it.md', null], ['claude/commands/sub/finis.md', null]]);
  assert.deepEqual(core.expectedCopySet(['claude/commands/finis.md']), [], 'no list installs no command');
});

// #203 S6, S8; #262: the builder kit pairs under pact/builder/ only with /scriptorium on; the rules source goes only there, and a builder file the kit doesn't list pairs with null.
test('the copy set with the builder kit: each kit file pairs under pact/builder/ only with scriptorium on, the rules source only there, an unlisted builder file with null', () => {
  const rels = ['claude/CLAUDE.md', 'claude/rules.source.md', 'claude/agents/a.md', 'builder/build.mjs', 'builder/presets/p.json', 'builder/notes.txt', 'gate/shared.mjs', 'gate/seam-a.mjs', 'examples/pact-config/builder.json', 'claude/commands/scriptorium.md'];
  assert.deepEqual(core.expectedCopySet(rels, ['scriptorium']), [
    ['claude/CLAUDE.md', 'CLAUDE.md'],
    ['claude/rules.source.md', 'pact/builder/claude/rules.source.md'],
    ['claude/agents/a.md', 'pact/builder/claude/agents/a.md'], ['claude/agents/a.md', 'agents/a.md'],
    ['builder/build.mjs', 'pact/builder/builder/build.mjs'],
    ['builder/presets/p.json', 'pact/builder/builder/presets/p.json'],
    ['builder/notes.txt', null],
    ['gate/shared.mjs', 'pact/builder/gate/shared.mjs'],
    ['examples/pact-config/builder.json', 'pact/builder/examples/pact-config/builder.json'],
    ['claude/commands/scriptorium.md', 'commands/scriptorium.md'],
  ]);
  assert.deepEqual(core.expectedCopySet(rels, []), [['claude/CLAUDE.md', 'CLAUDE.md'], ['claude/agents/a.md', 'agents/a.md'], ['builder/notes.txt', null]], 'no kit without /scriptorium');
});

// #203 S6: with /scriptorium on, the kit is whole or the install refuses.
test('the builder kit: with scriptorium on, a kit file the commit lacks refuses; with it off, nothing is asked', () => {
  const whole = [...core.BUILDER_KIT];
  assert.doesNotThrow(() => core.checkKit(['scriptorium'], whole));
  assert.deepEqual(decided(() => core.checkKit(['scriptorium'], whole.filter(r => r !== 'builder/parts.mjs'))).fails, ['kit-incomplete']);
  assert.doesNotThrow(() => core.checkKit(['finis'], []));
});

// #262: /scriptorium installs whenever its file is in the commit; the others only when listed.
test('the commands on: the listed ones, and scriptorium whenever the commit holds it', () => {
  assert.deepEqual(core.commandsOn([], ['claude/commands/scriptorium.md', 'claude/commands/finis.md']), ['scriptorium']);
  assert.deepEqual(core.commandsOn(['finis'], ['claude/commands/scriptorium.md', 'claude/commands/finis.md']), ['finis', 'scriptorium']);
  assert.deepEqual(core.commandsOn(['finis'], ['claude/commands/finis.md']), ['finis'], 'no file, no command');
});

// #261 C3
test('the copy set: contracts, practice tests, the overlay, AGENTS.md, gate files and .gitkeep never install; the review file goes to its one fixed path', () => {
  const e = core.expectedCopySet(['claude/CLAUDE.md', 'claude/review.md', 'claude/settings.overlay.json', 'familiars/.gitkeep', 'familiars/x.practice-test.md', 'familiars/x.contract.md', 'familiars/x.md', 'gate/a.mjs', 'AGENTS.md']);
  assert.deepEqual([...e], [['claude/CLAUDE.md', 'CLAUDE.md'], ['claude/review.md', 'pact/review.md'], ['familiars/x.md', null]]);
});

const OVERLAY = json({ permissions: { defaultMode: 'auto', ask: ['PowerShell(x)'] } });
const overlayBase = () => ({ in: [`SETTINGS ${sha256(OVERLAY)} claude/settings.overlay.json`, 'RESULT: pass'].join('\n'), staged: sha256(OVERLAY), text: OVERLAY });
{
  const base = overlayBase;
  const run = t => decided(() => core.checkOverlay(t.in.split('\n'), sha256(t.text), t.staged === 'NONE' ? undefined : t.staged, t.text));
  const rows = [
    { id: 'no-settings-line', plant: rep(/^SETTINGS .*\n/, ''), fails: ['overlay-line'], why: 'seam A must report the overlay' },
    { id: 'two-settings-lines', plant: t => ({ ...t, in: `${t.in.split('\n')[0]}\n${t.in}` }), fails: ['overlay-line'], why: 'exactly one overlay hash' },
    { id: 'other-path', plant: rep('claude/settings.overlay.json', 'claude/other.json'), fails: ['overlay-line'], why: 'the overlay at its one path' },
    { id: 'no-overlay', plant: set('NONE', 'staged'), fails: ['overlay-missing'], why: 'a commit with no overlay' },
    { id: 'hash-not-checked', plant: t => ({ ...t, text: t.text.replace('auto', 'plan') }), fails: ['overlay-hash'], why: 'bytes other than the ones seam A passed' },
    { id: 'staged-hash-differs', plant: set(H('0'), 'staged'), fails: ['overlay-hash'], why: 'the commit holds other bytes' },
    { id: 'not-an-object', plant: t => ({ in: `SETTINGS ${sha256('[1]')} claude/settings.overlay.json\nRESULT: pass`, staged: sha256('[1]'), text: '[1]' }), fails: ['overlay-not-object'], why: 'the overlay must be one JSON object' },
  ];
  test('settings overlay: base passes', async t => assertPasses(await run(base(), t)));
  for (const r of rows) test(`settings overlay: ${r.id}`, async t => assertFails(await run(r.plant(base()), t), r.fails, r.says));
  test('settings overlay: base passes after the rows', async t => assertPasses(await run(base(), t)));
}

// ------------------------------------------------------------ destinations and the plan (L1 to L3)

const noLink = () => false;
{
  const base = () => ({ in: json([['claude/CLAUDE.md', 'CLAUDE.md'], ['claude/agents/a.md', 'agents/a.md']]), link: '' });
  const run = t => decided(() => core.installDestinations(new Map(JSON.parse(t.in).map(([rel, dest]) => [rel, { dest, sha256: H('1') }])), rel => rel === t.link));
  const rows = [
    { id: 'unsafe', plant: rep('"agents/a.md"', '"../a.md"'), fails: ['dest-skip'], why: 'a destination outside the home folder' },
    { id: 'rooted', plant: rep('"agents/a.md"', '"/etc/a.md"'), fails: ['dest-skip'], why: 'a rooted destination' },
    { id: 'protected', plant: rep('"agents/a.md"', '"settings.json"'), fails: ['dest-skip'], why: "the owner's settings" },
    { id: 'protected-alias', plant: rep('"agents/a.md"', '"Settings.json. "'), fails: ['dest-skip'], why: 'Windows drops trailing dots and spaces' },
    { id: 'non-canonical', plant: rep('"agents/a.md"', '"agents/a.md."'), fails: ['dest-skip'], why: 'a name that is not plain' },
    { id: 'through-link', plant: set('agents/a.md', 'link'), fails: ['dest-skip'], why: 'a live agents folder that is a link' },
    { id: 'two-sources', plant: rep('"agents/a.md"', '"claude.md"'), fails: ['dest-twice'], why: 'two sources for one live path, folded' },
  ];
  test('install destinations: base passes', async t => assertPasses(await run(base(), t)));
  for (const r of rows) test(`install destinations: ${r.id}`, async t => assertFails(await run(r.plant(base()), t), r.fails, r.says));
  test('install destinations: base passes after the rows', async t => assertPasses(await run(base(), t)));
}

// dest-skip: the reasons behind the rule id the table above checks.
test('skip reasons: unsafe, protected, non-canonical and linked paths', () => {
  for (const p of ['', '../x', 'a/../b', '/x', '\\x', 'C:x', null, 5]) assert.equal(core.skipReason(p, noLink), 'unsafe path', String(p));
  for (const p of ['settings.json', 'SETTINGS.JSON', '.pact-install.json', 'pact/config.json', 'pact/config.json:stream', 'x/.credentials.json', 'projects/a', 'memory', 'skills/x/y', 'handover/z', 'pact/blocks/b.md', 'pact/presets', 'pact/presets/personal.json', 'Pact/Presets/p.json. ', 'pact/builder.json', 'Pact/Builder.json. ']) assert.equal(core.skipReason(p, noLink), 'protected path', p);
  for (const p of ['agents/a b.md', 'agents/.x', 'agents/a.', 'a\\b']) assert.equal(core.skipReason(p, noLink), 'non-canonical path', p);
  assert.equal(core.skipReason('agents/a.md', () => true), 'path through a link');
  assert.equal(core.skipReason('agents/a.md', noLink), null);
});

test('#272 C8: no install record can make the install write or delete a path under pact/backups', () => {
  for (const p of ['pact/backups', 'pact/backups/20261018T143005123Z-addaa8a/settings.json', 'Pact/Backups/x. ', 'pact/backups:stream']) assert.equal(core.skipReason(p, noLink), 'protected path', p);
  const live = () => ({ exists: true, file: true, sha256: H('1') });
  const record = core.parseRecord(json({ commit: 'x', files: [{ path: 'pact/backups/b/CLAUDE.md', sha256: H('1') }] }));
  const p = core.plan(record, new Map(), live, noLink);
  assert.deepEqual(p.delete, []);
  assert.deepEqual(p.warnings, ['protected path in the install record, skipped: pact/backups/b/CLAUDE.md']);
  // backup-source: a path the backup must copy that is no longer a plain file refuses before anything is made.
  assert.throws(() => core.backupEntries({ copy: ['CLAUDE.md'], add: [], live: () => ({ exists: true, file: false, sha256: null }), record: null }), e => e instanceof core.Refusal && e.rule === 'backup-source');
});

// #262: an agent file changed since the install, or one the record never listed, is the person's: in yours, never drift, overwrite or delete.
test('the plan: drift, overwrite, add, delete, yours and unchanged; a record hash in capitals is not drift; a first install deletes only the retired agents', () => {
  const liveFiles = new Map([['CLAUDE.md', H('1')], ['pact/review.md', H('9')], ['agents/a.md', H('9')], ['agents/old.md', H('3')], ['agents/edited-old.md', H('6')], ['agents/builder.md', H('4')], ['agents/mine.md', H('5')]]);
  const live = rel => (liveFiles.has(rel) ? { exists: true, file: liveFiles.get(rel) !== null, sha256: liveFiles.get(rel) } : { exists: false, file: false, sha256: null });
  const repoFiles = new Map([['CLAUDE.md', H('1')], ['pact/review.md', H('2')], ['agents/a.md', H('2')], ['agents/new.md', H('5')], ['agents/mine.md', H('4')], ['agents/missing.md', H('7')]]);
  const record = core.parseRecord(json({ commit: 'x', files: [{ path: 'CLAUDE.md', sha256: H('1').toUpperCase() }, { path: 'pact/review.md', sha256: H('8') }, { path: 'commands/finis.md', sha256: H('7') }, { path: 'agents/old.md', sha256: H('3') }, { path: 'agents/edited-old.md', sha256: H('3') }, { path: 'agents/a.md', sha256: H('8') }, { path: 'settings.json', sha256: H('0') }, { path: 'agents/missing.md', sha256: H('7') }] }));
  const p = core.plan(record, repoFiles, live, noLink);
  assert.deepEqual(p.drift, ['pact/review.md (changed since the install)', 'commands/finis.md (deleted since the install)']);
  assert.deepEqual(p.yours, ['agents/edited-old.md', 'agents/a.md', 'agents/mine.md']);
  assert.deepEqual(p.overwrite, ['pact/review.md']);
  assert.deepEqual(p.add, ['agents/new.md', 'agents/missing.md']);
  assert.deepEqual(p.delete, ['agents/old.md']);
  assert.deepEqual(p.warnings, ['protected path in the install record, skipped: settings.json']);
  assert.equal(p.same, 1);
  assert.deepEqual(core.plan(null, repoFiles, live, noLink).delete, ['agents/builder.md']);
});

// #262 C25, from CodeRabbit's review: a recorded agent path that is now a folder is drift, never the person's file.
test('the plan: a recorded agent path that is no longer a file is drift, not yours', () => {
  const live = rel => (rel === 'agents/a.md' ? { exists: true, file: false, sha256: null } : { exists: false, file: false, sha256: null });
  const record = core.parseRecord(json({ commit: 'x', files: [{ path: 'agents/a.md', sha256: H('2') }] }));
  const p = core.plan(record, new Map([['agents/a.md', H('2')]]), live, noLink);
  assert.deepEqual(p.yours, []);
  assert.deepEqual(p.drift, ['agents/a.md (deleted since the install)']);
});

test('the plan: a record holding command and kit entries, under a payload without them, deletes them (#203, the rollback row)', () => {
  const liveFiles = new Map([['CLAUDE.md', H('1')], ['commands/finis.md', H('2')], ['pact/builder/builder/build.mjs', H('3')], ['commands/mine.md', H('4')]]);
  const live = rel => (liveFiles.has(rel) ? { exists: true, file: true, sha256: liveFiles.get(rel) } : { exists: false, file: false, sha256: null });
  const record = core.parseRecord(json({ commit: 'x', files: [{ path: 'CLAUDE.md', sha256: H('1') }, { path: 'commands/finis.md', sha256: H('2') }, { path: 'pact/builder/builder/build.mjs', sha256: H('3') }] }));
  const p = core.plan(record, new Map([['CLAUDE.md', H('1')]]), live, noLink);
  assert.deepEqual(p.delete, ['commands/finis.md', 'pact/builder/builder/build.mjs']);
  assert.deepEqual(p.drift, []);
  assert.ok(!p.delete.includes('commands/mine.md'), "the owner's own command is never deleted");
});

// #264 done-criterion: an install over the current pact deletes the live cross script, which the payload no longer holds.
test('the plan: a record listing the retired cross script, under a payload without it, deletes it', () => {
  const liveFiles = new Map([['CLAUDE.md', H('1')], ['pact/cross.mjs', H('2')]]);
  const live = rel => (liveFiles.has(rel) ? { exists: true, file: true, sha256: liveFiles.get(rel) } : { exists: false, file: false, sha256: null });
  const record = core.parseRecord(json({ commit: 'x', files: [{ path: 'CLAUDE.md', sha256: H('1') }, { path: 'pact/cross.mjs', sha256: H('2') }] }));
  const p = core.plan(record, new Map([['CLAUDE.md', H('1')]]), live, noLink);
  assert.deepEqual(p.delete, ['pact/cross.mjs']);
  assert.deepEqual(p.drift, []);
});

// ------------------------------------------------------------ pact commands against the live home folder (#203, S8)

{
  const base = () => ({ in: json(['make-it-so', 'finis']), present: json(['skills/other', 'skills/finis-old', 'commands/finis.md']) });
  const run = t => decided(() => core.checkSkillClash(JSON.parse(t.in), rel => JSON.parse(t.present).includes(rel)));
  const rows = [
    { id: 'same-named-skill', plant: t => ({ ...t, present: json(['skills/finis']) }), fails: ['command-skill-clash'], says: /^REFUSED: skills\/finis exists in the Claude home folder, and Claude Code would run that skill in place of the pact command \/finis\./, why: 'a skill of the same name runs in place of the command' },
    { id: 'first-name-clashes', plant: t => ({ ...t, present: json(['skills/make-it-so']) }), fails: ['command-skill-clash'], why: 'each listed name is checked' },
  ];
  test('skill clash: base passes', async t => assertPasses(await run(base(), t)));
  for (const r of rows) test(`skill clash: ${r.id}`, async t => assertFails(await run(r.plant(base()), t), r.fails, r.says));
  test('skill clash: base passes after the rows', async t => assertPasses(await run(base(), t)));
}

test('skill clash: only listed names are checked, and only by the path the check names', () => {
  const asked = [];
  core.checkSkillClash(['finis'], rel => (asked.push(rel), false));
  assert.deepEqual(asked, ['skills/finis']);
  assert.doesNotThrow(() => core.checkSkillClash([], () => true), 'no list, no check');
});

// #261 C3
{
  const base = () => ({ files: json([['CLAUDE.md', H('1')], ['commands/finis.md', H('2')]]), record: json({ commit: 'x', files: [{ path: 'commands/finis.md', sha256: H('2') }] }), live: json(['CLAUDE.md', 'commands/finis.md']) });
  const run = t => decided(() => core.checkNewPaths(new Map(JSON.parse(t.files)), t.record === 'null' ? null : core.parseRecord(t.record), rel => ({ exists: JSON.parse(t.live).includes(rel) })));
  const rows = [
    { id: 'unlisted-live-file', plant: t => ({ ...t, record: json({ commit: 'x', files: [{ path: 'CLAUDE.md', sha256: H('1') }] }) }), fails: ['unlisted-live'], says: /^REFUSED: commands\/finis\.md already exists in the Claude home folder, and the install record does not list it/, why: "the owner's own command is never overwritten" },
    { id: 'first-install', plant: t => ({ ...t, record: 'null' }), fails: ['unlisted-live'], why: 'with no record, nothing live at a new command path is the pact\'s' },
    // unlisted-live, #261 C3: the review file is never laid over a live file the pact did not put there.
    { id: 'review-path', plant: t => ({ ...t, files: json([['pact/review.md', H('4')]]), live: json(['pact/review.md']) }), fails: ['unlisted-live'], says: /pact\/review\.md already exists .* Move it out of the way, then install again\./, why: 'the review file has the commands rule, with its own remedy' },
    { id: 'kit-path', plant: t => ({ ...t, files: json([['pact/builder/x.mjs', H('3')]]), live: json(['pact/builder/x.mjs']) }), fails: ['unlisted-live'], says: /pact\/builder\/x\.mjs already exists .* Move it out of the way, then install again\./, why: 'the kit always installs with the pact, so moving the file is the only remedy' },
    // unlisted-live, #280 C2: a tool is never laid over a live file the pact did not put there.
    { id: 'tool-path', plant: t => ({ ...t, files: json([['pact/tools/poster.mjs', H('5')]]), live: json(['pact/tools/poster.mjs']) }), fails: ['unlisted-live'], says: /pact\/tools\/poster\.mjs already exists .* Move it, or take its name out of the tools list\./, why: 'the remedy names the tools list' },
  ];
  test('new command paths: base passes', async t => assertPasses(await run(base(), t)));
  for (const r of rows) test(`new command paths: ${r.id}`, async t => assertFails(await run(r.plant(base()), t), r.fails, r.says));
  test('new command paths: base passes after the rows', async t => assertPasses(await run(base(), t)));
}

test('new command paths: agents keep their first-install behaviour, and a path not live passes', () => {
  assert.doesNotThrow(() => core.checkNewPaths(new Map([['agents/a.md', H('1')]]), null, () => ({ exists: true })));
  assert.doesNotThrow(() => core.checkNewPaths(new Map([['commands/finis.md', H('1')]]), null, () => ({ exists: false })));
});

test('the commands block lists every pact command, on or off, says which this commit lacks, and how to turn one on', () => {
  const b = core.commandsBlock(['finis'], ['claude/CLAUDE.md', 'claude/commands/finis.md']);
  assert.deepEqual(b, [
    'Commands:',
    '  /make-it-so: off (not in this commit)',
    '  /finis: on',
    '  /scriptorium: off (not in this commit)',
    '  To turn one on, list its name in pact/config.json, for example: "commands": ["finis"]',
    '  WARN: the user configuration turns on the pact command /finis; it installs to commands/finis.md.',
  ]);
  assert.equal(core.commandsBlock([], []).filter(l => l.startsWith('  WARN')).length, 0);
  assert.equal(core.commandsBlock([], ['claude/CLAUDE.md']).at(-1), '  No pact command that can be turned on is in this commit.', 'never an example the commit lacks');
  assert.match(core.commandsBlock(['scriptorium'], ['claude/commands/scriptorium.md', 'claude/commands/finis.md']).at(-1), /for example: "commands": \["finis"\]$/, 'the first staged command that can be turned on, in PACT_COMMANDS order');
  // #262: /scriptorium is always on, with no warning; a list that still names it is told to drop it.
  const always = core.commandsBlock(['scriptorium'], ['claude/commands/scriptorium.md'], ['scriptorium']);
  assert.ok(always.includes('  /scriptorium: on, always: part of the pact, with the builder kit under pact/builder/'));
  assert.ok(!always.some(l => l.startsWith('  WARN')));
  assert.match(always.at(-1), /^  NOTE: pact\/config\.json lists scriptorium, which now always installs; take it out of the list/);
});

// #280 C4: the Tools block, and its WARN line word for word.
test('the tools block lists every pact tool, on or off, says which this commit lacks, how to turn one on, and warns for each tool on', () => {
  assert.deepEqual(core.toolsBlock(['poster'], ['claude/tools/poster.mjs']), [
    'Tools:',
    '  poster: on',
    '  To turn one on, list its name in pact/config.json, for example: "tools": ["poster"]',
    "  WARN: the user configuration turns on the pact tool poster; it installs to pact/tools/poster.mjs and posts to GitHub as your gh account. Permission rules on gh commands don't see its calls, and its scan is a backstop, not a guarantee.",
  ]);
  assert.deepEqual(core.toolsBlock([], ['claude/tools/poster.mjs']).slice(1), ['  poster: off', '  To turn one on, list its name in pact/config.json, for example: "tools": ["poster"]']);
  assert.deepEqual(core.toolsBlock([], []).slice(1), ['  poster: off (not in this commit)', '  No pact tool that can be turned on is in this commit.']);
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

// #265 C3: the merge takes the pact's retired ask rules out of the live list,
// matched exactly, and leaves the owner's own rules, look-alikes included.
test('the merge drops every retired ask rule, exactly, and keeps the owner\'s own', () => {
  const retired = [...core.RETIRED_ASK];
  const own = ['Bash(git push *)', retired[0].toLowerCase(), `${retired[0]} `];
  const live = core.readSettings(json({ permissions: { ask: [...retired, ...own], defaultMode: 'auto' } }));
  const overlay = core.readSettings(json({ permissions: { defaultMode: 'auto' } }));
  const m = JSON.parse(core.settingsText(core.mergeSettings(live, overlay)));
  assert.deepEqual(m.permissions.ask, [...own].sort());
});

// #265 C3
test('the merge wraps a single live ask value, then drops it if retired, and keeps an emptied list as []', () => {
  const overlay = core.readSettings(json({ permissions: { defaultMode: 'auto' } }));
  const one = r => JSON.parse(core.settingsText(core.mergeSettings(core.readSettings(json({ permissions: { ask: r } })), overlay))).permissions;
  assert.deepEqual(one(core.RETIRED_ASK[0]).ask, []);
  assert.deepEqual(one('Bash(mine)').ask, ['Bash(mine)']);
  assert.equal(Object.hasOwn(JSON.parse(core.settingsText(core.mergeSettings(core.readSettings('{}'), overlay))).permissions, 'ask'), false, 'no ask on either side adds none');
});

// #265 C4: one removal line per retired rule found, printed from the pact's
// constant, and no other line about the ask list.
test('the changes list each retired rule the merge removes, and nothing else about the ask list', () => {
  const retired = [...core.RETIRED_ASK];
  const live = core.readSettings(json({ permissions: { ask: ['Bash(CANARYmine)', retired[1], retired[21]], defaultMode: 'auto' } }));
  const overlay = core.readSettings(json({ permissions: { defaultMode: 'auto' } }));
  const lines = core.settingsChanges(live, overlay);
  assert.deepEqual(lines, ['  - permissions.ask: Bash(*--apply*)', '  - permissions.ask: Bash(*nstall.mjs*\\u005c*)']);
  assert.ok(!lines.join('\n').includes('CANARY'));
});

// #265 C4: the retired rules draw a note; the banned-key and mode warnings stay.
test('the live warnings: banned keys at any depth, retired ask rules, a mode not auto, own keys capped, env names only counted', () => {
  const own = Object.fromEntries(Array.from({ length: 22 }, (_, i) => [`k${String(i).padStart(2, '0')}`, 1]));
  const live = core.readSettings(json({ ...own, enabledPlugins: {}, deep: { x: [{ hooks: {} }] }, env: { A: 1, B: 2, P: 3 }, permissions: { ask: ['r1', core.RETIRED_ASK[3], core.RETIRED_ASK[40]], defaultMode: 'plan' } }));
  const overlay = core.readSettings(json({ env: { P: '1' }, permissions: { defaultMode: 'auto' } }));
  const lines = core.liveSettingsLines(live, overlay);
  assert.equal(lines[0], 'WARN: settings.json holds hooks, a command-running setting the pact never sets.');
  assert.equal(lines[1], "NOTE: settings.json holds 2 of the pact's retired ask rules; --apply removes them.");
  assert.equal(lines[2], 'WARN: settings.json: permissions.defaultMode is not auto; --apply sets it.');
  assert.match(lines[3], /^NOTE: live keys the pact does not set \(yours, not checked\): deep, enabledPlugins, k00, .* and 4 more$/);
  assert.equal(lines[4], 'NOTE: live env names the pact does not set: 2');
  assert.ok(!core.liveSettingsLines(core.readSettings(json({ permissions: { ask: ['r1'], defaultMode: 'auto' } })), overlay).some(l => l.includes('retired')), 'no note without a retired rule');
});

// #265 C3: a look-alike that differs by an invisible character is the owner's
// rule, not the pact's, so it stays (#110).
test('bad case: a live rule that differs from a retired rule only by an invisible character is kept, not dropped', () => {
  const rule = 'Bash(*nstall.mjs*)';
  assert.ok(core.RETIRED_ASK.includes(rule));
  const overlay = core.readSettings(json({ permissions: { defaultMode: 'auto' } }));
  for (const c of ['\u00ad', '\u200b', '\u2060']) {
    const near = rule.replace('nstall', `ns${c}tall`);
    const live = core.readSettings(json({ permissions: { ask: [near], defaultMode: 'auto' } }));
    assert.deepEqual(JSON.parse(core.settingsText(core.mergeSettings(live, overlay))).permissions.ask, [near], JSON.stringify(c));
    assert.ok(core.guardHolds(live), JSON.stringify(c));
  }
});

// #265 C6
test('the guard after an apply: auto mode, and no retired ask rule left', () => {
  const s = p => core.readSettings(json({ permissions: p }));
  assert.ok(core.guardHolds(s({ defaultMode: 'auto' })), 'no ask list holds');
  assert.ok(core.guardHolds(s({ defaultMode: 'auto', ask: [] })));
  assert.ok(core.guardHolds(s({ defaultMode: 'auto', ask: ['Bash(mine)'] })));
  assert.ok(!core.guardHolds(s({ defaultMode: 'auto', ask: ['Bash(mine)', core.RETIRED_ASK[55]] })), 'a retired rule remains');
  assert.ok(!core.guardHolds(s({ defaultMode: 'auto', ask: 'Bash(mine)' })), 'a non-list ask');
  assert.ok(!core.guardHolds(s({ defaultMode: 'Auto' })));
  assert.ok(!core.guardHolds(core.readSettings('{}')));
  assert.ok(!core.guardHolds(null));
});

// ------------------------------------------------------------ binding and apply (H1, X1)

{
  const base = () => ({ in: json({ renderedHash: H('a'), commit: ID('c') }) });
  const run = t => decided(() => core.checkBinding(JSON.parse(t.in), H('a'), ID('c')));
  const rows = [
    { id: 'wrong-hash', plant: rep(H('a'), H('b')), fails: ['hash-mismatch'], why: 'a configuration changed since the dry run' },
    { id: 'first-63', plant: rep(H('a'), 'a'.repeat(63)), fails: ['hash-mismatch'], why: 'a hash cut short' },
    { id: 'digest-length', plant: rep(H('a'), 'a'.repeat(12)), fails: ['hash-mismatch'], why: 'the digest is not the hash' },
    { id: 'capitals', plant: rep(H('a'), 'A'.repeat(64)), fails: ['hash-mismatch'], why: 'compared exactly' },
    { id: 'trailing-space', plant: rep(H('a'), `${H('a')} `), fails: ['hash-mismatch'], why: 'compared exactly' },
    { id: 'empty-hash', plant: rep(H('a'), ''), fails: ['hash-mismatch'], why: 'a hash given is compared even when empty' },
    { id: 'wrong-commit', plant: rep(ID('c'), ID('d')), fails: ['commit-mismatch'], why: 'the clone changed since the dry run' },
    { id: 'short-commit', plant: rep(ID('c'), 'c'.repeat(7)), fails: ['commit-mismatch'], why: 'the full id only' },
  ];
  test('hash and commit binding: base passes', async t => assertPasses(await run(base(), t)));
  for (const r of rows) test(`hash and commit binding: ${r.id}`, async t => assertFails(await run(r.plant(base()), t), r.fails, r.says));
  test('hash and commit binding: base passes after the rows', async t => assertPasses(await run(base(), t)));
}

test('the binding: nothing given is nothing compared', () => {
  assert.equal(decided(() => core.checkBinding({ renderedHash: null, commit: null }, H('a'), ID('c'))).code, 0);
});

const applyBase = () => ({ in: json({ configApplies: true, hashGiven: true, selfDiffers: false, drift: false, dirty: false, settingsObject: true }) });
{
  const base = applyBase;
  const run = t => decided(() => core.checkApply(JSON.parse(t.in)));
  const rows = [
    { id: 'no-hash-with-config', plant: rep('"hashGiven":true', '"hashGiven":false'), fails: ['apply-needs-hash'], why: 'a configuration applies' },
    { id: 'self-differs', plant: rep('"selfDiffers":false', '"selfDiffers":true'), fails: ['apply-self-differs'], why: 'an uncommitted edit to the install script' },
    { id: 'drift', plant: rep('"drift":false', '"drift":true'), fails: ['apply-drift'], says: /owner's decision/, why: 'live files changed since the last install' },
    { id: 'dirty', plant: rep('"dirty":false', '"dirty":true'), fails: ['apply-dirty'], why: 'the working tree is not clean' },
    { id: 'settings-not-object', plant: rep('"settingsObject":true', '"settingsObject":false'), fails: ['apply-settings'], why: "the guard can't be merged" },
  ];
  test('apply refusals: base passes', async t => assertPasses(await run(base(), t)));
  for (const r of rows) test(`apply refusals: ${r.id}`, async t => assertFails(await run(r.plant(base()), t), r.fails, r.says));
  test('apply refusals: base passes after the rows', async t => assertPasses(await run(base(), t)));
}

test('apply: no configuration needs no hash', () => {
  assert.equal(decided(() => core.checkApply({ configApplies: false, hashGiven: false, selfDiffers: false, drift: false, dirty: false, settingsObject: true })).code, 0);
});

// ------------------------------------------------------------ the runner's start and its review (S3, V1)

const workBase = () => ({ in: json({ parentReal: 'C:\\T', tmpReal: 'c:\\t', name: 'pact-install-Ab12', hasGit: false, runnerReal: 'C:\\T\\pact-install-Ab12\\stage\\gate\\install-run.mjs', expectedRunnerReal: 'c:\\t\\pact-install-ab12\\stage\\gate\\install-run.mjs', fold: true }) });
{
  const base = workBase;
  const run = t => decided(() => core.checkWorkFolder(JSON.parse(t.in)));
  const rows = [
    { id: 'not-in-temp', plant: rep('"parentReal":"C:\\\\T"', '"parentReal":"C:\\\\repo"'), fails: ['run-work-folder'], why: 'run from the clone' },
    { id: 'other-name', plant: rep('"name":"pact-install-Ab12"', '"name":"stage"'), fails: ['run-work-folder'], why: 'a folder the bootstrap did not make' },
    { id: 'holds-git', plant: rep('"hasGit":false', '"hasGit":true'), fails: ['run-work-folder'], why: 'a work folder that is a repo' },
    { id: 'runner-elsewhere', plant: rep('"runnerReal":"C:\\\\T', '"runnerReal":"C:\\\\X'), fails: ['run-work-folder'], why: 'the runner is not the stage copy' },
    { id: 'case-on-unix', plant: rep('"fold":true', '"fold":false'), fails: ['run-work-folder'], why: 'case is folded only where the system folds it' },
  ];
  test('runner work folder: base passes', async t => assertPasses(await run(base(), t)));
  for (const r of rows) test(`runner work folder: ${r.id}`, async t => assertFails(await run(r.plant(base()), t), r.fails, r.says));
  test('runner work folder: base passes after the rows', async t => assertPasses(await run(base(), t)));
}

{
  const base = () => ({ in: json(['/tmp/pact-install-x', ID('a'), '3', 'no', '--', '--apply']) });
  const run = t => decided(() => core.parseRunnerArgs(JSON.parse(t.in)));
  const rows = [
    { id: 'no-separator', plant: rep('"--",', ''), fails: ['run-args'], why: "the bootstrap's shape only" },
    { id: 'short-commit', plant: rep(ID('a'), 'a'.repeat(7)), fails: ['run-args'], why: 'a full commit id' },
    { id: 'bad-count', plant: rep('"3"', '"-1"'), fails: ['run-args'], why: 'a count of paths' },
    { id: 'bad-self', plant: rep('"no"', '"maybe"'), fails: ['run-args'], why: 'yes or no' },
  ];
  test('runner command line: base passes', async t => assertPasses(await run(base(), t)));
  for (const r of rows) test(`runner command line: ${r.id}`, async t => assertFails(await run(r.plant(base()), t), r.fails, r.says));
  test('runner command line: base passes after the rows', async t => assertPasses(await run(base(), t)));
}

{
  const base = () => ({ in: json({ lines: [`REVIEW ${H('a')} ${H('d')}`, 'RESULT: pass'], failed: false }) });
  const run = t => decided(() => core.checkReviewLines(JSON.parse(t.in), H('a'), H('d')));
  const rows = [
    { id: 'other-hashes', plant: rep(`REVIEW ${H('a')}`, `REVIEW ${H('b')}`), fails: ['review-failed'], why: 'a review module that reports other hashes than this run rendered' },
    { id: 'extra-line', plant: rep('"RESULT: pass"', '"x","RESULT: pass"'), fails: ['review-failed'], why: 'exactly two lines' },
    { id: 'failed', plant: rep('"failed":false', '"failed":true'), fails: ['review-failed'], why: 'both parts of the verdict' },
  ];
  test('review lines: base passes', async t => assertPasses(await run(base(), t)));
  for (const r of rows) test(`review lines: ${r.id}`, async t => assertFails(await run(r.plant(base()), t), r.fails, r.says));
  test('review lines: base passes after the rows', async t => assertPasses(await run(base(), t)));
}

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

test('the configuration block: a removed configuration, changed and new files, and warnings, a security-set lens\'s as plain as any (#262)', () => {
  const record = core.parseRecord(json({ commit: 'x', files: ['f'], config: [{ kind: 'user', sha256: H('0') }, { kind: 'block', path: 'gone.md', sha256: H('9') }] }));
  const none = core.parseRenderLines(noneBase().in.split('\n'), { project: false, hash: sha256 });
  assert.deepEqual(core.configBlock(none, H('a'), record), ['  no configuration', '  the last install had a configuration; this install removes it from the rules file']);
  const p = core.parseRenderLines(renderBase().in.split('\n'), { project: false, hash: sha256 });
  const b = core.configBlock(p, H('a'), record);
  assert.equal(b[0], `  user file pact/config.json: sha256 ${U}, CHANGED since the last install`);
  assert.equal(b[1], `  block file pact/blocks/a.md: sha256 ${H('e')}, new since the last install`);
  assert.equal(b[2], '  1 block file(s) the last install read are no longer used');
  assert.equal(b.find(l => l.includes('data-lens')), '  WARN: the user configuration sets data-lens to `sonnet`, high effort.');
  const blockChanged = core.configBlock(p, H('a'), core.parseRecord(json({ commit: 'x', files: ['f'], config: [{ kind: 'user', sha256: U }, { kind: 'block', path: 'a.md', sha256: H('9') }] })));
  assert.equal(blockChanged[0], `  user file pact/config.json: sha256 ${U}, unchanged since the last install`);
  assert.equal(blockChanged[1], `  block file pact/blocks/a.md: sha256 ${H('e')}, CHANGED since the last install`);
  assert.ok(core.configStale(core.configNow(p), record.config));
  assert.ok(!core.configStale(new Map([['user', H('0')]]), new Map([['user', H('0')]])));
});

// #262 S8, S9; #287 C4, C7: the security-defaults line names each part Scriptorium builds, says whether the configuration changed, and never shows for the moves.
test('the security-defaults line: each part Scriptorium builds alone shows it, a moves edit does not, and it says whether the configuration changed', () => {
  const withEdit = mark => core.parseRenderLines(renderBase().in.replace('EDIT moves', `EDIT ${mark}`).split('\n'), { project: false, hash: sha256 });
  for (const mark of ['tiers', 'sensitive', 'workflow', 'lenses', 'qualities', 'cost-limits']) {
    const line = core.securityDefaultsLine(withEdit(mark), null);
    assert.match(line, new RegExp(`^WARN: SECURITY DEFAULTS: the user configuration edits ${mark}, which changes the pact's security defaults;`));
    assert.doesNotMatch(line, /a\.md|blocks/, 'it names no block file');
  }
  assert.equal(core.securityDefaultsLine(withEdit('moves'), null), null);
  const p = withEdit('lenses');
  const same = core.parseRecord(json({ commit: 'x', files: ['f'], config: [{ kind: 'user', sha256: U }, { kind: 'block', path: 'a.md', sha256: H('e') }] }));
  const changed = core.parseRecord(json({ commit: 'x', files: ['f'], config: [{ kind: 'user', sha256: U }, { kind: 'block', path: 'a.md', sha256: H('9') }] }));
  assert.match(core.securityDefaultsLine(p, same), / The configuration is unchanged since the last install\.$/);
  assert.match(core.securityDefaultsLine(p, changed), / The configuration CHANGED since the last install\.$/);
});

// #262: an agent setting never shows the security-defaults line; a person may run any agent on any model.
test('the security-defaults line: a security-set lens off its default alone does not show it, and does not change the parts\' line', () => {
  const lines = (from, to) => core.parseRenderLines(renderBase().in.replace(from, to).split('\n'), { project: false, hash: sha256 });
  assert.match(core.securityDefaultsLine(lines('EDIT moves', 'EDIT tiers'), null), /^WARN: SECURITY DEFAULTS: the user configuration edits tiers, which changes the pact's security defaults; read those parts in the rendered rules file before you install\. No install is recorded to compare with\.$/);
});

// #287 C7 (seam 3): the home note line. The shipped cost rows reach a lens only through a quality's Enough, so a
// Qualities edit whose table has no Enough column gets a note; no edit, a shipped table or an Enough column gets none.
test('the Enough note: a Qualities edit with no Enough column shows it; the shipped table, an Enough column and other edits do not', () => {
  const withEdit = mark => core.parseRenderLines(renderBase().in.replace('EDIT moves', `EDIT ${mark}`).split('\n'), { project: false, hash: sha256 });
  const old = '| Quality | Measure | Lens |\n| --- | --- | --- |\n| Functional suitability | the acceptance claims | `behaviour-lens` |\n';
  const note = core.enoughNoteLine(withEdit('qualities'), old);
  assert.match(note, /^NOTE: the user configuration edits qualities, and its table has no Enough column, so the Cost limits limit the review itself rather than any quality's lenses;/);
  const shipped = readFileSync(join(REPO, 'claude', 'CLAUDE.md'), 'utf8');
  assert.equal(core.enoughNoteLine(withEdit('qualities'), shipped), null, 'the shipped table has the column');
  assert.equal(core.enoughNoteLine(withEdit('qualities'), `${old}| Quality | Measure | Lens | Enough |\n`), null);
  assert.equal(core.enoughNoteLine(withEdit('lenses'), old), null, 'an edit to another part');
  assert.equal(core.enoughNoteLine(withEdit('moves'), old), null);
  assert.equal(core.enoughNoteLine(withEdit('qualities'), `${old}\nProse that says | Enough | in a sentence.\n`), note, 'prose is no column header');
  assert.equal(core.enoughNoteLine(withEdit('qualities'), '| Quality | Enough | Measure | Lens |\n'), null, 'the column in any position');
  assert.equal(core.enoughNoteLine(withEdit('qualities'), '| Quality | Measure | Lens | Enough | \n'), null, 'a trailing space after the last bar');
  assert.equal(core.enoughNoteLine(withEdit('qualities'), `${old}| Stage | Enough |\n`), note, 'another table that ends in Enough is not the Qualities table');
});
