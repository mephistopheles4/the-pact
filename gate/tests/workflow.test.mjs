// The commit-time layer's lockdown (#153, S11): the gate workflow reads the
// repo with a read-only token, holds no secret, never runs on
// pull_request_target, pins every action to a full commit SHA, leaves no
// token in the checkout, uploads nothing, and runs the dry run and the full
// tier, install tests included (#303), on the Node floor. Every other workflow file keeps the same lockdown,
// and none may define a job named gate, the required check's name (#166). It
// reads the files' text; it can't see what GitHub does with them, which the
// S15 CI probe records.
//
// The CodeQL workflow (#239, #244) is the one file that may ask for more: it
// uploads code-scanning results, so its one job holds security-events: write.
// It is held to an exact allow-list instead of the common lockdown. Its
// configuration leaves the gate's test files out of the scan, which is safe
// only while nothing outside gate/tests/ loads a file inside it; the premise
// test below checks that.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, posix } from 'node:path';
import { test } from 'node:test';
import { tokens } from './tables.mjs';
import { REPO } from './text.mjs';

const WORKFLOWS = join(REPO, '.github', 'workflows');
const WORKFLOW = join(WORKFLOWS, 'gate.yml');
const CODEQL = join(WORKFLOWS, 'codeql.yml');
const codeOf = src => src.split('\n').filter(l => !/^\s*#/.test(l)).join('\n');

/** Where any workflow file breaks the lockdown every workflow keeps, as plain sentences; empty when it keeps it. */
function commonProblems(src) {
  const code = codeOf(src);
  const out = [];
  if (/pull_request_target|workflow_run/.test(code)) out.push('runs on a trigger that holds secrets or a write token');
  const perms = /^permissions:\n((?:[ \t]+.+\n)+)/m.exec(`${code}\n`);
  if (!perms || perms[1].trim() !== 'contents: read' || (code.match(/^\s*permissions:/gm) ?? []).length !== 1) out.push('asks for more than read access to the contents');
  if (/\bsecrets\.|\$\{\{\s*github\.token|GITHUB_TOKEN/.test(code)) out.push('reads a secret or the token');
  for (const m of code.matchAll(/uses:\s*(\S+)/g)) if (!/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/.test(m[1])) out.push(`uses ${m[1]}, not pinned to a full commit SHA`);
  const checkout = /uses: actions\/checkout@[0-9a-f]{40}[^\n]*\n((?: {8,}.+\n)*)/.exec(`${code}\n`);
  if (/uses: actions\/checkout@/.test(code) && (!checkout || !/persist-credentials: false/.test(checkout[1]))) out.push('leaves the token in the checkout');
  if (/upload-artifact|actions\/cache/.test(code)) out.push('uploads or caches the workspace');
  return out;
}

/** Where the gate workflow breaks its lockdown, as plain sentences; empty when it keeps it. */
function lockdownProblems(src) {
  const code = codeOf(src);
  const out = commonProblems(src);
  if (!/uses: actions\/checkout@/.test(code)) out.push('does not check the repo out');
  if (!/node-version: '24'/.test(code)) out.push('runs another Node than the floor');
  if (!/env -u NODE_OPTIONS node gate\/install\.mjs --claude-home "\$RUNNER_TEMP\/pact-home"/.test(code)) out.push('does not run the install dry run');
  if (!/^ {8}run: env -u NODE_OPTIONS node gate\/tests\/run\.mjs full$/m.test(code)) out.push('does not run the full tier');
  if (!/^ {2}pull_request:\s*$/m.test(code) || !/^ {2}push:\n {4}branches: \[main\]$/m.test(code)) out.push('does not run on every pull request and every push to main');
  return out;
}

const isMap = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** A line with a trailing comment cut, outside quotes. */
function uncommented(line) {
  let quote = null;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (quote) quote = c === quote ? null : quote;
    else if (c === "'" || c === '"') quote = c;
    else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i).trimEnd();
  }
  return line.trimEnd();
}

/**
 * The small YAML a locked-down workflow is written in, as plain values: block
 * maps, block lists, a one-line flow list, quoted and plain scalars (all read
 * as text) and literal block scalars. It throws on anything else, a repeated
 * key included, so the allow-list never reads a shape it can't see.
 */
function readYaml(src) {
  const raw = src.replace(/\r\n/g, '\n').split('\n');
  const rows = [];
  for (let n = 0; n < raw.length; n += 1) {
    const line = uncommented(raw[n]);
    if (line.trim() === '') continue;
    const indent = line.length - line.trimStart().length;
    if (line.slice(0, indent).includes('\t')) throw new Error(`a tab in the indent at line ${n + 1}`);
    const row = { indent, text: line.trim(), at: n + 1 };
    rows.push(row);
    if (/(?:^|:\s|-\s)\|-?$/.test(row.text)) {
      // A literal block scalar: every later line indented past its key, kept as text.
      const keyAt = indent + (/^(?:- )*/.exec(row.text)[0].length);
      const body = [];
      while (n + 1 < raw.length && (raw[n + 1].trim() === '' || raw[n + 1].length - raw[n + 1].trimStart().length > keyAt)) body.push(raw[(n += 1)]);
      while (body.length && body[body.length - 1].trim() === '') body.pop();
      const cut = Math.min(...body.filter(l => l.trim() !== '').map(l => l.length - l.trimStart().length));
      row.block = body.map(l => l.slice(cut)).join('\n') + '\n';
    }
  }
  const scalar = (s, at) => {
    if (/^'.*'$/.test(s)) return s.slice(1, -1).replace(/''/g, "'");
    if (/^".*"$/.test(s) && !s.includes('\\')) return s.slice(1, -1);
    if (/^['"[\]{}&*!|>%@`,]/.test(s) || /^<</.test(s)) throw new Error(`a value the check can't read at line ${at}`);
    return s;
  };
  const value = (s, at) => {
    if (!s.startsWith('[')) return scalar(s, at);
    if (!s.endsWith(']')) throw new Error(`a flow list the check can't read at line ${at}`);
    const inner = s.slice(1, -1).trim();
    return inner === '' ? [] : inner.split(',').map(x => scalar(x.trim(), at));
  };
  let p = 0;
  const KEY = /^([A-Za-z0-9_-]+):(?:\s+(.*))?$/;
  const isItem = row => row.text === '-' || row.text.startsWith('- ');
  const block = indent => (isItem(rows[p]) ? list(indent) : map(indent));
  function map(indent) {
    const out = {};
    while (p < rows.length && rows[p].indent === indent && !isItem(rows[p])) {
      const row = rows[p];
      const m = KEY.exec(row.text);
      if (!m) throw new Error(`line ${row.at} is not a key and a value the check can read`);
      if (Object.hasOwn(out, m[1])) throw new Error(`the key ${m[1]} repeats at line ${row.at}`);
      p += 1;
      const rest = m[2] ?? '';
      if (row.block !== undefined) out[m[1]] = row.block;
      else if (rest !== '') out[m[1]] = value(rest, row.at);
      else if (p < rows.length && rows[p].indent > indent) out[m[1]] = block(rows[p].indent);
      else if (p < rows.length && rows[p].indent === indent && isItem(rows[p])) out[m[1]] = list(indent);
      else out[m[1]] = null;
    }
    return out;
  }
  function list(indent) {
    const out = [];
    while (p < rows.length && rows[p].indent === indent && isItem(rows[p])) {
      const row = rows[p];
      const rest = row.text === '-' ? '' : row.text.slice(2).trimStart();
      if (KEY.test(rest)) {
        // A map that starts on the dash's line: its first key sits two columns in.
        rows[p] = { ...row, indent: indent + 2, text: rest };
        out.push(map(indent + 2));
      } else {
        p += 1;
        if (row.block !== undefined) out.push(row.block);
        else if (rest !== '') out.push(value(rest, row.at));
        else out.push(p < rows.length && rows[p].indent > indent ? block(rows[p].indent) : null);
      }
    }
    return out;
  }
  if (!rows.length) return {};
  if (rows[0].indent !== 0) throw new Error(`line ${rows[0].at} is indented at the top`);
  const doc = map(0);
  if (p < rows.length) throw new Error(`line ${rows[p].at} sits where the check can't place it`);
  return doc;
}

/** Whether YAML text uses an anchor, an alias, a merge key or a flow mapping, outside quotes. */
const yamlFormUsed = text =>
  text
    .split('\n')
    .map(l => uncommented(l).replace(/'[^']*'|"[^"]*"/g, "''"))
    .some(l => /(?:^|:\s+|-\s+|[[,]\s*)[&*][^\s,\]]/.test(l.trim()) || /(?:^|\s|-\s)<<\s*:/.test(l) || /(?:^|:\s|-\s|[[,]\s*)\{/.test(l.trim()));

// Skips a run Dependabot started, and a run on Dependabot's pull request that another account's push started.
const DEPENDABOT_SKIP = "github.actor != 'dependabot[bot]' && github.event.pull_request.user.login != 'dependabot[bot]'";
const SHA = '[0-9a-f]{40}';
const STEPS = [
  ['actions/checkout', ['persist-credentials']],
  ['github/codeql-action/init', ['languages', 'build-mode', 'config']],
  ['github/codeql-action/analyze', ['category']],
];

/**
 * Where the CodeQL workflow breaks its allow-list, as plain sentences; empty
 * when it keeps it. Every level holds exactly the keys #239's S4 names, plus
 * the top-level name and the strategy's fail-fast (ADR 0058), and each value
 * is the one they set. `gateSrc` is gate.yml's text, whose checkout pin this
 * file's must match.
 */
function codeqlProblems(src, gateSrc) {
  const code = codeOf(src);
  const out = [];
  const extras = (where, obj, keys) => {
    if (!isMap(obj)) return out.push(`${where} is not a map`);
    for (const k of Object.keys(obj)) if (!keys.includes(k)) out.push(`${where} holds ${k}, which the allow-list doesn't name`);
    for (const k of keys) if (!Object.hasOwn(obj, k)) out.push(`${where} lacks ${k}`);
  };
  if (/^\s*(?:-\s+)?run:/m.test(code)) out.push('runs a shell command');
  if (/^\s*(?:-\s+)?env:/m.test(code)) out.push('sets environment variables');
  if (/\bsecrets\.|\$\{\{\s*github\.token|GITHUB_TOKEN/.test(code)) out.push('reads a secret or the token');
  if (/upload-artifact|\bcache\b/.test(code)) out.push('uploads or caches the workspace');
  if (yamlFormUsed(code)) out.push('uses a YAML anchor, alias, merge key or flow mapping');
  let w;
  try {
    w = readYaml(code);
  } catch (e) {
    return [...out, `is not in the YAML the check reads: ${e.message}`];
  }

  extras('the file', w, ['name', 'on', 'permissions', 'jobs']);
  if (w.name !== 'codeql') out.push('is not named codeql');
  const on = isMap(w.on) ? w.on : {};
  extras('on', on, ['push', 'pull_request', 'schedule', 'workflow_dispatch']);
  const weekly = Array.isArray(on.schedule) && on.schedule.length === 1 && isMap(on.schedule[0]) && same(Object.keys(on.schedule[0]), ['cron']) && /^\d{1,2} \d{1,2} \* \* [0-6]$/.test(on.schedule[0].cron);
  if (!same(Object.keys(on).sort(), ['pull_request', 'push', 'schedule', 'workflow_dispatch']) || !same(on.push, { branches: ['main'] }) || on.pull_request !== null || !weekly) {
    out.push('runs on other triggers than a push to main, every pull request, a weekly schedule and a manual run');
  }
  if (Object.hasOwn(on, 'workflow_dispatch') && on.workflow_dispatch !== null) out.push('takes inputs on a manual run');
  if (!same(w.permissions, { contents: 'read' })) out.push('asks for more than read access to the contents at the top level');

  if (!isMap(w.jobs) || !same(Object.keys(w.jobs), ['analyze'])) out.push('holds another job than analyze');
  const job = isMap(w.jobs?.analyze) ? w.jobs.analyze : {};
  extras('the job', job, ['if', 'runs-on', 'timeout-minutes', 'permissions', 'strategy', 'steps']);
  if (!same(job.permissions, { contents: 'read', 'security-events': 'write' })) out.push('gives the job other permissions than contents: read and security-events: write');
  if (job.if !== DEPENDABOT_SKIP) out.push("does not skip Dependabot's pull requests");
  if (job['runs-on'] !== 'ubuntu-24.04' || !/^[1-9]\d*$/.test(job['timeout-minutes'] ?? '')) out.push('does not run on ubuntu-24.04 with a time limit');
  extras('the strategy', job.strategy, ['fail-fast', 'matrix']);
  if (isMap(job.strategy) && job.strategy['fail-fast'] !== 'false') out.push('lets one language cancel the other');
  extras('the matrix', job.strategy?.matrix, ['language']);
  if (!same(job.strategy?.matrix?.language, ['actions', 'javascript-typescript'])) out.push('analyses other languages than actions and javascript-typescript');

  const steps = Array.isArray(job.steps) ? job.steps : [];
  const pins = [];
  if (steps.length !== STEPS.length || !steps.every((s, i) => isMap(s) && new RegExp(`^${STEPS[i][0]}@${SHA}$`).test(s.uses ?? ''))) out.push('holds other steps than checkout, CodeQL init and CodeQL analyze');
  STEPS.forEach(([action, inputs], i) => {
    const step = steps[i];
    if (!isMap(step)) return;
    const pin = new RegExp(`^${action}@(${SHA})$`).exec(step.uses ?? '');
    if (!pin) out.push(`step ${i + 1} is not ${action} pinned to a full commit SHA`);
    pins.push(pin?.[1]);
    extras(`step ${i + 1}`, step, ['uses', 'with']);
    extras(`step ${i + 1}'s with`, step.with, inputs);
  });
  const gatePin = new RegExp(`uses: actions/checkout@(${SHA})`).exec(codeOf(gateSrc))?.[1];
  if (pins[0] && pins[0] !== gatePin) out.push('pins checkout to another commit than gate.yml');
  if (pins[1] && pins[2] && pins[1] !== pins[2]) out.push('pins init and analyze to different commits');

  const [checkout, init, analyze] = steps.map(s => (isMap(s?.with) ? s.with : {}));
  if (checkout && checkout['persist-credentials'] !== 'false') out.push('leaves the token in the checkout');
  if (init && (init.languages !== '${{ matrix.language }}' || init['build-mode'] !== 'none')) out.push('does not run init on the matrix language with build-mode none');
  if (init && typeof init.config === 'string') {
    if (yamlFormUsed(init.config)) out.push('uses a YAML anchor, alias, merge key or flow mapping');
    let config;
    try {
      config = readYaml(init.config);
    } catch (e) {
      out.push(`holds a config the check can't read: ${e.message}`);
    }
    if (config) {
      extras('config', config, ['paths-ignore']);
      if (!same(config['paths-ignore'], ['gate/tests/*.test.mjs'])) out.push('leaves other paths out of the scan than gate/tests/*.test.mjs');
    }
  } else if (init) out.push('holds no config for init');
  if (analyze && analyze.category !== '/language:${{ matrix.language }}') out.push("uploads under another category than default setup's");
  return [...new Set(out)];
}

// A file allowed a load the check can't read, with why it can't load a test file.
const UNREAD_LOADS = new Map([['gate/install-run.mjs', "loads a gate module's core from the staged copy, by names the runner holds; the install stages no test file"]]);

/**
 * Where a file outside gate/tests/ loads a file inside it, by a static import
 * or export, a dynamic import() or a require(), with each relative specifier
 * resolved from the file's own folder; or loads by a specifier that is not a
 * string literal (a template with a substitution included), or through
 * createRequire, unless UNREAD_LOADS names the file. It reads the code's
 * tokens, so a comment, a string or a pattern that holds the words is not a
 * load. `files` maps each repo-relative path to its text.
 */
function premiseProblems(files) {
  const out = [];
  for (const [rel, src] of files) {
    if (rel.startsWith('gate/tests/')) continue;
    const toks = tokens(src);
    const unread = () => {
      if (!UNREAD_LOADS.has(rel)) out.push(`${rel} loads a module by a specifier that is not a string literal`);
    };
    toks.forEach((tk, i) => {
      if (tk.t !== 'word' || toks[i - 1]?.v === '.') return;
      const [next, arg, close] = [toks[i + 1], toks[i + 2], toks[i + 3]];
      let spec = null;
      if ((tk.v === 'from' || tk.v === 'import') && next?.t === 'str') spec = next.v;
      else if ((tk.v === 'import' || tk.v === 'require') && next?.v === '(') {
        if (arg?.t === 'str' && close?.v === ')') spec = arg.v;
        else unread();
      } else if (tk.v === 'createRequire') unread();
      if (spec === null || !(spec.startsWith('./') || spec.startsWith('../'))) return;
      const to = posix.normalize(posix.join(posix.dirname(rel), spec));
      if (to === 'gate/tests' || to.startsWith('gate/tests/')) out.push(`${rel} loads ${spec}, a file under gate/tests/`);
    });
  }
  return [...new Set(out)];
}

/** Where the workflow folder breaks the lockdown: the gate workflow's own, the CodeQL workflow's allow-list, every other file's common lockdown, and no other job named gate. */
function folderProblems(files) {
  const out = [];
  if (!files.has('gate.yml')) out.push('has no gate.yml');
  for (const [name, src] of files) {
    const problems = name === 'gate.yml' ? lockdownProblems(src) : name === 'codeql.yml' ? codeqlProblems(src, files.get('gate.yml') ?? '') : commonProblems(src);
    out.push(...problems.map(p => `${name} ${p}`));
    if (name !== 'gate.yml' && /^ {2}gate:\s*$|^\s+name:\s*['"]?gate['"]?\s*$/m.test(codeOf(src))) out.push(`${name} defines a job or check named gate`);
  }
  return out;
}
const realFolder = () => new Map(readdirSync(WORKFLOWS).filter(n => /\.ya?ml$/.test(n)).map(n => [n, readFileSync(join(WORKFLOWS, n), 'utf8')]));

test('the gate workflow keeps its lockdown', () => {
  assert.deepEqual(lockdownProblems(readFileSync(WORKFLOW, 'utf8')), []);
});

test('every workflow file keeps the lockdown, and only the gate workflow names a gate job', () => {
  assert.deepEqual(folderProblems(realFolder()), []);
});

for (const [label, plant, says] of [
  ['runs on pull_request_target', s => s.replace('  pull_request:\n', '  pull_request_target:\n'), 'runs on a trigger that holds secrets or a write token'],
  ['asks for write access', s => s.replace('  contents: read', '  contents: write'), 'asks for more than read access to the contents'],
  ['adds a permission', s => s.replace('  contents: read', '  contents: read\n  pull-requests: write'), 'asks for more than read access to the contents'],
  ['reads a secret', s => s.replace("node-version: '24'", "node-version: '24'\n          token: ${{ secrets.X }}"), 'reads a secret or the token'],
  ['pins an action to a tag', s => s.replace(/actions\/setup-node@[0-9a-f]{40}/, 'actions/setup-node@v7'), 'uses actions/setup-node@v7, not pinned to a full commit SHA'],
  ['keeps the token in the checkout', s => s.replace('persist-credentials: false', 'persist-credentials: true'), 'leaves the token in the checkout'],
  ['uploads the workspace', s => s.replace('      - name: Gate suite', '      - uses: actions/upload-artifact@0000000000000000000000000000000000000000\n      - name: Gate suite'), 'uploads or caches the workspace'],
  ['drops the dry run', s => s.replace(/ {10}env -u NODE_OPTIONS node gate\/install\.mjs.*\n/, ''), 'does not run the install dry run'],
  ['runs an old Node', s => s.replace("node-version: '24'", "node-version: '20'"), 'runs another Node than the floor'],
  ['runs on workflow_run', s => s.replace('  pull_request:\n', '  pull_request:\n  workflow_run:\n'), 'runs on a trigger that holds secrets or a write token'],
  ['reads the job token', s => s.replace("node-version: '24'", "node-version: '24'\n          token: ${{ github.token }}"), 'reads a secret or the token'],
  ['reads GITHUB_TOKEN', s => s.replace('      - name: Gate suite', '      - env:\n          T: GITHUB_TOKEN\n        name: Gate suite'), 'reads a secret or the token'],
  ['caches the workspace', s => s.replace('      - name: Gate suite', '      - uses: actions/cache@0000000000000000000000000000000000000000\n      - name: Gate suite'), 'uploads or caches the workspace'],
  ['drops the full tier', s => s.replace(/ {8}run: env -u NODE_OPTIONS node gate\/tests\/run\.mjs full\n?/, '        run: echo skipped\n'), 'does not run the full tier'],
  ['runs the fast tier instead', s => s.replace('gate/tests/run.mjs full', 'gate/tests/run.mjs fast'), 'does not run the full tier'],
  ['narrows the full tier', s => s.replace('gate/tests/run.mjs full', 'gate/tests/run.mjs full --list'), 'does not run the full tier'],
  ['drops the pull_request trigger', s => s.replace('  pull_request:\n', ''), 'does not run on every pull request and every push to main'],
  ['drops the push trigger', s => s.replace('  push:\n    branches: [main]\n', ''), 'does not run on every pull request and every push to main'],
]) {
  test(`bad case: the workflow lockdown check catches a workflow that ${label}`, () => {
    const src = readFileSync(WORKFLOW, 'utf8');
    const planted = plant(src);
    assert.notEqual(planted, src, 'the plant changed nothing');
    assert.ok(lockdownProblems(planted).includes(says), lockdownProblems(planted).join('\n'));
  });
}

const OTHER = "name: other\non:\n  pull_request:\npermissions:\n  contents: read\njobs:\n  lint:\n    runs-on: ubuntu-24.04\n    steps:\n      - run: echo ok\n";
for (const [label, other, says] of [
  ['asks for write access', OTHER.replace('contents: read', 'contents: write'), 'other.yml asks for more than read access to the contents'],
  ['runs on pull_request_target', OTHER.replace('  pull_request:', '  pull_request_target:'), 'other.yml runs on a trigger that holds secrets or a write token'],
  ['defines a job named gate', OTHER.replace('  lint:', '  gate:'), 'other.yml defines a job or check named gate'],
  ['names a job gate', OTHER.replace('    runs-on:', '    name: gate\n    runs-on:'), 'other.yml defines a job or check named gate'],
]) {
  test(`bad case: the folder check catches a second workflow file that ${label}`, () => {
    const files = realFolder();
    assert.deepEqual(folderProblems(new Map([...files, ['other.yml', OTHER]])), [], 'control: a locked-down second file passes');
    assert.ok(folderProblems(new Map([...files, ['other.yml', other]])).includes(says), folderProblems(new Map([...files, ['other.yml', other]])).join('\n'));
  });
}

// #244 C2: the CodeQL workflow as it is passes its allow-list.
test('the CodeQL workflow keeps its allow-list', () => {
  assert.deepEqual(codeqlProblems(readFileSync(CODEQL, 'utf8'), readFileSync(WORKFLOW, 'utf8')), []);
});

const TRIGGERS = 'runs on other triggers than a push to main, every pull request, a weekly schedule and a manual run';
const YAML_FORM = 'uses a YAML anchor, alias, merge key or flow mapping';
const extraKey = (where, key) => `${where} holds ${key}, which the allow-list doesn't name`;
for (const [label, plant, says] of [
  ['runs on issue comments', s => s.replace('  workflow_dispatch:\n', '  workflow_dispatch:\n  issue_comment:\n'), TRIGGERS],
  ['drops the schedule', s => s.replace(/ {2}schedule:\n {4}- cron: .*\n/, ''), TRIGGERS],
  ['takes an input on a manual run', s => s.replace('  workflow_dispatch:\n', '  workflow_dispatch:\n    inputs:\n      ref:\n        type: string\n'), 'takes inputs on a manual run'],
  ['runs on pull_request_target', s => s.replace('  pull_request:\n', '  pull_request_target:\n'), TRIGGERS],
  ['asks for security-events at the top level', s => s.replace('\npermissions:\n  contents: read\n', '\npermissions:\n  contents: read\n  security-events: write\n'), 'asks for more than read access to the contents at the top level'],
  ['gives the job a second write permission', s => s.replace('      security-events: write\n', '      security-events: write\n      pull-requests: write\n'), 'gives the job other permissions than contents: read and security-events: write'],
  ['adds a second job', s => s.replace('\njobs:\n', '\njobs:\n  other:\n    runs-on: ubuntu-24.04\n'), 'holds another job than analyze'],
  ['drops the Dependabot skip', s => s.replace(/ {4}if: .*\n/, ''), "does not skip Dependabot's pull requests"],
  ['changes the Dependabot skip', s => s.replace("github.actor != 'dependabot[bot]'", "github.actor != 'renovate[bot]'"), "does not skip Dependabot's pull requests"],
  ['runs in a container', s => s.replace('    timeout-minutes: 30\n', '    timeout-minutes: 30\n    container: node:24\n'), extraKey('the job', 'container')],
  ['runs services', s => s.replace('    timeout-minutes: 30\n', '    timeout-minutes: 30\n    services:\n      db:\n        image: postgres\n'), extraKey('the job', 'services')],
  ['carries on after an error', s => s.replace('    timeout-minutes: 30\n', '    timeout-minutes: 30\n    continue-on-error: true\n'), extraKey('the job', 'continue-on-error')],
  ['adds to the matrix', s => s.replace('        language: [actions, javascript-typescript]\n', '        language: [actions, javascript-typescript]\n        include:\n          - language: python\n'), extraKey('the matrix', 'include')],
  ['uses a YAML anchor and alias', s => s.replace('    runs-on: ubuntu-24.04\n    timeout-minutes: 30\n', '    runs-on: &runner ubuntu-24.04\n    timeout-minutes: *runner\n'), YAML_FORM],
  ['uses a flow mapping', s => s.replace('        with:\n          persist-credentials: false\n', '        with: { persist-credentials: false }\n'), YAML_FORM],
  ['lets one language cancel the other', s => s.replace('fail-fast: false', 'fail-fast: true'), 'lets one language cancel the other'],
  ['drops a language', s => s.replace('[actions, javascript-typescript]', '[javascript-typescript]'), 'analyses other languages than actions and javascript-typescript'],
  ['runs a shell step', s => s.replace('      - uses: github/codeql-action/analyze', '      - run: echo hi\n      - uses: github/codeql-action/analyze'), 'runs a shell command'],
  ['adds a pinned action', s => s.replace('      - uses: github/codeql-action/analyze', '      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020\n      - uses: github/codeql-action/analyze'), 'holds other steps than checkout, CodeQL init and CodeQL analyze'],
  ['sets a job-level env', s => s.replace('    timeout-minutes: 30\n', '    timeout-minutes: 30\n    env:\n      X: y\n'), 'sets environment variables'],
  ['pins init to a tag', s => s.replace(/codeql-action\/init@[0-9a-f]{40}/, 'codeql-action/init@v4'), 'step 2 is not github/codeql-action/init pinned to a full commit SHA'],
  ['pins init and analyze apart', s => s.replace(/codeql-action\/analyze@[0-9a-f]{40}/, `codeql-action/analyze@${'1'.repeat(40)}`), 'pins init and analyze to different commits'],
  ["pins checkout apart from gate.yml's", s => s.replace(/actions\/checkout@[0-9a-f]{40}/, `actions/checkout@${'2'.repeat(40)}`), 'pins checkout to another commit than gate.yml'],
  ['keeps the token in the checkout', s => s.replace('persist-credentials: false', 'persist-credentials: true'), 'leaves the token in the checkout'],
  ['checks out another ref', s => s.replace('          persist-credentials: false\n', '          persist-credentials: false\n          ref: main\n'), extraKey("step 1's with", 'ref')],
  ...['config-file', 'queries', 'packs', 'tools', 'source-root', 'debug'].map(input => [`gives init a ${input} input`, s => s.replace('          build-mode: none\n', `          build-mode: none\n          ${input}: x\n`), extraKey("step 2's with", input)]),
  ['leaves a second path out', s => s.replace("              - 'gate/tests/*.test.mjs'\n", "              - 'gate/tests/*.test.mjs'\n              - 'gate/*.mjs'\n"), 'leaves other paths out of the scan than gate/tests/*.test.mjs'],
  ['widens the path left out', s => s.replace("'gate/tests/*.test.mjs'", "'gate/**'"), 'leaves other paths out of the scan than gate/tests/*.test.mjs'],
  ['narrows the scan to paths', s => s.replace('            paths-ignore:\n', '            paths:\n              - gate\n            paths-ignore:\n'), extraKey('config', 'paths')],
  ['sets queries in the config', s => s.replace('            paths-ignore:\n', '            queries:\n              - uses: security-extended\n            paths-ignore:\n'), extraKey('config', 'queries')],
  ['turns the default queries off', s => s.replace('            paths-ignore:\n', '            disable-default-queries: true\n            paths-ignore:\n'), extraKey('config', 'disable-default-queries')],
  ['changes the category', s => s.replace('category: /language:${{ matrix.language }}', 'category: /language:other'), "uploads under another category than default setup's"],
  ['runs on another runner', s => s.replace('runs-on: ubuntu-24.04', 'runs-on: self-hosted'), 'does not run on ubuntu-24.04 with a time limit'],
  ['drops the time limit', s => s.replace('    timeout-minutes: 30\n', ''), 'does not run on ubuntu-24.04 with a time limit'],
  ['reads a secret', s => s.replace('          category:', '          token: ${{ secrets.X }}\n          category:'), 'reads a secret or the token'],
  ['reads the job token', s => s.replace('          category:', '          token: ${{ github.token }}\n          category:'), 'reads a secret or the token'],
  ['reads GITHUB_TOKEN', s => s.replace('          category:', '          token: GITHUB_TOKEN\n          category:'), 'reads a secret or the token'],
  ['uploads the workspace', s => s.replace('      - uses: github/codeql-action/analyze', `      - uses: actions/upload-artifact@${'0'.repeat(40)}\n      - uses: github/codeql-action/analyze`), 'uploads or caches the workspace'],
  ['caches the workspace', s => s.replace('      - uses: github/codeql-action/analyze', `      - uses: actions/cache@${'0'.repeat(40)}\n      - uses: github/codeql-action/analyze`), 'uploads or caches the workspace'],
  ['builds the code', s => s.replace('build-mode: none', 'build-mode: autobuild'), 'does not run init on the matrix language with build-mode none'],
  ['adds a top-level key', s => s.replace('\njobs:\n', '\nconcurrency: codeql\njobs:\n'), extraKey('the file', 'concurrency')],
  ['runs on pushes to another branch', s => s.replace('    branches: [main]\n', '    branches: [develop]\n'), TRIGGERS],
  ['filters its pull requests', s => s.replace('  pull_request:\n', '  pull_request:\n    branches: [main]\n'), TRIGGERS],
  ['runs daily', s => s.replace("'27 4 * * 1'", "'27 4 * * *'"), TRIGGERS],
  ['runs on a second schedule', s => s.replace("    - cron: '27 4 * * 1'\n", "    - cron: '27 4 * * 1'\n    - cron: '27 5 * * 3'\n"), TRIGGERS],
  ['lets a step carry on after an error', s => s.replace('      - uses: github/codeql-action/init', '      - continue-on-error: true\n        uses: github/codeql-action/init'), extraKey('step 2', 'continue-on-error')],
  ['limits the parallel jobs', s => s.replace('      fail-fast: false\n', '      fail-fast: false\n      max-parallel: 1\n'), extraKey('the strategy', 'max-parallel')],
  ['fixes the init language', s => s.replace('languages: ${{ matrix.language }}', 'languages: actions'), 'does not run init on the matrix language with build-mode none'],
  ['writes a key twice', s => s.replace('\npermissions:\n  contents: read\n', '\npermissions:\n  contents: read\n  contents: read\n'), /^is not in the YAML the check reads: the key contents repeats/],
  ['is renamed', s => s.replace('name: codeql\n', 'name: scan\n'), 'is not named codeql'],
  ['drops its name', s => s.replace('name: codeql\n', ''), 'is not named codeql'],
  ['skips only runs Dependabot started', s => s.replace(" && github.event.pull_request.user.login != 'dependabot[bot]'", ''), "does not skip Dependabot's pull requests"],]) {
  // #244 C2: each rule of the CodeQL workflow's allow-list catches its plant.
  test(`bad case: the CodeQL allow-list catches a workflow that ${label}`, () => {
    const src = readFileSync(CODEQL, 'utf8');
    const planted = plant(src);
    assert.notEqual(planted, src, 'the plant changed nothing');
    const problems = codeqlProblems(planted, readFileSync(WORKFLOW, 'utf8'));
    assert.ok(problems.some(p => (says instanceof RegExp ? says.test(p) : p === says)), problems.join('\n'));
  });
}

// #244 C2: only the CodeQL workflow is read by the allow-list; any other workflow asking to write security events still fails.
test('bad case: the folder check catches a second workflow file that asks for security-events', () => {
  const files = realFolder();
  const other = OTHER.replace('  contents: read', '  contents: read\n  security-events: write');
  assert.ok(folderProblems(new Map([...files, ['other.yml', other]])).includes('other.yml asks for more than read access to the contents'));
});

const realSources = () => {
  const listed = execFileSync('git', ['ls-files', '-z'], { cwd: REPO, encoding: 'utf8' }).split('\0');
  return new Map(listed.filter(rel => /\.(?:mjs|js|cjs)$/.test(rel) && !rel.startsWith('gate/tests/')).map(rel => [rel, readFileSync(join(REPO, rel), 'utf8')]));
};

// #244 C3: nothing outside the test folder loads a file inside it, so leaving the test files out of the scan leaves no shipped code unscanned.
test('nothing outside gate/tests/ loads a file inside it', () => {
  const sources = realSources();
  // A listing that came back empty or cut short would pass everything below.
  assert.ok(sources.size > 20 && sources.has('gate/install.mjs') && sources.has('claude/tools/poster.mjs'), `the listing holds ${sources.size} files`);
  assert.deepEqual(premiseProblems(sources), []);
});

// #244 C3: the premise test reads code, so the words in a comment, a string or a pattern are not a load.
test('the premise test reads no load into a comment, a string or a pattern', () => {
  const text = "// import(name) and require(name)\nconst s = 'import(name)';\nconst t = `createRequire(${x})`;\nconst re = /\\bimport\\s*\\(/;\n";
  assert.deepEqual(premiseProblems(new Map([['gate/planted.mjs', text]])), []);
});

const UNREAD_SAYS = 'gate/planted.mjs loads a module by a specifier that is not a string literal';
for (const [label, rel, text, says] of [
  ['imports a test file', 'gate/planted.mjs', "import { x } from './tests/x.test.mjs';\n", 'gate/planted.mjs loads ./tests/x.test.mjs, a file under gate/tests/'],
  ['imports a test helper dynamically', 'gate/planted.mjs', "const h = await import('./tests/text.mjs');\n", 'gate/planted.mjs loads ./tests/text.mjs, a file under gate/tests/'],
  ['requires a test helper', 'gate/planted.cjs', "const h = require('./tests/text.mjs');\n", 'gate/planted.cjs loads ./tests/text.mjs, a file under gate/tests/'],
  ['reaches gate/tests from another folder', 'scripts/planted.mjs', "import '../gate/tests/run.mjs';\n", 'scripts/planted.mjs loads ../gate/tests/run.mjs, a file under gate/tests/'],
  ['makes a dynamic import of a built name', 'gate/planted.mjs', 'const m = await import(name);\n', UNREAD_SAYS],
  ['imports through a template with a substitution', 'gate/planted.mjs', 'const m = await import(`./${dir}/x.test.mjs`);\n', UNREAD_SAYS],
  ['requires a built name', 'gate/planted.mjs', 'const h = require(name);\n', UNREAD_SAYS],
  ['loads through createRequire', 'gate/planted.mjs', "import { createRequire } from 'node:module';\nconst r = createRequire(import.meta.url);\n", UNREAD_SAYS],
]) {
  // #244 C3: each rule of the premise test catches its plant.
  test(`bad case: the premise test catches a file outside gate/tests/ that ${label}`, () => {
    const problems = premiseProblems(new Map([...realSources(), [rel, text]]));
    assert.ok(problems.includes(says), problems.join('\n'));
  });
}

test('dependabot keeps the pinned actions current, holding a release back two weeks', () => {
  const src = readFileSync(join(REPO, '.github', 'dependabot.yml'), 'utf8');
  assert.match(src, /package-ecosystem: github-actions/);
  assert.match(src, /default-days: 14/);
});
