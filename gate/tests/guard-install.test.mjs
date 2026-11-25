// The guard through the install (spec 0007 S8): the files and hooks one apply
// writes into Codex and Antigravity, the trust step it prints, the person's
// own hooks it keeps, drift, and taking the guard out again (C15, C16). The
// guard itself, run through the hook's command, is in guard.test.mjs.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { applyBound, commitAll, home, install, makeRepo, passed, refused } from './install-harness.mjs';

const TRUST = /^(?: )*Codex: open \/hooks and trust pact-guard; until then Codex runs unguarded\.\r?$/m;
const CODEX = '.codex/hooks.json';
const AG = '.gemini/config/hooks.json';
const at = (h, rel) => join(h, ...rel.split('/'));
const json = (h, rel) => JSON.parse(readFileSync(at(h, rel), 'utf8'));
const put = (h, rel, doc) => {
  mkdirSync(dirname(at(h, rel)), { recursive: true });
  writeFileSync(at(h, rel), typeof doc === 'string' ? doc : `${JSON.stringify(doc, null, 2)}\n`);
};
const config = (h, doc) => put(h, '.pact/config.json', { schema: 1, ...doc });
const ON = { tools: ['cleaner'] };
const MINE = { matcher: '^Bash$', hooks: [{ type: 'command', command: 'echo mine', timeout: 5 }] };
const MY_GROUP = { PreToolUse: [{ matcher: 'run_command', hooks: [{ command: 'echo mine' }] }] };
const record = h => json(h, '.pact/install.json');
const guardEntries = h => record(h).entries.filter(e => e.key.startsWith('guard.'));
const GUARD_FILES = ['antigravity.mjs', 'codex.mjs', 'guard.mjs', 'rules.json'];
// On Windows the pact writes Antigravity no hook: the shell it runs hooks under is not known to be cmd.
const AG_HOOKED = process.platform !== 'win32';
const NO_SHELL = /^WARN: antigravity: no guard hook is written on Windows: /m;
const guardFiles = h => (existsSync(at(h, '.pact/guard')) ? readdirSync(at(h, '.pact/guard')).sort() : []);

/** A home with Claude Code, Codex and Antigravity found in it, the person's own hooks in the last two, and the cleaner on. */
function three(t) {
  const h = home(t);
  put(h, CODEX, { hooks: { PreToolUse: [MINE], Stop: [MINE] } });
  put(h, AG, { mine: MY_GROUP });
  config(h, ON);
  return h;
}

test('C15, C16: one apply writes the guard and merges each hook beside the person\'s, prints Codex\'s trust step, and the next run has nothing to do', t => {
  const repo = makeRepo(t);
  const h = three(t);
  const dry = install(repo, h);
  passed(dry);
  assert.match(dry.stdout, /^WARN: codex: .*; only its guard hook is installed\.\r?$/m, dry.out);
  assert.match(dry.stdout, TRUST, dry.out);
  assert.match(dry.stdout, /^\.codex\/hooks\.json: would be merged\r?\n {2}pact-guard hook: added\r?$/m, dry.out);
  assert.equal(/^\.gemini\/config\/hooks\.json: would be merged\r?$/m.test(dry.stdout), AG_HOOKED, dry.out);
  assert.equal(NO_SHELL.test(dry.stdout), !AG_HOOKED, dry.out);
  assert.match(dry.stdout, /^Guard rules \(\.pact\/guard\/rules\.json\): worktree-remove \(deny\), .*cleaner-override \(ask\)\r?$/m, dry.out);
  assert.deepEqual(guardFiles(h), [], 'a dry run writes nothing');
  const r = applyBound(repo, h);
  passed(r);
  assert.match(r.stdout, TRUST, r.out);
  assert.deepEqual(guardFiles(h), GUARD_FILES);

  const codex = json(h, CODEX);
  assert.deepEqual(codex.hooks.Stop, [MINE]);
  assert.deepEqual(codex.hooks.PreToolUse[0], MINE);
  const [pact] = codex.hooks.PreToolUse.slice(1);
  assert.equal(codex.hooks.PreToolUse.length, 2);
  assert.deepEqual([pact.matcher, pact.hooks[0].timeout, pact.hooks[0].statusMessage], ['^Bash$', 15, 'pact-guard']);
  const ag = json(h, AG);
  assert.deepEqual(ag.mine, MY_GROUP);
  assert.deepEqual((ag['pact-guard']?.PreToolUse ?? []).map(g => [g.matcher, g.hooks.length, g.hooks[0].timeout]), AG_HOOKED ? [['run_command', 1, 15]] : []);

  const recorded = [...(AG_HOOKED ? [['antigravity', AG, 'guard.antigravity', ag['pact-guard'].PreToolUse[0]]] : []), ['codex', CODEX, 'guard.codex', pact]];
  assert.deepEqual(guardEntries(h).map(e => [e.harness, e.path, e.key, e.value]).sort(), recorded, 'only the pact\'s entries are recorded');

  // The command the entry holds, run as the harness would, denies a guarded command.
  const input = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git worktree remove w' } });
  const command = pact.hooks[0].command;
  const run = process.platform === 'win32' ? spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/C', `"${command}"`], { input, encoding: 'utf8', windowsVerbatimArguments: true }) : spawnSync('/bin/sh', ['-c', command], { input, encoding: 'utf8', env: { ...process.env, PATH: `${dirname(process.execPath)}:${process.env.PATH}` } });
  assert.equal(run.status, 2, `${run.stdout}${run.stderr}`);
  assert.match(run.stderr, /rule worktree-remove/);

  const again = install(repo, h);
  passed(again);
  assert.doesNotMatch(again.stdout, TRUST, again.out);
  assert.match(again.stdout, /^Nothing to do\.\r?$/m, again.out);

  // A changed guard script is installed with the hook entry as it was, so no new trust.
  writeFileSync(join(repo, 'claude', 'guard', 'guard.mjs'), `${readFileSync(join(repo, 'claude', 'guard', 'guard.mjs'), 'utf8')}// changed\n`);
  commitAll(repo);
  const update = applyBound(repo, h);
  passed(update);
  assert.match(update.stdout, /^installed \.pact\/guard\/guard\.mjs\r?$/m, update.out);
  assert.doesNotMatch(update.stdout, TRUST, update.out);
});

test('C16: the apply backs up each hooks file it changes, and with every rule off removes only the pact\'s entry and the guard', t => {
  const repo = makeRepo(t);
  const h = three(t);
  const before = readFileSync(at(h, CODEX), 'utf8');
  const first = applyBound(repo, h);
  passed(first);
  const name = /backed up \d+ file\(s\) to \.pact\/backups\/(\S+)/.exec(first.stdout)[1];
  assert.equal(readFileSync(at(h, `.pact/backups/${name}/.codex/hooks.json`), 'utf8'), before);
  config(h, { tools: [] });
  const dry = install(repo, h);
  passed(dry);
  assert.match(dry.stdout, /^ {2}pact-guard hook: removed\r?$/m, dry.out);
  const off = applyBound(repo, h);
  passed(off);
  assert.doesNotMatch(off.stdout, TRUST, off.out);
  assert.deepEqual(json(h, CODEX), { hooks: { PreToolUse: [MINE], Stop: [MINE] } });
  assert.deepEqual(json(h, AG), { mine: MY_GROUP });
  assert.deepEqual(guardEntries(h), []);
  assert.deepEqual(guardFiles(h), []);
  // The hooks come out before the files they run are deleted.
  assert.ok(off.stdout.indexOf(`merged ${CODEX}`) < off.stdout.indexOf('deleted .pact/guard/codex.mjs'), off.out);
});

test('C16: a hooks file the record doesn\'t list is merged, not refused; one that doesn\'t exist is made; a harness taken out loses only the pact\'s entry', t => {
  const repo = makeRepo(t);
  const h = home(t);
  mkdirSync(join(h, '.codex'));
  mkdirSync(join(h, '.gemini', 'config'), { recursive: true });
  put(h, AG, { mine: MY_GROUP });
  config(h, ON);
  passed(applyBound(repo, h));
  assert.equal(json(h, CODEX).hooks.PreToolUse.length, 1);
  assert.deepEqual(Object.keys(json(h, AG)), AG_HOOKED ? ['mine', 'pact-guard'] : ['mine']);
  config(h, { ...ON, harnesses: { install: ['claude', 'codex'] } });
  const out = applyBound(repo, h);
  passed(out);
  assert.deepEqual(json(h, AG), { mine: MY_GROUP });
  assert.equal(json(h, CODEX).hooks.PreToolUse.length, 1);
  assert.deepEqual(guardEntries(h).map(e => e.harness), ['codex']);
});

test('with no rule on, no guard file or hook is written', t => {
  const repo = makeRepo(t);
  const h = three(t);
  config(h, { tools: [] });
  const before = readFileSync(at(h, CODEX), 'utf8');
  const r = applyBound(repo, h);
  passed(r);
  assert.doesNotMatch(r.stdout, TRUST, r.out);
  assert.match(r.stdout, /^WARN: codex: .*; nothing is installed into it\.\r?$/m, r.out);
  assert.equal(readFileSync(at(h, CODEX), 'utf8'), before);
  assert.deepEqual(guardFiles(h), []);
});

test('bad case: a changed pact hook is drift, a hooks file that is not a strict JSON object refuses, and so does a list of another shape', t => {
  const repo = makeRepo(t);
  const h = three(t);
  passed(applyBound(repo, h));
  const codex = json(h, CODEX);
  codex.hooks.PreToolUse[1].hooks[0].timeout = 1;
  put(h, CODEX, codex);
  const dry = install(repo, h);
  passed(dry);
  assert.match(dry.stdout, /^ {2}\.codex\/hooks\.json \(the pact's guard hook changed since the install\)\r?$/m, dry.out);
  refused(applyBound(repo, h), /live files changed since the last install/);
  assert.deepEqual(json(h, CODEX), codex, 'nothing was written');
  for (const [text, says] of [['{ // a comment\n}', /\.codex\/hooks\.json is not a strict JSON object/], ['{"hooks": {"PreToolUse": 1}}', /is not the list the harness reads/]]) {
    const fresh = three(t);
    put(fresh, CODEX, text);
    refused(install(repo, fresh), says);
    assert.equal(readFileSync(at(fresh, CODEX), 'utf8'), text);
    assert.deepEqual(guardFiles(fresh), []);
  }
});

test('bad case: a commit that holds a guard table or an unknown guard file, or lacks one, installs nothing', t => {
  for (const [mutate, says] of [
    [root => writeFileSync(join(root, 'claude', 'guard', 'rules.json'), '{"rules": []}\n'), /guard-file-name/],
    [root => writeFileSync(join(root, 'claude', 'guard', 'other.mjs'), '// other\n'), /guard-file-name/],
    [root => rmSync(join(root, 'claude', 'guard', 'codex.mjs')), /guard-not-in-pact/],
  ]) {
    const h = three(t);
    refused(install(makeRepo(t, mutate), h), says);
    assert.deepEqual(guardFiles(h), []);
  }
});

test('bad case: a hooks file that is settings.json, or sits behind a link, refuses', t => {
  const repo = makeRepo(t);
  const shared = home(t);
  mkdirSync(join(shared, '.codex'));
  config(shared, { ...ON, harnesses: { own: [{ id: 'codex', hooks: { file: '~/.claude/Settings.json', format: 'codex' } }] } });
  refused(install(repo, shared), /the path of settings\.json for a hooks file/);
  const linked = home(t);
  mkdirSync(join(linked, 'elsewhere'));
  mkdirSync(join(linked, '.codex'));
  mkdirSync(join(linked, 'own'));
  symlinkSync(join(linked, 'elsewhere'), join(linked, 'own', 'linked'), 'junction');
  config(linked, { ...ON, harnesses: { own: [{ id: 'codex', hooks: { file: '~/own/linked/hooks.json', format: 'codex' } }] } });
  refused(install(repo, linked), /path through a link for a hooks file: own\/linked\/hooks\.json/);
  assert.deepEqual(readdirSync(join(linked, 'elsewhere')), []);
});
