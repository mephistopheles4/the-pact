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

test('every ADR number is used once', () => {
  const nums = readdirSync(join(root, 'docs/adr')).filter((f) => /^\d{4}-/.test(f)).map((f) => f.slice(0, 4));
  assert.deepEqual(nums.filter((n, i) => nums.indexOf(n) !== i), []);
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