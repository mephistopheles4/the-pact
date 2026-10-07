// The user configuration file through the install script (#53, slice 3), end
// to end against a throwaway repo and a throwaway -ClaudeHome. Never touches
// ~/.claude.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { WIN, home, install, listTree, makeRepo, refused } from './install-harness.mjs';
import { tempDir } from './helpers.mjs';

const CONFIG_REL = ['pact', 'config.json'];

/** The user configuration file's path under the Claude home `h`, with its folder made. */
function configPath(h) {
  mkdirSync(join(h, 'pact'), { recursive: true });
  return join(h, ...CONFIG_REL);
}

// ------------------------------------------------------------ fail-closed "no file"

test('bad case: a configuration path that is a folder refuses, and -Apply writes nothing', t => {
  const repo = makeRepo(t);
  const h = home(t);
  mkdirSync(configPath(h));
  const r = install(repo, h, { apply: true });
  refused(r);
  assert.ok(!listTree(h).includes('CLAUDE.md'), listTree(h).join('\n'));
});

test('bad case: a configuration path that is a dangling link refuses, and -Apply writes nothing', t => {
  const repo = makeRepo(t);
  const h = home(t);
  // A junction to a folder that does not exist: plantable on Windows without
  // the symlink privilege, and a dangling link to Node and to the attribute test.
  symlinkSync(join(tempDir(t), 'gone'), configPath(h), 'junction');
  const r = install(repo, h, { apply: true });
  refused(r);
  assert.ok(!listTree(h).includes('CLAUDE.md'), listTree(h).join('\n'));
});

/** Make `p` unreadable to this user; returns a function that undoes it, or null when it can't be planted. */
function denyRead(p) {
  if (WIN) {
    const deny = spawnSync('icacls', [p, '/deny', '*S-1-1-0:(R)'], { encoding: 'utf8' });
    if (deny.status !== 0) return null;
    return () => spawnSync('icacls', [p, '/remove:d', '*S-1-1-0'], { encoding: 'utf8' });
  }
  chmodSync(p, 0o000);
  try {
    readFileSync(p);
    chmodSync(p, 0o600);
    return null; // still readable (root): can't be planted here
  } catch {
    return () => chmodSync(p, 0o600);
  }
}

test('bad case: an unreadable configuration file refuses, and -Apply writes nothing', t => {
  const repo = makeRepo(t);
  const h = home(t);
  const p = configPath(h);
  writeFileSync(p, '{"schema": 1, "settings": {"usage-pause": 90}}\n');
  const undo = denyRead(p);
  if (!undo) {
    t.skip('cannot make a file unreadable here (not run)');
    return;
  }
  let r;
  try {
    assert.throws(() => readFileSync(p), 'the planted file is still readable, so the test would pass for the wrong reason');
    r = install(repo, h, { apply: true });
  } finally {
    undo();
  }
  refused(r);
  assert.ok(!listTree(h).includes('CLAUDE.md'), listTree(h).join('\n'));
});
