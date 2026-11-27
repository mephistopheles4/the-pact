// The shared guard (spec 0007 S8): the rule table, the guard's matching, each
// harness's wrapper run through the rendered hook's exact command, the failures
// it answers closed (C12 to C14), and the hooks file merge (C16). The install
// that writes them is in guard-install.test.mjs. The script and wrappers under
// test are claude/guard/.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import * as core from '../install-core.mjs';
import { check } from '../seam-a-core.mjs';
import { REPO } from './text.mjs';
import { tempDir, writeTree } from './tree.mjs';

const WIN = process.platform === 'win32';
const guard = await import(pathToFileURL(join(REPO, 'claude', 'guard', 'guard.mjs')).href);
const ALL = core.guardRules(['cleaner']);

// ------------------------------------------------------------ the rule table

const both = patterns => [...patterns.map(p => `Bash(${p})`), ...patterns.map(p => `PowerShell(${p})`)];

test('C11: the permission rules made from the table are, for each switch, the same text as before the table', () => {
  assert.deepEqual([...core.CLEANER_DENY], both(['git worktree remove *', 'git * worktree remove *', 'git branch -d *', 'git * branch -d *', 'git branch -D *', 'git * branch -D *', 'git branch --delete *', 'git * branch --delete *', 'claude rm *']));
  assert.deepEqual([...core.CLEANER_ASK], both(['*cleaner.mjs*remove*--override*']));
});

test('a rule whose switch is off is not in the table; the rendered table reads back as its rules', () => {
  assert.deepEqual(core.guardRules([]), []);
  assert.deepEqual([...new Set(core.guardRules(['cleaner']).map(r => r.switch))], ['cleaner']);
  assert.equal(new Set(ALL.map(r => r.id)).size, core.GUARD_RULES.length);
  assert.deepEqual(guard.parseTable(core.guardTableText(ALL)), JSON.parse(JSON.stringify(ALL)));
  assert.deepEqual(guard.parseTable(core.guardTableText([])), []);
});

test('bad case: a table of any other shape is a table failure', () => {
  const good = { id: 'a', decision: 'deny', words: ['git'] };
  const bad = ['', '{', 'null', '[]', '{}', '{"rules": {}}', ...[
    null,
    { ...good, id: 'A B' },
    { ...good, id: undefined },
    { ...good, decision: 'allow' },
    { ...good, words: [] },
    { ...good, words: [''] },
    { ...good, words: ['*', 'git'] },
    { ...good, words: ['git', '*'] },
    { ...good, words: 'git' },
    { ...good, words: undefined },
    { ...good, contains: ['x'] },
    { id: 'a', decision: 'ask', contains: [1] },
  ].map(r => JSON.stringify({ rules: [r] }))];
  for (const text of bad) assert.throws(() => guard.parseTable(text), { code: 'table' }, text);
});

// ------------------------------------------------------------ matching

// One command per rule that it, and no earlier rule, denies or asks.
const ONE = {
  'worktree-remove': 'git worktree remove ../w',
  'worktree-remove-after-options': 'git -C /r worktree remove ../w',
  'branch-d': 'git branch -d old',
  'branch-d-after-options': 'git -C /r branch -d old',
  'branch-force-d': 'git branch -D old',
  'branch-force-d-after-options': 'git -c a=b branch -D old',
  'branch-delete': 'git branch --delete old',
  'branch-delete-after-options': 'git --no-pager branch --delete old',
  'session-remove': 'claude rm 1a2b',
  'cleaner-override': 'node ~/.pact/tools/cleaner.mjs remove w1 --override dirty',
};

test('each rule of the table is met by its command', () => {
  assert.deepEqual(Object.keys(ONE), core.GUARD_RULES.map(r => r.id));
  for (const r of core.GUARD_RULES) assert.deepEqual(guard.judge(ONE[r.id], ALL), { decision: r.decision, id: r.id }, ONE[r.id]);
});

test('a command behind quotes, wrappers, separators, paths or either shell\'s continuation is met', () => {
  for (const command of [
    'cd repo && git worktree remove w',
    'ls; git worktree remove w',
    'true || git worktree remove w',
    'ls | git worktree remove w',
    'ls & git worktree remove w',
    'ls\ngit worktree remove w',
    '"git" \'worktree\' remove w',
    'env -u NODE_OPTIONS git worktree remove w',
    'env --unset X -i git worktree remove w',
    'A=1 B=2 git worktree remove w',
    '$x = git worktree remove w',
    'time git worktree remove w',
    'call git worktree remove w',
    '& git worktree remove w',
    'timeout 30s git worktree remove w',
    'mise x -- git worktree remove w',
    'mise exec node@24 git worktree remove w',
    '/usr/bin/git worktree remove w',
    'C:\\tools\\Git\\git.exe worktree remove w',
    'GIT.EXE worktree remove w',
    'echo $(git worktree remove w)',
    '{ git worktree remove w; }',
    'git worktree \\\nremove w',
    'git worktree `\nremove w',
    'Set-Location "C:\\x\\"; git worktree remove w',
    "<# don't #> git worktree remove w",
    "# it's fine\ngit worktree remove w",
    "cat <<'EOF'\ntext\nEOF\ngit worktree remove w",
    'git worktree remove',
  ]) assert.equal(guard.judge(command, ALL)?.decision, 'deny', command);
  for (const command of ['npx claude rm 1', 'npx -y claude@2 rm 1', 'claude.cmd rm 1']) assert.equal(guard.judge(command, ALL)?.id, 'session-remove', command);
});

test('a command no rule matches gets no answer, words inside data included', () => {
  for (const command of [
    '',
    'git status',
    'git worktree list',
    'git worktree add ../w',
    'git branch -a',
    'git branch --list -dx',
    'legit worktree remove w',
    'git worktreeremove w',
    'echo git worktree remove w',
    'echo "git worktree remove w"',
    'git commit -m "x; git worktree remove w"',
    "git commit -F - <<'EOF'\ngit worktree remove w\nEOF",
    '$m = @"\nsay \\"\ngit worktree remove w\n"@',
    'ls # git worktree remove w',
    'claude rmx 1',
    'claude "stop the build"',
    'node cleaner.mjs show --override',
    'claude --bg "please stop here"',
  ]) assert.equal(guard.judge(command, ALL), null, command);
});

test('a deny anywhere beats an ask, and with a switch off its commands pass', () => {
  assert.deepEqual(guard.judge(`${ONE['cleaner-override']} && ${ONE['worktree-remove']}`, [...ALL].reverse()), { decision: 'deny', id: 'worktree-remove' }, 'with the ask ahead of the deny in the table');
  assert.equal(guard.judge(ONE['worktree-remove'], core.guardRules([])), null);
});

// PACT-116 C5
test('every guard rule hangs on the cleaner, and none stops, kills or respawns a session or the daemon', () => {
  assert.deepEqual([...new Set(core.GUARD_RULES.map(r => r.switch))], ['cleaner']);
  for (const command of ['claude stop 1a2b', 'claude kill 1a2b', 'claude daemon stop now', 'claude respawn 1a2b']) assert.equal(guard.judge(command, core.GUARD_RULES), null, command);
});

test('a long adversarial command is judged well inside the hook\'s timeout', () => {
  const started = Date.now();
  for (const unit of ['mise x ', 'git * ', 'git ', '<< a ', '@\' ', '(', '"', 'a; ', 'env -u ', 'x && ']) guard.judge(unit.repeat(Math.floor(guard.COMMAND_MAX / unit.length)), ALL);
  assert.ok(Date.now() - started < 12_000, `${Date.now() - started} ms for ten commands of the largest size`);
});

test('the hook command names its script by full path: the wrapper with NODE_OPTIONS cleared, and on Windows the launcher through cmd.exe', () => {
  assert.equal(core.guardCommand({ script: "/home/o'x/.pact/guard/codex.mjs", platform: 'linux' }), "env -u NODE_OPTIONS node '/home/o'\\''x/.pact/guard/codex.mjs'");
  // One text for cmd and PowerShell (S8): the launcher beside the wrapper, its exit code passed on.
  const win = 'C:\\Windows\\System32\\cmd.exe /d /c call "C:\\Users\\a b\\.pact\\guard\\codex.cmd" ; exit $LASTEXITCODE';
  for (const systemRoot of ['C:\\Windows', 'C:\\WINDOWS', 'c:\\windows\\', undefined]) assert.equal(core.guardCommand({ script: 'C:\\Users\\a b\\.pact\\guard\\codex.mjs', platform: 'win32', systemRoot }), win, String(systemRoot));
});

test('bad case: a path the hook command can\'t carry refuses', () => {
  const rule = args => {
    try {
      core.guardCommand(args);
    } catch (e) {
      return e.rule;
    }
    return null;
  };
  // `$`, the backtick and the curly double quotes are PowerShell's, inside double quotes too.
  for (const c of ['"', '%', '!', '^', '&', '|', '<', '>', '\n', '$', '`', '\u201c', '\u201d', '\u201e']) assert.equal(rule({ script: `C:\\Users\\a ${c}b\\g.mjs`, platform: 'win32' }), 'hook-command-path', JSON.stringify(c));
  // PowerShell passes a path with no space unquoted, and cmd then splits or misreads these.
  for (const c of ['(', ')', ';', ',', '=']) {
    assert.equal(rule({ script: `C:\\Users\\a${c}b\\g.mjs`, platform: 'win32' }), 'hook-command-path', JSON.stringify(c));
    assert.equal(rule({ script: `C:\\Users\\a ${c}b\\g.mjs`, platform: 'win32' }), null, `with a space: ${c}`);
  }
  assert.equal(rule({ script: 'guard\\g.mjs', platform: 'win32' }), 'hook-command-path');
  assert.equal(rule({ script: 'C:\\g.mjs', platform: 'win32', systemRoot: 'C:\\Win dows' }), 'hook-command-path');
  assert.equal(rule({ script: 'guard/g.mjs', platform: 'linux' }), 'hook-command-path');
  assert.equal(rule({ script: '/a\nb/g.mjs', platform: 'linux' }), 'hook-command-path');
});

// ------------------------------------------------------------ the wrappers, through the exact command

/** A guard folder as the install leaves it, under a home with a space, parentheses and a letter outside ASCII in its name. */
function installed(t, rules = ALL) {
  const home = join(tempDir(t, 'pact-guard-'), 'a (b) hom\u00e9');
  const dir = join(home, '.pact', 'guard');
  mkdirSync(dir, { recursive: true });
  for (const name of core.GUARD_SCRIPTS) copyFileSync(join(REPO, 'claude', 'guard', `${name}.mjs`), join(dir, `${name}.mjs`));
  writeFileSync(join(dir, 'rules.json'), core.guardTableText(rules));
  if (WIN) for (const format of core.GUARD_FORMATS) writeFileSync(join(dir, `${format}.cmd`), core.guardLauncherText(format));
  const cwd = join(home, 'work');
  mkdirSync(cwd);
  return { home, dir, cwd };
}

const tool = (name, args) => ({ toolCall: { name, args }, stepIdx: 1 });
const CALLS = {
  codex: command => ({ session_id: 's', cwd: '/w', hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_use_id: 'u', tool_input: { command } }),
  antigravity: command => tool('run_command', { CommandLine: command, Cwd: '/w' }),
};
const typed = Input => tool('manage_task', { Action: 'send_input', Input, TaskId: 't' });

/** Windows PowerShell by its full path, so a case may empty PATH. */
const POWERSHELL = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
/** The shell the cases run each harness's hook under on Windows: Windows PowerShell for Codex, whose own pwsh the shells case covers, and cmd for Antigravity. */
const SHELL = { codex: POWERSHELL, antigravity: 'cmd' };

/** The hook run as the harness runs it: the rendered command's exact text, through the platform's shell, the call on standard input. */
function runHook(at, format, stdin, { env = {}, shell = SHELL[format], path } = {}) {
  const command = core.guardCommand({ script: join(at.dir, `${format}.mjs`), platform: process.platform, systemRoot: process.env.SystemRoot });
  const base = {};
  for (const [k, v] of Object.entries(process.env)) if (!['path', 'node_options', 'nodefaultcurrentdirectoryinexepath'].includes(k.toLowerCase())) base[k] = v;
  base.PATH = path ?? [dirname(process.execPath), process.env.PATH ?? process.env.Path].join(delimiter);
  const options = { cwd: at.cwd, input: typeof stdin === 'string' ? stdin : JSON.stringify(stdin), encoding: 'utf8', env: { ...base, ...env }, timeout: 60_000 };
  const r = !WIN ? spawnSync('/bin/sh', ['-c', command], options)
    : shell === 'cmd' ? spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `"${command}"`], { ...options, windowsVerbatimArguments: true })
      : spawnSync(shell, ['-NoProfile', '-Command', command], options);
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

const SILENT = { code: 0, stdout: '', stderr: '' };
/** The answer in the harness's own deny shape, with `reason`. */
function denied(r, format, reason, decision = 'deny') {
  if (format === 'codex') {
    assert.equal(r.code, 2, JSON.stringify(r));
    assert.equal(r.stderr.trim(), reason, JSON.stringify(r));
    assert.equal(r.stdout, '');
  } else {
    assert.equal(r.code, 0, JSON.stringify(r));
    assert.deepEqual(JSON.parse(r.stdout), { decision, reason }, JSON.stringify(r));
  }
}
const ASK_CODEX = 'This needs the owner: ask them to run it in a terminal.';
const failure = code => `The pact's guard failed (${code}); run the pact's dry run.`;
const blocks = id => `The pact's guard blocks this command (rule ${id}).`;

for (const format of core.GUARD_FORMATS) {
  test(`C12, C13: ${format} answers each rule's command in its own shape, and nothing for another command`, t => {
    const at = installed(t);
    for (const r of core.GUARD_RULES) {
      const got = runHook(at, format, CALLS[format](ONE[r.id]));
      if (r.decision === 'deny') denied(got, format, blocks(r.id));
      else if (format === 'codex') denied(got, format, ASK_CODEX);
      else denied(got, format, `The pact's guard asks the owner before this command (rule ${r.id}).`, 'force_ask');
    }
    // The tokenizer's cases reach the guard whole through the hook: later lines, continuations, quotes.
    for (const command of ['ls\ngit worktree remove w', 'git worktree \\\nremove w', 'git worktree `\nremove w', "cat <<'EOF'\ntext\nEOF\ngit worktree remove w", '"git" \'worktree\' remove "w x"']) denied(runHook(at, format, CALLS[format](command)), format, blocks('worktree-remove'));
    for (const command of ['git status', 'git commit -m "x; git worktree remove w"', "git commit -F - <<'EOF'\ngit worktree remove w\nEOF"]) assert.deepEqual(runHook(at, format, CALLS[format](command)), SILENT, command);
  });

  test(`C14: ${format} denies, never allows, on a broken guard, table or call, and shows nothing of the call`, t => {
    const SECRET = 'SECRET_TOKEN_abc123';
    const call = CALLS[format](`git status ${SECRET}`);
    const check = (r, code) => {
      denied(r, format, failure(code));
      assert.doesNotMatch(`${r.stdout}${r.stderr}`, new RegExp(SECRET));
    };
    const at = installed(t);
    for (const bad of ['', `{ ${SECRET}`]) check(runHook(at, format, bad), 'input');
    const other = format === 'codex' ? 'antigravity' : 'codex';
    for (const bad of [null, {}, CALLS[other](`git worktree remove ${SECRET}`), JSON.parse(JSON.stringify(call).replace(/"(Bash|run_command)"/, '"other"')), CALLS[format](['git', SECRET])]) check(runHook(at, format, JSON.stringify(bad)), 'call');
    check(runHook(at, format, CALLS[format](`${SECRET} ${'x'.repeat(guard.COMMAND_MAX)}`)), 'size');
    check(runHook(at, format, `${SECRET}${' '.repeat(9 * 1024 * 1024)}`), 'size');

    const table = join(at.dir, 'rules.json');
    writeFileSync(table, `{"rules": [${SECRET}`);
    check(runHook(at, format, call), 'table');
    rmSync(table);
    check(runHook(at, format, call), 'table');
    writeFileSync(table, core.guardTableText(ALL));

    const script = join(at.dir, 'guard.mjs');
    const plant = (text, code) => {
      writeFileSync(script, text);
      check(runHook(at, format, call), code);
    };
    plant(`export function answer( ${SECRET}`, 'guard');
    plant(`throw new Error('${SECRET}');`, 'guard');
    plant(`export function answer() { throw new Error('${SECRET}'); }`, 'internal');
    plant(`export function answer() { throw Object.assign(new Error('x'), { code: '${SECRET}' }); }`, 'internal');
    plant(`export function answer() { return { decision: '${SECRET}' }; }`, 'internal');
    plant(`export function answer() { process.nextTick(() => { throw new Error('${SECRET}'); }); return null; }`, 'internal');
    plant(`export function answer() { Promise.reject(new Error('${SECRET}')); return null; }`, 'internal');
    rmSync(script);
    check(runHook(at, format, call), 'guard');
  });

  test(`C14: ${format} still denies with an inherited NODE_OPTIONS that would crash node`, t => {
    const at = installed(t);
    const env = { NODE_OPTIONS: `--require=${join(at.home, 'missing.cjs')}` };
    const bare = spawnSync(process.execPath, ['-e', '0'], { env: { ...process.env, ...env }, encoding: 'utf8' });
    assert.notEqual(bare.status, 0, 'the planted option does crash node');
    denied(runHook(at, format, CALLS[format](ONE['worktree-remove']), { env }), format, blocks('worktree-remove'));
    denied(runHook(at, format, '{', { env }), format, failure('input'));
  });
}

test('C12: antigravity judges a line typed into a running program as it judges a command', t => {
  const at = installed(t, ALL);
  const run = call => runHook(at, 'antigravity', call);
  denied(run(typed('git worktree remove w\n')), 'antigravity', blocks('worktree-remove'));
  denied(run(typed('ls\ngit branch -D old\n')), 'antigravity', blocks('branch-force-d'));
  denied(run(typed('node cleaner.mjs remove --override x\n')), 'antigravity', `The pact's guard asks the owner before this command (rule cleaner-override).`, 'force_ask');
  assert.deepEqual(run(typed('git status\n')), SILENT);
  denied(run(tool('send_command_input', { CommandId: 'c', Input: 'git worktree remove w\n' })), 'antigravity', blocks('worktree-remove'));
  // The actions agy lists that type nothing get no answer, whatever else they carry.
  for (const Action of ['list', 'status', 'kill']) assert.deepEqual(run(tool('manage_task', { Action, TaskId: 't', Input: 'git worktree remove w' })), SILENT, Action);
});

test('bad case: antigravity denies a typed line it cannot judge, and a read tool it no longer meets', t => {
  const at = installed(t, ALL);
  for (const call of [tool('manage_task', {}), tool('manage_task', { Action: 1 }), tool('manage_task', { Action: 'Send_Input', Input: 'ls' }), tool('manage_task', { Action: 'write', TaskId: 't' }), tool('manage_task', { Action: 'send_input' }), tool('manage_task', { Action: 'send_input', Input: ['x'] }), tool('view_file', { AbsolutePath: '/x' }), tool('read_file', { Path: '/x' }), tool('send_command_input', { CommandId: 'c' }), tool('write_to_file', { TargetFile: 'x' })]) {
    denied(runHook(at, 'antigravity', call), 'antigravity', failure('call'));
  }
  denied(runHook(at, 'antigravity', typed('x'.repeat(guard.COMMAND_MAX + 1))), 'antigravity', failure('size'));
  rmSync(join(at.dir, 'rules.json'));
  denied(runHook(at, 'antigravity', typed('ls\n')), 'antigravity', failure('table'));
});

test('C12: on Windows a node or cmd planted in the working folder never runs', { skip: !WIN && 'cmd.exe\'s current-folder lookup is Windows\'s' }, t => {
  const at = installed(t);
  const marker = join(at.cwd, 'planted.txt');
  // The planted file names the marker beside itself: cmd would misread the home's letter outside ASCII.
  for (const name of ['node.cmd', 'node.bat', 'cmd.cmd', 'cmd.bat']) writeFileSync(join(at.cwd, name), '@echo ran> "%~dp0planted.txt"\r\n');
  denied(runHook(at, 'codex', CALLS.codex(ONE['worktree-remove'])), 'codex', blocks('worktree-remove'));
  assert.equal(existsSync(marker), false, 'nothing planted ran');
  // Without the defence a bare node in that folder is the planted one, so this test can fail.
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.toLowerCase() === 'nodefaultcurrentdirectoryinexepath') delete env[k];
  spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/c', 'node -e 0'], { cwd: at.cwd, env });
  assert.equal(existsSync(marker), true, 'the planted node runs when nothing stops it');
});

const winOnly = { skip: !WIN && 'the launcher is Windows\'s' };

test('C12: on Windows each shell a harness may use passes the wrapper\'s answer on', winOnly, t => {
  const at = installed(t);
  assert.equal(spawnSync('pwsh.exe', ['-NoProfile', '-Command', 'exit 0']).status, 0, 'this test needs PowerShell 7 (pwsh.exe) on PATH');
  // The other tests run each format under its harness's own shell; here, every other one.
  for (const format of core.GUARD_FORMATS) {
    for (const shell of ['cmd', POWERSHELL, 'pwsh.exe'].filter(s => s !== SHELL[format])) {
      denied(runHook(at, format, CALLS[format](ONE['worktree-remove']), { shell }), format, blocks('worktree-remove'));
      assert.deepEqual(runHook(at, format, CALLS[format]('git status'), { shell }), SILENT, `${shell} ${format}`);
    }
  }
});

test('C14: on Windows a launcher whose wrapper can\'t run, or ends any other way, denies', winOnly, t => {
  const at = installed(t);
  // No node on PATH, with an inherited ERRORLEVEL that would read as success.
  const none = { path: join(process.env.SystemRoot, 'System32'), env: { ERRORLEVEL: '0' } };
  const crashes = () => {
    for (const format of core.GUARD_FORMATS) writeFileSync(join(at.dir, `${format}.mjs`), 'process.exit(1);\n');
    return { env: { ERRORLEVEL: '0' } };
  };
  for (const how of [() => none, crashes]) {
    const options = how();
    for (const format of core.GUARD_FORMATS) {
      const r = runHook(at, format, CALLS[format]('git status SECRET_TOKEN_abc123'), options);
      assert.doesNotMatch(`${r.stdout}${r.stderr}`, /SECRET_TOKEN_abc123/, 'nothing of the call is shown');
      // cmd may print its own line above the launcher's, so the reason is the last one.
      if (format === 'codex') assert.deepEqual([r.code, r.stderr.trim().split(/\r?\n/).at(-1)], [2, failure('launch')], JSON.stringify(r));
      else denied(r, format, failure('launch'));
    }
  }
});

// ------------------------------------------------------------ the hooks file merge

const COMMAND = "env -u NODE_OPTIONS node '/home/u/.pact/guard/codex.mjs'";
const want = (format, command = COMMAND) => ({ format, group: core.guardGroup(format, command) });
const read = text => core.readSettings(text);
const shown = m => JSON.parse(core.settingsText(m));
const OWNER = { matcher: '^Bash$', hooks: [{ type: 'command', command: 'echo mine', timeout: 5 }] };
const entry = (command, extra = { statusMessage: 'pact-guard' }) => ({ matcher: '^Bash$', hooks: [{ type: 'command', command, timeout: 15, ...extra }] });

test('C16: the merge adds the pact\'s group beside the person\'s, in each harness\'s shape, with a 15 s timeout', () => {
  const codex = core.guardMerge(read(JSON.stringify({ description: 'd', hooks: { PreToolUse: [OWNER], Stop: [OWNER] } })), { want: [want('codex')] });
  assert.deepEqual(shown(codex.merged), { description: 'd', hooks: { PreToolUse: [OWNER, entry(COMMAND)], Stop: [OWNER] } });
  assert.deepEqual([codex.changed, codex.added], [true, ['codex']]);
  const ag = core.guardMerge(read('{"lint": {"PostToolUse": []}}'), { want: [want('antigravity', 'x')] });
  assert.deepEqual(shown(ag.merged), { lint: { PostToolUse: [] }, 'pact-guard': { PreToolUse: [{ matcher: 'run_command|manage_task|send_command_input', hooks: [{ type: 'command', command: 'x', timeout: 15 }] }] } });
  assert.deepEqual(shown(core.guardMerge(new Map(), { want: [want('codex')] }).merged), { hooks: { PreToolUse: [entry(COMMAND)] } });
});

test('C15, C16: a merge over its own result changes nothing; a changed command is replaced where it sat', () => {
  const first = core.guardMerge(read(JSON.stringify({ hooks: { PreToolUse: [OWNER] } })), { want: [want('codex')] });
  const again = core.guardMerge(first.merged, { drop: [want('codex')], want: [want('codex')] });
  assert.deepEqual([again.changed, again.added], [false, []]);
  // A hook the person put inside the pact's group stays there, and the pact's entry is not new.
  const inside = { matcher: '^Bash$', hooks: [entry(COMMAND).hooks[0], { type: 'command', command: 'echo inside' }] };
  const shared = core.guardMerge(read(JSON.stringify({ hooks: { PreToolUse: [inside, OWNER] } })), { drop: [want('codex')], want: [want('codex')] });
  assert.deepEqual([shared.changed, shared.added, shared.warnings], [false, [], []]);
  // Held twice, or under another matcher, it is not in place: one group under the pact's matcher, and new.
  for (const list of [[entry(COMMAND), entry(COMMAND)], [{ ...entry(COMMAND), matcher: 'x' }]]) {
    const fixed = core.guardMerge(read(JSON.stringify({ hooks: { PreToolUse: list } })), { drop: [want('codex')], want: [want('codex')] });
    assert.deepEqual([shown(fixed.merged).hooks.PreToolUse, fixed.added], [[entry(COMMAND)], ['codex']], JSON.stringify(list));
  }
  const moved = shown(first.merged);
  moved.hooks.PreToolUse.push(OWNER);
  const next = core.guardMerge(read(JSON.stringify(moved)), { drop: [want('codex')], want: [want('codex', 'new')] });
  assert.deepEqual(shown(next.merged).hooks.PreToolUse, [OWNER, entry('new'), OWNER]);
  assert.deepEqual(next.added, ['codex']);
});

test('C16: removing takes only the pact\'s hook, and the keys the removal emptied', () => {
  const shared = { matcher: '^Bash$', hooks: [...OWNER.hooks, entry(COMMAND).hooks[0]] };
  const kept = core.guardMerge(read(JSON.stringify({ hooks: { PreToolUse: [shared] } })), { drop: [want('codex')] });
  assert.deepEqual(shown(kept.merged), { hooks: { PreToolUse: [OWNER] } });
  const alone = core.guardMerge(read(JSON.stringify({ x: 1, hooks: { PreToolUse: [entry(COMMAND)] } })), { drop: [want('codex')] });
  assert.deepEqual(shown(alone.merged), { x: 1 });
  assert.deepEqual(alone.added, []);
  const ag = core.guardMerge(core.guardMerge(new Map(), { want: [want('antigravity')] }).merged, { drop: [want('antigravity')] });
  assert.deepEqual(shown(ag.merged), {});
  // Nothing of the pact's there, or a list of another shape: nothing changes.
  for (const text of ['{}', '{"hooks": {"PreToolUse": "x"}}', JSON.stringify({ hooks: { PreToolUse: [OWNER] } })]) assert.equal(core.guardMerge(read(text), { drop: [want('codex')] }).changed, false, text);
});

test('bad case: a hook can\'t go into a PreToolUse of another shape; a look-alike and a switched-off group draw a warning', () => {
  for (const text of ['{"hooks": []}', '{"hooks": {"PreToolUse": {}}}']) assert.throws(() => core.guardMerge(read(text), { want: [want('codex')] }), { rule: 'hooks-shape' }, text);
  const mine = entry(COMMAND, { statusMessage: 'pact-guard', async: true });
  const near = core.guardMerge(read(JSON.stringify({ hooks: { PreToolUse: [mine] } })), { want: [want('codex')] });
  assert.deepEqual(shown(near.merged).hooks.PreToolUse, [mine, entry(COMMAND)]);
  assert.match(near.warnings.join('\n'), /another hook there names the pact's codex\.mjs/);
  const off = core.guardMerge(read('{"pact-guard": {"enabled": false}}'), { want: [want('antigravity')] });
  assert.match(off.warnings.join('\n'), /runs unguarded/);
  assert.equal(shown(off.merged)['pact-guard'].enabled, false);
});

test('a recorded hook is found in the live file, and a changed or removed one is drift', () => {
  const [plan] = core.guardPlans([], [{ harness: 'codex', path: '.codex/hooks.json', format: 'codex', command: COMMAND }]);
  const merged = core.guardMerge(new Map(), plan).merged;
  // The entries as the record keeps them: written as JSON and read back.
  const recorded = JSON.parse(core.recordText({ commit: 'c', digest: null, harnesses: [], userHash: null, blockHashes: new Map(), files: new Map(), entries: core.guardEntries(plan, () => 'h'), gateNow: new Map() }));
  const { entries } = core.parseRecord(JSON.stringify(recorded));
  assert.deepEqual(entries, [{ harness: 'codex', path: '.codex/hooks.json', key: 'guard.codex', value: entry(COMMAND), sha256: 'h' }]);
  const [last] = core.guardPlans(entries, []);
  assert.deepEqual(core.guardDrift(last, merged), []);
  for (const text of ['{}', JSON.stringify({ hooks: { PreToolUse: [entry('other')] } }), JSON.stringify({ hooks: { PreToolUse: [{ ...entry(COMMAND), matcher: 'x' }] } })]) assert.equal(core.guardDrift(last, read(text)).length, 1, text);
});

test('bad case: the install writes a hooks file only at a plain path outside the neutral home, through no link', () => {
  const none = () => false;
  assert.equal(core.guardPathReason('.codex/hooks.json', none), null);
  for (const rel of ['../x.json', '/etc/x.json', '.pact/hooks.json', '.PACT/x.json', 'a\\b.json', 'C:/x.json', '.codex/auth.json', '.ssh/hooks.json', '.codex/config.toml']) assert.equal(core.guardPathReason(rel, none), 'unsafe path', rel);
  assert.equal(core.guardPathReason('.codex/hooks.json', () => true), 'path through a link');
});

// ------------------------------------------------------------ seam A's guard part

const seam = (t, files, harness) => {
  const root = tempDir(t, 'pact-seam-');
  writeTree(root, files);
  return check([root, '--commands', 'none', '--tools', 'none', '--compact', 'off', '--harness', harness]).lines;
};
const GUARD_STAGE = Object.fromEntries(core.GUARD_SCRIPTS.map(n => [`claude/guard/${n}.mjs`, '// x\n']));
const guardFails = lines => lines.filter(l => /\bguard-(path|file-name|not-in-pact)\b/.test(l)).map(l => /guard-(path|file-name|not-in-pact)/.exec(l)[0]);

test('bad case: seam A refuses a guard file it does not list, one in a subfolder, and a missing one while a harness takes the guard', t => {
  assert.deepEqual(guardFails(seam(t, GUARD_STAGE, 'codex:guard')), []);
  assert.deepEqual(guardFails(seam(t, { ...GUARD_STAGE, 'claude/guard/other.mjs': 'x\n' }, 'none')), ['guard-file-name']);
  assert.deepEqual(guardFails(seam(t, { ...GUARD_STAGE, 'claude/guard/rules.json': '{}\n' }, 'none')), ['guard-file-name']);
  assert.deepEqual(guardFails(seam(t, { ...GUARD_STAGE, 'claude/guard/sub/guard.mjs': 'x\n' }, 'none')), ['guard-path']);
  const { 'claude/guard/codex.mjs': _, ...short } = GUARD_STAGE;
  assert.deepEqual(guardFails(seam(t, short, 'codex:guard')), ['guard-not-in-pact']);
  assert.deepEqual(guardFails(seam(t, short, 'codex:none')), []);
});

// ------------------------------------------------------------ PACT-120: identity guard core (Spec 0009 S3)

function makePinFixture(t, { apps = { codex: { app_id: 11, slug: 'my-codex-app', bot_login: 'my-codex-app[bot]', bot_id: 22 }, antigravity: { app_id: 12, slug: 'my-ag-app', bot_login: 'my-ag-app[bot]', bot_id: 23 }, claude: { app_id: 13, slug: 'my-claude-app', bot_login: 'my-claude-app[bot]', bot_id: 24 } }, owner = { login: 'OwnerLogin', id: 99 }, withGitconfigs = ['codex', 'antigravity', 'claude'] } = {}) {
  const home = tempDir(t, 'pact-id-');
  const pactDir = join(home, '.pact');
  const guardDir = join(pactDir, 'guard');
  mkdirSync(guardDir, { recursive: true });
  const tableFile = join(guardDir, 'rules.json');
  const pinFile = join(pactDir, 'github.json');
  writeFileSync(tableFile, JSON.stringify({ rules: ALL, identity: { enabled: true, posterOn: true } }));
  writeFileSync(pinFile, JSON.stringify({ owner, apps }));
  for (const p of withGitconfigs) writeFileSync(join(pactDir, `gh-app-${p}.gitconfig`), '[credential]\n\thelper = ""\n');
  return { home, pactDir, guardDir, tableFile, pinFile };
}

function makeGitRepo(t, { remoteUrl = 'https://github.com/OwnerLogin/my-repo.git', extraConfig = '', worktreeConfig = null, linked = false } = {}) {
  const root = tempDir(t, 'pact-repo-');
  const work = join(root, 'repo');
  mkdirSync(work, { recursive: true });
  const baseCfg = `${remoteUrl ? `[remote "origin"]\n\turl = ${remoteUrl}\n` : ''}${extraConfig}`;
  if (!linked) {
    mkdirSync(join(work, '.git'));
    writeFileSync(join(work, '.git', 'config'), baseCfg);
  } else {
    const common = join(root, 'main-git');
    const wt = join(common, 'worktrees', 'wt1');
    mkdirSync(wt, { recursive: true });
    writeFileSync(join(work, '.git'), `gitdir: ${wt}\n`);
    writeFileSync(join(wt, 'commondir'), '../..\n');
    writeFileSync(join(common, 'config'), baseCfg);
    if (worktreeConfig !== null) writeFileSync(join(wt, 'config.worktree'), worktreeConfig);
  }
  return { root, work };
}

// #PACT-120 #PACT-119 C1
test('C1: parseTableDoc validates optional identity block strictly while parseTable stays backwards-compatible', () => {
  const baseRules = JSON.parse(JSON.stringify(ALL));
  const plain = JSON.stringify({ rules: baseRules });
  const withId = JSON.stringify({ rules: baseRules, identity: { enabled: true, posterOn: false } });
  assert.deepEqual(guard.parseTableDoc(plain), { rules: baseRules, identity: null });
  assert.deepEqual(guard.parseTableDoc(withId), { rules: baseRules, identity: { enabled: true, posterOn: false } });
  assert.deepEqual(guard.parseTable(withId), baseRules);

  const badDocs = [
    '[]',
    'null',
    JSON.stringify({ rules: baseRules, extra: 1 }),
    JSON.stringify({ identity: { enabled: true, posterOn: true } }),
    JSON.stringify({ rules: [{ id: 'bad', decision: 'allow', words: ['git'] }], identity: { enabled: true, posterOn: true } }),
    JSON.stringify({ rules: baseRules, identity: null }),
    JSON.stringify({ rules: baseRules, identity: [] }),
    JSON.stringify({ rules: baseRules, identity: {} }),
    JSON.stringify({ rules: baseRules, identity: { enabled: true } }),
    JSON.stringify({ rules: baseRules, identity: { enabled: false, posterOn: true } }),
    JSON.stringify({ rules: baseRules, identity: { enabled: true, posterOn: 'yes' } }),
    JSON.stringify({ rules: baseRules, identity: { enabled: true, posterOn: true, extra: 1 } }),
  ];
  for (const text of badDocs) assert.throws(() => guard.parseTableDoc(text), { code: 'table' }, text);
  assert.throws(() => guard.answerCall({ command: 'ls', provider: 'codex', shell: 'zsh' }), { code: 'call' });
});

// #PACT-120 #PACT-119 C2
test('C2: runtime pin gate reads lazily relative to tableFile and enforces readPin schema plus gitconfig file checks', async t => {
  const { symlinkSync } = await import('node:fs');
  const fx = makePinFixture(t);
  const repo = makeGitRepo(t);

  // Disabled identity passes through even if pin is corrupt.
  const offTable = join(fx.guardDir, 'rules-off.json');
  writeFileSync(offTable, JSON.stringify({ rules: ALL }));
  writeFileSync(fx.pinFile, '{corrupt');
  assert.equal(guard.answerCall({ command: 'gh pr create -t x -b y', provider: 'codex', cwd: repo.work, canOverwrite: false, env: {}, tableFile: offTable }), null);

  // Lazy read: non-candidate commands pass without reading corrupt pin (including claude non-candidate commands).
  for (const cmd of ['ls -la', 'git status', 'git --version', 'git --help', 'node fix.mjs']) {
    assert.equal(guard.answerCall({ command: cmd, provider: 'codex', cwd: repo.work, canOverwrite: false, env: {}, tableFile: fx.tableFile }), null, cmd);
    assert.equal(guard.answerCall({ command: cmd, provider: 'claude', cwd: repo.work, canOverwrite: false, env: {}, tableFile: fx.tableFile }), null, `claude:${cmd}`);
  }

  // Candidate commands fail closed on corrupt, BOM, oversize, non-file URL, or schema-invalid pin (including claude git writes).
  assert.throws(() => guard.answerCall({ command: 'gh pr create -t x -b y', provider: 'codex', cwd: repo.work, canOverwrite: false, env: {}, tableFile: fx.tableFile }), { code: 'pin' });
  assert.throws(() => guard.answerCall({ command: 'git commit -m x', provider: 'codex', cwd: repo.work, canOverwrite: false, env: {}, tableFile: fx.tableFile }), { code: 'pin' });
  assert.throws(() => guard.answerCall({ command: 'git commit -m x', provider: 'claude', cwd: repo.work, canOverwrite: false, env: {}, tableFile: fx.tableFile }), { code: 'pin' });
  assert.throws(() => guard.answerCall({ command: 'env -S "ls"', provider: 'codex', cwd: repo.work, canOverwrite: false, env: {}, tableFile: fx.tableFile }), { code: 'pin' });

  const goodPin = { owner: { login: 'OwnerLogin', id: 99 }, apps: { codex: { app_id: 11, slug: 'my-codex-app', bot_login: 'my-codex-app[bot]', bot_id: 22 } } };
  const badPins = [
    `\ufeff${JSON.stringify(goodPin)}`,
    `${JSON.stringify(goodPin)}${' '.repeat(65537)}`,
    JSON.stringify({ ...goodPin, extra: 1 }),
    JSON.stringify({ owner: { login: 123, id: 99 }, apps: goodPin.apps }),
    JSON.stringify({ owner: { login: 'OwnerLogin', id: 0 }, apps: goodPin.apps }),
    JSON.stringify({ owner: { login: '-bad', id: 99 }, apps: goodPin.apps }),
    JSON.stringify({ owner: goodPin.owner, apps: { other: goodPin.apps.codex } }),
    JSON.stringify({ owner: goodPin.owner, apps: { codex: { app_id: 11, slug: 'BadCase', bot_login: 'BadCase[bot]', bot_id: 22 } } }),
    JSON.stringify({ owner: goodPin.owner, apps: { codex: { app_id: 11, slug: 'my-codex-app', bot_login: 'wrong[bot]', bot_id: 22 } } }),
    JSON.stringify({ owner: goodPin.owner, apps: { codex: { app_id: 11, slug: 'my-codex-app', bot_login: 'my-codex-app[bot]', bot_id: 22, extra: 1 } } }),
  ];
  for (const text of badPins) {
    writeFileSync(fx.pinFile, text);
    assert.throws(() => guard.answerCall({ command: 'git commit -m x', provider: 'codex', cwd: repo.work, canOverwrite: false, env: {}, tableFile: fx.tableFile }), { code: 'pin' });
  }
  assert.throws(() => guard.answerCall({ command: 'git commit -m x', provider: 'codex', cwd: repo.work, canOverwrite: false, env: {}, tableFile: fx.tableFile, pinFile: new URL('https://example.com/p.json') }), { code: 'pin' });

  // Symlink/junction pin fails closed with pin.
  rmSync(fx.pinFile);
  const pinTarget = join(fx.home, 'real.json');
  writeFileSync(pinTarget, JSON.stringify(goodPin));
  try {
    symlinkSync(pinTarget, fx.pinFile, 'file');
  } catch (e) {
    if (e.code !== 'EPERM') throw e;
    symlinkSync(join(fx.home, 'gone'), fx.pinFile, 'junction');
  }
  assert.throws(() => guard.answerCall({ command: 'git commit -m x', provider: 'codex', cwd: repo.work, canOverwrite: false, env: {}, tableFile: fx.tableFile }), { code: 'pin' });

  // Absent pinFile (ENOENT) passes through, and unpinned provider passes through.
  rmSync(fx.pinFile);
  assert.equal(guard.answerCall({ command: 'gh pr create -t x -b y', provider: 'codex', cwd: repo.work, canOverwrite: false, env: {}, tableFile: fx.tableFile }), null);
  writeFileSync(fx.pinFile, JSON.stringify(goodPin));
  assert.equal(guard.answerCall({ command: 'gh pr create -t x -b y', provider: 'antigravity', cwd: repo.work, canOverwrite: false, env: {}, tableFile: fx.tableFile }), null);

  // Missing or symlinked/junctioned gitconfig denies with identity-gitconfig BEFORE accepting GIT_CONFIG_GLOBAL.
  const cfgPath = join(fx.pactDir, 'gh-app-codex.gitconfig');
  rmSync(cfgPath);
  const envWithCfg = { GIT_CONFIG_GLOBAL: cfgPath.replaceAll('\\', '/'), HOME: fx.home };
  const missingRes = guard.answerCall({ command: 'git commit -m x', provider: 'codex', cwd: repo.work, canOverwrite: false, env: envWithCfg, tableFile: fx.tableFile });
  assert.equal(missingRes?.id, 'identity-gitconfig');
  assert.match(missingRes.reason, /"\$HOME\/\.pact\/tools\/gh-app\.mjs" setup --provider codex/);
  const realCfg = join(fx.home, 'real.gitconfig');
  writeFileSync(realCfg, '[user]\n');
  try {
    symlinkSync(realCfg, cfgPath, 'file');
  } catch (e) {
    if (e.code !== 'EPERM') throw e;
    symlinkSync(join(fx.home, 'gone'), cfgPath, 'junction');
  }
  const symRes = guard.answerCall({ command: 'git commit -m x', provider: 'codex', cwd: repo.work, canOverwrite: false, env: envWithCfg, tableFile: fx.tableFile });
  assert.equal(symRes?.id, 'identity-gitconfig');
  rmSync(cfgPath);
  mkdirSync(cfgPath);
  const dirRes = guard.answerCall({ command: 'git commit -m x', provider: 'codex', cwd: repo.work, canOverwrite: false, env: envWithCfg, tableFile: fx.tableFile });
  assert.equal(dirRes?.id, 'identity-gitconfig');
});

// #PACT-120 #PACT-119 C3
test('C3: Step 1 explicit repo-owner scoping handles gh, gh api, GH_REPO, git push, URLs, and prose-flag safety', t => {
  const fx = makePinFixture(t);
  const ownerRepo = makeGitRepo(t, { remoteUrl: 'https://github.com/OwnerLogin/own.git' });
  const call = (command, { provider = 'codex', cwd = ownerRepo.work, env = { HOME: fx.home }, platform = process.platform, shell } = {}) =>
    guard.answerCall({ command, provider, cwd, canOverwrite: false, env, tableFile: fx.tableFile, platform, shell });

  // Stranger targets exempt; owner targets (case-insensitive) guard.
  for (const cmd of [
    'gh pr create -R Stranger/repo -t x -b y',
    'gh pr create -RStranger/repo -t x -b y',
    'gh pr create --repo=ghes.example.com/OwnerLogin/repo -t x -b y',
    'gh pr merge https://github.com/Stranger/repo/pull/1',
    'gh pr merge https://github.com/Stranger/repo/',
    'gh pr merge https://ghes.internal:443/OwnerLogin/repo/pull/1',
    'gh api -h',
    'gh api repos/Stranger/repo/issues -f title=hi',
    'gh api repos/Stranger/repo/issues?state=open#top -X POST',
    'gh api --hostname ghes.example.com /graphql -f query="mutation { x }"',
    'gh repo delete Stranger/repo --yes',
    'gh repo create StrangerOrg/new-repo --public',
    'gh repo fork Stranger/repo --org StrangerOrg',
    'gh project item-add 1 --owner StrangerOrg --url x',
    'GH_REPO=Stranger/repo gh pr create -t x -b y',
    'export GH_REPO=Stranger/repo; gh pr create -t x -b y',
    '$env:GH_REPO = "Stranger/repo"; gh pr create -t x -b y',
    'git push https://github.com/Stranger/repo.git main',
    'git push ssh://git@github.com:22/Stranger/repo.git main',
    'git push git@github.com:Stranger/repo.git main',
    'git push git@github.com:Stranger/repo/ main',
    'git push --repo=https://github.com/OwnerLogin/own.git https://github.com/Stranger/repo.git main',
  ]) assert.equal(call(cmd), null, cmd);

  for (const cmd of [
    'gh pr create -R ownerlogin/repo -t x -b y',
    'gh pr create -R sub.github.com/OwnerLogin/repo -t x -b y',
    'gh pr create --hostname ghes.example.com -R github.com/OwnerLogin/repo -t x -b y',
    'gh pr create --repo=https://@github.com/OwnerLogin/repo -t x -b y',
    'gh pr create --repo=https://a@b@github.com/OwnerLogin/repo -t x -b y',
    'gh pr create -t "-R Stranger/repo" -b y',
    'gh pr create -t hi -R Stranger/repo',
    'gh pr create --draft https://github.com/Stranger/repo/pull/1',
    'gh label create bug https://github.com/Stranger/repo',
    'gh issue transfer https://github.com/Stranger/repo/issues/1 OwnerLogin/own',
    'gh pr merge -R Stranger/repo https://github.com/OwnerLogin/repo/pull/1',
    'gh pr merge -R Stranger/repo -- https://github.com/OwnerLogin/repo/pull/1',
    'gh repo delete Stranger/repo -- OwnerLogin/repo',
    'gh pr merge https://github.com/Stranger/',
    'gh -R OwnerLogin/repo project item-add 1 --owner StrangerOrg --url x',
    'gh project item-add 1 -R OwnerLogin/repo --owner StrangerOrg --url x',
    'gh secret set S -R Stranger/repo -\\u -b v',
    'gh secret set S -R Stranger/repo -\\o StrangerOrg -b v',
    'gh variable set V -R Stranger/repo --u\\ser -b v',
    'gh api repos/OwnerLogin/repo/issues -f title=hi',
    'gh api repos/Stranger/../OwnerLogin/repo/issues -f title=hi',
    'gh api repos/%53tranger/repo/issues -f title=hi',
    'gh api repos/{owner}/repo/issues -f title=hi',
    'gh api repos/:owner/repo/issues -f title=hi',
    'gh api --hostname "" /user/repos -X POST',
    'gh api --hostname sub.github.com /user/repos -X POST',
    'gh api --hostname ghes.example.com https://github.com/user/repos -X POST',
    'gh api --hostname ghes.example.com -it repos/Stranger/repo',
    'gh auth token --hostname ghes.example.com',
    'gh auth setup-git --hostname ghes.example.com',
    'gh repo fork Stranger/repo',
    'gh repo fork Stranger/repo --org @me',
    'gh repo fork Stranger/repo --org OwnerLogin --org StrangerOrg',
    'gh repo fork Stranger/repo --org StrangerOrg --org OwnerLogin',
    'gh repo fork Stranger/repo --org StrangerOrg --bogus',
    'gh repo fork Stranger/repo --bogus --org StrangerOrg',
    'gh repo create new-repo --public',
    'gh repo create -R Stranger/repo --public',
    'gh repo delete myrepo --yes',
    'gh repo rename Stranger/repo',
    'gh repo deploy-key add -R Stranger/repo key.pub',
    'gh project item-add 1 --owner @me --url x',
    'gh project item-add 1 --owner OwnerLogin --owner StrangerOrg --url x',
    'gh project item-add 1 --owner StrangerOrg --owner OwnerLogin --url x',
    'gh project item-add 1 --owner StrangerOrg --url x --owner OwnerLogin',
    'gh project item-add 1 --owner StrangerOrg --bogus',
    'GH_REPO=Stranger/repo; gh pr create -t x -b y',
    '$env:GH_REPO = "Stranger/repo"; unset GH_REPO; gh pr create -t x -b y',
    'export GH_REPO=Stranger/repo; $env:GH_REPO = "OwnerLogin/own"; gh pr create -t x -b y',
    'GH_REPO=Stranger/repo env -u GH_REPO gh pr create -t x -b y',
    'GH_REPO=Stranger/repo env -i gh pr create -t x -b y',
    'export GH_REPO=Stranger/repo; export GH_REPO=; gh pr create -t x -b y',
    '$env:GH_REPO = "$OTHER"; gh pr create -t x -b y',
    '$env:GH_REPO = "Stranger/repo"; $env:GH_REPO = $null; gh pr create -t x -b y',
    '$env:GH_REPO = \'Stranger/repo\'; echo $\'\\\'\'; gh pr create -t x -b y; echo \'; gh issue close 1; echo \'',
    'cd /tmp && gh pr create -R Stranger/repo -t x -b y',
    'Set-Location C:\\tmp; git push https://github.com/Stranger/repo.git main',
    'git push --unknown https://github.com/Stranger/repo.git main',
    'git push https://github.com/Stranger//repo.git main',
    'git push https://github.com/Stranger/%72epo.git main',
    'git push https://github.com/Stranger/.. main',
    'git push git@github.com:Stranger/.. main',
    'git push git@github.com:OwnerLogin/repo/ main',
    'git push git@github.com:onlyone main',
    'git push https://github.com/-bad/repo.git main',
  ]) assert.equal(call(cmd)?.decision, 'deny', cmd);

  // Unknown shell rejects multi-line export and $env: GH_REPO while allowing inline/env.
  assert.equal(guard.answerCall({ command: 'export GH_REPO=Stranger/repo; gh pr create -t x -b y', provider: 'codex', cwd: ownerRepo.work, canOverwrite: false, env: { HOME: fx.home }, tableFile: fx.tableFile, platform: process.platform, shell: 'unknown' })?.decision, 'deny');
  assert.equal(guard.answerCall({ command: '$env:GH_REPO = "Stranger/repo"; gh pr create -t x -b y', provider: 'codex', cwd: ownerRepo.work, canOverwrite: false, env: { HOME: fx.home }, tableFile: fx.tableFile, platform: process.platform, shell: 'unknown' })?.decision, 'deny');
  assert.equal(guard.answerCall({ command: 'GH_REPO=Stranger/repo gh pr create -t x -b y', provider: 'codex', cwd: ownerRepo.work, canOverwrite: false, env: { HOME: fx.home }, tableFile: fx.tableFile, platform: process.platform, shell: 'unknown' }), null);

  // Explicit shell rejects cross-shell GH_REPO forms.
  assert.equal(call('$env:GH_REPO = "Stranger/repo"; gh pr create -t x -b y', { shell: 'bash' })?.decision, 'deny');
  assert.equal(call('export GH_REPO=Stranger/repo; gh pr create -t x -b y', { shell: 'powershell' })?.decision, 'deny');

  // Explicit env.GH_REPO works and is overridden by -R.
  assert.equal(call('gh pr create -t x -b y', { env: { HOME: fx.home, GH_REPO: 'Stranger/repo' } }), null);
  assert.equal(call('gh pr create -R OwnerLogin/repo -t x -b y', { env: { HOME: fx.home, GH_REPO: 'Stranger/repo' } })?.id, 'identity-gh');
});

// #PACT-120 #PACT-119 C3
test('C3: Step 2 plain-text git config scoping handles worktrees, -C chaining, and fail-closed symlink/UNC/include traps', async t => {
  const { symlinkSync } = await import('node:fs');
  const fx = makePinFixture(t);
  const strangerRepo = makeGitRepo(t, { remoteUrl: 'https://github.com/Stranger/r.git' });
  const sub = join(strangerRepo.work, 'nested', 'dir');
  mkdirSync(sub, { recursive: true });
  const call = (command, opts = {}) => {
    const cwd = Object.hasOwn(opts, 'cwd') ? opts.cwd : sub;
    const { env = { HOME: fx.home }, platform = process.platform } = opts;
    return guard.answerCall({ command, provider: 'codex', cwd, canOverwrite: false, env, tableFile: fx.tableFile, platform });
  };

  // Upward lookup from subdirectory and -C chaining exempt stranger repos (including via time -p / mise flags).
  assert.equal(call('git commit -m x'), null);
  assert.equal(call(`time -p env -C ${strangerRepo.work} git -C nested commit -m x`, { cwd: fx.home }), null);
  assert.equal(call('/usr/bin/time -p -- git commit -m x'), null);
  assert.equal(call(`mise x -C ${strangerRepo.work} node@24 git commit -m x`), null);
  assert.equal(call(`mise x -C ${strangerRepo.work} -- git commit -m x`, { cwd: fx.home }), null);
  assert.equal(call(`mise -C ${strangerRepo.work} x -- git commit -m x`, { cwd: fx.home }), null);
  assert.equal(call('gh pr create -t x -b y'), null);

  // Account-scoped gh writes stay guarded even inside stranger cwd.
  for (const cmd of [
    'gh auth token',
    'gh auth setup-git',
    'gh auth status -t',
    'gh secret set S -o Stranger -b v',
    'gh variable set V -u -b v',
    'gh gist create f.txt',
    'gh repo delete myrepo --yes',
    'gh repo create myrepo --public',
    'gh ssh-key add k.pub',
  ]) assert.equal(call(cmd)?.id, 'identity-gh', cmd);
  assert.equal(call('git --unknown-flag status')?.id, 'identity-git');

  // Comment line or inline comment ending with trailing backslash does not eat next config line.
  const commentSlash = makeGitRepo(t, { remoteUrl: 'https://github.com/Stranger/r.git', extraConfig: '; comment \\\n[remote "upstream"]\n\turl = https://github.com/Other/r2.git\n' });
  assert.equal(call('git push', { cwd: commentSlash.work })?.id, 'identity-git');
  const inlineCommentSlash = makeGitRepo(t, { remoteUrl: 'https://github.com/Stranger/r.git ; trailing \\\n[remote "upstream"]\n\turl = https://github.com/OwnerLogin/r2.git\n' });
  assert.equal(call('git push', { cwd: inlineCommentSlash.work })?.id, 'identity-git');
  const safeInline = makeGitRepo(t, { remoteUrl: 'https://github.com/Stranger/r.git ; ok \\\n' });
  assert.equal(call('git commit -m x', { cwd: safeInline.work }), null);

  // Linked worktree + worktreeConfig truthy values.
  const wtStranger = makeGitRepo(t, { remoteUrl: 'https://github.com/Stranger/r.git', linked: true, extraConfig: '[extensions]\n\tworktreeConfig\n', worktreeConfig: '' });
  assert.equal(call('git commit -m x', { cwd: wtStranger.work }), null);
  const wtInclude = makeGitRepo(t, { remoteUrl: 'https://github.com/Stranger/r.git', linked: true, extraConfig: '[extensions]\n\tworktreeConfig = yes\n', worktreeConfig: '[include]\n\tpath = /x\n' });
  assert.equal(call('git commit -m x', { cwd: wtInclude.work })?.id, 'identity-git');

  // Multi-remote, pushDefault, branch.*.remote/pushRemote, & gh-resolved ambiguity.
  const multiSafe = makeGitRepo(t, { remoteUrl: 'https://github.com/Stranger/r1.git', extraConfig: '[remote "upstream"]\n\turl = https://github.com/Other/r2.git\n' });
  assert.equal(call('gh pr create -t x -b y', { cwd: multiSafe.work }), null);
  assert.equal(call('git push', { cwd: multiSafe.work })?.id, 'identity-git');
  assert.equal(call('git push upstream main', { cwd: multiSafe.work }), null);
  const multiNoUrl = makeGitRepo(t, { remoteUrl: 'https://github.com/Stranger/r1.git', extraConfig: '[remote "upstream"]\n\tfetch = +refs/heads/*:refs/remotes/upstream/*\n' });
  assert.equal(call('gh pr create -t x -b y', { cwd: multiNoUrl.work })?.id, 'identity-gh');
  const pushDefaultRepo = makeGitRepo(t, { remoteUrl: 'https://github.com/Stranger/r.git', extraConfig: '[remote]\n\tpushDefault = origin\n' });
  assert.equal(call('git push', { cwd: pushDefaultRepo.work })?.id, 'identity-git');
  const branchRemoteRepo = makeGitRepo(t, { remoteUrl: 'https://github.com/Stranger/r.git', extraConfig: '[branch "main"]\n\tremote = origin\n' });
  assert.equal(call('git push', { cwd: branchRemoteRepo.work })?.id, 'identity-git');
  const branchPushRemoteRepo = makeGitRepo(t, { remoteUrl: 'https://github.com/Stranger/r.git', extraConfig: '[branch "main"]\n\tpushRemote = origin\n' });
  assert.equal(call('git push', { cwd: branchPushRemoteRepo.work })?.id, 'identity-git');
  const ghResolvedRepo = makeGitRepo(t, { remoteUrl: 'https://github.com/Stranger/r.git', extraConfig: '\tgh-resolved = base\n[remote "upstream"]\n\tfetch = +refs/heads/*:refs/remotes/upstream/*\n' });
  assert.equal(call('gh pr create -t x -b y', { cwd: ghResolvedRepo.work })?.id, 'identity-gh');

  // gh uses url (not pushurl); git push uses pushurl if set; other git uses both.
  const splitUrls = makeGitRepo(t, { remoteUrl: 'https://github.com/Stranger/r.git', extraConfig: '\tpushurl = https://github.com/OwnerLogin/r.git\n' });
  assert.equal(call('gh pr create -t x -b y', { cwd: splitUrls.work }), null);
  assert.equal(call('git push', { cwd: splitUrls.work })?.id, 'identity-git');
  assert.equal(call('git commit -m x', { cwd: splitUrls.work })?.id, 'identity-git');

  // Fail closed on missing/bad cwd, UNC/drive-relative/drive-less on win32, --git-dir, GIT_DIR, GIT_CONFIG_SYSTEM, -c remote.*/alias.*, include, insteadOf, oversize.
  for (const opts of [
    { cwd: undefined },
    { cwd: 'relative/path' },
    { cwd: '\\\\server\\share\\repo', platform: 'win32' },
    { cwd: '\\drive-less\\repo', platform: 'win32' },
    { cwd: 'C:drive-relative', platform: 'win32' },
    { cwd: '/posix/path/rejected/on/win32', platform: 'win32' },
    { cwd: fx.home }, // no .git up to root
    { env: { HOME: fx.home, GIT_DIR: join(strangerRepo.work, '.git') } },
    { env: { HOME: fx.home, GIT_CONFIG_COUNT: '1' } },
    { env: { HOME: fx.home, GIT_CONFIG_SYSTEM: '/dev/null' } },
  ]) assert.equal(call('git commit -m x', opts)?.id, 'identity-git', JSON.stringify(opts));

  for (const cmd of [
    `git --git-dir=${join(strangerRepo.work, '.git')} commit -m x`,
    'git --exec-path=/tmp commit -m x',
    'git --config-env=a=B commit -m x',
    'git -c alias.p=push p',
    'git -c remote.origin.url=https://github.com/OwnerLogin/r.git push',
    'git -c url.https://github.com/OwnerLogin/.insteadOf=https://github.com/Stranger/ commit -m x',
  ]) assert.equal(call(cmd)?.id, 'identity-git', cmd);

  assert.equal(call('unset GIT_DIR; GIT_CONFIG=/x git commit -m x', { env: { HOME: fx.home, GIT_DIR: join(strangerRepo.work, '.git') } })?.id, 'identity-git');
  assert.equal(call('unset GIT_DIR; git commit -m x', { env: { HOME: fx.home, GIT_DIR: join(strangerRepo.work, '.git'), GIT_CONFIG: '/x' } })?.id, 'identity-git');
  assert.equal(call('unset GIT_DIR; git commit -m x', { env: { HOME: fx.home, GIT_DIR: join(strangerRepo.work, '.git'), GIT_COMMON_DIR: '/x' } })?.id, 'identity-git');

  const badInclude = makeGitRepo(t, { remoteUrl: 'https://github.com/Stranger/r.git', extraConfig: '[includeIf "gitdir:/x/"]\n\tpath = y\n' });
  assert.equal(call('git commit -m x', { cwd: badInclude.work })?.id, 'identity-git');
  const badUrlRew = makeGitRepo(t, { remoteUrl: 'https://github.com/Stranger/r.git', extraConfig: '[url "https://github.com/OwnerLogin/"]\n\tinsteadOf = https://github.com/Stranger/\n' });
  assert.equal(call('git commit -m x', { cwd: badUrlRew.work })?.id, 'identity-git');

  // Symlinked directory with .. collapse attempt (symlink/..) and trailing .. on file expectation MUST fail closed.
  const linkBase = tempDir(t, 'pact-sym-');
  mkdirSync(join(linkBase, '.git'), { recursive: true });
  writeFileSync(join(linkBase, '.git', 'config'), '[remote "origin"]\n\turl = https://github.com/Stranger/r.git\n');
  const symDir = join(linkBase, 'sym');
  symlinkSync(sub, symDir, WIN ? 'junction' : 'dir');
  assert.equal(call('git commit -m x', { cwd: `${symDir}/..` })?.id, 'identity-git');
  assert.equal(call(`git -C "${symDir}/.." commit -m x`, { cwd: linkBase })?.id, 'identity-git');
  const dotdotRepo = makeGitRepo(t, { remoteUrl: 'https://github.com/Stranger/r.git', linked: true });
  writeFileSync(join(dotdotRepo.work, '.git'), `gitdir: ${dotdotRepo.root}/main-git/worktrees/wt1\n`);
  writeFileSync(join(dotdotRepo.root, 'main-git', 'worktrees', 'wt1', 'commondir'), '../..\n');
  assert.equal(call('git commit -m x', { cwd: dotdotRepo.work }), null);
  const badWtDir = makeGitRepo(t, { remoteUrl: 'https://github.com/Stranger/r.git', linked: true });
  writeFileSync(join(badWtDir.work, '.git'), 'gitdir: .\n');
  assert.equal(call('git commit -m x', { cwd: badWtDir.work })?.id, 'identity-git');

  // Symlinked/junctioned .git entry fails closed.
  const symGitRepo = makeGitRepo(t, { remoteUrl: 'https://github.com/Stranger/r.git' });
  const symGitTarget = join(tempDir(t, 'pact-gitlink-'), 'real-git');
  mkdirSync(symGitTarget);
  writeFileSync(join(symGitTarget, 'config'), '[remote "origin"]\n\turl = https://github.com/Stranger/r.git\n');
  rmSync(join(symGitRepo.work, '.git'), { recursive: true, force: true });
  symlinkSync(symGitTarget, join(symGitRepo.work, '.git'), WIN ? 'junction' : 'dir');
  assert.equal(call('git commit -m x', { cwd: symGitRepo.work })?.id, 'identity-git');

  // Oversize config (> 1 MiB) fails closed.
  const bigRepo = makeGitRepo(t, { remoteUrl: 'https://github.com/Stranger/r.git', extraConfig: `# ${'x'.repeat(1024 * 1024)}\n` });
  assert.equal(call('git commit -m x', { cwd: bigRepo.work })?.id, 'identity-git');
});

// #PACT-120 #PACT-119 C4
test('C4: gh write classification, tokenizer hardening, --% stop-parsing, and posterOn reason routing', t => {
  const fx = makePinFixture(t);
  const ownerRepo = makeGitRepo(t, { remoteUrl: 'https://github.com/OwnerLogin/own.git' });
  const call = (command, { tableFile = fx.tableFile, provider = 'codex' } = {}) =>
    guard.answerCall({ command, provider, cwd: ownerRepo.work, canOverwrite: false, env: { HOME: fx.home }, tableFile, platform: process.platform });

  // Closed reads, strict -h/--help, gh run/workflow, gh-app/poster pass.
  for (const cmd of [
    'gh pr list',
    'gh pr view 1',
    'gh issue status',
    'gh auth status',
    'gh -h',
    'gh pr -h',
    'gh pr create -h',
    'gh --help',
    'gh api --help',
    'gh run rerun 123',
    'gh workflow run deploy.yml',
    'gh api repos/OwnerLogin/own/issues',
    'gh api -X GET repos/OwnerLogin/own/issues -f per_page=10',
    'gh api graphql -f query="query { viewer { login } }"',
    'node "$HOME/.pact/tools/gh-app.mjs" gh --provider codex -R OwnerLogin/own -- pr create -t x -b y',
    'node "$HOME/.pact/tools/poster.mjs" pr-comment 1',
    'echo "x`"; gh pr list',
    "echo $'a\\'b'; gh pr list",
    'echo "a``"; gh pr list',
    'echo "`ls`"',
    'env --sp "ls"',
    'timeout --bogus 10 ls',
    `$m = @'${' '.repeat(120)}\ngit worktree remove w\ngh pr create -t x -b y\n'@`,
    "cat <<\\EOF\ngh pr create -t x -b y\nEOF",
    "cat <<E'O'F\ngh pr create -t x -b y\nEOF",
    'cat <<"E"OF\ngh pr create -t x -b y\nEOF',
  ]) assert.equal(call(cmd), null, cmd);

  // Writes and tokenizer bypass defenses deny.
  for (const cmd of [
    'gh pr create -t x -b y',
    'gh pr create --body -h',
    'gh -R OwnerLogin/own pr create -t x -b y',
    'gh pr -R OwnerLogin/own create -t x -b y',
    'gh auth token',
    'gh auth status -t',
    'gh auth status -at',
    'gh auth status --show-token',
    'gh auth status -\\t',
    'gh auth status -a\\t',
    'gh auth status --sh\\ow-token',
    'gh auth -h',
    'gh ssh-key add k.pub',
    'gh gpg-key add k.asc',
    'gh alias set co "pr checkout"',
    'gh config set editor vim',
    'gh extension install foo/bar',
    'gh codespace create',
    'gh secret set S -o Stranger -b v',
    'gh secret set S -nu -b v',
    'gh variable set V --user -b v',
    'gh api repos/OwnerLogin/own/issues -f title=x',
    'gh api -XPOST repos/OwnerLogin/own/issues',
    'gh api -X POST -X GET repos/OwnerLogin/own/issues',
    'gh api repos/OwnerLogin/own/issues --bogus',
    'gh api -iX POST repos/OwnerLogin/own/issues',
    'gh api graphql -f query="mutation { x }"',
    'gh api graphql --input body.json',
    'gh api graphql -F query=@q.gql',
    'echo "x`" && gh pr create -t x -b y',
    'echo "x``\\"; gh pr create -t x -b y"',
    'echo @"\nsay "\ngh pr create -t x -b y\n"@',
    "echo x@'\nsay '\n\"gh\" pr create -t x -b y\n'@",
    'echo a<<EOF\ngit push\nEOF',
    'echo 1<<EOF\ngit push\nEOF',
    'echo << 2\ngit push',
    'echo $(( 1 << 2 ))\ngit push',
    'echo "x $(( 1 << 2 ))"\ngh pr create -t x -b y',
    'echo $(( ((1)) << 2 ))\ngh pr create -t x -b y',
    '# comment \\\ngit push',
    'echo \\\\\\\\\ngh pr create -t x -b y',
    'echo \\\\\\\' ; gh pr create -t x -b y',
    'echo \\\\\\" ; gh pr create -t x -b y',
    'echo \\" ; gh pr create -t x -b y',
    'echo `" ; gh pr create -t x -b y',
    'echo "$(echo "hi")"; gh pr create -t x -b y',
    'echo "$(echo "hi"; gh pr create -t x -b y)"',
    'echo "$(gh pr create -t "x" -b "y")"',
    'echo "$(case x in a) gh pr create -t x -b y;; esac)"',
    'echo "$(if true; then case x in a) gh pr create -t x -b y;; esac; fi)"',
    'echo "$(case x\nin a) gh pr create -t x -b y;; esac)"',
    'echo $(( $(case x in a) echo 1;; esac) << 2 ))\ngh pr create -t x -b y',
    '(( $(case x in a) echo 1;; esac) << 2 ))\ngit push',
    'echo "`gh pr create -t x -b y`"',
    'echo `echo $\'\\\'\' \'`\' $\'\\\'\' ; gh pr create -t x -b y`',
    '`gh pr create -t x -b y`',
    '&{gh pr create -t x -b y}',
    '.{git commit -m x}',
    'try{gh pr create -t x -b y}catch{}',
    '1|%{gh pr create -t x -b y}',
    '1|foreach-object{gh pr create -t x -b y}',
    '1|where-object{gh pr create -t x -b y}',
    '1|where{gh pr create -t x -b y}',
    'trap{gh pr create -t x -b y}',
    '$x=@{ a={gh pr create -t x -b y} }',
    'switch(1){1{gh pr create -t x -b y}}',
    '$x={gh pr create -t x -b y}',
    'g\\h pr create -t x -b y',
    'e\\nv gh pr create -t x -b y',
    '$env:X = <# #> gh pr create -t x -b y',
    '$env:X = gh auth status -t',
    '$env:X = git push',
    '$env:X=git push',
    '$env:X =git push',
    '$env:X= git push',
    '/usr/bin/timeout -k 5 --signal=KILL --foreground -v 10 gh pr create -t x -b y',
    'timeout -- 10 gh pr create -t x -b y',
    'timeout --bogus 10 gh pr create -t x -b y',
    "cat <<\\EOF\ngh pr list\nEOF\ngh pr create -t x -b y",
    "cat <<E'O'F\ngh pr list\nEOF\ngh pr create -t x -b y",
    'cat <<"E"OF\ngh pr list\nEOF\ngh pr create -t x -b y',
    'echo --% <<EOF\ngit push\nEOF',
    'echo --% "\ngit push\n"',
  ]) assert.equal(call(cmd)?.decision, 'deny', cmd);

  // --% after git fails closed as unknown leading flag.
  assert.equal(call('git --% push')?.id, 'identity-git');

  // Escaped semicolon in bash does not split segments; deep backticks inside double quotes fail closed.
  assert.deepEqual(guard.segmentsOf('echo \\; gh pr create -t x -b y', true), [['echo', ';', 'gh', 'pr', 'create', '-t', 'x', '-b', 'y']]);
  let deepCmd = 'gh pr create -t x -b y';
  for (let k = 8; k >= 0; k--) {
    const q = '\\'.repeat((1 << k) - 1) + '`';
    deepCmd = k === 0 ? `"${q}${deepCmd}${q}"` : `echo ${q}${deepCmd}${q}`;
  }
  assert.equal(call(`echo ${deepCmd}`)?.decision, 'deny');

  // Direct tokenizer segmentation checks for arithmetic, comment backslash, and PowerShell stop-parsing.
  assert.deepEqual(guard.segmentsOf('echo $(( 1 << 2 ))\ngit push', true), [['echo', '$'], ['1', '<<', '2'], ['git', 'push']]);
  assert.deepEqual(guard.segmentsOf('# comment \\\ngit push', true), [['git', 'push']]);
  assert.deepEqual(guard.segmentsOf('echo --% `\ngit push', false), [['echo', '--%', '`'], ['git', 'push']]);
  assert.deepEqual(guard.segmentsOf('gh api repos/{owner}/issues', false), [['gh', 'api', 'repos/{owner}/issues']]);

  // posterOn routing in reason templates.
  const free = call('gh pr create -t x -b y');
  assert.equal(free?.id, 'identity-gh');
  assert.match(free.reason, /poster\.mjs.*gh-app\.mjs" gh --provider codex/);
  const nonFree = call('gh release create v1');
  assert.equal(nonFree?.id, 'identity-gh');
  assert.doesNotMatch(nonFree.reason, /poster\.mjs/);
  assert.match(nonFree.reason, /gh-app\.mjs" gh --provider codex/);

  const posterOffTable = join(fx.guardDir, 'rules-noposter.json');
  writeFileSync(posterOffTable, JSON.stringify({ rules: ALL, identity: { enabled: true, posterOn: false } }));
  const freeNoPoster = call('gh pr create -t x -b y', { tableFile: posterOffTable });
  assert.doesNotMatch(freeNoPoster.reason, /poster\.mjs/);
});

// #PACT-120 #PACT-119 C5
test('C5: git write guard checks all subcommands, env/global opts, shell-mode isolation, raw quoting, and disqualifiers', t => {
  const fx = makePinFixture(t);
  const ownerRepo = makeGitRepo(t, { remoteUrl: 'https://github.com/OwnerLogin/own.git' });
  const cfgPath = join(fx.pactDir, 'gh-app-codex.gitconfig').replaceAll('\\', '/');
  const call = (command, { env = { HOME: fx.home }, platform = process.platform, provider = 'codex', shell } = {}) =>
    guard.answerCall({ command, provider, cwd: ownerRepo.work, canOverwrite: false, env, tableFile: fx.tableFile, platform, shell });

  // All 8 write subcommands guarded when unconfigured.
  for (const sub of ['commit -m x', 'push', 'merge main', 'cherry-pick abc', 'revert abc', 'rebase main', 'tag v1', 'am p.patch']) {
    assert.equal(call(`git ${sub}`)?.id, 'identity-git', sub);
  }
  // Reads and git pull pass.
  for (const cmd of ['git status', 'git pull', 'git log -n 5', 'git diff', 'git --version', 'git --help', 'GIT_CONFIG_COUNT=1 git status']) assert.equal(call(cmd), null, cmd);

  // Valid unshadowed assignments pass.
  for (const cmd of [
    `GIT_CONFIG_GLOBAL='${cfgPath}' git commit -m x`,
    `GIT_CONFIG_GLOBAL="${cfgPath}" git commit -m x`,
    'GIT_CONFIG_GLOBAL="$HOME/.pact/gh-app-codex.gitconfig" git commit -m x',
    'GIT_CONFIG_GLOBAL=~/.pact/gh-app-codex.gitconfig git commit -m x',
    `export GIT_CONFIG_GLOBAL='${cfgPath}'; git commit -m x`,
    `$env:GIT_CONFIG_GLOBAL = '${cfgPath}'; git commit -m x`,
    `$env:GIT_CONFIG_GLOBAL='${cfgPath}'; git commit -m x`,
    `$env:GIT_CONFIG_GLOBAL ='${cfgPath}'; git commit -m x`,
    `$env:GIT_CONFIG_GLOBAL= '${cfgPath}'; git commit -m x`,
    '$env:GIT_CONFIG_GLOBAL = "$HOME/.pact/gh-app-codex.gitconfig"; git commit -m x',
  ]) assert.equal(call(cmd), null, cmd);
  assert.equal(call('$env:GIT_CONFIG_GLOBAL = "$env:USERPROFILE/.pact/gh-app-codex.gitconfig"; git commit -m x', { env: { USERPROFILE: fx.home }, platform: 'win32' }), null);

  // Invalid quoting, cross-mode smuggling, overrides, disqualifiers, and unknown flags deny.
  for (const cmd of [
    `<# export GIT_CONFIG_GLOBAL='${cfgPath}'; #> git commit -m x`,
    `GIT_CONFIG_GLOBAL='$HOME/.pact/gh-app-codex.gitconfig' git commit -m x`,
    `GIT_CONFIG_GLOBAL='~/.pact/gh-app-codex.gitconfig' git commit -m x`,
    `env GIT_CONFIG_GLOBAL=~/.pact/gh-app-codex.gitconfig git commit -m x`,
    `GIT_CONFIG_GLOBAL=\\$HOME/.pact/gh-app-codex.gitconfig git commit -m x`,
    `$env:GIT_CONFIG_GLOBAL = ${cfgPath}; git commit -m x`,
    `$env:GIT_CONFIG_GLOBAL = "\`$HOME/.pact/gh-app-codex.gitconfig"; git commit -m x`,
    `$env:GIT_CONFIG_GLOBAL = '$env:USERPROFILE/.pact/gh-app-codex.gitconfig'; git commit -m x`,
    `export -n GIT_CONFIG_GLOBAL='${cfgPath}'; git commit -m x`,
    `export GIT_CONFIG_GLOBAL='${cfgPath}' extra=1; git commit -m x`,
    `$env:GIT_CONFIG_GLOBAL = '${cfgPath}' extra; git commit -m x`,
    `export GIT_CONFIG_GLOBAL='${cfgPath}' && git commit -m x`,
    `if true; then export GIT_CONFIG_GLOBAL='${cfgPath}'; fi; git commit -m x`,
    `export GIT_CONFIG_GLOBAL='${cfgPath}'; unset GIT_CONFIG_GLOBAL; git commit -m x`,
    `export GIT_CONFIG_GLOBAL='${cfgPath}'; unset HOME; GIT_CONFIG_GLOBAL="$HOME/.pact/gh-app-codex.gitconfig" git commit -m x`,
    `GIT_CONFIG_GLOBAL='${cfgPath}' env -u GIT_CONFIG_GLOBAL git commit -m x`,
    `GIT_CONFIG_GLOBAL='${cfgPath}' env -iu FOO git commit -m x`,
    `GIT_CONFIG_GLOBAL='${cfgPath}' git -c user.email=a@b.c commit -m x`,
    `GIT_CONFIG_GLOBAL='${cfgPath}' git -c credential.helper=store commit -m x`,
    `GIT_CONFIG_GLOBAL='${cfgPath}' git -c core.askPass=true commit -m x`,
    `GIT_CONFIG_GLOBAL='${cfgPath}' git -c core.sshCommand=evil commit -m x`,
    `GIT_CONFIG_GLOBAL='${cfgPath}' git -c remote.origin.url=x commit -m x`,
    `GIT_CONFIG_GLOBAL='${cfgPath}' git -c alias.p=push p`,
    `GIT_CONFIG_GLOBAL='${cfgPath}' git -c include.path=/x commit -m x`,
    `GIT_CONFIG_GLOBAL='${cfgPath}' git -c http.extraHeader=x commit -m x`,
    `GIT_CONFIG_GLOBAL='${cfgPath}' git --config-env=a=B commit -m x`,
    `GIT_CONFIG_COUNT=1 GIT_CONFIG_GLOBAL='${cfgPath}' git commit -m x`,
    `GIT_CONFIG_SYSTEM=/dev/null GIT_CONFIG_GLOBAL='${cfgPath}' git commit -m x`,
    `GIT_ASKPASS=/bin/false GIT_CONFIG_GLOBAL='${cfgPath}' git commit -m x`,
    `SSH_ASKPASS=/bin/false GIT_CONFIG_GLOBAL='${cfgPath}' git commit -m x`,
    `$env:GIT_CONFIG_GLOBAL = '${cfgPath}'; Copy-Item env:BAD env:GIT_CONFIG_GLOBAL; git commit -m x`,
    `$env:GIT_CONFIG_GLOBAL = '${cfgPath}'; sv GIT_CONFIG_GLOBAL x; git commit -m x`,
    `$env:GIT_CONFIG_GLOBAL = '${cfgPath}'; $m = @"\n$x\n"@; git commit -m x`,
    `$env:GIT_CONFIG_GLOBAL = '${cfgPath}'; cmd /c echo hi; git commit -m x`,
    `$env:GIT_CONFIG_GLOBAL = '${cfgPath}'; echo $'\\''; git push; echo '; git commit -m x; echo '`,
    `$env:GIT_CONFIG_GLOBAL = '${cfgPath}'; echo $'\\''; git push; echo '; git push; echo '`,
    'env -P /usr/bin git push',
    'env --sp git push',
    'env --sp "git push"',
    '/usr/bin/Env git push',
    'Env.exe -u X git commit -m x',
    'env -S "git push"',
    'time -p git commit -m x',
    'time --bogus git commit -m x',
    'mise x -C . node@24 git commit -m x',
    'mise --bogus x git commit -m x',
    'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=alias.p GIT_CONFIG_VALUE_0=push git p',
    'GIT_CONFIG_PARAMETERS="\'alias.p=push\'" git p',
    'GIT_CONFIG_SYSTEM=/tmp/evil git p',
    'GIT_CONFIG_GLOBAL=/tmp/evil git p',
    'GIT_CONFIG_""COUNT=1 git p',
    '$env:GIT_`CONFIG_COUNT = \'1\'; git p',
    '${env:GIT_CONFIG_COUNT} = \'1\'; git p',
    '${env:GIT_CONFIG_PARAMETERS} = \'x\'; git p',
    '${env:GIT_CONFIG_SYSTEM} = \'/x\'; git p',
    '${env:GIT_CONFIG_GLOBAL} = \'/tmp/evil\'; git p',
    `export GIT_CONFIG_GLOBAL='${cfgPath}'; GIT_CONFIG_GLOBAL='/tmp/evil'; git p`,
    `$env:GIT_CONFIG_GLOBAL='/tmp/evil'; git p`,
    `$env:GIT_CONFIG_COUNT='1'; git p`,
    `$env:GIT_DIR='/tmp/x'; git commit -m x`,
    `g\\it commit -m x`,
    `e\\nv git commit -m x`,
    `GIT_CONFIG_GLOBAL='${cfgPath}' e\\nv -u GIT_\\CONFIG_GLOBAL git commit -m x`,
    `GIT_\\CONFIG_GLOBAL='${cfgPath}' git commit -m x`,
    `git -c al\\ias.p=push p`,
    `git -c rem\\ote.origin.url=x push`,
    `git -c us\\er.email=x commit -m y`,
    `export GIT_CONFIG_GLOBAL='${cfgPath}'; un\\set GIT_CONFIG_GLOBAL; git commit -m x`,
    `$env:GIT_CONFIG_GLOBAL = '${cfgPath}'; unset GIT_CONFIG_GLOBAL; git commit -m x`,
    `export GIT_CONFIG_GLOBAL='${cfgPath}'; Remove-Item env:GIT_CONFIG_GLOBAL; git commit -m x`,
    `export GIT_CONFIG_GLOBAL='${cfgPath}'; $env:GIT_CONFIG_GLOBAL='/tmp/evil'; git commit -m x`,
    `export GIT_CONFIG_GLOBAL='${cfgPath}'; GIT_TERMINAL_PROMPT=1; git commit -m x`,
    `echo --% ; export GIT_CONFIG_GLOBAL='${cfgPath}'\ngit commit -m x`,
    `echo $'\\''; export GIT_CONFIG_GLOBAL="${cfgPath}" # '\ngit commit -m x`,
    `echo "a\\"; $env:GIT_CONFIG_GLOBAL = '${cfgPath}' # "\ngit commit -m x`,
    `export GIT_CONFIG_GLOBAL='${cfgPath}'; git commit -m x; echo @'\nx\n'@`,
    'git --unknown-flag status',
    'git --attr-source=HEAD commit -m x',
  ]) assert.equal(call(cmd)?.id, 'identity-git', cmd);

  // PowerShell config-injection / GIT_DIR overrides fail closed even inside a stranger repo.
  const strangerGitRepo = makeGitRepo(t, { remoteUrl: 'https://github.com/Stranger/r.git' });
  for (const cmd of [
    `$env:GIT_CONFIG_GLOBAL='/tmp/evil'; git p`,
    `$env:GIT_CONFIG_COUNT='1'; git p`,
  ]) {
    assert.equal(guard.answerCall({ command: cmd, provider: 'codex', cwd: strangerGitRepo.work, canOverwrite: false, env: { HOME: fx.home, GIT_CONFIG_GLOBAL: cfgPath }, tableFile: fx.tableFile, platform: process.platform })?.id, 'identity-git', cmd);
  }
  assert.equal(guard.answerCall({ command: `$env:GIT_DIR='/tmp/x'; git commit -m x`, provider: 'codex', cwd: strangerGitRepo.work, canOverwrite: false, env: { HOME: fx.home }, tableFile: fx.tableFile, platform: process.platform })?.id, 'identity-git');

  // Explicit shell rejects cross-shell assignments; heredoc/here-string cannot cross-satisfy modes.
  assert.equal(call(`$env:GIT_CONFIG_GLOBAL = '${cfgPath}'; git commit -m x`, { shell: 'bash' })?.id, 'identity-git');
  assert.equal(call(`export GIT_CONFIG_GLOBAL='${cfgPath}'; git commit -m x`, { shell: 'powershell' })?.id, 'identity-git');
  assert.equal(call(`cat <<EOF\n\nEOF\n$env:GIT_CONFIG_GLOBAL = '${cfgPath}'; git commit -m x`)?.id, 'identity-git');

  // Unknown shell denies export and $env: GIT_CONFIG_GLOBAL while allowing inline and direct env.
  assert.equal(call(`export GIT_CONFIG_GLOBAL='${cfgPath}'; git push`, { shell: 'unknown' })?.id, 'identity-git');
  assert.equal(call(`$env:GIT_CONFIG_GLOBAL = '${cfgPath}'; git push`, { shell: 'unknown' })?.id, 'identity-git');
  assert.equal(call(`GIT_CONFIG_GLOBAL='${cfgPath}' git commit -m x`, { shell: 'unknown' }), null);
  assert.equal(call('git commit -m x', { env: { HOME: fx.home, GIT_CONFIG_GLOBAL: cfgPath }, shell: 'unknown' }), null);

  // Case-folded win32 env variable matching catches unset git_config_global.
  assert.equal(call('unset git_config_global; git commit -m x', { env: { HOME: fx.home, GIT_CONFIG_GLOBAL: cfgPath }, platform: 'win32' })?.id, 'identity-git');

  // Missing or mismatched HOME/USERPROFILE rejects $HOME/~/$env:USERPROFILE.
  assert.equal(call('GIT_CONFIG_GLOBAL="$HOME/.pact/gh-app-codex.gitconfig" git commit -m x', { env: {} })?.id, 'identity-git');
  assert.equal(call('GIT_CONFIG_GLOBAL=~/.pact/gh-app-codex.gitconfig git commit -m x', { env: { HOME: '/other' } })?.id, 'identity-git');

  // Enclosing / | / & / subshell boundaries disqualify env.GIT_CONFIG_GLOBAL.
  assert.equal(call('(git commit -m x)', { env: { HOME: fx.home, GIT_CONFIG_GLOBAL: cfgPath } })?.id, 'identity-git');
  assert.equal(call('echo x | git commit -m x', { env: { HOME: fx.home, GIT_CONFIG_GLOBAL: cfgPath } })?.id, 'identity-git');
  assert.equal(call('git status && git commit -m x', { env: { HOME: fx.home, GIT_CONFIG_GLOBAL: cfgPath } }), null);

  // Claude provider runs git override/unset guard while passing normal settings-env writes and skipping cleaner.
  const claudeCfg = join(fx.pactDir, 'gh-app-claude.gitconfig').replaceAll('\\', '/');
  const claudeEnv = { HOME: fx.home, GIT_CONFIG_GLOBAL: claudeCfg, GIT_TERMINAL_PROMPT: '0' };
  assert.equal(call('git commit -m x', { provider: 'claude', env: claudeEnv }), null);
  assert.equal(call('git push', { provider: 'claude', env: claudeEnv }), null);
  assert.equal(call('git worktree remove w', { provider: 'claude', env: claudeEnv }), null);
  for (const cmd of [
    'env -u GIT_CONFIG_GLOBAL git push',
    'GIT_CONFIG_GLOBAL=/tmp/other git commit -m x',
    'GIT_TERMINAL_PROMPT=1 git push',
    'git -c user.email=x commit -m y',
    'git -c alias.p=push p',
    'GIT_CONFIG_SYSTEM=/dev/null git push',
    'GIT_ASKPASS=/bin/false git push',
    'env -S "git push"',
  ]) assert.equal(call(cmd, { provider: 'claude', env: claudeEnv })?.id, 'identity-git', `claude:${cmd}`);
});

// #PACT-120 #PACT-119 C6
test('C6: precedence (cleaner > gh > git) and Antigravity overwrite_ask vs deny gating', t => {
  const fx = makePinFixture(t);
  const ownerRepo = makeGitRepo(t, { remoteUrl: 'https://github.com/OwnerLogin/own.git' });
  const cfgPath = join(fx.pactDir, 'gh-app-antigravity.gitconfig').replaceAll('\\', '/');
  const call = (command, { canOverwrite = true, platform = 'win32', env = { USERPROFILE: fx.home } } = {}) =>
    guard.answerCall({ command, provider: 'antigravity', cwd: ownerRepo.work, canOverwrite, env, tableFile: fx.tableFile, platform });

  // Cleaner beats gh and git; gh beats git.
  assert.equal(call('gh pr create -t x -b y && git worktree remove w')?.id, 'worktree-remove');
  assert.equal(call('git commit -m x && gh pr create -t x -b y')?.id, 'identity-gh');

  // Simple git write with canOverwrite=true yields overwrite_ask with shell-appropriate escaping.
  const winOw = call('git commit -m "fix: msg"');
  assert.equal(winOw?.decision, 'overwrite_ask');
  assert.equal(winOw?.id, 'identity-git');
  assert.equal(winOw?.overwriteCommand, `$env:GIT_CONFIG_GLOBAL = '${cfgPath.replaceAll("'", "''")}'; $env:GIT_TERMINAL_PROMPT = '0'; git commit -m "fix: msg"`);

  const posixOw = call('git commit -m x', { platform: 'linux', env: { HOME: fx.home } });
  assert.equal(posixOw?.decision, 'overwrite_ask');
  assert.equal(posixOw?.overwriteCommand, `GIT_CONFIG_GLOBAL='${cfgPath.replaceAll("'", "'\\''")}' GIT_TERMINAL_PROMPT=0 git commit -m x`);

  // Prose -c user.email inside -m still overwrites cleanly (inspected via parsed tokens, not substring).
  assert.equal(call('git commit -m "-c user.email=x"')?.decision, 'overwrite_ask');
  assert.equal(call('git -c "foo=bar" commit -m \'a`b\'')?.decision, 'overwrite_ask');

  // Quoted single-quote in pin directory escapes cleanly in overwriteCommand on both shells.
  const qHome = join(tempDir(t, 'pact-q-'), "o'x");
  const qPact = join(qHome, '.pact');
  mkdirSync(qPact, { recursive: true });
  const qPin = join(qPact, 'github.json');
  writeFileSync(qPin, JSON.stringify({ owner: { login: 'OwnerLogin', id: 99 }, apps: { antigravity: { app_id: 12, slug: 'my-ag-app', bot_login: 'my-ag-app[bot]', bot_id: 23 } } }));
  const qCfg = join(qPact, 'gh-app-antigravity.gitconfig').replaceAll('\\', '/');
  writeFileSync(qCfg, '[credential]\n\thelper = ""\n');
  assert.equal(guard.answerCall({ command: 'git commit -m x', provider: 'antigravity', cwd: ownerRepo.work, canOverwrite: true, env: { USERPROFILE: qHome }, tableFile: fx.tableFile, pinFile: qPin, platform: 'win32' })?.overwriteCommand, `$env:GIT_CONFIG_GLOBAL = '${qCfg.replaceAll("'", "''")}'; $env:GIT_TERMINAL_PROMPT = '0'; git commit -m x`);
  assert.equal(guard.answerCall({ command: 'git commit -m x', provider: 'antigravity', cwd: ownerRepo.work, canOverwrite: true, env: { HOME: qHome }, tableFile: fx.tableFile, pinFile: qPin, platform: 'linux' })?.overwriteCommand, `GIT_CONFIG_GLOBAL='${qCfg.replaceAll("'", "'\\''")}' GIT_TERMINAL_PROMPT=0 git commit -m x`);

  // Compound, wrapped, $(, backtick/backslash escaping, unknown leading flag, -c override, canOverwrite=false fall back to deny.
  for (const [cmd, opts] of [
    ['git commit -m x', { canOverwrite: false }],
    ['ls && git commit -m x', {}],
    ['env git commit -m x', {}],
    ['time git commit -m x', {}],
    ['echo $(git commit -m x)', {}],
    ['git commit -m "$(echo hi)"', {}],
    ['# lead\ngit commit -m x', {}],
    ['set FOO=1; git commit -m x', {}],
    ['FOO=1 git commit -m x', {}],
    ['git --unknown commit -m x', {}],
    ['git \\commit -m x', {}],
    ['git `commit -m x', {}],
    ['git commit -m x `ls`', { platform: 'linux' }],
    ['git -c user.name=bad commit -m x', {}],
    ['git -c remote.origin.url=x commit -m x', {}],
    ['git -c core.sshCommand=x commit -m x', {}],
    ['git -c alias.p=push p', {}],
    ['git -c "u`ser.name=bad" commit -m x', {}],
    ['git -c "a`b=c" commit -m x', {}],
    ['git -c "foo=bar" -c "baz`qux=1" commit -m x', {}],
    ['git --config-env=a=B commit -m x', {}],
    ['GIT_CONFIG_COUNT=1 git p', {}],
  ]) {
    const res = call(cmd, opts);
    assert.equal(res?.decision, 'deny', cmd);
    assert.equal(res?.id, 'identity-git', cmd);
    assert.equal(res?.overwriteCommand, undefined, cmd);
  }

  // Curly single quotes in expected pin path disqualify win32 overwrite_ask.
  const curlyHome = join(tempDir(t, 'pact-curly-'), 'o\u2019x');
  const curlyPact = join(curlyHome, '.pact');
  mkdirSync(curlyPact, { recursive: true });
  const curlyPin = join(curlyPact, 'github.json');
  writeFileSync(curlyPin, JSON.stringify({ owner: { login: 'OwnerLogin', id: 99 }, apps: { antigravity: { app_id: 12, slug: 'my-ag-app', bot_login: 'my-ag-app[bot]', bot_id: 23 } } }));
  writeFileSync(join(curlyPact, 'gh-app-antigravity.gitconfig'), '[credential]\n\thelper = ""\n');
  const curlyRes = guard.answerCall({ command: 'git commit -m x', provider: 'antigravity', cwd: ownerRepo.work, canOverwrite: true, env: { USERPROFILE: curlyHome }, tableFile: fx.tableFile, pinFile: curlyPin, platform: 'win32' });
  assert.equal(curlyRes?.decision, 'deny');
  assert.equal(curlyRes?.overwriteCommand, undefined);
});

// #PACT-120 #PACT-119 C11
test('C11: zero secret/URL/command leakage in reasons and 1 MiB adversarial inputs complete under 1000 ms', t => {
  const SECRET_CMD = 'SECRET_CMD_XYZ';
  const SECRET_URL = 'https://github.com/OwnerLogin/SECRET_REPO_XYZ.git';
  const fx = makePinFixture(t, { owner: { login: 'OwnerLogin', id: 998877 } });
  const ownerRepo = makeGitRepo(t, { remoteUrl: SECRET_URL });

  for (const [cmd, provider] of [
    [`gh pr create -t ${SECRET_CMD} -b body`, 'codex'],
    [`gh pr create -t ${SECRET_CMD} -b body`, 'claude'],
    [`ls && git commit -m ${SECRET_CMD}`, 'antigravity'],
    [`git -c user.email=${SECRET_CMD} commit -m x`, 'antigravity'],
  ]) {
    const res = guard.answerCall({ command: cmd, provider, cwd: ownerRepo.work, canOverwrite: true, env: { HOME: fx.home }, tableFile: fx.tableFile, platform: process.platform });
    assert.equal(res?.decision, 'deny');
    for (const leak of [SECRET_CMD, SECRET_URL, 'SECRET_REPO_XYZ', 'OwnerLogin', '998877', 'my-codex-app']) {
      assert.ok(!res.reason.includes(leak), `${leak} leaked into ${res.reason}`);
    }
  }

  for (const unit of ['git commit;', 'mise x ', 'git -c a=b ', 'gh api -p ', 'env -u X ', `@"${' '.repeat(64)}`, 'a; ', 'x && ']) {
    const big = unit === 'git commit;' ? unit.repeat(80000) : unit.repeat(Math.floor(guard.COMMAND_MAX / unit.length));
    const started = Date.now();
    guard.answerCall({ command: big, provider: 'codex', cwd: ownerRepo.work, canOverwrite: false, env: { HOME: fx.home }, tableFile: fx.tableFile, platform: process.platform });
    const elapsed = Date.now() - started;
    assert.ok(elapsed < 1000, `${unit} took ${elapsed} ms (>= 1000 ms)`);
  }
});
