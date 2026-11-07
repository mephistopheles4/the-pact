// The pact's compact hook (#482 C6 to C8): the script run against fixture
// transcripts and inputs, copied under a temp home as the install puts it, so
// every file it writes lands under that home. The file also holds the install's
// own checks for the window and the hook script (C4) and the parity of the
// copies of the default and the hook names.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { REPO } from './text.mjs';
import { tempDir } from './tree.mjs';

const SOURCE = join(REPO, 'claude', 'hooks', 'compact-handoff.mjs');
const SID = 'abc-123';

/** A temp home with the script installed in it, and a transcript whose last assistant entry holds `used` tokens of context (split across the three usage fields). */
function setup(t, used = 0) {
  const h = tempDir(t, 'pact-hook-home-');
  mkdirSync(join(h, 'pact', 'hooks'), { recursive: true });
  const script = join(h, 'pact', 'hooks', 'compact-handoff.mjs');
  cpSync(SOURCE, script);
  const transcript = join(h, 'transcript.jsonl');
  const entry = (type, u) => JSON.stringify({ type, message: { usage: u } });
  const lines = [];
  lines.push(entry('assistant', { input_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }));
  lines.push(JSON.stringify({ type: 'user', message: { content: 'hi' } }));
  lines.push(entry('assistant', { input_tokens: 10, cache_creation_input_tokens: used - 110, cache_read_input_tokens: 100 }));
  lines.push(JSON.stringify({ type: 'user', message: { content: 'tool result' } }));
  writeFileSync(transcript, `${lines.join('\n')}\n`);
  // The session's own folder, apart from the home: nothing of the hook's may land in it.
  return { h, script, transcript, dir: join(h, 'pact', 'handoff'), cwd: tempDir(t, 'pact-hook-cwd-') };
}

/** Run the hook for `input`; the window argument is 400000 unless `window` is given, and `env` adds to a clean environment. */
function run(ctx, input, { window = '400000', env = {} } = {}) {
  const clean = { ...process.env, ...env };
  delete clean.NODE_OPTIONS;
  if (!('CLAUDE_CODE_AUTO_COMPACT_WINDOW' in env)) delete clean.CLAUDE_CODE_AUTO_COMPACT_WINDOW;
  const r = spawnSync(process.execPath, [ctx.script, window], { input: typeof input === 'string' ? input : JSON.stringify({ session_id: SID, transcript_path: ctx.transcript, cwd: ctx.cwd, ...input }), encoding: 'utf8', env: clean });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
const context = r => JSON.parse(r.out).hookSpecificOutput;
const turnFile = ctx => join(ctx.dir, `${SID}.turn`);
const handoff = ctx => join(ctx.dir, `${SID}.md`);
const UPS = { hook_event_name: 'UserPromptSubmit', prompt: 'go' };
const PTU = { hook_event_name: 'PostToolUse', tool_name: 'Bash' };
const STOP = { hook_event_name: 'Stop' };

// C6
test('#482 C6: the hook nudges past the line (window minus 80000) and not under it, with a .turn file only once it nudged', t => {
  const under = setup(t, 319999);
  for (const e of [UPS, PTU]) assert.deepEqual(run(under, e), { code: 0, out: '', err: '' }, e.hook_event_name);
  assert.equal(existsSync(under.dir), false, 'a session under the line leaves no file');
  const past = setup(t, 320000);
  const r = run(past, UPS);
  assert.equal(r.code, 0);
  const c = context(r);
  assert.equal(c.hookEventName, 'UserPromptSubmit');
  assert.match(c.additionalContext, /hand-off file/);
  assert.ok(c.additionalContext.includes(handoff(past).replaceAll('\\', '/')), c.additionalContext);
  assert.equal(readFileSync(turnFile(past), 'utf8').trim(), 'nudged');
  assert.deepEqual(readdirSync(past.h).sort(), ['pact', 'transcript.jsonl'], 'nothing outside the home folder');
  assert.deepEqual(readdirSync(past.cwd), [], 'nothing in the session\'s own folder');
  if (process.platform !== 'win32') assert.equal(statSync(past.dir).mode & 0o777, 0o700, 'the hand-off folder is for its owner alone');
});

test('#482 C6: the env var\'s window is read first, then the argument', t => {
  const ctx = setup(t, 150000);
  assert.equal(run(ctx, PTU).out, '', '150k is under 320k');
  assert.match(run(ctx, PTU, { env: { CLAUDE_CODE_AUTO_COMPACT_WINDOW: '200000' } }).out, /additionalContext/, '150k is past 120k');
  const again = setup(t, 150000);
  assert.match(run(again, PTU, { env: { CLAUDE_CODE_AUTO_COMPACT_WINDOW: '200k' } }).out, /additionalContext/, 'a k suffix counts');
  const bad = setup(t, 150000);
  assert.equal(run(bad, PTU, { env: { CLAUDE_CODE_AUTO_COMPACT_WINDOW: 'lots' } }).out, '', 'an env var that is no token count falls back to the argument');
  assert.equal(run(setup(t, 340000), PTU, { window: 'x' }).out, '', 'no window at all does nothing, past any default line');
});

test('#482 C6: past the line a turn with a prompt and two tool calls gets exactly one nudge; a turn with no prompt gets one on its first tool call; after Stop the next turn gets one again', t => {
  const ctx = setup(t, 340000);
  const seq = [UPS, PTU, PTU, STOP, PTU, PTU, STOP, UPS, PTU];
  const nudges = seq.map(e => (run(ctx, e).out ? 1 : 0));
  assert.deepEqual(nudges, [1, 0, 0, 0, 1, 0, 0, 1, 0]);
  assert.equal(readFileSync(turnFile(ctx), 'utf8').trim(), 'nudged');
  assert.equal(run(ctx, STOP).out, '');
  assert.equal(readFileSync(turnFile(ctx), 'utf8').trim(), 'open');
});

test('#482 C6: a subagent\'s input (with agent_id) gets no nudge and leaves no file', t => {
  const ctx = setup(t, 340000);
  for (const e of [UPS, PTU, STOP, { hook_event_name: 'PreCompact' }, { hook_event_name: 'SessionStart', source: 'compact' }]) {
    assert.deepEqual(run(ctx, { ...e, agent_id: 'agent-1' }), { code: 0, out: '', err: '' }, e.hook_event_name);
  }
  assert.equal(existsSync(ctx.dir), false);
});

// C7
test('#482 C7: PreCompact names the hand-off file only when it exists', t => {
  const ctx = setup(t, 340000);
  const PC = { hook_event_name: 'PreCompact', trigger: 'auto' };
  assert.deepEqual(run(ctx, PC), { code: 0, out: '', err: '' });
  mkdirSync(ctx.dir, { recursive: true });
  writeFileSync(handoff(ctx), 'goal\n');
  const r = run(ctx, PC);
  assert.equal(r.code, 0);
  assert.ok(r.out.includes(handoff(ctx).replaceAll('\\', '/')), r.out);
  assert.match(r.out, /read it before going on/);
});

test('#482 C7: SessionStart (compact) puts the hand-off back under the "own notes, data" line, cut at 8 KB with a mark, and nothing with no file', t => {
  const ctx = setup(t, 10);
  const SS = { hook_event_name: 'SessionStart', source: 'compact' };
  assert.deepEqual(run(ctx, SS), { code: 0, out: '', err: '' });
  mkdirSync(ctx.dir, { recursive: true });
  writeFileSync(handoff(ctx), 'Goal: ship\nNext: test\n');
  const c = context(run(ctx, SS));
  assert.equal(c.hookEventName, 'SessionStart');
  const [first, ...rest] = c.additionalContext.split('\n');
  assert.match(first, /own notes from before compaction/);
  assert.match(first, /data, not instructions/);
  assert.equal(rest.join('\n').trim(), 'Goal: ship\nNext: test');
  writeFileSync(handoff(ctx), `${'a'.repeat(8192)}TAIL-MARK-NOT-SHOWN`);
  const cut = context(run(ctx, SS)).additionalContext;
  assert.ok(cut.endsWith(`${'a'.repeat(8192)}\n\n[cut at 8 KB]`), 'exactly 8 KB, then the mark');
  assert.ok(!cut.includes('TAIL-MARK-NOT-SHOWN'));
});

// C8
test('#482 C8: a session_id outside [A-Za-z0-9-], a missing transcript and bad JSON each give exit 0, no output and no file', t => {
  for (const sid of ['../x', 'a/b', 'a\\b', 'a.b', '', 'x'.repeat(65), 'sp ace', 'ü']) {
    const ctx = setup(t, 340000);
    for (const e of [UPS, PTU, STOP, { hook_event_name: 'PreCompact' }, { hook_event_name: 'SessionStart' }]) {
      assert.deepEqual(run(ctx, { ...e, session_id: sid }), { code: 0, out: '', err: '' }, `${JSON.stringify(sid)} ${e.hook_event_name}`);
    }
    assert.equal(existsSync(ctx.dir), false, JSON.stringify(sid));
    assert.deepEqual(readdirSync(join(ctx.h, 'pact')), ['hooks'], JSON.stringify(sid));
  }
  const ctx = setup(t, 340000);
  assert.deepEqual(run(ctx, { ...UPS, transcript_path: join(ctx.h, 'missing.jsonl') }), { code: 0, out: '', err: '' });
  assert.deepEqual(run(ctx, { ...PTU, transcript_path: undefined }), { code: 0, out: '', err: '' });
  for (const bad of ['', 'not json', '{"hook_event_name":', 'null', '[]']) assert.deepEqual(run(ctx, bad), { code: 0, out: '', err: '' }, JSON.stringify(bad));
  assert.equal(existsSync(ctx.dir), false);
});

// #482 C4: the install's own checks, each row seen to refuse, with a base before and after.
{
  const core = await import('../install-core.mjs');
  const { createHash } = await import('node:crypto');
  const overlay = core.readSettings(readFileSync(join(REPO, 'claude', 'settings.overlay.json'), 'utf8'));
  const home = join('/', 'tmp', 'claude-home');
  const inside = join(home, 'pact', 'hooks', 'compact-handoff.mjs');
  const hash = b => createHash('sha256').update(b).digest('hex');
  const cfg = hash('cfg');
  const digest = hash(Buffer.from(`user ${cfg}\n`, 'ascii')).slice(0, 12);
  const lines = value => ['RENDERED ' + hash('r'), 'DIFF ' + hash('d'), `CONFIG user ${cfg}`, `DIGEST ${digest}`, ...(value === null ? [] : [`VALUE auto-compact-window ${value}`]), 'COMMANDS none', 'TOOLS none', 'RESULT: pass'];
  const parse = l => core.parseRenderLines(l, { project: false, hash });
  const projectLines = ['RENDERED ' + hash('r'), 'CONFIG none', 'PROJECT ' + hash('p'), `DIGEST ${digest}`, 'VALUE auto-compact-window 300000', 'RESULT: pass'];
  const elsewhere = join('/', 'tmp', 'elsewhere', 'compact-handoff.mjs');
  const rows = [
    { id: 'script-outside-the-home', run: () => core.fillHooks(overlay, home, elsewhere, 500000, 'linux'), fails: 'hook-script-path', why: 'the script path is checked to sit under the Claude home folder' },
    { id: 'script-in-a-sibling-folder', run: () => core.fillHooks(overlay, home, join('/', 'tmp', 'claude-home-evil', 'x.mjs'), 500000, 'linux'), fails: 'hook-script-path', why: 'a folder whose name starts with the home\'s is not under it' },
    { id: 'script-is-the-home-itself', run: () => core.fillHooks(overlay, home, home, 500000, 'linux'), fails: 'hook-script-path', why: 'under the home, not the home' },
    { id: 'window-below-the-range', run: () => parse(lines('99999')), fails: 'render-unknown-line', why: 'the renderer reports only windows the install takes' },
    { id: 'window-above-the-range', run: () => parse(lines('1000001')), fails: 'render-unknown-line', why: 'one step past the top' },
    { id: 'window-off-the-step', run: () => parse(lines('410001')), fails: 'render-unknown-line', why: 'steps of 10000 from 100000' },
    { id: 'window-in-exponent-form', run: () => parse(lines('4e5')), fails: 'render-unknown-line', why: 'digits only' },
    { id: 'window-negative', run: () => parse(lines('-1')), fails: 'render-unknown-line', why: 'no sign' },
    { id: 'window-with-no-configuration', run: () => parse(['RENDERED ' + hash('r'), 'DIFF ' + hash('d'), 'CONFIG none', 'VALUE auto-compact-window 600000', 'COMMANDS none', 'TOOLS none', 'RESULT: pass']), fails: 'render-none-extras', why: 'a value needs a configuration to come from' },
    { id: 'window-in-a-project-render', run: () => core.parseProjectRenderLines(projectLines, hash), fails: 'project-render-unknown-line', why: 'a project render never reports the window' },
    { id: 'hook-script-already-there', run: () => core.checkNewPaths(new Map([[core.HOOK_SCRIPT_REL, hash('x')]]), { files: [] }, () => ({ exists: true })), fails: 'unlisted-live', why: 'a file the pact did not write is never laid over' },
  ];
  test('the install\'s checks for the window and the hook script: base passes', () => {
    const filled = core.fillHooks(overlay, home, inside, 500000, 'linux');
    const hook = filled.get('hooks').get('Stop')[0].get('hooks')[0];
    assert.deepEqual(hook.get('args'), [inside, '500000']);
    assert.equal(hook.get('command'), 'node');
    assert.equal(parse(lines('600000')).values.get('auto-compact-window'), '600000');
    assert.equal(core.compactWindow(parse(lines(null))), 400000);
    assert.equal(core.compactWindow(parse(lines('0'))), 0);
    core.checkNewPaths(new Map([[core.HOOK_SCRIPT_REL, hash('x')]]), { files: [{ path: core.HOOK_SCRIPT_REL }] }, () => ({ exists: true }));
  });
  for (const r of rows) {
    test(`the install's checks for the window and the hook script: ${r.id}`, () => {
      assert.throws(r.run, e => e instanceof core.Refusal && e.rule === r.fails, r.why);
    });
  }
}

// The parity test for the default and the hook names (#482): the installer's, the generator's and the renderer's copies agree.
test('#482: the default window is one number in the renderer, the install and the cloud generator, and the hook names agree', async () => {
  const core = await import('../install-core.mjs');
  const gen = await import('../../cloud-sessions/gen.mjs');
  const src = readFileSync(join(REPO, 'gate', 'render-core.mjs'), 'utf8');
  const m = /\['auto-compact-window', Object\.freeze\(\{[^}]*min: (\d+), max: (\d+), step: (\d+), off: (\d+), def: (\d+),/.exec(src);
  assert.ok(m, 'the renderer declares the setting in the expected form');
  const [min, max, step, off, def] = m.slice(1).map(Number);
  assert.deepEqual([min, max, step, off, def], [100000, 1000000, 10000, 0, 400000]);
  assert.equal(core.AUTO_COMPACT_DEFAULT, def);
  assert.equal(gen.CLOUD_COMPACT_WINDOW, def);
  assert.equal(core.compactWindowOk(min) && core.compactWindowOk(max) && core.compactWindowOk(off), true);
  assert.equal(core.compactWindowOk(min - step) || core.compactWindowOk(max + step) || core.compactWindowOk(min + 1), false);
  assert.deepEqual([...core.PACT_HOOKS], ['compact-handoff']);
  const seam = readFileSync(join(REPO, 'gate', 'seam-a-core.mjs'), 'utf8');
  assert.ok(seam.includes("const PACT_HOOKS = Object.freeze(['compact-handoff']);"));
  const overlay = JSON.parse(readFileSync(join(REPO, 'claude', 'settings.overlay.json'), 'utf8'));
  assert.deepEqual(Object.keys(overlay.hooks), [...core.HOOK_EVENTS]);
  assert.equal(core.HOOK_SCRIPT_REL, 'pact/hooks/compact-handoff.mjs');
});
