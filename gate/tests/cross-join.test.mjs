// The cross script's join, verdicts and pick (#44). Each test runs the
// script as the session will, on synthetic reports, and reads what the owner
// would see.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PROMPT, abovePrompt, block, cross, finding, qaPair, report } from './cross-helpers.mjs';

// ------------------------------------------------------------ a valid pair

test('a valid QA pair exits 0 and writes the comment and the page', t => {
  const r = cross(t, { reports: qaPair() });
  assert.equal(r.code, 0, r.stdout);
  assert.match(r.stdout, /^COMMENT comment-1\.md$/m);
  assert.match(r.stdout, /^PAGE page\.html$/m);
  assert.match(r.stdout, /^RESULT: pass$/m);
  assert.equal(r.comments.length, 1);
  assert.ok(r.page.startsWith('<!doctype html>'));
});

// ------------------------------------------------------------ the join

test('an exact anchor join finds the crossing, and an unmatched finding stays in its column', t => {
  const r = cross(t, { reports: qaPair() });
  const [above] = abovePrompt(r.comments);
  // The crossing card comes first and carries the mark; C3 is one lens only.
  const crossing = above.indexOf('- \u271a `C2`');
  const single = above.indexOf('- `C3`');
  assert.ok(crossing > 0, 'the crossing card');
  assert.ok(single > crossing, 'the single-lens card after it');
  assert.match(above, /^\| `C2` \| F1 \| F1 \| \u271a \|$/m);
  assert.match(above, /^\| `C3` \| \u2014 \| F2 \| {2}\|$/m);
  // Listed anchors with nothing on them still get their row.
  assert.match(above, /^\| `C1` \| \u2014 \| \u2014 \| {2}\|$/m);
});

test('nothing is dropped or capped: 100 findings per lens all show, once each, as cards and as fold rows', t => {
  const ids = Array.from({ length: 100 }, (_, i) => `C${i + 1}`);
  const many = lens => Array.from({ length: 100 }, (_, i) => finding(`F${i + 1}`, ids[i], 'medium', `${lens} finding number ${i + 1} on its own claim`));
  const r = cross(t, {
    reports: {
      'behaviour-lens': report(block('behaviour-lens', 'findings', many('behaviour'))),
      'integrity-lens': report(block('integrity-lens', 'findings', many('integrity'))),
    },
    anchors: ids.join(','),
  });
  assert.equal(r.code, 0, r.stdout);
  const above = abovePrompt(r.comments).join('');
  const below = r.all.slice(r.all.indexOf(PROMPT));
  for (const lens of ['behaviour', 'integrity']) {
    for (let i = 1; i <= 100; i += 1) {
      const h = `\` ${lens} finding number ${i} on its own claim \``;
      assert.equal(above.split(h).length - 1, 1, `one card line for ${h}`);
      assert.equal(below.split(h).length - 1, 1, `one fold row for ${h}`);
    }
  }
});

test('two different problems, one per lens question, at one anchor give a crossing', t => {
  const r = cross(t, {
    reports: {
      'behaviour-lens': report(block('behaviour-lens', 'findings', [finding('F1', 'C1', 'medium', 'Claim one fails on an empty list')])),
      'integrity-lens': report(block('integrity-lens', 'findings', [finding('F1', 'C1', 'medium', 'The claim one test asserts nothing')])),
    },
  });
  assert.equal(r.code, 0, r.stdout);
  assert.match(abovePrompt(r.comments)[0], /- \u271a `C1`/);
});

test('one problem placed on different anchors by the two lenses gives no crossing', t => {
  const r = cross(t, {
    reports: {
      'behaviour-lens': report(block('behaviour-lens', 'findings', [finding('F1', 'C1', 'medium', 'The retry helper is mocked')])),
      'integrity-lens': report(block('integrity-lens', 'findings', [finding('F1', 'C2', 'medium', 'The retry helper is mocked')])),
    },
  });
  assert.equal(r.code, 0, r.stdout);
  const [above] = abovePrompt(r.comments);
  assert.ok(!above.includes('\u271a `'), 'no crossing card');
  assert.ok(!/\u271a \|$/m.test(above), 'no crossing row');
});

test('on the spec pair, both calls at one anchor give a disagreement, not a crossing', t => {
  const r = cross(t, {
    reports: {
      'executability-lens': report(block('executability-lens', 'blocking', [finding('F1', 'S2', 'high', 'The first ticket stalls on the install step')])),
      'good-enough-lens': report(block('good-enough-lens', 'findings', [finding('F1', 'S2', 'low', 'The install step could come later')])),
    },
    point: 'spec',
    anchors: 'S1,S2,S3',
  });
  assert.equal(r.code, 0, r.stdout);
  const [above] = abovePrompt(r.comments);
  assert.match(above, /\*\*Disagreements: both lenses called this; you settle it\*\*/);
  assert.match(above, /^- `S2`$/m);
  assert.ok(!above.includes('\u271a'), 'no crossing mark anywhere above the prompt');
  assert.match(above, /"settle S2"/);
  // The two calls show side by side only in the fold.
  const below = r.all.slice(r.all.indexOf(PROMPT));
  assert.match(below, /^\| `S2` \| F1 `high` \| F1 `low` \|$/m);
  assert.ok(!above.includes('`high`') && !above.includes('`low`'));
});
