// The fault-fixture guard (#140, T10): no file under gate/tests/ outside
// fixtures/, test files and helpers alike, imports a fault fixture
// (fixtures/*-faults.mjs), the contained driver (contained-driver.mjs) or the
// import trap and its driver (import-trap.mjs, import-trap-driver.mjs), by a
// static import or a dynamic import() or require() naming one; nor imports
// any code module under fixtures/, which could relay one. Each patches or
// traps the whole process it loads in, so it loads only as a child's --import
// or main script; imported into a test process, it would patch every later
// case there, in-process ones included. Handing one to a child as a path or
// URL is fine. It reads .js, .mjs and .cjs files, and .ts, .mts and .cts,
// which Node 24 loads too. A backstop like the core source check: a name built
// at run time and passed through a variable, or a loader under another name,
// gets past a text search. Ordinary test code since #189.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { tempDir } from './tree.mjs';

const TESTS = dirname(fileURLToPath(import.meta.url));
const FIXTURE = /[A-Za-z0-9._-]*-faults\.mjs|contained-driver\.mjs|import-trap(?:-driver)?\.mjs/;
// Node 24 strips types by default, so a .ts, .mts or .cts helper loads too.
const SOURCE_EXT = /\.(?:[mc]?js|[mc]?ts)$/;
// Any code under fixtures/ may relay a fixture, so importing code from there counts too.
const CODE_EXT = /\.(?:[mc]?js|[mc]?ts)$/;
const INTO_FIXTURES = /(?:^|[\\/])fixtures[\\/]/;
const CALL_INTO_FIXTURES = /(['"`])fixtures\1|[\\/]fixtures[\\/]/;
const CALL_CODE_EXT = /\.(?:[mc]?js|[mc]?ts)\b/;

// A specifier in a static import or export, or the text inside import( … ) or require( … ).
const STATIC = [/\bfrom\s*(['"`])([^'"`\n]+)\1/g, /\bimport\s*(['"`])([^'"`\n]+)\1/g];
const CALL = /\b(?:import|require)\s*\(/g;

/** The text of the call whose "(" ends at `i`, up to its matching ")", minding strings. */
function callText(src, i) {
  let depth = 1;
  let j = i;
  while (j < src.length && depth > 0) {
    const c = src[j];
    if (c === '"' || c === "'" || c === '`') {
      j += 1;
      while (j < src.length && src[j] !== c) j += src[j] === '\\' ? 2 : 1;
    } else if (c === '(') depth += 1;
    else if (c === ')') depth -= 1;
    j += 1;
  }
  return src.slice(i, j - 1);
}

const REGEX_AFTER = new Set([...'(,=:[!&|?{};+-*%<>~^']);
const REGEX_AFTER_WORDS = new Set(['return', 'typeof', 'case', 'of', 'in', 'void', 'delete', 'throw', 'yield', 'await']);

/**
 * For each index of `src`, whether it is code: not inside a comment, a string,
 * a template literal's text (its ${ } parts are code) or a regex literal. An
 * import written inside a string, as a test's planted file, is text, not an
 * import this file makes.
 */
function codeMask(src) {
  const code = new Array(src.length).fill(true);
  const text = (from, to) => code.fill(false, from, Math.min(to, src.length));
  const braces = []; // for each open template ${, the brace depth it opened at
  let depth = 0;
  let prev = '';
  let word = '';
  let i = 0;
  const template = start => {
    // From just past a backtick (or a ${ }'s closing brace) to the template's end or its next ${.
    let j = start;
    while (j < src.length && src[j] !== '`' && !(src[j] === '$' && src[j + 1] === '{')) j += src[j] === '\\' ? 2 : 1;
    text(start, j + (src[j] === '`' ? 1 : 2));
    if (src[j] === '$') {
      braces.push(depth);
      depth += 1;
      return j + 2;
    }
    return j + 1;
  };
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      const j = src.indexOf('\n', i);
      text(i, j < 0 ? src.length : j);
      i = j < 0 ? src.length : j;
    } else if (c === '/' && src[i + 1] === '*') {
      const j = src.indexOf('*/', i + 2);
      text(i, j < 0 ? src.length : j + 2);
      i = j < 0 ? src.length : j + 2;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      text(i, j + 1);
      i = j + 1;
      prev = '"';
      word = '';
    } else if (c === '`') {
      text(i, i + 1);
      i = template(i + 1);
      prev = '"';
      word = '';
    } else if (c === '}' && braces.length && braces[braces.length - 1] === depth - 1) {
      braces.pop();
      depth -= 1;
      text(i, i + 1);
      i = template(i + 1);
      prev = '"';
      word = '';
    } else if (c === '/' && (prev === '' || REGEX_AFTER.has(prev) || REGEX_AFTER_WORDS.has(word))) {
      let j = i + 1;
      let inClass = false;
      while (j < src.length && src[j] !== '\n') {
        if (src[j] === '\\') j += 2;
        else if (src[j] === '[') (inClass = true), (j += 1);
        else if (src[j] === ']') (inClass = false), (j += 1);
        else if (src[j] === '/' && !inClass) break;
        else j += 1;
      }
      text(i, j + 1);
      i = j + 1;
      prev = ')';
      word = '';
    } else {
      if (c === '{') depth += 1;
      else if (c === '}') depth -= 1;
      if (!/\s/.test(c)) {
        word = /[A-Za-z0-9_$]/.test(c) ? (/[A-Za-z0-9_$]/.test(prev) ? word + c : c) : '';
        prev = c;
      }
      i += 1;
    }
  }
  return code;
}

/**
 * Each fixture, or module under fixtures/, a module's source imports:
 * statically, or by a dynamic import() or require() naming it. Only an
 * import or require keyword in code counts.
 */
function fixtureImports(src) {
  const out = [];
  const code = codeMask(src);
  for (const re of STATIC) {
    for (const m of src.matchAll(re)) {
      if (!code[m.index]) continue;
      if (FIXTURE.test(m[2]) || (INTO_FIXTURES.test(m[2]) && CODE_EXT.test(m[2]))) out.push(m[2]);
    }
  }
  for (const m of src.matchAll(CALL)) {
    if (!code[m.index]) continue;
    const arg = callText(src, m.index + m[0].length);
    const joined = arg.replace(/['"`]\s*\+\s*['"`]/g, '');
    const hit = FIXTURE.exec(arg) ?? FIXTURE.exec(joined);
    if (hit) out.push(hit[0]);
    else if (CALL_INTO_FIXTURES.test(joined) && CALL_CODE_EXT.test(joined)) out.push('a module under fixtures/');
  }
  return out;
}

/** Every source file under `dir`, but under its top-level fixtures/ folder, as [relative path, text]. */
function sources(dir) {
  const out = [];
  const walk = (d, top) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) {
        if (!(top && e.name === 'fixtures')) walk(p, false);
      } else if (SOURCE_EXT.test(e.name)) out.push([relative(dir, p).split('\\').join('/'), readFileSync(p, 'utf8')]);
    }
  };
  walk(dir, true);
  return out;
}

/** The guard over a tests folder: each file outside fixtures/ that imports a fixture, with what it imports. */
function fixtureImporters(dir) {
  return sources(dir)
    .map(([rel, src]) => [rel, fixtureImports(src)])
    .filter(([, hits]) => hits.length)
    .map(([rel, hits]) => `${rel}: ${hits.join(', ')}`);
}

test('the fault-fixture guard: no file under gate/tests/ outside fixtures/ imports a fault fixture, the contained driver or the import trap', () => {
  assert.deepEqual(fixtureImporters(TESTS), []);
});

test('the fault-fixture guard reads every source file outside fixtures/, test files and helpers alike', () => {
  const seen = sources(TESTS).map(([rel]) => rel);
  for (const f of ['text.mjs', 'tree.mjs', 'gate-files.mjs', 'payload.mjs', 'install-harness.mjs', 'gate-run.mjs', 'tables.mjs', 'fault-fixtures.test.mjs', 'render-edits.test.mjs']) assert.ok(seen.includes(f), f);
  assert.ok(!seen.some(f => f.startsWith('fixtures/')));
});

test('the fault-fixture guard\'s pattern names every fault fixture, the contained driver and the import trap the fixtures folder holds', () => {
  const held = readdirSync(join(TESTS, 'fixtures')).filter(f => FIXTURE.test(f)).sort();
  assert.deepEqual(held, ['contained-driver.mjs', 'contained-faults.mjs', 'import-trap-driver.mjs', 'import-trap.mjs', 'render-faults.mjs']);
  for (const f of held) assert.equal(FIXTURE.exec(f)[0], f);
});

// Planted sources build the fixture's name, and the folder's, at run time, so
// this file's own text holds no import of one for the guard to find.
const RENDER_FAULTS = ['render', 'faults.mjs'].join('-');
const FIX = ['fix', 'tures'].join('');

test('bad case: a planted test file and a planted helper that import the render fault fixture each fail the guard', t => {
  const dir = tempDir(t, 'pact-fault-guard-');
  writeFileSync(join(dir, 'planted.test.mjs'), `import { test } from 'node:test';\nimport './fixtures/${RENDER_FAULTS}';\ntest('x', () => {});\n`);
  writeFileSync(join(dir, 'planted-helper.mjs'), `export { patched } from './fixtures/${RENDER_FAULTS}';\n`);
  assert.deepEqual(fixtureImporters(dir), [`planted-helper.mjs: ./fixtures/${RENDER_FAULTS}`, `planted.test.mjs: ./fixtures/${RENDER_FAULTS}`]);
});

for (const [label, body] of [
  ['a default import', `import faults from './fixtures/${RENDER_FAULTS}';\n`],
  ['a named import over two lines', `import {\n  patched,\n} from "./fixtures/${RENDER_FAULTS}";\n`],
  ['a dynamic import of a literal', `await import('./fixtures/${RENDER_FAULTS}');\n`],
  ['a dynamic import of a built path', `await import(pathToFileURL(join(HERE, 'fixtures', '${RENDER_FAULTS}')).href);\n`],
  ['a dynamic import of a joined literal', `await import('./fixtures/render-' + '${'faults'}.mjs');\n`],
  ['a require', `const f = require('./fixtures/${RENDER_FAULTS}');\n`],
  ['an import of the contained driver', `import './fixtures/contained-${'driver'}.mjs';\n`],
  ['an import of the import trap', `await import(${JSON.stringify(`./${FIX}/import-${'trap'}.mjs`)});\n`],
  ['a static import of a relay module under fixtures/', `import { x } from './${FIX}/relay.mjs';\n`],
  ['a dynamic import of a relay module under fixtures/', `await import(pathToFileURL(join(HERE, '${FIX}', 'relay.mjs')).href);\n`],
  ['a require of a TypeScript relay under fixtures/', `const r = require('./${FIX}/relay.cts');\n`],
  ['an import inside a template literal\'s ${ } part', `const s = \`a \${await import('./${FIX}/${RENDER_FAULTS}')} b\`;\n`],
  ['an import after a string, a comment and a regex', `const a = 'x'; // note\nconst re = /y/g;\nimport './${FIX}/${RENDER_FAULTS}';\n`],
]) {
  test(`bad case: the fault-fixture guard catches ${label}`, () => {
    assert.equal(fixtureImports(body).length, 1, body);
  });
}

test('control: handing a fixture to a child as --import or a main script, or naming it in a string, passes the guard', t => {
  const dir = tempDir(t, 'pact-fault-guard-');
  writeFileSync(
    join(dir, 'child.test.mjs'),
    `const FAULTS = pathToFileURL(join(HERE, 'fixtures', '${RENDER_FAULTS}')).href;\nspawnSync(process.execPath, ['--import', FAULTS, RENDER]);\nconst { check } = await import(pathToFileURL(join(GATE, \`\${m}-core.mjs\`)).href);\n`,
  );
  mkdirSync(join(dir, 'fixtures'));
  writeFileSync(join(dir, 'fixtures', 'driver.mjs'), `import './${RENDER_FAULTS}';\n`);
  assert.deepEqual(fixtureImporters(dir), []);
});

test('bad case: a TypeScript-named helper that imports the render fault fixture fails the guard', t => {
  const dir = tempDir(t, 'pact-fault-guard-');
  for (const ext of ['ts', 'mts', 'cts']) writeFileSync(join(dir, `planted-helper.${ext}`), `import './${FIX}/${RENDER_FAULTS}';\n`);
  assert.deepEqual(fixtureImporters(dir), ['mts', 'cts', 'ts'].sort().map(ext => `planted-helper.${ext}: ./${FIX}/${RENDER_FAULTS}`));
});

test('control: an import written inside a string, a template\'s text or a comment is text, and passes the guard', () => {
  for (const body of [
    `const planted = "import './${FIX}/${RENDER_FAULTS}';";\n`,
    `const planted = \`await import('./${FIX}/${RENDER_FAULTS}');\`;\n`,
    `const planted = \`await import('\${'./${FIX}/d.mjs'}');\`;\n`,
    `// import './${FIX}/${RENDER_FAULTS}';\n`,
    `/* await import('./${FIX}/relay.mjs'); */\n`,
  ]) {
    assert.deepEqual(fixtureImports(body), [], body);
  }
});

test('control: a data file under fixtures/, read by path, passes the guard', t => {
  const dir = tempDir(t, 'pact-fault-guard-');
  writeFileSync(join(dir, 'reads.test.mjs'), `const rows = readFileSync(join(HERE, '${FIX}', 'run', 'written-out.txt'), 'utf8');\nconst list = await import('./${FIX}/list.json', { with: { type: 'json' } });\n`);
  assert.deepEqual(fixtureImporters(dir), []);
});

test('control: a file in a sub-folder other than fixtures/ is read', t => {
  const dir = tempDir(t, 'pact-fault-guard-');
  mkdirSync(join(dir, 'more', 'fixtures'), { recursive: true });
  writeFileSync(join(dir, 'more', 'fixtures', 'x.mjs'), `import '../../fixtures/${RENDER_FAULTS}';\n`);
  assert.deepEqual(fixtureImporters(dir), [`more/fixtures/x.mjs: ../../fixtures/${RENDER_FAULTS}`]);
});
