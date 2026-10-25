// The eval generator (#405, ADR 0119) writes each case twice, with the rules
// text as the appended system prompt and without, and prints the eval
// commands for the owner to run; its check reads a first run's JSON. One test
// per acceptance claim of the spec on #405, each named on the line above it.
// No test runs `claude`: the generator and the checker run nothing.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
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
import { childEnv, runCore } from './gate-run.mjs';
import { REPO } from './text.mjs';
import { tempDir, writeTree } from './tree.mjs';

const GEN = join(REPO, 'evals', 'gen.mjs');
const RULES = readFileSync(join(REPO, 'claude', 'CLAUDE.md'), 'utf8');
const CASES = readdirSync(CASES_DIR).sort();
const LIMITS = ['--ablation none', '--runs 1', '--model haiku', '--judge-model haiku', '--max-cost-usd 1', '--no-publish', '--trust-plugin'];
const DENY = '--disallow-tools Agent WebFetch WebSearch Bash Write Edit NotebookEdit Read Glob Grep';
const GOOD_CASE = '---\nmax_turns: 4\nallowed_tools: []\n---\n\nbody\n';

const out = t => join(tempDir(t, 'pact-evals-'), 'out');
const gen = args => spawnSync(process.execPath, [GEN, ...args], { env: childEnv(), encoding: 'utf8' });
const withText = (o, c) => evalRead(readFileSync(join(o, 'evals', `${c}-with`, 'prompt.md'), 'utf8'));

// #405 C1
test('C1: two copies per case, the without copy and the graders byte for byte', t => {
  const o = out(t);
  generate({ out: o, rulesText: 'rules text\n' });
  assert.equal(CASES.length, 16);
  const manifest = JSON.parse(readFileSync(join(o, '.claude-plugin', 'plugin.json'), 'utf8'));
  assert.equal(manifest.name, 'pact-evals');
  assert.equal(manifest.version, '0.0.0');
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

// #405 C2
test('C2: read the eval\'s way, each with copy keeps its keys, the rules text and its body; the pilot\'s layout does not', t => {
  assert.ok(RULES.includes('---'), 'the rules text must hold a --- for this test to bite');
  const o = out(t);
  generate({ out: o, rulesText: RULES });
  for (const c of CASES) {
    const src = evalRead(readFileSync(join(CASES_DIR, c, 'prompt.md'), 'utf8'));
    const got = withText(o, c);
    assert.equal(got.keys.max_turns, src.keys.max_turns, c);
    assert.equal(got.keys.allowed_tools, src.keys.allowed_tools, c);
    assert.equal(got.system, RULES_HEAD + RULES, c);
    assert.equal(got.body, src.body, c);
  }
  // A rules text holding the Unicode line breaks, DEL, a C1 control and a noncharacter round trips too.
  const ODD = [0x85, 0x2028, 0x2029, 0x7f, 0x9b, 0xfffe];
  const odd = `${ODD.map(c => `x${String.fromCharCode(c)}`).join('')}\n`;
  const o2 = out(t);
  generate({ out: o2, rulesText: odd });
  assert.equal(withText(o2, CASES[0]).system, RULES_HEAD + odd);
  const raw = readFileSync(join(o2, 'evals', `${CASES[0]}-with`, 'prompt.md'), 'utf8');
  for (const code of ODD) assert.ok(!raw.includes(String.fromCharCode(code)), `a raw U+${code.toString(16)} in the with copy`);
  // The bad case: the #402 pilot's layout, the rules as a block scalar first in the front matter.
  const source = readFileSync(join(CASES_DIR, CASES[0], 'prompt.md'), 'utf8');
  const block = 'append_system_prompt: |\n' + (RULES_HEAD + RULES).split('\n').map(l => '  ' + l).join('\n') + '\n';
  const pilot = evalRead(source.replace(/^---\n/, '---\n' + block));
  assert.notEqual(pilot.keys.max_turns, evalRead(source).keys.max_turns);
  assert.notEqual(pilot.system, RULES_HEAD + RULES);
});

// #405 C3
test('C3: the rules source is the default render, a --rules file, and --canary adds the word and its case', t => {
  const home = tempDir(t, 'pact-evals-home-');
  const ro = tempDir(t, 'pact-evals-render-');
  const r = runCore('render', [join(REPO, 'claude', 'CLAUDE.md'), ro, home, join(REPO, 'builder', 'default-config')]);
  assert.equal(r.code, 0, r.stdout);
  const rendered = readFileSync(join(ro, 'CLAUDE.md'), 'utf8');
  assert.equal(defaultRules(), rendered);

  const o1 = out(t);
  generate({ out: o1 });
  assert.equal(withText(o1, CASES[0]).system, RULES_HEAD + rendered);
  assert.ok(!existsSync(join(o1, 'evals', 'canary-with')), 'no canary case without --canary');

  // The command line: --rules and --canary parsed, the word printed.
  const dir = tempDir(t, 'pact-evals-rules-');
  writeFileSync(join(dir, 'mine.md'), 'my rules\n');
  const o2 = out(t);
  const run = gen([o2, '--rules', join(dir, 'mine.md'), '--canary']);
  assert.equal(run.status, 0, run.stderr);
  assert.ok(run.stdout.includes(CANARY_WORD), 'the word is printed');
  assert.equal(withText(o2, CASES[0]).system, `${RULES_HEAD}my rules\n\nCanary: the pilot word is ${CANARY_WORD}.\n`, 'the --rules file, then the canary line');
  const canary = withText(o2, 'canary');
  assert.equal(canary.keys.max_turns, '2');
  assert.equal(canary.keys.allowed_tools, '[]');
  const graders = readdirSync(join(o2, 'evals', 'canary-with', 'graders'));
  assert.equal(graders.length, 1);
  const grader = readFileSync(join(o2, 'evals', 'canary-with', 'graders', graders[0]), 'utf8');
  assert.match(grader, /^type: regex$/m);
  const pattern = new RegExp(grader.match(/^pattern: (.*)$/m)[1]);
  assert.ok(pattern.test(CANARY_WORD) && !pattern.test('NONE'), 'the grader matches the word, and not NONE');
  assert.ok(readFileSync(join(o2, 'evals', 'canary-without', 'graders', graders[0])).equals(readFileSync(join(o2, 'evals', 'canary-with', 'graders', graders[0]))), 'the without copy has the same grader');
});

// #405 C4
test('C4: each refusal exits non-zero and writes nothing', t => {
  // Each bad case sorts after a good one, so a write before the refusal would show.
  const bad = (name, text) => {
    const d = tempDir(t, 'pact-evals-cases-');
    const tree = { 'aaa/prompt.md': GOOD_CASE, 'aaa/graders/criteria.md': '---\ntype: llm\n---\n\nx\n' };
    if (text !== null) tree[`${name}/prompt.md`] = text;
    else tree[`${name}/graders/criteria.md`] = '---\ntype: llm\n---\n\nx\n';
    if (name === 'subdir') tree['subdir/graders/inner/x.md'] = 'x\n';
    writeTree(d, tree);
    return d;
  };
  const refused = (opts, why, keep = 0) => {
    const o = opts.out ?? out(t);
    assert.throws(() => generate({ rulesText: 'r\n', ...opts, out: o }), why);
    assert.ok(keep ? readdirSync(o).length === keep : !existsSync(o), `${why} wrote something`);
  };
  refused({ out: join(REPO, 'evals', 'tmp-out') }, /inside the repo/);
  assert.throws(() => generate({ rulesText: 'r\n', out: dirname(REPO) }), /repo inside/);
  const full = out(t);
  mkdirSync(full, { recursive: true });
  writeFileSync(join(full, 'x'), 'x');
  refused({ out: full }, /not empty/, 1);
  for (const ch of ['"', '$', '`', '%', '\n', '\r', ...[0x201c, 0x201d, 0x201e].map(c => String.fromCharCode(c))]) refused({ out: out(t) + ch }, /character/);
  // A link into the repo, and the extended-length prefix, reach the repo too.
  const link = join(tempDir(t, 'pact-evals-link-'), 'repo');
  symlinkSync(REPO, link, 'junction');
  assert.throws(() => generate({ rulesText: 'r\n', out: join(link, 'tmp-out-405') }), /inside the repo/);
  assert.ok(!existsSync(join(REPO, 'tmp-out-405')), 'a linked refusal wrote into the repo');
  if (process.platform === 'win32') assert.throws(() => generate({ rulesText: 'r\n', out: '\\\\?\\' + join(REPO, 'tmp-out-405') }), /inside the repo/);
  refused({ rulesText: undefined, rulesFile: join(tempDir(t, 'pact-evals-none-'), 'missing.md') }, /--rules path is not a file/);
  refused({ rulesText: undefined, rulesFile: tempDir(t, 'pact-evals-dir-') }, /--rules path is not a file/);
  refused({ casesDir: bad('subdir', GOOD_CASE) }, /not a file/);
  refused({ casesDir: bad('nofm', 'no front matter\n') }, /front matter/);
  refused({ casesDir: bad('noprompt', null) }, /no prompt\.md/);
  refused({ casesDir: bad('canary', GOOD_CASE) }, /built-in canary/);
  refused({ casesDir: bad('own', '---\nmax_turns: 4\nallowed_tools: []\nappend_system_prompt: "x"\n---\n\nbody\n') }, /append_system_prompt/);
  refused({ casesDir: bad('tools', '---\nmax_turns: 4\nallowed_tools: [Read]\n---\n\nbody\n') }, /tool/);
  refused({ casesDir: bad('twice', '---\nmax_turns: 4\nallowed_tools: [Bash]\nallowed_tools: []\n---\n\nbody\n') }, /twice/);
  refused({ casesDir: bad('camel', '---\nmax_turns: 4\nallowed_tools: []\nallowedTools: [Bash]\n---\n\nbody\n') }, /tool/);
  refused({ casesDir: bad('nokey', '---\nmax_turns: 4\n---\n\nbody\n') }, /tool/);
  refused({ casesDir: bad('round', '---\nmax_turns: 4\nallowed_tools: []\nnote: a --- b\n---\n\nbody\n') }, /round trip/);
  // The command line exits non-zero on a refusal, and prints no path.
  const r = gen([join(REPO, 'evals', 'tmp-out')]);
  assert.notEqual(r.status, 0);
  assert.ok(!(r.stdout + r.stderr).includes(REPO), 'a refusal prints no path');
  assert.ok(!existsSync(join(REPO, 'evals', 'tmp-out')));
});

// #405 C5
test('C5: the printed commands carry every limit, start in the output folder, and nothing runs', t => {
  const o = out(t);
  const run = gen([o, '--canary']);
  assert.equal(run.status, 0, run.stderr);
  const lines = run.stdout.split('\n');
  const evals = lines.filter(l => l.startsWith('claude plugin eval '));
  assert.equal(evals.length, 2, 'step 1 and step 3 are printed');
  for (const l of evals) {
    assert.ok(l.startsWith(`claude plugin eval "${o}" --eval-dir evals `), l);
    for (const f of LIMITS) assert.ok(l.includes(` ${f} `), `${f} missing`);
    assert.ok(l.endsWith(` ${DENY}`), 'the deny-list goes last');
    const json = l.match(/ --json "([^"]+)" /);
    assert.ok(json && dirname(json[1]) === o, '--json inside the output folder');
  }
  assert.ok(evals[0].includes(' --case canary-with '), 'step 1 runs the canary');
  assert.ok(!evals[1].includes('--case'), 'step 3 runs every case');
  assert.ok(lines.includes(`cd "${o}"`), 'step 0 enters the output folder');
  const step1Json = evals[0].match(/ --json "([^"]+)" /)[1];
  assert.ok(lines.includes(`node "${GEN}" check "${step1Json}" "${o}"`), 'step 2 checks step 1\'s run, by the script\'s full path');
  const plain = generate({ out: out(t), rulesText: 'r\n' }).lines.find(l => l.startsWith('claude plugin eval '));
  assert.ok(plain.includes(` --case ${CASES[0]}-with `), 'without --canary, step 1 runs the first case by name');
  assert.doesNotMatch(readFileSync(GEN, 'utf8'), /node:child_process|\bspawn|\bexec/, 'the generator runs nothing');
});

// #405 C6
test('C6: check passes a clean first run and fails each fault by its field, printing no reply or path', t => {
  const o = out(t);
  generate({ out: o, rulesText: 'r\n', canary: true });
  const c = CASES[0];
  const body = evalRead(readFileSync(join(CASES_DIR, c, 'prompt.md'), 'utf8')).body.trim();
  const canaryBody = withText(o, 'canary').body.trim();
  const reply = 'SECRET-REPLY-TEXT';
  const graded = passed => [{ name: 'word', passed, explanation: reply, evidence: reply }];
  const run = (name, over = {}, arm = {}) => ({
    name, dir: join(o, 'evals', name), promptMarkdown: name.startsWith('canary') ? canaryBody : body,
    maxTurns: name.startsWith('canary') ? 2 : 4, runsPerCase: 1, graders: [],
    arms: { with: [{ passed: true, turns: 1, costUsd: 0, judgeCostUsd: 0, graders: graded(true), ...arm }] },
    ...over,
  });
  const json = (cases, top = {}) => ({ schemaVersion: 1, claudeVersion: '2.1.310', partial: false, costUsd: 0, cases, ...top });

  const good = { doc: json([run(`${c}-with`), run(`${c}-without`), run('canary-with'), run('canary-without', {}, { passed: false, graders: graded(false) })]) };
  const passed = checkRun(good.doc, o);
  assert.equal(passed.ok, true, passed.lines.join('\n'));
  const faults = [
    [json([run(`${c}-with`, { maxTurns: 10 })]), 'maxTurns'],
    [json([run(`${c}-with`, { promptMarkdown: `${RULES_HEAD}r\n${body}` })]), 'promptMarkdown'],
    [json([(({ maxTurns, ...rest }) => rest)(run(`${c}-with`))]), 'maxTurns'],
    [json([run(`${c}-with`, {}, { turns: 2 })]), 'turns'],
    [json([run(`${c}-with`)], { partial: true }), 'partial'],
    [json([]), 'no cases'],
    [json([run('canary-with', {}, { passed: false, graders: graded(false) })]), 'canary'],
    [json([run('canary-with', {}, { graders: [] })]), 'canary'],
    [json([run('canary-without')]), 'canary'],
    [json([run(`${c}-with`, { arms: {} })]), 'arms'],
    [json([(({ promptMarkdown, ...rest }) => rest)(run(`${c}-with`))]), 'promptMarkdown'],
  ];
  for (const [doc, field] of faults) {
    const v = checkRun(doc, o);
    assert.equal(v.ok, false, field);
    assert.ok(v.lines.some(l => l.includes(': fail ') && l.split(': fail ')[1].includes(field)), `${field} not named: ${v.lines.join(' | ')}`);
    for (const l of v.lines) {
      assert.ok(!l.includes(reply) && !l.includes(o) && !l.includes(REPO), `check printed a reply or a path: ${l}`);
    }
  }
  // The command line exits 0 on a clean run and 1 on a fault, with its result line last, and prints no reply or path.
  const dir = tempDir(t, 'pact-evals-run-');
  for (const [name, doc, status, result] of [['good.json', good.doc, 0, 'RESULT: pass'], ['bad.json', json([run('canary-with', {}, { passed: false, graders: graded(false) })]), 1, 'RESULT: fail']]) {
    const file = join(dir, name);
    writeFileSync(file, JSON.stringify(doc));
    const r = gen(['check', file, o]);
    assert.equal(r.status, status, name);
    assert.ok(r.stdout.trimEnd().endsWith(result), name);
    for (const s of [reply, o, file, REPO]) assert.ok(!(r.stdout + r.stderr).includes(s), `check printed a reply or a path (${name})`);
  }
});
