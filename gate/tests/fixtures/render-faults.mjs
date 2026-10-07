// Test-only fault injection for the renderer (#93). Loaded with
// `node --import <this file> gate/render.mjs ...`, never by the install, so no
// switch ships. It wraps node:fs functions and re-syncs the ESM exports, so
// the renderer's named imports see the wrappers. PACT_FAULT names one fault;
// PACT_FAULT_LOG, when set, receives one line per call it observes.
//
//   swap-before-open   just before the configuration file is opened, replace
//                      it with another regular file (a new inode)
//   link-before-open   just before the open, replace it with a link to a good
//                      file (Unix: what O_NOFOLLOW catches)
//   realpath-elsewhere realpathSync.native reports another path for the file
//   lstat-eacces       lstat of the pact folder fails with EACCES
//   lstat-config-eacces lstat of the configuration file fails with EACCES
//   realpath-home-eacces realpath of the Claude home folder fails with EACCES
//   count              no fault: log each open and read of the configuration file
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

const fault = process.env.PACT_FAULT ?? '';
const log = process.env.PACT_FAULT_LOG;
const isConfig = p => typeof p === 'string' && /[\\/]pact[\\/]config\.json$/.test(p);
const isPact = p => typeof p === 'string' && /[\\/]pact$/.test(p);
const note = line => log && fs.appendFileSync(log, `${line}\n`);

const { openSync, lstatSync, readSync, readFileSync, renameSync, writeFileSync, symlinkSync, unlinkSync } = fs;
const realNative = fs.realpathSync.native;
const configFds = new Set();

fs.openSync = function (p, ...rest) {
  if (isConfig(p)) {
    if (fault === 'swap-before-open') {
      writeFileSync(`${p}.swap`, '{"schema": 1}');
      renameSync(`${p}.swap`, p);
    } else if (fault === 'link-before-open') {
      writeFileSync(`${p}.good`, '{"schema": 1}');
      unlinkSync(p);
      symlinkSync(`${p}.good`, p, 'file');
    }
    const fd = openSync(p, ...rest);
    configFds.add(fd);
    note(`open ${fd}`);
    return fd;
  }
  return openSync(p, ...rest);
};

fs.readSync = function (fd, buf, off, len, pos) {
  const got = readSync(fd, buf, off, len, pos);
  if (configFds.has(fd)) note(`read ${len} ${got}`);
  return got;
};

fs.readFileSync = function (p, ...rest) {
  if (isConfig(p)) note('readFileSync');
  return readFileSync(p, ...rest);
};

fs.lstatSync = function (p, ...rest) {
  if ((fault === 'lstat-eacces' && isPact(p)) || (fault === 'lstat-config-eacces' && isConfig(p))) {
    const e = new Error('EACCES: planted');
    e.code = 'EACCES';
    throw e;
  }
  return lstatSync(p, ...rest);
};

fs.realpathSync.native = function (p, ...rest) {
  if (fault === 'realpath-home-eacces' && !isConfig(p)) {
    const e = new Error('EACCES: planted');
    e.code = 'EACCES';
    throw e;
  }
  const r = realNative(p, ...rest);
  return fault === 'realpath-elsewhere' && isConfig(p) ? `${r}.elsewhere` : r;
};

syncBuiltinESMExports();
