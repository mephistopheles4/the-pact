// The agent-identity gitconfig under real git (#603, S7; C4): the text the install checks, with GIT_CONFIG_GLOBAL
// pointed at it and GIT_CONFIG_SYSTEM at a temporary config whose helper is a stub returning a canary. Every config
// is in a temporary folder, the environment is built from scratch, and no check prints what `fill` returned.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { identityGitconfigText } from '../install-core.mjs';
import { REPO } from './text.mjs';
import { tempDir } from './tree.mjs';

const APP = { app_id: 2000001, slug: 'example-owner-claude', bot_login: 'example-owner-claude[bot]', bot_id: 3000001 };
const slash = p => p.replaceAll('\\', '/');
const CANARY = 'CANARY-SECRET-9d1f';
const STUB = 'STUB-PACT-TOKEN-4c2a';

/**
 * A world of temporary folders: the user home with its own .gitconfig, the Claude home holding the real helper, a
 * system config whose helper returns the canary, the gitconfig the install checks, and a repository.
 */
function world(t, { helper } = {}) {
  const root = realpathSync(tempDir(t, 'pact-gitconfig-'));
  const userHome = join(root, 'user');
  const claudeHome = join(userHome, '.claude');
  mkdirSync(join(claudeHome, 'pact', 'tools'), { recursive: true });
  mkdirSync(join(root, 'repo'));
  copyFileSync(join(REPO, 'claude', 'tools', 'gh-app.mjs'), join(claudeHome, 'pact', 'tools', 'gh-app.mjs'));
  writeFileSync(join(root, 'canary.mjs'), `if (process.argv[2] === 'get') process.stdout.write('username=canary\\npassword=${CANARY}\\n');\n`);
  writeFileSync(join(root, 'stub.mjs'), `if (process.argv[2] === 'get') process.stdout.write('username=x-access-token\\npassword=${STUB}\\n');\n`);
  const node = slash(process.execPath);
  // A config value's own double quotes are quoting, so a command with quotes goes in as one quoted, escaped value.
  const helperValue = path => `"${`!"${node}" "${slash(path)}"`.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
  writeFileSync(join(root, 'system.gitconfig'), `[credential]\n  helper = ${helperValue(join(root, 'canary.mjs'))}\n`);
  writeFileSync(join(userHome, '.gitconfig'), '[user]\n  name = Owner Own\n  signingkey = OWNERKEY\n[alias]\n  owneralias = status\n');
  let text = identityGitconfigText({ userHome, claudeHome, nodePath: process.execPath, app: APP, xdg: false });
  // The stub stands in for the pact helper in the tests that need a token to come out; the real one fails closed.
  if (helper === 'stub') {
    const lines = text.split('\n').map(l => (l.startsWith('  helper = ') ? `  helper = ${helperValue(join(root, 'stub.mjs'))}` : l));
    assert.notEqual(lines.join('\n'), text, 'the helper line was found');
    text = lines.join('\n');
  }
  writeFileSync(join(claudeHome, 'pact', 'gh-app-claude.gitconfig'), text);
  const env = {
    PATH: process.env.PATH,
    ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
    HOME: userHome,
    USERPROFILE: userHome,
    TEMP: root,
    TMP: root,
    TMPDIR: root,
    GIT_CONFIG_SYSTEM: join(root, 'system.gitconfig'),
    GIT_CONFIG_GLOBAL: join(claudeHome, 'pact', 'gh-app-claude.gitconfig'),
    GIT_TERMINAL_PROMPT: '0',
  };
  const cwd = join(root, 'repo');
  const git = (args, input, extra = {}) => spawnSync('git', args, { cwd, env: { ...env, ...extra }, input, encoding: 'utf8', timeout: 30_000 });
  assert.equal(git(['init', '-q']).status, 0);
  return { root, git, env, cwd };
}
const FILL = 'protocol=https\nhost=github.com\npath=example-owner/repo.git\n\n';
/** The helpers git would run for any url, with where each is set. */
const helpers = w => w.git(['config', '--show-origin', '--get-regexp', '^credential\\..*helper$']);

// #603 C4: the include loads, the empty helper line drops the system helper, and a fill reaches the pact helper alone.
test('the agent gitconfig under real git: every helper is in a temporary folder, the include loads, and fill reaches only the pact helper, never the canary', t => {
  const w = world(t, { helper: 'stub' });
  const listed = helpers(w);
  // Git quotes a path it prints with backslashes, and doubles the slashes; compare as plain forward-slash paths.
  const plain = p => p.replace(/^file:/, '').replace(/^"|"$/g, '').replace(/[\\/]+/g, '/').toLowerCase();
  const origins = listed.stdout.split('\n').filter(Boolean).map(l => plain(l.split('\t')[0]));
  assert.ok(origins.length >= 3 && origins.every(o => o.startsWith(plain(w.root))), 'every helper origin is inside the temporary folder');
  assert.equal(w.git(['config', 'user.signingkey']).stdout.trim(), 'OWNERKEY', 'the owner\'s own global settings load through the include');
  assert.equal(w.git(['config', 'alias.owneralias']).stdout.trim(), 'status');
  const fill = w.git(['credential', 'fill'], FILL);
  assert.equal(fill.status, 0);
  assert.ok(!`${fill.stdout}${fill.stderr}`.includes(CANARY), 'the system helper is dropped');
  assert.ok(fill.stdout.includes(STUB), 'the pact helper answers');
});

// #603 C4: the bot's name and email apply, and a repository's own user.name wins.
test('the agent gitconfig under real git: the bot is the author, and a repository\'s own user.name wins', t => {
  const w = world(t);
  assert.equal(w.git(['config', 'user.name']).stdout.trim(), APP.bot_login);
  assert.equal(w.git(['config', 'user.email']).stdout.trim(), `${APP.bot_id}+${APP.bot_login}@users.noreply.github.com`);
  assert.equal(w.git(['config', '--local', 'user.name', 'Repo Own']).status, 0);
  assert.equal(w.git(['config', 'user.name']).stdout.trim(), 'Repo Own');
});

// #603 C4: a refused mint fails the fill with no prompt, and the canary never comes out: no fall back to the owner's helper.
test('the agent gitconfig under real git: with the real helper and no pin, fill fails closed with no prompt and never returns the canary', t => {
  const w = world(t);
  const fill = w.git(['credential', 'fill'], FILL);
  assert.notEqual(fill.status, 0, 'the fill fails');
  assert.ok(!`${fill.stdout}${fill.stderr}`.includes(CANARY), 'no fall back to the system helper');
  assert.ok(!fill.stdout.includes('password='), 'no credential came out');
});
