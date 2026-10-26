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
    C1: ['A follow-up on a diff or a result is scoped, for every lens.', 'every lens. It is still dispatched fresh and alone. It is handed the base by its short hash', 'It accounts for every `E` row, as any follow-up does.', 'It is never handed the whole diff from the base, nor the rest of the change.', 'the list of files the whole change touches, names only', 'The lens reads the head side from the working folder', "the base side is handed as that file's diff from the base", "The scope bounds every step of the lens's own prompt.", 'each claim an `E` row names', 'It checks its scope:', 'A gap makes its verdict inconclusive.'],
    C2: ['reads the whole spec, as a first round does', 'A scoped report never releases a push.', 'whose read releases the push is a full read: it reads the whole change as a first round does, is still handed its `E` rows, and carries each `open` row as a restart does.', 'check that the report you cite is not marked scoped', 'the lens runs a restart instead, which carries each `open` row, and the base line says why'],
    C3: ['its first item is exactly "scoped follow-up: the rest of the change was not read", followed by the count of changed files outside its scope', "so it doesn't make the verdict inconclusive", 'ran a first round, a follow-up, a scoped follow-up', 'Mark "scoped" beside the verdict'],
    C4: ['enters the scope only for a lens that is handed its place line', 'For a lens that can reach the web, the scope holds no file for that row.', 'A file the revision diff touches is in the scope as any touched file, even when a withheld row sits in it; nothing more is written for the row.', "Nothing is written for a withheld row's file.", "never a withheld row's file for a lens that can reach the web", "A follow-up's or a closing read's report that was handed it as an `E` row", 'It never marks a withheld row `absent`.', "a diff or a copy, sits with the round's inputs and is deleted when the round closes", "A kept-local report's spec-drift items stay out of it"],
    C5: ['is a closing read, for every lens that ran at Test', 'after earlier rounds, it is still handed its `E` rows', 'Hand it the base, the approved spec or ticket, and the head, and it compares them.', 'The approved spec is the revision I approved, else the revision the last Design base line names', 'it compares the base, the request and the head', 'on a closing read only: by the lens\'s own question, where the head departs from the approved spec, and where the approved spec departs from the request and the base. This holds over a lens\'s own stay-out for this section.', 'The base line names the head it read.', 'a later commit needs a new closing read', 'A first Test round on the final head, run with the three states and Spec drift, is the closing read.'],
  };
  for (const [claim, list] of Object.entries(scoped)) for (const words of list) assert.ok(text.includes(words), `${claim}: ${words}`);
  for (const file of ['AGENTS.md', 'docs/agents/gate-tests.md']) {
    assert.ok(readFileSync(join(REPO, file), 'utf8').replace(/\s+/g, ' ').includes('a full read, never a scoped follow-up'), `C2: ${file}`);
  }
});

// #421 C1–C6: severities have meanings, a skip list, evidence to block, a home for repo review rules, and a low finding never earns another round.
test('the review file defines severities, a skip list, evidence to block, repo review rules and noting a low', () => {
  const text = readFileSync(join(REPO, 'claude', 'review.md'), 'utf8').replace(/\s+/g, ' ');
  const claims = {
    C1: ['**What each severity means.** Hand this with the template.', "Each lens's own scale applies these meanings to its question; a lens brought from elsewhere uses them as given.", "`high`: the work can't be accepted as it stands.", 'A high finding names where it sits (a section or claim from the list it was handed, or a file and line or symbol) and evidence that the place is wrong as the request, the spec or the base reads.', '`medium`: should be fixed in this change, or brought to me; never blocks.', '`low`: can wait, as a note or a follow-up issue; never the reason for another round.', 'each with where it sits (a section or claim from the list it was handed, or a file and line or symbol), how serious it is (high, medium or low, as What each severity means says)'],
    C2: ['blocking when a finding is high, `new` or `updated`, and names its place and evidence; or high and a security finding by the lens\'s own class (the security pair) or marked `security?` (any other lens), whether `new`, `updated` or `unchanged`.', 'A high finding that isn\'t a security or `security?` finding and lacks its place or evidence never makes the verdict blocking on its own; the lens says which is missing.', 'Lower a lens\'s verdict to findings when it is blocking only on highs that lack their place or evidence and none is a security or `security?` finding; mark the lowering beside it, naming what is missing. The lowering is never `auto`.', '**A high `new` or `updated` finding without its place or evidence** comes to me with what is missing', 'Its row is `open`, never `auto` and never `noted`.', 'A review in flight when this rule is installed applies it from its next round.'],
    C3: ['**What a lens skips.**', 'A lens reports no finding on content that only regenerates or only re-locks', 'a file the repo marks as generated, by a "generated by" header naming its generator or by its Review rules naming the path with its generator, when the generator\'s source changes in the same diff', 'a lockfile change that follows a manifest change in the same diff', 'Skipping is reporting nothing, not leaving unread', "a lens that can't tell whether a file is marked generated reads it as any other", 'Never skipped: a lockfile change with no manifest change, and any path the project\'s agent instructions say to read closely, under any heading.', 'The security pair skips nothing.'],
    C4: ['**Repo review rules.**', 'Hand every lens, with those rows, the "Review rules" section of the project\'s agent instructions (`AGENTS.md`, else `CLAUDE.md`), read at the base as the threat model is, or say there is none', "Hand a change's own edit to that section apart, as an input; it takes effect for the next change.", 'These rules can take items off the skip list, add paths to it only as generated files named with their generator, and add to what a lens checks.', 'They never lift what this file says the security pair does, the security bar, the never-skipped close-read paths above, or the read before posting.'],
    C5: ['`noted`, for an `unchanged` finding, or a low `new` or `updated` one, kept as a note, which never blocks.', 'only an `unchanged` or a low finding is `noted`', '**Sorting a low finding.** A low `new` or `updated` finding that isn\'t a security or `security?` finding is `noted (auto)`', 'A low finding never calls for a follow-up round on its own.', 'so it is noted unless I ask for the fix', 'A low security or `security?` finding is never `noted (auto)`: it comes to me as any security or `security?` row does.'],
  };
  const missing = Object.entries(claims).flatMap(([claim, list]) => list.filter(words => !text.includes(words)).map(words => `${claim}: ${words}`));
  assert.deepEqual(missing, []);
  assert.ok(!text.includes('only an `unchanged` finding is `noted`'), 'C5: the old Notes rule is gone');
  assert.ok(!text.includes('blocking when a finding is high and `new` or `updated`'), 'C2: the old Verdict clause is gone');
  const behaviour = readFileSync(join(REPO, 'claude', 'agents', 'behaviour-lens.md'), 'utf8').replace(/\s+/g, ' ');
  for (const words of ['**How serious (severity):**', '`high`: a claim fails reproducibly', '`medium`: a reproducible problem relevant to a claim', '`low`: an advisory, or a risk you could not reproduce']) assert.ok(behaviour.includes(words), `C6: ${words}`);
  for (const [file, body] of installedTexts()) assert.ok(!/most serious:/.test(body), `C6: ${file} keeps the old scale`);
});
