// Spec 0003 M4 (C-M3): the pin-time Mach-O check flags each load the pin's hashes would not cover.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { machoFlags } from './clef-macho.mjs';

const LC = { load: 0xc, rpath: 0x8000001c, build: 0x32 };
/** A thin arm64 Mach-O holding the given load commands: [cmd, string] for a dylib or rpath, ['build', minos]. */
function macho(cmds, { magic = 0xfeedfacf, cpu = 0x0100000c } = {}) {
  const parts = cmds.map(([cmd, v]) => {
    if (cmd === 'build') {
      const b = Buffer.alloc(24);
      b.writeUInt32LE(LC.build, 0);
      b.writeUInt32LE(24, 4);
      b.writeUInt32LE(v, 12);
      return b;
    }
    const at = cmd === 'rpath' ? 12 : 24;
    const size = Math.ceil((at + Buffer.byteLength(v) + 1) / 8) * 8;
    const b = Buffer.alloc(size);
    b.writeUInt32LE(LC[cmd], 0);
    b.writeUInt32LE(size, 4);
    b.writeUInt32LE(at, 8);
    b.write(v, at, 'utf8');
    return b;
  });
  const head = Buffer.alloc(32);
  head.writeUInt32LE(magic, 0);
  head.writeUInt32LE(cpu, 4);
  head.writeUInt32LE(parts.length, 16);
  return Buffer.concat([head, ...parts]);
}
const good = () => new Map([
  ['llama-server', macho([['rpath', '@loader_path'], ['load', '@rpath/libggml.0.dylib'], ['load', '/usr/lib/libSystem.B.dylib'], ['load', '/System/Library/Frameworks/Metal.framework/Versions/A/Metal'], ['build', 0x0d0300]])],
  ['libggml.0.dylib', macho([['rpath', '@loader_path'], ['load', '/usr/lib/libc++.1.dylib']])],
  ['LICENSE', Buffer.from('MIT')],
]);

test('Mach-O check: the kept set as the macOS pin holds it passes, and the server\'s minos is read', () => {
  const { flags, read } = machoFlags(good());
  assert.deepEqual(flags, []);
  assert.equal(read.get('llama-server').minos, '13.3.0');
});

for (const [label, plant, says] of [
  ['loads a dylib from /usr/local/lib', m => m.set('llama-server', macho([['load', '/usr/local/lib/x.dylib']])), /LC_LOAD_DYLIB outside the allowed paths: \/usr\/local\/lib\/x\.dylib/],
  ['loads an @rpath name no kept file holds', m => m.delete('libggml.0.dylib'), /@rpath\/libggml\.0\.dylib does not resolve to a kept file/],
  ['holds an rpath outside the kept folder', m => m.set('libggml.0.dylib', macho([['rpath', '/opt/homebrew/lib']])), /an rpath that leaves the kept folder: \/opt\/homebrew\/lib/],
  ['holds an @loader_path rpath that climbs out', m => m.set('libggml.0.dylib', macho([['rpath', '@loader_path/../x']])), /an rpath that leaves the kept folder: @loader_path\/\.\.\/x/],
  ['keeps a fat file', m => m.set('libggml.0.dylib', Buffer.from([0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 2])), /libggml\.0\.dylib: not a thin 64-bit Mach-O/],
  ['keeps an x86_64 file', m => m.set('libggml.0.dylib', macho([], { cpu: 0x01000007 })), /libggml\.0\.dylib: not arm64/],
]) {
  test(`bad case: the Mach-O check flags a kept set that ${label}`, () => {
    const m = good();
    plant(m);
    const { flags } = machoFlags(m);
    assert.ok(flags.some(f => says.test(f)), flags.join('\n'));
  });
}

// #PACT-91 C-U4 (spec 0005 U5): the check takes the thin arch from the row.
const X86 = 0x01000007;
const x86set = () => new Map([
  ['llama-server', macho([['rpath', '@loader_path'], ['load', '@rpath/libggml.0.dylib'], ['load', '/usr/lib/libSystem.B.dylib']], { cpu: X86 })],
  ['libggml.0.dylib', macho([['rpath', '@loader_path'], ['load', '/usr/lib/libc++.1.dylib']], { cpu: X86 })],
]);
test('Mach-O check: an x86_64 set passes as x86_64', () => {
  assert.deepEqual(machoFlags(x86set(), { arch: 'x86_64' }).flags, []);
});
for (const [label, set, arch, says] of [
  ['an x86_64 file checked as arm64', x86set(), 'arm64', /llama-server: not arm64/],
  ['an arm64 file checked as x86_64', good(), 'x86_64', /llama-server: not x86_64/],
  ['a fat file checked as x86_64', new Map([['libggml.0.dylib', Buffer.from([0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 2])]]), 'x86_64', /libggml\.0\.dylib: not a thin 64-bit Mach-O/],
]) {
  test(`bad case: the Mach-O check flags ${label}`, () => {
    const { flags } = machoFlags(set, { arch });
    assert.ok(flags.some(f => says.test(f)), flags.join('\n'));
  });
}
