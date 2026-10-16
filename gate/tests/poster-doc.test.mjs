// #280 C12: the poster's reference page names every surface, option, result
// and rule id the poster has, and shows each surface's documented command
// line; its rule-id table and its exit-code table match the poster's exactly,
// so a rule or result added to the poster can't go undocumented in silence.
// Every list is read from the poster's exports or its source text.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { EXAMPLES, SURFACES } from '../../claude/tools/poster.mjs';
import { REPO } from './text.mjs';

const SOURCE = readFileSync(join(REPO, 'claude', 'tools', 'poster.mjs'), 'utf8');
const PAGE = readFileSync(join(REPO, 'docs', 'poster.md'), 'utf8');

/** The rule ids a poster source names: each quoted `group/name` string, in any quote. */
export function ruleIds(source) {
  return [...new Set([...source.matchAll(/(['"`])([a-z]+\/[a-z0-9-]+)\1/g)].map((m) => m[2]))];
}

/** The options every surface takes: the source's COMMON list. */
export function commonOptions(source) {
  const m = source.match(/const COMMON = Object\.freeze\(\[([^\]]*)\]\)/);
  return m ? [...m[1].matchAll(/'([a-z-]+)'/g)].map((x) => x[1]) : [];
}

/** Each exit code and result word, as `<code> <word>`, from the source's header comment. */
export function sourceExits(source) {
  return [...new Set([...source.matchAll(/^\/\/ +([0-9]) +RESULT: ([a-z-]+)/gm)].map((m) => `${m[1]} ${m[2]}`))].sort();
}

/** Each exit code and result word, as `<code> <word>`, from the page's exit table rows. */
export function pageExits(page) {
  return [...new Set([...page.matchAll(/^\| ([0-9]) \| `RESULT: ([a-z-]+)/gm)].map((m) => `${m[1]} ${m[2]}`))].sort();
}

/** The ids in the first cell of each row under the page's "Rule ids" heading. */
export function ruleTableIds(page) {
  const head = page.match(/^## Rule ids$/m);
  if (!head) return [];
  const rest = page.slice(head.index + head[0].length);
  const next = rest.search(/^## /m);
  const section = next < 0 ? rest : rest.slice(0, next);
  return [...section.matchAll(/^\| `([a-z]+\/[a-z0-9-]+)` \|/gm)].map((m) => m[1]);
}

/** Every name the page must hold in a code span, from the poster's own lists. */
export function requiredNames(source, surfaces) {
  const options = new Set(commonOptions(source));
  for (const s of Object.values(surfaces)) for (const o of s.options) options.add(o);
  const results = sourceExits(source).map((e) => `RESULT: ${e.split(' ')[1]}`);
  return [...Object.keys(surfaces), ...[...options].map((o) => `--${o}`), ...new Set(results), ...ruleIds(source)];
}

/**
 * The names a page leaves out of a code span, and the examples it doesn't
 * show whole after `poster.mjs`. A name counts at the start of a span, closed
 * or followed by a space, as in `RESULT: failed` or `RESULT: verified <url>`.
 */
export function missingFromPage(page, names, examples) {
  return [
    ...names.filter((n) => !page.includes(`\`${n}\``) && !page.includes(`\`${n} `)),
    ...Object.values(examples).filter((e) => !page.includes(`poster.mjs ${e}`)),
  ];
}

test('docs/poster.md names every surface, option, result and rule id, and shows every example', () => {
  const ids = ruleIds(SOURCE);
  // Guards on the reads themselves, so an empty or broken read can't pass: 39 rule ids, 4 common options and 7 results today.
  assert.ok(ids.length >= 39, `expected at least 39 rule ids in the poster, found ${ids.length}`);
  assert.ok(commonOptions(SOURCE).length >= 4, 'expected the poster COMMON list');
  assert.ok(sourceExits(SOURCE).length >= 7, 'expected the exit codes in the poster header');
  assert.deepEqual(missingFromPage(PAGE, requiredNames(SOURCE, SURFACES), EXAMPLES), []);
});

test("docs/poster.md's rule-id table and exit-code table match the poster's exactly", () => {
  assert.deepEqual([...ruleTableIds(PAGE)].sort(), [...ruleIds(SOURCE)].sort());
  assert.deepEqual(pageExits(PAGE), sourceExits(SOURCE));
});

test('bad case: a rule id, option, result or example the page leaves out is reported', () => {
  const source = "const COMMON = Object.freeze(['repo', 'as']);\n//   0  RESULT: verified\n//   3  RESULT: failed\nrefuse('usage/surface'); refuse(\"file/utf8\"); refuse(`new/rule`);";
  const surfaces = { issue: { options: ['title-file'] } };
  const examples = { issue: 'issue --repo you/your-repo --body body.md' };
  const page = 'Surfaces: `issue`, with `--repo`. `RESULT: verified <url>`. Rules: `usage/surface`, `file/utf8`. Bare: issue --repo you/your-repo --body body.md';
  assert.deepEqual(missingFromPage(page, requiredNames(source, surfaces), examples), [
    '--as',
    '--title-file',
    'RESULT: failed',
    'new/rule',
    'issue --repo you/your-repo --body body.md',
  ]);
});

test('bad case: a rule-id row missing or extra, or an exit code swapped, shows as a difference', () => {
  const source = "//   0  RESULT: verified\n//   3  RESULT: failed\n//   4  RESULT: unavailable\nrefuse('usage/surface'); refuse('file/utf8');";
  const page = '## Rule ids\n\n| `usage/surface` | x |\n| `old/rule` | x |\n\n## Next\n\n| 0 | `RESULT: verified <url>` |\n| 4 | `RESULT: failed` |\n| 3 | `RESULT: unavailable` |\n';
  assert.deepEqual(ruleTableIds(page), ['usage/surface', 'old/rule']);
  assert.notDeepEqual([...ruleTableIds(page)].sort(), [...ruleIds(source)].sort());
  assert.deepEqual(pageExits(page), ['0 verified', '3 unavailable', '4 failed']);
  assert.notDeepEqual(pageExits(page), sourceExits(source));
});

test('control: a name only in plain text, not in backticks, does not count', () => {
  assert.deepEqual(missingFromPage('the rule usage/surface', ['usage/surface'], {}), ['usage/surface']);
});
