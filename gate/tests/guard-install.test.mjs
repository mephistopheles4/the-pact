// The guard through the install (spec 0007 S8): the files and hooks one apply
// writes into Codex and Antigravity, the trust step it prints, the person's
// own hooks it keeps, drift, and taking the guard out again (C15, C16). The
// guard itself, run through the hook's command, is in guard.test.mjs.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { test } from 'node:test';
import { applyBound, commitAll, home, install, makeRepo, passed, refused } from './install-harness.mjs';
import { REPO } from './text.mjs';

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
// No command, so no skill is asked on: the table holds the switches' rules alone.
const ON = { tools: ['cleaner'], commands: [] };
const COMMAND_MATCHER = 'run_command|manage_task';
const READ_MATCHER = 'run_command|manage_task|view_file|read_file';
const MINE = { matcher: '^Bash$', hooks: [{ type: 'command', command: 'echo mine', timeout: 5 }] };
const MY_GROUP = { PreToolUse: [{ matcher: 'run_command', hooks: [{ command: 'echo mine' }] }] };
const record = h => json(h, '.pact/install.json');
const guardEntries = h => record(h).entries.filter(e => e.key.startsWith('guard.'));
const GUARD_FILES = ['antigravity.mjs', 'codex.mjs', 'guard.mjs', 'rules.json'];
// Windows gets Antigravity's guard alone: Codex's waits until its hook command is settled there.
const WIN = process.platform === 'win32';
const CODEX_ON = !WIN;
const GUARDED = CODEX_ON ? ['antigravity', 'codex'] : ['antigravity'];
/** A recorded hook command run as the harness runs it, the call on standard input. */
const hookRun = (command, call) => {
  const options = { input: JSON.stringify(call), encoding: 'utf8', env: { ...process.env, PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH}` } };
  return WIN ? spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/C', `"${command}"`], { ...options, windowsVerbatimArguments: true }) : spawnSync('/bin/sh', ['-c', command], options);
};
const notYet = id => new RegExp(`^WARN: ${id}: the pact's guard isn't installed on Windows yet, `, 'm');
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
  assert.equal(TRUST.test(dry.stdout), CODEX_ON, dry.out);
  assert.equal(/^\.codex\/hooks\.json: would be merged\r?\n {2}pact-guard hook: added\r?$/m.test(dry.stdout), CODEX_ON, dry.out);
  assert.match(dry.stdout, /^\.gemini\/config\/hooks\.json: would be merged\r?$/m, dry.out);
  assert.match(dry.stdout, /^Guard rules \(\.pact\/guard\/rules\.json\): worktree-remove \(deny\), .*cleaner-override \(ask\)\r?$/m, dry.out);
  assert.deepEqual(guardFiles(h), [], 'a dry run writes nothing');
  const r = applyBound(repo, h);
  passed(r);
  assert.equal(TRUST.test(r.stdout), CODEX_ON, r.out);
  assert.deepEqual(guardFiles(h), GUARD_FILES);

  const codex = json(h, CODEX);
  assert.deepEqual(codex.hooks.Stop, [MINE]);
  assert.deepEqual(codex.hooks.PreToolUse[0], MINE);
  const [pact] = codex.hooks.PreToolUse.slice(1);
  assert.equal(codex.hooks.PreToolUse.length, CODEX_ON ? 2 : 1);
  if (CODEX_ON) assert.deepEqual([pact.matcher, pact.hooks[0].timeout, pact.hooks[0].statusMessage], ['^Bash$', 15, 'pact-guard']);
  const ag = json(h, AG);
  assert.deepEqual(ag.mine, MY_GROUP);
  assert.deepEqual(ag['pact-guard'].PreToolUse.map(g => [g.matcher, g.hooks.length, g.hooks[0].timeout]), [[COMMAND_MATCHER, 1, 15]]);

  const wanted = [['antigravity', AG, 'guard.antigravity', ag['pact-guard'].PreToolUse[0]], ...(CODEX_ON ? [['codex', CODEX, 'guard.codex', pact]] : [])];
  assert.deepEqual(guardEntries(h).map(e => [e.harness, e.path, e.key, e.value]).sort(), wanted, 'only the pact\'s entries are recorded');

  // The command each entry holds, run as its harness would, denies a guarded command.
  if (CODEX_ON) {
    const run = hookRun(pact.hooks[0].command, { tool_name: 'Bash', tool_input: { command: 'git worktree remove w' } });
    assert.equal(run.status, 2, `${run.stdout}${run.stderr}`);
    assert.match(run.stderr, /rule worktree-remove/);
  }
  const typed = hookRun(ag['pact-guard'].PreToolUse[0].hooks[0].command, { toolCall: { name: 'manage_task', args: { Action: 'send_input', Input: 'git worktree remove w\n' } } });
  assert.equal(typed.status, 0, `${typed.stdout}${typed.stderr}`);
  assert.deepEqual(JSON.parse(typed.stdout), { decision: 'deny', reason: "The pact's guard blocks this command (rule worktree-remove)." });

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
  const changed = CODEX_ON ? [CODEX, AG] : [AG];
  const before = changed.map(rel => readFileSync(at(h, rel), 'utf8'));
  const first = applyBound(repo, h);
  passed(first);
  const name = /backed up \d+ file\(s\) to \.pact\/backups\/(\S+)/.exec(first.stdout)[1];
  assert.deepEqual(changed.map(rel => readFileSync(at(h, `.pact/backups/${name}/${rel}`), 'utf8')), before);
  config(h, { tools: [], commands: [] });
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
  assert.ok(off.stdout.indexOf(`merged ${AG}`) < off.stdout.indexOf('deleted .pact/guard/antigravity.mjs'), off.out);
});

test('C16: a hooks file the record doesn\'t list is merged, not refused; one that doesn\'t exist is made; a harness taken out loses only the pact\'s entry', t => {
  const repo = makeRepo(t);
  const h = home(t);
  mkdirSync(join(h, '.codex'));
  mkdirSync(join(h, '.gemini', 'config'), { recursive: true });
  put(h, AG, { mine: MY_GROUP });
  config(h, ON);
  passed(applyBound(repo, h));
  assert.equal(CODEX_ON && json(h, CODEX).hooks.PreToolUse.length, CODEX_ON && 1);
  assert.deepEqual(Object.keys(json(h, AG)), ['mine', 'pact-guard']);
  config(h, { ...ON, harnesses: { install: ['claude', 'antigravity'] } });
  const out = applyBound(repo, h);
  passed(out);
  if (CODEX_ON) assert.deepEqual(json(h, CODEX), {});
  assert.deepEqual(Object.keys(json(h, AG)), ['mine', 'pact-guard']);
  assert.deepEqual(guardEntries(h).map(e => e.harness), ['antigravity']);
  config(h, { ...ON, harnesses: { install: ['claude'] } });
  passed(applyBound(repo, h));
  assert.deepEqual(json(h, AG), { mine: MY_GROUP });
  assert.deepEqual(guardEntries(h), []);
});

test('S7: with a skill that stands for the owner\'s answer installed, Antigravity alone gets the ask, rules off included; with none, no guard', t => {
  const repo = makeRepo(t);
  const h = three(t);
  const before = readFileSync(at(h, CODEX), 'utf8');
  config(h, { tools: [], commands: ['finis'] });
  const dry = install(repo, h);
  passed(dry);
  assert.match(dry.stdout, /^Guard rules \(\.pact\/guard\/rules\.json\): owner-skill \(ask\)\r?$/m, dry.out);
  assert.doesNotMatch(dry.stdout, TRUST, dry.out);
  assert.doesNotMatch(dry.stdout, notYet('codex'), dry.out);
  passed(applyBound(repo, h));
  assert.equal(readFileSync(at(h, CODEX), 'utf8'), before);
  const entry = () => json(h, AG)['pact-guard']?.PreToolUse[0];
  assert.equal(entry().matcher, READ_MATCHER);
  assert.deepEqual(guardEntries(h).map(e => e.harness), ['antigravity']);
  const read = hookRun(entry().hooks[0].command, { toolCall: { name: 'read_file', args: { Path: at(h, '.gemini/config/skills/finis/SKILL.md') } } });
  assert.equal(JSON.parse(read.stdout).decision, 'force_ask', `${read.stdout}${read.stderr}`);

  // /scriptorium stands for no answer: nothing to ask on.
  config(h, { tools: [], commands: [] });
  passed(applyBound(repo, h));
  assert.equal(entry(), undefined);
  assert.deepEqual(guardFiles(h), []);

  // With the cleaner on and no such skill, the read tools are left alone.
  config(h, ON);
  passed(applyBound(repo, h));
  assert.equal(entry().matcher, COMMAND_MATCHER);
});

test('with no rule on, no guard file or hook is written', t => {
  const repo = makeRepo(t);
  const h = three(t);
  config(h, { tools: [], commands: [] });
  const before = readFileSync(at(h, CODEX), 'utf8');
  const r = applyBound(repo, h);
  passed(r);
  assert.doesNotMatch(r.stdout, TRUST, r.out);
  assert.doesNotMatch(r.stdout, notYet('codex'), r.out);
  assert.equal(readFileSync(at(h, CODEX), 'utf8'), before);
  assert.deepEqual(guardFiles(h), []);
});

test('on Windows Codex gets no guard yet, is warned and left as it was; Antigravity gets it on every platform', t => {
  const repo = makeRepo(t);
  const h = three(t);
  const before = [CODEX, AG].map(rel => readFileSync(at(h, rel), 'utf8'));
  const r = applyBound(repo, h);
  passed(r);
  assert.equal(notYet('codex').test(r.stdout), !CODEX_ON, r.out);
  assert.doesNotMatch(r.stdout, notYet('antigravity'), r.out);
  assert.equal(TRUST.test(r.stdout), CODEX_ON, r.out);
  assert.deepEqual(guardFiles(h), GUARD_FILES);
  assert.deepEqual(guardEntries(h).map(e => e.harness).sort(), GUARDED);
  assert.deepEqual([CODEX, AG].map((rel, i) => readFileSync(at(h, rel), 'utf8') === before[i]), [!CODEX_ON, false]);
});

test('bad case: a changed pact hook is drift, a hooks file that is not a strict JSON object refuses, and so does a list of another shape', t => {
  const repo = makeRepo(t);
  const h = three(t);
  passed(applyBound(repo, h));
  const ag = json(h, AG);
  ag['pact-guard'].PreToolUse[0].hooks[0].timeout = 1;
  put(h, AG, ag);
  const dry = install(repo, h);
  passed(dry);
  assert.match(dry.stdout, /^ {2}\.gemini\/config\/hooks\.json \(the pact's guard hook changed since the install\)\r?$/m, dry.out);
  refused(applyBound(repo, h), /installed files or settings entries changed since the last install/);
  assert.deepEqual(json(h, AG), ag, 'nothing was written');
  for (const [text, says] of [['{ // a comment\n}', /\.gemini\/config\/hooks\.json is not a strict JSON object/], ['{"pact-guard": {"PreToolUse": 1}}', /is not the list the harness reads/]]) {
    const fresh = three(t);
    put(fresh, AG, text);
    refused(install(repo, fresh), says);
    assert.equal(readFileSync(at(fresh, AG), 'utf8'), text);
    assert.deepEqual(guardFiles(fresh), []);
  }
});

// The undo steps are followed by hand, so they must allow what the guard's apply backs up.
test('bad case: the undo steps allow each hooks file the apply backs up, one it made included', t => {
  const repo = makeRepo(t);
  const h = home(t);
  mkdirSync(join(h, '.codex'));
  put(h, AG, { mine: MY_GROUP });
  config(h, ON);
  const r = applyBound(repo, h);
  passed(r);
  const name = /backed up \d+ file\(s\) to \.pact\/backups\/(\S+)/.exec(r.stdout)[1];
  const hooksFile = e => [CODEX, AG].includes(e.path);
  const listed = json(h, `.pact/backups/${name}/manifest.json`).entries.filter(hooksFile).map(e => [e.path, e.was]);
  assert.deepEqual(listed, [...(CODEX_ON ? [[CODEX, 'absent']] : []), [AG, 'file']]);
  // The record names a hooks file under its entries, never its files.
  assert.deepEqual(record(h).files.filter(hooksFile), []);
  const undo = readFileSync(join(REPO, 'docs', 'install.md'), 'utf8').replaceAll('\r\n', '\n').split('\n## Undo an apply\n')[1].split('\n## ')[0];
  const rule = start => undo.split(/\n(?=   - |\d\. )/).find(b => b.startsWith(`   - ${start}`)).replace(/\s+/g, ' ');
  assert.match(rule('each path is under'),/hooks file \(`~\/\.codex\/hooks\.json`, `~\/\.gemini\/config\/hooks\.json`/);
  assert.match(rule('each `was: absent` path'), /a hooks file under its `entries`/);
});

test('bad case: a hooks path only the install record names is held to the same bound, under a harness that isn\'t found too', t => {
  const repo = makeRepo(t);
  const h = home(t);
  put(h, AG, { mine: MY_GROUP });
  config(h, ON);
  passed(applyBound(repo, h));
  assert.ok(!existsSync(join(h, '.codex')), 'Codex is not found here');
  // Planted, so the case runs on Windows too, where an apply records no guard entry.
  const doc = record(h);
  doc.entries.push({ harness: 'codex', path: '.ssh/hooks.json', key: 'guard.codex', value: { matcher: '^Bash$', hooks: [] }, sha256: '0'.repeat(64) });
  put(h, '.pact/install.json', doc);
  refused(install(repo, h), /unsafe path for a hooks file: \.ssh\/hooks\.json/);
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
  mkdirSync(join(shared, '.gemini', 'config'), { recursive: true });
  config(shared, { ...ON, harnesses: { own: [{ id: 'antigravity', hooks: { file: '~/.claude/Settings.json', format: 'antigravity' } }] } });
  refused(install(repo, shared), /the path of settings\.json for a hooks file/);
  const linked = home(t);
  mkdirSync(join(linked, 'elsewhere'));
  mkdirSync(join(linked, '.gemini'));
  symlinkSync(join(linked, 'elsewhere'), join(linked, '.gemini', 'config'), 'junction');
  config(linked, ON);
  refused(install(repo, linked), /path through a link for a hooks file: \.gemini\/config\/hooks\.json/);
  assert.deepEqual(readdirSync(join(linked, 'elsewhere')), []);
});
