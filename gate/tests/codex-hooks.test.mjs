import assert from 'node:assert/strict';
import { test } from 'node:test';
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
