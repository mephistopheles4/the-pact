// Test-only fault injection for the renderer (#93). Loaded with
// `node --import <this file> gate/render.mjs ...`, never by the install, so no
// switch ships. It wraps node:fs functions and re-syncs the ESM exports, so
// the renderer's named imports see the wrappers. PACT_FAULT names one fault;
// PACT_FAULT_LOG, when set, receives one line per call it observes.
//
//   swap-before-open   just before the configuration file is opened, replace
//                      it with another regular file (a new inode)
//   hardlink-before-open just before the open, give the file a second name (a
//                      hard link): same inode, two links
//   link-before-open   just before the open, replace it with a link to a good
//                      file (Unix: what O_NOFOLLOW catches)
//   realpath-elsewhere realpathSync.native reports another path for the file
//   lstat-eacces       lstat of the pact folder fails with EACCES
//   lstat-config-eacces lstat of the configuration file fails with EACCES
//   realpath-home-eacces realpath of the Claude home folder fails with EACCES
//   count              no fault: log each open and read of the configuration file
//   lstat-blocks-eacces lstat of the blocks folder fails with EACCES
//   review-plant       (gate/review.mjs) just before rendered-rules.txt is
//                      created, plant a file at that name
//   review-fail-diff   (gate/review.mjs) the create of config.diff fails
//   review-extra       (gate/review.mjs) a file appears in the review folder
//                      after both files are written, before the last check
//   review-moved       (gate/review.mjs) the review folder's real path reads
//                      differently the second time it is looked up
//   review-link        (gate/review.mjs) rendered-rules.txt gains a second
//                      name (a hard link, in PACT_FAULT_DIR) just after it is
//                      opened
//
// PACT_FAULT_FILE=block points the file faults (swap, hard link, link,
// realpath, count) at block files under pact/blocks/ instead of the
// configuration file (#94).
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

const fault = process.env.PACT_FAULT ?? '';
const log = process.env.PACT_FAULT_LOG;
const target = process.env.PACT_FAULT_FILE === 'block' ? /[\\/]pact[\\/]blocks[\\/].+\.md$/ : /[\\/]pact[\\/]config\.json$/;
const isConfig = p => typeof p === 'string' && target.test(p);
const isBlocks = p => typeof p === 'string' && /[\\/]pact[\\/]blocks$/.test(p);
const isPact = p => typeof p === 'string' && /[\\/]pact$/.test(p);
const note = line => log && fs.appendFileSync(log, `${line}\n`);

const { readdirSync } = fs;
let readdirs = 0;
fs.readdirSync = function (p, ...rest) {
  readdirs += 1;
  // Only into a test's own temp folder, whatever calls come first.
  if (fault === 'review-extra' && readdirs === 2 && typeof p === 'string' && /[\\/]pact-test-[^\\/]+$/.test(p)) writeFileSync(`${p}/extra.txt`, 'x\n');
  return readdirSync(p, ...rest);
};

const { openSync, lstatSync, linkSync, readSync, readFileSync, renameSync, writeFileSync, symlinkSync, unlinkSync } = fs;
const realNative = fs.realpathSync.native;
const configFds = new Set();
let reviewReals = 0;

fs.openSync = function (p, ...rest) {
  // gate/review.mjs: a file planted at the review file's name just before its
  // exclusive create, past the empty-folder check (#94).
  if (fault === 'review-plant' && typeof p === 'string' && /[\\/]rendered-rules\.txt$/.test(p)) writeFileSync(p, 'planted\n');
  if (fault === 'review-fail-diff' && typeof p === 'string' && /[\\/]config\.diff$/.test(p) && !/pact-review-in-/.test(p)) {
    const e = new Error('EACCES: planted');
    e.code = 'EACCES';
    throw e;
  }
  if (fault === 'review-link' && typeof p === 'string' && /[\\/]pact-test-[^\\/]+[\\/]rendered-rules\.txt$/.test(p)) {
    const fd = openSync(p, ...rest);
    linkSync(p, `${process.env.PACT_FAULT_DIR}/second-name.txt`);
    return fd;
  }
  if (isConfig(p)) {
    if (fault === 'swap-before-open') {
      writeFileSync(`${p}.swap`, '{"schema": 1}');
      renameSync(`${p}.swap`, p);
    } else if (fault === 'hardlink-before-open') {
      linkSync(p, `${p}.2`);
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
  if ((fault === 'lstat-eacces' && isPact(p)) || (fault === 'lstat-config-eacces' && isConfig(p)) || (fault === 'lstat-blocks-eacces' && isBlocks(p))) {
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
  if (fault === 'review-moved' && typeof p === 'string' && /[\\/]pact-test-[^\\/]+$/.test(p) && (reviewReals += 1) === 2) return `${r}-moved`;
  return fault === 'realpath-elsewhere' && isConfig(p) ? `${r}.elsewhere` : r;
};

syncBuiltinESMExports();
