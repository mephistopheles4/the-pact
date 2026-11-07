// The auto-compact window and the pact's hooks, through the install (#482):
// the default install (C1), a set window and the keyed merge (C2), Off (C3),
// the refused values (C4) and the dry run's warnings (C11). The hook itself is
// in compact-hook.test.mjs, the seam A checks in settings.test.mjs.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { EVENTS, config, files, live, pactGroup, script, windowCfg, withoutNotice, writeLive } from './compact-harness.mjs';
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

test('#482: the dry run shows the window and each hook event, and a quiet next run', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const dry = install(repo, h);
  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.stdout, /^auto-compact-window: on, 400000 tokens$/m, dry.out);
  assert.match(dry.stdout, /^ {2}set autoCompactWindow = 400000$/m, dry.out);
  for (const e of EVENTS) assert.match(dry.stdout, new RegExp(`^ {2}hook ${e}: added$`, 'm'), dry.out);
  assert.doesNotMatch(dry.stdout, /did not install/, dry.out);
  assert.equal(applyBound(repo, h).code, 0);
  const again = install(repo, h);
  assert.match(again.stdout, /^auto-compact-window: on, 400000 tokens$/m, again.out);
  assert.doesNotMatch(again.stdout, /^ {2}(set autoCompactWindow|hook )/m, again.out);
  assert.match(again.stdout, /^settings\.json: unchanged$/m, again.out);
});

// C2
test('#482 C2: a set window reaches autoCompactWindow and every hook argument; the owner\'s groups survive in order; a second install updates in place', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const ownerBefore = { hooks: [{ type: 'command', command: 'echo', args: ['before'] }] };
  const ownerAfter = { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo', args: ['after'] }] };
  const ownerOther = { hooks: [{ type: 'command', command: 'echo', args: ['other'] }] };
  assert.equal(applyBound(repo, h).code, 0);
  const first = live(h);
  first.hooks.PostToolUse = [ownerBefore, ...first.hooks.PostToolUse, ownerAfter];
  first.hooks.Notification = [ownerOther];
  writeLive(h, first);
  config(h, windowCfg(600000));
  const dry = install(repo, h);
  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.stdout, /^auto-compact-window: on, 600000 tokens$/m, dry.out);
  assert.match(dry.stdout, /^ {2}hook PostToolUse: updated$/m, dry.out);
  assert.match(dry.stdout, /^WARN: settings\.json holds a hook the pact did not install: PostToolUse$/m, dry.out);
  assert.match(dry.stdout, /^WARN: settings\.json holds a hook the pact did not install: Notification$/m, dry.out);
  assert.doesNotMatch(dry.stdout, /did not install: (Stop|PreCompact|SessionStart|UserPromptSubmit)/, dry.out);
  assert.equal(applyBound(repo, h).code, 0);
  const s = live(h);
  assert.equal(s.autoCompactWindow, 600000);
  assert.deepEqual(s.hooks.PostToolUse, [ownerBefore, pactGroup(h, 600000, 'PostToolUse'), ownerAfter]);
  assert.deepEqual(s.hooks.Notification, [ownerOther]);
  for (const e of EVENTS.filter(x => x !== 'PostToolUse')) assert.deepEqual(s.hooks[e], [pactGroup(h, 600000, e)], e);
  // A second install changes nothing.
  const again = install(repo, h);
  assert.match(again.stdout, /^settings\.json: unchanged$/m, again.out);
});

