// Pact commands through the install script (#203, T1), end to end against a
// throwaway repo and a throwaway --claude-home. No command file ships yet, so
// each repo plants claude/commands/finis.md. One case per new refusal, each
// checking that a refused install changed nothing. Never touches ~/.claude.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { WIN, home, install, listTree, makeRepo, passed, refused, wrapCheck } from './install-harness.mjs';

const FINIS = ['---', 'description: Wrap this session up.', 'disable-model-invocation: true', '---', '', 'Wrap the session up, step by step.', ''].join('\n');

/** A repo holding the finis command, with `more` run after it is planted. */
function repoWithFinis(t, more) {
  return makeRepo(t, root => {
    mkdirSync(join(root, 'claude', 'commands'), { recursive: true });
    writeFileSync(join(root, 'claude', 'commands', 'finis.md'), FINIS);
    if (more) more(root);
  });
}

/** A Claude home folder whose configuration turns on `commands`. */
function homeWith(t, commands) {
  const h = home(t);
  mkdirSync(join(h, 'pact'), { recursive: true });
  writeFileSync(join(h, 'pact', 'config.json'), `${JSON.stringify({ schema: 1, commands })}\n`);
  return h;
}

function dryRunHash(r) {
  const m = /^ {2}rendered rules file: sha256 ([0-9a-f]{64})\r?$/m.exec(r.stdout);
  assert.ok(m, r.out);
  return m[1];
}

/** An --apply that refused, leaving the home folder exactly as it was. */
function refusedUnchanged(repo, h, says) {
  const before = listTree(h);
  const r = install(repo, h, { apply: true, extra: ['--rendered-hash', 'a'.repeat(64)] });
  refused(r, says);
  assert.deepEqual(listTree(h), before, 'a refused install changes nothing');
  return r;
}

// ------------------------------------------------------------ the happy path (C2, C3)

test('a listed command installs to commands/<name>.md, and dropping it from the list deletes it', t => {
  const repo = repoWithFinis(t);
  const h = homeWith(t, ['finis']);
  const dry = install(repo, h);
  passed(dry);
  assert.match(dry.stdout, /^Commands:\r?\n {2}\/make-it-so: off \(not in this commit\)\r?\n {2}\/finis: on\r?\n {2}\/scriptorium: off \(not in this commit\)\r?$/m, dry.out);
  assert.match(dry.stdout, /^ {2}To turn one on, list its name in pact\/config\.json, for example: "commands": \["finis"\]\r?$/m, dry.out);
  assert.match(dry.stdout, /^ {2}WARN: the user configuration turns on the pact command \/finis; it installs to commands\/finis\.md\.\r?$/m, dry.out);
  assert.match(dry.stdout, /^Add: \d+\r?\n(?: {2}.*\r?\n)* {2}commands\/finis\.md\r?$/m, dry.out);
  passed(install(repo, h, { apply: true, extra: ['--rendered-hash', dryRunHash(dry)] }));
  assert.equal(readFileSync(join(h, 'commands', 'finis.md'), 'utf8'), FINIS);
  const record = JSON.parse(readFileSync(join(h, '.pact-install.json'), 'utf8'));
  assert.ok(record.files.some(f => f.path === 'commands/finis.md'), 'the record lists the command');

  writeFileSync(join(h, 'pact', 'config.json'), `${JSON.stringify({ schema: 1, commands: [] })}\n`);
  const dry2 = install(repo, h);
  passed(dry2);
  assert.match(dry2.stdout, /^Delete: 1\r?\n {2}commands\/finis\.md\r?$/m, dry2.out);
  assert.match(dry2.stdout, /^ {2}\/finis: off\r?$/m, dry2.out);
  passed(install(repo, h, { apply: true, extra: ['--rendered-hash', dryRunHash(dry2)] }));
  assert.ok(!existsSync(join(h, 'commands', 'finis.md')), 'the dropped command is deleted');
});

test('with no list, no command installs, and the dry run still lists the pact commands', t => {
  const repo = repoWithFinis(t);
  const h = home(t);
  const r = install(repo, h, { apply: true });
  passed(r);
  assert.match(r.stdout, /^ {2}\/finis: off\r?$/m, r.out);
  assert.ok(!existsSync(join(h, 'commands')), 'no commands folder');
});

// ------------------------------------------------------------ refusals against the live home folder (S8)

test('bad case: a live file at a command path the record does not list refuses, and is left alone', t => {
  const repo = repoWithFinis(t);
  const h = homeWith(t, ['finis']);
  mkdirSync(join(h, 'commands'));
  writeFileSync(join(h, 'commands', 'finis.md'), 'my own finis\n');
  const dry = install(repo, h);
  refused(dry, /^REFUSED: commands\/finis\.md already exists in the Claude home folder, and the install record does not list it, so the pact did not put it there\./m);
  refusedUnchanged(repo, h, /^REFUSED: commands\/finis\.md already exists/m);
  assert.equal(readFileSync(join(h, 'commands', 'finis.md'), 'utf8'), 'my own finis\n');
});

test('bad case: a same-named skill folder refuses, in the dry run and on --apply, naming it home-relative', t => {
  const repo = repoWithFinis(t);
  const h = homeWith(t, ['finis']);
  mkdirSync(join(h, 'skills', 'finis'), { recursive: true });
  writeFileSync(join(h, 'skills', 'finis', 'SKILL.md'), 'mine\n');
  const dry = install(repo, h);
  refused(dry, /^REFUSED: skills\/finis exists in the Claude home folder, and Claude Code would run that skill in place of the pact command \/finis\./m);
  assert.ok(!dry.stdout.split('\n').find(l => l.startsWith('REFUSED: ')).includes(h), 'the refusal names no full path');
  refusedUnchanged(repo, h, /^REFUSED: skills\/finis exists/m);
});

test('bad case: a same-named skill that is a plain file refuses', t => {
  const repo = repoWithFinis(t);
  const h = homeWith(t, ['finis']);
  mkdirSync(join(h, 'skills'));
  writeFileSync(join(h, 'skills', 'finis'), 'mine\n');
  refusedUnchanged(repo, h, /^REFUSED: skills\/finis exists in the Claude home folder/m);
});

test('bad case: a same-named skill that is a dangling link refuses, read without following it', t => {
  const repo = repoWithFinis(t);
  const h = homeWith(t, ['finis']);
  mkdirSync(join(h, 'skills'));
  // A junction on Windows needs no privilege; elsewhere a directory symlink, both to a folder that does not exist.
  try {
    symlinkSync(join(h, 'gone'), join(h, 'skills', 'finis'), WIN ? 'junction' : 'dir');
  } catch (e) {
    if (e.code === 'EPERM' || e.code === 'EACCES') return t.skip('this account may not make a link here');
    throw e;
  }
  refusedUnchanged(repo, h, /^REFUSED: skills\/finis exists in the Claude home folder/m);
});

// ------------------------------------------------------------ refusals of the list (S7, S8)

test('bad case: a commands value that is not a list of pact commands refuses at the renderer', t => {
  const repo = repoWithFinis(t);
  const h = homeWith(t, ['ship-it']);
  const r = refusedUnchanged(repo, h, /^REFUSED: the renderer failed\./m);
  assert.match(r.stdout, /^render\| FAIL config-commands: pact\/config\.json: commands names a command this pact does not have/m, r.out);
});

test('bad case: a listed command that is not in this pact refuses at seam A', t => {
  const repo = makeRepo(t);
  const h = homeWith(t, ['finis']);
  const r = refusedUnchanged(repo, h, /^REFUSED: the check failed\./m);
  assert.match(r.stdout, /^seam-a\| FAIL commands-not-in-pact: --commands names finis, but the stage holds no claude\/commands\/finis\.md: it is not in this pact\r?$/m, r.out);
});

// ------------------------------------------------------------ the seam between the renderer, seam A and the install (S8)

const RUNNER_ARGS = "[stage, '--commands', parsed.commands.length ? parsed.commands.join(',') : 'none']";
/** Replace the runner's seam A arguments with `to`, in the repo's committed runner. */
const plantRunnerArgs = to => root => {
  const p = join(root, 'gate', 'install-run.mjs');
  const s = readFileSync(p, 'utf8');
  assert.equal(s.split(RUNNER_ARGS).length, 2, 'the runner passes seam A its arguments in one place');
  writeFileSync(p, s.replace(RUNNER_ARGS, to));
};

test('bad case: seam A given no --commands refuses', t => {
  const repo = repoWithFinis(t, plantRunnerArgs('[stage]'));
  const r = refusedUnchanged(repo, homeWith(t, ['finis']), /^REFUSED: the check failed\./m);
  assert.match(r.stdout, /^seam-a\| FAIL commands-arg: no --commands/m, r.out);
});

test('bad case: seam A given --commands twice refuses', t => {
  const repo = repoWithFinis(t, plantRunnerArgs("[stage, '--commands', 'finis', '--commands', 'finis']"));
  const r = refusedUnchanged(repo, homeWith(t, ['finis']), /^REFUSED: the check failed\./m);
  assert.match(r.stdout, /^seam-a\| FAIL commands-arg: --commands is given more than once/m, r.out);
});

test('bad case: a render with no COMMANDS line refuses', t => {
  const repo = repoWithFinis(t, root => wrapCheck(root, 'render-core', { after: "r.lines = r.lines.filter(l => !l.startsWith('COMMANDS '));" }));
  refusedUnchanged(repo, homeWith(t, ['finis']), /^REFUSED: the renderer did not report which pact commands are on\./m);
});

test('bad case: a render with two COMMANDS lines refuses', t => {
  const repo = repoWithFinis(t, root => wrapCheck(root, 'render-core', { after: "r.lines.splice(r.lines.length - 1, 0, 'COMMANDS finis');" }));
  refusedUnchanged(repo, homeWith(t, ['finis']), /^REFUSED: the renderer reported two commands lines\./m);
});

test('bad case: a render that names a command with CONFIG none refuses', t => {
  const repo = repoWithFinis(t, root => wrapCheck(root, 'render-core', { after: "r.lines = r.lines.map(l => (l === 'COMMANDS none' ? 'COMMANDS finis' : l));" }));
  refusedUnchanged(repo, home(t), /^REFUSED: the renderer reported a pact command with no configuration\./m);
});

test('bad case: seam A reading another list than the install refuses as a copy-set mismatch', t => {
  const repo = repoWithFinis(t, root => wrapCheck(root, 'seam-a-core', { before: "if (argv[1] === '--commands') argv[2] = 'none';" }));
  refusedUnchanged(repo, homeWith(t, ['finis']), /^REFUSED: the check's copy set does not match the install's own reading of commit [0-9a-f]{40}\./m);
});

test('bad case: an extra copy-set pair refuses', t => {
  const extra = "const h = process.getBuiltinModule('node:crypto').createHash('sha256').update(fs.readFileSync(argv[0] + '/claude/commands/finis.md')).digest('hex'); r.lines.splice(r.lines.findIndex(l => l.startsWith('SETTINGS ')), 0, 'INSTALL ' + h + ' claude/commands/finis.md commands/extra.md');";
  const repo = repoWithFinis(t, root => wrapCheck(root, 'seam-a-core', { after: extra }));
  refusedUnchanged(repo, homeWith(t, ['finis']), /^REFUSED: the check's copy set does not match the install's own reading/m);
});

test('bad case: a gate file listed for install outside the builder kit refuses', t => {
  const plant = "r.lines.splice(r.lines.findIndex(l => l.startsWith('SETTINGS ')), 0, 'INSTALL ' + 'a'.repeat(64) + ' gate/shared.mjs pact/builder/gate/shared.mjs');";
  const repo = repoWithFinis(t, root => wrapCheck(root, 'seam-a-core', { after: plant }));
  refusedUnchanged(repo, homeWith(t, ['finis']), /^REFUSED: the check listed a gate file for install outside the builder kit: gate\/shared\.mjs\./m);
});
