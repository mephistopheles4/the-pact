// The mutation battery (#44): each mutation breaks one rule of the cross
// script, and the tests named for that rule must then fail. It shows the
// cross tests can fail, which matters because much of the script was
// written before its tests.
//
// It never edits cross/cross.mjs. Each mutation is written to a copy in a
// temp folder, and the catching tests run against that copy through
// PACT_CROSS_UNDER_TEST (read by cross-helpers.mjs).
//
// Left out on purpose: the safety net in run() that refuses as `internal`
// when the section cannot be built. No valid input reaches it, so no test
// can catch its removal without fault injection.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { REPO } from './text.mjs';
import { tempDir } from './tree.mjs';

const run = promisify(execFile);
const SOURCE = readFileSync(join(REPO, 'cross', 'cross.mjs'), 'utf8');
const TESTS = ['cross-join', 'cross-checks', 'cross-views', 'cross-page', 'cross-parity'].map(n => join(REPO, 'gate', 'tests', `${n}.test.mjs`));

// [name, the source text it replaces, its replacement, a phrase in the name of a test that must catch it]
const MUTATIONS = [
  ['agreement: inconclusive with high allowed', 'inconclusive: !high,', 'inconclusive: true,', 'inconclusive with a high finding is refused'],
  ['severity on cards above the prompt', '...cards(m, false)', '...cards(m, true)', 'on the spec pair, both calls at one anchor give a disagreement'],
  ['area icon above the prompt', 'heading(m, false)', 'heading(m, true)', 'no mark but the crossing mark'],
  ['tab allowed', "if (isRefused(cp) || cp === 9) return 'characters';", "if (isRefused(cp)) return 'characters';", 'by the characters rule'],
  ['pictographs allowed', "if (PICTOGRAPH_RE.test(String.fromCodePoint(cp))) return 'pictograph';", '', 'by the pictograph rule'],
  ['crossing mark allowed', "if (cp >= 0x2719 && cp <= 0x2720) return 'mark';", '', 'by the mark rule'],
  ['file names echoed raw', "s += /[A-Za-z0-9._-]/.test(ch) ? ch : '?';", 's += ch;', 'a file name made of unsafe characters'],
  ['a crossing from one lens', 'r.crossing = docs.length === 2 && r.count === 2;', 'r.crossing = docs.length === 2 && r.count >= 1;', 'an exact anchor join finds the crossing'],
  ['code span fence fixed at one', "const fence = '`'.repeat(longestRun(t, '`') + 1);\n  return `${fence} ${t} ${fence}`;", "const fence = '`';\n  return `${fence} ${t} ${fence}`;", 'a headline holding three backticks'],
  ['pipes not escaped in tables', "s.replaceAll('|', '\\\\|')", 's', 'a pipe in a table cell'],
  ['no split', 'const LIMIT = 65536;', 'const LIMIT = 6553600;', 'kept as a local file, never cut'],
  ['policy without form-action', " form-action 'none';", '', 'the policy is the first element'],
  ['non-risks outside the fold', 'nonRiskUnits(m, setup, FOLD_VERDICT)', 'nonRiskUnits(m, setup, null)', 'a distinctive non-risk note'],
  ['verbatim fence too short', "const fence = '`'.repeat(Math.max(3, longestRun(text, '`') + 1));", "const fence = '````';", 'fence is longer than its longest backtick run'],
  ['hidden count per report, not per code point', 'if (cp !== 10 && (isRefused(cp) || isInvisible(cp))) n += 1;', 'if (cp !== 10 && (isRefused(cp) || isInvisible(cp))) n = 1;', 'three hidden characters on one line'],
  ['pick rule 3 removed', "else if (pick !== 'none' && targets.length > 0 && !picked.some(id => targets.includes(id))) rule = 3;", '', 'pick: mismatch rule 3'],
  ['security tier check removed', "(area.thoroughOnly && tier !== 'thorough')", 'false', 'security-pair report with any tier below thorough'],
  ['likelihood check removed', "if (LIKELIHOOD_LENSES.has(lens) ? !SEVERITIES.has(f.likelihood) : Object.hasOwn(f, 'likelihood')) refuse('likelihood');", '', 'likelihood on integrity-lens'],
  ['line ranges never join', 'if (last && s <= last.end)', 'if (last && s < last.start)', 'line anchors join on file and overlap'],
  ['strict reader stops case-folding', 'const k = string().toLowerCase();', 'const k = string();', 'an unknown key, a duplicate key'],
  ['part header carries a total', 'const header = () => `_Continued, part ${parts.length + 2}._\\n\\n`;', 'const header = () => `_Continued, part ${parts.length + 2} of ${units.length > 400 ? 9 : 3}._\\n\\n`;', 'a section over the limit splits between cards'],
  ['two blocks allowed', "if (opens.length !== 1) refuse('block-count');", "if (opens.length < 1) refuse('block-count');", 'two lens-findings blocks'],
  ['unlisted anchors allowed', "if (!listed.has(a.id)) refuse('anchor-unlisted');", '', 'an unlisted C99'],
  ['dispatched lens not checked', "if (doc.lens !== lens) refuse('lens');", '', 'differs from the dispatched lens'],
  ['half pair allowed', '|| lenses.length !== area.lenses.length', '', 'half a pair'],
  ['map shows a severity mark', "lines.push(`  X${i + 1}[${mapLabel(`${m.tension ? 'settle' : CROSSING} ${r.label}`)}]`);", "lines.push(`  X${i + 1}[${mapLabel(`${m.tension ? 'settle' : CROSSING} ${r.label}${r.high ? ' x' : ''}`)}]`);", 'on the spec pair, both calls at one anchor'],
  ['reveal is not a details block', '<details><summary>Verdict, severities and non-risks</summary>', '<div><summary>Verdict, severities and non-risks</summary>', 'the reveal is a <details> block'],
  ['non-risks 21 allowed', 'doc.nonRisks.length > NON_RISKS_MAX', 'doc.nonRisks.length > NON_RISKS_MAX + 1', 'non-risks: 21 items refused'],
  ['path length 201 allowed', 'p.length > TEXT_MAX', 'p.length > TEXT_MAX + 1', 'a path of 201 characters'],
  ['unstated takes a pick', "if (a.mode === 'pick' && !area.pair) return { rule: 'pick', area };", '', 'unstated-lens alone is refused'],
  ['part 1 names a total once the section splits', "  parts.push(cur + closing());\n  return parts;", "  parts.push(cur + closing());\n  if (parts.length > 1) parts[0] = `Part 1 of ${parts.length}\\n\\n${parts[0]}`;\n  return parts;", 'invariance: severities, verdicts and non-risks'],
  ['the calls table in the non-risks fold at standard', '...matrix(m), ...callsTable(m, null));', '...matrix(m), ...callsTable(m, FOLD_NON_RISKS));', 'calls show side by side in the open'],
  ['a card cannot split between its lines', "units.push({ table: card, text: `  - ${code(m.area.lenses[li])}", "units.push({ text: (f === fs[0] && li === 0 ? card.open : '') + `  - ${code(m.area.lenses[li])}", 'one card over the limit splits between its finding lines'],
  ['a card that fits is cut at a part boundary', 'moveWhole = !fits(cur + enter(u, false)) && fits(header() + enter(u, true));', 'moveWhole = false;', 'a card that fits in one comment is never cut'],
  ['a continued card loses its group heading', 'const reopen = `${title} (continued)\\n\\n${head}`;', 'const reopen = head;', 'a disagreement card split across parts'],
  ['a card that moves whole loses its group heading', 'fresh && u.table.fresh ? u.table.fresh : u.table.open', 'u.table.open', 'moves whole to the next part opens with its group heading'],
  ['unstated-lens verdict open at thorough', "const thorough = m.tier === 'thorough';", "const thorough = m.tier === 'thorough' && m.area.pair;", 'unstated-lens alone at thorough'],
];

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('the override is unset in a normal run, so the suite checks the real script', () => {
  assert.equal(process.env.PACT_CROSS_UNDER_TEST, undefined, 'PACT_CROSS_UNDER_TEST is set: every cross test would check that file instead');
});

test('every mutation still matches the script, so the battery cannot go stale silently', () => {
  for (const [name, from] of MUTATIONS) assert.ok(SOURCE.includes(from), `${name}: its source text is no longer in cross/cross.mjs`);
});

/** Run the tests whose names hold `catcher`, against `script`. Returns the TAP lines that name a matching test. */
async function runCatcher(script, catcher) {
  const env = { ...process.env, PACT_CROSS_UNDER_TEST: script };
  delete env.NODE_OPTIONS;
  delete env.NODE_TEST_CONTEXT;
  let stdout;
  try {
    ({ stdout } = await run(process.execPath, ['--test', '--test-reporter=tap', `--test-name-pattern=${escape(catcher)}`, ...TESTS], { env, maxBuffer: 64 * 1024 * 1024 }));
  } catch (e) {
    stdout = e.stdout ?? '';
  }
  const named = new RegExp(`^\\s*(not ok|ok) \\d+ - .*${escape(catcher)}`, 'gm');
  const lines = [...stdout.matchAll(named)].filter(m => !/# SKIP/.test(m.input.slice(m.index, m.input.indexOf('\n', m.index))));
  return { passed: lines.filter(m => m[1] === 'ok').length, failed: lines.filter(m => m[1] === 'not ok').length };
}

test('the mutation battery: each broken rule fails the tests named for it', { concurrency: 6 }, async t => {
  const dir = tempDir(t, 'pact-mutation-');
  // One baseline run per catcher phrase, shared by every mutation that names it.
  const baselines = new Map();
  const baseline = catcher => {
    if (!baselines.has(catcher)) baselines.set(catcher, runCatcher(join(REPO, 'cross', 'cross.mjs'), catcher));
    return baselines.get(catcher);
  };
  await Promise.all(
    MUTATIONS.map(([name, from, to, catcher], i) =>
      t.test(name, async () => {
        // Baseline: the catching tests pass on the real script, so a catch means something.
        const base = await baseline(catcher);
        assert.ok(base.passed > 0 && base.failed === 0, `${name}: the tests matching "${catcher}" do not all pass on the real script (${base.passed} passed, ${base.failed} failed)`);
        // A function replacement, so a `$` pattern in the replacement is taken literally.
        const mutated = SOURCE.replace(from, () => to);
        assert.notEqual(mutated, SOURCE, `${name}: the mutation does not change the script`);
        const mutant = join(dir, `cross-${i}.mjs`);
        writeFileSync(mutant, mutated);
        // The mutant must still load and run, so a crash on start cannot pass as a catch.
        let ran;
        try {
          await run(process.execPath, [mutant]);
        } catch (e) {
          ran = e;
        }
        assert.ok(ran && ran.code === 1 && /^FAIL usage: /m.test(ran.stdout), `${name}: the mutant does not load and run`);
        const hit = await runCatcher(mutant, catcher);
        assert.ok(hit.failed > 0, `${name}: survived; no test named "${catcher}" failed`);
      }),
    ),
  );
});
