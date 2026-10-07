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


// security-reviewer F2 on #99's swap: two lenses restate a gated list in their own text, outside the
// one shared block. Each restatement must hold every item of its canonical clause, so a risk floor that
// gains an item fails here until the lens's copy gains it too.
const CLAUSES = join(REPO, 'gate', 'clauses');

/** The items of a list written "a, b, c and d" or "a, b, c or d". */
export function listItems(text) {
  return text.split(/,\s*|\s+(?:and|or)\s+/).map(s => s.trim().toLowerCase()).filter(Boolean);
}

/** The items of `items` missing from `text`, compared case-folded with spaces collapsed. */
function missingFrom(text, items) {
  const flat = text.toLowerCase().replace(/\s+/g, ' ');
  return items.filter(i => !flat.includes(i));
}

const RISK_FLOOR = listItems(read(join(CLAUSES, 'risk-floor.md')).split(' are always thorough')[0]);
const SECURITY_ROUTE = listItems(read(join(CLAUSES, 'security-route.md')).split('Anything touching ')[1].split('\n')[0]);

test('the canonical lists parse into their items', () => {
  assert.deepEqual(RISK_FLOOR, ['auth', 'secrets', 'crypto', 'input validation', 'data migrations', 'anything published']);
  assert.deepEqual(SECURITY_ROUTE, ['auth', 'secrets', 'crypto', 'input validation']);
});

test("good-enough-lens's risk-floor list and unstated-lens's security-route list hold every canonical item", () => {
  assert.deepEqual(missingFrom(read(join(REPO, 'claude', 'agents', 'good-enough-lens.md')), RISK_FLOOR), []);
  assert.deepEqual(missingFrom(read(join(REPO, 'claude', 'agents', 'unstated-lens.md')), SECURITY_ROUTE), []);
});

test('bad case: a restated list that drops an item is caught', () => {
  const lens = read(join(REPO, 'claude', 'agents', 'good-enough-lens.md')).replaceAll('data migrations', 'migrations');
  assert.deepEqual(missingFrom(lens, RISK_FLOOR), ['data migrations']);
});
