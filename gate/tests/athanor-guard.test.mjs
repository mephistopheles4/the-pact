// The agent hook that sends the gate's host test runs through athanor (#383):
// .claude/hooks/athanor-guard.mjs, run by .claude/settings.json before every
// Bash and PowerShell call. The seam is decide(): the hook input in, a refusal
// or null out. Further tests run the probe against a fake athanor on PATH, and
// the script as Claude Code runs it. Ported from grimoire's agent check guard
// (grimoire issue 377). Claims are the spec's, in revision 2 on the issue.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { REPO } from './text.mjs';
import { tempDir } from './tree.mjs';

const GUARD = join(REPO, '.claude', 'hooks', 'athanor-guard.mjs');
const { decide, probeAthanor } = await import(pathToFileURL(GUARD).href);

const present = async () => true;
const missing = async () => false;
const ask = (command, { tool = 'Bash', athanorPresent = present } = {}) => decide({ tool_name: tool, tool_input: { command }, cwd: '/work' }, { athanorPresent });

// Claim 1: each way a session starts a host fast or full run. The first four
// are the forms AGENTS.md documents; a miss passes falsely.
const FORMS = [
  '$env:NODE_OPTIONS = $null; node gate/tests/run.mjs fast',
  'env -u NODE_OPTIONS node gate/tests/run.mjs fast',
  '$env:NODE_OPTIONS = $null; node gate/tests/run.mjs full',
  'env -u NODE_OPTIONS node gate/tests/run.mjs full',
  'node gate/tests/run.mjs fast',
  'node ./gate/tests/run.mjs full --reporter tap',
  'node gate\\tests\\run.mjs fast',
  'node "gate/tests/run.mjs" fast',
  "node 'gate/tests/run.mjs' full",
  'node /work/repo/gate/tests/run.mjs fast',
  'node C:\\work\\repo\\gate\\tests\\run.mjs fast',
  'node.exe gate/tests/run.mjs fast',
  '& node gate/tests/run.mjs fast',
  'NODE_OPTIONS= node gate/tests/run.mjs fast',
  'env -i PATH=/usr/bin node gate/tests/run.mjs fast',
  'env --unset=NODE_OPTIONS node gate/tests/run.mjs fast',
  'env -uNODE_OPTIONS node gate/tests/run.mjs fast',
  'cd repo && env -u NODE_OPTIONS node gate/tests/run.mjs fast',
  'node gate/tests/run.mjs full 2>&1 | tail -5',
  'node gate/tests/run.mjs full --record /tmp/rec.txt',
  'timeout 600 node gate/tests/run.mjs full',
  'git status\nnode gate/tests/run.mjs fast',
  'node gate/tests/run.mjs --reporter tap fast',
  'time node gate/tests/run.mjs fast',
  'call node gate/tests/run.mjs fast',
  'env --unset NODE_OPTIONS node gate/tests/run.mjs fast',
  'node --import ./x.mjs gate/tests/run.mjs fast',
  'node --title t gate/tests/run.mjs fast',
  'node --env-file .env gate/tests/run.mjs full',
  "# don't run this on the host\nnode gate/tests/run.mjs fast",
  "# it's fine\nenv -u NODE_OPTIONS node gate/tests/run.mjs full",
];
// Each shell's own line continuation and quoting.
const OWN = {
  Bash: ['node \\\ngate/tests/run.mjs fast'],
  PowerShell: ['node `\ngate/tests/run.mjs fast', 'Set-Location "C:\\x\\"; node gate/tests/run.mjs fast', "<# don't #> node gate/tests/run.mjs fast"],
};

for (const tool of ['Bash', 'PowerShell']) {
  test(`athanor guard: ${tool} refuses each host fast and full form while athanor is present`, async () => {
    for (const form of [...FORMS, ...OWN[tool]]) assert.ok(await ask(form, { tool }), form);
  });
}

// Claim 2: what passes with athanor present.
test('athanor guard: changed, --list, a named fallback and other commands pass with athanor present', async () => {
  const passes = [
    'env -u NODE_OPTIONS node gate/tests/run.mjs changed',
    '$env:NODE_OPTIONS = $null; node gate/tests/run.mjs changed --base origin/main',
    'node gate/tests/run.mjs full --list',
    'env -u NODE_OPTIONS node gate/tests/run.mjs full --host-fallback=before an install',
    'env -u NODE_OPTIONS node gate/tests/run.mjs fast "--host-fallback=no docker here"',
    '$env:NODE_OPTIONS = $null; node gate/tests/run.mjs fast --host-fallback="athanor exited 125"',
    "$env:NODE_OPTIONS = $null; node gate/tests/run.mjs full --host-fallback='before an install'",
    'athanor run',
    'athanor run fast',
    'node --test gate/tests/run.test.mjs',
    'node gate/tests/run.mjs.bak fast',
    'node other/run.mjs fast',
    'node scripts/other.mjs gate/tests/run.mjs fast',
    'node -e "1" gate/tests/run.mjs fast',
    'node -p gate/tests/run.mjs fast',
    'echo node gate/tests/run.mjs fast',
    'cat gate/tests/run.mjs',
    'git commit -m "node gate/tests/run.mjs fast"',
    "git commit -F - <<'EOF'\nnode gate/tests/run.mjs fast\nEOF",
    "gh issue comment 1 --body @'\nnode gate/tests/run.mjs fast\n'@",
    '',
  ];
  for (const command of passes) assert.equal(await ask(command), null, JSON.stringify(command));
});

test('athanor guard: an empty reason, the space form, or the flag in another segment frees nothing', async () => {
  for (const command of ['node gate/tests/run.mjs fast --host-fallback=', 'node gate/tests/run.mjs fast --host-fallback="  "', 'node gate/tests/run.mjs fast --host-fallback no-docker', 'echo --host-fallback=x; node gate/tests/run.mjs fast', 'node gate/tests/run.mjs fast # --host-fallback=x']) {
    assert.ok(await ask(command), command);
  }
});

// Claim 3, decided: athanor missing, or a probe that throws, passes.
test('athanor guard: every form passes while athanor is missing, or when the probe throws', async () => {
  for (const form of FORMS) assert.equal(await ask(form, { athanorPresent: missing }), null, form);
  assert.equal(await ask('node gate/tests/run.mjs fast', { athanorPresent: async () => { throw new Error('boom'); } }), null);
});

// Claim 4.
test('athanor guard: the probe runs only for a guarded command', async () => {
  let probes = 0;
  const athanorPresent = async () => (probes++, true);
  for (const c of ['ls -la', 'node gate/tests/run.mjs changed', 'git commit -m "node gate/tests/run.mjs fast"']) await ask(c, { athanorPresent });
  assert.equal(probes, 0);
  await ask('node gate/tests/run.mjs fast', { athanorPresent });
  assert.equal(probes, 1);
});

test('athanor guard: the refusal echoes nothing from the command, and gives the way out', async () => {
  const { reason } = await ask('node gate/tests/run.mjs fast SECRET_TOKEN_abc123');
  assert.doesNotMatch(reason, /SECRET_TOKEN_abc123/);
  assert.equal(reason, (await ask('env -u NODE_OPTIONS node gate/tests/run.mjs full')).reason);
  for (const says of ['`athanor run fast`', '`athanor run`', 'before an install', 'no Docker', '4121c28', '124, 125 or 137', "`--host-fallback='<reason>'`", 'quoted', 'own plain words', 'no path, token or pasted error text', 'report']) assert.ok(reason.includes(says), says);
});

// The probe, against a fake athanor on a PATH of its own: a .cmd on Windows,
// which is what an npm install leaves, and a script elsewhere.
const BODIES = {
  ok: "console.log('0.1.0');",
  dangling: "console.error('mise ERROR athanor is not a valid shim.'); process.exit(1);",
  noversion: "console.log('this is not athanor');",
  failing: "console.log('0.1.0'); process.exit(1);",
  hang: "import('node:fs').then(fs => fs.writeFileSync(new URL('./pid.txt', import.meta.url), String(process.pid))); setInterval(() => {}, 1000);",
};

function fake(t, kind) {
  const dir = tempDir(t, 'pact-athanor-');
  writeFileSync(join(dir, 'fake.mjs'), BODIES[kind]);
  if (process.platform === 'win32') writeFileSync(join(dir, 'athanor.cmd'), `@"${process.execPath}" "%~dp0fake.mjs" %*\r\n`);
  else {
    // The hung one keeps its shell, so the node it starts is a grandchild and
    // only a kill of the whole tree ends it.
    writeFileSync(join(dir, 'athanor'), `#!/bin/sh\n${kind === 'hang' ? '' : 'exec '}"${process.execPath}" "${dir}/fake.mjs" "$@"\n`);
    chmodSync(join(dir, 'athanor'), 0o755);
  }
  return dir;
}

/** A stand-in athanor that leaves a marker where it runs, as a planted file would. */
function planted(dir) {
  const marker = join(dir, 'marker.txt');
  if (process.platform === 'win32') writeFileSync(join(dir, 'athanor.cmd'), `@echo planted> "${marker}"\r\n`);
  else {
    writeFileSync(join(dir, 'athanor'), `#!/bin/sh\necho planted > "${marker}"\n`);
    chmodSync(join(dir, 'athanor'), 0o755);
  }
  return marker;
}

// The machine's own NoDefaultCurrentDirectoryInExePath is taken out, so the
// probe stands on what it sets itself.
const envWith = path => {
  const env = { ...process.env, PATH: path };
  for (const k of Object.keys(env)) if (k.toLowerCase() === 'nodefaultcurrentdirectoryinexepath' || k.toLowerCase() === 'path') delete env[k];
  return { ...env, PATH: path };
};

// Claim 3, probed. Windows cases run on gate-windows, the POSIX ones on gate.
test('athanor guard probe: a working athanor is found; a dangling shim, no version and no athanor are missing', async t => {
  assert.equal(await probeAthanor({ env: envWith(fake(t, 'ok')) }), true);
  assert.equal(await probeAthanor({ env: envWith(fake(t, 'dangling')) }), false);
  assert.equal(await probeAthanor({ env: envWith(fake(t, 'noversion')) }), false);
  assert.equal(await probeAthanor({ env: envWith(fake(t, 'failing')) }), false, 'a version with a failing exit');
  assert.equal(await probeAthanor({ env: envWith(tempDir(t, 'pact-empty-')) }), false);
});

test('athanor guard probe: a hang ends at the limit, and the child and its tree are gone', async t => {
  const dir = fake(t, 'hang');
  const started = Date.now();
  assert.equal(await probeAthanor({ env: envWith(dir), limitMs: 1500 }), false);
  assert.ok(Date.now() - started < 4000, 'the probe returned at its limit');
  const pidFile = join(dir, 'pid.txt');
  assert.ok(existsSync(pidFile), 'the fake started');
  const pid = Number(readFileSync(pidFile, 'utf8'));
  const alive = () => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };
  for (let i = 0; i < 40 && alive(); i++) await new Promise(r => setTimeout(r, 100));
  assert.equal(alive(), false, 'the hung child is gone');
});

// Each Windows defence alone keeps a planted file from running: the system
// folder as the probe's folder, and the current-folder lookup switched off.
// With both taken away the planted file runs, so the test can fail.
test('athanor guard probe: a file planted in the working folder is never run, by either defence alone', { skip: process.platform !== 'win32' && 'the planted-file lookup is cmd.exe\'s; outside Windows the PATH test covers it' }, async t => {
  const dir = tempDir(t, 'pact-planted-');
  const marker = planted(dir);
  const empty = envWith(tempDir(t, 'pact-empty-'));
  assert.equal(await probeAthanor({ env: empty, cwd: dir }), false);
  assert.equal(existsSync(marker), false, 'the planted file ran with the lookup off');
  // The working folder is the planted one, as the repo is for the hook.
  const before = process.cwd();
  process.chdir(dir);
  try {
    assert.equal(await probeAthanor({ env: empty, lookupOff: false }), false);
  } finally {
    process.chdir(before);
  }
  assert.equal(existsSync(marker), false, 'the planted file ran from the system folder');
  await probeAthanor({ env: empty, cwd: dir, lookupOff: false });
  assert.equal(existsSync(marker), true, 'with both defences gone the planted file runs');
});

test('athanor guard probe: outside Windows a PATH with an empty or relative entry runs nothing and counts as missing', async t => {
  const dir = fake(t, 'ok');
  const stand = tempDir(t, 'pact-stand-');
  const marker = planted(stand);
  for (const path of ['', `${dir}${delimiter}`, `${delimiter}${dir}`, `${dir}${delimiter}bin`, `${dir}${delimiter}.`, `${stand}${delimiter}bin`]) {
    assert.equal(await probeAthanor({ env: { PATH: path }, platform: 'linux' }), false, JSON.stringify(path));
  }
  assert.equal(existsSync(marker), false, 'a stand-in beside a relative entry ran');
});

// Claim 6: the script as the hook runs it.
const hook = (input, path) => spawnSync(process.execPath, [GUARD], { input: typeof input === 'string' ? input : JSON.stringify(input), env: envWith(path), encoding: 'utf8' });
const call = (command, tool = 'Bash') => ({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: { command }, cwd: REPO });

test('athanor guard script: prints the documented refusal and exits 0', t => {
  const working = fake(t, 'ok');
  for (const tool of ['Bash', 'PowerShell']) {
    const r = hook(call('env -u NODE_OPTIONS node gate/tests/run.mjs fast', tool), working);
    assert.equal(r.status, 0);
    assert.equal(r.stderr, '');
    const out = JSON.parse(r.stdout);
    assert.deepEqual(Object.keys(out), ['hookSpecificOutput']);
    assert.deepEqual(Object.keys(out.hookSpecificOutput).sort(), ['hookEventName', 'permissionDecision', 'permissionDecisionReason']);
    assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse');
    assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /athanor run fast/);
  }
});

test('athanor guard script: every pass is silent, exit 0 and nothing on either stream', t => {
  const working = fake(t, 'ok');
  const cases = [
    [call('node gate/tests/run.mjs fast --host-fallback=no-docker'), working],
    [call('ls -la'), working],
    [call('node gate/tests/run.mjs changed'), working],
    [call('node gate/tests/run.mjs fast'), tempDir(t, 'pact-empty-')],
    [call('node gate/tests/run.mjs fast'), fake(t, 'dangling')],
    [{ tool_name: 'Read', tool_input: { file_path: 'x' } }, working],
    ['{"tool_name": "Bash", "tool_input": {"command": "SECRET_TOKEN_abc123', working],
    ['not json SECRET_TOKEN_abc123', working],
    ['', working],
    ['null', working],
  ];
  for (const [input, path] of cases) {
    const r = hook(input, path);
    assert.equal(r.status, 0, JSON.stringify(input));
    assert.equal(r.stdout, '', JSON.stringify(input));
    assert.equal(r.stderr, '', JSON.stringify(input));
  }
});

test('athanor guard script: holds no explicit decision other than the refusal', () => {
  // An explicit allow skips the owner's permission prompt for the call.
  const source = readFileSync(GUARD, 'utf8');
  for (const word of ['allow', 'ask', 'approve', 'block', 'decision', 'updatedInput', 'additionalContext']) assert.doesNotMatch(source, new RegExp(`['"\`]?${word}['"\`]?\\s*:|['"\`]${word}['"\`]`), word);
  assert.deepEqual([...source.matchAll(/permissionDecision:\s*'(\w+)'/g)].map(m => m[1]), ['deny']);
});

// Claim 7: the tracked settings file runs the hook and holds nothing else, and
// the ignore exception is that one path.
test('athanor guard settings: .claude/settings.json holds only the hook entry', () => {
  const settings = JSON.parse(readFileSync(join(REPO, '.claude', 'settings.json'), 'utf8'));
  assert.deepEqual(settings, {
    hooks: { PreToolUse: [{ matcher: 'Bash|PowerShell', hooks: [{ type: 'command', command: 'node', args: ['${CLAUDE_PROJECT_DIR}/.claude/hooks/athanor-guard.mjs'], timeout: 15 }] }] },
  });
});

test('athanor guard settings: only .claude/settings.json at the root is let out of the settings ignore', () => {
  const ignored = rel => spawnSync('git', ['check-ignore', '--no-index', '-q', rel], { cwd: REPO }).status;
  assert.equal(ignored('.claude/settings.json'), 1, 'the hook file is tracked');
  for (const rel of ['settings.json', 'claude/settings.json', 'gate/.claude/settings.json', '.claude/x/settings.json', '.claude/settings.local.json']) assert.equal(ignored(rel), 0, rel);
});
