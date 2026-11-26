// PACT-105 C32 and C22: what the install decides about a release: the option
// that names it, the apply line it prints, the record that holds it and the
// warning that it is behind the last install. Decisions only; no install runs.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as core from '../install-core.mjs';

const ID = c => c.repeat(40);
const refusal = fn => {
  try {
    fn();
  } catch (e) {
    return e.rule;
  }
  return null;
};

test('release: the option takes only a tag named exactly v1.<n>.0, v1.<n>.0-beta.<k> or the legacy v1.<n>.0-rc.<k>', () => {
  assert.equal(core.parseArgs(['--release', 'v1.12.0'], 'linux').release, 'v1.12.0');
  assert.equal(core.parseArgs(['--release', 'v1.12.0-rc.3'], 'linux').release, 'v1.12.0-rc.3');
  assert.equal(core.parseArgs(['--release', 'v1.12.0-beta.3'], 'linux').release, 'v1.12.0-beta.3');
  assert.equal(core.parseArgs([], 'linux').release, null);
  for (const bad of ['v1.12', 'v2.1.0', 'v1.012.0', 'v1.1.1', 'v1.1.0-rc1', 'v1.1.0-rc.0', 'v1.1.0-rc.01', 'v1.1.0-rc.1-x', 'v2.1.0-rc.1', 'v1.1.0-beta1', 'v1.1.0-beta.0', 'v1.1.0-beta.01', 'v1.1.0-beta.1-x', 'v2.1.0-beta.1', 'v1.1.0-alpha.1', "v1.1.0' x", '1.1.0']) assert.equal(refusal(() => core.parseArgs(['--release', bad], 'linux')), 'args-release', bad);
});

test('release: the apply line names the clone\'s own script by its full path, quoted for the shell, with the release', () => {
  const from = { release: 'v1.3.0', script: "/home/o'a b/.pact/source/x/gate/install.mjs" };
  assert.equal(core.applyLine([], ID('a'), null, 'linux', from), `env -u NODE_OPTIONS node '/home/o'\\''a b/.pact/source/x/gate/install.mjs' --release v1.3.0 --apply --commit ${ID('a')}`);
  assert.equal(
    core.applyLine([['--home', 'C:\\t']], ID('a'), ID('b') + 'c'.repeat(24), 'win32', { release: 'v1.3.0', script: "C:\\o'a\\gate\\install.mjs" }),
    `$env:NODE_OPTIONS = $null; node 'C:\\o''a\\gate\\install.mjs' --home 'C:\\t' --release v1.3.0 --apply --commit ${ID('a')} --rendered-hash ${ID('b')}${'c'.repeat(24)}`,
  );
});

test('release: the record holds the release of the last apply, and none after a checkout', () => {
  const base = { commit: ID('a'), digest: null, harnesses: [], userHash: null, blockHashes: new Map(), files: new Map(), entries: [], gateNow: new Map() };
  assert.equal(core.parseRecord(core.recordText({ ...base, release: 'v1.4.0' })).release, 'v1.4.0');
  assert.equal(core.parseRecord(core.recordText({ ...base, release: 'v1.4.0-beta.2' })).release, 'v1.4.0-beta.2');
  // A record an earlier install wrote under the legacy name still loads.
  assert.equal(core.parseRecord(core.recordText({ ...base, release: 'v1.4.0-rc.2' })).release, 'v1.4.0-rc.2');
  assert.equal(core.parseRecord(core.recordText(base)).release, null);
  assert.equal(Object.hasOwn(JSON.parse(core.recordText(base)), 'release'), false);
  assert.equal(core.parseRecord(core.recordText({ ...base, release: 'anything\u001b[2J' })).release, null);
});

const behind = (last, now) => core.behindLine(last.commit ?? null, ID('a'), new Set([ID('a')]), now, last.release ?? null);

test('release: a release lower than the recorded one warns "behind the last install", by number', () => {
  assert.match(behind({ commit: ID('b'), release: 'v1.10.0' }, 'v1.9.0'), /^WARN: .*v1\.9\.0.*v1\.10\.0.*behind the last install/);
});

test('release: within one kind, a higher k ranks higher by number', () => {
  assert.match(behind({ commit: ID('b'), release: 'v1.10.0-beta.10' }, 'v1.10.0-beta.2'), /behind the last install/);
  assert.equal(behind({ commit: ID('b'), release: 'v1.10.0-beta.2' }, 'v1.10.0-beta.10'), null);
});

// The pact's own order within a minor, not semver's: every -rc, then every -beta, then the stable release (spec 0009 S2).
const ORDER = ['v1.1.0-rc.1', 'v1.1.0-rc.3', 'v1.1.0-beta.1', 'v1.1.0-beta.2', 'v1.1.0', 'v1.2.0-rc.9', 'v1.2.0-beta.1'];

test('release: behind ranks -rc below -beta below the stable release, by minor first', () => {
  for (const [i, lower] of ORDER.entries()) {
    for (const higher of ORDER.slice(i + 1)) {
      assert.match(behind({ commit: ID('b'), release: higher }, lower) ?? '', /behind the last install/, `${lower} under ${higher}`);
      assert.equal(behind({ commit: ID('b'), release: lower }, higher), null, `${higher} over ${lower}`);
    }
  }
});

test('release: a higher or equal release does not warn, though a shallow clone holds no history', () => {
  assert.equal(behind({ commit: ID('b'), release: 'v1.9.0' }, 'v1.10.0'), null);
  assert.equal(behind({ commit: ID('a'), release: 'v1.9.0' }, 'v1.9.0'), null);
  assert.equal(behind({}, 'v1.1.0'), null);
});

test('release: after a checkout install at another commit, a release says it cannot tell which is older', () => {
  assert.match(behind({ commit: ID('b') }, 'v1.9.0'), /^WARN: the last install came from a checkout .*can't tell/);
  assert.equal(behind({ commit: ID('a') }, 'v1.9.0'), null);
});

test('release: a checkout without the recorded release\'s commit in its history warns as before', () => {
  assert.match(behind({ commit: ID('b'), release: 'v1.9.0' }, null), /is not in this checkout's history/);
  assert.equal(behind({ commit: ID('a'), release: 'v1.9.0' }, null), null);
});
