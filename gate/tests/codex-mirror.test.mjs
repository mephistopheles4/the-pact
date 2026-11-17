import assert from 'node:assert/strict';
import { test } from 'node:test';
import { render, mergeHooks, patchConfig, HOOK_EVENTS } from '../../codex/mirror.mjs';

test('Codex mirror preserves customized workflow and source effort while mapping stage models', () => {
  const input = { rules: '# The pact\nOpus, low; Sonnet, high\nKeep the full guard.\n', review: 'Read ~/.claude/pact/private/', agents: [{ name: 'reader-lens', description: 'Read text', effort: 'medium', body: 'One question.' }], commands: [{ name: 'scriptorium', description: 'Inventory', body: 'Read ~/.claude/skills/ and ~/.claude/agents/.' }], resources: [{ path: '.agents/skills/example/SKILL.md', text: 'Read ~/.claude/pact/review.md' }, { path: '.agents/skills/example/pixel.bin', bytes: Buffer.from([0, 255, 23]) }] };
  const files = render(input, { home: '/tmp/fixture-home', sourceCommit: 'a'.repeat(40) });
  const rules = files.find(f => f.path.endsWith('/workflow.md')).text;
  assert.match(rules, /GPT-6.1 Sol, low; GPT-6.1 Sol, high/);
  assert.match(rules, /Keep the full guard/);
  const role = files.find(f => f.path.endsWith('/reader-lens.toml')).text;
  assert.match(role, /model_reasoning_effort = "medium"/);
  assert.match(role, /model = "gpt-6.1-sol"/);
  assert.equal(files.find(f => f.path === '.codex/pact/review.md').text, 'Read ~/.codex/pact/private/');
  const command = files.find(f => f.path === '.agents/skills/scriptorium/SKILL.md').text;
  assert.match(command, /~\/\.agents\/skills\/ and ~\/\.codex\/agents\//);
  assert.match(command, /allow_implicit_invocation: false/);
  assert.equal(files.find(f => f.path.endsWith('example/SKILL.md')).text, 'Read ~/.codex/pact/review.md');
  assert.deepEqual(files.find(f => f.path.endsWith('pixel.bin')).bytes, Buffer.from([0, 255, 23]));
});

test('Codex hooks merge preserves unrelated handlers and does not duplicate its own', () => {
  const own = { type: 'command', command: 'pact-hooks' };
  const original = { hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'existing-hook' }] }] } };
  const merged = mergeHooks(original, own);
  assert.equal(merged.hooks.SessionStart[0].hooks[0].command, 'existing-hook');
  for (const event of HOOK_EVENTS) assert.equal(merged.hooks[event].flatMap(g => g.hooks).filter(h => h.command === 'pact-hooks').length, 1);
  assert.equal(merged.hooks.PreToolUse[0].matcher, 'Bash');
  assert.deepEqual(mergeHooks(merged, own), merged);
});

test('Codex hooks replace their script registration when Node or window changes', () => {
  const old = { type: 'command', command: '"/old/node" "/fixture/.codex/pact/hooks/codex-handoff.mjs" 400000', statusMessage: 'Pact handoff' };
  const next = { type: 'command', command: '"/new/node" "/fixture/.codex/pact/hooks/codex-handoff.mjs" 300000', timeout: 10, statusMessage: 'Pact handoff' };
  const unrelated = { type: 'command', command: '"/other/node" "/fixture/other-hook.mjs"' };
  const original = { hooks: { SessionStart: [{ matcher: 'compact', hooks: [old, unrelated] }] } };
  const merged = mergeHooks(original, next);
  assert.deepEqual(merged.hooks.SessionStart.flatMap(g => g.hooks), [unrelated, next]);
  assert.equal(merged.hooks.SessionStart[0].matcher, 'compact');
  assert.deepEqual(mergeHooks(merged, next), merged);
});

test('Codex command and agent references point to installed entrypoints', () => {
  const files = render({ rules: 'Read ~/.claude/commands/scry.md and $HOME/.claude/commands/finis.md; ~/.claude/agents/reader-lens.md and $HOME/.claude/agents/reader-lens.md.', review: '', agents: [], commands: [], resources: [] }, { home: '/fixture', sourceCommit: 'a'.repeat(40) });
  const text = files.find(f => f.path.endsWith('/workflow.md')).text;
  assert.match(text, /~\/\.agents\/skills\/scry\/SKILL\.md/);
  assert.match(text, /\$HOME\/\.agents\/skills\/finis\/SKILL\.md/);
  assert.match(text, /~\/\.codex\/agents\/reader-lens\.toml/);
  assert.match(text, /\$HOME\/\.codex\/agents\/reader-lens\.toml/);
});

test('Codex home-variable inventory paths match tilde translations', () => {
  const input = { rules: '$HOME/.claude/skills/example/ $HOME/.claude/agents/ $HOME/.claude/commands/', review: '', agents: [], commands: [], resources: [] };
  const text = render(input, { home: '/fixture', sourceCommit: 'a'.repeat(40) }).find(f => f.path.endsWith('/workflow.md')).text;
  assert.match(text, /\$HOME\/\.agents\/skills\/example\//);
  assert.match(text, /\$HOME\/\.codex\/agents\//);
  assert.match(text, /\$HOME\/\.agents\/skills\//);
  assert.doesNotMatch(text, /\$HOME\/\.claude\//);
});

test('Codex generated session-start handoff runs only after compaction', () => {
  const original = { hooks: { SessionStart: [{ matcher: '^startup$', hooks: [{ type: 'command', command: 'unrelated' }] }] } };
  const merged = mergeHooks(original, { type: 'command', command: 'pact-hook', statusMessage: 'Pact handoff' });
  assert.deepEqual(merged.hooks.SessionStart[0], original.hooks.SessionStart[0]);
  assert.equal(merged.hooks.SessionStart[1].matcher, '^compact$');
  assert.equal(merged.hooks.PreToolUse[0].matcher, 'Bash');
  assert.equal(merged.hooks.PreCompact[0].matcher, undefined);
});

test('Codex config edit preserves unrelated tables and refuses ambiguous duplicate keys', () => {
  const input = 'model = "old"\n\n[mcp_servers.x]\nurl = "https://example.invalid"\n';
  const output = patchConfig(input, { model: 'gpt-6.1-sol', model_auto_compact_token_limit: 400000 });
  assert.match(output, /model = "gpt-6.1-sol"/);
  assert.match(output, /model_auto_compact_token_limit = 400000/);
  assert.match(output, /\[mcp_servers.x\]\nurl = "https:\/\/example.invalid"/);
  assert.throws(() => patchConfig('model="one"\nmodel="two"\n', { model: 'new' }), /ambiguous/);
  assert.throws(() => patchConfig('"model"="one"\n', { model: 'new' }), /ambiguous/);
});
