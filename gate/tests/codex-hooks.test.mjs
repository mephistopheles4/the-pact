import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tempDir } from './tree.mjs';
import { hook } from '../../codex/hooks.mjs';

test('Codex raw worktree deletion is denied while ordinary reads pass', () => {
  for (const command of ['git worktree remove old', 'git -C repo branch -D old', 'claude rm old']) {
    assert.equal(hook({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } }, {}).output.hookSpecificOutput.permissionDecision, 'deny');
  }
  assert.equal(hook({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git status --short' } }, {}).output, null);
});

test('Codex refuses cleaner override instead of emitting unsupported ask', () => {
  const r = hook({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'node cleaner.mjs remove --override old=tag' } }, {});
  assert.equal(r.output.hookSpecificOutput.permissionDecision, 'deny');
});

test('Codex compact handoff uses native token usage and supported JSON context', () => {
  const usage = hook({ hook_event_name: 'PostModelRequest', token_usage: { input_tokens: 340000, output_tokens: 100 } }, {});
  const nudge = hook({ hook_event_name: 'PostToolUse' }, usage.state);
  assert.equal(nudge.state.nudged, true);
  assert.match(nudge.output.hookSpecificOutput.additionalContext, /hand-off/);
  assert.equal(hook({ hook_event_name: 'PostToolUse' }, nudge.state).output, null);
  const pre = hook({ hook_event_name: 'PreCompact' }, nudge.state);
  assert.equal(pre.output.hookSpecificOutput.hookEventName, 'PreCompact');
  assert.equal(typeof pre.output.hookSpecificOutput.additionalContext, 'string');
});

test('Codex handoff stays non-blocking on corrupt state, retains removal denial and restores the actual session note', t => {
  const root = tempDir(t), hooks = join(root, 'hooks'), handoff = join(root, 'handoff'), sid = 'thr_fixture-session';
  mkdirSync(hooks); mkdirSync(handoff);
  const script = join(hooks, 'hook.mjs');
  writeFileSync(script, readFileSync(new URL('../../codex/hooks.mjs', import.meta.url)));
  const run = input => spawnSync(process.execPath, [script], { input: JSON.stringify({ session_id: sid, ...input }), encoding: 'utf8' });
  const stateFile = join(handoff, sid + '.usage.json');
  const parent = JSON.stringify({ tokens: 340100, nudged: true });
  writeFileSync(stateFile, parent);
  for (const event of ['PostModelRequest', 'UserPromptSubmit', 'Stop']) {
    const child = run({ hook_event_name: event, agent_id: 'child', token_usage: { input_tokens: 99, output_tokens: 1 } });
    assert.equal(child.status, 0, child.stderr); assert.equal(child.stdout, '');
    assert.equal(readFileSync(stateFile, 'utf8'), parent);
  }
  for (const event of ['PostToolUse', 'PreToolUse']) {
    writeFileSync(join(handoff, sid + '.usage.json'), '{');
    const r = run({ hook_event_name: event, tool_input: { command: 'git status --short' } });
    assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout, '');
  }
  writeFileSync(join(handoff, sid + '.usage.json'), '{');
  const denied = run({ hook_event_name: 'PreToolUse', tool_input: { command: 'git worktree remove old' } });
  assert.equal(denied.status, 0);
  assert.equal(JSON.parse(denied.stdout).hookSpecificOutput.permissionDecision, 'deny');
  writeFileSync(join(handoff, sid + '.md'), 'The actual session note.\n' + 'x'.repeat(9000));
  const restored = run({ hook_event_name: 'SessionStart', source: 'compact' });
  assert.equal(restored.status, 0, restored.stderr);
  const context = JSON.parse(restored.stdout).hookSpecificOutput.additionalContext;
  assert.match(context, /The actual session note/); assert.match(context, /cut at 8 KB/);
  const pre = run({ hook_event_name: 'PreCompact' });
  const preContext = JSON.parse(pre.stdout).hookSpecificOutput.additionalContext;
  assert.match(preContext, /thr_fixture-session\.md/); assert.doesNotMatch(preContext, /<session_id>/);
});
