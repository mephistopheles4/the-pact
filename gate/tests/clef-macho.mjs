// The Mach-O check run at pin time (spec 0003 M4): reads, in node, the load
// commands of each kept Mach-O file of the macOS archive and flags any that
// would load code the pin's hashes don't cover. Used by clef-files-list.mjs and
// by its test; never installed, and nothing it reads is run.
import { posix } from 'node:path';

const LOADS = new Map([[0xc, 'LC_LOAD_DYLIB'], [0x80000018, 'LC_LOAD_WEAK_DYLIB'], [0x8000001f, 'LC_REEXPORT_DYLIB'], [0x20, 'LC_LAZY_LOAD_DYLIB']]);
const LC_RPATH = 0x8000001c;
const LC_ID_DYLIB = 0xd;
const LC_BUILD_VERSION = 0x32;
const THIN_ARM64 = 0xfeedfacf;
const CPU_ARM64 = 0x0100000c;
const MAGICS = new Set([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe, 0xbebafeca, 0xcafebabf, 0xbfbafeca]);
const ALLOWED = ['@rpath/', '@loader_path/', '@executable_path/', '/usr/lib/', '/System/'];

/** True when the bytes start with a Mach-O or fat magic, in either byte order. */
export const looksMachO = buf => buf.length >= 4 && MAGICS.has(buf.readUInt32BE(0));

const cstr = (buf, at, end) => {
  const z = buf.indexOf(0, at);
  return buf.toString('utf8', at, z < 0 || z > end ? end : z);
};
const version = v => `${v >>> 16}.${(v >>> 8) & 0xff}.${v & 0xff}`;

/** The load commands of one thin arm64 Mach-O, as { loads: [{ kind, name }], rpaths, id, minos }; throws on another shape. */
export function readMachO(buf) {
  if (buf.length < 32 || buf.readUInt32LE(0) !== THIN_ARM64) throw new Error('not a thin 64-bit Mach-O');
  if (buf.readUInt32LE(4) !== CPU_ARM64) throw new Error('not arm64');
  const ncmds = buf.readUInt32LE(16);
  const out = { loads: [], rpaths: [], id: null, minos: null };
  let at = 32;
  for (let i = 0; i < ncmds; i++) {
    if (at + 8 > buf.length) throw new Error('a load command runs past the end');
    const cmd = buf.readUInt32LE(at);
    const size = buf.readUInt32LE(at + 4);
    if (size < 8 || at + size > buf.length) throw new Error('a load command runs past the end');
    const end = at + size;
    if (LOADS.has(cmd)) out.loads.push({ kind: LOADS.get(cmd), name: cstr(buf, at + buf.readUInt32LE(at + 8), end) });
    else if (cmd === LC_RPATH) out.rpaths.push(cstr(buf, at + buf.readUInt32LE(at + 8), end));
    else if (cmd === LC_ID_DYLIB) out.id = cstr(buf, at + buf.readUInt32LE(at + 8), end);
    else if (cmd === LC_BUILD_VERSION) out.minos = version(buf.readUInt32LE(at + 12));
    at = end;
  }
  return out;
}

/**
 * The flags for a set of kept files, all in one folder: `files` maps each name
 * the runtime folder will hold (a copy under a link's name included) to its
 * bytes. Each flag is a plain sentence; an empty list means the set passes.
 */
export function machoFlags(files) {
  const flags = [];
  const read = new Map();
  for (const [name, buf] of files) {
    if (!looksMachO(buf)) continue;
    try {
      read.set(name, readMachO(buf));
    } catch (e) {
      flags.push(`${name}: ${e.message}`);
    }
  }
  const dir = '/kept';
  for (const [name, m] of read) {
    const roots = [];
    for (const r of m.rpaths) {
      const rel = r === '@loader_path' || r === '@executable_path' ? '.' : r.startsWith('@loader_path/') ? r.slice(13) : r.startsWith('@executable_path/') ? r.slice(17) : null;
      const abs = rel === null ? null : posix.normalize(posix.join(dir, rel));
      if (abs === null || (abs !== dir && !abs.startsWith(`${dir}/`))) flags.push(`${name}: an rpath that leaves the kept folder: ${r}`);
      else roots.push(abs);
    }
    for (const { kind, name: lib } of m.loads) {
      if (!ALLOWED.some(p => lib.startsWith(p))) flags.push(`${name}: ${kind} outside the allowed paths: ${lib}`);
      if (lib.startsWith('@rpath/') && !roots.some(root => files.has(posix.relative(dir, posix.join(root, lib.slice(7)))))) flags.push(`${name}: ${lib} does not resolve to a kept file`);
    }
  }
  return { flags, read };
}
