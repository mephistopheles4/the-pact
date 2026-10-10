// The Node install's project install end to end (#153, T2's J rows): the
// bootstrap and the runner against a throwaway repo, a throwaway home folder
// <tmp>/home with --claude-home <tmp>/home/.claude, and a project beside it.
// Each refusal the install decides is a table row in install-core.test.mjs;
// the project module's own refusals are its tests'.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { install, makeRepo, passed, refused, WIN, wrapCheck } from './install-harness.mjs';
import { tempDir } from './tree.mjs';

function layout(t) {
  const root = tempDir(t, 'pact-nproj-');
  const ch = join(root, 'home', '.claude');
  mkdirSync(ch, { recursive: true });
  const proj = join(root, 'home', 'proj');
  mkdirSync(join(proj, '.claude'), { recursive: true });
  writeFileSync(join(proj, '.claude', 'pact-config.json'), '{"schema": 1, "settings": {"usage-pause": 60}}\n');
  return { ch, proj };
}
const projectHash = r => /^ {2}rendered project rules file: sha256 ([0-9a-f]{64})$/m.exec(r.stdout)?.[1];
const rulesDir = proj => join(proj, '.claude', 'rules');

test('node project: a dry run shows the Project block and prints an apply line with --project-folder and the hash, and writes nothing', t => {
  const repo = makeRepo(t);
  const { ch, proj } = layout(t);
  const r = install(repo, ch, { extra: ['--project-folder', proj] });
  passed(r);
  assert.match(r.stdout, /^Project install from commit [0-9a-f]{40} into the project folder /m);
  assert.match(r.stdout, /^ {2}rules file \.claude\/rules\/pact-project\.md: would be written \(new\)$/m);
  assert.ok(!/^project\| ROOT /m.test(r.stdout), 'the real path is never shown');
  const line = r.stdout.split('\n').find(l => l.includes(' --apply --commit '));
  assert.ok(line.includes(`--project-folder '${proj}'`), r.out);
  assert.ok(line.endsWith(`--rendered-hash ${projectHash(r)}`), r.out);
  assert.deepEqual(readdirSync(join(proj, '.claude')), ['pact-config.json']);
  assert.deepEqual(readdirSync(ch), []);
});

test('node project: --apply with the hash writes the rules file and its record, verifies both, and the next dry run says unchanged', t => {
  const repo = makeRepo(t);
  const { ch, proj } = layout(t);
  const hash = projectHash(install(repo, ch, { extra: ['--project-folder', proj] }));
  const r = install(repo, ch, { apply: true, extra: ['--project-folder', proj, '--rendered-hash', hash] });
  passed(r);
  assert.match(r.stdout, /^OK {7}\.claude\/rules\/pact-project\.md$/m);
  assert.match(r.stdout, /^OK {7}\.claude\/rules\/pact-project\.record\.json$/m);
  assert.match(readFileSync(join(rulesDir(proj), 'pact-project.md'), 'utf8'), /above 60%/);
  assert.deepEqual(JSON.parse(readFileSync(join(rulesDir(proj), 'pact-project.record.json'), 'utf8')), { file: 'pact-project.md', sha256: hash });
  assert.deepEqual(readdirSync(ch), [], 'nothing in the Claude home folder');
  const again = install(repo, ch, { extra: ['--project-folder', proj] });
  passed(again);
  assert.match(again.stdout, /^ {2}rules file \.claude\/rules\/pact-project\.md: unchanged$/m);
});

test('node project: --apply refuses with no hash, with another hash, and on a dirty tree, writing nothing', t => {
  const repo = makeRepo(t);
  const { ch, proj } = layout(t);
  const hash = projectHash(install(repo, ch, { extra: ['--project-folder', proj] }));
  refused(install(repo, ch, { apply: true, extra: ['--project-folder', proj] }), /needs the full rendered hash/);
  refused(install(repo, ch, { apply: true, extra: ['--project-folder', proj, '--rendered-hash', 'b'.repeat(64)] }), /is not the full hash of the rules file this run rendered/);
  writeFileSync(join(repo, 'stray'), 'x');
  refused(install(repo, ch, { apply: true, extra: ['--project-folder', proj, '--rendered-hash', hash] }), /the working tree is not clean/);
  assert.deepEqual(readdirSync(join(proj, '.claude')), ['pact-config.json']);
});

test('node project: a rules folder that is a link refuses, and nothing is written through it', t => {
  const repo = makeRepo(t);
  const { ch, proj } = layout(t);
  const elsewhere = tempDir(t, 'pact-nproj-else-');
  try {
    symlinkSync(elsewhere, rulesDir(proj), WIN ? 'junction' : 'dir');
  } catch (e) {
    if (e.code === 'EPERM') return t.skip('this account may not make a link here');
    throw e;
  }
  refused(install(repo, ch, { extra: ['--project-folder', proj] }));
  assert.deepEqual(readdirSync(elsewhere), []);
});

test('node project: a project render that writes into the stage refuses, with nothing written', t => {
  const repo = makeRepo(t, root => {
    const p = join(root, 'gate', 'render-core.mjs');
    const target = 'export function check(argv) {\n';
    const text = readFileSync(p, 'utf8');
    assert.equal(text.split(target).length, 2);
    writeFileSync(p, `import { appendFileSync as plantAppend } from 'node:fs';\n${text.replace(target, `${target}  if (argv[0] === 'project') plantAppend('planted-by-render', 'x');\n`)}`);
  });
  const { ch, proj } = layout(t);
  refused(install(repo, ch, { extra: ['--project-folder', proj] }), /^REFUSED: the renderer changed the stage\. Nothing was changed\.$/m);
  assert.deepEqual(readdirSync(join(proj, '.claude')), ['pact-config.json']);
});

test('node project: --review-folder with --project-folder refuses before anything runs', t => {
  const repo = makeRepo(t);
  const { ch, proj } = layout(t);
  refused(install(repo, ch, { extra: ['--project-folder', proj, '--review-folder', join(tempDir(t), 'rev')] }), /--review-folder is for a home install/);
});

// The runner tests the project's paths for links itself, after the project
// module has (S7, J2): a link that appears once the module has checked is
// refused by the runner's own test, under its own rule.
test('node project: a link that appears after the project module checked is refused by the runner', t => {
  const target = tempDir(t, 'pact-nproj-target-');
  const repo = makeRepo(t, root => wrapCheck(root, 'project-core', { after: `if (argv[0] === 'check') fs.symlinkSync(${JSON.stringify(target)}, argv[1] + '/.claude/rules', 'junction');` }));
  const { ch, proj } = layout(t);
  const r = install(repo, ch, { extra: ['--project-folder', proj] });
  refused(r, /^REFUSED: a project path is a link or other reparse point, or could not be read: \.claude\/rules\./m);
  assert.match(r.stdout, /^project\| RESULT: pass$/m, 'the project module passed first');
  assert.deepEqual(readdirSync(target), []);
});

test('node project: a project dry run counts the work folders a hard stop left', t => {
  const repo = makeRepo(t);
  const { ch, proj } = layout(t);
  const tmp = tempDir(t, 'pact-tmp-');
  mkdirSync(join(tmp, 'pact-install-left'));
  const r = install(repo, ch, { extra: ['--project-folder', proj], env: { TEMP: tmp, TMP: tmp, TMPDIR: tmp } });
  passed(r);
  assert.match(r.stdout, /^NOTE: 1 other pact-install-\* folder\(s\) in the temp folder/m);
});
