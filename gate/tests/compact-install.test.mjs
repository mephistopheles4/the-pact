// The auto-compact window and the pact's hooks, through the install (#482):
// the default install (C1) and a set window with the keyed merge (C2). Off,
// the refused values and the dry run's warnings (C3, C4, C11) are in the
// install tests of the same name.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { EVENTS, config, files, live, pactGroup, script, windowCfg, writeLive } from './compact-harness.mjs';
import { applyBound, home, install, makeRepo } from './install-harness.mjs';

// C1
test('#482 C1: with no configuration, or one that leaves the key unset, the install writes the default window, the five groups and the script', t => {
  const repo = makeRepo(t);
  const a = home(t);
  const b = home(t);
  config(b, {});
  for (const h of [a, b]) {
    const r = applyBound(repo, h);
    assert.equal(r.code, 0, r.out);
    const s = live(h);
    assert.equal(s.autoCompactWindow, 400000);
    assert.deepEqual(Object.keys(s.hooks), EVENTS);
    for (const e of EVENTS) assert.deepEqual(s.hooks[e], [pactGroup(h, 400000, e)], e);
    assert.deepEqual(readFileSync(script(h)), readFileSync(join(repo, 'claude', 'hooks', 'compact-handoff.mjs')));
  }
  assert.deepEqual(files(a).filter(p => p !== 'pact/config.json'), files(b).filter(p => p !== 'pact/config.json'));
});

// C2
test('#482 C2: a set window reaches autoCompactWindow and every hook argument; the owner\'s hooks survive in place; a second install updates in place', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const ownerBefore = { hooks: [{ type: 'command', command: 'echo', args: ['before'] }] };
  const ownerAfter = { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo', args: ['after'] }] };
  const ownerOther = { hooks: [{ type: 'command', command: 'echo', args: ['other'] }] };
  // An owner's node hook with the pact's whole shape (type, timeout, a window) on another script of the same name: it differs only in its path.
  const ownerNode = { hooks: [{ type: 'command', command: 'node', args: [join(h, 'elsewhere', 'compact-handoff.mjs'), '400000'], timeout: 15 }] };
  assert.equal(applyBound(repo, h).code, 0);
  const first = live(h);
  first.hooks.PostToolUse = [ownerBefore, ...first.hooks.PostToolUse, ownerAfter];
  first.hooks.Stop = [ownerNode, ...first.hooks.Stop];
  first.hooks.Notification = [ownerOther];
  // An owner's command in the same group as the pact's; a second pact group that also holds an owner command; an event with a long name and an escape.
  const ownerInner = { type: 'command', command: 'echo', args: ['inside the pact group'] };
  const ownerInner2 = { type: 'command', command: 'echo', args: ['inside the second group'] };
  first.hooks.PreCompact[0].hooks.unshift(ownerInner);
  first.hooks.UserPromptSubmit = [...first.hooks.UserPromptSubmit, { hooks: [ownerInner2, structuredClone(first.hooks.UserPromptSubmit[0].hooks[0])] }];
  const weird = `W${'x'.repeat(60)}\u001b[31m`;
  first.hooks[weird] = [ownerOther];
  // Hooks that carry the pact's script path but are not the pact's entry, each differing in one thing.
  const pactHook = { type: 'command', command: 'node', args: [script(h), '400000'], timeout: 15 };
  const lookalikes = [
    { ...pactHook, command: 'bash' },
    { ...pactHook, type: 'http' },
    { ...pactHook, timeout: 30 },
    { ...pactHook, statusMessage: 'x' },
    { ...pactHook, args: [script(h), '400000', '--extra'] },
    { ...pactHook, args: [script(h), 'abc'] },
  ].map(x => ({ hooks: [x] }));
  first.hooks.Elsewhere = lookalikes;
  writeLive(h, first);
  config(h, windowCfg(600000));
  const dry = install(repo, h);
  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.stdout, /^auto-compact-window: on, 600000 tokens$/m, dry.out);
  assert.match(dry.stdout, /^ {2}hook PostToolUse: updated$/m, dry.out);
  for (const e of ['PostToolUse', 'Notification', 'Stop', 'Elsewhere', 'PreCompact', 'UserPromptSubmit']) assert.match(dry.stdout, new RegExp(`^WARN: settings\\.json holds a hook the pact did not install: ${e}$`, 'm'), `${e}\n${dry.out}`);
  assert.equal(dry.stdout.split('\n').filter(l => l === 'WARN: settings.json holds a hook the pact did not install: Elsewhere').length, 1, 'once per event');
  assert.match(dry.stdout, /did not install: Wx{39}\.\.\.\r?$/m, 'a live event name is cut at 40 characters');
  assert.doesNotMatch(dry.stdout, /\u001b/, 'and cleaned');
  assert.doesNotMatch(dry.stdout, /did not install: SessionStart/, dry.out);
  assert.equal(applyBound(repo, h).code, 0);
  const s = live(h);
  assert.equal(s.autoCompactWindow, 600000);
  assert.deepEqual(s.hooks.PostToolUse, [ownerBefore, pactGroup(h, 600000, 'PostToolUse'), ownerAfter]);
  assert.deepEqual(s.hooks.Notification, [ownerOther]);
  assert.deepEqual(s.hooks.Stop, [ownerNode, pactGroup(h, 600000, 'Stop')]);
  // Inside the pact's group only the pact's hook is replaced; a second pact hook is taken out of its group, which keeps the owner's command; the look-alikes stay.
  assert.deepEqual(s.hooks.PreCompact, [{ hooks: [ownerInner, pactGroup(h, 600000, 'PreCompact').hooks[0]] }]);
  assert.deepEqual(s.hooks.UserPromptSubmit, [pactGroup(h, 600000, 'UserPromptSubmit'), { hooks: [ownerInner2] }]);
  assert.deepEqual(s.hooks.Elsewhere, lookalikes);
  assert.deepEqual(s.hooks[weird], [ownerOther]);
  for (const e of EVENTS.filter(x => !['PostToolUse', 'Stop', 'PreCompact', 'UserPromptSubmit'].includes(x))) assert.deepEqual(s.hooks[e], [pactGroup(h, 600000, e)], e);
  // A second install changes nothing.
  const again = install(repo, h);
  assert.match(again.stdout, /^settings\.json: unchanged$/m, again.out);
  // Off takes only the pact's hooks: the owner's commands in shared groups, the look-alikes and every owner group stay, in order.
  config(h, windowCfg(0));
  assert.equal(applyBound(repo, h).code, 0);
  const off = live(h);
  assert.equal(Object.hasOwn(off, 'autoCompactWindow'), false);
  assert.deepEqual(off.hooks, { PostToolUse: [ownerBefore, ownerAfter], Stop: [ownerNode], PreCompact: [{ hooks: [ownerInner] }], UserPromptSubmit: [{ hooks: [ownerInner2] }], Notification: [ownerOther], Elsewhere: lookalikes, [weird]: [ownerOther] });
});

