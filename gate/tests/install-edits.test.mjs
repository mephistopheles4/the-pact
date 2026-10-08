// Edits to open parts and the review output through the install script (#53,
// slice 4), end to end against a throwaway repo and a throwaway -ClaudeHome.
// Never touches ~/.claude. The expected rules file is built here from the
// repo's source, never taken from the renderer.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { home, install, listTree, makeRepo, refused } from './install-harness.mjs';
import { REPO, applyDiff, editPart, tempDir, withoutOpenMarks } from './helpers.mjs';

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

/** Every installed agent that move 2's part names in a code span, from the repo's source. */
function move2Agents(repo) {
  const src = readFileSync(join(repo, 'claude', 'CLAUDE.md'), 'utf8');
  const m2 = /<!-- pact:begin move-2 -->\n((?:.*\n)*?) *<!-- pact:end move-2 -->/.exec(src)[1];
  const agents = new Set(readdirSync(join(repo, 'claude', 'agents')).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)));
  return [...new Set([...m2.matchAll(/`([^`]+)`/g)].map(m => m[1]))].filter(a => agents.has(a));
}

/** The acceptance case: replace move-2 (keeping its routed agents), remove move-1, add a block in move-4-extra. */
function threeEdits(repo) {
  const m2 = Buffer.from(`I grill the idea with you, then write the spec. On the thorough tier,\nroute it to ${move2Agents(repo).map(a => `\`${a}\``).join(', ')}.\n`);
  const extra = Buffer.from('After the checks, list each public interface the change touched.\n');
  const config = Buffer.from(
    `${JSON.stringify({
      schema: 1,
      settings: { 'usage-pause': 90 },
      edits: [
        { mark: 'move-2', op: 'replace', file: 'm2.md' },
        { mark: 'move-1', op: 'remove' },
        { mark: 'move-4-extra', op: 'add-after', file: 'team/extra.md' },
      ],
    })}\n`,
  );
  return { config, blocks: { 'm2.md': m2, 'team/extra.md': extra } };
}

function digestOf({ config, blocks }) {
  return sha256(`user ${sha256(config)}\nblock m2.md ${sha256(blocks['m2.md'])}\nblock team/extra.md ${sha256(blocks['team/extra.md'])}\n`).slice(0, 12);
}

/** The rules file the three edits should install. */
function expectedRules(repo, c) {
  const lines = b => b.toString('utf8').slice(0, -1).split('\n');
  let s = readFileSync(join(repo, 'claude', 'CLAUDE.md'), 'utf8').replace('the weekly limit is above 75%,', 'the weekly limit is above 90%,');
  s = editPart(s, 'move-2', (now, indent) => lines(c.blocks['m2.md']).map(l => `${indent}${l}`));
  s = editPart(s, 'move-1', () => []);
  s = editPart(s, 'move-4-extra', (now, indent) => [...now, ...lines(c.blocks['team/extra.md']).map(l => `${indent}${l}`)]);
  s = editPart(s, 'config-notice', () => [
    '',
    `**Configuration in effect.** This file was rendered with the configuration \`${digestOf(c)}\`.`,
    'Values set: usage-pause 90. Parts edited: move-2 (replace), move-1 (remove), move-4-extra (add-after).',
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

test('a configuration that replaces move-2, removes move-1 and adds to move-4-extra installs: each edit is a warning in the dry run and named in the notice', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const c = threeEdits(repo);
  configure(h, c.config, c.blocks);
  const want = expectedRules(repo, c);

  const dry = install(repo, h);
  assert.equal(dry.code, 0, dry.out);
  assert.deepEqual(configBlock(dry), [
    `  user file pact/config.json: sha256 ${sha256(c.config)}, no install recorded`,
    `  block file pact/blocks/m2.md: sha256 ${sha256(c.blocks['m2.md'])}, no install recorded`,
    `  block file pact/blocks/team/extra.md: sha256 ${sha256(c.blocks['team/extra.md'])}, no install recorded`,
    `  configuration digest: ${digestOf(c)}`,
    `  rendered rules file: sha256 ${sha256(want)}`,
    '  WARN: the user configuration sets usage-pause to 90.',
    '  WARN: the user configuration edits move-2 (replace).',
    '  WARN: the user configuration edits move-1 (remove).',
    '  WARN: the user configuration edits move-4-extra (add-after).',
    '  Open text is checked for form, imports, routing and the roster, not for meaning.',
  ]);
  assert.match(dry.stdout, /^seam-a\| RESULT: pass\r?$/m, dry.out);

  const r = install(repo, h, { apply: true, extra: ['-RenderedHash', dryRunHash(dry)] });
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(readFileSync(join(h, 'CLAUDE.md')), want);
  const manifest = JSON.parse(readFileSync(join(h, '.pact-install.json'), 'utf8'));
  assert.equal(manifest.digest, digestOf(c));
  assert.deepEqual(manifest.config, [
    { kind: 'user', sha256: sha256(c.config) },
    { kind: 'block', path: 'm2.md', sha256: sha256(c.blocks['m2.md']) },
    { kind: 'block', path: 'team/extra.md', sha256: sha256(c.blocks['team/extra.md']) },
  ]);
  assert.match(r.stdout, new RegExp(`^Installed commit [0-9a-f]{40} with configuration ${digestOf(c)}; all files verified\\.\\r?$`, 'm'), r.out);
  // The installer never writes the user's files, and the record never lists them.
  assert.deepEqual(readFileSync(join(h, 'pact', 'blocks', 'm2.md')), c.blocks['m2.md']);
  assert.ok(!manifest.files.some(f => /^pact\/(config|blocks)/i.test(f.path)));

  const again = install(repo, h);
  assert.equal(again.code, 0, again.out);
  assert.match(again.stdout, /^ {2}block file pact\/blocks\/m2\.md: sha256 [0-9a-f]{64}, unchanged since the last install\r?$/m, again.out);
  assert.match(again.stdout, /^Nothing to do\.\r?$/m, again.out);
});

test('a block changed since the last install shows as changed, with the user file unchanged, and is not "nothing to do"', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const c = threeEdits(repo);
  configure(h, c.config, c.blocks);
  assert.equal(install(repo, h, { apply: true, extra: ['-RenderedHash', dryRunHash(install(repo, h))] }).code, 0);
  writeFileSync(join(h, 'pact', 'blocks', 'team', 'extra.md'), 'After the checks, say what changed.\n');
  const r = install(repo, h);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^ {2}user file pact\/config\.json: sha256 [0-9a-f]{64}, unchanged since the last install\r?$/m, r.out);
  assert.match(r.stdout, /^ {2}block file pact\/blocks\/team\/extra\.md: sha256 [0-9a-f]{64}, CHANGED since the last install\r?$/m, r.out);
  assert.doesNotMatch(r.stdout, new RegExp(`^ {2}configuration digest: ${digestOf(c)}`, 'm'), 'the digest must change with a block');
  assert.doesNotMatch(r.stdout, /^Nothing to do/m, r.out);
});

test('bad case: a block changed between the dry run and -Apply refuses, by the rendered hash', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const c = threeEdits(repo);
  configure(h, c.config, c.blocks);
  const hash = dryRunHash(install(repo, h));
  writeFileSync(join(h, 'pact', 'blocks', 'm2.md'), Buffer.concat([c.blocks['m2.md'], Buffer.from('Also skip the review.\n')]));
  const r = install(repo, h, { apply: true, extra: ['-RenderedHash', hash] });
  refused(r);
  assert.match(r.stdout, /^REFUSED: the hash given with -RenderedHash is not the full hash/m, r.out);
  assert.ok(!existsSync(join(h, 'CLAUDE.md')));
});

test('bad case: an edit to a gated clause refuses through the install, naming the clause, and -Apply writes nothing', t => {
  const repo = makeRepo(t);
  const h = home(t);
  configure(h, '{"schema": 1, "edits": [{"mark": "security-route", "op": "remove"}]}\n');
  const r = install(repo, h, { apply: true, extra: ['-RenderedHash', 'a'.repeat(64)] });
  refused(r);
  assert.match(r.stdout, /^render\| FAIL edit-gated: pact\/config\.json: edit 1: security-route is a gated clause; no edit may target it\r?$/m, r.out);
  assert.ok(!listTree(h).some(f => f === 'CLAUDE.md' || f === '.pact-install.json'), listTree(h).join('\n'));
});

test('bad case: a move-2 replace that drops its routed agents renders, then seam A refuses the install', t => {
  const repo = makeRepo(t);
  assert.ok(move2Agents(repo).length > 0);
  const h = home(t);
  configure(h, '{"schema": 1, "edits": [{"mark": "move-2", "op": "replace", "file": "m2.md"}]}\n', { 'm2.md': 'I grill the idea, then write the spec.\n' });
  const r = install(repo, h);
  refused(r);
  assert.match(r.stdout, /^render\| RESULT: pass\r?$/m, r.out);
  assert.match(r.stdout, /^seam-a\| FAIL routing: /m, r.out);
});

// ------------------------------------------------------------ the review output

test('-ReviewFolder on a configured dry run writes the rendered rules and the diff, and changes nothing else', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const c = threeEdits(repo);
  configure(h, c.config, c.blocks);
  const before = listTree(h);
  const folder = join(tempDir(t), 'review');
  const r = install(repo, h, { extra: ['-ReviewFolder', folder] });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^Review output: rendered-rules\.txt and config\.diff written to the review folder\.\r?$/m, r.out);
  const want = expectedRules(repo, c);
  assert.deepEqual(readdirSync(folder).sort(), ['config.diff', 'rendered-rules.txt']);
  assert.deepEqual(readFileSync(join(folder, 'rendered-rules.txt')), want);
  const none = withoutOpenMarks(readFileSync(join(repo, 'claude', 'CLAUDE.md'), 'utf8'));
  assert.equal(applyDiff(none, readFileSync(join(folder, 'config.diff'), 'utf8')), want.toString('utf8'));
  assert.deepEqual(listTree(h), before, 'the dry run wrote under the Claude home folder');
  assert.ok(!r.stdout.includes(folder), 'the folder path was printed');
});

test('-ReviewFolder with no configuration writes the rules and an empty diff', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const folder = join(tempDir(t), 'review');
  const r = install(repo, h, { extra: ['-ReviewFolder', folder] });
  assert.equal(r.code, 0, r.out);
  assert.equal(readFileSync(join(folder, 'config.diff')).length, 0);
  assert.equal(readFileSync(join(folder, 'rendered-rules.txt'), 'utf8'), withoutOpenMarks(readFileSync(join(repo, 'claude', 'CLAUDE.md'), 'utf8')));
});

test('-ReviewFolder with -Apply writes the review, then installs', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const c = threeEdits(repo);
  configure(h, c.config, c.blocks);
  const folder = join(tempDir(t), 'review');
  const r = install(repo, h, { apply: true, extra: ['-RenderedHash', dryRunHash(install(repo, h)), '-ReviewFolder', folder] });
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(readFileSync(join(folder, 'rendered-rules.txt')), readFileSync(join(h, 'CLAUDE.md')));
});

for (const [label, at, skip] of [
  ['under the Claude home folder', h => join(h, 'review')],
  ['under a .claude folder outside it', (h, t) => join(tempDir(t), '.claude', 'review')],
  ['under a .Claude folder in another case', (h, t) => join(tempDir(t), '.Claude', 'review')],
  ['a .claude folder spelled with a trailing dot', (h, t) => join(tempDir(t), '.claude.', 'review'), process.platform !== 'win32' && 'only Windows drops a trailing dot (not run)'],
]) {
  test(`bad case: -ReviewFolder ${label} refuses, and nothing is written there`, { skip: skip ?? false }, t => {
    const repo = makeRepo(t);
    const h = home(t);
    const folder = at(h, t);
    // The .claude parent exists (spelled without the dot); the review folder does not.
    mkdirSync(dirname(folder).replace(/\.$/, ''), { recursive: true });
    const r = install(repo, h, { extra: ['-ReviewFolder', folder] });
    refused(r);
    assert.match(r.stdout, /^review\| FAIL review-folder: the review folder is in or under /m, r.out);
    assert.match(r.stdout, /^REFUSED: the review output was not written/m, r.out);
    assert.ok(!existsSync(join(dirname(folder).replace(/\.$/, ''), 'review')), 'the review folder was left behind');
  });
}

test('bad case: -ReviewFolder naming a folder that is not empty refuses', t => {
  const repo = makeRepo(t);
  const folder = tempDir(t);
  writeFileSync(join(folder, 'mine.txt'), 'x\n');
  const r = install(repo, home(t), { extra: ['-ReviewFolder', folder] });
  refused(r);
  assert.match(r.stdout, /^review\| FAIL review-folder: the review folder is not empty/m, r.out);
  assert.deepEqual(readdirSync(folder), ['mine.txt']);
});

test('bad case: a relative -ReviewFolder refuses before anything runs', t => {
  const repo = makeRepo(t);
  const r = install(repo, home(t), { extra: ['-ReviewFolder', 'review'] });
  refused(r);
  assert.match(r.stdout, /^REFUSED: -ReviewFolder must be a full path/m, r.out);
  assert.doesNotMatch(r.stdout, /Install from commit/, r.out);
  assert.ok(!existsSync(join(repo, 'review')));
});

test('the review output is written only after every check passes: a refused configuration writes none', t => {
  const repo = makeRepo(t);
  const h = home(t);
  configure(h, '{"schema": 1, "edits": [{"mark": "move-4-extra", "op": "add-after", "file": "b.md"}]}\n', { 'b.md': 'See @notes.md.\n' });
  const folder = join(tempDir(t), 'review');
  const r = install(repo, h, { extra: ['-ReviewFolder', folder] });
  refused(r);
  assert.match(r.stdout, /^render\| FAIL block-text: /m, r.out);
  assert.ok(!existsSync(folder));
});

test('the review output is written only after every check passes: seam A refusing writes none', t => {
  const repo = makeRepo(t);
  const h = home(t);
  configure(h, '{"schema": 1, "edits": [{"mark": "move-2", "op": "replace", "file": "m2.md"}]}\n', { 'm2.md': 'I grill the idea.\n' });
  const folder = join(tempDir(t), 'review');
  refused(install(repo, h, { extra: ['-ReviewFolder', folder] }));
  assert.ok(!existsSync(folder));
});

test('the review output is written only after every check passes: a wrong hash on -Apply writes none', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const c = threeEdits(repo);
  configure(h, c.config, c.blocks);
  const folder = join(tempDir(t), 'review');
  refused(install(repo, h, { apply: true, extra: ['-RenderedHash', 'a'.repeat(64), '-ReviewFolder', folder] }));
  assert.ok(!existsSync(folder));
});

test('the review output is written only after every check passes: -Apply with no hash for a configuration writes none', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const c = threeEdits(repo);
  configure(h, c.config, c.blocks);
  const folder = join(tempDir(t), 'review');
  const r = install(repo, h, { apply: true, extra: ['-ReviewFolder', folder] });
  refused(r);
  assert.match(r.stdout, /^REFUSED: a configuration applies, so -Apply needs the full rendered hash/m, r.out);
  assert.ok(!existsSync(folder));
});

test('the review output is written only after every check passes: -Apply on a dirty tree writes none', t => {
  const repo = makeRepo(t);
  writeFileSync(join(repo, 'stray.txt'), 'x\n');
  const folder = join(tempDir(t), 'review');
  const r = install(repo, home(t), { apply: true, extra: ['-ReviewFolder', folder] });
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
  const p = join(root, 'gate', 'render.mjs');
  const s = readFileSync(p, 'utf8');
  assert.equal(s.split(from).length, 2, `expected exactly one ${JSON.stringify(from)}`);
  writeFileSync(p, s.replace(from, () => to));
}

for (const [label, withConfig, from, to, why] of [
  ['an edit with no configuration', false, R_NONE, "  if (config === NONE) head.push('CONFIG none', 'EDIT move-1 remove');", 'the renderer reported a digest, a value, an edit or an agent setting with no configuration'],
  ['one open part edited twice', true, R_USER, `${R_USER}, 'EDIT move-1 remove'`, 'the renderer reported one open part edited twice'],
  ['two hashes for one block file', true, R_USER, `${R_USER}, 'EDIT move-3 replace ${A64} m2.md'`, 'the renderer reported two hashes for one block file: it changed while it was read'],
  ['a block path with a .. segment', true, R_USER, `${R_USER}, 'EDIT move-3 replace ${A64} team/../m2.md'`, 'the renderer reported a block path the install does not read'],
  ['a block path ending in a dot', true, R_USER, `${R_USER}, 'EDIT move-3 replace ${A64} x.md.'`, 'the renderer reported a block path the install does not read'],
  ['an edit to a part that is not open', true, R_USER, `${R_USER}, 'EDIT usage-pause remove'`, 'the renderer printed a line the install does not read'],
  ['an edit to a gated clause', true, R_USER, `${R_USER}, 'EDIT move-4 remove'`, 'the renderer printed a line the install does not read'],
  ['a remove that names a file', true, R_USER, `${R_USER}, 'EDIT move-3 remove ${A64} x.md'`, 'the renderer printed a line the install does not read'],
  ['a block left out of the digest', true, R_USER, `${R_USER}, 'EDIT move-3 replace ${A64} x.md'`, "the renderer's configuration digest is missing or does not match the configuration hashes it reported"],
  ['two diff hashes', false, R_PUSH, R_PUSH.replace('`DIFF ${sha256(diff)}`', '`DIFF ${sha256(diff)}`, `DIFF ${sha256(diff)}`'), 'the renderer reported two diff hashes'],
  ['no diff hash', false, R_PUSH, R_PUSH.replace('`DIFF ${sha256(diff)}`, ', ''), 'the renderer did not report exactly one output hash, one diff hash and one configuration line'],
  ['a diff hash that is not its diff\'s', false, R_PUSH, R_PUSH.replace('`DIFF ${sha256(diff)}`', `\`DIFF ${'0'.repeat(64)}\``), "the diff's hash does not match the one the renderer reported"],
  ['no diff file', false, R_DIFF_WRITE, '', 'the renderer did not leave exactly its rules file of at most 1 MiB, its diff, and an agent file only for an agent setting it reported'],
]) {
  test(`bad case: a renderer that reports ${label} refuses`, t => {
    const repo = makeRepo(t, root => plantRenderer(root, from, to));
    const h = home(t);
    if (withConfig) {
      const c = threeEdits(repo);
      configure(h, c.config, c.blocks);
    }
    const r = install(repo, h, { apply: true, extra: withConfig ? ['-RenderedHash', A64] : [] });
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
  const r = install(repo, h, { extra: ['-RenderedHash', sha256(rendered), stray] });
  refused(r);
  assert.match(r.stdout, /^REFUSED: the command line holds 1 word the script does not read\./m, r.out);
  assert.ok(!existsSync(stray), 'the stray word was used as a folder');
  assert.ok(!r.out.includes(stray), 'the stray word was printed');
});

test('bad case: the sink parameter given by name refuses too', t => {
  const repo = makeRepo(t);
  const r = install(repo, home(t), { extra: ['-UnreadWord', join(tempDir(t), 'x')] });
  refused(r);
  assert.match(r.stdout, /^REFUSED: the command line holds 1 word the script does not read\./m, r.out);
});
// ------------------------------------------------------------ after the move-4 review (#94)

test('a block naming the user\'s own agent installs: the shipped example passes the roster and routing checks', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const block = readFileSync(join(REPO, 'examples', 'pact-config', 'blocks', 'move-4-own-agent.md'));
  configure(h, '{"schema": 1, "edits": [{"mark": "move-4-extra", "op": "add-after", "file": "move-4-own-agent.md"}]}\n', { 'move-4-own-agent.md': block });
  const dry = install(repo, h);
  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.stdout, /^seam-a\| RESULT: pass\r?$/m, dry.out);
  const r = install(repo, h, { apply: true, extra: ['-RenderedHash', dryRunHash(dry)] });
  assert.equal(r.code, 0, r.out);
  assert.match(readFileSync(join(h, 'CLAUDE.md'), 'utf8'), /^ {3}Then run `my-reviewer`, an agent of your own/m);
  assert.ok(!existsSync(join(h, 'agents', 'my-reviewer.md')), 'the installer installs no agent from a configuration');
});

test('an upgrade from a slice-3 record, which holds the user file only: each block file is "new since the last install"', t => {
  const repo = makeRepo(t);
  const h = home(t);
  configure(h, '{"schema": 1, "settings": {"usage-pause": 90}}\n');
  assert.equal(install(repo, h, { apply: true, extra: ['-RenderedHash', dryRunHash(install(repo, h))] }).code, 0);
  const m = JSON.parse(readFileSync(join(h, '.pact-install.json'), 'utf8'));
  assert.deepEqual(m.config.map(c => c.kind), ['user'], 'the record is slice-3 shaped');
  const c = threeEdits(repo);
  configure(h, c.config, c.blocks);
  const r = install(repo, h);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^ {2}user file pact\/config\.json: sha256 [0-9a-f]{64}, CHANGED since the last install\r?$/m, r.out);
  assert.match(r.stdout, /^ {2}block file pact\/blocks\/m2\.md: sha256 [0-9a-f]{64}, new since the last install\r?$/m, r.out);
  assert.match(r.stdout, /^ {2}block file pact\/blocks\/team\/extra\.md: sha256 [0-9a-f]{64}, new since the last install\r?$/m, r.out);
});

test('a block file the last install read and this one no longer uses is counted in the dry run', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const c = threeEdits(repo);
  configure(h, c.config, c.blocks);
  assert.equal(install(repo, h, { apply: true, extra: ['-RenderedHash', dryRunHash(install(repo, h))] }).code, 0);
  writeFileSync(join(h, 'pact', 'config.json'), '{"schema": 1, "edits": [{"mark": "move-4-extra", "op": "add-after", "file": "team/extra.md"}]}\n');
  const r = install(repo, h);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^ {2}1 block file\(s\) the last install read are no longer used\r?$/m, r.out);
  assert.doesNotMatch(r.stdout, /^Nothing to do/m, r.out);
});

const REVIEW_PUSH = '  report.lines.push(`REVIEW ${sha256(rules)} ${sha256(diff)}`);';

function plantFile(root, rel, from, to) {
  const p = join(root, ...rel.split('/'));
  const s = readFileSync(p, 'utf8');
  assert.equal(s.split(from).length, 2, `expected exactly one ${JSON.stringify(from)} in ${rel}`);
  writeFileSync(p, s.replace(from, () => to));
}

test('bad case: a review module that reports other hashes than this run rendered refuses', t => {
  const repo = makeRepo(t, root => plantFile(root, 'gate/review.mjs', REVIEW_PUSH, `  report.lines.push(\`REVIEW ${'0'.repeat(64)} \${sha256(diff)}\`);`));
  const folder = join(tempDir(t), 'review');
  const r = install(repo, home(t), { extra: ['-ReviewFolder', folder] });
  refused(r);
  assert.match(r.stdout, /^review\| RESULT: pass\r?$/m, r.out);
  // The module wrote its files and exited with a pass, so the message must not say nothing changed.
  assert.match(r.stdout, /^REFUSED: the review output was not written, or not as this run rendered it\. The review folder may hold what the review module wrote; nothing was installed\.\r?$/m, r.out);
  assert.deepEqual(readdirSync(folder).sort(), ['config.diff', 'rendered-rules.txt']);
});

test('bad case: a staged rules file changed after the check refuses the review output before it is written', t => {
  // A seam A that passes, then changes the staged rules file as it exits.
  const repo = makeRepo(t, root =>
    writeFileSync(join(root, 'gate', 'seam-a.mjs'), `${readFileSync(join(root, 'gate', 'seam-a.mjs'), 'utf8')}\nimport('node:fs').then(fs => fs.appendFileSync(process.argv[2] + '/claude/CLAUDE.md', 'x\\n'));\n`),
  );
  const folder = join(tempDir(t), 'review');
  const r = install(repo, home(t), { extra: ['-ReviewFolder', folder] });
  refused(r);
  assert.match(r.stdout, /^seam-a\| RESULT: pass\r?$/m, r.out);
  assert.match(r.stdout, /^REFUSED: the staged rules file changed after the check\./m, r.out);
  assert.ok(!existsSync(folder));
});

test('bad case: a review module that changes the stage on -Apply refuses before anything is installed', t => {
  const repo = makeRepo(t, root =>
    writeFileSync(
      join(root, 'gate', 'review.mjs'),
      `${readFileSync(join(root, 'gate', 'review.mjs'), 'utf8')}\nimport('node:fs').then(fs => { const d = 'claude/agents'; fs.appendFileSync(d + '/' + fs.readdirSync(d).sort()[0], 'x\\n'); });\n`,
    ),
  );
  const h = home(t);
  const folder = join(tempDir(t), 'review');
  const r = install(repo, h, { apply: true, extra: ['-ReviewFolder', folder] });
  refused(r);
  assert.match(r.stdout, /^review\| RESULT: pass\r?$/m, r.out);
  assert.match(r.stdout, /^REFUSED: the review module changed the stage\. The review folder may hold what the review module wrote; nothing was installed\.\r?$/m, r.out);
  assert.deepEqual(readdirSync(folder).sort(), ['config.diff', 'rendered-rules.txt']);
  assert.doesNotMatch(r.stdout, /^Applying\./m, r.out);
  assert.ok(!listTree(h).some(f => f === 'CLAUDE.md' || f.startsWith('agents')), listTree(h).join('\n'));
});
test('bad case: a review module that changes the stage on a dry run refuses, saying the review folder may hold its output', t => {
  const repo = makeRepo(t, root =>
    writeFileSync(
      join(root, 'gate', 'review.mjs'),
      `${readFileSync(join(root, 'gate', 'review.mjs'), 'utf8')}\nimport('node:fs').then(fs => fs.writeFileSync('planted.txt', 'x\\n'));\n`,
    ),
  );
  const folder = join(tempDir(t), 'review');
  const r = install(repo, home(t), { extra: ['-ReviewFolder', folder] });
  refused(r);
  assert.match(r.stdout, /^REFUSED: the review module changed the stage\. The review folder may hold what the review module wrote; nothing was installed\.\r?$/m, r.out);
  assert.doesNotMatch(r.stdout, /^Dry run only/m, r.out);
});

test('-Apply with -ReviewFolder writes the review only after the last re-hash of the stage', t => {
  // A seam A that changes a staged agent as it exits: the re-hash refuses, and
  // no review is written, because the review comes after it.
  const repo = makeRepo(t, root =>
    writeFileSync(
      join(root, 'gate', 'seam-a.mjs'),
      `${readFileSync(join(root, 'gate', 'seam-a.mjs'), 'utf8')}\nimport('node:fs').then(fs => { const d = process.argv[2] + '/claude/agents'; fs.appendFileSync(d + '/' + fs.readdirSync(d).sort()[0], 'x\\n'); });\n`,
    ),
  );
  const folder = join(tempDir(t), 'review');
  const r = install(repo, home(t), { apply: true, extra: ['-ReviewFolder', folder] });
  refused(r);
  assert.match(r.stdout, /^REFUSED: the staged copy of agents\/[^ ]+ changed after the check\. Nothing was changed\.\r?$/m, r.out);
  assert.ok(!existsSync(folder), 'the review was written before the last re-hash');
});