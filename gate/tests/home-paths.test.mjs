// The home-path guard (#161, #10's change 2): no tracked file holds a home
// path with a real username, in any form a path takes in this repo's text.
// The forms are either slash, doubled backslashes, any case, a drive written
// as a folder (Git Bash, WSL), and Claude Code's dash-joined project-folder
// form. Placeholders pass, and so do single-letter names outside the dash form.
// The bad cases are written to a temp folder at test time, never tracked, and
// this file builds every path from parts, so it never matches itself. A hit is
// printed with its name masked, so a failing run never prints a real name.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { REPO } from './text.mjs';
import { tempDir, writeTree } from './tree.mjs';

/** The names a home path may carry: placeholders the docs and tests use. */
const ALLOWED = new Set(['runner', '<name>', '<n>', 'alice', 'bob', 'eve', 'someone', 'user', 'octocat']);

// A name in a path, and in a dash-joined folder, where a dash ends it (a dot
// in the name is a dash there too, so only its first part is captured).
const NAME = String.raw`([\p{L}\p{N}_][\p{L}\p{N}._-]*|<[^<>\s]*>)`;
const DASHED = String.raw`([\p{L}\p{N}_]+|<[^<>\s]*>)`;
const USERS = ['Us', 'ers'].join('');
const DIR = `${USERS}|${['ho', 'me'].join('')}`;
// Not after a letter or digit, so a URL's /users/x is not one; but a string escape
// such as \n may come just before it.
const START = String.raw`(?:(?<=\\[nrt])|(?<![\p{L}\p{N}]))`;
const FORMS = [
  // C:\Users\x, C:/Users/x, C:\\Users\\x, /home/x, /Users/x, /c/Users/x, /mnt/c/Users/x:
  // an optional drive, or a drive written as a folder, then any run of either slash.
  { re: new RegExp(String.raw`${START}(?:[A-Za-z]:|(?:/mnt)?/[A-Za-z](?=[\\/]))?[\\/]+(?:${DIR})[\\/]+${NAME}`, 'giud') },
  // Claude Code's project folders: C--Users-<name>-proj on Windows, or C--Users-<name> for the home folder.
  { re: new RegExp(String.raw`${START}[A-Za-z]--${USERS}-${DASHED}`, 'giud'), dashed: true },
  // And -home-<name>-proj or -Users-<name> elsewhere, where the folder starts with the dash.
  { re: new RegExp(String.raw`(?<![\p{L}\p{N}-])-(?:${DIR})-${DASHED}(?=[-\\/\r\n]|$)`, 'giud'), dashed: true },
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

function allowed(name, dashed) {
  const n = name.toLowerCase();
  if (ALLOWED.has(n)) return true;
  // A single letter, alone or as a file name such as a.md; never in the dash form,
  // where a dotted name is cut to its first letter.
  return !dashed && /^[a-z0-9](?:\.(?:md|txt|json|mjs|js))?$/.test(n);
}

/** Each home path with a real username in `text`, as { line, match } with the name masked. */
function homePaths(text, file = '') {
  const hits = [];
  for (const { re, dashed } of FORMS) {
    for (const m of text.matchAll(re)) {
      if (allowed(m[1], dashed)) continue;
      if (EXEMPT.some(e => e.file === file && m[0] === e.text)) continue;
      const [s, e] = m.indices[1].map(i => i - m.index);
      hits.push({ line: text.slice(0, m.index).split('\n').length, match: `${m[0].slice(0, s)}<a real name>${m[0].slice(e)}` });
    }
  }
  return hits;
}

/** A file's text: UTF-16 when it starts with a byte-order mark, else UTF-8. */
function textOf(p) {
  const b = readFileSync(p);
  if (b[0] === 0xff && b[1] === 0xfe) return b.subarray(2).toString('utf16le');
  if (b[0] === 0xfe && b[1] === 0xff) return Buffer.from(b.subarray(2)).swap16().toString('utf16le');
  return b.toString('utf8');
}

/** The hits in `files` (paths relative to `root`, with / separators), as "file:line: match" lines. */
function scan(root, files) {
  const out = [];
  for (const rel of files) {
    const p = join(root, ...rel.split('/'));
    if (!existsSync(p)) continue;
    for (const h of homePaths(textOf(p), rel)) out.push(`${rel}:${h.line}: ${h.match}`);
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
  'gitbash.txt': `cd ${['', 'c', 'Users', FAKE, 'proj'].join('/')}`,
  'wsl.txt': `cd ${['', 'mnt', 'c', 'Users', FAKE].join('/')}`,
  'escaped.json': `{ "p": "x\\n${['', 'home', FAKE, 'y'].join('/')}" }`,
  'initial.txt': WIN('\\', ['z', 'kowal'].join('.')),
  'accented.txt': WIN('\\', `${String.fromCodePoint(0xc9)}mile`),
  'utf16.txt': Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(WIN('\\'), 'utf16le')]),
  'dash.txt': `projects/${['C', '', 'Users', FAKE, 'WebstormProjects', 'proj'].join('-')}/memory`,
  'dash-home.txt': `projects/${['C', '', 'Users', FAKE].join('-')}/memory`,
  'dash-dotted.txt': `projects/${['C', '', 'Users', 'z', 'kowal', 'proj'].join('-')}/memory`,
  'dash-linux.txt': `projects/${['', 'home', FAKE, 'proj'].join('-')}/memory`,
  'dash-linux-home.txt': `projects/${['', 'home', FAKE].join('-')}/memory`,
};

test('bad cases: each form of a home path with a real name is caught, once per file', t => {
  const dir = tempDir(t, 'pact-home-paths-');
  writeTree(dir, BAD);
  const hits = scan(dir, Object.keys(BAD));
  for (const f of Object.keys(BAD)) {
    const mine = hits.filter(h => h.startsWith(`${f}:`));
    assert.equal(mine.length, 1, `${f}: ${JSON.stringify(mine)} in ${JSON.stringify(String(BAD[f]))}`);
  }
});

test('a hit is printed with its name masked', t => {
  const dir = tempDir(t, 'pact-home-paths-');
  writeTree(dir, BAD);
  const hits = scan(dir, Object.keys(BAD));
  assert.equal(hits.length, Object.keys(BAD).length);
  for (const h of hits) {
    assert.match(h, /<a real name>/, h);
    assert.doesNotMatch(h.toLowerCase(), new RegExp(`${FAKE}|kowal|mile`), h);
  }
});

test('the placeholders pass in every form, and single-letter names outside the dash form', t => {
  const files = {};
  for (const n of [...ALLOWED, 'a', 'Z', 'a.md']) {
    const slashed = [WIN('\\', n), WIN('/', n), WIN('\\\\', n), ['', 'home', n].join('/'), ['', 'c', 'Users', n].join('/'), ['', 'mnt', 'c', 'Users', n].join('/')];
    const dashed = ALLOWED.has(n) ? [`projects/${['C', '', 'Users', n, 'p'].join('-')}/`, `projects/${['C', '', 'Users', n].join('-')}/`, `projects/${['', 'home', n].join('-')}/`] : [];
    files[`${n.replace(/[<>.]/g, '_')}.txt`] = [...slashed, ...dashed].join('\n');
  }
  const dir = tempDir(t, 'pact-home-paths-');
  writeTree(dir, files);
  assert.deepEqual(scan(dir, Object.keys(files)), []);
});

test('not a home path: a URL, a $HOME path, a dot folder and a name that only starts like a home folder', () => {
  for (const text of [
    `https://api.github.com${['', 'users', FAKE].join('/')}`,
    `https://example.com${['', 'c', 'Users', FAKE].join('/')}`,
    '"$HOME/.claude/pact/cross.mjs"',
    `<tmp>${['', 'home', '.claude'].join('/')}`,
    `${['', 'homework', FAKE].join('/')}`,
    `pact-sandbox-${['home', FAKE, 'x'].join('-')}`,
    `tool --${['home', FAKE].join('-')} x`,
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
