// The long docs' tables of contents (PACT-78): docs/toc.mjs writes each
// covered doc's table from its headings, and these tests fail while one is
// missing or stale, while a doc that isn't covered holds one, and while an
// in-repo anchor link into a tracked doc misses the anchors toc.mjs computes.
// The fix for a table is `node docs/toc.mjs`; for an anchor link, correct the
// link or the heading.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix } from 'node:path';
import { test } from 'node:test';
import { DEFAULTS, TOC_CLOSE, TOC_OPEN, covered, headings, problems, stripToc, tocBlock, trackedDocs, withToc } from '../../docs/toc.mjs';
import { REPO } from './text.mjs';

const FIX = 'run `node docs/toc.mjs`';

/** A doc of `n` body lines after a title and the headings given. */
const doc = (heads, n = 120) => `# Title\n\nIntro line.\n\n${heads.map(h => `${h}\n\nText.\n`).join('\n')}${'line\n'.repeat(n)}`;
const LONG = doc(['## One', '### One a', '## Two']);

// PACT-78 C1, C6
test('toc: every covered doc holds a current table, and no other doc holds one', () => {
  const files = trackedDocs(REPO);
  assert.ok(files.length > 20, `git ls-files listed ${files.length} Markdown files`);
  assert.deepEqual(problems(files), [], FIX);
});

// PACT-78 C2
test('toc: the check reports a covered doc with no table, a stale one, and a table in a doc that is not covered', () => {
  assert.deepEqual(tocBlock(`${LONG}#### Deep\n`), [TOC_OPEN, '', '- [One](#one)', '  - [One a](#one-a)', '- [Two](#two)', '', TOC_CLOSE], 'H2 and H3 only, H3 indented');
  const current = withToc(LONG);
  assert.deepEqual(problems([{ path: 'docs/a.md', text: current }]), []);
  const noH2 = doc(['### Only h3']);
  assert.equal(withToc(noH2), noH2, 'a long doc with no H2 gets no table');
  assert.deepEqual(problems([{ path: 'docs/a.md', text: noH2 }]), [], 'and the check asks for none');
  assert.deepEqual(problems([{ path: 'docs/log/x.md', text: `# T\n${TOC_OPEN}\n` }]), [`docs/log/x.md: ${TOC_OPEN} with no ${TOC_CLOSE}`], 'an unclosed marker is reported, not thrown');
  const rows = [
    ['no table', LONG, 'docs/a.md: no table of contents'],
    ['a heading added', current.replace('## Two', '## Two\n\n## Three'), 'docs/a.md: table of contents is stale'],
    ['a heading renamed', current.replace('\n## Two\n', '\n## Deux\n'), 'docs/a.md: table of contents is stale'],
    ['an entry edited by hand', current.replace('](#two)', '](#deux)'), 'docs/a.md: table of contents is stale'],
  ];
  for (const [name, text, line] of rows) assert.deepEqual(problems([{ path: 'docs/a.md', text }]), [line], name);
  const short = withToc(doc(['## One'], 120)).replace(/line\n/g, '');
  assert.deepEqual(problems([{ path: 'docs/b.md', text: short }]), ['docs/b.md: holds a table of contents but is not covered']);
  assert.deepEqual(problems([{ path: 'docs/log/x.md', text: current }]), ['docs/log/x.md: holds a table of contents but is not covered']);
  const quoted = `# Log\n\n\`\`\`md\n${TOC_OPEN}\n\n- [x](#x)\n\n${TOC_CLOSE}\n\`\`\`\n`;
  assert.deepEqual(problems([{ path: 'docs/log/y.md', text: quoted }]), [], 'markers quoted in a fence are not a table');
  assert.equal(stripToc(quoted), quoted);
});

// PACT-78 C6
test('toc: the excluded paths and short docs are not covered, and the table never counts toward the line threshold', () => {
  for (const p of ['docs/log/2026-01-01-x.md', 'docs/adr/0001-x.md', 'gate/tests/fixtures/x.md', 'claude/CLAUDE.md', 'cloud-sessions/CLAUDE.cloud.md', 'claude/agents/x-lens.md', 'claude/commands/x.md', 'AGENTS.md', 'README.md']) assert.equal(covered(p, LONG), false, p);
  assert.equal(covered('docs/a.md', LONG), true);
  assert.equal(covered('docs/a.txt', LONG), false);
  const at100 = 'line\n'.repeat(98).replace(/^/, '# T\n## H\n');
  assert.equal(covered('docs/a.md', at100), false, '100 lines is not over 100');
  assert.equal(covered('docs/a.md', withToc(at100)), false, 'its own table does not push a doc over');
  assert.equal(covered('docs/a.md', `${at100}line\n`), true, '101 lines is');
});

// PACT-78 C2, C3
test('toc: anchors follow GitHub: markup dropped, punctuation removed, repeats suffixed, fenced headings ignored', () => {
  const text = [
    '# Title',
    '## Install with `--apply`',
    "## The door to other people's tools",
    '## A [linked](x.md) heading, **bold** and _it_',
    '## snake_case stays',
    '## Same',
    '### Same',
    '```sh',
    '## not a heading',
    '```',
    '~~~~',
    '```',
    '## also not',
    '~~~~',
    '## 1. Check — V1',
    '## The `__init__` hook',
    '## [`foo`](x) bar',
    '## Same 1',
  ].join('\n');
  assert.deepEqual(
    headings(text).map(h => h.anchor),
    ['title', 'install-with---apply', 'the-door-to-other-peoples-tools', 'a-linked-heading-bold-and-it', 'snake_case-stays', 'same', 'same-1', '1-check--v1', 'the-__init__-hook', 'foo-bar', 'same-1-1'],
  );
  assert.match(withToc(`${text}\n`), /- \[A linked heading, \*\*bold\*\* and _it_\]\(#a-linked-heading-bold-and-it\)/);
});

// PACT-78 C3
test('toc: every in-repo anchor link into a tracked doc names an anchor that doc has', () => {
  const files = trackedDocs(REPO);
  const by = new Map(files.map(f => [f.path, f]));
  const missing = [];
  let seen = 0;
  for (const f of files) {
    for (const [, target, anchor] of f.text.matchAll(/\]\(([^)\s#]*)#([^)\s]+)\)/g)) {
      const t = by.get(target ? posix.normalize(posix.join(posix.dirname(f.path), target)) : f.path);
      if (!t) continue;
      if (t !== f) seen++;
      if (!headings(t.text).some(h => h.anchor === anchor)) missing.push(`${f.path}: #${anchor} in ${t.path}`);
    }
  }
  assert.ok(seen > 0, 'no anchor link from one doc into another was found');
  assert.deepEqual(missing, []);
});

// PACT-78 C5
test('toc: writing twice changes nothing, the table sits before the first H2, and CRLF is kept', () => {
  const once = withToc(LONG);
  assert.equal(withToc(once), once);
  assert.ok(once.indexOf(TOC_OPEN) < once.indexOf('\n## One'));
  assert.ok(once.indexOf('Intro line.') < once.indexOf(TOC_OPEN), 'the intro stays first');
  assert.equal(stripToc(once), LONG);
  const crlf = LONG.replace(/\n/g, '\r\n');
  const w = withToc(crlf);
  assert.doesNotMatch(w, /(?<!\r)\n/, 'every line ending stays CRLF');
  assert.ok(w.includes(`${TOC_CLOSE}\r\n`));
  assert.equal(stripToc(w), crlf);
});

// PACT-84 (spec 0004): the script reads toc.config.json from its own folder, finds its repo root with
// git, and a vendored copy, marked by a Source line at line 2, refuses to run without a config.
const SCRIPT = join(REPO, 'docs', 'toc.mjs');
const SOURCE = '// Source: the-pact 0fde975';
const CONFIG_FILE = 'toc.config.json';

/** A doc with no table: 4 lines (title, blank, one H2, blank) and `n` body lines, so n + 4 in all. */
const longDoc = n => `# T\n\n## H\n\n${'line\n'.repeat(n)}`;

/** The environment for a child run: none of our git or NODE_OPTIONS variables leaks in, `ceiling` stops git looking above it, `extra` is added last, and `noPath` leaves it no PATH, so no git. */
function childEnv(ceiling, noPath = false, extra = {}) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(GIT_|NODE_OPTIONS$)/i.test(k)));
  if (ceiling) env.GIT_CEILING_DIRECTORIES = ceiling;
  Object.assign(env, extra);
  if (noPath) {
    for (const k of Object.keys(env)) if (/^path$/i.test(k)) delete env[k];
    env.PATH = '';
  }
  return env;
}

/**
 * A temporary folder with `files` written (path to text), a copy of the script in the folder `at` (repo-relative),
 * its `toc.config.json` holding `config` when that is given, the Source line added on request, and a git repo made
 * of it unless `git` is false. Calls `fn(dir)`, then removes it.
 */
function withRepo({ files = {}, at = 'scripts', source = false, config, git = true }, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'toc-'));
  try {
    const script = readFileSync(SCRIPT, 'utf8').split('\n');
    if (source) script.splice(1, 0, SOURCE);
    mkdirSync(join(dir, at), { recursive: true });
    writeFileSync(join(dir, at, 'toc.mjs'), script.join('\n'));
    if (config !== undefined) writeFileSync(join(dir, at, CONFIG_FILE), config);
    for (const [p, text] of Object.entries(files)) {
      mkdirSync(join(dir, posix.dirname(p)), { recursive: true });
      writeFileSync(join(dir, p), text);
    }
    if (git) {
      execFileSync('git', ['init', '-q'], { cwd: dir, env: childEnv() });
      execFileSync('git', ['add', '-A'], { cwd: dir, env: childEnv() });
    }
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Runs the copy in the folder `at` of `dir` with `args`, from `cwd` (default `dir`), `env` added to the child's: { status, stdout, stderr }. */
function runToc(dir, args, { at = 'scripts', cwd = dir, noPath = false, env = {} } = {}) {
  const r = spawnSync(process.execPath, [join(dir, at, 'toc.mjs'), ...args], { cwd, encoding: 'utf8', env: childEnv(dirname(dir), noPath, env) });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

// PACT-84 C1
test('toc: with no config, --check passes in this repo on its committed tables', () => {
  const r = spawnSync(process.execPath, [SCRIPT, '--check'], { cwd: REPO, encoding: 'utf8', env: childEnv() });
  assert.deepEqual({ status: r.status, stdout: r.stdout }, { status: 0, stdout: '' });
});

// PACT-84 C2
test('toc: maxUncoveredLines sets the threshold, and exclude takes folders, files and **/ names, replacing the default whole', () => {
  const doc60 = longDoc(56);
  assert.equal(covered('docs/a.md', doc60), false, 'under the default threshold');
  assert.equal(covered('docs/a.md', doc60, { ...DEFAULTS, maxUncoveredLines: 50 }), true, 'over a threshold of 50');
  assert.equal(covered('docs/a.md', doc60, { ...DEFAULTS, maxUncoveredLines: 60 }), false, 'a doc of exactly 60 lines is not over 60');
  const cfg = { maxUncoveredLines: 50, exclude: ['docs/old/', 'docs/skip.md', '**/CLAUDE.md'] };
  for (const p of ['docs/old/a.md', 'docs/old/deep/a.md', 'docs/skip.md', 'CLAUDE.md', 'a/b/CLAUDE.md']) assert.equal(covered(p, doc60, cfg), false, p);
  for (const p of ['docs/oldest/a.md', 'docs/sub/skip.md', 'NOTCLAUDE.md', 'a/NOTCLAUDE.md', 'docs/a.md']) assert.equal(covered(p, doc60, cfg), true, p);
  assert.equal(covered('docs/log/a.md', doc60, cfg), true, 'a key that is set replaces its default whole');
  assert.deepEqual(problems([{ path: 'docs/a.md', text: doc60 }], cfg), ['docs/a.md: no table of contents']);
  assert.deepEqual(problems([{ path: 'docs/a.md', text: withToc(doc60) }], cfg), []);
  assert.deepEqual(problems([{ path: 'CLAUDE.md', text: withToc(doc60) }], cfg), ['CLAUDE.md: holds a table of contents but is not covered']);
});

// PACT-84 C2, C3
test('toc: the config in the script folder sets the threshold in a run, and a bad config exits 2 with one line and writes nothing', () => {
  const files = { 'docs/a.md': longDoc(56) };
  withRepo({ files, config: '{"maxUncoveredLines": 50}' }, dir => {
    assert.deepEqual(runToc(dir, ['--check']), { status: 1, stdout: 'docs/a.md: no table of contents\n', stderr: '' });
    assert.equal(runToc(dir, []).stdout, 'wrote docs/a.md\n');
    assert.equal(readFileSync(join(dir, 'docs/a.md'), 'utf8'), withToc(files['docs/a.md']));
    assert.equal(runToc(dir, ['--check']).status, 0);
  });
  withRepo({ files, config: `﻿{"maxUncoveredLines": 50}` }, dir => assert.equal(runToc(dir, ['--check']).stdout, 'docs/a.md: no table of contents\n', 'a config saved with a byte order mark is read'));
  withRepo({ files }, dir => {
    mkdirSync(join(dir, 'scripts', CONFIG_FILE));
    assert.deepEqual(runToc(dir, ['--check']), { status: 2, stdout: 'toc.config.json: not readable: EISDIR\n', stderr: '' }, 'a config that cannot be read is an error, not the defaults');
  });
  const rows = [
    ['an unknown key', '{"maxUncovered": 50}', 'toc.config.json: maxUncovered: unknown key'],
    ['a string threshold', '{"maxUncoveredLines": "50"}', 'toc.config.json: maxUncoveredLines: must be an integer of at least 1'],
    ['a threshold of 0', '{"maxUncoveredLines": 0}', 'toc.config.json: maxUncoveredLines: must be an integer of at least 1'],
    ['a fractional threshold', '{"maxUncoveredLines": 1.5}', 'toc.config.json: maxUncoveredLines: must be an integer of at least 1'],
    ['exclude as a string', '{"exclude": "docs/"}', 'toc.config.json: exclude: must be an array of strings'],
    ['exclude holding a number', '{"exclude": ["docs/", 1]}', 'toc.config.json: exclude: must be an array of strings'],
    ['null', 'null', 'toc.config.json: not an object'],
    ['an array', '[]', 'toc.config.json: not an object'],
  ];
  for (const [name, config, line] of rows) {
    withRepo({ files: { 'docs/a.md': longDoc(120) }, config }, dir => {
      for (const args of [[], ['--check']]) assert.deepEqual(runToc(dir, args), { status: 2, stdout: `${line}\n`, stderr: '' }, `${name} ${args.join(' ')}`);
      assert.equal(readFileSync(join(dir, 'docs/a.md'), 'utf8'), longDoc(120), `${name}: no doc written`);
    });
  }
  withRepo({ files: { 'docs/a.md': longDoc(120) }, config: '{"exclude": [' }, dir => {
    for (const args of [[], ['--check']]) {
      const r = runToc(dir, args);
      assert.equal(r.status, 2, args.join(' '));
      assert.match(r.stdout, /^toc\.config\.json: not valid JSON: .+\n$/);
    }
    assert.equal(readFileSync(join(dir, 'docs/a.md'), 'utf8'), longDoc(120));
  });
});

// PACT-84 C3
test('toc: a copy with a Source line at line 2 and no config exits 2 and writes nothing, and a Source line that is malformed or off line 2 does not mark a vendored copy', () => {
  const files = { 'docs/a.md': longDoc(120) };
  withRepo({ files, source: true }, dir => {
    for (const args of [[], ['--check']]) assert.deepEqual(runToc(dir, args), { status: 2, stdout: 'toc.config.json: missing in a vendored copy\n', stderr: '' }, args.join(' '));
    assert.equal(readFileSync(join(dir, 'docs/a.md'), 'utf8'), files['docs/a.md']);
  });
  withRepo({ files, source: true, config: '{}' }, dir => assert.equal(runToc(dir, ['--check']).stdout, 'docs/a.md: no table of contents\n', 'an empty config is a config'));
  withRepo({ files, source: true }, dir => {
    const path = join(dir, 'scripts/toc.mjs');
    writeFileSync(path, readFileSync(path, 'utf8').replace(`${SOURCE}\n`, `${SOURCE}\r\n`));
    assert.equal(runToc(dir, ['--check']).stdout, 'toc.config.json: missing in a vendored copy\n', 'a Source line with a CRLF ending is still one');
  });
  for (const [name, line, index] of [
    ['a Source line on line 3', SOURCE, 2],
    ['a Source line with a word that is not a commit', '// Source: the-pact latest', 1],
    ['a Source line with a short commit', '// Source: the-pact abc123', 1],
    ['a Source line with a trailing word', `${SOURCE} extra`, 1],
  ]) {
    withRepo({ files }, dir => {
      const path = join(dir, 'scripts/toc.mjs');
      const script = readFileSync(path, 'utf8').split('\n');
      script.splice(index, 0, line);
      writeFileSync(path, script.join('\n'));
      assert.equal(runToc(dir, ['--check']).stdout, 'docs/a.md: no table of contents\n', `${name}: not a vendored copy, so the defaults apply`);
    });
  }
});

// PACT-84 C3
test('toc: outside a git work tree, or with git missing, the script exits 2 with one line', () => {
  const line = 'toc.mjs: not in a git work tree\n';
  withRepo({ git: false }, dir => assert.deepEqual(runToc(dir, ['--check']), { status: 2, stdout: line, stderr: '' }));
  withRepo({}, dir => assert.deepEqual(runToc(dir, ['--check'], { noPath: true }), { status: 2, stdout: line, stderr: '' }));
});

// PACT-84 C4
test("toc: run from two levels deep in a temporary git repo, the script finds that repo's root", () => {
  const files = { 'docs/a.md': longDoc(120), 'x/y/z/other.md': longDoc(120) };
  withRepo({ files, at: 'tools/vendor', config: '{}' }, dir => {
    const off = { status: 1, stdout: 'docs/a.md: no table of contents\nx/y/z/other.md: no table of contents\n', stderr: '' };
    for (const cwd of [dir, join(dir, 'x/y'), dirname(dir)]) assert.deepEqual(runToc(dir, ['--check'], { at: 'tools/vendor', cwd }), off, `from ${cwd}`);
    // Git exports these to a hook: in a linked worktree, GIT_DIR is absolute and points the root at the wrong folder.
    const hook = { GIT_DIR: join(dir, '.git'), GIT_INDEX_FILE: join(dir, '.git', 'index'), GIT_PREFIX: 'x/y/' };
    assert.deepEqual(runToc(dir, ['--check'], { at: 'tools/vendor', cwd: join(dir, 'x/y'), env: hook }), off, 'git variables from a hook do not move the root');
    assert.equal(runToc(dir, [], { at: 'tools/vendor', cwd: join(dir, 'x/y') }).stdout, 'wrote docs/a.md\nwrote x/y/z/other.md\n');
    assert.equal(readFileSync(join(dir, 'docs/a.md'), 'utf8'), withToc(files['docs/a.md']));
    assert.equal(runToc(dir, ['--check'], { at: 'tools/vendor' }).status, 0);
  });
});
