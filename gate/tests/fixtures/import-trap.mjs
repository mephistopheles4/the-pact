// Test-only preload for the core import guard (#155). Loaded with
// `node --import <this file> import-trap-driver.mjs <module URL>`, never by the
// install, so nothing ships. It wraps every node:fs and node:child_process
// function, os.homedir, os.userInfo and os.hostname, and process.env itself,
// and re-syncs the ESM exports so a module's named imports see the wrappers.
// While armed, each wrapped call throws and is recorded, so a module that
// catches the throw is still caught. The driver arms the trap around one
// import and lifts it after: the cores read the home folder inside check().
import childProcess from 'node:child_process';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';

let armed = false;
const hits = [];
const SELF = import.meta.url;
const DRIVER = 'import-trap-driver.mjs';

// Node's own module loader reads process.env while it imports, so a call counts
// only when module code made it: some frame on the stack is a file: URL other
// than this file and the driver. Every module the import runs is such a file.
function fromModuleCode() {
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = Infinity;
  const stack = new Error().stack;
  Error.stackTraceLimit = limit;
  return stack
    .split('\n')
    .slice(1)
    .some(l => l.includes('file://') && !l.includes(SELF) && !l.includes(DRIVER));
}

function trap(name) {
  if (!armed || !fromModuleCode()) return;
  hits.push(name);
  throw new Error(`import trap: ${name}`);
}

function wrapAll(obj, prefix) {
  for (const key of Object.keys(obj)) {
    const fn = obj[key];
    // Classes (Stats, Dirent, ReadStream ...) are left whole: wrapping one breaks `new`.
    if (typeof fn !== 'function' || /^[A-Z]/.test(key)) continue;
    obj[key] = function (...args) {
      trap(`${prefix}.${key}`);
      return fn.apply(this, args);
    };
  }
}

wrapAll(fs, 'fs');
wrapAll(fs.promises, 'fs.promises');
wrapAll(childProcess, 'child_process');
for (const key of ['homedir', 'userInfo', 'hostname']) {
  const fn = os[key];
  os[key] = function (...args) {
    trap(`os.${key}`);
    return fn.apply(this, args);
  };
}
const env = process.env;
Object.defineProperty(process, 'env', {
  configurable: true,
  enumerable: true,
  get() {
    trap('process.env');
    return env;
  },
});
syncBuiltinESMExports();

globalThis[Symbol.for('pact.importTrap')] = Object.freeze({
  arm: () => {
    armed = true;
  },
  lift: () => {
    armed = false;
  },
  hits: () => [...hits],
});
