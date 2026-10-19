// Test helpers for files a test names itself (#151): a temp folder per test,
// a tree written into it, and a file read as text. Nothing here reads the
// repo's payload, and importing this file touches nothing.
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * The temp folder by its full long name. A Windows temp folder can carry a
 * short 8.3 name with a ~ (GitHub's runner has one, #351), which the install
 * refuses in a Claude home, so every test home is made under the long name.
 */
export const longTmp = () => realpathSync.native(tmpdir());

export function tempDir(t, prefix = 'pact-test-') {
  const d = mkdtempSync(join(longTmp(), prefix));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
}

/** Write { 'rel/path': text } under root. */
export function writeTree(root, files) {
  for (const [rel, text] of Object.entries(files)) {
    const p = join(root, ...rel.split('/'));
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text);
  }
}

export function read(p) {
  return readFileSync(p, 'utf8');
}
