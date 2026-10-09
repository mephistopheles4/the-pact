// The fault-fixture guard (#140, T10): no file under gate/tests/ outside
// fixtures/, test files and helpers alike, imports a fault fixture
// (fixtures/*-faults.mjs), the contained driver (contained-driver.mjs) or the
// import trap and its driver (import-trap.mjs, import-trap-driver.mjs), by a
// static import or a dynamic import() naming one. Each patches or traps the
// whole process it loads in, so it loads only as a child's --import or main
// script; imported into a test process, it would patch every later case there,
// in-process ones included. Handing one to a child as a path or URL is fine.
// A backstop like the core source check: a name built at run time and passed
// through a variable gets past a text search. On the probe floor by name
// (AGENTS.md).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { tempDir } from './helpers.mjs';

const TESTS = dirname(fileURLToPath(import.meta.url));
const FIXTURE = /[A-Za-z0-9._-]*-faults\.mjs|contained-driver\.mjs|import-trap(?:-driver)?\.mjs/;
const SOURCE_EXT = /\.(?:mjs|cjs|js)$/;

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

/** Each fixture a module's source imports, statically or by a dynamic import() or require() naming it. */
function fixtureImports(src) {
  const out = [];
  for (const re of STATIC) for (const m of src.matchAll(re)) if (FIXTURE.test(m[2])) out.push(m[2]);
  for (const m of src.matchAll(CALL)) {
    const arg = callText(src, m.index + m[0].length);
    const hit = FIXTURE.exec(arg) ?? FIXTURE.exec(arg.replace(/['"`]\s*\+\s*['"`]/g, ''));
    if (hit) out.push(hit[0]);
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
  for (const f of ['helpers.mjs', 'gate-run.mjs', 'tables.mjs', 'fault-fixtures.test.mjs', 'render-edits.test.mjs']) assert.ok(seen.includes(f), f);
  assert.ok(!seen.some(f => f.startsWith('fixtures/')));
});

test('the fault-fixture guard\'s pattern names every fault fixture, the contained driver and the import trap the fixtures folder holds', () => {
  const held = readdirSync(join(TESTS, 'fixtures')).filter(f => FIXTURE.test(f)).sort();
  assert.deepEqual(held, ['contained-driver.mjs', 'contained-faults.mjs', 'import-trap-driver.mjs', 'import-trap.mjs', 'render-faults.mjs']);
  for (const f of held) assert.equal(FIXTURE.exec(f)[0], f);
});

// Planted sources build the fixture's name at run time, so this file's own
// text holds no import of one for the guard to find.
const RENDER_FAULTS = ['render', 'faults.mjs'].join('-');

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
  ['an import of the import trap', `await import(${JSON.stringify(`./fixtures/import-${'trap'}.mjs`)});\n`],
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

test('control: a file in a sub-folder other than fixtures/ is read', t => {
  const dir = tempDir(t, 'pact-fault-guard-');
  mkdirSync(join(dir, 'more', 'fixtures'), { recursive: true });
  writeFileSync(join(dir, 'more', 'fixtures', 'x.mjs'), `import '../../fixtures/${RENDER_FAULTS}';\n`);
  assert.deepEqual(fixtureImporters(dir), [`more/fixtures/x.mjs: ../../fixtures/${RENDER_FAULTS}`]);
});
