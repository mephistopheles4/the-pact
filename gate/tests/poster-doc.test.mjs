// #280 C12: the poster's reference page names every surface, option, result
// and rule id the poster has, and shows each surface's documented command
// line, so a rule added to the poster can't go undocumented in silence.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { EXAMPLES, SURFACES } from '../../claude/tools/poster.mjs';
import { REPO } from './text.mjs';

const SOURCE = readFileSync(join(REPO, 'claude', 'tools', 'poster.mjs'), 'utf8');
const PAGE = readFileSync(join(REPO, 'docs', 'poster.md'), 'utf8');

/** The rule ids a poster source names: each quoted `group/name` string. */
export function ruleIds(source) {
  return [...new Set([...source.matchAll(/'([a-z]+\/[a-z0-9-]+)'/g)].map((m) => m[1]))];
}

/** Every name the page must hold in backticks, from the poster's own lists. */
export function requiredNames(source, surfaces) {
  const options = new Set(['repo', 'body', 'as', 'dry-run']);
  for (const s of Object.values(surfaces)) for (const o of s.options) options.add(o);
  const results = ['verified', 'mismatch', 'unverified', 'refused', 'failed', 'unavailable', 'dry-run'].map((w) => `RESULT: ${w}`);
  return [...Object.keys(surfaces), ...[...options].map((o) => `--${o}`), ...results, ...ruleIds(source)];
}

/**
 * The names a page leaves out of a code span, and the examples it doesn't
 * show whole. A name counts at the start of a span, closed or followed by a
 * space, as in `RESULT: failed` or `RESULT: verified <url>`.
 */
export function missingFromPage(page, names, examples) {
  return [
    ...names.filter((n) => !page.includes(`\`${n}\``) && !page.includes(`\`${n} `)),
    ...Object.values(examples).filter((e) => !page.includes(`poster.mjs ${e}`)),
  ];
}

test('docs/poster.md names every surface, option, result and rule id, and shows every example', () => {
  const ids = ruleIds(SOURCE);
  // A guard on the extraction itself: 39 rule ids today, so an empty or broken read can't pass.
  assert.ok(ids.length >= 39, `expected at least 39 rule ids in the poster, found ${ids.length}`);
  assert.deepEqual(missingFromPage(PAGE, requiredNames(SOURCE, SURFACES), EXAMPLES), []);
});

test('bad case: a rule id, option, result or example the page leaves out is reported', () => {
  const source = "refuse('usage/surface'); refuse('file/utf8'); refuse('new/rule');";
  const surfaces = { issue: { options: ['title-file'] } };
  const examples = { issue: 'issue --repo you/your-repo --body body.md' };
  const page = 'Surfaces: `issue`, with `--repo`, `--body`, `--as`, `--dry-run`. `RESULT: verified`. Rules: `usage/surface`, `file/utf8`.';
  assert.deepEqual(missingFromPage(page, requiredNames(source, surfaces), examples), [
    '--title-file',
    'RESULT: mismatch',
    'RESULT: unverified',
    'RESULT: refused',
    'RESULT: failed',
    'RESULT: unavailable',
    'RESULT: dry-run',
    'new/rule',
    'issue --repo you/your-repo --body body.md',
  ]);
});

test('control: a name only in plain text, not in backticks, does not count', () => {
  assert.deepEqual(missingFromPage('the rule usage/surface', ['usage/surface'], {}), ['usage/surface']);
});
