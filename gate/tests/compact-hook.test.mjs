// The pact's compact hook (#482 C6 to C8): the script run against fixture
// transcripts and inputs, copied under a temp home as the install puts it
// (<home>/pact/hooks/), so every file it writes lands under that home.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { REPO } from './text.mjs';
import { tempDir } from './tree.mjs';

const SOURCE = join(REPO, 'claude', 'hooks', 'compact-handoff.mjs');
const SID = 'abc-123';

/** A temp home with the script installed in it, and a transcript whose last assistant entry holds `used` tokens of context (split across the three usage fields). */
function setup(t, used = 0, pad = 0) {
  const h = tempDir(t, 'pact-hook-home-');
  mkdirSync(join(h, 'pact', 'hooks'), { recursive: true });
  const script = join(h, 'pact', 'hooks', 'compact-handoff.mjs');
  cpSync(SOURCE, script);
  const transcript = join(h, 'transcript.jsonl');
  const entry = (type, u) => JSON.stringify({ type, message: { usage: u } });
  const lines = [];
  // Padding in front, so the tail read starts mid-file and its first line is partial.
  for (let i = 0; i < pad; i += 1) lines.push(entry('assistant', { input_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, pad: 'x'.repeat(1000) }));
  lines.push(entry('assistant', { input_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }));
  lines.push(JSON.stringify({ type: 'user', message: { content: 'hi' } }));
  lines.push(entry('assistant', { input_tokens: 10, cache_creation_input_tokens: used - 110, cache_read_input_tokens: 100 }));
  lines.push(JSON.stringify({ type: 'user', message: { content: 'tool result' } }));
  writeFileSync(transcript, `${lines.join('\n')}\n`);
  return { h, script, transcript, dir: join(h, 'pact', 'handoff') };
}

/** Run the hook for `input`; the window argument is 400000 unless `window` is given, and `env` adds to a clean environment. */
function run(ctx, input, { window = '400000', env = {} } = {}) {
  const clean = { ...process.env, ...env };
  delete clean.NODE_OPTIONS;
  if (!('CLAUDE_CODE_AUTO_COMPACT_WINDOW' in env)) delete clean.CLAUDE_CODE_AUTO_COMPACT_WINDOW;
  const r = spawnSync(process.execPath, [ctx.script, window], { input: typeof input === 'string' ? input : JSON.stringify({ session_id: SID, transcript_path: ctx.transcript, cwd: ctx.h, ...input }), encoding: 'utf8', env: clean });
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
});

test('#482 C6: the env var\'s window is read first, then the argument', t => {
  const ctx = setup(t, 150000);
  assert.equal(run(ctx, PTU).out, '', '150k is under 320k');
  assert.match(run(ctx, PTU, { env: { CLAUDE_CODE_AUTO_COMPACT_WINDOW: '200000' } }).out, /additionalContext/, '150k is past 120k');
  const again = setup(t, 150000);
  assert.match(run(again, PTU, { env: { CLAUDE_CODE_AUTO_COMPACT_WINDOW: '200k' } }).out, /additionalContext/, 'a k suffix counts');
  const bad = setup(t, 150000);
  assert.equal(run(bad, PTU, { env: { CLAUDE_CODE_AUTO_COMPACT_WINDOW: 'lots' } }).out, '', 'an env var that is no token count falls back to the argument');
  assert.equal(run(bad, PTU, { window: 'x' }).out, '', 'no window at all does nothing');
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

test('#482 C6: a transcript over 256 KB is read by its tail', t => {
  const ctx = setup(t, 340000, 400);
  assert.ok(readFileSync(ctx.transcript).length > 300 * 1024);
  assert.match(run(ctx, UPS).out, /additionalContext/);
  const under = setup(t, 100000, 400);
  assert.equal(run(under, UPS).out, '');
});

test('#482 C6: once context is back under the line the nudge stops by itself, and the next prompt opens the turn', t => {
  const ctx = setup(t, 340000);
  assert.match(run(ctx, UPS).out, /additionalContext/);
  writeFileSync(ctx.transcript, `${JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 50000 } } })}\n`);
  assert.equal(run(ctx, PTU).out, '');
  assert.equal(run(ctx, UPS).out, '');
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
  assert.ok(cut.includes('a'.repeat(8192)));
  assert.ok(!cut.includes('TAIL-MARK-NOT-SHOWN'));
  assert.match(cut, /\[cut at 8 KB\]$/);
});

// C8
test('#482 C8: a session_id outside [A-Za-z0-9-], a missing transcript and bad JSON each give exit 0, no output and no file', t => {
  for (const sid of ['../x', 'a/b', 'a\\b', 'a.b', '', 'x'.repeat(65), 'sp ace', 'ü']) {
    const ctx = setup(t, 340000);
    for (const e of [UPS, PTU, STOP, { hook_event_name: 'PreCompact' }, { hook_event_name: 'SessionStart' }]) {
      assert.deepEqual(run(ctx, { ...e, session_id: sid }), { code: 0, out: '', err: '' }, `${JSON.stringify(sid)} ${e.hook_event_name}`);
    }
    assert.equal(existsSync(ctx.dir), false, JSON.stringify(sid));
    assert.equal(existsSync(join(ctx.h, 'pact', 'x')), false);
  }
  const ctx = setup(t, 340000);
  assert.deepEqual(run(ctx, { ...UPS, transcript_path: join(ctx.h, 'missing.jsonl') }), { code: 0, out: '', err: '' });
  assert.deepEqual(run(ctx, { ...PTU, transcript_path: undefined }), { code: 0, out: '', err: '' });
  for (const bad of ['', 'not json', '{"hook_event_name":', 'null', '[]']) assert.deepEqual(run(ctx, bad), { code: 0, out: '', err: '' }, JSON.stringify(bad));
  assert.equal(existsSync(ctx.dir), false);
});

// #482 C4, C5: the install's own checks, each seen to refuse.
test('#482: the install refuses a hook script path outside the Claude home folder and a window the renderer should never report, and fills only its two tokens', async () => {
  const core = await import('../install-core.mjs');
  const { createHash } = await import('node:crypto');
  const overlay = core.readSettings(readFileSync(join(REPO, 'claude', 'settings.overlay.json'), 'utf8'));
  const home = join('/', 'tmp', 'claude-home');
  const inside = join(home, 'pact', 'hooks', 'compact-handoff.mjs');
  const filled = core.fillHooks(overlay, home, inside, 500000, 'linux');
  const args = filled.get('hooks').get('Stop')[0].get('hooks')[0].get('args');
  assert.deepEqual(args, [inside, '500000']);
  assert.equal(filled.get('hooks').get('Stop')[0].get('hooks')[0].get('command'), 'node');
  for (const outside of [join('/', 'tmp', 'elsewhere', 'compact-handoff.mjs'), join('/', 'tmp', 'claude-home-evil', 'x.mjs'), home]) {
    assert.throws(() => core.fillHooks(overlay, home, outside, 500000, 'linux'), e => e instanceof core.Refusal && e.rule === 'hook-script-path', outside);
  }
  // The renderer's lines: an auto-compact window off the range or its step, or with no configuration, is refused.
  const hash = b => createHash('sha256').update(b).digest('hex');
  const cfg = hash('cfg');
  const digest = hash(Buffer.from(`user ${cfg}\n`, 'ascii')).slice(0, 12);
  const lines = value => ['RENDERED ' + hash('r'), 'DIFF ' + hash('d'), `CONFIG user ${cfg}`, `DIGEST ${digest}`, ...(value === null ? [] : [`VALUE auto-compact-window ${value}`]), 'COMMANDS none', 'TOOLS none', 'RESULT: pass'];
  const parse = l => core.parseRenderLines(l, { project: false, hash });
  assert.equal(parse(lines('600000')).values.get('auto-compact-window'), '600000');
  assert.equal(core.compactWindow(parse(lines(null))), 400000);
  assert.equal(core.compactWindow(parse(lines('0'))), 0);
  for (const bad of ['99999', '1000001', '410001', '4e5', '-1']) assert.throws(() => parse(lines(bad)), e => e instanceof core.Refusal, bad);
  assert.throws(() => parse(['RENDERED ' + hash('r'), 'DIFF ' + hash('d'), 'CONFIG none', 'VALUE auto-compact-window 600000', 'COMMANDS none', 'TOOLS none', 'RESULT: pass']), e => e instanceof core.Refusal);
});

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
