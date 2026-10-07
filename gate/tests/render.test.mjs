// The renderer (#53, slice 2): the no-configuration path. It is driven through
// its command line, as the install script runs it, and judged on what it
// prints and the file it writes. The expected render comes from the tests'
// own withoutOpenMarks, never from the renderer.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { GATE, OPEN_MARKS, RENDER, REPO, lastLine, read, stage, tempDir, withoutOpenMarks } from './helpers.mjs';

const SOURCE = join(REPO, 'claude', 'CLAUDE.md');
const GATED = readdirSync(join(GATE, 'clauses'))
  .filter(f => f.endsWith('.md'))
  .map(f => f.slice(0, -3));

const sha256 = b => createHash('sha256').update(b).digest('hex');

/** Run the renderer on `src` into a fresh output folder (or `out`), against an empty Claude home folder (or `home`). */
function render(t, src, { out, args, home } = {}) {
  const dir = out ?? tempDir(t, 'pact-render-out-');
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  const r = spawnSync(process.execPath, [RENDER, ...(args ?? [src, dir, home ?? tempDir(t, 'pact-render-home-')])], { encoding: 'utf8', env });
  const file = join(dir, 'CLAUDE.md');
  return { code: r.status, stdout: r.stdout, out: r.stdout + r.stderr, stderr: r.stderr, dir, file, bytes: existsSync(file) ? readFileSync(file) : null };
}

/** A source file holding `content` (text or bytes). */
function sourceFile(t, content) {
  const p = join(tempDir(t, 'pact-render-src-'), 'CLAUDE.md');
  writeFileSync(p, content);
  return p;
}

function refusedWith(r, rule) {
  assert.equal(r.code, 1, r.out);
  assert.equal(lastLine(r.stdout), 'RESULT: fail', r.out);
  assert.match(r.stdout, new RegExp(`^FAIL ${rule}: `, 'm'), r.out);
  assert.doesNotMatch(r.stdout, /^RENDERED /m, r.out);
}

/** The whole tree under `root`: each path, and each file's hash. */
function treeState(root) {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .map(e => {
      const p = join(e.parentPath ?? e.path, e.name);
      return `${e.isFile() ? 'file' : e.isDirectory() ? 'dir' : 'other'} ${p.slice(root.length)} ${e.isFile() ? sha256(readFileSync(p)) : ''}`;
    })
    .sort()
    .join('\n');
}

// ------------------------------------------------------------ the no-file render

test('with no configuration, the output is the source with its open-mark lines removed, and its hash is reported', t => {
  const src = [
    '# Title',
    'kept',
    '<!-- pact:begin config-notice -->',
    '<!-- pact:end config-notice -->',
    '1. **Lead.**',
    '   <!-- pact:begin move-1 -->',
    '   Open text.',
    '   <!-- pact:end move-1 -->',
    '<!-- pact:begin risk-floor -->',
    'gated',
    '<!-- pact:end risk-floor -->',
    '',
  ].join('\n');
  const r = render(t, sourceFile(t, src));
  assert.equal(r.code, 0, r.out);
  const want = withoutOpenMarks(src);
  assert.notEqual(want, src);
  assert.equal(r.bytes.toString('utf8'), want);
  // Since slice 4 the renderer also writes the diff from the no-configuration render, empty here.
  assert.deepEqual(r.stdout.split('\n'), [`RENDERED ${sha256(r.bytes)}`, `DIFF ${sha256(Buffer.alloc(0))}`, 'CONFIG none', 'RESULT: pass', '']);
  assert.deepEqual(readdirSync(r.dir).sort(), ['CLAUDE.md', 'config.diff']);
  assert.equal(readFileSync(join(r.dir, 'config.diff')).length, 0);
});

test('the pact source renders, and its output is what the tests expect', t => {
  const r = render(t, SOURCE);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.bytes.toString('utf8'), withoutOpenMarks(read(SOURCE)));
});

test('each of the six open marks is stripped, and only exact open-mark lines are', t => {
  // Lines that are not an open mark: gated or unknown marks, and comments that
  // name no open mark. They pass through for seam A to judge.
  const kept = [
    '<!-- pact:begin move-5 -->',
    '<!-- pact:end move-5 -->',
    '<!-- pact:begin move-4 -->',
    '<!-- pact:end move-4 -->',
    '<!-- pact:begin risk-floor -->',
    '<!-- pact:end security-route -->',
    '<!-- pact:open move-1 -->',
    '<!-- pact:begin move-10 -->',
  ];
  const stripped = OPEN_MARKS.flatMap(n => [`<!-- pact:begin ${n} -->`, `   <!-- pact:end ${n} -->`]);
  const src = ['# Title', ...stripped, ...kept, 'last'].join('\n');
  const r = render(t, sourceFile(t, src));
  assert.equal(r.code, 0, r.out);
  assert.equal(r.bytes.toString('utf8'), ['# Title', ...kept, 'last'].join('\n'));
});

// Slice 2 passed these lines through for seam A to refuse. Since slice 3 the
// renderer refuses them itself, before any part is filled (security-reviewer
// F3 on #92): each would hide an open mark from the renderer while a reader
// still takes it for one.
for (const near of [
  '<!-- pact:begin move-1-->',
  '<!-- pact:begin move-1 --> ',
  '\t<!-- pact:begin move-1 -->',
  '<!-- pact:begin Move-1 -->',
  '<!--  pact:begin move-1 -->',
  'text <!-- pact:begin move-1 -->',
  '<!-- pact:end usage-pause --><!-- pact:begin risk-floor -->',
  '<!-- pact:begin risk-floor --> <!-- pact:begin move-4-extra -->',
]) {
  test(`bad case: an open mark not alone on its line refuses: ${JSON.stringify(near)}`, t => {
    const r = render(t, sourceFile(t, `# Title\n${near}\nlast\n`));
    refusedWith(r, 'placement');
    assert.match(r.stdout, /^FAIL placement: claude\/CLAUDE\.md line 2: an open mark that is not alone on its line, exactly as written$/m, r.out);
  });
}

test('every byte outside an open-mark line passes through: a carriage return, invalid UTF-8, a byte-order mark', t => {
  // The carriage-return line was an open mark until slice 3, when a mark not
  // exactly alone on its line began to refuse (the bad case below).
  const body = Buffer.concat([
    Buffer.from('﻿line one\r\n<!-- pact:begin move-2 -->\n'),
    Buffer.from([0xff, 0xfe, 0x0a]),
    Buffer.from('<!-- pact:begin risk-floor -->\r\n<!-- pact:end move-2 -->\nno final newline'),
  ]);
  const r = render(t, sourceFile(t, body));
  assert.equal(r.code, 0, r.out);
  const want = Buffer.concat([
    Buffer.from('﻿line one\r\n'),
    Buffer.from([0xff, 0xfe, 0x0a]),
    Buffer.from('<!-- pact:begin risk-floor -->\r\nno final newline'),
  ]);
  assert.deepEqual(r.bytes, want);
});

test('bad case: an open mark line ending in a carriage return refuses', t => {
  const r = render(t, sourceFile(t, '<!-- pact:begin move-2 -->\r\n<!-- pact:end move-2 -->\n'));
  refusedWith(r, 'placement');
});

test('an empty source renders to an empty file', t => {
  const r = render(t, sourceFile(t, ''));
  assert.equal(r.code, 0, r.out);
  assert.equal(r.bytes.length, 0);
  assert.match(r.stdout, new RegExp(`^RENDERED ${sha256(Buffer.alloc(0))}$`, 'm'));
});

test('no open-mark name is a gated clause name', () => {
  assert.equal(GATED.length, 7, GATED.join(', '));
  for (const n of OPEN_MARKS) assert.ok(!GATED.includes(n), n);
});

test('the renderer never echoes the source', t => {
  const C = 'CANARYrender';
  // The mark is closed since slice 3, when an unclosed open mark began to refuse.
  const r = render(t, sourceFile(t, `${C}\n<!-- pact:begin move-1 -->\n${C}\n<!-- pact:end move-1 -->\n`));
  assert.equal(r.code, 0, r.out);
  assert.ok(!r.out.includes(C), r.out);
});

// ------------------------------------------------------------ the stage stays as it was

test('a normal render leaves the stage unchanged, and writes only into its output folder', t => {
  const root = stage(t, {});
  const before = treeState(root);
  const r = render(t, join(root, 'claude', 'CLAUDE.md'));
  assert.equal(r.code, 0, r.out);
  assert.equal(treeState(root), before);
  assert.deepEqual(readdirSync(r.dir).sort(), ['CLAUDE.md', 'config.diff']);
});

// ------------------------------------------------------------ refusals

test('bad case: a missing source refuses', t => {
  const r = render(t, join(tempDir(t), 'none.md'));
  refusedWith(r, 'source');
  assert.deepEqual(readdirSync(r.dir), []);
});

test('bad case: a source that is a folder refuses', t => {
  const d = join(tempDir(t), 'CLAUDE.md');
  mkdirSync(d);
  refusedWith(render(t, d), 'source');
});

test('bad case: a source that is a link refuses', t => {
  const real = sourceFile(t, 'text\n');
  const link = join(tempDir(t), 'CLAUDE.md');
  try {
    symlinkSync(real, link, 'file');
  } catch {
    t.skip('cannot create a file link here (not run)');
    return;
  }
  const r = render(t, link);
  refusedWith(r, 'source');
  // Refused by the first check, on the link itself, not only by the later open-handle match.
  assert.match(r.stdout, /^FAIL source: the source rules file is not a regular file$/m, r.out);
});

test('bad case: a source larger than 1 MiB refuses', t => {
  const r = render(t, sourceFile(t, Buffer.alloc(1024 * 1024 + 1, 0x61)));
  refusedWith(r, 'size');
  assert.deepEqual(readdirSync(r.dir), []);
});

test('a source of exactly 1 MiB renders', t => {
  const r = render(t, sourceFile(t, Buffer.alloc(1024 * 1024, 0x61)));
  assert.equal(r.code, 0, r.out);
  assert.equal(r.bytes.length, 1024 * 1024);
});

test('bad case: an output folder that is not empty refuses, and nothing in it is replaced', t => {
  const out = tempDir(t, 'pact-render-out-');
  writeFileSync(join(out, 'CLAUDE.md'), 'planted\n');
  const r = render(t, SOURCE, { out });
  refusedWith(r, 'output');
  assert.equal(readFileSync(join(out, 'CLAUDE.md'), 'utf8'), 'planted\n');
});

test('bad case: a missing output folder refuses', t => {
  const out = join(tempDir(t), 'none');
  refusedWith(render(t, SOURCE, { out }), 'output');
  assert.ok(!existsSync(out));
});

test('bad case: an output folder that is a link refuses', t => {
  const real = tempDir(t, 'pact-render-real-');
  const link = join(tempDir(t), 'out');
  try {
    symlinkSync(real, link, 'junction');
  } catch {
    t.skip('cannot create a folder link here (not run)');
    return;
  }
  refusedWith(render(t, SOURCE, { out: link }), 'output');
  assert.deepEqual(readdirSync(real), []);
});

// Since slice 3 the Claude home folder is a third argument the install always
// passes, so two arguments are a usage failure and four are too many.
for (const [label, args] of [
  ['no arguments', []],
  ['one argument', ['x']],
  ['two arguments', ['a', 'b']],
  ['four arguments', ['a', 'b', 'c', 'd']],
  ['a switch in place of the source', ['--skip-checks', 'b', 'c']],
  ['a switch in place of the output folder', ['a', '--no-check', 'c']],
  ['a switch in place of the Claude home folder', ['a', 'b', '--no-config']],
  ['an empty argument', ['', 'b', 'c']],
  ['an empty Claude home folder argument', ['a', 'b', '']],
]) {
  test(`bad case: ${label} is a usage failure; the renderer has no switch`, t => {
    const r = render(t, null, { args });
    refusedWith(r, 'usage');
  });
}

test('bad case: a switch added to good arguments is a usage failure, not a skipped check', t => {
  const out = tempDir(t, 'pact-render-out-');
  const r = render(t, null, { args: [SOURCE, out, tempDir(t), '--no-strip'], out });
  refusedWith(r, 'usage');
  assert.deepEqual(readdirSync(out), []);
});
