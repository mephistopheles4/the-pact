// The coverage tool (spec 0010, S2 to S5 and S8). Every test passes fetch as an
// argument, over a fixture home and a fixture Claude home, with an environment
// built here, so no test reaches a model and none reads the caller's key.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import * as coverage from '../../claude/tools/coverage.mjs';
import { envSecrets, scan as posterScan } from '../../claude/tools/poster.mjs';
import { REPO } from './text.mjs';
import { tempDir } from './tree.mjs';

const lines = (...a) => a.join('\n');
const sha = s => createHash('sha256').update(s).digest('hex');

// ------------------------------------------------------------ fixtures

const MODEL_MD = lines(
  '# Threat model',
  '',
  'Intro text.',
  '',
  '```text',
  'a fenced line saying out of scope',
  '```',
  '',
  '## Scope',
  '',
  '**Out Of Scope:** the machine, and `every` file',
  'made there.',
  '',
  '- An item that is in.',
  '- Cloud copies are *out of',
  '  scope* too:',
  '  - their sandbox.',
  '',
  '## Accepted threat classes',
  '',
  'Each line details a class; nothing here is out of scope.',
  '',
  '- **Text steers a session.** Any *text* can',
  '  move it, `gh` posts included.',
  '',
  '  A second paragraph of it.',
  '- **A zero-width, hyphen-ated class.** Words.',
  '',
  '~~~',
  '- **Not a class.** Fenced.',
  '~~~',
  '',
  '### More',
  '',
  `- **${'long '.repeat(12)}name.** Cut.`,
  '',
  '## Open gaps',
  '',
  '- **Not a class either.**',
  '',
);

const OUT_1 = 'Out Of Scope: the machine, and every file made there.';
const OUT_2 = 'Cloud copies are out of scope too: - their sandbox.';

const ENTRIES = Object.freeze({
  v: 1,
  source: 'docs/threat-model.md@abc1234',
  entries: { text_steers: 'Text a session reads can move it.', out_of_scope_cloud: 'Out of scope: cloud copies.' },
  scope: { out_cloud: 'Out of scope: cloud copies.' },
});

const FINDING = 'A planted comment moves the session\nCANARY-FINDING: a session runs a command a stranger left.';

/** A git repository in a fresh folder holding `files` in one commit, with `origin` when given. */
function repo(t, files = {}, origin = 'https://github.com/example/listed.git') {
  const dir = tempDir(t, 'pact-coverage-repo-');
  const git = (...args) => {
    const r = spawnSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  git('init', '--quiet', '--initial-branch=main');
  writeFileSync(join(dir, 'README.md'), 'x\n');
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(dir, rel, '..'), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  git('add', '-A');
  git('commit', '--quiet', '-m', 'base');
  if (origin !== null) git('config', 'remote.origin.url', origin);
  return { dir, git, head: git('rev-parse', '--short', 'HEAD') };
}

const WITH_ENTRIES = Object.freeze({ 'docs/threat-entries.json': JSON.stringify(ENTRIES) });

/** An environment holding what git and node need, and no secret of the caller's. */
function cleanEnv(extra = {}) {
  const keep = ['PATH', 'SystemRoot', 'TEMP', 'TMP', 'TMPDIR'];
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (keep.some(n => n.toUpperCase() === k.toUpperCase())) env[k] = v;
  return { ...env, ...extra };
}

/** A stub fetch that records each request and answers with `reply(request, n)`. */
function stubFetch(reply = answered(() => 0.1)) {
  const sent = [];
  const fetch = async (url, init) => {
    const req = { url: String(url), init, body: JSON.parse(init.body) };
    sent.push(req);
    return reply(req, sent.length - 1, init);
  };
  return { fetch, sent };
}

const json = (value, status = 200) => new Response(typeof value === 'string' ? value : JSON.stringify(value), { status });

/** A 200 answering every question sent with `score(id, instructions)`, in the backend's own shape. */
function answered(score, extra = {}) {
  return req => {
    const answers = Object.fromEntries(Object.entries(req.body.questions).map(([id, q]) => [id, { type: 'noul', noul: score(id, q.instructions) }]));
    return req.url.startsWith('https://') ? json({ model: 'jev-1.14.0', usage: { input_tokens: 12 }, answers, ...extra }) : json(answers);
  };
}

/** A stub `clef.mjs`: it records each call, and prints what `plan.json` beside it says. */
const STUB_CLEF = lines(
  "import { appendFileSync, readFileSync } from 'node:fs';",
  "const here = new URL('.', import.meta.url);",
  "const plan = JSON.parse(readFileSync(new URL('plan.json', here), 'utf8'));",
  "appendFileSync(new URL('calls.jsonl', here), JSON.stringify({ argv: process.argv.slice(2), execPath: process.execPath, cwd: process.cwd(), key: 'TYPESAFE_API_KEY' in process.env }) + '\\n');",
  "if (process.argv[2] === 'ensure') console.log(JSON.stringify(plan.ensure));",
  'else console.log(plan.status);',
  '',
);
const READY = Object.freeze({ ensure: { url: 'http://127.0.0.1:4567', state: 'ready' }, status: 'platform: x\nmodel: eef2968c\nvariant: flash\nrun: ready\nlast failure: none\nRESULT: pass' });

/**
 * A fixture world: a home, a Claude home, a scratch folder, a repo, and the
 * tool copied beside a stub clef. `run(argv)` runs one mode in-process.
 */
async function world(t, { files = WITH_ENTRIES, origin, model, pact, config, clef = READY, finding = FINDING, env = {} } = {}) {
  const home = tempDir(t, 'pact-coverage-home-');
  const claude = tempDir(t, 'pact-coverage-claude-');
  const scratch = tempDir(t, 'pact-coverage-scratch-');
  const tools = tempDir(t, 'pact-coverage-tools-');
  copyFileSync(join(REPO, 'claude', 'tools', 'coverage.mjs'), join(tools, 'coverage.mjs'));
  if (clef !== null) {
    writeFileSync(join(tools, 'clef.mjs'), STUB_CLEF);
    writeFileSync(join(tools, 'plan.json'), JSON.stringify(clef));
  }
  mkdirSync(join(home, '.pact'));
  const mine = pact ?? (model === undefined ? undefined : { schema: 1, tools: ['coverage'], 'decision-model': model });
  for (const [name, value] of [['config.json', mine], ['coverage.json', config]]) {
    if (value !== undefined) writeFileSync(join(home, '.pact', name), typeof value === 'string' ? value : JSON.stringify(value));
  }
  const findingFile = join(scratch, 'finding.txt');
  writeFileSync(findingFile, finding);
  const r = repo(t, files, origin);
  const tool = await import(pathToFileURL(join(tools, 'coverage.mjs')).href);
  const logFile = join(claude, 'pact-coverage', 'log.jsonl');
  const environment = cleanEnv({ CLAUDE_CONFIG_DIR: claude, ...env });
  const run = async (argv, io = {}) => {
    const out = [];
    const code = await tool.main(argv, { env: environment, cwd: scratch, home, account: home, out: l => out.push(l), fetch: stubFetch().fetch, ...io });
    return { code, out: out.join('\n'), lines: out };
  };
  const ask = (io, extra = []) => run(['ask', '--finding', findingFile, '--repo-dir', r.dir, '--base', 'main', ...extra], io);
  const calls = () => (existsSync(join(tools, 'calls.jsonl')) ? readFileSync(join(tools, 'calls.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l)) : []);
  const log = () => (existsSync(logFile) ? readFileSync(logFile, 'utf8').trim().split('\n').map(l => JSON.parse(l)) : []);
  return { home, claude, scratch, tools, repo: r, run, ask, calls, log, logFile, findingFile };
}

const JEV = Object.freeze({ model: 'jev', config: Object.freeze({ jev_repos: ['example/listed'] }) });
const KEY = 'tsk_fixture-key-0123456789';

// ------------------------------------------------------------ claim 1: the draft

// PACT-128 C1
test('draft: the classes under the heading and each out-of-scope paragraph outside it, fences skipped', () => {
  const long = 'long_'.repeat(12).slice(0, 48);
  assert.deepEqual(coverage.draftEntries(MODEL_MD), {
    entries: {
      text_steers_a_session: 'Text steers a session. Any text can move it, gh posts included. A second paragraph of it.',
      a_zero_width_hyphen_ated_class: 'A zero-width, hyphen-ated class. Words.',
      [long]: `${'long '.repeat(12)}name. Cut.`,
      out_of_scope_1: OUT_1,
      out_of_scope_2: OUT_2,
    },
    scope: { out_1: OUT_1, out_2: OUT_2 },
  });
  const risks = lines('# T', '', '### Accepted Risks', '', '- **Posts are public.** They are.', '');
  assert.deepEqual(coverage.draftEntries(risks), { entries: { posts_are_public: 'Posts are public. They are.' }, scope: {} });
  // A heading line holding a line or paragraph separator, which a regex dot skips, reads in time that grows with its length.
  const started = process.hrtime.bigint();
  for (const sep of [String.fromCodePoint(0x2028), String.fromCodePoint(0x2029)]) {
    assert.deepEqual(coverage.draftEntries(lines(`#${' '.repeat(3000)}${sep}x${sep}x`, '', risks)).entries, { posts_are_public: 'Posts are public. They are.' });
  }
  // Nor may a line of plain spaces cost the square of its length.
  const pad = ' '.repeat(80_000);
  for (const line of [`# a${pad}b`, `# a${pad}#${pad}!`]) {
    assert.deepEqual(coverage.draftEntries(lines(line, '', risks)).entries, { posts_are_public: 'Posts are public. They are.' });
  }
  assert.ok(process.hrtime.bigint() - started < 2_000_000_000n, 'a crafted heading line does not stall the draft');
  // A long line is still a heading, as the page renders it.
  const padded = lines(`### Accepted risks${' '.repeat(1200)}#`, '', '- **Posts are public.** They are.', '');
  assert.deepEqual(coverage.draftEntries(padded).entries, { posts_are_public: 'Posts are public. They are.' });
});

// PACT-128 C1
test('draft: a bullet with no bold lead, and two entries with one id, are refused', () => {
  const under = (...bullets) => lines('## Accepted risks', '', ...bullets, '');
  for (const md of [under('- Plain words.'), under('- **Same.** One.', '- **same** Two.'), lines(under('- **Out of scope 1.** x'), '## Scope', '', 'That is out of scope.')]) {
    assert.throws(() => coverage.draftEntries(md), e => e.word === 'coverage/draft', md);
  }
});

// ------------------------------------------------------------ claim 2: the entries check

{
  const base = () => structuredClone({ ...ENTRIES, from: { text_steers: 'text_steers_a_session' } });
  const many = n => Object.fromEntries(Array.from({ length: n }, (_, i) => [`e${i}`, 'x']));
  const rows = [
    ['unknown key', e => (e.extra = 1)],
    ['wrong version', e => (e.v = 2)],
    ['source too long', e => (e.source = 'x'.repeat(201))],
    ['bad id', e => (e.entries['Bad-Id'] = 'x')],
    ['id too long', e => (e.entries['a'.repeat(49)] = 'x')],
    ['no entry', e => ((e.entries = {}), delete e.from)],
    ['65 entries', e => ((e.entries = many(65)), delete e.from)],
    ['65 scope paragraphs', e => (e.scope = many(65))],
    ['empty text', e => (e.entries.text_steers = '')],
    ['4,001 characters', e => (e.scope.out_cloud = 'x'.repeat(4001))],
    ['text not a string', e => (e.entries.text_steers = 5)],
    ['entries not a map', e => ((e.entries = ['x']), delete e.from)],
    ['from key unknown', e => (e.from.nowhere = 'text_steers_a_session')],
    ['from key is a draft id', e => (e.from.out_cloud = 'text_steers')],
    ['from value not a string', e => (e.from.text_steers = 1)],
  ];
  // PACT-128 C2
  test('entries check: the base, and the largest file it allows, pass', () => {
    assert.ok(coverage.checkEntries(base()));
    const full = { v: 1, source: 'x'.repeat(200), entries: { ...many(63), ['__proto__x']: 'x'.repeat(4000) }, scope: many(64) };
    assert.ok(coverage.checkEntries(full));
    assert.ok(coverage.checkEntries(JSON.parse('{"v":1,"source":"s","entries":{"__proto__":"x"},"scope":{}}')), 'an id of __proto__ is an ordinary key');
  });
  // PACT-128 C2
  for (const [name, plant] of rows) {
    test(`entries check refuses: ${name}`, () => {
      const doc = base();
      plant(doc);
      assert.throws(() => coverage.checkEntries(doc), e => e.word === 'coverage/entries');
    });
  }
}

// ------------------------------------------------------------ claim 3: which file

// PACT-128 C3
test('which file: the reviewed file at the base, else the draft from the model at the base, else no threat model', async t => {
  const reviewed = await world(t, { files: { ...WITH_ENTRIES, 'docs/threat-model.md': MODEL_MD } });
  const a = stubFetch();
  assert.equal((await reviewed.ask({ fetch: a.fetch })).code, 0);
  assert.deepEqual(a.sent[0].body.state.entries, ENTRIES.entries);
  assert.equal(reviewed.log()[0].source, `docs/threat-entries.json@${reviewed.repo.head}`);

  const drafted = await world(t, { files: { 'docs/threat-model.md': MODEL_MD } });
  // A file only in the working tree is not at the base.
  writeFileSync(join(drafted.repo.dir, 'docs', 'threat-entries.json'), JSON.stringify(ENTRIES));
  const b = stubFetch();
  assert.equal((await drafted.ask({ fetch: b.fetch })).code, 0);
  assert.deepEqual(b.sent[0].body.state.entries, coverage.draftEntries(MODEL_MD).entries);
  assert.equal(drafted.log()[0].source, `docs/threat-model.md@${drafted.repo.head}`);

  const neither = await world(t, { files: {} });
  mkdirSync(join(neither.repo.dir, 'docs'), { recursive: true });
  writeFileSync(join(neither.repo.dir, 'docs', 'threat-model.md'), MODEL_MD);
  const c = stubFetch();
  const r = await neither.ask({ fetch: c.fetch });
  assert.deepEqual([r.code, r.lines], [0, ['> Coverage hint: no threat model.', 'RESULT: pass']]);
  assert.equal(c.sent.length, 0);
});

// PACT-128 C3
test('which file: a base like an option, a missing ref and a folder that is no repo are refused, and git gets no key', async t => {
  const w = await world(t, { env: { TYPESAFE_API_KEY: KEY } });
  const plain = tempDir(t, 'pact-coverage-plain-');
  for (const [dir, base] of [[w.repo.dir, '-x'], [w.repo.dir, 'no-such-ref'], [w.repo.dir, 'docs'], [plain, 'main']]) {
    const f = stubFetch();
    const r = await w.run(['ask', '--finding', w.findingFile, '--repo-dir', dir, '--base', base], { fetch: f.fetch });
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /^REFUSED coverage\/git: [^\n]*\nRESULT: refused coverage\/git$/, `${base}: ${r.out}`);
    assert.equal(f.sent.length, 0);
  }
  const calls = [];
  const spawn = (file, args, opts) => (calls.push({ file, args, opts }), spawnSync(file, args, opts));
  await w.ask({ spawn });
  const git = calls.filter(c => /git(\.exe)?$/i.test(c.file));
  assert.ok(git.length >= 3, String(git.length));
  for (const c of git) {
    assert.deepEqual(c.args.slice(0, 4), ['-C', w.repo.dir, '-c', 'core.fsmonitor=false']);
    assert.ok(['cat-file', 'rev-parse', 'config'].includes(c.args[4]), c.args.join(' '));
    assert.ok(!Object.keys(c.opts.env).some(k => k.toUpperCase() === 'TYPESAFE_API_KEY'));
    assert.deepEqual([c.opts.env.GIT_NO_LAZY_FETCH, c.opts.env.GIT_ALLOW_PROTOCOL, c.opts.cwd], ['1', 'none', w.scratch]);
  }
});

// ------------------------------------------------------------ claim 4: the requests

const q1 = x => ({
  type: 'noul',
  instructions: `Does \`entries.${x}\` name the kind of step the attacker takes in \`finding.text\`?`,
  criteria: {
    true: `\`entries.${x}\` describes this kind of step itself, for example "text a session reads moves it" for a path where a planted issue comment makes a session run a command.`,
    false: `\`entries.${x}\` is about a different kind of step, for example a path that starts with a stolen token, checked against an entry about text steering a session.`,
  },
});
const q2 = x => ({
  type: 'noul',
  instructions: `Does \`entries.${x}\` accept the harm described in \`finding.text\`, in the place it happens?`,
  criteria: {
    true: `\`entries.${x}\` names this kind of harm and where it happens, for example an entry accepting that a secret can reach a public post, for a finding where a secret reaches a public post.`,
    false: `\`entries.${x}\` is about a different harm or a different place, for example an entry about programs on the local machine, for a finding where a secret leaks into a public post.`,
  },
});
const scoped = p => ({
  type: 'noul',
  instructions: `Does what \`finding.text\` describes happen inside what \`scope.${p}\` lists?`,
  criteria: {
    true: `The harm in \`finding.text\` happens wholly within something \`scope.${p}\` names, for example a program already running on the owner's machine changes a file there, checked against a scope that puts the machine's programs out of scope.`,
    false: `The harm in \`finding.text\` happens somewhere \`scope.${p}\` does not name, for example a secret posted to a public issue, checked against a scope that puts only the local machine out of scope.`,
  },
});

// PACT-128 C4
test('requests: three, in order, with the fixed questions word for word; two with no scope paragraph', async t => {
  const w = await world(t, { finding: '\n  Headline  \r\n\r\n  The evidence,\r\non two lines.  \n\n' });
  const f = stubFetch();
  assert.equal((await w.ask({ fetch: f.fetch })).code, 0);
  const finding = { text: 'Headline\nThe evidence,\non two lines.' };
  const ids = Object.keys(ENTRIES.entries);
  assert.deepEqual(f.sent.map(s => s.body), [
    { state: { finding, entries: ENTRIES.entries }, questions: Object.fromEntries(ids.map(x => [x, q1(x)])) },
    { state: { finding, entries: ENTRIES.entries }, questions: Object.fromEntries(ids.map(x => [x, q2(x)])) },
    { state: { finding, scope: ENTRIES.scope }, questions: { out_cloud: scoped('out_cloud') } },
  ]);
  const none = await world(t, { files: { 'docs/threat-entries.json': JSON.stringify({ ...ENTRIES, scope: {} }) } });
  const g = stubFetch();
  assert.equal((await none.ask({ fetch: g.fetch })).code, 0);
  assert.equal(g.sent.length, 2);
});

// PACT-128 C4
test('requests: after the first that fails, none more; an empty or over-long finding sends none', async t => {
  const w = await world(t);
  for (const at of [0, 1, 2]) {
    const f = stubFetch((req, n) => (n === at ? json('{}', 500) : answered(() => 0.1)(req)));
    assert.equal((await w.ask({ fetch: f.fetch })).code, 1);
    assert.equal(f.sent.length, at + 1);
  }
  for (const finding of [' \r\n\t\n', `h\n${'x'.repeat(7999)}`]) {
    writeFileSync(w.findingFile, finding);
    const f = stubFetch();
    assert.match((await w.ask({ fetch: f.fetch })).out, /^REFUSED coverage\/finding: /);
    assert.equal(f.sent.length, 0);
  }
  writeFileSync(w.findingFile, `h\n${'x'.repeat(7998)}`);
  assert.equal((await w.ask()).code, 0, 'a finding of 8,000 characters passes');
});

// ------------------------------------------------------------ claims 5 and 6: the rule and the hint line

const doc = (entries, scope = []) => ({
  v: 1,
  source: 's',
  entries: Object.fromEntries(entries.map(id => [id, 'x'])),
  scope: Object.fromEntries(scope.map(id => [id, 'x'])),
});
const judged = (entries, scope = {}) =>
  coverage.judge(doc(Object.keys(entries), Object.keys(scope)), {
    q1: Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, v[0]])),
    q2: Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, v[1]])),
    scope,
  });

// PACT-128 C5
test('rule: the highest of each entry\'s lower answer and each scope answer, in bands at 0.5 and 0.75', () => {
  const rows = [
    [[0.99, 0.499999], undefined, 0.499999, 'no entry found'],
    [[0.5, 0.9], undefined, 0.5, 'unsure'],
    [[0.9, 0.500001], undefined, 0.500001, 'unsure'],
    [[0.75, 0.75], undefined, 0.75, 'unsure'],
    [[0.749999, 1], undefined, 0.749999, 'unsure'],
    [[0.750001, 0.8], undefined, 0.750001, 'likely covered'],
    [[1, 0], 0.75, 0.75, 'unsure'],
    [[1, 0], 0.9, 0.9, 'likely covered'],
    [[0.6, 0.6], 0.2, 0.6, 'unsure'],
  ];
  for (const [pair, scope, deciding, state] of rows) {
    const got = judged({ a: pair }, scope === undefined ? {} : { out_a: scope });
    assert.deepEqual([got.deciding, got.state], [deciding, state], `${pair} ${scope}`);
  }
});

// PACT-128 C5
test('rule: the names that decided, highest first, at most three, a scope paragraph named by its entry twin', () => {
  const likely = judged({ a: [0.8, 0.9], b: [0.99, 0.99], c: [0.85, 0.86], d: [0.78, 0.79], e: [0.6, 0.6] }, { out_x: 0.95, out_of_scope_y: 0.1 });
  assert.deepEqual(likely.named, ['b', 'out_of_scope_x', 'c']);
  assert.deepEqual(likely.covers, ['b', 'out_of_scope_x', 'c', 'a', 'd']);
  assert.deepEqual(likely.unsure, ['e']);
  const unsure = judged({ a: [0.55, 0.9], b: [0.7, 0.7], c: [0.1, 0.9] }, { out_of_scope_y: 0.65, other: 0.6 });
  assert.deepEqual(unsure.named, ['b', 'out_of_scope_y', 'other']);
  // A paragraph and its twin entry are one name, at the higher score.
  const twins = judged({ out_of_scope_1: [0.8, 0.8], z: [0.85, 0.85] }, { out_1: 0.9 });
  assert.deepEqual(twins.named, ['out_of_scope_1', 'z']);
  assert.deepEqual(judged({ a: [0.1, 0.1] }).named, []);
});

// PACT-128 C6
test('hint line: each state\'s fixed form, with no number but what a name holds', async t => {
  const head = '> Coverage hint (clef-flash, not a ruling; a failed control is never covered): ';
  const w = await world(t, { files: { 'docs/threat-entries.json': JSON.stringify(doc(['first', 'second', 'third'], ['out_cloud'])) } });
  const rows = [
    [id => ({ first: 0.9, second: 0.95, third: 0.1, out_cloud: 0.2 })[id], `${head}likely covered by \`entry second\`, \`entry first\`.`, 'likely covered'],
    [id => ({ first: 0.6, second: 0.1, third: 0.1, out_cloud: 0.7 })[id], `${head}unsure: \`entry out_of_scope_cloud\`, \`entry first\`.`, 'unsure'],
    [() => 0.2, `${head}no entry found.`, 'no entry found'],
  ];
  for (const [score, line, state] of rows) {
    const r = await w.ask({ fetch: stubFetch(answered(score)).fetch });
    assert.deepEqual([r.code, r.lines.length], [0, 3], r.out);
    assert.equal(r.lines[1], line);
    assert.doesNotMatch(r.lines[1], /[0-9]/);
    assert.equal(r.lines[2], 'RESULT: pass');
    const j = JSON.parse(r.lines[0]);
    assert.deepEqual(Object.keys(j), ['backend', 'model', 'state', 'deciding', 'covers', 'unsure', 'scope', 'top', 'repo']);
    assert.deepEqual([j.backend, j.model, j.state, j.repo, j.scope.from], ['clef-flash', 'eef2968c', state, 'example/listed', 'out_cloud']);
    assert.equal(j.top.length, 3);
    assert.deepEqual(Object.keys(j.top[0]), ['id', 'q1', 'q2']);
  }
});

// ------------------------------------------------------------ claim 7: the answer check

const CANARY = 'CANARY-BODY';
const good = req => Object.fromEntries(Object.keys(req.body.questions).map(id => [id, { noul: 0.9 }]));
const withFirst = (req, value) => {
  const a = good(req);
  const id = Object.keys(a)[0];
  if (value === undefined) delete a[id];
  else a[id] = value;
  return a;
};
const REPLIES = [
  ['missing id', req => withFirst(req, undefined), 'answer'],
  ['extra id', req => ({ ...good(req), [CANARY]: { noul: 0.1 } }), 'answer'],
  ['above 1', req => withFirst(req, { noul: 1.01 }), 'answer'],
  ['below 0', req => withFirst(req, { noul: -0.01 }), 'answer'],
  ['NaN', req => JSON.stringify(withFirst(req, { noul: 7 })).replace('7', 'NaN'), 'answer'],
  ['infinite', req => JSON.stringify(withFirst(req, { noul: 7 })).replace('7', '1e999'), 'answer'],
  ['a string', req => withFirst(req, { noul: '0.5' }), 'answer'],
  ['no noul', req => withFirst(req, { score: 0.5 }), 'answer'],
  ['not an object', () => [CANARY], 'answer'],
  ['not JSON', () => CANARY, 'answer'],
];

// PACT-128 C7
test('answer check: anything but one number from 0 to 1 for each id sent makes the hint unavailable, with nothing of the body', async t => {
  for (const [backend, choice] of [['clef', {}], ['jev', JEV]]) {
    const w = await world(t, { ...choice, env: { TYPESAFE_API_KEY: KEY } });
    const shaped = body => (backend === 'jev' && typeof body !== 'string' ? { model: 'jev-1', usage: {}, answers: body } : body);
    const rows = [
      ...REPLIES.map(([name, body, word]) => [name, req => json(shaped(body(req))), word]),
      ['status 500', () => json(CANARY, 500), 'status-500'],
      ['status 201', req => json(shaped(good(req)), 201), 'status-201'],
      ['a redirect', () => new Response(null, { status: 302, headers: { location: `https://example.com/${CANARY}` } }), 'status-302'],
      ['a network error', () => Promise.reject(new TypeError(`fetch failed ${CANARY} ${KEY}`)), 'network'],
      ['a body that breaks off', () => new Response(new ReadableStream({ start: c => c.error(new Error(CANARY)) })), 'network'],
      ['a timeout', (req, n, init) => new Promise((_, no) => init.signal.addEventListener('abort', () => no(init.signal.reason))), 'timeout'],
      ...(backend === 'jev'
        ? [
          ['a model off the pattern', req => json({ model: `Jev ${CANARY}`, usage: {}, answers: good(req) }), 'answer'],
          ['no model', req => json({ usage: {}, answers: good(req) }), 'answer'],
          ['no answers key', req => json(good(req)), 'answer'],
        ]
        : []),
    ];
    for (const [name, reply, word] of rows) {
      const f = stubFetch(reply);
      const r = await w.ask({ fetch: f.fetch, timeoutMs: 50 });
      assert.deepEqual([r.code, r.lines.slice(-2)], [1, [`> Coverage hint: unavailable (${word}).`, `RESULT: fail ${word}`]], `${backend}, ${name}: ${r.out}`);
      assert.ok(!r.out.includes(CANARY) && !r.out.includes(KEY), `${backend}, ${name}: ${r.out}`);
      assert.equal(f.sent[0].init.redirect, 'manual', 'no redirect is followed');
    }
    const ok = await w.ask({ fetch: stubFetch(req => json(shaped(good(req)))).fetch });
    assert.equal(ok.code, 0, ok.out);
  }
});

// ------------------------------------------------------------ claim 8: the choice file and the repo

const FULL = Object.freeze({ ...READY, status: READY.status.replace('variant: flash', 'variant: full') });

// PACT-128 C8
test('choice: with no decision model named, the local clef answers as it is set up; a named variant answers only as itself', async t => {
  for (const [model, clef, backend] of [
    [undefined, READY, 'clef-flash'],
    [undefined, FULL, 'clef-full'],
    ['clef-flash', READY, 'clef-flash'],
    ['clef-full', FULL, 'clef-full'],
  ]) {
    const w = await world(t, { model, clef });
    const f = stubFetch();
    const r = await w.ask({ fetch: f.fetch });
    assert.equal(r.code, 0, r.out);
    assert.ok(r.lines[1].startsWith(`> Coverage hint (${backend}, `), r.out);
    assert.ok(f.sent.every(s => s.url === 'http://127.0.0.1:4567/v1/systemone'), f.sent[0].url);
    assert.deepEqual((await w.run(['status'])).lines.slice(0, 2), [`backend: ${model ?? 'clef'}`, 'ready: yes']);
  }
  for (const [model, clef] of [['clef-full', READY], ['clef-flash', FULL]]) {
    const w = await world(t, { model, clef });
    const f = stubFetch();
    const r = await w.ask({ fetch: f.fetch });
    assert.deepEqual([r.code, r.lines.at(-1), f.sent.length], [1, 'RESULT: fail clef-variant', 0], r.out);
    assert.deepEqual((await w.run(['status'])).lines.slice(0, 2), [`backend: ${model}`, 'ready: no (clef-variant)']);
  }
});

// PACT-128 C8
test('choice: any other model, a config.json that is not one object, and a bad coverage.json are refused', async t => {
  const rows = [
    { pact: '{' },
    { pact: '[]' },
    { model: 'clef' },
    { model: null },
    { model: ['jev'] },
    { config: '{' },
    { config: '[]' },
    { config: { backend: 'jev' } },
    { config: { jev_repos: 'example/listed' } },
    { config: { jev_repos: ['no-slash'] } },
    { config: { jev_repos: [1] } },
  ];
  for (const choice of rows) {
    const w = await world(t, choice);
    const f = stubFetch();
    const r = await w.ask({ fetch: f.fetch });
    assert.match(r.out, /^REFUSED coverage\/config: /, JSON.stringify(choice));
    assert.deepEqual([r.code, f.sent.length, w.calls().length], [2, 0, 0], JSON.stringify(choice));
  }
});

// PACT-128 C8
test('jev sends only for a listed repo, read from the folder\'s origin; no option names another', async t => {
  const env = { TYPESAFE_API_KEY: KEY };
  for (const origin of ['https://github.com/example/listed.git', 'https://github.com/example/listed', 'git@github.com:example/listed.git']) {
    const w = await world(t, { ...JEV, origin, env });
    const f = stubFetch();
    assert.equal((await w.ask({ fetch: f.fetch })).code, 0, origin);
    assert.ok(f.sent.length === 3 && f.sent.every(s => s.url === 'https://api.typesafe.ai/v1/systemone'));
    assert.equal(f.sent[0].body.model, 'jev-latest');
    assert.deepEqual(Object.keys(f.sent[0].body), ['model', 'state', 'questions']);
    assert.ok(!JSON.stringify(f.sent.map(s => s.body)).includes('threat-model.md'), 'the source is never sent');
    assert.equal(w.calls().length, 0, 'jev starts no local server');
  }
  for (const origin of ['https://github.com/example/other.git', null, 'https://gitlab.com/example/listed.git', 'https://github.com.example.com/example/listed.git', 'ssh://git@github.com/example/listed.git', 'https://github.com/example/listed/extra']) {
    const w = await world(t, { ...JEV, origin, env });
    const f = stubFetch();
    const r = await w.ask({ fetch: f.fetch });
    assert.match(r.out, /^REFUSED coverage\/not-listed: /, String(origin));
    assert.deepEqual([r.code, f.sent.length, w.calls().length], [2, 0, 0], 'it falls back to no other backend');
  }
  const w = await world(t, { ...JEV, env });
  const r = await w.ask({}, ['--repo', 'example/listed']);
  assert.match(r.out, /^REFUSED coverage\/usage: /);
});

// ------------------------------------------------------------ claim 9: the key and the environment

// PACT-128 C9
test('jev: no key, certificate checks off and a cloud session are each refused before any request', async t => {
  for (const [env, word] of [
    [{}, 'coverage/key'],
    [{ TYPESAFE_API_KEY: '' }, 'coverage/key'],
    [{ TYPESAFE_API_KEY: KEY, NODE_TLS_REJECT_UNAUTHORIZED: '0' }, 'coverage/tls'],
    [{ TYPESAFE_API_KEY: KEY, CLAUDE_CODE_REMOTE: 'true' }, 'coverage/cloud'],
  ]) {
    const w = await world(t, { ...JEV, env });
    const f = stubFetch();
    const r = await w.ask({ fetch: f.fetch });
    assert.match(r.out, new RegExp(`^REFUSED ${word}: [^\\n]*\\nRESULT: refused ${word}$`), r.out);
    assert.deepEqual([r.code, f.sent.length], [2, 0]);
  }
});

// PACT-128 C9
test('the key travels only in its header, and shows in no output or log line', async t => {
  const w = await world(t, { ...JEV, env: { TYPESAFE_API_KEY: KEY } });
  const f = stubFetch();
  const out = [(await w.ask({ fetch: f.fetch })).out];
  for (const s of f.sent) {
    assert.equal(s.init.headers.Authorization, `Bearer ${KEY}`);
    assert.equal(s.init.headers['Content-Type'], 'application/json');
    assert.equal(s.init.method, 'POST');
    assert.ok(!s.url.includes(KEY) && !s.init.body.includes(KEY));
  }
  out.push((await w.ask({ fetch: stubFetch(() => json(`bad key ${KEY}`, 401)).fetch })).out);
  out.push((await w.ask({ fetch: async () => { throw new Error(`cannot send Bearer ${KEY}`); } })).out);
  const status = await w.run(['status']);
  assert.deepEqual(status.lines, ['backend: jev', 'ready: yes', 'key: set', 'repo: example/listed', 'log: 3 lines', 'RESULT: pass']);
  out.push(status.out);
  const bare = await world(t, { ...JEV });
  assert.ok((await bare.run(['status'])).lines.includes('key: missing'));
  assert.ok(!`${out.join('\n')}${readFileSync(w.logFile, 'utf8')}`.includes(KEY));
});

// ------------------------------------------------------------ claim 10: the scan

const cp = String.fromCodePoint;
// As written, no encoding: each row is one text, and both scans must agree on it.
const SECRET_ENV = Object.freeze({ FIXTURE_API_TOKEN: 'fixture-secret-value-1', MY_PASSWD: 'hunter2hunter2', SHORT_KEY: 'abc', PWD: 'not-a-secret-folder', PLAIN_NAME: 'just-a-plain-value', DB_CREDENTIALS: 'credential-value-2' });
const TABLE = [
  ['plain text', false],
  ['holds fixture-secret-value-1 here', true],
  ['hunter2hunter2', true],
  ['x credential-value-2 y', true],
  ['abc is short', false],
  ['not-a-secret-folder', false],
  ['just-a-plain-value', false],
  ['FIXTURE-SECRET-VALUE-1 in capitals', false],
  [`a${cp(0x200b)}b`, true],
  [`a${cp(0x202e)}b`, true],
  [`a${cp(0x2066)}b`, true],
  [`a${cp(0x2060)}b`, true],
  [`a${cp(0xfe00)}b`, true],
  [`a${cp(0xfeff)}b`, true],
  [`a${cp(0xe0041)}b`, true],
  [`a${cp(0xe0100)}b`, true],
  [`joiners ${cp(0x200d)}${cp(0xfe0f)} stay`, false],
  [`a flag ${cp(0x1f3f4)}${cp(0xe0067)}${cp(0xe0062)}${cp(0xe007f)} stays`, false],
];

// PACT-128 C10
test('scan: the tool and the poster give the same verdict on one table of as-written text', () => {
  assert.deepEqual(coverage.envSecrets(SECRET_ENV), envSecrets(SECRET_ENV));
  for (const [text, hit] of TABLE) {
    assert.equal(posterScan([{ field: 'body', text }], { env: SECRET_ENV }).length > 0, hit, `the poster: ${JSON.stringify(text)}`);
    assert.equal(coverage.secretIn([text], SECRET_ENV) !== null, hit, `coverage: ${JSON.stringify(text)}`);
  }
});

// PACT-128 C10
test('scan: jev refuses a secret, a hidden character, the home folder and the user name, never printing what matched', async t => {
  const homeDir = 'C:\\Users\\Fixture Person';
  const user = 'fixtureuser';
  const env = { TYPESAFE_API_KEY: KEY, FIXTURE_API_TOKEN: 'fixture-secret-value-1' };
  const rows = [
    ['t\nfixture-secret-value-1', 'coverage/secret', /FIXTURE_API_TOKEN/],
    [`t\n${KEY}`, 'coverage/secret', /TYPESAFE_API_KEY/],
    [`t\na${cp(0x200b)}b`, 'coverage/secret', /U\+200B/],
    [`t\nat C:\\USERS\\fixture person\\x`, 'coverage/personal', /home folder/],
    ['t\nat c:/users/Fixture Person/x', 'coverage/personal', /home folder/],
    ['t\nsigned FixtureUser', 'coverage/personal', /user name/],
  ];
  const personal = { homeDir, userName: user };
  for (const [finding, word, says] of rows) {
    const inEntry = JSON.stringify({ ...ENTRIES, entries: { text_steers: finding } });
    for (const options of [{ finding }, { files: { 'docs/threat-entries.json': inEntry } }]) {
      const w = await world(t, { ...JEV, env, ...options });
      const f = stubFetch();
      const r = await w.ask({ fetch: f.fetch, ...personal });
      assert.match(r.out, new RegExp(`^REFUSED ${word}: `), r.out);
      assert.match(r.out, says);
      assert.deepEqual([r.code, f.sent.length], [2, 0]);
      for (const secret of ['fixture-secret-value-1', KEY, cp(0x200b), 'fixture person', user]) assert.ok(!r.out.toLowerCase().includes(secret.toLowerCase()), `${word} printed ${JSON.stringify(secret)}`);
    }
  }
  const w = await world(t, { ...JEV, env });
  assert.equal((await w.ask({ ...personal, userName: 'a' })).code, 0, 'a user name under 3 characters is not matched');
  writeFileSync(w.findingFile, `${cp(0xfeff)}headline\nevidence`);
  assert.equal((await w.ask(personal)).code, 0, "a file's byte-order mark is not a hidden character in the finding");
  const local = await world(t, { env, finding: 't\nfixture-secret-value-1 signed fixtureuser' });
  const f = stubFetch();
  assert.equal((await local.ask({ fetch: f.fetch, ...personal })).code, 0);
  assert.equal(f.sent[0].body.state.finding.text, 't\nfixture-secret-value-1 signed fixtureuser', 'clef takes it: nothing leaves the machine');
});

// ------------------------------------------------------------ claim 11: clef, and the size cap

// PACT-128 C11
test('clef: ensure then status, by this node, from the scratch folder; the variant names the backend', async t => {
  const w = await world(t, { env: { TYPESAFE_API_KEY: KEY } });
  const f = stubFetch();
  const r = await w.ask({ fetch: f.fetch });
  assert.equal(r.code, 0, r.out);
  const calls = w.calls();
  assert.deepEqual(calls.map(c => c.argv), [['ensure', '--wait', '60'], ['status']]);
  await w.run(['status']);
  assert.equal(w.calls().length, 3);
  for (const c of w.calls()) assert.deepEqual([c.execPath, c.key], [process.execPath, false]);
  for (const c of w.calls()) assert.equal(realpathSync.native(c.cwd), realpathSync.native(w.scratch));
  assert.deepEqual(Object.keys(f.sent[0].body), ['state', 'questions']);
  const full = await world(t, { clef: { ...READY, status: READY.status.replace('variant: flash', 'variant: full') } });
  assert.match((await full.ask()).out, /^> Coverage hint \(clef-full, /m);
});

// PACT-128 C11
test('clef: not ready, missing, an unknown variant or a url off this machine is unavailable, with no request', async t => {
  const rows = [
    ['starting', { ...READY, ensure: { url: 'http://127.0.0.1:4567', state: 'starting' } }, 'clef-starting'],
    ['not set up', { ...READY, ensure: { state: 'not-set-up', reason: 'missing' } }, 'clef-not-set-up'],
    ['failed', { ...READY, ensure: { state: 'failed', reason: 'exit' } }, 'clef-failed'],
    ['no clef', null, 'clef-missing'],
    ['an unknown state', { ...READY, ensure: { state: 'CANARY-BODY' } }, 'clef-failed'],
    ['a url elsewhere', { ...READY, ensure: { url: 'http://example.com:80', state: 'ready' } }, 'clef-failed'],
    ['a url with more', { ...READY, ensure: { url: 'http://127.0.0.1:4567@example.com', state: 'ready' } }, 'clef-failed'],
    ['no variant', { ...READY, status: 'RESULT: pass' }, 'clef-variant'],
  ];
  for (const [name, clef, word] of rows) {
    const w = await world(t, { clef });
    const f = stubFetch();
    const r = await w.ask({ fetch: f.fetch });
    assert.deepEqual([r.code, r.lines], [1, [`> Coverage hint: unavailable (${word}).`, `RESULT: fail ${word}`]], `${name}: ${r.out}`);
    assert.equal(f.sent.length, 0, name);
  }
});

// PACT-128 C11
test('size: state and questions past 30,000 characters are refused before any request, on clef and on jev', async t => {
  const sized = async (choice, chars) => {
    const entries = Object.fromEntries(Array.from({ length: 9 },(_, i) => [`e${i}`, 'x'.repeat(i === 0 ? chars : 3000)]));
    const w = await world(t, { ...choice, env: { TYPESAFE_API_KEY: KEY }, files: { 'docs/threat-entries.json': JSON.stringify({ v: 1, source: 's', entries, scope: {} }) } });
    const f = stubFetch();
    const r = await w.ask({ fetch: f.fetch });
    return { r, f, w };
  };
  // The length of the largest request with a one-character first entry sets the edge.
  const probe = await sized({}, 1);
  const length = Math.max(...probe.f.sent.map(s => JSON.stringify(s.body.state).length + JSON.stringify(s.body.questions).length));
  const edge = 30_000 - length + 1;
  assert.ok(edge > 0 && edge < 3999, String(length));
  for (const choice of [{}, JEV]) {
    const at = await sized(choice, edge);
    assert.equal(at.r.code, 0, at.r.out);
    const over = await sized(choice, edge + 1);
    assert.match(over.r.out, /^REFUSED coverage\/size: /);
    assert.deepEqual([over.r.code, over.f.sent.length, over.w.calls().length], [2, 0, 0]);
  }
});

// ------------------------------------------------------------ claim 12: the log

// PACT-128 C12
test('log: one line for a pass, a refusal and an unavailable run, with the fields and none of the finding', async t => {
  const w = await world(t, { ...JEV, env: { TYPESAFE_API_KEY: KEY } });
  const usage = { input_tokens: 120, note: 'CANARY-USAGE', nested: { n: 1 }, 'Bad Key': 3, output_tokens: 12 };
  await w.ask({ fetch: stubFetch(answered(() => 0.9, { usage })).fetch }, ['--ref', 'PACT-128/test-1/F2']);
  await w.ask({ fetch: stubFetch((req, n) => (n === 1 ? json('{}', 429) : answered(() => 0.4, { usage: { input_tokens: 5 } })(req))).fetch });
  writeFileSync(w.findingFile, 't\nfixtureuser');
  await w.ask({ userName: 'fixtureuser' });
  const [pass, unavailable, refused] = w.log();
  assert.equal(w.log().length, 3);
  assert.deepEqual(Object.keys(pass), ['time', 'ref', 'finding', 'repo', 'source', 'backend', 'model', 'usage', 'entries', 'scope', 'state', 'reason']);
  assert.ok(!Number.isNaN(Date.parse(pass.time)));
  assert.deepEqual(
    { ...pass, time: 0 },
    {
      time: 0, ref: 'PACT-128/test-1/F2', finding: sha(FINDING), repo: 'example/listed', source: ENTRIES.source.replace(/.*/, `docs/threat-entries.json@${w.repo.head}`), backend: 'jev', model: 'jev-1.14.0',
      usage: [{ input_tokens: 120, output_tokens: 12 }, { input_tokens: 120, output_tokens: 12 }, { input_tokens: 120, output_tokens: 12 }],
      entries: { text_steers: { q1: 0.9, q2: 0.9 }, out_of_scope_cloud: { q1: 0.9, q2: 0.9 } }, scope: { out_cloud: 0.9 }, state: 'likely covered', reason: null,
    },
  );
  assert.deepEqual([unavailable.reason, unavailable.state, unavailable.ref, unavailable.entries.text_steers], ['status-429', null, null, { q1: 0.4 }]);
  assert.deepEqual([refused.reason, refused.finding, refused.repo], ['coverage/personal', sha('t\nfixtureuser'), 'example/listed']);
  const text = readFileSync(w.logFile, 'utf8');
  for (const never of ['CANARY-FINDING', 'CANARY-USAGE', 'fixtureuser', ENTRIES.entries.text_steers, KEY]) assert.ok(!text.includes(never), never);
});

// PACT-128 C12
test('log: at 1 MB the file rolls over, replacing the older one', async t => {
  const w = await world(t);
  await w.ask();
  const older = join(w.claude, 'pact-coverage', 'log.1.jsonl');
  writeFileSync(older, 'an older log\n');
  writeFileSync(w.logFile, `${'x'.repeat(1024 * 1024 - 2)}\n`);
  await w.ask();
  assert.equal(readFileSync(older, 'utf8'), 'an older log\n', 'under 1 MB, nothing rolls');
  writeFileSync(w.logFile, `${'x'.repeat(1024 * 1024 - 1)}\n`);
  await w.ask();
  assert.ok(readFileSync(older, 'utf8').startsWith('xxx'));
  assert.equal(w.log().length, 1);
});

// PACT-128 C12: the log's folder is found as clef finds its own, so a cloned project's setting can't move it into the project.
test('log: a Claude home inside the starting folder, or not absolute, is refused and nothing is written', async t => {
  const w = await world(t);
  for (const dir of [join(w.scratch, 'inside'), 'relative/home']) {
    const f = stubFetch();
    const r = await w.ask({ fetch: f.fetch, env: cleanEnv({ CLAUDE_CONFIG_DIR: dir }) });
    assert.match(r.out, /^REFUSED coverage\/home: /, r.out);
    assert.deepEqual([r.code, f.sent.length, existsSync(join(w.scratch, 'inside'))], [2, 0, false]);
  }
});
