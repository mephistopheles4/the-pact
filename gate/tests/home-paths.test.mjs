// The home-path guard (#161, #10's change 2): no tracked file holds a home
// path with a real username, in any form a path takes in this repo's text.
// The forms are either slash, doubled backslashes, any case, and Claude Code's
// dash-joined project-folder form. Placeholders and single-letter names pass.
// The bad cases are written to a temp folder at test time, never tracked, and
// this file builds every path from parts, so it never matches itself.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { REPO } from './text.mjs';
import { tempDir, writeTree } from './tree.mjs';

/** The names a home path may carry: placeholders the docs and tests use. */
const ALLOWED = new Set(['runner', '<name>', '<n>', 'alice', 'bob', 'eve', 'someone', 'user', 'octocat']);

// A name in a path, and in a dash-joined folder, where a dash ends it.
const NAME = String.raw`([A-Za-z0-9_][A-Za-z0-9._-]*|<[^<>\s]*>)`;
const DASHED = String.raw`([A-Za-z0-9_][A-Za-z0-9._]*|<[^<>\s]*>)`;
const USERS = ['Us', 'ers'].join('');
const DIR = `${USERS}|${['ho', 'me'].join('')}`;
const FORMS = [
  // C:\Users\x, C:/Users/x, C:\\Users\\x, /home/x, /Users/x: an optional drive, then
  // any run of either slash. Not after a letter or digit, so a URL's /users/x is not one.
  new RegExp(String.raw`(?<![A-Za-z0-9])(?:[A-Za-z]:)?[\\/]+(?:${DIR})[\\/]+${NAME}`, 'gi'),
  // Claude Code's project folders: C--Users-x-proj on Windows.
  new RegExp(String.raw`(?<![A-Za-z0-9])[A-Za-z]--${USERS}-${DASHED}-`, 'gi'),
  // And -home-x-proj or -Users-x-proj elsewhere, where the folder starts with the dash.
  new RegExp(String.raw`(?<![A-Za-z0-9-])-(?:${DIR})-${DASHED}-`, 'gi'),
];

// One route in one security-set plant reads as a home path and is an HTTP path.
// The plant is not edited (it is a practice case), so the exemption names the
// file and the exact text, and nothing else.
const ROUTE = ['', 'users', 'search'].join('/');
const PLANT = 'gate/tests/fixtures/practice/plants/A3-payload/';
const EXEMPT = [
  { file: `${PLANT}spec.md`, text: ROUTE },
  { file: `${PLANT}head/src/routes.mjs`, text: ROUTE },
];

function allowed(name) {
  const n = name.toLowerCase();
  // A single letter, alone or as a file name such as a.md.
  return ALLOWED.has(n) || /^[a-z0-9](?:\.(?:md|txt|json|mjs|js))?$/.test(n);
}

/** Each home path with a real username in `text`, as { line, match, name }. */
function homePaths(text, file = '') {
  const hits = [];
  for (const re of FORMS) {
    for (const m of text.matchAll(re)) {
      if (allowed(m[1])) continue;
      if (EXEMPT.some(e => e.file === file && m[0] === e.text)) continue;
      hits.push({ line: text.slice(0, m.index).split('\n').length, match: m[0], name: m[1] });
    }
  }
  return hits;
}

/** The hits in `files` (paths relative to `root`, with / separators), as "file:line: match" lines. */
function scan(root, files) {
  const out = [];
  for (const rel of files) {
    const p = join(root, ...rel.split('/'));
    if (!existsSync(p)) continue;
    for (const h of homePaths(readFileSync(p, 'latin1'), rel)) out.push(`${rel}:${h.line}: ${h.match}`);
  }
  return out;
}

test('no tracked file holds a home path with a real username', () => {
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: REPO, encoding: 'utf8' }).split('\0').filter(Boolean);
  assert.ok(tracked.length > 100, `git ls-files listed ${tracked.length} files`);
  assert.deepEqual(scan(REPO, tracked), []);
});

// A name no allow-list entry covers, and a path built from parts.
const FAKE = ['z', 'ed'].join('');
const WIN = (sep, name = FAKE, users = 'Users') => ['C:', users, name, 'proj'].join(sep);
const BAD = {
  'backslash.txt': WIN('\\'),
  'slash.txt': WIN('/'),
  'doubled.json': `{ "p": "${WIN('\\\\')}" }`,
  'upper.txt': WIN('\\', FAKE.toUpperCase(), 'USERS'),
  'lower.txt': WIN('\\', FAKE, 'users'),
  'mixed.txt': ['C:', 'Users', FAKE].join('\\') + '/proj',
  'no-drive.txt': `see ${['', 'Users', FAKE, 'proj'].join('\\')}`,
  'linux.sh': `cd ${['', 'home', FAKE, 'ws'].join('/')}`,
  'mac.txt': `cd ${['', 'Users', FAKE, 'ws'].join('/')}`,
  'dash.txt': `projects/${['C', '', 'Users', FAKE, 'WebstormProjects', 'proj'].join('-')}/memory`,
  'initial.txt': WIN('\\', ['z', 'kowal'].join('.')),
  'dash-linux.txt': `projects/${['', 'home', FAKE, 'proj'].join('-')}/memory`,
};

test('bad cases: each form of a home path with a real name is caught, once per file', t => {
  const dir = tempDir(t, 'pact-home-paths-');
  writeTree(dir, BAD);
  const hits = scan(dir, Object.keys(BAD));
  for (const f of Object.keys(BAD)) {
    const mine = hits.filter(h => h.startsWith(`${f}:`));
    assert.equal(mine.length, 1, `${f}: ${JSON.stringify(mine)} in ${JSON.stringify(BAD[f])}`);
  }
});

test('the placeholders and single-letter names pass in every form', t => {
  const names = [...ALLOWED, 'a', 'Z', 'a.md'];
  const files = {};
  for (const n of names) {
    files[`${n.replace(/[<>.]/g, '_')}.txt`] = [WIN('\\', n), WIN('/', n), WIN('\\\\', n), ['', 'home', n].join('/'), `projects/${['C', '', 'Users', n, 'p'].join('-')}/`].join('\n');
  }
  const dir = tempDir(t, 'pact-home-paths-');
  writeTree(dir, files);
  assert.deepEqual(scan(dir, Object.keys(files)), []);
});

test('not a home path: a URL, a $HOME path, a dot folder and a name that only starts like a home folder', () => {
  for (const text of [
    `https://api.github.com${['', 'users', FAKE].join('/')}`,
    '"$HOME/.claude/pact/cross.mjs"',
    `<tmp>${['', 'home', '.claude'].join('/')}`,
    `${['', 'homework', FAKE].join('/')}`,
    `pact-sandbox-${['home', FAKE, 'x'].join('-')}`,
  ]) assert.deepEqual(homePaths(text), [], text);
});

test('the route exemption holds only for its own file and text', t => {
  const dir = tempDir(t, 'pact-home-paths-');
  const line = `GET ${ROUTE}?name=x`;
  writeTree(dir, { [`${PLANT}spec.md`]: line, 'elsewhere.md': line, [`${PLANT}other.md`]: `GET ${['', 'users', FAKE].join('/')}` });
  assert.deepEqual(scan(dir, [`${PLANT}spec.md`]), []);
  assert.equal(scan(dir, ['elsewhere.md']).length, 1);
  assert.equal(scan(dir, [`${PLANT}other.md`]).length, 1);
});
