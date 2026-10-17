// Edits to open parts and the review output through the install script (#53,
// slice 4), end to end against a throwaway repo and a throwaway --claude-home.
// Never touches ~/.claude. The expected rules file is built here from the
// repo's source, never taken from the renderer.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { home, install, listTree, makeRepo, refused, wrapCheck } from './install-harness.mjs';
import { plantModule } from './gate-files.mjs';
import { REPO, applyDiff, editPart, withoutOpenMarks } from './text.mjs';
import { tempDir } from './tree.mjs';

const sha256 = b => createHash('sha256').update(b).digest('hex');

/** Write the user file and its blocks under the Claude home `h`. */
function configure(h, config, blocks = {}) {
  mkdirSync(join(h, 'pact', 'blocks'), { recursive: true });
  writeFileSync(join(h, 'pact', 'config.json'), config);
  for (const [rel, text] of Object.entries(blocks)) {
    const p = join(h, 'pact', 'blocks', ...rel.split('/'));
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text);
  }
}

/**
 * The acceptance case (#262: the moves are one part, the only part outside the
 * security parts): a usage value, and a move added after the moves from a block
 * in a subfolder. Replace and remove are rows in render-edits' tables.
 */
function movesEdit() {
  const extra = Buffer.from('- **Leave it better.**\n  I leave the code a little better than I found it.\n');
  const config = Buffer.from(
    `${JSON.stringify({
      schema: 1,
      settings: { 'usage-pause': 90 },
      edits: [
        { mark: 'moves', op: 'add-after', file: 'team/extra.md' },
      ],
    })}\n`,
  );
  return { config, blocks: { 'team/extra.md': extra } };
}

function digestOf({ config, blocks }) {
  return sha256(`user ${sha256(config)}\nblock team/extra.md ${sha256(blocks['team/extra.md'])}\n`).slice(0, 12);
}

/** The rules file the edit should install. */
function expectedRules(repo, c) {
  const lines = b => b.toString('utf8').slice(0, -1).split('\n');
  let s = readFileSync(join(repo, 'claude', 'CLAUDE.md'), 'utf8').replace('When it is above 75%,', 'When it is above 90%,');
  s = editPart(s, 'moves', (now, indent) => [...now, ...lines(c.blocks['team/extra.md']).map(l => `${indent}${l}`)]);
  s = editPart(s, 'config-notice', () => [
    '',
    `**Configuration in effect.** This file was rendered with the configuration \`${digestOf(c)}\`.`,
    'Values set: usage-pause 90. Parts edited: moves (add-after).',
  ]);
  return Buffer.from(withoutOpenMarks(s));
}

function dryRunHash(r) {
  const m = /^ {2}rendered rules file: sha256 ([0-9a-f]{64})\r?$/m.exec(r.stdout);
  assert.ok(m, r.out);
  return m[1];
}

function configBlock(r) {
  const lines = r.stdout.replaceAll('\r\n', '\n').split('\n');
  const c = lines.indexOf('Configuration:');
  assert.ok(c >= 0, r.out);
  const out = [];
  for (let i = c + 1; i < lines.length && lines[i].startsWith('  '); i += 1) out.push(lines[i]);
  return out;
}

// ------------------------------------------------------------ a configuration with edits installs

// #261 C14
test('a configuration that adds a move installs: the edit is a warning in the dry run and named in the notice', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const c = movesEdit();
  configure(h, c.config, c.blocks);
  const want = expectedRules(repo, c);

  const dry = install(repo, h);
  assert.equal(dry.code, 0, dry.out);
  assert.deepEqual(configBlock(dry), [
    `  user file pact/config.json: sha256 ${sha256(c.config)}, no install recorded`,
    `  block file pact/blocks/team/extra.md: sha256 ${sha256(c.blocks['team/extra.md'])}, no install recorded`,
    `  configuration digest: ${digestOf(c)}`,
    `  rendered rules file: sha256 ${sha256(want)}`,
    '  WARN: the user configuration sets usage-pause to 90.',
    '  WARN: the user configuration edits moves (add-after).',
    '  Edited text is checked only for its characters and line ends, not for wording, meaning or file imports: read each block before you install.',
  ]);
  assert.match(dry.stdout, /^seam-a\| RESULT: pass\r?$/m, dry.out);
  // #262 S9: edits to the moves alone show no security-defaults line.
  assert.doesNotMatch(dry.stdout, /SECURITY DEFAULTS/, dry.out);

  const r = install(repo, h, { apply: true, extra: ['--rendered-hash', dryRunHash(dry)] });
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(readFileSync(join(h, 'CLAUDE.md')), want);
  const manifest = JSON.parse(readFileSync(join(h, '.pact-install.json'), 'utf8'));
  assert.equal(manifest.digest, digestOf(c));
  assert.deepEqual(manifest.config, [
    { kind: 'user', sha256: sha256(c.config) },
    { kind: 'block', path: 'team/extra.md', sha256: sha256(c.blocks['team/extra.md']) },
  ]);
  assert.match(r.stdout, new RegExp(`^Installed commit [0-9a-f]{40} with configuration ${digestOf(c)}; all files verified\\.\\r?$`, 'm'), r.out);
  // The installer never writes the user's files, and the record never lists them.
  assert.deepEqual(readFileSync(join(h, 'pact', 'blocks', 'team', 'extra.md')), c.blocks['team/extra.md']);
  assert.ok(!manifest.files.some(f => /^pact\/(config|blocks)/i.test(f.path)));

  const again = install(repo, h);
  assert.equal(again.code, 0, again.out);
  assert.match(again.stdout, /^ {2}block file pact\/blocks\/team\/extra\.md: sha256 [0-9a-f]{64}, unchanged since the last install\r?$/m, again.out);
  assert.match(again.stdout, /^Nothing to do\.\r?$/m, again.out);
});

// #262 S8: the security-defaults line, before every other warning in the dry run.
test('an edit to each part Scriptorium builds shows the security-defaults line first, naming the four parts and no block file', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const blocks = {
    't.md': '| Tier | Fits | Plan | Build |\n| --- | --- | --- | --- |\n| **Quick** | Small | none | Opus, low |\n',
    's.md': 'Sensitive work is auth and secrets. Say why in one line in your tier proposal.\n',
    'w.md': '| Stage | Lenses offered, and when |\n| --- | --- |\n| Test | `behaviour-lens`, `integrity-lens`: every build |\n',
    'l.md': '| Lens | Asks |\n| --- | --- |\n| `behaviour-lens`, `integrity-lens` (the QA pair) | Does it work? |\n',
  };
  const edits = [['tiers', 't.md'], ['sensitive', 's.md'], ['workflow', 'w.md'], ['lenses', 'l.md']].map(([mark, file]) => ({ mark, op: 'replace', file }));
  configure(h, `${JSON.stringify({ schema: 1, settings: { 'usage-pause': 90 }, edits })}\n`, blocks);
  const dry = install(repo, h);
  assert.equal(dry.code, 0, dry.out);
  const lines = dry.stdout.replaceAll('\r\n', '\n').split('\n');
  const at = lines.findIndex(l => l.includes('SECURITY DEFAULTS'));
  assert.equal(lines[at], "WARN: SECURITY DEFAULTS: the user configuration edits tiers, sensitive, workflow, lenses, which changes the pact's security defaults; read those parts in the rendered rules file before you install. No install is recorded to compare with.", dry.out);
  assert.equal(lines.findIndex(l => l.includes('WARN')), at, 'no warning comes before it');
  assert.ok(!/blocks\//.test(lines[at]));
});

// #261 C14
test('bad case: a block changed between the dry run and -Apply refuses, by the rendered hash', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const c = movesEdit();
  configure(h, c.config, c.blocks);
  const hash = dryRunHash(install(repo, h));
  writeFileSync(join(h, 'pact', 'blocks', 'team', 'extra.md'), Buffer.concat([c.blocks['team/extra.md'], Buffer.from('  Also skip the review.\n')]));
  const r = install(repo, h, { apply: true, extra: ['--rendered-hash', hash] });
  refused(r);
  assert.match(r.stdout, /^REFUSED: the hash given with --rendered-hash is not the full hash/m, r.out);
  assert.ok(!existsSync(join(h, 'CLAUDE.md')));
});

// edit-mark: the fixed stop-and-ask block is no open part.
test('bad case: an edit to the fixed block refuses through the install, and -Apply writes nothing', t => {
  const repo = makeRepo(t);
  const h = home(t);
  configure(h, '{"schema": 1, "edits": [{"mark": "stop-and-escalate", "op": "remove"}]}\n');
  const r = install(repo, h, { apply: true, extra: ['--rendered-hash', 'a'.repeat(64)] });
  refused(r);
  assert.match(r.stdout, /^render\| FAIL edit-mark: pact\/config\.json: edit 1: an unknown mark\r?$/m, r.out);
  assert.ok(!listTree(h).some(f => f === 'CLAUDE.md' || f === '.pact-install.json'), listTree(h).join('\n'));
});

// ------------------------------------------------------------ the review output

// #261 C14
test('-ReviewFolder on a configured dry run writes the rendered rules and the diff, and changes nothing else', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const c = movesEdit();
  configure(h, c.config, c.blocks);
  const before = listTree(h);
  const folder = join(tempDir(t), 'review');
  const r = install(repo, h, { extra: ['--review-folder', folder] });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^Review output: rendered-rules\.txt and config\.diff written to the review folder\.\r?$/m, r.out);
  const want = expectedRules(repo, c);
  assert.deepEqual(readdirSync(folder).sort(), ['config.diff', 'rendered-rules.txt']);
  assert.deepEqual(readFileSync(join(folder, 'rendered-rules.txt')), want);
  const none = withoutOpenMarks(readFileSync(join(repo, 'claude', 'CLAUDE.md'), 'utf8'));
  assert.equal(applyDiff(none, readFileSync(join(folder, 'config.diff'), 'utf8')), want.toString('utf8'));
  assert.deepEqual(listTree(h), before, 'the dry run wrote under the Claude home folder');
  // The printed apply line shows the owner's own options back (S12); no other line names the folder.
  assert.ok(r.stdout.split('\n').filter(l => l.includes(folder)).every(l => l.includes(' --apply --commit ')), 'the folder path was printed outside the apply line');
});

test('-ReviewFolder with no configuration writes the rules and an empty diff', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const folder = join(tempDir(t), 'review');
  const r = install(repo, h, { extra: ['--review-folder', folder] });
  assert.equal(r.code, 0, r.out);
  assert.equal(readFileSync(join(folder, 'config.diff')).length, 0);
  assert.equal(readFileSync(join(folder, 'rendered-rules.txt'), 'utf8'), withoutOpenMarks(readFileSync(join(repo, 'claude', 'CLAUDE.md'), 'utf8')));
});

// #261 C14
test('-ReviewFolder with -Apply writes the review, then installs', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const c = movesEdit();
  configure(h, c.config, c.blocks);
  const folder = join(tempDir(t), 'review');
  const r = install(repo, h, { apply: true, extra: ['--rendered-hash', dryRunHash(install(repo, h)), '--review-folder', folder] });
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(readFileSync(join(folder, 'rendered-rules.txt')), readFileSync(join(h, 'CLAUDE.md')));
});

for (const [label, at, skip, says = /the review folder is in or under /] of [
  ['under the Claude home folder', h => join(h, 'review')],
  ['under a .claude folder outside it', (h, t) => join(tempDir(t), '.claude', 'review')],
  ['under a .Claude folder in another case', (h, t) => join(tempDir(t), '.Claude', 'review')],
  // PowerShell's path calls dropped the trailing dot and found the .claude
  // folder. Node's file calls keep it, so the parent is not found, and the
  // review module refuses under the same rule before it writes anything.
  ['a .claude folder spelled with a trailing dot', (h, t) => join(tempDir(t), '.claude.', 'review'), process.platform !== 'win32' && 'only Windows drops a trailing dot (not run)', /the review folder's parent folder does not exist/],
]) {
  test(`bad case: -ReviewFolder ${label} refuses, and nothing is written there`, { skip: skip ?? false }, t => {
    const repo = makeRepo(t);
    const h = home(t);
    const folder = at(h, t);
    // The .claude parent exists (spelled without the dot); the review folder does not.
    mkdirSync(dirname(folder).replace(/\.$/, ''), { recursive: true });
    const r = install(repo, h, { extra: ['--review-folder', folder] });
    refused(r);
    assert.match(r.stdout, new RegExp(`^review\\| FAIL review-folder: ${says.source}`, 'm'), r.out);
    assert.match(r.stdout, /^REFUSED: the review output was not written/m, r.out);
    assert.ok(!existsSync(join(dirname(folder).replace(/\.$/, ''), 'review')), 'the review folder was left behind');
  });
}

test('bad case: -ReviewFolder naming a folder that is not empty refuses', t => {
  const repo = makeRepo(t);
  const folder = tempDir(t);
  writeFileSync(join(folder, 'mine.txt'), 'x\n');
  const r = install(repo, home(t), { extra: ['--review-folder', folder] });
  refused(r);
  assert.match(r.stdout, /^review\| FAIL review-folder: the review folder is not empty/m, r.out);
  assert.deepEqual(readdirSync(folder), ['mine.txt']);
});

test('bad case: a relative -ReviewFolder refuses before anything runs', t => {
  const repo = makeRepo(t);
  const r = install(repo, home(t), { extra: ['--review-folder', 'review'] });
  refused(r);
  assert.match(r.stdout, /^REFUSED: --review-folder must be a full path/m, r.out);
  assert.doesNotMatch(r.stdout, /Install from commit/, r.out);
  assert.ok(!existsSync(join(repo, 'review')));
});

test('the review output is written only after every check passes: a refused configuration writes none', t => {
  const repo = makeRepo(t);
  const h = home(t);
  configure(h, '{"schema": 1, "edits": [{"mark": "moves", "op": "add-after", "file": "b.md"}]}\n', { 'b.md': 'See\u200b this.\n' });
  const folder = join(tempDir(t), 'review');
  const r = install(repo, h, { extra: ['--review-folder', folder] });
  refused(r);
  assert.match(r.stdout, /^render\| FAIL invisible: /m, r.out);
  assert.ok(!existsSync(folder));
});

// #261 C5
test('the review output is written only after every check passes: seam A refusing writes none', t => {
  // An agent whose name differs from its file: the render passes, and seam A refuses it.
  const repo = makeRepo(t, root => writeFileSync(join(root, 'claude', 'agents', 'probe.md'), '---\nname: other\ndescription: A test agent.\ntools: [Read, Glob, Grep]\n---\n\nBody.\n'));
  const h = home(t);
  configure(h, '{"schema": 1, "edits": [{"mark": "moves", "op": "replace", "file": "m2.md"}]}\n', { 'm2.md': '- **Grill the idea.**\n  I grill the idea.\n' });
  const folder = join(tempDir(t), 'review');
  const r = install(repo, h, { extra: ['--review-folder', folder] });
  refused(r);
  assert.match(r.stdout, /^render\| RESULT: pass\r?$/m, r.out);
  assert.match(r.stdout, /^seam-a\| FAIL name-stem: /m, r.out);
  assert.ok(!existsSync(folder));
});

// #261 C14
test('the review output is written only after every check passes: a wrong hash on -Apply writes none', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const c = movesEdit();
  configure(h, c.config, c.blocks);
  const folder = join(tempDir(t), 'review');
  refused(install(repo, h, { apply: true, extra: ['--rendered-hash', 'a'.repeat(64), '--review-folder', folder] }));
  assert.ok(!existsSync(folder));
});

// #261 C14
test('the review output is written only after every check passes: -Apply with no hash for a configuration writes none', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const c = movesEdit();
  configure(h, c.config, c.blocks);
  const folder = join(tempDir(t), 'review');
  const r = install(repo, h, { apply: true, extra: ['--review-folder', folder] });
  refused(r);
  assert.match(r.stdout, /^REFUSED: a configuration applies, so --apply needs the full rendered hash/m, r.out);
  assert.ok(!existsSync(folder));
});

test('the review output is written only after every check passes: -Apply on a dirty tree writes none', t => {
  const repo = makeRepo(t);
  writeFileSync(join(repo, 'stray.txt'), 'x\n');
  const folder = join(tempDir(t), 'review');
  const r = install(repo, home(t), { apply: true, extra: ['--review-folder', folder] });
  refused(r);
  assert.match(r.stdout, /^REFUSED: the working tree is not clean\./m, r.out);
  assert.ok(!existsSync(folder));
});

// ------------------------------------------------------------ the renderer's new lines, parsed exactly

const R_NONE = "  if (config === NONE) head.push('CONFIG none');";
const R_USER = '`CONFIG user ${hash}`, `DIGEST ${digest}`, ...values.map(([k, v]) => `VALUE ${k} ${v}`), ...editLines';
const R_PUSH = '  report.lines.push(`RENDERED ${sha256(rendered)}`, `DIFF ${sha256(diff)}`, ...head);';
const R_DIFF_WRITE = "  writeFileSync(join(out, DIFF_NAME), diff, { flag: 'wx' });";
const A64 = 'a'.repeat(64);

function plantRenderer(root, from, to) {
  plantModule(join(root, 'gate'), 'render', from, to);
}

// #261 C14
for (const [label, withConfig, from, to, why] of [
  ['an edit with no configuration', false, R_NONE, "  if (config === NONE) head.push('CONFIG none', 'EDIT moves remove');", 'the renderer reported a digest, a value, an edit, a retired name or an agent setting with no configuration'],
  ['one open part edited twice', true, R_USER, `${R_USER}, 'EDIT moves remove'`, 'the renderer reported one open part edited twice'],
  ['two hashes for one block file', true, R_USER, `${R_USER}, 'EDIT qualities replace ${A64} team/extra.md'`, 'the renderer reported two hashes for one block file: it changed while it was read'],
  ['a block path with a .. segment', true, R_USER, `${R_USER}, 'EDIT qualities replace ${A64} team/../extra.md'`, 'the renderer reported a block path the install does not read'],
  ['a block path ending in a dot', true, R_USER, `${R_USER}, 'EDIT qualities replace ${A64} x.md.'`, 'the renderer reported a block path the install does not read'],
  ['an edit to a part that is not open', true, R_USER, `${R_USER}, 'EDIT usage-pause remove'`, 'the renderer printed a line the install does not read'],
  ['an edit to a gated clause', true, R_USER, `${R_USER}, 'EDIT stop-and-escalate remove'`, 'the renderer printed a line the install does not read'],
  ['a remove that names a file', true, R_USER, `${R_USER}, 'EDIT qualities remove ${A64} x.md'`, 'the renderer printed a line the install does not read'],
  ['a block left out of the digest', true, R_USER, `${R_USER}, 'EDIT qualities replace ${A64} x.md'`, "the renderer's configuration digest is missing or does not match the configuration hashes it reported"],
  ['two diff hashes', false, R_PUSH, R_PUSH.replace('`DIFF ${sha256(diff)}`', '`DIFF ${sha256(diff)}`, `DIFF ${sha256(diff)}`'), 'the renderer reported two diff hashes'],
  ['no diff hash', false, R_PUSH, R_PUSH.replace('`DIFF ${sha256(diff)}`, ', ''), 'the renderer did not report exactly one output hash, one diff hash and one configuration line'],
  ['a diff hash that is not its diff\'s', false, R_PUSH, R_PUSH.replace('`DIFF ${sha256(diff)}`', `\`DIFF ${'0'.repeat(64)}\``), "the diff's hash does not match the one the renderer reported"],
  ['no diff file', false, R_DIFF_WRITE, '', 'the renderer did not leave exactly its rules file of at most 1 MiB, its diff, and an agent file only for an agent setting it reported'],
]) {
  test(`bad case: a renderer that reports ${label} refuses`, t => {
    const repo = makeRepo(t, root => plantRenderer(root, from, to));
    const h = home(t);
    if (withConfig) {
      const c = movesEdit();
      configure(h, c.config, c.blocks);
    }
    const r = install(repo, h, { apply: true, extra: withConfig ? ['--rendered-hash', A64] : [] });
    refused(r);
    assert.match(r.stdout, /^render\| RESULT: pass\r?$/m, r.out);
    assert.match(r.stdout, new RegExp(`^REFUSED: ${why.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.`, 'm'), r.out);
    assert.ok(!listTree(h).some(f => f === 'CLAUDE.md' || f === '.pact-install.json'), listTree(h).join('\n'));
  });
}
// ------------------------------------------------------------ a stray word never becomes the review folder

test('bad case: a stray full path after the named options refuses, and is never taken as the review folder', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const stray = join(tempDir(t), 'stray');
  const rendered = Buffer.from(withoutOpenMarks(readFileSync(join(repo, 'claude', 'CLAUDE.md'), 'utf8')));
  // Bound by position, the word would land on the next parameter in the block.
  const r = install(repo, h, { extra: ['--rendered-hash', sha256(rendered), stray] });
  refused(r);
  assert.match(r.stdout, /^REFUSED: the command line holds 1 word the script does not read\./m, r.out);
  assert.ok(!existsSync(stray), 'the stray word was used as a folder');
  assert.ok(!r.out.includes(stray), 'the stray word was printed');
});

// ------------------------------------------------------------ after the Test review (#94)

// #262: the shipped example move installs, and lands in the rules file.
test('the shipped example block that adds a move installs and passes seam A', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const block = readFileSync(join(REPO, 'examples', 'pact-config', 'blocks', 'moves-leave-it-better.md'));
  configure(h, '{"schema": 1, "edits": [{"mark": "moves", "op": "add-after", "file": "moves-leave-it-better.md"}]}\n', { 'moves-leave-it-better.md': block });
  const dry = install(repo, h);
  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.stdout, /^seam-a\| RESULT: pass\r?$/m, dry.out);
  const r = install(repo, h, { apply: true, extra: ['--rendered-hash', dryRunHash(dry)] });
  assert.equal(r.code, 0, r.out);
  assert.ok(readFileSync(join(h, 'CLAUDE.md'), 'utf8').includes(block.toString('utf8')));
});

const REVIEW_PUSH = '  report.lines.push(`REVIEW ${sha256(rules)} ${sha256(diff)}`);';

test('bad case: a review module that reports other hashes than this run rendered refuses', t => {
  const repo = makeRepo(t, root => plantModule(join(root, 'gate'), 'review', REVIEW_PUSH, `  report.lines.push(\`REVIEW ${'0'.repeat(64)} \${sha256(diff)}\`);`));
  const folder = join(tempDir(t), 'review');
  const r = install(repo, home(t), { extra: ['--review-folder', folder] });
  refused(r);
  assert.match(r.stdout, /^review\| RESULT: pass\r?$/m, r.out);
  // The module wrote its files and exited with a pass, so the message must not say nothing changed.
  assert.match(r.stdout, /^REFUSED: the review output was not written, or not as this run rendered it\. The review folder may hold what the review module wrote; nothing was installed\.\r?$/m, r.out);
  assert.deepEqual(readdirSync(folder).sort(), ['config.diff', 'rendered-rules.txt']);
});

test('bad case: a staged rules file changed after the check refuses the review output before it is written', t => {
  // A seam A that passes, then changes the staged rules file as it returns.
  const repo = makeRepo(t, root => wrapCheck(root, 'seam-a-core', { after: "fs.appendFileSync(argv[0] + '/claude/CLAUDE.md', 'x\\n');" }));
  const folder = join(tempDir(t), 'review');
  const r = install(repo, home(t), { extra: ['--review-folder', folder] });
  refused(r);
  assert.match(r.stdout, /^seam-a\| RESULT: pass\r?$/m, r.out);
  assert.match(r.stdout, /^REFUSED: the staged rules file changed after the check\./m, r.out);
  assert.ok(!existsSync(folder));
});

test('bad case: a review module that changes the stage on -Apply refuses before anything is installed', t => {
  // The runner's working folder is the stage (S3, step 9).
  const repo = makeRepo(t, root => wrapCheck(root, 'review-core', { after: "const d = 'claude/agents'; fs.appendFileSync(d + '/' + fs.readdirSync(d).sort()[0], 'x\\n');" }));
  const h = home(t);
  const folder = join(tempDir(t), 'review');
  const r = install(repo, h, { apply: true, extra: ['--review-folder', folder] });
  refused(r);
  assert.match(r.stdout, /^review\| RESULT: pass\r?$/m, r.out);
  assert.match(r.stdout, /^REFUSED: the review module changed the stage\. The review folder may hold what the review module wrote; nothing was installed\.\r?$/m, r.out);
  assert.deepEqual(readdirSync(folder).sort(), ['config.diff', 'rendered-rules.txt']);
  assert.doesNotMatch(r.stdout, /^Applying\./m, r.out);
  assert.ok(!listTree(h).some(f => f === 'CLAUDE.md' || f.startsWith('agents')), listTree(h).join('\n'));
});
test('bad case: a review module that changes the stage on a dry run refuses, saying the review folder may hold its output', t => {
  const repo = makeRepo(t, root => wrapCheck(root, 'review-core', { after: "fs.writeFileSync('planted.txt', 'x\\n');" }));
  const folder = join(tempDir(t), 'review');
  const r = install(repo, home(t), { extra: ['--review-folder', folder] });
  refused(r);
  assert.match(r.stdout, /^REFUSED: the review module changed the stage\. The review folder may hold what the review module wrote; nothing was installed\.\r?$/m, r.out);
  assert.doesNotMatch(r.stdout, /^Dry run only/m, r.out);
});

test('-Apply with -ReviewFolder writes the review only after the last re-hash of the stage', t => {
  // A seam A that changes a staged agent as it returns: the re-hash refuses,
  // and no review is written, because the review comes after it.
  const repo = makeRepo(t, root => wrapCheck(root, 'seam-a-core', { after: "const d = argv[0] + '/claude/agents'; fs.appendFileSync(d + '/' + fs.readdirSync(d).sort()[0], 'x\\n');" }));
  const folder = join(tempDir(t), 'review');
  const r = install(repo, home(t), { apply: true, extra: ['--review-folder', folder] });
  refused(r);
  assert.match(r.stdout, /^REFUSED: the staged copy of agents\/[^ ]+ changed after the check\. Nothing was changed\.\r?$/m, r.out);
  assert.ok(!existsSync(folder), 'the review was written before the last re-hash');
});
// ------------------------------------------------------------ the Cost limits part (#278)

const COST_BLOCK = '| Cost | Counted as | Limit | At the limit |\n| --- | --- | --- | --- |\n| Review rounds | Rounds of lens review | 2 | Ask me |\n';
const OLD_QUALITIES_BLOCK = '| Quality | Measure | Lens |\n| --- | --- | --- |\n| Functional suitability | the acceptance claims | `behaviour-lens` |\n';

// #287 C4, C7, C9 (seam 3) and the applied home happy path: a cost-limits edit shows the security-defaults line, installs the
// edited rows into the rules file, and is bound by the rendered hash the dry run printed.
test('a home cost-limits edit shows the security-defaults line and installs bound by its rendered hash', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const config = Buffer.from(`${JSON.stringify({ schema: 1, settings: { 'usage-pause': 90 }, edits: [{ mark: 'cost-limits', op: 'replace', file: 'team/cost.md' }] })}\n`);
  const blocks = { 'team/cost.md': Buffer.from(COST_BLOCK) };
  configure(h, config, blocks);
  const digest = sha256(`user ${sha256(config)}\nblock team/cost.md ${sha256(blocks['team/cost.md'])}\n`).slice(0, 12);
  let s = readFileSync(join(repo, 'claude', 'CLAUDE.md'), 'utf8').replace('When it is above 75%,', 'When it is above 90%,');
  s = editPart(s, 'cost-limits', () => COST_BLOCK.slice(0, -1).split('\n'));
  s = editPart(s, 'config-notice', () => ['', `**Configuration in effect.** This file was rendered with the configuration \`${digest}\`.`, 'Values set: usage-pause 90. Parts edited: cost-limits (replace).']);
  const want = Buffer.from(withoutOpenMarks(s));

  const dry = install(repo, h);
  assert.equal(dry.code, 0, dry.out);
  const lines = dry.stdout.replaceAll('\r\n', '\n').split('\n');
  const at = lines.findIndex(l => l.includes('SECURITY DEFAULTS'));
  assert.match(lines[at], /^WARN: SECURITY DEFAULTS: the user configuration edits cost-limits, which changes the pact's security defaults;/);
  assert.equal(lines.findIndex(l => l.includes('WARN')), at, 'no warning comes before it');
  assert.ok(!lines.some(l => l.includes('no Enough column')), 'the shipped Qualities table keeps its Enough column: no note');
  assert.equal(dryRunHash(dry), sha256(want));

  const r = install(repo, h, { apply: true, extra: ['--rendered-hash', dryRunHash(dry)] });
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(readFileSync(join(h, 'CLAUDE.md')), want);
  assert.match(readFileSync(join(h, 'CLAUDE.md'), 'utf8'), /\| Review rounds \| Rounds of lens review \| 2 \| Ask me \|/);
  assert.match(r.stdout, new RegExp(`^Installed commit [0-9a-f]{40} with configuration ${digest}; all files verified\.\r?$`, 'm'), r.out);
});

// #287 C7, C8 (seam 3): a configuration from before the change, with a Qualities edit that has no Enough column, still installs; the dry run notes it.
test('a pre-#278 Qualities edit still renders and installs, and its dry run notes that the cost rows reach no lens', t => {
  const repo = makeRepo(t);
  const h = home(t);
  configure(h, `${JSON.stringify({ schema: 1, edits: [{ mark: 'qualities', op: 'replace', file: 'q.md' }] })}\n`, { 'q.md': OLD_QUALITIES_BLOCK });
  const dry = install(repo, h);
  assert.equal(dry.code, 0, dry.out);
  const lines = dry.stdout.replaceAll('\r\n', '\n').split('\n');
  const sec = lines.findIndex(l => l.includes('SECURITY DEFAULTS'));
  assert.match(lines[sec], /edits qualities,/);
  assert.match(lines[sec + 1], /^NOTE: the user configuration edits qualities, and its table has no Enough column, so the Cost limits reach no lens;/, 'the note follows the security-defaults line');
  const r = install(repo, h, { apply: true, extra: ['--rendered-hash', dryRunHash(dry)] });
  assert.equal(r.code, 0, r.out);
  assert.match(readFileSync(join(h, 'CLAUDE.md'), 'utf8'), /\| Functional suitability \| the acceptance claims \| `behaviour-lens` \|\n/);
});
