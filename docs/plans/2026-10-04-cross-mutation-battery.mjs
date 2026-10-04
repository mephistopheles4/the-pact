// Mutation battery for cross/cross.mjs (#44): each mutation breaks one rule, and at\n// least one cross test must then fail. It shows that tests written after the code\n// can fail. Run from the repo root; it restores the file when done:\n//   node docs/plans/2026-10-04-cross-mutation-battery.mjs [results file]
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
const FILE = 'cross/cross.mjs';
const orig = readFileSync(FILE, 'utf8');
const M = [
  ['agreement: inconclusive with high allowed', 'inconclusive: !high,', 'inconclusive: true,'],
  ['severity on cards above the prompt', '...cards(m, false)', '...cards(m, true)'],
  ['area icon above the prompt', 'heading(m, false)', 'heading(m, true)'],
  ['tab allowed', "if (isRefused(cp) || cp === 9) return 'characters';", "if (isRefused(cp)) return 'characters';"],
  ['pictographs allowed', "if (PICTOGRAPH_RE.test(String.fromCodePoint(cp))) return 'pictograph';", ''],
  ['crossing mark allowed', "if (cp >= 0x2719 && cp <= 0x2720) return 'mark';", ''],
  ['file names echoed raw', "s += /[A-Za-z0-9._-]/.test(ch) ? ch : '?';", 's += ch;'],
  ['a crossing from one lens', 'r.crossing = docs.length === 2 && r.count === 2;', 'r.crossing = docs.length === 2 && r.count >= 1;'],
  ['code span fence fixed at one', "const fence = '`'.repeat(longestRun(t, '`') + 1);\n  return `${fence} ${t} ${fence}`;", "const fence = '`';\n  return `${fence} ${t} ${fence}`;"],
  ['pipes not escaped in tables', "s.replaceAll('|', '\\\\|')", 's'],
  ['no split', 'const LIMIT = 65536;', 'const LIMIT = 6553600;'],
  ['policy without form-action', " form-action 'none';", ''],
  ['non-risks outside the fold', 'nonRiskUnits(m, setup, FOLD_VERDICT)', 'nonRiskUnits(m, setup, null)'],
  ['verbatim fence too short', "const fence = '`'.repeat(Math.max(3, longestRun(text, '`') + 1));", "const fence = '````';"],
  ['hidden count per report, not per code point', 'if (cp !== 10 && (isRefused(cp) || isInvisible(cp))) n += 1;', 'if (cp !== 10 && (isRefused(cp) || isInvisible(cp))) n = 1;'],
  ['pick rule 3 removed', "else if (pick !== 'none' && targets.length > 0 && !picked.some(id => targets.includes(id))) rule = 3;", ''],
  ['security tier check removed', '(area.thoroughOnly && tier !== thorough)'.replace('thorough)', "'thorough')"), 'false'],
  ['likelihood check removed', "if (LIKELIHOOD_LENSES.has(lens) ? !SEVERITIES.has(f.likelihood) : Object.hasOwn(f, 'likelihood')) refuse('likelihood');", ''],
  ['line ranges never join', 'if (last && s <= last.end)', 'if (last && s < last.start)'],
  ['strict reader stops case-folding', 'const k = string().toLowerCase();', 'const k = string();'],
  ['part header carries a total', 'const header = () => `_Continued, part ${parts.length + 2}._\\n\\n`;', 'const header = () => `_Continued, part ${parts.length + 2} of ${units.length > 400 ? 9 : 3}._\\n\\n`;'],
  ['two blocks allowed', "if (opens.length !== 1) refuse('block-count');", "if (opens.length < 1) refuse('block-count');"],
  ['unlisted anchors allowed', "if (!listed.has(a.id)) refuse('anchor-unlisted');", ''],
  ['dispatched lens not checked', "if (doc.lens !== lens) refuse('lens');", "if (!LIKELIHOOD_LENSES && doc.lens !== lens) refuse('lens');"],
  ['half pair allowed', '|| lenses.length !== area.lenses.length', ''],
  ['map shows a severity mark', "lines.push(`  X${i + 1}[${mapLabel(`${m.tension ? 'settle' : CROSSING} ${r.label}`)}]`);", "lines.push(`  X${i + 1}[${mapLabel(`${m.tension ? 'settle' : CROSSING} ${r.label}${r.high ? ' x' : ''}`)}]`);"],
  ['reveal is not a details block', '<details><summary>Verdict, severities and non-risks</summary>', '<div><summary>Verdict, severities and non-risks</summary>'],
  ['non-risks 21 allowed', 'doc.nonRisks.length > NON_RISKS_MAX', 'doc.nonRisks.length > NON_RISKS_MAX + 1'],
  ['path length 201 allowed', 'p.length > TEXT_MAX', 'p.length > TEXT_MAX + 1'],
  ['unstated takes a pick', "if (a.mode === 'pick' && !area.pair) return { rule: 'pick', area };", ''],
  ['part 1 names a total once the section splits', "  parts.push(cur + closing());\n  return parts;", "  parts.push(cur + closing());\n  if (parts.length > 1) parts[0] = `Part 1 of ${parts.length}\\n\\n${parts[0]}`;\n  return parts;"],
  ['the calls table in the non-risks fold at standard', '...matrix(m), ...callsTable(m, null));', '...matrix(m), ...callsTable(m, FOLD_NON_RISKS));'],
  ['a card cannot split between its lines', "units.push({ table: card, text: `  - ${code(m.area.lenses[li])}", "units.push({ text: (f === fs[0] && li === 0 ? card.open : '') + `  - ${code(m.area.lenses[li])}"],
  ['an unbuildable section writes nothing', "return refusal(lines, outDir, reports, 'internal', []);", 'throw new Error();'],
  ['a card that fits is cut at a part boundary', 'moveWhole = !fits(cur + enter(u, false)) && fits(header() + enter(u, true));', 'moveWhole = false;'],
  ['a continued card loses its group heading', 'reopen: `${title} (continued)\\n\\n${head}`', 'reopen: head'],
  ['unstated-lens verdict open at thorough', "const thorough = m.tier === 'thorough';", "const thorough = m.tier === 'thorough' && m.area.pair;"],
];
const TESTS = ['gate/tests/cross-join.test.mjs', 'gate/tests/cross-checks.test.mjs', 'gate/tests/cross-views.test.mjs', 'gate/tests/cross-page.test.mjs', 'gate/tests/cross-parity.test.mjs'];
/** Run the cross tests: the failing test names, or null when the run itself broke. */
function runTests() {
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...TESTS], { encoding: 'utf8' });
  if (r.error || typeof r.stdout !== 'string' || !/^# tests \d+$/m.test(r.stdout)) return null;
  const fails = (r.stdout.match(/^not ok \d+ - .*$/gm) ?? []).map(l => l.replace(/^not ok \d+ - /, ''));
  // A non-zero exit with no failing test is a broken run, not a survivor.
  if (fails.length === 0 && r.status !== 0) return null;
  return fails;
}

// The unmutated tests must pass first, or a caught mutation proves nothing.
const baseline = runTests();
if (baseline === null || baseline.length > 0) {
  console.log(`BASELINE FAILED: ${baseline === null ? 'the test run broke' : `${baseline.length} failing, e.g. ${baseline[0]}`}`);
  process.exit(1);
}
const results = [];
try {
  for (const [name, from, to] of M) {
    if (!orig.includes(from)) {
      results.push(`MISSING  ${name}`);
      continue;
    }
    writeFileSync(FILE, orig.replace(from, to));
    const fails = runTests();
    if (fails === null) results.push(`ERROR    ${name}: the test run broke`);
    else results.push(`${fails.length ? 'CAUGHT ' : 'SURVIVED'} ${name}: ${fails.length} failing${fails.length ? ` (e.g. ${fails[0]})` : ''}`);
  }
} finally {
  writeFileSync(FILE, orig);
}
console.log(results.join('\n'));
if (process.argv[2]) writeFileSync(process.argv[2], results.join('\n') + '\n');
