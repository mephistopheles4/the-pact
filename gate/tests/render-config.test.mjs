// The renderer with a user configuration file (#53, slice 3). Driven through
// its command line, as the install script runs it, and judged on what it
// prints and the file it writes. The expected render, the notice and the
// digest are built here, never taken from the renderer.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { linkSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { REPO, RENDER, SEAM_A, lastLine, read, renderStage, stage, tempDir, withoutOpenMarks } from './helpers.mjs';

const WIN = process.platform === 'win32';
const SOURCE = join(REPO, 'claude', 'CLAUDE.md');
const EXAMPLE = join(REPO, 'examples', 'pact-config', 'config.json');
const USAGE_75 = 'the weekly limit is above 75%, wait for my go-ahead.';

const sha256 = b => createHash('sha256').update(b).digest('hex');
const digestOf = bytes => sha256(`user ${sha256(bytes)}\n`).slice(0, 12);

/** A Claude home folder whose pact/config.json holds `content` (text or bytes). */
function homeWith(t, content) {
  const h = tempDir(t, 'pact-render-home-');
  mkdirSync(join(h, 'pact'));
  writeFileSync(join(h, 'pact', 'config.json'), content);
  return h;
}

/** Run the renderer on `src` against the Claude home folder `home`. */
function render(t, home, src = SOURCE) {
  const dir = tempDir(t, 'pact-render-out-');
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  const r = spawnSync(process.execPath, [RENDER, src, dir, home], { encoding: 'utf8', env });
  let bytes = null;
  try {
    bytes = readFileSync(join(dir, 'CLAUDE.md'));
  } catch {}
  return { code: r.status, stdout: r.stdout, out: r.stdout + r.stderr, dir, bytes };
}

function sourceFile(t, content) {
  const p = join(tempDir(t, 'pact-render-src-'), 'CLAUDE.md');
  writeFileSync(p, content);
  return p;
}

function refusedWith(r, rule, reason) {
  assert.equal(r.code, 1, r.out);
  assert.equal(lastLine(r.stdout), 'RESULT: fail', r.out);
  assert.match(r.stdout, new RegExp(`^FAIL ${rule}: `, 'm'), r.out);
  if (reason) assert.match(r.stdout, reason, r.out);
  assert.doesNotMatch(r.stdout, /^(RENDERED|CONFIG|DIGEST|VALUE) /m, r.out);
  assert.deepEqual(readdirSync(r.dir), [], 'a refused render writes no file');
}

/** The configured render the tests expect: the value in the usage line, the notice in its slot, open marks gone. */
function expected(srcText, digest, value) {
  assert.equal(srcText.split(USAGE_75).length, 2, 'the source no longer holds the usage line once');
  let s = value === undefined ? srcText : srcText.replace(USAGE_75, `the weekly limit is above ${value}%, wait for my go-ahead.`);
  const slot = '<!-- pact:begin config-notice -->\n<!-- pact:end config-notice -->\n';
  assert.equal(s.split(slot).length, 2, 'the source no longer holds the empty notice slot once');
  const notice = [
    '',
    `**Configuration in effect.** This file was rendered with the configuration \`${digest}\`.`,
    `Values set: ${value === undefined ? 'none' : `usage-pause ${value}`}. Parts edited: none.`,
  ];
  s = s.replace(slot, `<!-- pact:begin config-notice -->\n${notice.join('\n')}\n<!-- pact:end config-notice -->\n`);
  return withoutOpenMarks(s);
}

// ------------------------------------------------------------ a configuration that applies

test('the shipped example sets the usage pause to 90: the rules read 90%, with the notice, its digest and the value', t => {
  const bytes = readFileSync(EXAMPLE);
  const r = render(t, homeWith(t, bytes));
  assert.equal(r.code, 0, r.out);
  const digest = digestOf(bytes);
  assert.equal(r.bytes.toString('utf8'), expected(read(SOURCE), digest, 90));
  assert.deepEqual(r.stdout.split('\n'), [
    `RENDERED ${sha256(r.bytes)}`,
    `CONFIG user ${sha256(bytes)}`,
    `DIGEST ${digest}`,
    'VALUE usage-pause 90',
    'RESULT: pass',
    '',
  ]);
  const text = r.bytes.toString('utf8');
  assert.ok(text.includes('the weekly limit is above 90%'));
  assert.ok(!text.includes('the weekly limit is above 75%'));
});

for (const spelling of ['90', '90.0', '9e1', '900e-1']) {
  test(`${spelling} reads as 90`, t => {
    const bytes = Buffer.from(`{"schema": 1, "settings": {"usage-pause": ${spelling}}}\n`);
    const r = render(t, homeWith(t, bytes));
    assert.equal(r.code, 0, r.out);
    assert.match(r.stdout, /^VALUE usage-pause 90$/m, r.out);
    assert.equal(r.bytes.toString('utf8'), expected(read(SOURCE), digestOf(bytes), 90));
  });
}

for (const value of [0, 100]) {
  test(`the range ends, ${value}, are accepted`, t => {
    const bytes = Buffer.from(`{"schema": 1, "settings": {"usage-pause": ${value}}}`);
    const r = render(t, homeWith(t, bytes));
    assert.equal(r.code, 0, r.out);
    assert.equal(r.bytes.toString('utf8'), expected(read(SOURCE), digestOf(bytes), value));
  });
}

test('a configuration with no values still applies: the notice names it, and the usage line keeps 75%', t => {
  const bytes = Buffer.from('{"schema": 1, "settings": {}, "edits": []}\n');
  const r = render(t, homeWith(t, bytes));
  assert.equal(r.code, 0, r.out);
  assert.equal(r.bytes.toString('utf8'), expected(read(SOURCE), digestOf(bytes)));
  assert.deepEqual(r.stdout.split('\n').slice(1, 3), [`CONFIG user ${sha256(bytes)}`, `DIGEST ${digestOf(bytes)}`]);
  assert.doesNotMatch(r.stdout, /^VALUE /m);
});

test('a configured render of the real source passes seam A', t => {
  const root = stage(t, {});
  renderStage(root, homeWith(t, readFileSync(EXAMPLE)));
  assert.ok(read(join(root, 'claude', 'CLAUDE.md')).includes('the weekly limit is above 90%'));
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  const r = spawnSync(process.execPath, [SEAM_A, root], { encoding: 'utf8', env });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(lastLine(r.stdout), 'RESULT: pass');
});

// ------------------------------------------------------------ no configuration

test('no pact folder, an empty pact folder and a missing Claude home folder all mean no configuration', t => {
  const noPact = tempDir(t);
  const emptyPact = tempDir(t);
  mkdirSync(join(emptyPact, 'pact'));
  const missing = join(tempDir(t), 'none');
  for (const h of [noPact, emptyPact, missing]) {
    const r = render(t, h);
    assert.equal(r.code, 0, r.out);
    assert.deepEqual(r.stdout.split('\n'), [`RENDERED ${sha256(r.bytes)}`, 'CONFIG none', 'RESULT: pass', '']);
    assert.equal(r.bytes.toString('utf8'), withoutOpenMarks(read(SOURCE)));
  }
});

// ------------------------------------------------------------ fail-closed reads

test('bad case: a configuration path that is a folder refuses', t => {
  const h = tempDir(t);
  mkdirSync(join(h, 'pact', 'config.json'), { recursive: true });
  refusedWith(render(t, h), 'config-file', /not a regular file/);
});

test('bad case: a pact folder that is a file refuses', t => {
  const h = tempDir(t);
  writeFileSync(join(h, 'pact'), 'x');
  refusedWith(render(t, h), 'config-file', /the pact folder is not a folder/);
});

test('bad case: a configuration path that is a dangling link refuses', t => {
  const h = tempDir(t);
  mkdirSync(join(h, 'pact'));
  symlinkSync(join(tempDir(t), 'gone'), join(h, 'pact', 'config.json'), 'junction');
  refusedWith(render(t, h), 'config-file', /is a link/);
});

test('bad case: a configuration file that is a link to a good file refuses', t => {
  const real = join(tempDir(t), 'config.json');
  writeFileSync(real, readFileSync(EXAMPLE));
  const h = tempDir(t);
  mkdirSync(join(h, 'pact'));
  try {
    symlinkSync(real, join(h, 'pact', 'config.json'), 'file');
  } catch {
    t.skip('cannot create a file link here (not run)');
    return;
  }
  refusedWith(render(t, h), 'config-file', /is a link/);
});

test('bad case: a pact folder that is a link to a folder holding a good file refuses', t => {
  const elsewhere = tempDir(t);
  writeFileSync(join(elsewhere, 'config.json'), readFileSync(EXAMPLE));
  const h = tempDir(t);
  symlinkSync(elsewhere, join(h, 'pact'), 'junction');
  refusedWith(render(t, h), 'config-file', /the pact folder is a link/);
});

test('bad case: a configuration file with a second hard link refuses', t => {
  const h = homeWith(t, readFileSync(EXAMPLE));
  try {
    linkSync(join(h, 'pact', 'config.json'), join(tempDir(t), 'second.json'));
  } catch {
    t.skip('cannot create a hard link here (not run)');
    return;
  }
  refusedWith(render(t, h), 'config-file', /more than one link/);
});

test('bad case: an unreadable configuration file refuses', t => {
  const h = homeWith(t, readFileSync(EXAMPLE));
  const p = join(h, 'pact', 'config.json');
  let undo;
  if (WIN) {
    if (spawnSync('icacls', [p, '/deny', '*S-1-1-0:(R)']).status !== 0) {
      t.skip('cannot deny reading here (not run)');
      return;
    }
    undo = () => spawnSync('icacls', [p, '/remove:d', '*S-1-1-0']);
  } else {
    spawnSync('chmod', ['000', p]);
    undo = () => spawnSync('chmod', ['600', p]);
  }
  let r;
  try {
    try {
      readFileSync(p);
      t.skip('the file is still readable here, as root (not run)');
      return;
    } catch {}
    r = render(t, h);
  } finally {
    undo();
  }
  refusedWith(r, 'config-file');
});

test('a file of exactly 64 KiB is read; one byte more refuses, by the cap', t => {
  const body = '{"schema": 1}';
  const at = Buffer.from(body.padEnd(64 * 1024, ' '));
  const r = render(t, homeWith(t, at));
  assert.equal(r.code, 0, r.out);
  const over = Buffer.from(body.padEnd(64 * 1024 + 1, ' '));
  refusedWith(render(t, homeWith(t, over)), 'config-size', /larger than 64 KiB/);
});

// ------------------------------------------------------------ the file's text and shape

const BAD = [
  // [label, bytes, rule, message]
  ['malformed JSON', '{"schema": 1,}', 'config-json', /not valid JSON/],
  ['an empty file', '', 'config-json', /not valid JSON/],
  ['a bare NaN', '{"schema": 1, "settings": {"usage-pause": NaN}}', 'config-json', /not valid JSON/],
  ['a root that is a list', '[{"schema": 1}]', 'config-json', /not a JSON object/],
  ['a root that is a number', '1', 'config-json', /not a JSON object/],
  ['a key given twice', '{"schema": 1, "schema": 1}', 'config-json', /a key seen twice/],
  ['a key given twice in another case', '{"schema": 1, "Schema": 1}', 'config-json', /a key seen twice/],
  ['a key given twice through an escape', '{"schema": 1, "sch\\u0065ma": 1}', 'config-json', /a key seen twice/],
  ['a setting given twice in another case', '{"schema": 1, "settings": {"usage-pause": 90, "Usage-Pause": 80}}', 'config-json', /a key seen twice/],
  ['schema 2', '{"schema": 2}', 'config-schema', /schema must be 1/],
  ['schema as a string', '{"schema": "1"}', 'config-schema', /schema must be 1/],
  ['schema 1.5', '{"schema": 1.5}', 'config-schema', /schema must be 1/],
  ['no schema', '{"settings": {"usage-pause": 90}}', 'config-schema', /schema must be 1/],
  ['an unknown key', '{"schema": 1, "extra": 1}', 'config-key', /not schema, settings or edits/],
  ['a key in another case, alone', '{"schema": 1, "Settings": {}}', 'config-key', /not schema, settings or edits/],
  ['a __proto__ key', '{"schema": 1, "__proto__": {"usage-pause": 1}}', 'config-key', /not schema, settings or edits/],
  ['an unknown setting', '{"schema": 1, "settings": {"usage-paws": 90}}', 'config-settings', /not a setting/],
  ['a setting in another case, alone', '{"schema": 1, "settings": {"Usage-Pause": 90}}', 'config-settings', /not a setting/],
  ['a __proto__ setting', '{"schema": 1, "settings": {"__proto__": 90}}', 'config-settings', /not a setting/],
  ['a constructor setting', '{"schema": 1, "settings": {"constructor": 90}}', 'config-settings', /not a setting/],
  ['settings as a list', '{"schema": 1, "settings": [90]}', 'config-settings', /settings must be an object/],
  ['settings as null', '{"schema": 1, "settings": null}', 'config-settings', /settings must be an object/],
  ['a value as a string', '{"schema": 1, "settings": {"usage-pause": "90"}}', 'config-value', /usage-pause must be a whole number from 0 to 100/],
  ['a value as the string NaN', '{"schema": 1, "settings": {"usage-pause": "NaN"}}', 'config-value', /usage-pause must be a whole number from 0 to 100/],
  ['a value as true', '{"schema": 1, "settings": {"usage-pause": true}}', 'config-value', /usage-pause must be a whole number/],
  ['a value as null', '{"schema": 1, "settings": {"usage-pause": null}}', 'config-value', /usage-pause must be a whole number/],
  ['a value as a list', '{"schema": 1, "settings": {"usage-pause": [90]}}', 'config-value', /usage-pause must be a whole number/],
  ['a value of -0', '{"schema": 1, "settings": {"usage-pause": -0}}', 'config-value', /usage-pause must be a whole number/],
  ['a value of -0.0', '{"schema": 1, "settings": {"usage-pause": -0.0}}', 'config-value', /usage-pause must be a whole number/],
  ['a fraction', '{"schema": 1, "settings": {"usage-pause": 90.5}}', 'config-value', /usage-pause must be a whole number/],
  ['a value over the range', '{"schema": 1, "settings": {"usage-pause": 101}}', 'config-value', /from 0 to 100/],
  ['a value under the range', '{"schema": 1, "settings": {"usage-pause": -1}}', 'config-value', /from 0 to 100/],
  ['a value that overflows', '{"schema": 1, "settings": {"usage-pause": 1e400}}', 'config-value', /from 0 to 100/],
  ['an edit', '{"schema": 1, "edits": [{"mark": "move-2", "op": "remove"}]}', 'config-edits', /edits must be an empty list/],
  ['edits as an object', '{"schema": 1, "edits": {}}', 'config-edits', /edits must be an empty list/],
  ['a byte-order mark', '﻿{"schema": 1}', 'bom', /a byte-order mark/],
  ['a carriage return', '{"schema": 1}\r\n', 'characters', /a carriage return/],
  ['a control character', '{"schema": 1, "x\u0007": 1}', 'characters', /a control or line-separator character/],
  ['a hidden character', '{"schema": 1​}', 'invisible', /an invisible or direction-changing character/],
  ['a direction override', '{"schema": 1, "settings": {"usage-pause‮": 90}}', 'invisible', /an invisible or direction-changing character/],
];

for (const [label, text, rule, reason] of BAD) {
  test(`bad case: ${label} refuses`, t => {
    refusedWith(render(t, homeWith(t, text)), rule, reason);
  });
}

test('bad case: invalid UTF-8 refuses', t => {
  const bytes = Buffer.concat([Buffer.from('{"schema": 1, "x": "'), Buffer.from([0xff, 0xfe]), Buffer.from('"}')]);
  refusedWith(render(t, homeWith(t, bytes)), 'encoding', /not valid UTF-8/);
});

test('refusals name only the renderer\'s own names: no key, value or path from the file is echoed', t => {
  const C = 'CANARYcfg';
  for (const text of [
    `{"schema": 1, "${C}": 1}`,
    `{"schema": 1, "settings": {"${C}": 90}}`,
    `{"schema": 1, "settings": {"usage-pause": "${C}"}}`,
    `{"schema": "${C}"}`,
    `{"schema": 1, "edits": [{"mark": "${C}", "op": "${C}"}]}`,
    `{"schema": 1, "${C}": 1, "${C}": 2}`,
    `{"${C}`,
  ]) {
    const r = render(t, homeWith(t, text));
    assert.equal(r.code, 1, r.out);
    assert.ok(!r.out.includes(C), r.out);
  }
  // Nor the Claude home folder's path, on a refusal about it.
  const h = join(tempDir(t), C);
  mkdirSync(join(h, 'pact', 'config.json'), { recursive: true });
  const r = render(t, h);
  assert.equal(r.code, 1, r.out);
  assert.ok(!r.out.includes(C), r.out);
});

// ------------------------------------------------------------ the open marks, checked before any part is filled

const GOOD = '{"schema": 1, "settings": {"usage-pause": 90}}';

test('bad case: a source with no usage-pause part refuses a configuration that sets it', t => {
  const src = read(SOURCE).replace('<!-- pact:begin usage-pause -->\n', '').replace('<!-- pact:end usage-pause -->\n', '');
  refusedWith(render(t, homeWith(t, GOOD), sourceFile(t, src)), 'render', /usage-pause: the part is not in the source/);
});

test('bad case: a usage-pause part that no longer matches its template at the default refuses', t => {
  const src = read(SOURCE).replace('that call is mine.', 'that call is yours.');
  refusedWith(render(t, homeWith(t, GOOD), sourceFile(t, src)), 'render', /usage-pause: the template at its default no longer matches the source/);
});

test('bad case: a usage-pause part with a line more than its template refuses', t => {
  const src = read(SOURCE).replace('because of usage on your own; that call is mine.\n', 'because of usage on your own; that call is mine.\nExtra.\n');
  refusedWith(render(t, homeWith(t, GOOD), sourceFile(t, src)), 'render', /usage-pause: the template at its default no longer matches the source/);
});

test('bad case: a notice slot that is not empty refuses a configuration', t => {
  const src = read(SOURCE).replace('<!-- pact:begin config-notice -->\n', '<!-- pact:begin config-notice -->\nText.\n');
  refusedWith(render(t, homeWith(t, GOOD), sourceFile(t, src)), 'render', /config-notice: the slot is not empty in the source/);
});

test('bad case: a source with no notice slot refuses a configuration', t => {
  const src = read(SOURCE).replace('<!-- pact:begin config-notice -->\n<!-- pact:end config-notice -->\n', '');
  refusedWith(render(t, homeWith(t, GOOD), sourceFile(t, src)), 'render', /config-notice: the slot is not in the source/);
});

// Each refuses with or without a configuration: the check runs on every render.
const UP_BEGIN = '<!-- pact:begin usage-pause -->\n';
const UP_END = '<!-- pact:end usage-pause -->\n';
/** The source with usage-pause's own two mark lines taken out, so a test can place them elsewhere. */
const noUsageMarks = s => s.replace(UP_BEGIN, '').replace(UP_END, '');

const PLACEMENT = [
  [
    'an open mark that encloses a gated block',
    s => noUsageMarks(s).replace('<!-- pact:begin risk-floor -->\n', `${UP_BEGIN}<!-- pact:begin risk-floor -->\n`).replace('<!-- pact:end risk-floor -->\n', `<!-- pact:end risk-floor -->\n${UP_END}`),
    /usage-pause encloses a gated mark/,
  ],
  [
    'an open mark inside a gated block',
    s => noUsageMarks(s).replace('<!-- pact:end stop-and-escalate -->\n', `${UP_BEGIN}${UP_END}<!-- pact:end stop-and-escalate -->\n`),
    /usage-pause opens inside a gated block/,
  ],
  [
    'an open mark whose end sits after a gated begin',
    s => s.replace('   <!-- pact:end move-3 -->\n   <!-- pact:begin security-route -->\n', '   <!-- pact:begin security-route -->\n   <!-- pact:end move-3 -->\n'),
    /move-3 encloses a gated mark/,
  ],
  ['an open mark that opens twice', s => s.replace(UP_END, `${UP_END}${UP_BEGIN}${UP_END}`), /usage-pause opens twice/],
  ['an open mark that never closes', s => s.replace(UP_END, ''), /usage-pause never closes/],
  ['an end with no begin', s => s.replace(UP_BEGIN, ''), /an end of usage-pause with no open begin of the same name/],
  [
    'an open mark inside another',
    s => noUsageMarks(s).replace('<!-- pact:end config-notice -->\n', `${UP_BEGIN}${UP_END}<!-- pact:end config-notice -->\n`),
    /usage-pause opens inside config-notice/,
  ],
];

for (const [label, change, reason] of PLACEMENT) {
  for (const [withConfig, home] of [
    ['with a configuration', t => homeWith(t, GOOD)],
    ['with no configuration', t => tempDir(t)],
  ]) {
    test(`bad case: ${label} refuses, ${withConfig}`, t => {
      const before = read(SOURCE);
      const src = change(before);
      assert.notEqual(src, before, 'the planted change did not apply');
      refusedWith(render(t, home(t), sourceFile(t, src)), 'placement', reason);
    });
  }
}

test('a configured render leaves its inputs unchanged, and writes only into its output folder', t => {
  const root = stage(t, {});
  const h = homeWith(t, GOOD);
  const snap = dir =>
    readdirSync(dir, { recursive: true, withFileTypes: true })
      .map(e => {
        const p = join(e.parentPath ?? e.path, e.name);
        return `${p.slice(dir.length)} ${e.isFile() ? sha256(readFileSync(p)) : 'dir'}`;
      })
      .sort()
      .join('\n');
  const before = [snap(root), snap(h)];
  const r = render(t, h, join(root, 'claude', 'CLAUDE.md'));
  assert.equal(r.code, 0, r.out);
  assert.deepEqual([snap(root), snap(h)], before);
  assert.deepEqual(readdirSync(r.dir), ['CLAUDE.md']);
});
