// The renderer's project mode (#53, slice 5): the project rules file, from the
// user's effective values and the project's tighter ones. Driven through its
// command line, as the install script runs it, and judged on what it prints
// and the file it writes. The expected file and digest are built here, never
// taken from the renderer.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { copyGate, plantModule } from './gate-files.mjs';
import { RENDER, lastLine } from './text.mjs';
import { tempDir } from './tree.mjs';

const sha256 = b => createHash('sha256').update(b).digest('hex');
const PROJECT_REL = ['.claude', 'pact-config.json'];
const OUTPUT = 'pact-project.md';

/** The project rules file the tests expect, for the usage pause at `n`. */
function expectedFile(n) {
  return [
    '# Pact settings for this project',
    '',
    "The pact's installer wrote this file from this project's pact configuration. Each line can only make the pact stricter here.",
    '',
    `- **Usage pause.** In this project, wait for my go-ahead when the weekly limit is above ${n}% or above the line in my user rules, whichever is lower.`,
    '',
  ].join('\n');
}

/** A Claude home folder, with a user file holding `user` when given. */
function userHome(t, user) {
  const h = tempDir(t, 'pact-render-home-');
  if (user !== undefined) {
    mkdirSync(join(h, 'pact'));
    writeFileSync(join(h, 'pact', 'config.json'), user);
  }
  return h;
}

/** A project folder, with a project file holding `content` when given. */
function project(t, content) {
  const p = tempDir(t, 'pact-render-project-');
  if (content !== undefined) {
    mkdirSync(join(p, '.claude'));
    writeFileSync(join(p, ...PROJECT_REL), content);
  }
  return p;
}

function render(t, home, proj, script = RENDER) {
  const dir = tempDir(t, 'pact-render-out-');
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  const r = spawnSync(process.execPath, [script, 'project', dir, home, proj], { encoding: 'utf8', env });
  let bytes = null;
  try {
    bytes = readFileSync(join(dir, OUTPUT));
  } catch {}
  return { code: r.status, stdout: r.stdout, out: r.stdout + r.stderr, dir, bytes };
}

function refusedWith(r, rule, reason) {
  assert.equal(r.code, 1, r.out);
  assert.equal(lastLine(r.stdout), 'RESULT: fail', r.out);
  assert.match(r.stdout, new RegExp(`^FAIL ${rule}: `, 'm'), r.out);
  if (reason) assert.match(r.stdout, reason, r.out);
  assert.doesNotMatch(r.stdout, /^(RENDERED|CONFIG|PROJECT|DIGEST|VALUE) /m, r.out);
  assert.deepEqual(readdirSync(r.dir), [], 'a refused render writes no file');
}

const projectFile = n => `{"schema": 1, "settings": {"usage-pause": ${n}}}\n`;
const userFile = n => `{"schema": 1, "settings": {"usage-pause": ${n}}}\n`;

// ------------------------------------------------------------ layering

test('with no user file, a project value under the default installs: the lower-of line, the hashes, the digest', t => {
  const pbytes = Buffer.from(projectFile(60));
  const r = render(t, userHome(t), project(t, pbytes));
  assert.equal(r.code, 0, r.out);
  assert.equal(r.bytes.toString('utf8'), expectedFile(60));
  const digest = sha256(`project ${sha256(pbytes)}\n`).slice(0, 12);
  assert.deepEqual(r.stdout.trim().split('\n'), [
    `RENDERED ${sha256(r.bytes)}`,
    'CONFIG none',
    `PROJECT ${sha256(pbytes)}`,
    `DIGEST ${digest}`,
    'VALUE usage-pause 60',
    'RESULT: pass',
  ]);
  assert.deepEqual(readdirSync(r.dir), [OUTPUT]);
});

test('a project value tighter than the user\'s own installs, and the digest covers both files', t => {
  const ubytes = Buffer.from(userFile(90));
  const pbytes = Buffer.from(projectFile(80));
  const r = render(t, userHome(t, ubytes), project(t, pbytes));
  assert.equal(r.code, 0, r.out);
  assert.equal(r.bytes.toString('utf8'), expectedFile(80));
  const digest = sha256(`user ${sha256(ubytes)}\nproject ${sha256(pbytes)}\n`).slice(0, 12);
  assert.match(r.stdout, new RegExp(`^CONFIG user ${sha256(ubytes)}$`, 'm'));
  assert.match(r.stdout, new RegExp(`^DIGEST ${digest}$`, 'm'));
  assert.match(r.stdout, /^VALUE usage-pause 80$/m);
});

test('bad case: a project value looser than the user\'s but tighter than the default refuses', t => {
  refusedWith(render(t, userHome(t, userFile(50)), project(t, projectFile(60))), 'project-looser', /usage-pause 60 is not tighter than the user's effective value, 50/);
});

test('bad case: a project value equal to the user\'s effective value refuses: tighter means strictly', t => {
  refusedWith(render(t, userHome(t), project(t, projectFile(75))), 'project-looser', /usage-pause 75 is not tighter than the user's effective value, 75/);
});

test('bad case: a project value looser than the default refuses', t => {
  refusedWith(render(t, userHome(t), project(t, projectFile(80))), 'project-looser');
});

test('bad case: a project file with an edit refuses, even an empty edit list', t => {
  refusedWith(render(t, userHome(t), project(t, '{"schema": 1, "settings": {"usage-pause": 60}, "edits": [{"mark": "move-2", "op": "remove"}]}\n')), 'project-edit');
  refusedWith(render(t, userHome(t), project(t, '{"schema": 1, "settings": {"usage-pause": 60}, "edits": []}\n')), 'project-edit');
});

for (const [label, content, rule] of [
  ['another top-level key', '{"schema": 1, "settings": {"usage-pause": 60}, "notes": "x"}\n', 'project-key'],
  ['an unknown setting', '{"schema": 1, "settings": {"usage-pause": 60, "other": 1}}\n', 'project-settings'],
  ['a value of the wrong type', '{"schema": 1, "settings": {"usage-pause": "60"}}\n', 'project-value'],
  ['a value out of range', '{"schema": 1, "settings": {"usage-pause": -1}}\n', 'project-value'],
  ['a fraction', '{"schema": 1, "settings": {"usage-pause": 60.5}}\n', 'project-value'],
  ['an unknown schema', '{"schema": 2, "settings": {"usage-pause": 60}}\n', 'project-schema'],
  ['no value at all', '{"schema": 1, "settings": {}}\n', 'project-empty'],
  ['no settings', '{"schema": 1}\n', 'project-empty'],
  ['malformed JSON', '{"schema": 1,\n', 'project-json'],
  ['a key given twice', '{"schema": 1, "settings": {"usage-pause": 60, "Usage-Pause": 10}}\n', 'project-json'],
  ['a list, not an object', '[1]\n', 'project-json'],
  ['a byte-order mark', '\ufeff{"schema": 1, "settings": {"usage-pause": 60}}\n', 'bom'],
  ['a carriage return', '{"schema": 1,\r\n "settings": {"usage-pause": 60}}\n', 'characters'],
]) {
  test(`bad case: a project file with ${label} refuses`, t => {
    refusedWith(render(t, userHome(t), project(t, content)), rule);
  });
}

test('bad case: no project file refuses, saying there is no project configuration', t => {
  refusedWith(render(t, userHome(t), project(t)), 'project-none', /there is no project configuration/);
});

test('bad case: a bad user file refuses a project render too', t => {
  refusedWith(render(t, userHome(t, '{"schema": 1, "settings": {"usage-pause": 900}}\n'), project(t, projectFile(60))), 'config-value');
});

test('bad case: a project file that is a folder refuses', t => {
  const p = project(t);
  mkdirSync(join(p, ...PROJECT_REL), { recursive: true });
  refusedWith(render(t, userHome(t), p), 'project-file', /not a regular file/);
});

test('bad case: a project .claude folder that is a link refuses', t => {
  const p = project(t);
  const elsewhere = tempDir(t);
  writeFileSync(join(elsewhere, 'pact-config.json'), projectFile(60));
  symlinkSync(elsewhere, join(p, '.claude'), 'junction');
  refusedWith(render(t, userHome(t), p), 'project-file', /is a link/);
});

test('bad case: a project file that is a dangling link refuses', t => {
  const p = project(t);
  mkdirSync(join(p, '.claude'));
  symlinkSync(join(tempDir(t), 'gone'), join(p, ...PROJECT_REL), 'junction');
  refusedWith(render(t, userHome(t), p), 'project-file', /is a link/);
});

test('bad case: a project file over 64 KiB refuses', t => {
  refusedWith(render(t, userHome(t), project(t, `${projectFile(60)}${' '.repeat(64 * 1024)}`)), 'project-size');
});

// ------------------------------------------------------------ the scanner on the output

/** A copy of the gate's renderer and its imports, with `from` replaced by `to` in the renderer. */
function plantedRenderer(t, from, to) {
  const g = copyGate(tempDir(t, 'pact-render-gate-'));
  plantModule(g, 'render', from, to);
  return join(g, 'render.mjs');
}

const LEAD = "'# Pact settings for this project',";

test('control: an unchanged copy of the renderer passes the project render', t => {
  const r = render(t, userHome(t), project(t, projectFile(60)), plantedRenderer(t, LEAD, LEAD));
  assert.equal(r.code, 0, r.out);
});

test('bad case: a project template holding a refused character fails the text scanner, and no file is left', t => {
  const r = render(t, userHome(t), project(t, projectFile(60)), plantedRenderer(t, LEAD, "'# Pact settings for this project\\u202e',"));
  refusedWith(r, 'invisible');
});
