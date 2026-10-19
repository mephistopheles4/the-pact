// A retired agent's name, the install's side. #302 C3: the dry run warns when
// a block or a project qualities list names the retired lens, and still plans
// the install. #302 C4: it prints one fixed line for a live agent file named
// for the lens, and leaves the file alone; the pact's own recorded copy is
// deleted through its record. Run against a throwaway repo and --claude-home;
// never touches ~/.claude. Every fixture is invented text (#302 C7). The
// renderer's side is in a fast-tier file of its own.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { applyBound, home, install, makeRepo } from './install-harness.mjs';

const LENS = 'good-enough-lens';
const SENTINEL = 'ZZSENTINELWORD';
const ORPHAN = `agents/${LENS}.md`;

function configure(h, config, blocks = {}) {
  mkdirSync(join(h, 'pact', 'blocks'), { recursive: true });
  writeFileSync(join(h, 'pact', 'config.json'), `${JSON.stringify(config)}\n`);
  for (const [name, text] of Object.entries(blocks)) writeFileSync(join(h, 'pact', 'blocks', name), text);
}

function plant(h, text = `---\nname: ${LENS}\n---\n${SENTINEL}\n`) {
  mkdirSync(join(h, 'agents'), { recursive: true });
  writeFileSync(join(h, ORPHAN), text);
}

test('bad case: an edit block naming the retired lens draws a WARN in the dry run, which still plans the install', t => {
  const repo = makeRepo(t);
  const h = home(t);
  configure(h, { schema: 1, edits: [{ mark: 'workflow', op: 'replace', file: 'wf.md' }] }, { 'wf.md': `Design runs \`${LENS}\` ${SENTINEL}.\n` });
  const r = install(repo, h);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, new RegExp(`^ {2}WARN: the user configuration's workflow block names ${LENS}, an agent the pact retired; take the name out of the block, and where it sat in the spec pair put unstated-lens in its place\\.\\r?$`, 'm'), r.out);
  assert.match(r.stdout, /^seam-a\| RESULT: pass\r?$/m, r.out);
  assert.ok(!r.out.includes(SENTINEL), 'a block word reached the dry run');
});

test('a clean block, and a block naming a longer name that contains the lens, draw no such WARN', t => {
  const repo = makeRepo(t);
  const h = home(t);
  configure(h, { schema: 1, edits: [{ mark: 'workflow', op: 'replace', file: 'wf.md' }] }, { 'wf.md': `Design runs my-${LENS} and ${LENS}-two.\n` });
  const r = install(repo, h);
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.stdout, /an agent the pact retired/, r.out);
});

test('bad case: a project qualities list naming the retired lens draws a WARN in the project dry run', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const proj = home(t);
  mkdirSync(join(proj, '.claude'));
  writeFileSync(join(proj, '.claude', 'pact-config.json'), `${JSON.stringify({ schema: 1, qualities: [{ quality: 'Speed', measure: SENTINEL, lenses: [LENS] }] })}\n`);
  const r = install(repo, h, { extra: ['--project-folder', proj] });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, new RegExp(`^ {2}WARN: the project configuration's qualities list names ${LENS}, an agent the pact retired; take the name out of the list\\.\\r?$`, 'm'), r.out);
  assert.ok(!r.out.includes(SENTINEL), 'a project value reached the dry run');
});

// ADR 0094: a home install with no configuration renders the pact's default, so its apply carries the rendered hash.
test('bad case: a live agent file with the retired name, and no record, draws the fixed line in every dry run and is left in place by --apply', t => {
  const repo = makeRepo(t);
  const h = home(t);
  plant(h);
  const line = new RegExp(`^WARN: ${ORPHAN} is named for ${LENS}, an agent the pact retired; the file is not the pact's, so the install leaves it as is\\.\\r?$`, 'm');
  const dry = install(repo, h);
  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.stdout, line, dry.out);
  assert.ok(!dry.out.includes(SENTINEL), 'the file text reached the dry run');
  const applied = applyBound(repo, h);
  assert.equal(applied.code, 0, applied.out);
  assert.ok(existsSync(join(h, ORPHAN)), 'the install deleted a file it did not write');
  assert.match(readFileSync(join(h, ORPHAN), 'utf8'), new RegExp(SENTINEL));
  const again = install(repo, h);
  assert.match(again.stdout, line, 'the line must come back on every dry run');
});

test('a clean home draws no retired-agent line', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const r = install(repo, h);
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.stdout, /an agent the pact retired/, r.out);
});

// ADR 0094: a home install with no configuration renders the pact's default, so its apply carries the rendered hash.
test('the pact\'s own recorded copy is deleted through its record and draws no line; a changed copy is kept and named', t => {
  const repo = makeRepo(t);
  const h = home(t);
  // The repo no longer ships the lens, so an older install's copy is planted by hand and recorded.
  const first = applyBound(repo, h);
  assert.equal(first.code, 0, first.out);
  const recordFile = join(h, '.pact-install.json');
  const record = JSON.parse(readFileSync(recordFile, 'utf8'));
  const text = `---\nname: ${LENS}\n---\nold copy\n`;
  plant(h, text);
  record.files.push({ path: ORPHAN, sha256: createHash('sha256').update(text).digest('hex') });
  writeFileSync(recordFile, JSON.stringify(record));
  const dry = install(repo, h);
  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.stdout, new RegExp(`^Delete: 1\\r?\\n {2}${ORPHAN.replace('/', '\\/')}`, 'm'), dry.out);
  assert.doesNotMatch(dry.stdout, /an agent the pact retired/, dry.out);
  // Now the person changed it: the install keeps it and names it.
  plant(h, `${text}my own edit\n`);
  const changed = install(repo, h);
  assert.equal(changed.code, 0, changed.out);
  assert.match(changed.stdout, /^Delete: 0\r?$/m, changed.out);
  assert.match(changed.stdout, /an agent the pact retired/, changed.out);
});
