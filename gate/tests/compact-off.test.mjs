// The auto-compact window turned off, refused, and warned about (#482 C3, C4,
// C11), through the install. C1 and C2 are in compact-install.test.mjs.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { config, files, live, windowCfg, withoutNotice, writeLive } from './compact-harness.mjs';
import { applyBound, home, install, makeRepo } from './install-harness.mjs';

// C3: Off against a repo with no hooks feature at all (the payload as it was: no script, an overlay without the hooks block), installed with the same Off.
// The base commit itself is not in a shallow CI checkout, so the feature-less payload stands for it.
for (const [name, ownerLive] of [
  ['a live file with no hooks', { permissions: { allow: ['Read'] }, theme: 'dark' }],
  ['a live file with owner hooks, one on an event of its own and an empty list', { hooks: { PostToolUse: [{ hooks: [{ type: 'command', command: 'echo', args: ['mine'] }] }, { hooks: [{ type: 'command', command: 'node', args: ['/elsewhere/compact-handoff.mjs', '1'] }] }], Notification: [] } }],
]) {
  test(`#482 C3: Off installs what the pact installed without the feature, and on then off restores it (${name})`, t => {
    const repo = makeRepo(t);
    const base = makeRepo(t, root => {
      const p = join(root, 'claude', 'settings.overlay.json');
      const o = JSON.parse(readFileSync(p, 'utf8'));
      delete o.hooks;
      writeFileSync(p, `${JSON.stringify(o, null, 2)}\n`);
      rmSync(join(root, 'claude', 'hooks'), { recursive: true });
    });
    const a = home(t);
    const b = home(t);
    for (const h of [a, b]) writeLive(h, ownerLive);
    // A: on by default (with a configuration that leaves the key unset, so the rules are the same text as Off's), then off. B: off, on the payload without the feature.
    config(a, {});
    assert.equal(applyBound(repo, a).code, 0);
    assert.ok(live(a).autoCompactWindow);
    const onRules = readFileSync(join(a, 'CLAUDE.md'), 'utf8');
    config(a, windowCfg(0));
    // The Off dry run names what it removes.
    const dry = install(repo, a);
    assert.match(dry.stdout, /^ {2}- autoCompactWindow$/m, dry.out);
    for (const e of ['PostToolUse', 'UserPromptSubmit', 'Stop', 'PreCompact', 'SessionStart']) assert.match(dry.stdout, new RegExp(`^ {2}hook ${e}: removed$`, 'm'), dry.out);
    assert.doesNotMatch(dry.stdout, /yours, not checked\): [^\n]*autoCompactWindow/, dry.out);
    const off = applyBound(repo, a);
    assert.equal(off.code, 0, off.out);
    // The owner's hooks stand as they were written, an empty list included, whatever the other side did.
    if (ownerLive.hooks) assert.deepEqual(live(a).hooks, ownerLive.hooks);
    else assert.equal(Object.hasOwn(live(a), 'hooks') || Object.hasOwn(live(a), 'autoCompactWindow'), false);
    // The rules file differs from the on install only in the notice's two lines.
    const offRules = readFileSync(join(a, 'CLAUDE.md'), 'utf8');
    assert.notEqual(offRules, onRules);
    assert.equal(withoutNotice(offRules), withoutNotice(onRules));
    config(b, windowCfg(0));
    assert.equal(applyBound(base, b).code, 0);
    assert.equal(readFileSync(join(a, 'settings.json'), 'utf8'), readFileSync(join(b, 'settings.json'), 'utf8'));
    assert.deepEqual(files(a), files(b));
    for (const p of files(a)) assert.deepEqual(readFileSync(join(a, p)), readFileSync(join(b, p)), p);
    assert.equal(readdirSync(join(a, 'pact', 'hooks')).length, 0, 'the installed script is gone');
    assert.equal(Object.hasOwn(JSON.parse(readFileSync(join(a, '.pact-install.json'), 'utf8')), 'autoCompactWindow'), false, 'the record holds no window');
  });
}

// C4
test('#482 C4: a window off the range or its step, and a value that is no number, are refused at render and at install', t => {
  const repo = makeRepo(t);
  for (const bad of [99999, 50000, 1000001, 1100000, 410001, 400000.5, -1, '400000', true, null]) {
    const h = home(t);
    config(h, windowCfg(bad));
    const r = install(repo, h);
    assert.notEqual(r.code, 0, `${JSON.stringify(bad)}\n${r.out}`);
    assert.match(r.stdout, /FAIL config-value: .*auto-compact-window must be 0, or a whole number from 100000 to 1000000 in steps of 10000/, `${JSON.stringify(bad)}\n${r.out}`);
  }
  for (const ok of [0, 100000, 400000, 410000, 1000000]) {
    const h = home(t);
    config(h, windowCfg(ok));
    const r = install(repo, h);
    assert.equal(r.code, 0, `${ok}\n${r.out}`);
  }
});

// C11
test('#482 C11: the dry run warns once per event for a hook the pact did not install, and names the window only when the configuration sets it', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const owner = { hooks: [{ type: 'command', command: 'echo' }] };
  writeLive(h, { hooks: { Stop: [owner, owner], PostToolUse: [owner] } });
  const dry = install(repo, h);
  assert.equal(dry.code, 0, dry.out);
  const warns = dry.stdout.split('\n').filter(l => l.includes('hook the pact did not install'));
  assert.deepEqual(warns.map(l => l.trim()).sort(), ['WARN: settings.json holds a hook the pact did not install: PostToolUse', 'WARN: settings.json holds a hook the pact did not install: Stop']);
  assert.doesNotMatch(dry.stdout, /the user configuration sets auto-compact-window/, dry.out);
  assert.doesNotMatch(dry.stdout, /the pact's default configuration sets auto-compact-window/, dry.out);
  assert.doesNotMatch(dry.stdout, /yours, not checked\): [^\n]*\bhooks\b/, 'hooks is not one of the yours');
  // A user configuration that leaves the key unset names it no more than none does.
  config(h, {});
  const unset = install(repo, h);
  assert.doesNotMatch(unset.stdout, /sets auto-compact-window/, unset.out);
  config(h, windowCfg(500000));
  const set = install(repo, h);
  assert.match(set.stdout, /^ {2}WARN: the user configuration sets auto-compact-window to 500000\.$/m, set.out);
  // The pact's own hooks, once installed, draw no warning.
  assert.equal(applyBound(repo, h).code, 0);
  assert.doesNotMatch(install(repo, h).stdout, /did not install: (UserPromptSubmit|PreCompact|SessionStart)/);
});
