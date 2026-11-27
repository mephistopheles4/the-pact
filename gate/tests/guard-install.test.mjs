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
const OFF = { tools: [], commands: [] };
const COMMAND_MATCHER = 'run_command|manage_task|send_command_input';
const MINE = { matcher: '^Bash$', hooks: [{ type: 'command', command: 'echo mine', timeout: 5 }] };
const MY_GROUP = { PreToolUse: [{ matcher: 'run_command', hooks: [{ command: 'echo mine' }] }] };
const record = h => json(h, '.pact/install.json');
const guardEntries = h => record(h).entries.filter(e => e.key.startsWith('guard.'));
const WIN = process.platform === 'win32';
// On Windows each wrapper has a launcher beside it (S8).
// #PACT-121 #PACT-119 C7
const GUARD_FILES = [...(WIN ? ['antigravity.cmd', 'codex.cmd'] : []), 'antigravity.mjs', 'claude.mjs', 'codex.mjs', 'guard.mjs', 'rules.json'].sort();
/** The hook's command run through the platform's shell: on Windows, Windows PowerShell, since Codex runs hooks under PowerShell. */
const asCodex = (command, input) => (WIN
  ? spawnSync('powershell.exe', ['-NoProfile', '-Command', command], { input, encoding: 'utf8' })
  : spawnSync('/bin/sh', ['-c', command], { input, encoding: 'utf8', env: { ...process.env, PATH: `${dirname(process.execPath)}:${process.env.PATH}` } }));
/** The hook's command run as Antigravity runs it here. */
const asAntigravity = (command, call) => (WIN
  ? spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `"${command}"`], { input: JSON.stringify(call), encoding: 'utf8', windowsVerbatimArguments: true })
  : spawnSync('/bin/sh', ['-c', command], { input: JSON.stringify(call), encoding: 'utf8', env: { ...process.env, PATH: `${dirname(process.execPath)}:${process.env.PATH}` } }));
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
  assert.match(dry.stdout, TRUST, dry.out);
  assert.match(dry.stdout, /^\.codex\/hooks\.json: would be merged\r?\n {2}pact-guard hook: added\r?$/m, dry.out);
  assert.match(dry.stdout, /^\.gemini\/config\/hooks\.json: would be merged\r?$/m, dry.out);
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
  assert.deepEqual(ag['pact-guard'].PreToolUse.map(g => [g.matcher, g.hooks.length, g.hooks[0].timeout]), [[COMMAND_MATCHER, 1, 15]]);

  assert.deepEqual(guardEntries(h).map(e => [e.harness, e.path, e.key, e.value]).sort(), [['antigravity', AG, 'guard.antigravity', ag['pact-guard'].PreToolUse[0]], ['codex', CODEX, 'guard.codex', pact]], 'only the pact\'s entries are recorded');

  // The command the entry holds, run as the harness would, denies a guarded command.
  const input = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git worktree remove w' } });
  const command = pact.hooks[0].command;
  const run = asCodex(command, input);
  assert.equal(run.status, 2, `${run.stdout}${run.stderr}`);
  assert.match(run.stderr, /rule worktree-remove/);
  const typed = asAntigravity(ag['pact-guard'].PreToolUse[0].hooks[0].command, { toolCall: { name: 'manage_task', args: { Action: 'send_input', Input: 'git worktree remove w\n' } } });
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
  const before = readFileSync(at(h, CODEX), 'utf8');
  const first = applyBound(repo, h);
  passed(first);
  const name = /backed up \d+ file\(s\) to \.pact\/backups\/(\S+)/.exec(first.stdout)[1];
  assert.equal(readFileSync(at(h, `.pact/backups/${name}/.codex/hooks.json`), 'utf8'), before);
  config(h, OFF);
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
  assert.deepEqual(Object.keys(json(h, AG)), ['mine', 'pact-guard']);
  config(h, { ...ON, harnesses: { install: ['claude', 'antigravity'] } });
  const out = applyBound(repo, h);
  passed(out);
  assert.deepEqual(json(h, CODEX), {});
  assert.deepEqual(Object.keys(json(h, AG)), ['mine', 'pact-guard']);
  assert.deepEqual(guardEntries(h).map(e => e.harness), ['antigravity']);
  // With Codex out there is no hook of its to run, so no launcher for it either; GUARD_FILES holds launchers on Windows alone.
  assert.deepEqual(guardFiles(h), GUARD_FILES.filter(f => f !== 'codex.cmd'), 'no launcher for a harness with no hook');
});

test("C12: a skill that stands for the owner's answer installs no guard, and no hook of the cleaner's meets a read tool", t => {
  const repo = makeRepo(t);
  const h = three(t);
  const entry = () => json(h, AG)['pact-guard']?.PreToolUse[0];
  config(h, { tools: [], commands: ['finis'] });
  const dry = install(repo, h);
  passed(dry);
  assert.doesNotMatch(dry.stdout, /Guard rules/, dry.out);
  passed(applyBound(repo, h));
  assert.equal(entry(), undefined);
  assert.deepEqual(guardFiles(h), []);

  // With the cleaner on beside such a skill, the table holds the cleaner's rules alone, and no hook meets a read.
  config(h, { tools: ['cleaner'], commands: ['finis'] });
  const both = install(repo, h);
  passed(both);
  assert.doesNotMatch(both.stdout, /owner-skill/, both.out);
  passed(applyBound(repo, h));
  assert.equal(entry().matcher, COMMAND_MATCHER);
  assert.equal(json(h, '.pact/guard/rules.json').rules.some(r => r.skills), false);
});

test('with no rule on, no guard file or hook is written', t => {
  const repo = makeRepo(t);
  const h = three(t);
  config(h, OFF);
  const before = readFileSync(at(h, CODEX), 'utf8');
  const r = applyBound(repo, h);
  passed(r);
  assert.doesNotMatch(r.stdout, TRUST, r.out);
  assert.equal(readFileSync(at(h, CODEX), 'utf8'), before);
  assert.deepEqual(guardFiles(h), []);
});

// A hook written by a Linux or macOS node can't run where the home is a Windows one (a WSL node, say).
test('bad case: a node that is not Windows\'s refuses to write a guard into a Windows home', t => {
  const repo = makeRepo(t);
  const h = three(t);
  mkdirSync(at(h, 'AppData/Local'), { recursive: true });
  const before = readFileSync(at(h, CODEX), 'utf8');
  const r = install(repo, h);
  if (WIN) {
    passed(r);
    return;
  }
  refused(r, /^REFUSED: this home holds AppData, so it is a Windows one, /m);
  assert.equal(readFileSync(at(h, CODEX), 'utf8'), before);
  assert.deepEqual(guardFiles(h), []);
  // With every rule off there is no hook to write, so the install goes on.
  config(h, OFF);
  passed(install(repo, h));
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
  refused(applyBound(repo, h), /installed files or settings entries changed since the last install/);
  assert.deepEqual(json(h, CODEX), codex, 'nothing was written');
  for (const [text, says] of [['{ // a comment\n}', /\.codex\/hooks\.json is not a strict JSON object/], ['{"hooks": {"PreToolUse": 1}}', /is not the list the harness reads/]]) {
    const fresh = three(t);
    put(fresh, CODEX, text);
    refused(install(repo, fresh), says);
    assert.equal(readFileSync(at(fresh, CODEX), 'utf8'), text);
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
  assert.deepEqual(listed, [[CODEX, 'absent'], [AG, 'file']]);
  // The record names a hooks file under its entries, never its files.
  assert.deepEqual(record(h).files.filter(hooksFile), []);
  const undo = readFileSync(join(REPO, 'docs', 'install.md'), 'utf8').replaceAll('\r\n', '\n').split('\n## Undo an apply\n')[1].split('\n## ')[0];
  const rule = start => undo.split(/\n(?=   - |\d\. )/).find(b => b.startsWith(`   - ${start}`)).replace(/\s+/g, ' ');
  assert.match(rule('each path is under'),/hooks file \(`~\/\.codex\/hooks\.json`, `~\/\.gemini\/config\/hooks\.json`/);
  assert.match(rule('each `was: absent` path'), /a hooks file under its `entries`/);
});

test('bad case: a hooks path only the install record names is held to the same bound, under a harness that isn\'t found or that the install doesn\'t have', t => {
  const repo = makeRepo(t);
  // `codex` is a harness the pact knows and doesn't find here; `gone` is one of the owner's own, since dropped.
  for (const harness of ['codex', 'gone']) {
    const h = home(t);
    put(h, AG, { mine: MY_GROUP });
    config(h, ON);
    passed(applyBound(repo, h));
    assert.ok(!existsSync(join(h, '.codex')), 'Codex is not found here');
    const doc = record(h);
    doc.entries.push({ harness, path: '.ssh/hooks.json', key: 'guard.codex', value: { matcher: '^Bash$', hooks: [] }, sha256: '0'.repeat(64) });
    put(h, '.pact/install.json', doc);
    refused(install(repo, h), /unsafe path for a hooks file: \.ssh\/hooks\.json/);
  }
});

test('bad case: a commit that holds a guard table or an unknown guard file, or lacks one, installs nothing', t => {
  for (const [mutate, says] of [
    [root => writeFileSync(join(root, 'claude', 'guard', 'rules.json'), '{"rules": []}\n'), /guard-file-name/],
    [root => writeFileSync(join(root, 'claude', 'guard', 'other.mjs'), '// other\n'), /guard-file-name/],
    // A missing guard file is refused only where the guard installs.
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
  mkdirSync(join(linked, '.gemini', 'config'), { recursive: true });
  // The hooks file alone sits behind the link: an agent behind it would refuse first.
  symlinkSync(join(linked, 'elsewhere'), join(linked, '.gemini', 'hooks-link'), 'junction');
  config(linked, { ...ON, harnesses: { own: [{ id: 'antigravity', hooks: { file: '~/.gemini/hooks-link/hooks.json', format: 'antigravity' } }] } });
  refused(install(repo, linked), /path through a link for a hooks file: \.gemini\/hooks-link\/hooks\.json/);
  assert.deepEqual(readdirSync(join(linked, 'elsewhere')), []);
});

// The shell policy is the owner's: the install only removes the one line an older install wrote, and only when its record marks it.
const POLICY = '.codex/config.toml';
const POLICY_LINE = 'shell_environment_policy.ignore_default_excludes = false # the pact: secret-named variables stay out of the shells Codex starts';
/** A home that took Codex once, then a record that marks the line and a config.toml with `text`. */
function markedHome(t, repo, text) {
  const h = home(t);
  mkdirSync(at(h, '.codex'));
  config(h, { ...OFF, harnesses: { install: ['codex'] } });
  passed(applyBound(repo, h));
  put(h, '.pact/install.json', { ...record(h), shellPolicy: true });
  put(h, POLICY, text);
  return h;
}

test('shell policy: a recorded pact line is removed, the rest of config.toml is kept byte for byte and backed up, and the new record drops the mark', t => {
  const repo = makeRepo(t);
  const mine = '# mine\r\nmodel = "m"\r\n\r\n[history]\r\npersistence = "none"\r\n';
  const h = markedHome(t, repo, `${POLICY_LINE}\r\n${mine}`);
  const dry = install(repo, h);
  passed(dry);
  assert.match(dry.stdout, /^Codex shell policy: the pact's line would be removed; Codex's shells then get every variable$/m, dry.out);
  const applied = applyBound(repo, h);
  passed(applied);
  assert.match(applied.stdout, /^removed the pact's shell-policy line from \.codex\/config\.toml$/m, applied.out);
  assert.equal(readFileSync(at(h, POLICY), 'utf8'), mine);
  assert.ok(!('shellPolicy' in record(h)));
  const saved = readdirSync(at(h, '.pact/backups')).map(b => at(h, `.pact/backups/${b}/${POLICY}`)).filter(f => existsSync(f));
  assert.deepEqual(saved.map(f => readFileSync(f, 'utf8')), [`${POLICY_LINE}\r\n${mine}`]);
});

test('bad case: a recorded but edited pact line is left alone, with no drift stop and no warning', t => {
  const repo = makeRepo(t);
  const edited = `${POLICY_LINE.replace('= false', '= true')}\n[shell_environment_policy]\ninherit = "all"\n`;
  const h = markedHome(t, repo, edited);
  const r = applyBound(repo, h);
  passed(r);
  assert.doesNotMatch(r.stdout, /shell policy|WARN: Codex/i, r.out);
  assert.equal(readFileSync(at(h, POLICY), 'utf8'), edited);
});

test('shell policy: taking Codex with no mark in the record leaves config.toml, the exact pact line in it included, byte for byte, prints no shell policy line, and records no shellPolicy key', t => {
  const repo = makeRepo(t);
  const h = home(t);
  mkdirSync(at(h, '.codex'));
  config(h, { ...OFF, harnesses: { install: ['codex'] } });
  // Bad case: the very line an older install wrote, with no mark to say the pact wrote it.
  const text = `${POLICY_LINE}\n[history]\npersistence = "none"\n`;
  put(h, POLICY, text);
  const dry = install(repo, h);
  passed(dry);
  assert.doesNotMatch(dry.stdout, /shell policy/i, dry.out);
  passed(applyBound(repo, h));
  assert.equal(readFileSync(at(h, POLICY), 'utf8'), text);
  assert.ok(!('shellPolicy' in record(h)));
  // Bad case: a record now exists, and still says nothing of the line; the next run reads that as no mark, not as a mark that was never set to false.
  const again = install(repo, h);
  passed(again);
  assert.doesNotMatch(again.stdout, /shell policy/i, again.out);
  passed(applyBound(repo, h));
  assert.equal(readFileSync(at(h, POLICY), 'utf8'), text);
  assert.ok(!('shellPolicy' in record(h)));
});

// ------------------------------------------------------------ #PACT-122 #PACT-119 C8, C9, C12

const CLAUDE_SETTINGS = '.claude/settings.json';
const APP_PINS = {
  owner: { login: 'example-owner', id: 1000001 },
  apps: {
    claude: { app_id: 2000001, slug: 'example-owner-claude', bot_login: 'example-owner-claude[bot]', bot_id: 3000001 },
    codex: { app_id: 2000002, slug: 'example-owner-codex', bot_login: 'example-owner-codex[bot]', bot_id: 3000002 },
    antigravity: { app_id: 2000003, slug: 'example-owner-antigravity', bot_login: 'example-owner-antigravity[bot]', bot_id: 3000003 },
  },
};
const ALL_GUARD_FILES = [...(WIN ? ['antigravity.cmd', 'claude.cmd', 'codex.cmd'] : []), 'antigravity.mjs', 'claude.mjs', 'codex.mjs', 'guard.mjs', 'rules.json'].sort();

const asClaude = (hook, input, opts = {}) => spawnSync(hook.command, hook.args, {
  input: typeof input === 'string' ? input : JSON.stringify(input),
  encoding: 'utf8',
  cwd: opts.cwd,
  env: { ...process.env, PATH: `${dirname(process.execPath)}${WIN ? ';' : ':'}${process.env.PATH ?? ''}`, ...(opts.env ?? {}) },
});

async function seedIdentityHome(t, extraConfig = {}, extraLive = {}) {
  const { gitconfigText } = await import('../../claude/tools/gh-app.mjs');
  const h = home(t);
  const cfgText = gitconfigText({ home: h, nodePath: process.execPath, app: APP_PINS.apps.claude, provider: 'claude', xdg: false });
  put(h, '.pact/github.json', APP_PINS);
  put(h, '.pact/gh-app-claude.gitconfig', cfgText);
  if (Object.keys(extraLive).length) put(h, CLAUDE_SETTINGS, extraLive);
  config(h, { ...OFF, settings: { 'agent-identity': true, 'auto-compact-window': 0 }, ...extraConfig });
  return h;
}

function makeOwnerGitRepo(t) {
  const dir = join(home(t), 'owner-repo');
  mkdirSync(dir, { recursive: true });
  const r = spawnSync('git', ['init'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const r2 = spawnSync('git', ['remote', 'add', 'origin', 'https://github.com/example-owner/example-repo.git'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r2.status, 0, r2.stderr);
  return dir;
}

// #PACT-122 #PACT-119 C8, C9, C12
test('C8, C9, C12: three-harness identity apply installs all launchers and rules within caps, suppresses pin login prints, and invokes all three rendered hooks end-to-end', async t => {
  const repo = makeRepo(t);
  const h = await seedIdentityHome(t, { tools: ['cleaner', 'poster'] }, { permissions: { defaultMode: 'auto' } });
  put(h, CODEX, { hooks: { PreToolUse: [MINE] } });
  put(h, AG, { mine: MY_GROUP });

  const offHome = home(t);
  put(offHome, '.pact/config.json', { schema: 1, tools: ['cleaner', 'poster'], commands: [], settings: { 'agent-identity': false, 'auto-compact-window': 0 }, harnesses: { install: ['claude', 'codex', 'antigravity'] } });
  passed(applyBound(repo, offHome));
  const claudeOffRules = readFileSync(at(offHome, '.claude/CLAUDE.md'));

  const dry = install(repo, h);
  passed(dry);
  assert.match(dry.stdout, /^Guard rules \(\.pact\/guard\/rules\.json\): worktree-remove \(deny\), .*identity-gh \(deny\), identity-git \(overwrite-ask\/deny\)\r?$/m, dry.out);
  assert.match(dry.stdout, /^ {2}hook PreToolUse: added\r?$/m, dry.out);
  assert.doesNotMatch(dry.stdout, /example-owner-claude|example-owner-codex|example-owner-antigravity/, dry.out);

  const applied = applyBound(repo, h);
  passed(applied);
  assert.doesNotMatch(applied.stdout, /example-owner-claude|example-owner-codex|example-owner-antigravity/, applied.out);
  assert.deepEqual(guardFiles(h), ALL_GUARD_FILES);

  // Byte caps and zero Claude rules body drift across settings-env.
  const body = text => text.slice(text.indexOf('\n## The moves'));
  assert.equal(body(readFileSync(at(h, '.claude/CLAUDE.md'), 'utf8')), body(claudeOffRules.toString('utf8')));
  assert.ok(readFileSync(at(h, '.gemini/AGENTS.md')).length <= 24000);
  assert.ok(readFileSync(at(h, '.codex/AGENTS.md')).length <= 32768);
  assert.match(readFileSync(at(h, '.gemini/AGENTS.md'), 'utf8'), /--provider antigravity/);
  assert.match(readFileSync(at(h, '.codex/AGENTS.md'), 'utf8'), /--provider codex/);
  assert.doesNotMatch(readFileSync(at(h, '.claude/CLAUDE.md'), 'utf8'), /--provider/);

  const claudeSettings = json(h, CLAUDE_SETTINGS);
  assert.equal(claudeSettings.autoCompactWindow, undefined);
  const preGroup = claudeSettings.hooks.PreToolUse.find(g => g.matcher === 'Bash|PowerShell');
  assert.ok(preGroup, 'Claude PreToolUse group installed');
  const recHooks = record(h).entries.filter(e => e.path === CLAUDE_SETTINGS && e.key === 'hooks.PreToolUse');
  assert.equal(recHooks.length, 1);

  // Seed sibling provider gitconfigs and invoke every rendered launcher against an owner git repository.
  const { gitconfigText } = await import('../../claude/tools/gh-app.mjs');
  for (const p of ['codex', 'antigravity']) {
    put(h, `.pact/gh-app-${p}.gitconfig`, gitconfigText({ home: h, nodePath: process.execPath, app: APP_PINS.apps[p], provider: p, xdg: false }));
  }
  const ownerDir = makeOwnerGitRepo(t);
  const claudeHook = preGroup.hooks[0];
  const claudeEnv = { HOME: h, USERPROFILE: h, GIT_CONFIG_GLOBAL: `${h.replaceAll('\\', '/')}/.pact/gh-app-claude.gitconfig`, GIT_TERMINAL_PROMPT: '0' };
  const ghBlocked = asClaude(claudeHook, { tool_name: 'Bash', tool_input: { command: 'gh pr create -t test -b body' }, cwd: ownerDir }, { cwd: ownerDir, env: claudeEnv });
  assert.equal(ghBlocked.status, 0, ghBlocked.stderr);
  const ghParsed = JSON.parse(ghBlocked.stdout).hookSpecificOutput;
  assert.equal(ghParsed.permissionDecision, 'deny');
  assert.match(ghParsed.permissionDecisionReason, /poster\.mjs.*gh-app\.mjs" gh --provider claude/);
  const gitClean = asClaude(claudeHook, { tool_name: 'Bash', tool_input: { command: 'git commit -m ok' }, cwd: ownerDir }, { cwd: ownerDir, env: claudeEnv });
  assert.equal(gitClean.status, 0, gitClean.stderr);
  assert.equal(gitClean.stdout.trim(), '');

  const codexCmd = json(h, CODEX).hooks.PreToolUse.find(g => g.matcher === '^Bash$' && g.hooks?.[0]?.statusMessage === 'pact-guard').hooks[0].command;
  const codexOut = spawnSync(WIN ? 'powershell.exe' : '/bin/sh', WIN ? ['-NoProfile', '-Command', codexCmd] : ['-c', codexCmd], {
    input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', cwd: ownerDir, tool_input: { command: 'git commit -m ok' } }),
    encoding: 'utf8',
    env: { ...process.env, HOME: h, USERPROFILE: h, PATH: `${dirname(process.execPath)}${WIN ? ';' : ':'}${process.env.PATH ?? ''}` },
  });
  assert.equal(codexOut.status, 2, `${codexOut.stdout}${codexOut.stderr}`);
  assert.match(codexOut.stderr, /Plain git writes are blocked while agent-identity is on for codex/, codexOut.stderr);

  const agCmd = json(h, AG)['pact-guard'].PreToolUse[0].hooks[0].command;
  const agOut = spawnSync(WIN ? (process.env.ComSpec ?? 'cmd.exe') : '/bin/sh', WIN ? ['/d', '/s', '/c', `"${agCmd}"`] : ['-c', agCmd], {
    input: JSON.stringify({ toolCall: { name: 'run_command', args: { CommandLine: 'git commit -m ok', Cwd: ownerDir } } }),
    encoding: 'utf8',
    windowsVerbatimArguments: WIN,
    env: { ...process.env, HOME: h, USERPROFILE: h, PATH: `${dirname(process.execPath)}${WIN ? ';' : ':'}${process.env.PATH ?? ''}` },
  });
  assert.equal(agOut.status, 0, agOut.stderr);
  assert.equal(JSON.parse(agOut.stdout).decision, 'force_ask');

  // Re-running dry run is clean.
  assert.match(install(repo, h).stdout, /^Nothing to do\.\r?$/m);
});

// #PACT-122 #PACT-119 C8: Claude PreToolUse lifecycle stays independent of auto-compact-window, preserves user hooks, detects drift, writes before delete, and handles malformed live settings.
test('C8: Claude PreToolUse stays independent of auto-compact-window, refuses matcher drift, merges before delete, and keeps bad settings untouched', async t => {
  const repo = makeRepo(t);
  const ownerHook = { type: 'command', command: 'echo owner', timeout: 5 };
  const h = await seedIdentityHome(t, { settings: { 'agent-identity': true, 'auto-compact-window': 400000 } }, {
    permissions: { defaultMode: 'auto' },
    hooks: { PreToolUse: [{ matcher: 'Edit', hooks: [ownerHook] }] },
  });
  passed(applyBound(repo, h));
  const afterBoth = json(h, CLAUDE_SETTINGS);
  assert.ok(afterBoth.hooks.PreCompact && afterBoth.hooks.PreToolUse.length === 2);

  // Turning auto-compact-window off keeps PreToolUse and removes PreCompact.
  config(h, { ...OFF, settings: { 'agent-identity': true, 'auto-compact-window': 0 } });
  passed(applyBound(repo, h));
  const afterZeroWindow = json(h, CLAUDE_SETTINGS);
  assert.equal(afterZeroWindow.hooks.PreCompact, undefined);
  assert.equal(afterZeroWindow.hooks.PreToolUse.length, 2);

  // Changing the matcher triggers drift refusal on reinstall.
  afterZeroWindow.hooks.PreToolUse[1].matcher = 'Bash';
  put(h, CLAUDE_SETTINGS, afterZeroWindow);
  const driftRes = applyBound(repo, h);
  refused(driftRes, /installed files or settings entries changed/);
  assert.match(driftRes.out, /hooks\.PreToolUse/);

  // Repairing drift, then turning agent-identity off with compact on preserves compact hooks and user PreToolUse hook, and merges before deleting guard files.
  afterZeroWindow.hooks.PreToolUse[1].matcher = 'Bash|PowerShell';
  put(h, CLAUDE_SETTINGS, afterZeroWindow);
  config(h, { ...OFF, settings: { 'agent-identity': false, 'auto-compact-window': 400000 } });
  const offRes = applyBound(repo, h);
  passed(offRes);
  const mergedIdx = offRes.stdout.indexOf('merged settings.json');
  const deletedIdx = offRes.stdout.indexOf('deleted .pact/guard/claude.mjs');
  assert.ok(mergedIdx >= 0 && deletedIdx >= 0 && mergedIdx < deletedIdx, offRes.out);
  const afterIdOff = json(h, CLAUDE_SETTINGS);
  assert.ok(afterIdOff.hooks.PreCompact);
  assert.deepEqual(afterIdOff.hooks.PreToolUse, [{ matcher: 'Edit', hooks: [ownerHook] }]);
  assert.deepEqual(guardFiles(h), []);

  // Turning agent-identity back on when live hooks is an array refuses hooks-shape before writes.
  config(h, { ...OFF, settings: { 'agent-identity': true, 'auto-compact-window': 0 } });
  put(h, CLAUDE_SETTINGS, { permissions: { defaultMode: 'auto' }, hooks: [] });
  refused(install(repo, h), /hooks is not a JSON object/);

  // Turning agent-identity on when live settings is non-strict JSON warns and leaves settings untouched.
  const badHome = await seedIdentityHome(t);
  const corrupt = '{/* comment */ "permissions": {"defaultMode": "auto"}}';
  put(badHome, CLAUDE_SETTINGS, corrupt);
  const warnRes = install(repo, badHome);
  passed(warnRes);
  assert.match(warnRes.stdout, /WARN: settings\.json is not a strict JSON object/);
  assert.equal(readFileSync(at(badHome, CLAUDE_SETTINGS), 'utf8'), corrupt);
});
