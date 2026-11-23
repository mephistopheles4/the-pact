// The ELF and PE report run at pin time (spec 0005 U5): reads, in node, the
// dynamic section of each kept ELF file and the import tables of each kept PE
// file, and flags any library the pin's hashes don't cover, any wrong machine
// and any hybrid Windows image. Prints the row's glibc floor and the version
// needs of each allowed outside library. Used by clef-files-list.mjs and by its
// test; never installed, and nothing it reads is run.

const EM = new Map([[62, 'EM_X86_64'], [183, 'EM_AARCH64']]);
const ROW_EM = { x64: 'EM_X86_64', arm64: 'EM_AARCH64' };
const PE_MACHINE = new Map([[0x8664, 'AMD64'], [0xaa64, 'ARM64'], [0xa641, 'ARM64EC']]);
const ROW_PE = { x64: 'AMD64', arm64: 'ARM64' };

const PT_LOAD = 1;
const PT_DYNAMIC = 2;
const DT = { NULL: 0, NEEDED: 1, STRTAB: 5, VERNEED: 0x6ffffffe, VERNEEDNUM: 0x6fffffff };

// Spec 0005 U5, with the lead's decision 93 (the OpenSSL 3 and Visual C++ names, and the two names kept to one file).
const LINUX_ALLOWED = [/^libc\.so\.6$/, /^libm\.so\.6$/, /^libpthread\.so\.0$/, /^libdl\.so\.2$/, /^librt\.so\.1$/, /^ld-linux-.+\.so\..+$/, /^libstdc\+\+\.so\.6$/, /^libgcc_s\.so\.1$/, /^libgomp\.so\.1$/, /^libssl\.so\.3$/, /^libcrypto\.so\.3$/];
const LINUX_VULKAN = [/^libvulkan\.so\.1$/];
const WIN_ALLOWED = [/^kernel32\.dll$/, /^advapi32\.dll$/, /^user32\.dll$/, /^shell32\.dll$/, /^ole32\.dll$/, /^ws2_32\.dll$/, /^ntdll\.dll$/, /^bcrypt\.dll$/, /^api-ms-win-.+$/, /^ucrtbase\.dll$/, /^msvcp140\.dll$/, /^vcruntime140\.dll$/, /^vcruntime140_1\.dll$/, /^crypt32\.dll$/, /^psapi\.dll$/];
const WIN_VULKAN = [/^vulkan-1\.dll$/];
/** Names allowed to one kept file only (lower case): Windows imports of the connect tool. */
const WIN_ONLY_IN = new Map([['bcryptprimitives.dll', 'llama-connect.exe'], ['iphlpapi.dll', 'llama-connect.exe']]);

const bad = m => new Error(m);

/** True when the bytes start with the ELF magic. */
export const looksElf = buf => buf.length >= 4 && buf.readUInt32BE(0) === 0x7f454c46;
/** True when the bytes start with the DOS header's `MZ`. */
export const looksPe = buf => buf.length >= 2 && buf[0] === 0x4d && buf[1] === 0x5a;

const cstr = (buf, at) => {
  if (at < 0 || at >= buf.length) throw bad('a name that lies outside the file');
  const z = buf.indexOf(0, at);
  if (z < 0) throw bad('a name that does not end');
  return buf.toString('latin1', at, z);
};

/** The needed names and per-library version needs of one little-endian ELF64 file, as { machine, needed: [], versions: Map(file -> [version]) }. */
export function readElf(buf) {
  if (buf.length < 64 || !looksElf(buf) || buf[4] !== 2 || buf[5] !== 1) throw bad('not a 64-bit little-endian ELF');
  const machine = buf.readUInt16LE(18);
  const out = { machine: EM.get(machine) ?? `machine ${machine}`, needed: [], versions: new Map() };
  const phoff = Number(buf.readBigUInt64LE(32));
  const phentsize = buf.readUInt16LE(54);
  const phnum = buf.readUInt16LE(56);
  if (phentsize < 56 || phoff + phnum * phentsize > buf.length) throw bad('a program header table that runs past the end');
  const loads = [];
  let dynamic = null;
  for (let i = 0; i < phnum; i++) {
    const p = phoff + i * phentsize;
    const type = buf.readUInt32LE(p);
    const seg = { offset: Number(buf.readBigUInt64LE(p + 8)), vaddr: Number(buf.readBigUInt64LE(p + 16)), filesz: Number(buf.readBigUInt64LE(p + 32)) };
    if (type === PT_LOAD) loads.push(seg);
    else if (type === PT_DYNAMIC) dynamic = seg;
  }
  if (!dynamic) return out;
  const off = addr => {
    const l = loads.find(s => addr >= s.vaddr && addr < s.vaddr + s.filesz);
    if (!l) throw bad('an address no segment maps');
    return l.offset + (addr - l.vaddr);
  };
  if (dynamic.offset + dynamic.filesz > buf.length) throw bad('a dynamic section that runs past the end');
  const tags = [];
  for (let p = dynamic.offset; p + 16 <= dynamic.offset + dynamic.filesz; p += 16) {
    const tag = Number(buf.readBigUInt64LE(p));
    if (tag === DT.NULL) break;
    tags.push([tag, Number(buf.readBigUInt64LE(p + 8))]);
  }
  const one = t => tags.find(([k]) => k === t)?.[1];
  const strtab = one(DT.STRTAB) === undefined ? null : off(one(DT.STRTAB));
  if (strtab === null) {
    if (tags.some(([k]) => k === DT.NEEDED)) throw bad('needed names with no string table');
    return out;
  }
  for (const [k, v] of tags) if (k === DT.NEEDED) out.needed.push(cstr(buf, strtab + v));
  const vn = one(DT.VERNEED);
  const vnum = one(DT.VERNEEDNUM) ?? 0;
  if (vn !== undefined) {
    let p = off(vn);
    for (let i = 0; i < vnum; i++) {
      if (p + 16 > buf.length) throw bad('a version need that runs past the end');
      const file = cstr(buf, strtab + buf.readUInt32LE(p + 4));
      const cnt = buf.readUInt16LE(p + 2);
      let a = p + buf.readUInt32LE(p + 8);
      const list = out.versions.get(file) ?? [];
      for (let j = 0; j < cnt; j++) {
        if (a + 16 > buf.length) throw bad('a version need that runs past the end');
        list.push(cstr(buf, strtab + buf.readUInt32LE(a + 8)));
        a += buf.readUInt32LE(a + 12);
      }
      out.versions.set(file, list);
      const next = buf.readUInt32LE(p + 12);
      if (next === 0) break;
      p += next;
    }
  }
  return out;
}

/** The import names, machine and shape of one PE file, as { machine, pe32plus, imports: [], chpe }. */
export function readPe(buf) {
  if (buf.length < 0x40 || !looksPe(buf)) throw bad('not a PE');
  const lfa = buf.readUInt32LE(0x3c);
  if (lfa + 24 > buf.length || buf.readUInt32LE(lfa) !== 0x00004550) throw bad('not a PE');
  const machine = buf.readUInt16LE(lfa + 4);
  const nsec = buf.readUInt16LE(lfa + 6);
  const optSize = buf.readUInt16LE(lfa + 20);
  const opt = lfa + 24;
  const out = { machine: PE_MACHINE.get(machine) ?? `machine 0x${machine.toString(16)}`, pe32plus: false, imports: [], chpe: false };
  if (opt + optSize > buf.length || optSize < 2) throw bad('an optional header that runs past the end');
  out.pe32plus = buf.readUInt16LE(opt) === 0x20b;
  if (!out.pe32plus) return out;
  const secs = [];
  for (let i = 0; i < nsec; i++) {
    const s = opt + optSize + i * 40;
    if (s + 40 > buf.length) throw bad('a section table that runs past the end');
    secs.push({ vsize: buf.readUInt32LE(s + 8), rva: buf.readUInt32LE(s + 12), rawsize: buf.readUInt32LE(s + 16), raw: buf.readUInt32LE(s + 20) });
  }
  const off = rva => {
    const s = secs.find(x => rva >= x.rva && rva < x.rva + Math.max(x.vsize, x.rawsize));
    if (!s) throw bad('an address no section maps');
    return s.raw + (rva - s.rva);
  };
  const ndirs = optSize >= 112 ? buf.readUInt32LE(opt + 108) : 0;
  const dir = i => (i < ndirs && opt + 112 + i * 8 + 8 <= opt + optSize ? { rva: buf.readUInt32LE(opt + 112 + i * 8), size: buf.readUInt32LE(opt + 112 + i * 8 + 4) } : { rva: 0, size: 0 });
  const imp = dir(1);
  if (imp.rva) {
    for (let p = off(imp.rva); ; p += 20) {
      if (p + 20 > buf.length) throw bad('an import table that runs past the end');
      const name = buf.readUInt32LE(p + 12);
      if (name === 0) break;
      out.imports.push(cstr(buf, off(name)));
    }
  }
  const del = dir(13);
  if (del.rva) {
    for (let p = off(del.rva); ; p += 32) {
      if (p + 32 > buf.length) throw bad('a delay-load table that runs past the end');
      const name = buf.readUInt32LE(p + 4);
      if (name === 0) break;
      out.imports.push(cstr(buf, off(name)));
    }
  }
  const lc = dir(10);
  if (lc.rva) {
    const p = off(lc.rva);
    if (p + 4 <= buf.length && buf.readUInt32LE(p) >= 208 && p + 208 <= buf.length) out.chpe = buf.readBigUInt64LE(p + 200) !== 0n;
  }
  return out;
}

/** The major and minor of `GLIBC_2.34` (or `GLIBC_2.2.5`) as integers, or null for GLIBC_PRIVATE and the like. */
const glibcOf = v => {
  const m = /^GLIBC_(\d+)\.(\d+)(?:\.\d+)*$/.exec(v);
  return m ? [Number(m[1]), Number(m[2])] : null;
};

/**
 * The flags for a set of kept files, all in one folder: `files` maps each name
 * the runtime folder will hold (a copy under a link's name included) to its
 * bytes. `row` is { os: 'linux' | 'win32', arch: 'x64' | 'arm64', vulkan }.
 * Returns { flags, glibc, outside }: each flag a plain sentence (an empty list
 * means the set passes), glibc the highest GLIBC_ need as 'major.minor' (null on
 * a Windows row or with none), and outside a Map from each allowed outside name
 * the files need to the sorted version needs they hold.
 */
export function binaryFlags(files, row) {
  const flags = [];
  const win = row.os === 'win32';
  const allowed = [...(win ? WIN_ALLOWED : LINUX_ALLOWED), ...(row.vulkan ? (win ? WIN_VULKAN : LINUX_VULKAN) : [])];
  const fold = n => (win ? n.toLowerCase() : n);
  const kept = new Set([...files.keys()].map(fold));
  const outside = new Map();
  let glibc = null;
  const need = (file, lib) => {
    if (kept.has(fold(lib))) return;
    if (!allowed.some(re => re.test(fold(lib))) && !(win && WIN_ONLY_IN.get(fold(lib)) === fold(file))) {
      const flag = `${file}: ${win ? 'imports' : 'needs'} ${lib}, outside the allowed names`;
      if (!flags.includes(flag)) flags.push(flag);
      return;
    }
    if (!outside.has(fold(lib))) outside.set(fold(lib), new Set());
  };
  for (const [name, buf] of files) {
    try {
      if (win ? looksPe(buf) : looksElf(buf)) {
        if (win) {
          const pe = readPe(buf);
          if (!pe.pe32plus) {
            flags.push(`${name}: not a PE32+ image`);
            continue;
          }
          if (pe.machine === 'ARM64EC') flags.push(`${name}: an ARM64EC image`);
          else if (pe.machine !== ROW_PE[row.arch]) flags.push(`${name}: machine ${pe.machine}, the row wants ${ROW_PE[row.arch]}`);
          else if (pe.chpe) flags.push(`${name}: an ARM64X image`);
          for (const lib of pe.imports) need(name, lib);
        } else {
          const elf = readElf(buf);
          if (elf.machine !== ROW_EM[row.arch]) flags.push(`${name}: machine ${elf.machine}, the row wants ${ROW_EM[row.arch]}`);
          for (const lib of elf.needed) need(name, lib);
          for (const [lib, vs] of elf.versions) {
            need(name, lib);
            if (outside.has(fold(lib))) for (const v of vs) outside.get(fold(lib)).add(v);
            for (const v of vs) {
              const g = glibcOf(v);
              if (g && (glibc === null || g[0] > glibc[0] || (g[0] === glibc[0] && g[1] > glibc[1]))) glibc = g;
            }
          }
        }
      }
    } catch (e) {
      flags.push(`${name}: ${e.message}`);
    }
  }
  return { flags, glibc: glibc ? `${glibc[0]}.${glibc[1]}` : null, outside: new Map([...outside].map(([k, v]) => [k, [...v].sort()])) };
}
