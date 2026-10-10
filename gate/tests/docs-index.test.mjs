// Keeps docs/adr/README.md and docs/log/README.md complete: every file in
// the folder is linked from its README, and every link points at a file.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function indexGaps(dir) {
  const files = readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "README.md");
  const readme = readFileSync(join(dir, "README.md"), "utf8");
  const linked = [...readme.matchAll(/\]\((?:\.\/)?([^)#\s]+\.md)(?:#[^)\s]*)?\)/g)].map((m) => m[1]);
  return {
    unlisted: files.filter((f) => !linked.includes(f)),
    missing: linked.filter((f) => !files.includes(f)),
  };
}

for (const folder of ["docs/adr", "docs/log"]) {
  test(`${folder}/README.md lists every file and only real files`, () => {
    assert.deepEqual(indexGaps(join(root, folder)), { unlisted: [], missing: [] });
  });
}

/** The files an index lists as an entry more than once: each entry line opens with its file's link. */
export function repeatedEntries(readme) {
  const entries = [...readme.matchAll(/^- \[[^\]]*\]\((?:\.\/)?([^)#\s]+\.md)/gm)].map((m) => m[1]);
  return entries.filter((f, i) => entries.indexOf(f) !== i);
}

// #211's move 4: a scripted insert left ADR 0049's line twice, and the gap
// check above passed, since it asks only that each file is linked.
for (const folder of ["docs/adr", "docs/log"]) {
  test(`${folder}/README.md lists each file as one entry`, () => {
    assert.deepEqual(repeatedEntries(readFileSync(join(root, folder, "README.md"), "utf8")), []);
  });
}

test('bad case: an index that lists one file twice is caught', () => {
  const line = '- [0049](0049-x.md) — **X.** Y.\n';
  assert.deepEqual(repeatedEntries(`# ADRs\n\n${line}- [0050](0050-y.md) — Z.\n${line}`), ['0049-x.md']);
  assert.deepEqual(repeatedEntries(`${line}- [0050](0050-y.md) — supersedes [0049](0049-x.md).\n`), []);
});

test('every ADR number is used once', () => {
  const nums = readdirSync(join(root, 'docs/adr')).filter((f) => /^\d{4}-/.test(f)).map((f) => f.slice(0, 4));
  assert.deepEqual(nums.filter((n, i) => nums.indexOf(n) !== i), []);
});

// The threat model is what a reader weighs before installing (#190), so the
// README and the install how-to both point at it.
test('the README and the install how-to link to the threat model, and it exists', () => {
  assert.ok(existsSync(join(root, 'docs', 'threat-model.md')), 'docs/threat-model.md is missing');
  for (const [file, target] of [['README.md', 'docs/threat-model.md'], [join('docs', 'install.md'), 'threat-model.md']]) {
    const links = [...readFileSync(join(root, file), 'utf8').matchAll(/\]\(([^)#\s]+)(?:#[^)\s]*)?\)/g)].map((m) => m[1]);
    assert.ok(links.includes(target), `${file} has no link to ${target}`);
  }
});

// The security policy sends readers to the threat model for scope, and the
// threat model's reporting section points back at the policy (#198).
test('SECURITY.md links to the threat model, and the threat model links back', () => {
  const linksIn = (file) => [...readFileSync(join(root, file), 'utf8').matchAll(/\]\(([^)#\s]+)(?:#[^)\s]*)?\)/g)].map((m) => m[1]);
  assert.ok(existsSync(join(root, 'SECURITY.md')), 'SECURITY.md is missing');
  assert.ok(linksIn('SECURITY.md').includes('docs/threat-model.md'), 'SECURITY.md has no link to docs/threat-model.md');
  assert.ok(linksIn(join('docs', 'threat-model.md')).includes('../SECURITY.md'), 'docs/threat-model.md has no link to ../SECURITY.md');
});

test('every relative link to an ADR or a log entry, inside the ADRs and log entries, points at a real file', () => {
  const broken = [];
  for (const folder of ['docs/adr', 'docs/log']) {
    for (const f of readdirSync(join(root, folder)).filter((x) => x.endsWith('.md'))) {
      const text = readFileSync(join(root, folder, f), 'utf8');
      for (const m of text.matchAll(/\]\(((?:\.\.\/(?:adr|log)\/)?\d{4}-[^)#\s]+\.md)(?:#[^)\s]*)?\)/g)) {
        if (!existsSync(join(root, folder, m[1]))) broken.push(`${folder}/${f} -> ${m[1]}`);
      }
    }
  }
  assert.deepEqual(broken, []);
});