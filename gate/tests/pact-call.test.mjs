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
});
