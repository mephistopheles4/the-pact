// Test helpers that read the gate's own files (#151): a gate module's text,
// a plant into it, a copy of the gate, and the install script's text. They
// read the gate and the install script, never the payload. Importing this
// file touches nothing.
import assert from 'node:assert/strict';
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GATE, REPO } from './text.mjs';

/**
 * The install script's text, for a test that reads it and never runs it
 * (#140, T6). The runner puts a test file that names the script in the install
 * tier, so a file that never installs reads it through here. A test that runs
 * the script goes through the install harness, whose guard counts it.
 */
export function installScriptText() {
  return readFileSync(join(REPO, 'scripts', 'install.ps1'), 'utf8');
}

// ------------------------------------------------------------ a gate module's own text (#155)

/**
 * The files of gate module `name` (`render`, `seam-a`, `project` or `review`)
 * in `gateDir`: `<name>.mjs`, and `<name>-core.mjs` when it exists. A test that
 * reads or plants a module's text looks in both, so moving code between the
 * two can't leave it reading, or planting into, a file that no longer holds it.
 */
export function moduleFiles(gateDir, name) {
  const files = [join(gateDir, `${name}.mjs`)];
  const core = join(gateDir, `${name}-core.mjs`);
  if (existsSync(core)) files.push(core);
  return files;
}

/** The one file of module `name` that holds `text`; fails unless `text` occurs exactly once across the module's files. */
export function moduleFileHolding(gateDir, name, text) {
  const hits = moduleFiles(gateDir, name).flatMap(p => Array(readFileSync(p, 'utf8').split(text).length - 1).fill(p));
  assert.equal(hits.length, 1, `expected exactly one ${JSON.stringify(text)} in gate module ${name}, found ${hits.length}`);
  return hits[0];
}

/** The one match of `re` across module `name`'s files; fails unless there is exactly one. */
export function moduleMatch(gateDir, name, re) {
  const all = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  const hits = moduleFiles(gateDir, name).flatMap(p => [...readFileSync(p, 'utf8').matchAll(all)]);
  assert.equal(hits.length, 1, `expected exactly one match of ${re} in gate module ${name}, found ${hits.length}`);
  return hits[0];
}

/** Plant into module `name` in `gateDir`: replace its one `from` with `to`. Returns the planted file. */
export function plantModule(gateDir, name, from, to) {
  const p = moduleFileHolding(gateDir, name, from);
  writeFileSync(p, readFileSync(p, 'utf8').replace(from, () => to));
  return p;
}

/** A copy of every file in the gate folder outside its tests, under `dest`, as the install stages it. */
export function copyGate(dest) {
  const tests = join(GATE, 'tests');
  cpSync(GATE, dest, { recursive: true, filter: src => src !== tests });
  return dest;
}
