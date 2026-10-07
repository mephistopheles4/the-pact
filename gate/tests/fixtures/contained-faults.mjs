// Test-only fault injection for gate/contained.mjs (#95). Loaded with
// `node --import <this file> <driver> ...`, never by the install, so no switch
// ships. It wraps node:fs functions and re-syncs the ESM exports, so the
// module's named imports see the wrappers. PACT_FAULT names one fault;
// PACT_FAULT_LOG, when set, receives one line per call it observes.
//
//   log                no fault: log each open, lstat, fstat, write and rename
//                      of a temp file (a name ending .pact-tmp) and its target
//   swap-temp          just after the temp file is opened, move it aside (to
//                      <temp>.moved) and put a new empty file at its name
//   link-after-rename  just after the rename, replace the target with a link
//                      to PACT_FAULT_DIR/elsewhere.txt
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { basename } from 'node:path';

const fault = process.env.PACT_FAULT ?? '';
const log = process.env.PACT_FAULT_LOG;
const isTemp = p => typeof p === 'string' && p.endsWith('.pact-tmp');
const note = line => log && fs.appendFileSync(log, `${line}\n`);

const { openSync, lstatSync, fstatSync, writeSync, renameSync, writeFileSync, symlinkSync, unlinkSync } = fs;
const tempFds = new Set();

fs.openSync = function (p, ...rest) {
  const fd = openSync(p, ...rest);
  if (isTemp(p)) {
    tempFds.add(fd);
    note(`open ${basename(p)}`);
    if (fault === 'swap-temp') {
      renameSync(p, `${p}.moved`);
      writeFileSync(p, '');
    }
  }
  return fd;
};

fs.lstatSync = function (p, ...rest) {
  if (typeof p === 'string') note(`lstat ${isTemp(p) ? 'temp' : basename(p)}`);
  return lstatSync(p, ...rest);
};

fs.fstatSync = function (fd, ...rest) {
  if (tempFds.has(fd)) note('fstat temp');
  return fstatSync(fd, ...rest);
};

fs.writeSync = function (fd, ...rest) {
  if (tempFds.has(fd)) note('write temp');
  return writeSync(fd, ...rest);
};

fs.renameSync = function (from, to) {
  renameSync(from, to);
  if (isTemp(from)) {
    note(`rename ${basename(to)}`);
    if (fault === 'link-after-rename') {
      unlinkSync(to);
      symlinkSync(`${process.env.PACT_FAULT_DIR}/elsewhere.txt`, to, 'file');
    }
  }
};

syncBuiltinESMExports();
