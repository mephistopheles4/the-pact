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
const ALL = core.guardRules(['cleaner', 'session-stop-deny']);

// ------------------------------------------------------------ the rule table

const both = patterns => [...patterns.map(p => `Bash(${p})`), ...patterns.map(p => `PowerShell(${p})`)];

test('C11: the permission rules made from the table are, for each switch, the same text as before the table', () => {
  assert.deepEqual([...core.CLEANER_DENY], both(['git worktree remove *', 'git * worktree remove *', 'git branch -d *', 'git * branch -d *', 'git branch -D *', 'git * branch -D *', 'git branch --delete *', 'git * branch --delete *', 'claude rm *']));
  assert.deepEqual([...core.CLEANER_ASK], both(['*cleaner.mjs*remove*--override*']));
  assert.deepEqual([...core.STOP_DENY], both(['claude stop *', 'claude kill *', 'claude daemon stop *', 'claude respawn *']));
});

test('a rule whose switch is off is not in the table; the rendered table reads back as its rules', () => {
  assert.deepEqual(core.guardRules([]), []);
  assert.deepEqual([...new Set(core.guardRules(['cleaner']).map(r => r.switch))], ['cleaner']);
  assert.deepEqual([...new Set(core.guardRules(['session-stop-deny']).map(r => r.switch))], ['session-stop-deny']);
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
  'session-stop': 'claude stop 1a2b',
  'session-kill': 'claude kill 1a2b',
  'daemon-stop': 'claude daemon stop now',
  'session-respawn': 'claude respawn 1a2b',
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
  assert.deepEqual(guard.judge(`${ONE['cleaner-override']} && ${ONE['session-stop']}`, ALL), { decision: 'deny', id: 'session-stop' }, 'the deny sits after the ask in the table');
  assert.equal(guard.judge(ONE['session-stop'], core.guardRules(['cleaner'])), null);
  assert.equal(guard.judge(ONE['worktree-remove'], core.guardRules(['session-stop-deny'])), null);
});

test('a long adversarial command is judged well inside the hook\'s timeout', () => {
  const started = Date.now();
  for (const unit of ['mise x ', 'git * ', 'git ', '<< a ', '@\' ', '(', '"', 'a; ', 'env -u ', 'x && ']) guard.judge(unit.repeat(Math.floor(guard.COMMAND_MAX / unit.length)), ALL);
  assert.ok(Date.now() - started < 12_000, `${Date.now() - started} ms for ten commands of the largest size`);
});

// ------------------------------------------------------------ the hook command

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

const CALLS = {
  codex: command => ({ session_id: 's', cwd: '/w', hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_use_id: 'u', tool_input: { command } }),
  antigravity: command => ({ toolCall: { name: 'run_command', args: { CommandLine: command, Cwd: '/w' } }, stepIdx: 1 }),
};

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
  assert.deepEqual(shown(ag.merged), { lint: { PostToolUse: [] }, 'pact-guard': { PreToolUse: [{ matcher: 'run_command', hooks: [{ type: 'command', command: 'x', timeout: 15 }] }] } });
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
