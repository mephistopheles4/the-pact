// Keeps docs/adr/README.md and docs/log/README.md complete: every file in
// the folder is linked from its README, and every link points at a file.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
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
