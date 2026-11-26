// PACT-105 C32 and C22: through the bootstrap, a release installs with the
// apply line it prints, run from another folder, and a lower release or an older
// checkout warns that it is behind the last install. A throwaway local repo
// stands in for the pact's own.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { WIN, commitAll, git, home, install, makeRepo, nodeEnv, passed, spawnNodeInstall } from './install-harness.mjs';
import { REPO } from './text.mjs';
import { tempDir } from './tree.mjs';

const { main } = await import(pathToFileURL(join(REPO, 'bin', 'pact.mjs')).href);

/** The bootstrap's dry run against `repo`, as { code, out }. */
async function bootstrap(repo, dir) {
  const lines = [];
  // The whole PATH, as npx passes it: git's own folder alone is not enough on Windows.
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  const code = await main({ argv: ['--default', '--home', dir], env, url: pathToFileURL(repo).href, tty: false, say: l => lines.push(l), stdio: 'pipe' });
  return { code, out: lines.join('\n') };
}

/** Runs the apply line a dry run printed, word for word, from a folder that is neither the clone nor the repo. */
function apply(t, dry) {
  const line = dry.out.split('\n').map(l => l.trim()).find(l => l.includes(' --apply '));
  assert.ok(line, dry.out);
  const words = line.slice(line.indexOf(' node ') + 6).match(/'[^']*'|\S+/g).map(w => w.replace(/^'|'$/g, ''));
  assert.equal(line.startsWith(WIN ? '$env:NODE_OPTIONS = $null; node ' : 'env -u NODE_OPTIONS node '), true, line);
  const r = spawnNodeInstall(words, { cwd: tempDir(t, 'pact-elsewhere-'), encoding: 'utf8', env: nodeEnv(), timeout: 180_000 });
  passed({ code: r.status, stdout: r.stdout, out: `${r.stdout}${r.stderr}` });
}

const BEHIND = /behind the last install/;

test('release install: the printed line applies from another folder, and only an older release or checkout warns it is behind', async t => {
  const repo = makeRepo(t);
  git(repo, 'config', 'tag.gpgsign', 'false');
  git(repo, 'tag', 'v1.1.0');
  const dir = home(t);
  mkdirSync(join(dir, '.pact'));
  const config = '{"schema": 1}\n';
  writeFileSync(join(dir, '.pact', 'config.json'), config);
  const record = () => JSON.parse(readFileSync(join(dir, '.pact', 'install.json'), 'utf8'));

  const first = await bootstrap(repo, dir);
  assert.equal(first.code, 0, first.out);
  assert.doesNotMatch(first.out, BEHIND);
  apply(t, first);
  assert.equal(record().release, 'v1.1.0');
  assert.equal(readFileSync(join(dir, '.pact', 'config.json'), 'utf8'), config);

  writeFileSync(join(repo, 'note.md'), 'two\n');
  commitAll(repo, 'two');
  git(repo, 'tag', 'v1.2.0');
  const higher = await bootstrap(repo, dir);
  assert.equal(higher.code, 0, higher.out);
  assert.doesNotMatch(higher.out, /behind the last install|can't tell/);
  apply(t, higher);
  assert.equal(record().release, 'v1.2.0');

  git(repo, 'tag', '-d', 'v1.2.0');
  const lower = await bootstrap(repo, dir);
  assert.equal(lower.code, 0, lower.out);
  assert.match(lower.out, /^WARN: the release v1\.1\.0 is lower than the last install's v1\.2\.0: this install is behind the last install/m);

  git(repo, 'checkout', '-q', 'v1.1.0');
  const checkout = install(repo, dir);
  passed(checkout);
  assert.match(checkout.out, /^WARN: the last install's commit [0-9a-f]{40} is not in this checkout's history/m);
});
