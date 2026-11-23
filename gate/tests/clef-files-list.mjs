// Writes the `files` lists of the clef pin table (PACT-61 spec 0002, S5): run
// by hand once per pin, never by the test runner (its name does not end
// .test.mjs) and never installed. It fetches each pinned archive through the
// tool's own exported fetch (the same redirect rule and whole-file size and
// sha256 check) into a scratch folder, reads it with the tool's own readers,
// and prints, for each archive: the entry forms it uses, the entries it
// leaves out, the executable, and the rows to paste into the table. It also
// writes each archive's rows to rows-<key>.json in the scratch folder.
//
//   node gate/tests/clef-files-list.mjs <scratch-folder-outside-the-repo> [platform-key ...]
//
// The scratch folder must not lie inside this repo. Nothing from the archives
// is run. This is the only real download before T4. Importing this file does
// nothing: it runs only as the entry script.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SERVER, archiveUrl, fetchFile, makeTransport, readArchive } from '../../claude/tools/clef.mjs';
import { machoFlags } from './clef-macho.mjs';

const REPO = resolve(fileURLToPath(new URL('../..', import.meta.url)));

async function run(argv) {
  const [scratchArg, ...only] = argv;
  if (!scratchArg) {
    console.error('usage: node gate/tests/clef-files-list.mjs <scratch-folder-outside-the-repo> [platform-key ...]');
    return 2;
  }
  const scratch = resolve(scratchArg);
  const rel = relative(REPO, scratch);
  if (rel === '' || (!rel.startsWith('..') && !/^[a-zA-Z]:/.test(rel))) {
    console.error('the scratch folder must be outside the repo');
    return 2;
  }
  mkdirSync(scratch, { recursive: true });
  const keys = Object.keys(SERVER.archives).filter(k => only.length === 0 || only.includes(k));
  const transport = makeTransport();
  for (const key of keys) {
    const a = SERVER.archives[key];
    const out = join(scratch, a.asset);
    console.log(`\n== ${key}  ${a.asset}`);
    await fetchFile({ url: archiveUrl(SERVER, key).href, source: 'server', size: a.size, sha256: a.sha256, out, transport });
    const { entries, forms } = readArchive(a.kind, readFileSync(out), { maxBytes: 1 << 30 });
    console.log(`entry forms: ${forms.join(', ')}`);
    const files = entries.filter(e => e.kind === 'file');
    const exe = files.find(e => /(^|\/)llama-server(\.exe)?$/.test(e.path));
    if (!exe) {
      console.log('NO llama-server entry');
      continue;
    }
    const dir = exe.path.includes('/') ? exe.path.slice(0, exe.path.lastIndexOf('/') + 1) : '';
    const inDir = e => e.path.startsWith(dir) && !e.path.slice(dir.length).includes('/');
    const kept = entries.filter(e => e.kind === 'file' && (inDir(e) || /^(?:[^/]+\/)?LICENSE[^/]*$/.test(e.path)));
    const wanted = readArchive(a.kind, readFileSync(out), { maxBytes: 1 << 30, want: n => kept.some(k => k.path === n) }).entries.filter(e => e.data);
    console.log(`links (never kept): ${entries.filter(e => e.kind === 'link').map(e => e.path).join(' ') || 'none'}`);
    console.log(`left out: ${files.length - kept.length} regular file(s) outside the exe's folder; ${entries.filter(e => e.kind === 'dir').length} folder(s)`);
    console.log(`kept: ${wanted.length} file(s), ${wanted.reduce((s, e) => s + e.data.length, 0)} bytes`);
    // A soname the build holds as a link (libllama.so.0 -> libllama.so.0.9.0) is kept as a copy of its target's bytes: a row's fourth item.
    const copyOf = new Map();
    for (const l of entries.filter(e => e.kind === 'link' && inDir(e) && /\.so\.\d+$|\.\d+\.dylib$/.test(e.path) && e.target && !e.target.includes('/'))) copyOf.set(`${dir}${l.target}`, l.path.slice(dir.length));
    const rows = wanted.sort((x, y) => (x.path < y.path ? -1 : 1)).map(e => [e.path, e.data.length, createHash('sha256').update(e.data).digest('hex'), ...(copyOf.has(e.path) ? [copyOf.get(e.path)] : [])]);
    console.log(`copies kept under a soname: ${[...copyOf.values()].join(' ') || 'none'}`);
    if (a.kind === 'tgz' && key.startsWith('darwin-')) {
      // Spec 0003 M4: the load commands of each kept Mach-O file, and the flags; a flag is a stop-and-ask.
      for (const l of entries.filter(e => e.kind === 'link')) console.log(`link: ${l.path} -> ${l.target}`);
      const base = p => p.slice(dir.length);
      const named = new Map(wanted.filter(inDir).map(e => [base(e.path), e.data]));
      for (const [k, c] of copyOf) named.set(c, named.get(base(k)));
      const { flags, read } = machoFlags(named);
      for (const [n, m] of read) console.log(`macho: ${n} id=${m.id ?? '-'} minos=${m.minos ?? '-'} rpaths=${m.rpaths.join(',') || '-'} loads=${m.loads.map(l => l.name).join(' ') || '-'}`);
      console.log(flags.length ? flags.map(f => `FLAG: ${f}`).join('\n') : 'flags: none');
    }
    console.log(`exe: '${exe.path}',`);
    console.log('files: Object.freeze([');
    for (const r of rows) console.log(`  ${JSON.stringify(r).replaceAll('"', "'").replaceAll(',', ', ')},`);
    console.log(']),');
    writeFileSync(join(scratch, `rows-${key}.json`), JSON.stringify({ exe: exe.path, rows }));
    rmSync(out, { force: true });
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await run(process.argv.slice(2));
