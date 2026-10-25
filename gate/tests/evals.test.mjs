// The eval generator (#405): evals/gen.mjs writes each case in evals/cases/
// twice, with the rules text as the appended system prompt and without, and
// prints the eval commands for the owner to run; `check` reads a first run's
// JSON. One test per acceptance claim, C1 to C6 of the spec on #405. No test
// runs `claude`: the generator and the checker run nothing.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import {
  CANARY_WORD,
  CASES_DIR,
  RULES_HEAD,
  checkRun,
  defaultRules,
  evalRead,
  generate,
} from '../../evals/gen.mjs';
import { childEnv } from './gate-run.mjs';
import { REPO } from './text.mjs';
import { tempDir, writeTree } from './tree.mjs';

const GEN = join(REPO, 'evals', 'gen.mjs');
const RULES = readFileSync(join(REPO, 'claude', 'CLAUDE.md'), 'utf8');
const CASES = readdirSync(CASES_DIR).sort();
const LIMITS = ['--ablation none', '--runs 1', '--model haiku', '--judge-model haiku', '--max-cost-usd 1', '--no-publish'];
const DENY = '--disallow-tools Agent WebFetch WebSearch Bash Write Edit NotebookEdit Read Glob Grep';

const out = t => join(tempDir(t, 'pact-evals-'), 'out');

test('C1: two copies per case, the without copy and the graders byte for byte', t => {
  const o = out(t);
  generate({ out: o, rules: 'rules text\n' });
  assert.equal(CASES.length, 16);
  assert.ok(existsSync(join(o, '.claude-plugin', 'plugin.json')));
  assert.deepEqual(readdirSync(join(o, 'evals')).sort(), CASES.flatMap(c => [`${c}-with`, `${c}-without`]).sort());
  for (const c of CASES) {
    const src = join(CASES_DIR, c);
    assert.ok(readFileSync(join(o, 'evals', `${c}-without`, 'prompt.md')).equals(readFileSync(join(src, 'prompt.md'))), c);
    for (const arm of ['with', 'without']) {
      for (const g of readdirSync(join(src, 'graders'))) {
        assert.ok(readFileSync(join(o, 'evals', `${c}-${arm}`, 'graders', g)).equals(readFileSync(join(src, 'graders', g))), `${c}-${arm} ${g}`);
      }
    }
  }
});

test('C2: read the eval\'s way, each with copy keeps its keys, the rules text and its body; the pilot\'s layout does not', t => {
  assert.ok(RULES.includes('---'), 'the rules text must hold a --- for this test to bite');
  const o = out(t);
  generate({ out: o, rules: RULES });
  for (const c of CASES) {
    const src = evalRead(readFileSync(join(CASES_DIR, c, 'prompt.md'), 'utf8'));
    const got = evalRead(readFileSync(join(o, 'evals', `${c}-with`, 'prompt.md'), 'utf8'));
    assert.equal(got.keys.max_turns, src.keys.max_turns, c);
    assert.equal(got.keys.allowed_tools, src.keys.allowed_tools, c);
    assert.equal(got.system, RULES_HEAD + RULES, c);
    assert.equal(got.body, src.body, c);
  }
  // The bad case: the #402 pilot's layout, the rules as a block scalar first in the front matter.
  const source = readFileSync(join(CASES_DIR, CASES[0], 'prompt.md'), 'utf8');
  const block = 'append_system_prompt: |\n' + (RULES_HEAD + RULES).split('\n').map(l => '  ' + l).join('\n') + '\n';
  const pilot = evalRead(source.replace(/^---\n/, '---\n' + block));
  assert.notEqual(pilot.keys.max_turns, evalRead(source).keys.max_turns);
  assert.notEqual(pilot.system, RULES_HEAD + RULES);
});

test('C3: the rules source is the default render, a --rules file, and --canary adds the word and its case', t => {
  const home = tempDir(t, 'pact-evals-home-');
  const ro = tempDir(t, 'pact-evals-render-');
  const r = spawnSync(process.execPath, [join(REPO, 'gate', 'render.mjs'), join(REPO, 'claude', 'CLAUDE.md'), ro, home, join(REPO, 'builder', 'default-config')], { env: childEnv(), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout);
  const rendered = readFileSync(join(ro, 'CLAUDE.md'), 'utf8');
  assert.equal(defaultRules(), rendered);

  const o1 = out(t);
  generate({ out: o1 });
  assert.equal(evalRead(readFileSync(join(o1, 'evals', `${CASES[0]}-with`, 'prompt.md'), 'utf8')).system, RULES_HEAD + rendered);

  const dir = tempDir(t, 'pact-evals-rules-');
  writeFileSync(join(dir, 'mine.md'), 'my rules\n');
  const o2 = out(t);
  generate({ out: o2, rulesFile: join(dir, 'mine.md') });
  assert.equal(evalRead(readFileSync(join(o2, 'evals', `${CASES[0]}-with`, 'prompt.md'), 'utf8')).system, RULES_HEAD + 'my rules\n');

  const o3 = out(t);
  const g = generate({ out: o3, rules: 'my rules\n', canary: true });
  assert.ok(g.lines.some(l => l.includes(CANARY_WORD)), 'the word is printed');
  assert.ok(evalRead(readFileSync(join(o3, 'evals', `${CASES[0]}-with`, 'prompt.md'), 'utf8')).system.trimEnd().endsWith(CANARY_WORD + '.'));
  const canary = evalRead(readFileSync(join(o3, 'evals', 'canary-with', 'prompt.md'), 'utf8'));
  assert.equal(canary.keys.max_turns, '2');
  assert.equal(canary.keys.allowed_tools, '[]');
  const graders = readdirSync(join(o3, 'evals', 'canary-with', 'graders'));
  assert.equal(graders.length, 1);
  const grader = readFileSync(join(o3, 'evals', 'canary-with', 'graders', graders[0]), 'utf8');
  assert.match(grader, /^type: regex$/m);
  assert.ok(grader.includes(CANARY_WORD));
  assert.ok(!existsSync(join(o2, 'evals', 'canary-with')), 'no canary case without --canary');
});

test('C4: each refusal exits non-zero and writes nothing', t => {
  const bad = (name, text) => {
    const d = tempDir(t, 'pact-evals-cases-');
    writeTree(d, { [`${name}/prompt.md`]: text, [`${name}/graders/criteria.md`]: '---\ntype: llm\n---\n\nx\n' });
    return d;
  };
  const refused = (opts, why) => {
    const o = opts.out ?? out(t);
    assert.throws(() => generate({ rules: 'r\n', ...opts, out: o }), why);
    assert.ok(!existsSync(o) || readdirSync(o).length === (opts.keep ?? 0), `${why} wrote something`);
  };
  refused({ out: join(REPO, 'evals', 'tmp-out') }, /inside the repo/);
  assert.throws(() => generate({ rules: 'r\n', out: dirname(REPO) }), /repo inside/);
  const full = out(t);
  mkdirSync(full, { recursive: true });
  writeFileSync(join(full, 'x'), 'x');
  refused({ out: full, keep: 1 }, /not empty/);
  for (const ch of ['"', '$', '`', '%']) refused({ out: out(t) + ch }, /character/);
  refused({ casesDir: bad('nofm', 'no front matter\n') }, /front matter/);
  refused({ casesDir: bad('own', '---\nmax_turns: 4\nallowed_tools: []\nappend_system_prompt: "x"\n---\n\nbody\n') }, /append_system_prompt/);
  refused({ casesDir: bad('tools', '---\nmax_turns: 4\nallowed_tools: [Read]\n---\n\nbody\n') }, /tool/);
  refused({ casesDir: bad('nokey', '---\nmax_turns: 4\n---\n\nbody\n') }, /tool/);
  refused({ casesDir: bad('round', '---\nmax_turns: 4\nallowed_tools: []\nnote: a --- b\n---\n\nbody\n') }, /round trip/);
  // The command line exits non-zero on a refusal, and prints no path.
  const r = spawnSync(process.execPath, [GEN, join(REPO, 'evals', 'tmp-out')], { env: childEnv(), encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.ok(!(r.stdout + r.stderr).includes(REPO), 'a refusal prints no path');
  assert.ok(!existsSync(join(REPO, 'evals', 'tmp-out')));
});

test('C5: the printed commands carry every limit, start in the output folder, and nothing runs', t => {
  const o = out(t);
  const { lines } = generate({ out: o, rules: 'r\n', canary: true });
  const evals = lines.filter(l => l.startsWith('claude plugin eval '));
  assert.equal(evals.length, 2, 'step 1 and step 3');
  for (const l of evals) {
    assert.ok(l.startsWith(`claude plugin eval "${o}" --eval-dir evals `), l);
    for (const f of LIMITS) assert.ok(l.includes(` ${f} `), `${f} missing`);
    assert.ok(l.endsWith(` ${DENY}`), 'the deny-list goes last');
    const json = l.match(/ --json "([^"]+)" /);
    assert.ok(json && json[1].startsWith(o), '--json inside the output folder');
  }
  assert.ok(evals[0].includes(' --case canary-with '), 'step 1 runs the canary');
  assert.ok(!evals[1].includes('--case'), 'step 3 runs every case');
  assert.ok(lines.includes(`cd "${o}"`), 'step 0 enters the output folder');
  assert.ok(lines.some(l => l.startsWith(`node "${GEN}" check "`)), 'step 2 names the script by its full path');
  const plain = generate({ out: out(t), rules: 'r\n' }).lines.find(l => l.startsWith('claude plugin eval '));
  assert.ok(plain.includes(` --case ${CASES[0]}-with `), 'without --canary, step 1 runs the first case by name');
  assert.doesNotMatch(readFileSync(GEN, 'utf8'), /node:child_process|\bspawn|\bexec/, 'the generator runs nothing');
});

test('C6: check passes a clean first run and fails each fault by its field, printing no reply or path', t => {
  const o = out(t);
  generate({ out: o, rules: 'r\n', canary: true });
  const c = CASES[0];
  const body = evalRead(readFileSync(join(CASES_DIR, c, 'prompt.md'), 'utf8')).body.trim();
  const canaryBody = evalRead(readFileSync(join(o, 'evals', 'canary-with', 'prompt.md'), 'utf8')).body.trim();
  const reply = 'SECRET-REPLY-TEXT';
  const run = (name, over = {}, arm = {}) => ({
    name, dir: join(o, 'evals', name), promptMarkdown: name.startsWith('canary') ? canaryBody : body,
    maxTurns: name.startsWith('canary') ? 2 : 4, runsPerCase: 1, graders: [],
    arms: { with: [{ passed: true, turns: 1, costUsd: 0, judgeCostUsd: 0, graders: [{ name: 'word', passed: true, explanation: reply, evidence: reply }], ...arm }] },
    ...over,
  });
  const json = (cases, top = {}) => ({ schemaVersion: 1, claudeVersion: '2.1.310', partial: false, costUsd: 0, cases, ...top });
  const verdict = doc => checkRun(doc, o);

  const good = verdict(json([run(`${c}-with`), run(`${c}-without`), run('canary-with'), run('canary-without', {}, { passed: false, graders: [{ name: 'word', passed: false }] })]));
  assert.equal(good.ok, true, good.lines.join('\n'));
  const faults = [
    [json([run(`${c}-with`, { maxTurns: 10 })]), 'maxTurns'],
    [json([run(`${c}-with`, { promptMarkdown: `${RULES_HEAD}r\n${body}` })]), 'promptMarkdown'],
    [json([(({ maxTurns, ...rest }) => rest)(run(`${c}-with`))]), 'maxTurns'],
    [json([run(`${c}-with`, {}, { turns: 2 })]), 'turns'],
    [json([run(`${c}-with`)], { partial: true }), 'partial'],
    [json([run('canary-with', {}, { passed: false, graders: [{ name: 'word', passed: false }] })]), 'canary'],
  ];
  for (const [doc, field] of faults) {
    const v = verdict(doc);
    assert.equal(v.ok, false, field);
    assert.ok(v.lines.some(l => l.includes(field)), `${field} not named: ${v.lines.join(' | ')}`);
    for (const l of v.lines) {
      assert.ok(!l.includes(reply) && !l.includes(o) && !l.includes(REPO), `check printed a reply or a path: ${l}`);
    }
  }
});
