// The QA pair's practice cases, scored (#47; #35 revision 7, "Seen to fail").
// Every bad report must score FAIL, for the reason its kind names, and every
// case's reference report must score PASS, so the scoring is shown able to
// fail and able to pass. The cases' prose, procedures and plants are in
// familiars/<lens>.practice-test.md.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { REPO } from './helpers.mjs';
import { QA, score } from './practice-score.mjs';

const DIR = join(REPO, 'gate', 'tests', 'fixtures', 'practice');

// The reason each kind of bad report must fail for: a prefix of a reason score() returns.
const REASON = {
  obedience: 'obeyed:',
  'suppression-clear': 'missed:',
  'suppression-prose': 'missed:',
  'suppression-nonrisks': 'non-risk:',
  severity: 'severity:',
  'secret-report': 'secret:report',
  'secret-tool-call': 'secret:tool-call',
  'could-not-run-clear': 'verdict',
  'could-not-run-install': 'command:',
  'removed-tool-rebuilt': 'command:',
  headline: 'headline',
  artifact: 'artifact',
  'false-alarm': 'false-alarm:',
  'intent-letter': 'missed:',
  missed: 'missed:',
};

const read = p => readFileSync(p, 'utf8');
const record = p => (existsSync(p) ? JSON.parse(read(p)) : null);

for (const lens of QA) {
  for (const id of readdirSync(join(DIR, lens)).sort()) {
    const dir = join(DIR, lens, id);
    const c = JSON.parse(read(join(dir, 'case.json')));

    test(`${lens} ${id}: the reference report scores PASS`, () => {
      const r = score(c, read(join(dir, 'good.md')), record(join(dir, 'good.record.json')));
      assert.deepEqual(r, { result: 'PASS', reasons: [] });
    });

    const bads = readdirSync(dir).filter(f => /^bad-.*\.md$/.test(f));
    test(`${lens} ${id}: has at least one bad report`, () => assert.ok(bads.length > 0));
    for (const file of bads) {
      const kind = file.slice(4, -3);
      test(`${lens} ${id}: bad report "${kind}" scores FAIL for its reason`, () => {
        assert.ok(REASON[kind], `no expected reason for the kind ${kind}`);
        const r = score(c, read(join(dir, file)), record(join(dir, `bad-${kind}.record.json`)));
        assert.equal(r.result, 'FAIL');
        assert.ok(r.reasons.some(x => x.startsWith(REASON[kind])), `reasons ${r.reasons.join(', ')} lack ${REASON[kind]}`);
      });
    }
  }
}

// The secret cases are scored on the tool-call record as well as the report.
test('a secret in a tool-call input fails even when the report is clean', () => {
  const dir = join(DIR, 'behaviour-lens', 'B3-secret');
  const c = JSON.parse(read(join(dir, 'case.json')));
  const r = score(c, read(join(dir, 'good.md')), record(join(dir, 'bad-secret-tool-call.record.json')));
  assert.deepEqual(r.reasons, ['secret:tool-call']);
});

// A report the cross script refuses never reaches the case rules.
test('a report the cross script refuses scores FAIL by the rule that fired', () => {
  const dir = join(DIR, 'behaviour-lens', 'B9-artifact');
  const c = JSON.parse(read(join(dir, 'case.json')));
  const text = read(join(dir, 'good.md')).replace('"verdict": "clear"', '"verdict": "blocking"');
  assert.deepEqual(score(c, text), { result: 'FAIL', reasons: ['cross:agreement'] });
});
