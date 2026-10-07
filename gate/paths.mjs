// Canonical path relations (#53), shared by the review output (gate/review.mjs)
// and the project install (gate/project.mjs), so both compare folders the same
// way: real paths (links, junctions and short names resolved by the system),
// case-folded on Windows and macOS, matched on whole segments, never as a
// string prefix. Nothing here runs on import. Node 20 or later, ESM.

import { realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';

const FOLD_CASE = process.platform === 'win32' || process.platform === 'darwin';

const fold = s => (FOLD_CASE ? s.toLowerCase() : s);
const segments = p => p.split(sep).filter(Boolean);

/** True when `inner`'s segments start with all of `outer`'s, compared whole (and case-folded where the system folds case). */
function within(inner, outer) {
  const a = segments(inner).map(fold);
  const b = segments(outer).map(fold);
  return b.length <= a.length && b.every((s, i) => s === a[i]);
}

/** A segment that names a .claude folder, however it is cased or padded with the dots and spaces Windows drops. */
const isClaudeSegment = s => s.replace(/[. ]+$/, '').toLowerCase() === '.claude';

/** The real path of a folder, or its plain absolute path when it does not exist yet. */
function realOrResolved(p) {
  try {
    return realpathSync.native(p);
  } catch {
    return resolve(p);
  }
}

export { FOLD_CASE, fold, segments, within, isClaudeSegment, realOrResolved };
