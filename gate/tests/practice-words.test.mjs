// The lesson of #81 (#99): every phrase a practice case scores word for word
// is written in its lens's own text in exact words, so a lens that follows
// its text can pass.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { REPO } from './helpers.mjs';
import { LENSES } from './practice-score.mjs';

const DIR = join(REPO, 'gate', 'tests', 'fixtures', 'practice');
const read = p => readFileSync(p, 'utf8');
test('every contains and headlineOn phrase, and the artifact heading, is written in its lens file in exact words', () => {
  for (const lens of LENSES) {
    const text = read(join(REPO, 'claude', 'agents', `${lens}.md`)).toLowerCase().replace(/\s+/g, ' ');
    for (const id of readdirSync(join(DIR, lens))) {
      const c = JSON.parse(read(join(DIR, lens, id, 'case.json')));
      for (const s of [...(c.contains ?? []), ...Object.values(c.headlineOn ?? {}), ...(c.heading ? [c.heading] : [])]) {
        assert.ok(text.includes(s.toLowerCase()), `${lens} ${id}: "${s}" is not in the lens file`);
      }
    }
  }
});

