// #PACT-91 C-U4 (spec 0005 U5): the pin-time ELF and PE report flags each library outside the allowed list, each wrong machine and each hybrid image, and the shipped sets raise no flag.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { binaryFlags, readElf, readPe } from './clef-binary.mjs';

const EM = { x64: 62, arm64: 183 };

/**
 * A little-endian ELF64 shared object holding a dynamic section: `needed` are
 * the DT_NEEDED names, `verneeds` is [[file, [version, ...]], ...]. One PT_LOAD
 * maps the whole file at address 0, so an address is an offset.
 */
function elf({ machine = EM.x64, needed = [], verneeds = [] } = {}) {
  const strs = [''];
  const at = new Map([['', 0]]);
  let size = 1;
  const str = s => {
    if (!at.has(s)) {
      at.set(s, size);
      strs.push(s);
      size += Buffer.byteLength(s) + 1;
    }
    return at.get(s);
  };
  needed.forEach(str);
  verneeds.forEach(([f, vs]) => [f, ...vs].forEach(str));
  const strtab = Buffer.alloc(size);
  for (const [s, off] of at) strtab.write(s, off, 'utf8');
  const nAux = verneeds.reduce((n, [, vs]) => n + vs.length, 0);
  const verneed = Buffer.alloc(verneeds.length * 16 + nAux * 16);
  let p = 0;
  verneeds.forEach(([f, vs], i) => {
    verneed.writeUInt16LE(1, p);
    verneed.writeUInt16LE(vs.length, p + 2);
    verneed.writeUInt32LE(at.get(f), p + 4);
    verneed.writeUInt32LE(16, p + 8);
    verneed.writeUInt32LE(i === verneeds.length - 1 ? 0 : 16 + vs.length * 16, p + 12);
    p += 16;
    vs.forEach((v, j) => {
      verneed.writeUInt32LE(0, p);
      verneed.writeUInt16LE(0, p + 4);
      verneed.writeUInt16LE(2 + j, p + 6);
      verneed.writeUInt32LE(at.get(v), p + 8);
      verneed.writeUInt32LE(j === vs.length - 1 ? 0 : 16, p + 12);
      p += 16;
    });
  });
  const dyn = [...needed.map(n => [1, at.get(n)]), [5, 0], [0x6ffffffe, 0], [0x6fffffff, verneeds.length], [0, 0]];
  const hdr = 64 + 2 * 56;
  const strOff = hdr;
  const vnOff = strOff + strtab.length;
  const dynOff = vnOff + verneed.length;
  dyn.find(d => d[0] === 5)[1] = strOff;
  dyn.find(d => d[0] === 0x6ffffffe)[1] = vnOff;
  const dynbuf = Buffer.alloc(dyn.length * 16);
  dyn.forEach(([tag, val], i) => {
    dynbuf.writeBigUInt64LE(BigInt(tag), i * 16);
    dynbuf.writeBigUInt64LE(BigInt(val), i * 16 + 8);
  });
  const total = dynOff + dynbuf.length;
  const h = Buffer.alloc(hdr);
  h.write('\x7fELF', 0, 'latin1');
  h[4] = 2;
  h[5] = 1;
  h[6] = 1;
  h.writeUInt16LE(3, 16);
  h.writeUInt16LE(machine, 18);
  h.writeBigUInt64LE(64n, 32);
  h.writeUInt16LE(64, 52);
  h.writeUInt16LE(56, 54);
  h.writeUInt16LE(2, 56);
  h.writeUInt32LE(1, 64);
  h.writeBigUInt64LE(0n, 64 + 8);
  h.writeBigUInt64LE(BigInt(total), 64 + 32);
  h.writeBigUInt64LE(BigInt(total), 64 + 40);
  h.writeUInt32LE(2, 64 + 56);
  h.writeBigUInt64LE(BigInt(dynOff), 64 + 56 + 8);
  h.writeBigUInt64LE(BigInt(dynOff), 64 + 56 + 16);
  h.writeBigUInt64LE(BigInt(dynbuf.length), 64 + 56 + 32);
  h.writeBigUInt64LE(BigInt(dynbuf.length), 64 + 56 + 40);
  return Buffer.concat([h, strtab, verneed, dynbuf]);
}

/**
 * A PE32+ image with one section holding an import table (and, with `delay`, a
 * delay-load table, and with `chpe`, a load config naming CHPE metadata).
 * `machine` is the COFF machine field.
 */
function pe({ machine = 0x8664, imports = [], delay = [], magic = 0x20b, chpe = false } = {}) {
  const secRva = 0x1000;
  const names = Buffer.concat([...imports, ...delay].map(n => Buffer.from(`${n}\0`, 'latin1')));
  const nameRva = new Map();
  let o = 0;
  for (const n of [...imports, ...delay]) {
    nameRva.set(n, secRva + o);
    o += Buffer.byteLength(n) + 1;
  }
  const impAt = names.length + (names.length % 4 ? 4 - (names.length % 4) : 0);
  const imp = Buffer.alloc((imports.length + 1) * 20);
  imports.forEach((n, i) => imp.writeUInt32LE(nameRva.get(n), i * 20 + 12));
  const delayAt = impAt + imp.length;
  const del = Buffer.alloc((delay.length + 1) * 32);
  delay.forEach((n, i) => {
    del.writeUInt32LE(1, i * 32);
    del.writeUInt32LE(nameRva.get(n), i * 32 + 4);
  });
  const lcAt = delayAt + del.length;
  const lc = Buffer.alloc(208);
  lc.writeUInt32LE(208, 0);
  if (chpe) lc.writeBigUInt64LE(0x180002000n, 200);
  const body = Buffer.concat([names, Buffer.alloc(impAt - names.length), imp, del, lc]);
  const optSize = 112 + 16 * 8;
  const head = Buffer.alloc(0x80 + 4 + 20 + optSize + 40);
  head.write('MZ', 0, 'latin1');
  head.writeUInt32LE(0x80, 0x3c);
  head.write('PE\0\0', 0x80, 'latin1');
  head.writeUInt16LE(machine, 0x84);
  head.writeUInt16LE(1, 0x86);
  head.writeUInt16LE(optSize, 0x94);
  const opt = 0x98;
  head.writeUInt16LE(magic, opt);
  head.writeUInt32LE(16, opt + 108);
  const dir = (i, rva, size) => {
    head.writeUInt32LE(rva, opt + 112 + i * 8);
    head.writeUInt32LE(size, opt + 112 + i * 8 + 4);
  };
  if (imports.length) dir(1, secRva + impAt, imp.length);
  if (chpe) dir(10, secRva + lcAt, lc.length);
  if (delay.length) dir(13, secRva + delayAt, del.length);
  const sec = opt + optSize;
  head.write('.rdata', sec, 'latin1');
  head.writeUInt32LE(body.length, sec + 8);
  head.writeUInt32LE(secRva, sec + 12);
  head.writeUInt32LE(body.length, sec + 16);
  head.writeUInt32LE(head.length, sec + 20);
  return Buffer.concat([head, body]);
}

const LIN = { os: 'linux', arch: 'x64', vulkan: false };
const goodLinux = () => new Map([
  ['llama-server', elf({ needed: ['libllama.so.0', 'libstdc++.so.6', 'libm.so.6', 'libc.so.6'], verneeds: [['libc.so.6', ['GLIBC_2.2.5', 'GLIBC_2.34']], ['libstdc++.so.6', ['GLIBCXX_3.4.29', 'CXXABI_1.3.13']]] })],
  ['libllama.so.0', elf({ needed: ['libgomp.so.1', 'libgcc_s.so.1', 'libc.so.6', 'libssl.so.3', 'libcrypto.so.3'], verneeds: [['libc.so.6', ['GLIBC_2.35']], ['libgomp.so.1', ['GOMP_4.5']], ['libgcc_s.so.1', ['GCC_3.0']]] })],
  ['LICENSE', Buffer.from('MIT')],
]);
const WIN = { os: 'win32', arch: 'x64', vulkan: false };
const goodWin = () => new Map([
  ['llama-server.exe', pe({ imports: ['KERNEL32.dll', 'llama.dll', 'api-ms-win-crt-runtime-l1-1-0.dll'], delay: ['bcrypt.dll'] })],
  ['llama.dll', pe({ imports: ['ADVAPI32.dll', 'libomp.dll', 'MSVCP140.dll', 'VCRUNTIME140.dll', 'VCRUNTIME140_1.dll', 'CRYPT32.dll'] })],
  ['libomp.dll', pe({ imports: ['kernel32.dll', 'PSAPI.DLL'] })],
  ['llama-connect.exe', pe({ imports: ['KERNEL32.dll', 'bcryptprimitives.dll', 'iphlpapi.dll'] })],
  ['LICENSE', Buffer.from('MIT')],
]);

test('ELF and PE report: a good Linux set passes, with glibc the highest GLIBC_ need and each outside name\'s versions', () => {
  const { flags, glibc, outside } = binaryFlags(goodLinux(), LIN);
  assert.deepEqual(flags, []);
  assert.equal(glibc, '2.35');
  assert.deepEqual([...outside].sort(), [
    ['libc.so.6', ['GLIBC_2.2.5', 'GLIBC_2.34', 'GLIBC_2.35']],
    ['libcrypto.so.3', []],
    ['libgcc_s.so.1', ['GCC_3.0']],
    ['libgomp.so.1', ['GOMP_4.5']],
    ['libm.so.6', []],
    ['libssl.so.3', []],
    ['libstdc++.so.6', ['CXXABI_1.3.13', 'GLIBCXX_3.4.29']],
  ].sort());
});

test('ELF and PE report: glibc compares major then minor as integers (2.4 is below 2.35)', () => {
  const m = goodLinux();
  m.set('libllama.so.0', elf({ needed: ['libc.so.6'], verneeds: [['libc.so.6', ['GLIBC_2.4', 'GLIBC_2.35', 'GLIBC_2.9']]] }));
  assert.equal(binaryFlags(m, LIN).glibc, '2.35');
});

test('ELF and PE report: a good Windows set passes, and import names compare without case', () => {
  const { flags, outside } = binaryFlags(goodWin(), WIN);
  assert.deepEqual(flags, []);
  assert.deepEqual([...outside.keys()].filter(k => k === 'kernel32.dll' || k === 'KERNEL32.dll'), ['kernel32.dll'], 'one entry for the name, in lower case');
});

test('ELF and PE report: a library named in both the needed list and a version need is flagged once per file', () => {
  const m = goodLinux();
  m.set('libllama.so.0', elf({ needed: ['libfoo.so.1'], verneeds: [['libfoo.so.1', ['FOO_1.0']]] }));
  assert.equal(binaryFlags(m, LIN).flags.filter(f => /libfoo\.so\.1/.test(f)).length, 1);
});

test('ELF and PE report: an arm64 row takes arm64 machines, and a Vulkan row allows the loader', () => {
  const l = new Map([['llama-server', elf({ machine: EM.arm64, needed: ['libvulkan.so.1', 'libc.so.6'] })]]);
  assert.deepEqual(binaryFlags(l, { os: 'linux', arch: 'arm64', vulkan: true }).flags, []);
  const w = new Map([['llama-server.exe', pe({ machine: 0xaa64, imports: ['vulkan-1.dll', 'KERNEL32.dll'] })]]);
  assert.deepEqual(binaryFlags(w, { os: 'win32', arch: 'arm64', vulkan: true }).flags, []);
});

test('ELF and PE readers: a file that is not what its magic says is refused, not read past', () => {
  assert.throws(() => readElf(Buffer.from('\x7fELF')), /not a 64-bit little-endian ELF/);
  assert.throws(() => readPe(Buffer.from('MZ')), /not a PE/);
});

for (const [label, set, row, says] of [
  ['needs a library no kept file provides', m => m.set('libllama.so.0', elf({ needed: ['libfoo.so.1'] })), LIN, /libllama\.so\.0: needs libfoo\.so\.1, outside the allowed names/],
  ['needs libvulkan on a row that is not Vulkan', m => m.set('libllama.so.0', elf({ needed: ['libvulkan.so.1'] })), LIN, /needs libvulkan\.so\.1, outside the allowed names/],
  ['holds an ELF of the wrong machine', m => m.set('libllama.so.0', elf({ machine: EM.arm64 })), LIN, /libllama\.so\.0: machine EM_AARCH64, the row wants EM_X86_64/],
  ['holds a version need from a library outside the list', m => m.set('libllama.so.0', elf({ verneeds: [['libfoo.so.1', ['FOO_1.0']]] })), LIN, /libllama\.so\.0: needs libfoo\.so\.1, outside the allowed names/],
  ['holds a PE that imports MSVCP150.dll', m => m.set('llama.dll', pe({ imports: ['MSVCP150.dll'] })), WIN, /llama\.dll: imports MSVCP150\.dll, outside the allowed names/],
  ['holds a PE other than llama-connect.exe that imports iphlpapi.dll', m => m.set('llama.dll', pe({ imports: ['iphlpapi.dll'] })), WIN, /llama\.dll: imports iphlpapi\.dll, outside the allowed names/],
  ['holds a PE other than llama-connect.exe that imports bcryptprimitives.dll', m => m.set('llama.dll', pe({ imports: ['bcryptprimitives.dll'] })), WIN, /llama\.dll: imports bcryptprimitives\.dll, outside the allowed names/],
  ['holds an ELF that needs the older libssl.so.1.1 (decision 93 allows only the .so.3 names)', m => m.set('libllama.so.0', elf({ needed: ['libssl.so.1.1'] })), LIN, /libllama\.so\.0: needs libssl\.so\.1\.1, outside the allowed names/],
  ['holds a PE of the wrong machine', m => m.set('llama.dll', pe({ machine: 0xaa64 })), WIN, /llama\.dll: machine ARM64, the row wants AMD64/],
  ['holds an ARM64EC image', m => m.set('llama.dll', pe({ machine: 0xa641 })), { os: 'win32', arch: 'arm64', vulkan: false }, /llama\.dll: an ARM64EC image/],
  ['holds an ARM64X image', m => m.set('llama.dll', pe({ machine: 0xaa64, chpe: true })), { os: 'win32', arch: 'arm64', vulkan: false }, /llama\.dll: an ARM64X image/],
  ['holds a delay-load import outside the list', m => m.set('llama.dll', pe({ delay: ['dbghelp.dll'] })), WIN, /llama\.dll: imports dbghelp\.dll, outside the allowed names/],
  ['holds a 32-bit PE', m => m.set('llama.dll', pe({ magic: 0x10b })), WIN, /llama\.dll: not a PE32\+ image/],
]) {
  test(`bad case: the ELF and PE report flags a kept set that ${label}`, () => {
    const m = row.os === 'linux' ? goodLinux() : goodWin();
    set(m);
    const { flags } = binaryFlags(m, row);
    assert.ok(flags.some(f => says.test(f)), flags.join('\n'));
  });
}
