// How the pact points a session at its review procedure (#261), and that no
// installed file still tells a session to run the cross script (#264: the
// script is gone, and the review file's template replaces it).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { REPO } from './text.mjs';

const SCRIPT = /cross\.mjs|cross script/i;

/** Every file the install puts in the Claude home folder as text: claude/ and the sealed familiars, not contracts or practice tests. */
function installedTexts() {
  const out = new Map();
  const walk = (dir, rel) => {
    for (const e of readdirSync(join(REPO, dir), { withFileTypes: true })) {
      const next = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(`${dir}/${e.name}`, next);
      else if (rel !== 'familiars' || (e.name.endsWith('.md') && !e.name.endsWith('.contract.md') && !e.name.endsWith('.practice-test.md'))) out.set(next, readFileSync(join(REPO, dir, e.name), 'utf8'));
    }
  };
  walk('claude', 'claude');
  walk('familiars', 'familiars');
  return out;
}

// A session that skips the review file is told to read it.
// #261 C1
test('the rules file points to the review file and crosses the reports by its template', () => {
  const rules = readFileSync(join(REPO, 'claude', 'CLAUDE.md'), 'utf8').replace(/\s+/g, ' ');
  assert.ok(rules.includes("read the pact's review procedure, `~/.claude/pact/review.md`."), 'the review file pointer');
  assert.ok(rules.includes('Cross the reports by its template.'), 'the template sentence');
});

// #264 done-criterion: no installed file tells a session to run the cross script.
test('no installed file names the cross script', () => {
  const files = installedTexts();
  assert.ok(files.size > 10 && files.has('claude/review.md') && files.has('claude/CLAUDE.md'), `the listing holds ${files.size} files`);
  assert.deepEqual([...files].filter(([, text]) => SCRIPT.test(text)).map(([rel]) => rel), []);
});

// #264: the no-secret read stays a written rule, and a report's owner section holds no line numbers, codes or paths.
test('the review file holds the posting rules the script used to back', () => {
  const text = readFileSync(join(REPO, 'claude', 'review.md'), 'utf8').replace(/\s+/g, ' ');
  for (const words of ['**Read before you post.**', "A report's \"For the owner\" section holds no line numbers, codes or paths.", 'carries the info string `text`', 'Put every string you take from a report in a code span']) {
    assert.ok(text.includes(words), words);
  }
  // #389 C1–C5: a follow-up on a diff or a result reads only the revision, and the last read before the owner accepts the work is a full three-state closing read.
  const scoped = {
    C1: ['A follow-up on a diff or a result is scoped, for every lens.', 'It is still dispatched fresh and alone', "the base side is handed as that file's diff from the base", "The scope bounds every step of the lens's own prompt.", 'It checks its scope:', 'A gap makes its verdict inconclusive.'],
    C2: ['reads the whole spec, as a first round does', 'A scoped report never releases a push.', 'the lens runs a first round instead, and the base line says why'],
    C3: ['"scoped follow-up: the rest of the change was not read"', "so it doesn't make the verdict inconclusive", 'Mark "scoped" beside the verdict'],
    C4: ['For a lens that can reach the web, the scope holds no file for that row.', 'It never marks a withheld row `absent`.', "a diff or a copy, sits with the round's inputs and is deleted when the round closes", "A kept-local report's spec-drift items stay out of it"],
    C5: ['is a closing read, for every lens that ran at Test', 'The approved spec is the revision the last Design base line names', 'it compares the base, the request and the head', 'on a closing read only', 'a later commit needs a new closing read', 'A first Test round on the final head'],
  };
  for (const [claim, list] of Object.entries(scoped)) for (const words of list) assert.ok(text.includes(words), `${claim}: ${words}`);
  for (const file of ['AGENTS.md', 'docs/agents/gate-tests.md']) {
    assert.ok(readFileSync(join(REPO, file), 'utf8').replace(/\s+/g, ' ').includes('a full read, never a scoped follow-up'), `C2: ${file}`);
  }
});
