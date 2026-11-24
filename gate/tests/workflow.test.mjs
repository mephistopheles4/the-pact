// The commit-time layer's lockdown (#153, S11): the gate workflow reads the
// repo with a read-only token, holds no secret, never runs on
// pull_request_target, pins every action to a full commit SHA, leaves no
// token in the checkout, uploads nothing, and runs the dry run and the full
// tier, install tests included (#303), on the Node floor. Every other workflow file keeps the same lockdown,
// and none may define a job named gate, the required check's name (#166). It
// reads the files' text; it can't see what GitHub does with them, which the
// S15 CI probe records.
//
// The CodeQL workflow (#239, #244) may ask for more: it uploads code-scanning
// results, so its one job holds security-events: write. The two Claude
// workflows (spec 0006) may too: each job holds id-token: write, to trade
// GitHub's OIDC token for an Anthropic token, and holds no secret. Each of the
// three is held to an exact allow-list instead of the common lockdown. The
// CodeQL configuration leaves the gate's test files out of the scan, which is safe
// only while nothing outside gate/tests/ loads a file inside it; the premise
// test below checks that.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, posix } from 'node:path';
import { test } from 'node:test';
import { tokens } from './text.mjs';
import { REPO, skipUnlessLinuxCi } from './text.mjs';

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
  // #351: every checkout step, not only the first.
  const checkouts = [...`${code}\n`.matchAll(/uses: actions\/checkout@[0-9a-f]{40}[^\n]*\n((?: {8,}.+\n)*)/g)];
  if (checkouts.length !== (code.match(/uses: actions\/checkout@/g) ?? []).length || checkouts.some(c => !/persist-credentials: false/.test(c[1]))) out.push('leaves the token in the checkout');
  if (/upload-artifact|actions\/cache/.test(code)) out.push('uploads or caches the workspace');
  return out;
}

// #351 (#348 S4.1): the gate workflow's two jobs, the runner each is pinned to, and its full-tier line; the Windows run checks its skips against a committed list (q2).
const FULL = 'env -u NODE_OPTIONS node gate/tests/run.mjs full';
const DRY_RUN = 'env -u NODE_OPTIONS node gate/install.mjs --claude-home "$RUNNER_TEMP/pact-home"';
const DRY_STEP = `mkdir -p "$RUNNER_TEMP/pact-home"\n${DRY_RUN}\n`;
// The Windows step also plants a real Claude folder with a plain subfolder in the runner's home, as the Linux container's image does, so the installer's real-folder guards run (q11).
const REAL_DRY_STEP = `mkdir -p "$RUNNER_TEMP/pact-home"\nmkdir -p "$HOME/.claude/agents"\n${DRY_RUN}\n`;
// Spec 0003 M7: the macOS job also runs the pinned server once (--device none --version) through .github/scripts/clef-smoke.mjs, so a Mac run shows the real server starting.
const SMOKE = 'env -u NODE_OPTIONS node .github/scripts/clef-smoke.mjs';
const GATE_JOBS = [
  ['gate', 'ubuntu-24.04', FULL, DRY_STEP, false],
  // Spec 0003 M7 (amended): the macOS arm64 job plants the real Claude folder as Windows does, a tightening of the dry run, with its skips checked against its own committed list.
  ['gate-macos', 'macos-15', `${FULL} --skips gate/tests/macos-skips.txt`, REAL_DRY_STEP, true],
  ['gate-windows', 'windows-2025', `${FULL} --skips gate/tests/windows-skips.txt`, REAL_DRY_STEP, false],
];
// Pull requests share a group per ref, so a newer push cancels the older run; each push to main has a group of its own commit.
const CANCELS = 'does not hold the concurrency group that cancels an older run only on a pull request';
const CONCURRENCY = { group: "gate-${{ github.event_name == 'pull_request' && github.ref || github.sha }}", 'cancel-in-progress': 'true' };

/** Where the gate workflow breaks its lockdown, as plain sentences; empty when it keeps it. Each job is read on its own. */
function lockdownProblems(src) {
  const code = codeOf(src);
  const out = commonProblems(src);
  // #310: an if: skips the gate, and a skipped required check counts as passing; continue-on-error keeps a failed gate green.
  if (/(?:^\s*(?:- )?|[{,]\s*)['"]?if['"]?\s*:/m.test(code)) out.push('lets the gate job or a step be skipped');
  if (/(?:^\s*(?:- )?|[{,]\s*)['"]?continue-on-error['"]?\s*:/m.test(code)) out.push('lets the gate carry on after an error');
  if (!/^ {2}pull_request:\s*$/m.test(code) || !/^ {2}push:\n {4}branches: \[main\]$/m.test(code)) out.push('does not run on every pull request and every push to main');
  let w;
  try {
    w = readYaml(code);
  } catch (e) {
    return [...out, `is not in the YAML the check reads: ${e.message}`];
  }
  // #351, the security pair's first read, F1: an exact allow-list at every level, as the CodeQL workflow has, so no env, defaults, shell or checkout input changes what the lines below run.
  const extras = (where, obj, keys) => {
    if (isMap(obj)) for (const k of Object.keys(obj)) if (!keys.includes(k)) out.push(extraKey(where, k));
  };
  extras('the file', w, ['name', 'on', 'permissions', 'concurrency', 'jobs']);
  extras('on', w.on, ['pull_request', 'push']);
  // F2: the trigger values too, as the CodeQL check holds them, so no filter narrows when the gate runs.
  if (!same(w.on, { pull_request: null, push: { branches: ['main'] } })) out.push('does not run on every pull request and every push to main');
  if (!same(w.concurrency, CONCURRENCY)) out.push(CANCELS);
  const jobs = isMap(w.jobs) ? w.jobs : {};
  if (!same(Object.keys(jobs).sort(), GATE_JOBS.map(([id]) => id).sort())) out.push('holds other jobs than gate, gate-macos and gate-windows');
  for (const [id, runner, fullLine, dryStep, smoke] of GATE_JOBS) {
    if (!isMap(jobs[id])) continue;
    const job = jobs[id];
    const win = id === 'gate-windows';
    extras(id, job, ['name', 'runs-on', 'timeout-minutes', 'steps']);
    // The check's name is what the ruleset requires.
    if (job.name !== id) out.push(`${id}'s check is not named ${id}`);
    const raw = Array.isArray(job.steps) ? job.steps : [];
    if (raw.length !== (smoke ? 5 : 4)) out.push(`${id} holds other steps than checkout, setup-node, the dry run, the full tier${smoke ? ' and the server smoke run' : ''}`);
    const runKeys = ['name', 'run', ...(win ? ['shell'] : [])];
    [['uses', 'with'], ['uses', 'with'], runKeys, runKeys, ...(smoke ? [runKeys] : [])].forEach((keys, i) => extras(`${id}'s step ${i + 1}`, raw[i], keys));
    extras(`${id}'s step 1's with`, raw[0]?.with, ['persist-credentials']);
    extras(`${id}'s step 2's with`, raw[1]?.with, ['node-version']);
    if (isMap(raw[2]) && raw[2].run !== dryStep) out.push(`${id}'s dry-run step runs other lines than the dry run`);
    if (job['runs-on'] !== runner) out.push(`${id} does not run on ${runner}`);
    if (!/^[1-9]\d*$/.test(job['timeout-minutes'] ?? '')) out.push(`${id} has no time limit`);
    // A matrix renames the check, so the required check would never report.
    if (Object.hasOwn(job, 'strategy')) out.push(`${id} runs on a matrix`);
    const steps = Array.isArray(job.steps) ? job.steps.filter(isMap) : [];
    if (!steps.some(s => /^actions\/checkout@/.test(s.uses ?? ''))) out.push(`${id} does not check the repo out`);
    if (!steps.some(s => /^actions\/setup-node@/.test(s.uses ?? '') && s.with?.['node-version'] === '24')) out.push(`${id} runs another Node than the floor`);
    const dryRun = steps.filter(s => typeof s.run === 'string' && s.run.split('\n').some(l => l.trim() === DRY_RUN));
    const full = steps.filter(s => s.run === fullLine);
    if (!dryRun.length) out.push(`${id} does not run the install dry run`);
    if (!full.length) out.push(`${id} does not run the full tier`);
    if (smoke && !(isMap(raw[4]) && raw[4].run === SMOKE)) out.push(`${id} does not run the pinned server smoke step`);
    // Git Bash runs the env -u lines above unchanged; pwsh, the runner's default, would not.
    if (win && [...dryRun, ...full].some(s => s.shell !== 'bash')) out.push(`${id} does not run its steps in bash`);
  }
  // F4: the Windows job uses the very commits of checkout and setup-node that gate uses.
  const pinned = id => (Array.isArray(jobs[id]?.steps) ? jobs[id].steps : []).map(s => (isMap(s) ? s.uses : undefined));
  for (const id of ['gate-macos', 'gate-windows']) {
    [0, 1].forEach(i => {
      if (pinned(id)[i] !== pinned('gate')[i]) out.push(`${id}'s step ${i + 1} is not pinned to gate's commit`);
    });
  }
  return out;
}

const isMap = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const extraKey = (where, key) => `${where} holds ${key}, which the allow-list doesn't name`;
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

// Spec 0006 W3, W4: the two Claude workflows, each held to an exact allow-list of its own. Neither reads a secret:
// each run trades GitHub's OIDC token for an Anthropic token through Workload Identity Federation.
// The owner's three agent apps may start a run too (an owner's decision, spec 0006 W2.3); allowed_bots names the same three, never '*'.
const APPS = ['mephistos-homunculus', 'mephistos-euphorion', 'mephistos-wagner'];
const IN_LIST = f =>
  "(contains(fromJSON('[\"OWNER\",\"MEMBER\",\"COLLABORATOR\"]'), github.event." + f + ".author_association) || contains(fromJSON('[" + APPS.map(a => '\"' + a + '[bot]\"').join(',') + "]'), github.event." + f + '.user.login))';
const MENTION = f => 'contains(github.event.' + f + ".body, '@claude')";
// The guards are held exactly as the files write them: each guard is a control: it bounds who gets the Claude app's write token, which the Console's rule does not (W2).
const ANSWER_GUARD =
  [
    "(github.event_name == 'issue_comment' && " + MENTION('comment') + ' && ' + IN_LIST('comment') + ')',
    "(github.event_name == 'pull_request_review_comment' && " + MENTION('comment') + ' && ' + IN_LIST('comment') + ')',
    "(github.event_name == 'pull_request_review' && " + MENTION('review') + ' && ' + IN_LIST('review') + ')',
    "(github.event_name == 'issues' && (" + MENTION('issue') + " || contains(github.event.issue.title, '@claude')) && " + IN_LIST('issue') + ')',
  ].join(' ||\n') + '\n';
const REVIEW_GUARD = 'github.event.pull_request.head.repo.full_name == github.repository && ' + IN_LIST('pull_request');
// The federation IDs are identifiers, not credentials, and are held exactly: another well-formed ID would point a run at another rule.
const FEDERATION = {
  anthropic_federation_rule_id: 'fdrl_01V8jy6dtvy7Ebf916SRieME',
  anthropic_organization_id: '6161ef7b-3383-44f6-bd62-34226aa8c2fc',
  anthropic_service_account_id: 'svac_01QUZe8emXQcqnE1opH93J5e',
};
const CLAUDE = {
  'claude.yml': {
    name: 'claude',
    job: 'claude',
    on: { issue_comment: ['created'], pull_request_review_comment: ['created'], issues: ['opened', 'assigned'], pull_request_review: ['submitted'] },
    permissions: { contents: 'read', 'pull-requests': 'read', issues: 'read', actions: 'read', 'id-token': 'write' },
    guard: ANSWER_GUARD,
    inputs: { ...FEDERATION, allowed_bots: APPS.join(','), additional_permissions: 'actions: read\n' },
  },
  'claude-code-review.yml': {
    name: 'claude-code-review',
    job: 'claude-review',
    on: { pull_request: ['opened', 'synchronize', 'ready_for_review', 'reopened'] },
    permissions: { contents: 'read', 'pull-requests': 'read', issues: 'read', 'id-token': 'write' },
    guard: REVIEW_GUARD,
    inputs: {
      ...FEDERATION,
      allowed_bots: APPS.join(','),
      plugin_marketplaces: 'https://github.com/anthropics/claude-code.git',
      plugins: 'code-review@claude-code-plugins',
      prompt: '/code-review:code-review --comment ${{ github.repository }}/pull/${{ github.event.pull_request.number }}',
      claude_args: '--allowedTools "mcp__github_inline_comment__create_inline_comment,Bash(gh issue view:*),Bash(gh search:*),Bash(gh issue list:*),Bash(gh pr comment:*),Bash(gh pr diff:*),Bash(gh pr view:*),Bash(gh pr list:*)"',
    },
  },
};
/** A value with every map's keys in order, so two maps compare by what they hold. */
const sorted = v => (isMap(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => [k, sorted(x)])) : v);
const sameSet = (a, b) => same(sorted(a), sorted(b));

/**
 * Where one of the two Claude workflows breaks its allow-list, as plain
 * sentences; empty when it keeps it. 'which' is the file's name, and its
 * values are CLAUDE's. Every level holds exactly the keys W3 names; the guard
 * and the action's inputs, the federation IDs included, are the file's own.
 * 'gateSrc' is gate.yml's text, whose checkout pin this file's must match.
 */
function claudeProblems(src, gateSrc, which) {
  const spec = CLAUDE[which];
  if (!spec) throw new Error('no Claude allow-list for ' + which);
  const code = codeOf(src);
  const out = [];
  const extras = (where, obj, keys) => {
    if (!isMap(obj)) return out.push(where + ' is not a map');
    for (const k of Object.keys(obj)) if (!keys.includes(k)) out.push(extraKey(where, k));
    for (const k of keys) if (!Object.hasOwn(obj, k)) out.push(where + ' lacks ' + k);
  };
  if (/pull_request_target|workflow_run/.test(code)) out.push('runs on a trigger that holds secrets or a write token');
  if (/^\s*(?:-\s+)?run:/m.test(code)) out.push('runs a shell command');
  if (/^\s*(?:-\s+)?env:/m.test(code)) out.push('sets environment variables');
  if (/\bsecrets\b|\bgithub\s*\.\s*token\b|\bgithub\s*\[\s*['"]token|GITHUB_TOKEN/.test(code)) out.push('reads a secret or the token');
  if (/upload-artifact|\bcache\b/.test(code)) out.push('uploads or caches the workspace');
  if (yamlFormUsed(code)) out.push('uses a YAML anchor, alias, merge key or flow mapping');
  let w;
  try {
    w = readYaml(code);
  } catch (e) {
    return [...out, 'is not in the YAML the check reads: ' + e.message];
  }

  extras('the file', w, ['name', 'on', 'permissions', 'jobs']);
  if (w.name !== spec.name) out.push('is not named ' + spec.name);
  const on = Object.fromEntries(Object.entries(spec.on).map(([event, types]) => [event, { types }]));
  if (!sameSet(w.on, on)) out.push('runs on other triggers or event types than its own');
  if (!same(w.permissions, { contents: 'read' })) out.push('asks for more than read access to the contents at the top level');

  if (!isMap(w.jobs) || !same(Object.keys(w.jobs), [spec.job])) out.push('holds a job other than its own');
  const job = isMap(w.jobs?.[spec.job]) ? w.jobs[spec.job] : {};
  extras('the job', job, ['if', 'runs-on', 'timeout-minutes', 'permissions', 'steps']);
  if (!sameSet(job.permissions, spec.permissions)) out.push('gives the job other permissions than its own');
  if (job.if !== spec.guard) out.push('runs its job under another guard than its own');
  if (job['runs-on'] !== 'ubuntu-24.04' || !/^[1-9]\d*$/.test(job['timeout-minutes'] ?? '')) out.push('does not run on ubuntu-24.04 with a time limit');

  const steps = Array.isArray(job.steps) ? job.steps : [];
  const actions = ['actions/checkout', 'anthropics/claude-code-action'];
  if (steps.length !== actions.length || !steps.every((s, i) => isMap(s) && String(s.uses ?? '').startsWith(actions[i] + '@'))) {
    out.push('holds other steps than checkout and claude-code-action, in that order');
  }
  const pins = [];
  actions.forEach((action, i) => {
    const step = steps[i];
    if (!isMap(step)) return;
    const pin = new RegExp('^' + action + '@(' + SHA + ')$').exec(step.uses ?? '');
    if (!pin) out.push('step ' + (i + 1) + ' is not ' + action + ' pinned to a full commit SHA');
    pins.push(pin?.[1]);
    extras('step ' + (i + 1), step, ['uses', 'with']);
  });
  const gatePin = new RegExp('uses: actions/checkout@(' + SHA + ')').exec(codeOf(gateSrc))?.[1];
  if (pins[0] && pins[0] !== gatePin) out.push('pins checkout to another commit than gate.yml');

  // A step whose with is not a map is refused, not skipped: a bare with: or a scalar would hide the inputs below from the checks.
  steps.forEach((s, i) => {
    if (isMap(s) && Object.hasOwn(s, 'with') && !isMap(s.with)) out.push('step ' + (i + 1) + "'s with is not a map");
  });
  const [checkout, action] = steps.map(s => (isMap(s?.with) ? s.with : undefined));
  if (isMap(steps[0]) && checkout?.['persist-credentials'] !== 'false') out.push('leaves the token in the checkout');
  if (checkout) {
    extras("step 1's with", checkout, ['fetch-depth', 'persist-credentials']);
    if (Object.hasOwn(checkout, 'fetch-depth') && !/^\d+$/.test(checkout['fetch-depth'])) out.push("step 1's fetch-depth is not a number");
  }
  if (action) {
    extras("the action's with", action, Object.keys(spec.inputs));
    for (const [key, value] of Object.entries(spec.inputs)) {
      if (Object.hasOwn(action, key) && action[key] !== value) out.push('holds another ' + key + ' than its own');
    }
    if (['anthropic_api_key', 'claude_code_oauth_token'].some(k => Object.hasOwn(action, k))) out.push('sets a credential that takes precedence over federation');
  }
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

// #356: a control character but a tab or a line feed (C0, DEL and C1, the QA pair's read), a lone carriage return and next line among them, or a Unicode line break.
const BREAKS = /[\x00-\x08\x0b-\x1f\x7f-\x9f\u2028\u2029]/;
/** Where the workflow folder breaks the lockdown: the gate workflow's own, the allow-lists of the CodeQL workflow and the two Claude workflows, every other file's common lockdown, and no other job named gate or gate-windows. */
function folderProblems(files) {
  const out = [];
  if (!files.has('gate.yml')) out.push('has no gate.yml');
  for (const [name, src] of files) {
    const problems = name === 'gate.yml' ? lockdownProblems(src) : name === 'codeql.yml' ? codeqlProblems(src, files.get('gate.yml') ?? '') : Object.hasOwn(CLAUDE, name) ? claudeProblems(src, files.get('gate.yml') ?? '', name) : commonProblems(src);
    out.push(...problems.map(p => `${name} ${p}`));
    // #356: the reader splits lines on a line feed alone, so any other break, or a control character but a tab, could hide a key from it.
    if (BREAKS.test(src.replace(/\r\n/g, '\n'))) out.push(`${name} holds a line break or control character other than a line feed`);
    if (name === 'gate.yml') continue;
    // #357: the jobs as the reader sees them, so a spelling a line match misses still counts; a file it can't read is refused.
    let w;
    try {
      w = readYaml(codeOf(src));
    } catch {
      out.push(`${name} can't be read by the check`);
    }
    for (const [id, job] of Object.entries(isMap(w?.jobs) ? w.jobs : {})) {
      // The security pair's F1 and H1: a block scalar keeps its line break, and GitHub may match a check's name in any case.
      const named = isMap(job) && typeof job.name === 'string' ? job.name.trim().toLowerCase() : null;
      const gate = GATE_JOBS.find(([g]) => g === id.toLowerCase() || g === named);
      if (gate) out.push(`${name} defines a job or check named ${gate[0]}`);
      if (named?.includes('${{')) out.push(`${name} names a job with an expression`);
    }
    // #351: gate-windows is the second required check's name. Trailing comments are cut and a key may be quoted (the first read's F4).
    const code = codeOf(src).split('\n').map(uncommented).join('\n');
    for (const [id] of GATE_JOBS) {
      if (new RegExp(`^ {2}['"]?${id}['"]?:\\s*$|^\\s+(?:- )?['"]?name['"]?:\\s*['"]?${id}['"]?\\s*$`, 'm').test(code)) out.push(`${name} defines a job or check named ${id}`);
    }
  }
  return out;
}
// The security pair's H2: an extension in another case is read too.
const isWorkflow = n => /\.ya?ml$/i.test(n);
/** The workflow folder as file names and texts; a test may hand in its own listing and reader. */
const realFolder = (names = readdirSync(WORKFLOWS), read = n => readFileSync(join(WORKFLOWS, n), 'utf8')) => new Map(names.filter(isWorkflow).map(n => [n, read(n)]));

// A plant in the Windows job only: the job is the file's last, so its text runs from its key to the end.
const WINDOWS_JOB = '\n  gate-windows:\n';
const inWindows = plant => s => s.slice(0, s.indexOf(WINDOWS_JOB)) + plant(s.slice(s.indexOf(WINDOWS_JOB)));
// A plant in the macOS job only: it sits between gate and gate-windows.
const MACOS_JOB = '\n  gate-macos:\n';
const inMacos = plant => s => s.slice(0, s.indexOf(MACOS_JOB)) + plant(s.slice(s.indexOf(MACOS_JOB), s.indexOf(WINDOWS_JOB))) + s.slice(s.indexOf(WINDOWS_JOB));

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
  ['drops the dry run', s => s.replace(/ {10}env -u NODE_OPTIONS node gate\/install\.mjs.*\n/, ''), 'gate does not run the install dry run'],
  ['runs an old Node', s => s.replace("node-version: '24'", "node-version: '20'"), 'gate runs another Node than the floor'],
  ['runs on workflow_run', s => s.replace('  pull_request:\n', '  pull_request:\n  workflow_run:\n'), 'runs on a trigger that holds secrets or a write token'],
  ['reads the job token', s => s.replace("node-version: '24'", "node-version: '24'\n          token: ${{ github.token }}"), 'reads a secret or the token'],
  ['reads GITHUB_TOKEN', s => s.replace('      - name: Gate suite', '      - env:\n          T: GITHUB_TOKEN\n        name: Gate suite'), 'reads a secret or the token'],
  ['caches the workspace', s => s.replace('      - name: Gate suite', '      - uses: actions/cache@0000000000000000000000000000000000000000\n      - name: Gate suite'), 'uploads or caches the workspace'],
  ['drops the full tier', s => s.replace(/ {8}run: env -u NODE_OPTIONS node gate\/tests\/run\.mjs full\n?/, '        run: echo skipped\n'), 'gate does not run the full tier'],
  ['runs the fast tier instead', s => s.replace('gate/tests/run.mjs full', 'gate/tests/run.mjs fast'), 'gate does not run the full tier'],
  ['narrows the full tier', s => s.replace('gate/tests/run.mjs full', 'gate/tests/run.mjs full --list'), 'gate does not run the full tier'],
  ['drops the pull_request trigger', s => s.replace('  pull_request:\n', ''), 'does not run on every pull request and every push to main'],
  // #310 C1, C2: each key planted on the job and on the gate-suite step.
  ['skips the gate job on a condition', s => s.replace('    timeout-minutes: 30\n', "    timeout-minutes: 30\n    if: github.actor != 'x'\n"), 'lets the gate job or a step be skipped'],
  ['carries on after the gate suite fails', s => s.replace('      - name: Gate suite, full tier\n', '      - continue-on-error: true\n        name: Gate suite, full tier\n'), 'lets the gate carry on after an error'],
  ['skips the gate-suite step on a condition', s => s.replace('      - name: Gate suite, full tier\n', '      - if: false\n        name: Gate suite, full tier\n'), 'lets the gate job or a step be skipped'],
  ['skips the gate job under a quoted key', s => s.replace('    timeout-minutes: 30\n', "    timeout-minutes: 30\n    'if': github.actor != 'x'\n"), 'lets the gate job or a step be skipped'],
  ['skips the gate job under a double-quoted key', s => s.replace('    timeout-minutes: 30\n', '    timeout-minutes: 30\n    "if": false\n'), 'lets the gate job or a step be skipped'],
  ['skips a step written as a flow mapping', s => s.replace('      - name: Gate suite, full tier\n', '      - { if: false, name: x, run: x }\n      - name: Gate suite, full tier\n'), 'lets the gate job or a step be skipped'],
  ['carries on after the gate job fails', s => s.replace('    timeout-minutes: 30\n', '    timeout-minutes: 30\n    continue-on-error: true\n'), 'lets the gate carry on after an error'],
  ['drops the push trigger', s => s.replace('  push:\n    branches: [main]\n', ''), 'does not run on every pull request and every push to main'],
  // #351 C2 (#348 S4.2): the two jobs, each read on its own.
  ['adds a third job', s => `${s}  extra:\n    runs-on: ubuntu-24.04\n    timeout-minutes: 5\n    steps:\n      - run: echo ok\n`, 'holds other jobs than gate, gate-macos and gate-windows'],
  // Spec 0003 M7: a twin of each gate-windows case that applies to the macOS job.
  ['drops the macOS job', s => s.slice(0, s.indexOf(MACOS_JOB) + 1) + s.slice(s.indexOf(WINDOWS_JOB) + 1), 'holds other jobs than gate, gate-macos and gate-windows'],
  ['runs gate-macos on macos-latest', inMacos(s => s.replace('runs-on: macos-15', 'runs-on: macos-latest')), 'gate-macos does not run on macos-15'],
  ['runs gate-macos on a self-hosted runner', inMacos(s => s.replace('runs-on: macos-15', 'runs-on: self-hosted')), 'gate-macos does not run on macos-15'],
  ['drops the macOS time limit', inMacos(s => s.replace('    timeout-minutes: 45\n', '')), 'gate-macos has no time limit'],
  ['runs the fast tier on macOS', inMacos(s => s.replace('gate/tests/run.mjs full', 'gate/tests/run.mjs fast')), 'gate-macos does not run the full tier'],
  ['drops the skip list on macOS', inMacos(s => s.replace(' --skips gate/tests/macos-skips.txt', '')), 'gate-macos does not run the full tier'],
  ['points macOS at the Windows skip list', inMacos(s => s.replace('gate/tests/macos-skips.txt', 'gate/tests/windows-skips.txt')), 'gate-macos does not run the full tier'],
  ['drops the macOS dry run', inMacos(s => s.replace(/ {10}env -u NODE_OPTIONS node gate\/install\.mjs.*\n/, '')), 'gate-macos does not run the install dry run'],
  ['runs a line before the macOS dry run', inMacos(s => s.replace('          mkdir -p "$RUNNER_TEMP/pact-home"\n', '          export CI=\n          mkdir -p "$RUNNER_TEMP/pact-home"\n')), "gate-macos's dry-run step runs other lines than the dry run"],
  ['drops the real Claude folder on macOS', inMacos(s => s.replace('          mkdir -p "$HOME/.claude/agents"\n', '')), "gate-macos's dry-run step runs other lines than the dry run"],
  ['keeps the token in the macOS checkout', inMacos(s => s.replace('persist-credentials: false', 'persist-credentials: true')), 'leaves the token in the checkout'],
  ['runs an old Node on macOS', inMacos(s => s.replace("node-version: '24'", "node-version: '20'")), 'gate-macos runs another Node than the floor'],
  ['pins the macOS checkout apart from gate', inMacos(s => s.replace(/actions\/checkout@[0-9a-f]{40}/, `actions/checkout@${'3'.repeat(40)}`)), "gate-macos's step 1 is not pinned to gate's commit"],
  ['pins the macOS setup-node apart from gate', inMacos(s => s.replace(/actions\/setup-node@[0-9a-f]{40}/, `actions/setup-node@${'3'.repeat(40)}`)), "gate-macos's step 2 is not pinned to gate's commit"],
  ['renames the macOS check', inMacos(s => s.replace('    name: gate-macos\n', '    name: macos\n')), "gate-macos's check is not named gate-macos"],
  ['skips the macOS job on a condition', inMacos(s => s.replace('    timeout-minutes: 45\n', '    timeout-minutes: 45\n    if: false\n')), 'lets the gate job or a step be skipped'],
  ['carries on after the macOS job fails', inMacos(s => s.replace('    timeout-minutes: 45\n', '    timeout-minutes: 45\n    continue-on-error: true\n')), 'lets the gate carry on after an error'],
  ['sets a shell on a macOS step', inMacos(s => s.replace('      - name: Gate suite, full tier\n        run:', '      - name: Gate suite, full tier\n        shell: sh\n        run:')), extraKey("gate-macos's step 4", 'shell')],
  // Spec 0003 M7: the macOS job runs the pinned server once; the smoke step is required, held to its one line, and held to the macOS job alone.
  ['drops the macOS smoke step', inMacos(s => s.replace(/ {6}- name: Pinned macOS server smoke run\n {8}run: .*(?:\n|$)/, '')), 'gate-macos holds other steps than checkout, setup-node, the dry run, the full tier and the server smoke run'],
  ['runs another line in the macOS smoke step', inMacos(s => s.replace('node .github/scripts/clef-smoke.mjs', 'node .github/scripts/clef-smoke.mjs || true')), 'gate-macos does not run the pinned server smoke step'],
  ['sets a shell on the macOS smoke step', inMacos(s => s.replace('      - name: Pinned macOS server smoke run\n        run:', '      - name: Pinned macOS server smoke run\n        shell: sh\n        run:')), extraKey("gate-macos's step 5", 'shell')],
  ['adds the smoke step to gate', s => s.replace('      - name: Gate suite, full tier\n        run: env -u NODE_OPTIONS node gate/tests/run.mjs full\n', '      - name: Gate suite, full tier\n        run: env -u NODE_OPTIONS node gate/tests/run.mjs full\n      - name: Pinned macOS server smoke run\n        run: env -u NODE_OPTIONS node .github/scripts/clef-smoke.mjs\n'), 'gate holds other steps than checkout, setup-node, the dry run, the full tier'],
  ['runs gate-macos on a matrix', inMacos(s => s.replace('    runs-on: macos-15\n', '    strategy:\n      matrix:\n        os: [macos-15]\n    runs-on: macos-15\n')), 'gate-macos runs on a matrix'],
  ['drops the Windows job', s => s.slice(0, s.indexOf(WINDOWS_JOB) + 1), 'holds other jobs than gate, gate-macos and gate-windows'],
  ['moves gate to another runner', s => s.replace('runs-on: ubuntu-24.04', 'runs-on: ubuntu-latest'), 'gate does not run on ubuntu-24.04'],
  ['runs gate-windows on windows-latest', inWindows(s => s.replace('runs-on: windows-2025', 'runs-on: windows-latest')), 'gate-windows does not run on windows-2025'],
  ['drops the Windows time limit', inWindows(s => s.replace('    timeout-minutes: 45\n', '')), 'gate-windows has no time limit'],
  ['runs the fast tier on Windows', inWindows(s => s.replace('gate/tests/run.mjs full', 'gate/tests/run.mjs fast')), 'gate-windows does not run the full tier'],
  // #351 (q2): the Windows run fails unless its skips match its committed list exactly.
  ['drops the skip list on Windows', inWindows(s => s.replace(' --skips gate/tests/windows-skips.txt', '')), 'gate-windows does not run the full tier'],
  ['drops the Windows dry run', inWindows(s => s.replace(/ {10}env -u NODE_OPTIONS node gate\/install\.mjs.*\n/, '')), 'gate-windows does not run the install dry run'],
  ['drops bash from a Windows step', inWindows(s => s.replace('        shell: bash\n', '')), 'gate-windows does not run its steps in bash'],
  // #351 (q14): the full step's bash too, not only the dry run's.
  ['drops bash from the Windows full step', inWindows(s => s.replace('      - name: Gate suite, full tier\n        shell: bash\n', '      - name: Gate suite, full tier\n')), 'gate-windows does not run its steps in bash'],
  ['keeps the token in the Windows checkout', inWindows(s => s.replace('persist-credentials: false', 'persist-credentials: true')), 'leaves the token in the checkout'],
  ['runs an old Node on Windows', inWindows(s => s.replace("node-version: '24'", "node-version: '20'")), 'gate-windows runs another Node than the floor'],
  ['folds the two jobs into a matrix', s => s.slice(0, s.indexOf(WINDOWS_JOB) + 1).replace('    runs-on: ubuntu-24.04\n', '    strategy:\n      matrix:\n        os: [ubuntu-24.04, windows-2025]\n    runs-on: ${{ matrix.os }}\n'), 'gate runs on a matrix'],
  // #351, the first read's F1 (q3): the file is held to an exact allow-list, as the CodeQL workflow is, so no key changes what the required lines do.
  ['sets a top-level env', s => s.replace('\njobs:\n', '\nenv:\n  CI: \'\'\njobs:\n'), extraKey('the file', 'env')],
  ['gives a job shell defaults', s => s.replace('    timeout-minutes: 30\n', '    timeout-minutes: 30\n    defaults:\n      run:\n        shell: sh\n'), extraKey('gate', 'defaults')],
  ['sets a shell on a gate step', s => s.replace('      - name: Gate suite, full tier\n        run:', '      - name: Gate suite, full tier\n        shell: sh\n        run:'), extraKey("gate's step 4", 'shell')],
  ['checks out another ref', s => s.replace('          persist-credentials: false\n', '          persist-credentials: false\n          ref: main\n'), extraKey("gate's step 1's with", 'ref')],
  // #351, the follow-up read's F2 and F4 (q7): the triggers are held exactly, and the Windows job pins each action to the Linux job's commit.
  ['filters its pull requests by path', s => s.replace('  pull_request:\n', '  pull_request:\n    paths: [docs/**]\n'), 'does not run on every pull request and every push to main'],
  ['pins the Windows checkout apart from gate', inWindows(s => s.replace(/actions\/checkout@[0-9a-f]{40}/, `actions/checkout@${'3'.repeat(40)}`)), "gate-windows's step 1 is not pinned to gate's commit"],
  // #351 (q14): setup-node's pin is held equal too.
  ['pins the Windows setup-node apart from gate', inWindows(s => s.replace(/actions\/setup-node@[0-9a-f]{40}/, `actions/setup-node@${'3'.repeat(40)}`)), "gate-windows's step 2 is not pinned to gate's commit"],
  // #351 (q11): the Windows dry-run step plants a real Claude folder, so the installer's real-folder guards run there.
  ['drops the real Claude folder on Windows', inWindows(s => s.replace('          mkdir -p "$HOME/.claude/agents"\n', '')), "gate-windows's dry-run step runs other lines than the dry run"],
  ['renames the Windows check', inWindows(s => s.replace('    name: gate-windows\n', '    name: windows\n')), "gate-windows's check is not named gate-windows"],
  ['runs a line before the dry run', s => s.replace('          mkdir -p "$RUNNER_TEMP/pact-home"\n', '          export CI=\n          mkdir -p "$RUNNER_TEMP/pact-home"\n'), "gate's dry-run step runs other lines than the dry run"],
  ['drops the concurrency group', s => s.replace(/^concurrency:\n(?: {2}.+\n)+/m, ''), CANCELS],
  ['keys the concurrency group on the ref alone', s => s.replace(/^( {2}group: ).*$/m, '$1gate-${{ github.ref }}'), CANCELS],
  // #351 (q14): the group cancels the older run, not only groups it.
  ['turns off cancelling an older run', s => s.replace('  cancel-in-progress: true\n', '  cancel-in-progress: false\n'), CANCELS],
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
  // #351 C2 (#348 S4.2): gate-windows is the second required check's name.
  ['defines a job named gate-windows', OTHER.replace('  lint:', '  gate-windows:'), 'other.yml defines a job or check named gate-windows'],
  ['names a job gate-windows', OTHER.replace('    runs-on:', '    name: gate-windows\n    runs-on:'), 'other.yml defines a job or check named gate-windows'],
  // Spec 0003 M7: gate-macos is the third required check's name.
  ['defines a job named gate-macos', OTHER.replace('  lint:', '  gate-macos:'), 'other.yml defines a job or check named gate-macos'],
  ['names a job gate-macos', OTHER.replace('    runs-on:', '    name: gate-macos\n    runs-on:'), 'other.yml defines a job or check named gate-macos'],
  ['names a job gate-macos before a comment', OTHER.replace('    runs-on:', '    name: gate-macos # look-alike\n    runs-on:'), 'other.yml defines a job or check named gate-macos'],
  ['defines a quoted job id gate-macos', OTHER.replace('  lint:', "  'gate-macos':"), 'other.yml defines a job or check named gate-macos'],
  ['defines a job id GATE-MACOS', OTHER.replace('  lint:', '  GATE-MACOS:'), 'other.yml defines a job or check named gate-macos'],
  ['names a job gate-macos in a stripped literal block', OTHER.replace('    runs-on:', '    name: |-\n      gate-macos\n    runs-on:'), 'other.yml defines a job or check named gate-macos'],
  // #351, the first read's F4 (q3): a trailing comment or a quoted key doesn't hide the name.
  ['names a job gate-windows before a comment', OTHER.replace('    runs-on:', '    name: gate-windows # look-alike\n    runs-on:'), 'other.yml defines a job or check named gate-windows'],
  ['defines a quoted job id gate-windows', OTHER.replace('  lint:', "  'gate-windows':"), 'other.yml defines a job or check named gate-windows'],
  // #357: every other file is read with the YAML reader, so a spelling a line match misses still counts.
  ['defines a job id gate at four-space indent', OTHER.replace(/^ {4}/gm, '        ').replace(/^ {2}(?! )/gm, '    ').replace('    lint:', '    gate:'), 'other.yml defines a job or check named gate'],
  ['names a job with an expression', OTHER.replace('    runs-on:', "    name: lint ${{ 'gate' }}\n    runs-on:"), 'other.yml names a job with an expression'],
  ['holds a shape the reader cannot read', OTHER.replace('    runs-on:', '    name: &n gate\n    runs-on:'), "other.yml can't be read by the check"],
  // #357, the security pair's F1: a block-scalar name, a padded name or another case of the name is still the check's name.
  ['names a job gate in a stripped literal block', OTHER.replace('    runs-on:', '    name: |-\n      gate\n    runs-on:'), 'other.yml defines a job or check named gate'],
  ['names a job gate padded in quotes', OTHER.replace('    runs-on:', "    name: ' gate '\n    runs-on:"), 'other.yml defines a job or check named gate'],
  ['names a job Gate', OTHER.replace('    runs-on:', '    name: Gate\n    runs-on:'), 'other.yml defines a job or check named gate'],
  ['defines a job id GATE-WINDOWS', OTHER.replace('  lint:', '  GATE-WINDOWS:'), 'other.yml defines a job or check named gate-windows'],
  // #356: a line break other than a line feed could hide a key from the reader.
  ['holds a lone carriage return', OTHER.replace('      - run: echo ok', '      - run: echo ok\r    name: gate'), 'other.yml holds a line break or control character other than a line feed'],
  ['holds a line separator', OTHER.replace('      - run: echo ok', '      - run: echo ok\u2028'), 'other.yml holds a line break or control character other than a line feed'],
  ['holds a next-line character', OTHER.replace('      - run: echo ok', '      - run: echo ok\u0085'), 'other.yml holds a line break or control character other than a line feed'],
  ['holds a paragraph separator', OTHER.replace('      - run: echo ok', '      - run: echo ok\u2029'), 'other.yml holds a line break or control character other than a line feed'],
  ['holds a control character', OTHER.replace('      - run: echo ok', '      - run: echo ok\u000b'), 'other.yml holds a line break or control character other than a line feed'],
  // The QA pair's read: the rest of the C0 range, DEL and the C1 range are refused too.
  ['holds a null character', OTHER.replace('      - run: echo ok', '      - run: echo ok\u0000'), 'other.yml holds a line break or control character other than a line feed'],
  ['holds a delete character', OTHER.replace('      - run: echo ok', '      - run: echo ok\u007f'), 'other.yml holds a line break or control character other than a line feed'],
  ['holds the first C1 control character', OTHER.replace('      - run: echo ok', '      - run: echo ok\u0080'), 'other.yml holds a line break or control character other than a line feed'],
  ['holds a backspace', OTHER.replace('      - run: echo ok', '      - run: echo ok\u0008'), 'other.yml holds a line break or control character other than a line feed'],
  ['holds a unit separator', OTHER.replace('      - run: echo ok', '      - run: echo ok\u001f'), 'other.yml holds a line break or control character other than a line feed'],
  ['holds the last C1 control character', OTHER.replace('      - run: echo ok', '      - run: echo ok\u009f'), 'other.yml holds a line break or control character other than a line feed'],
]) {
  test(`bad case: the folder check catches a second workflow file that ${label}`, () => {
    const files = realFolder();
    assert.deepEqual(folderProblems(new Map([...files, ['other.yml', OTHER]])), [], 'control: a locked-down second file passes');
    assert.ok(folderProblems(new Map([...files, ['other.yml', other]])).includes(says), folderProblems(new Map([...files, ['other.yml', other]])).join('\n'));
  });
}

// #356: the gate workflow is held to the same line breaks as every other file.
test('bad case: the folder check catches a gate workflow that holds a lone carriage return', () => {
  const files = realFolder();
  files.set('gate.yml', files.get('gate.yml').replace('\njobs:\n', '\njobs:\r'));
  assert.ok(folderProblems(files).includes('gate.yml holds a line break or control character other than a line feed'), folderProblems(files).join('\n'));
});

// #357, the security pair's H2: a workflow file with an upper-case extension is read too, through the folder's own listing.
test('bad case: the folder check reads a workflow file whose extension is in another case', () => {
  const planted = { 'other.YML': OTHER.replace('  lint:', '  gate:'), 'more.Yaml': OTHER.replace('  lint:', '  gate-windows:'), 'notes.txt': 'not a workflow' };
  const files = realFolder([...readdirSync(WORKFLOWS), ...Object.keys(planted)], n => planted[n] ?? readFileSync(join(WORKFLOWS, n), 'utf8'));
  assert.ok(!files.has('notes.txt'), 'control: a file that is not a workflow is left out');
  assert.ok(folderProblems(files).includes('other.YML defines a job or check named gate'), folderProblems(files).join('\n'));
  assert.ok(folderProblems(files).includes('more.Yaml defines a job or check named gate-windows'), folderProblems(files).join('\n'));
});

// The QA pair's read: the CodeQL workflow is held to the same line breaks, and a CRLF line ending is no stray break.
test('bad case: the folder check catches a CodeQL workflow that holds a lone carriage return', () => {
  const files = realFolder();
  files.set('codeql.yml', files.get('codeql.yml').replace('\njobs:\n', '\njobs:\r'));
  assert.ok(folderProblems(files).includes('codeql.yml holds a line break or control character other than a line feed'), folderProblems(files).join('\n'));
});

test('a CRLF line ending and a tab are not read as a stray line break', () => {
  const files = new Map([...realFolder(), ['other.yml', OTHER.replace('echo ok', 'echo\tok').replace(/\n/g, '\r\n')]]);
  assert.ok(!folderProblems(files).includes('other.yml holds a line break or control character other than a line feed'), folderProblems(files).join('\n'));
});

// #244 C2: the CodeQL workflow as it is passes its allow-list.
test('the CodeQL workflow keeps its allow-list', () => {
  assert.deepEqual(codeqlProblems(readFileSync(CODEQL, 'utf8'), readFileSync(WORKFLOW, 'utf8')), []);
});

const TRIGGERS = 'runs on other triggers than a push to main, every pull request, a weekly schedule and a manual run';
const YAML_FORM = 'uses a YAML anchor, alias, merge key or flow mapping';
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

// Spec 0006 W3, W4: each Claude workflow is held to its own allow-list. Each plant is run against both files unless the row names one.
const CLAUDE_FILES = ['claude.yml', 'claude-code-review.yml'];
const claudeSrc = file => readFileSync(join(WORKFLOWS, file), 'utf8');
const CL = {
  triggers: 'runs on other triggers or event types than its own',
  hot: 'runs on a trigger that holds secrets or a write token',
  top: 'asks for more than read access to the contents at the top level',
  jobs: 'holds a job other than its own',
  perms: 'gives the job other permissions than its own',
  guard: 'runs its job under another guard than its own',
  runner: 'does not run on ubuntu-24.04 with a time limit',
  steps: 'holds other steps than checkout and claude-code-action, in that order',
  secret: 'reads a secret or the token',
  cred: 'sets a credential that takes precedence over federation',
  checkout: 'leaves the token in the checkout',
  upload: 'uploads or caches the workspace',
  run: 'runs a shell command',
  env: 'sets environment variables',
  gatePin: 'pins checkout to another commit than gate.yml',
  named: file => 'is not named ' + CLAUDE[file].name,
};
const WITH = "the action's with";
const sha = c => c.repeat(40);
const hasProblem = (problems, says) => [].concat(says).every(s => problems.some(p => (s instanceof RegExp ? s.test(p) : p === s)));
const afterTimeout = text => s => s.replace('    timeout-minutes: 30\n', '    timeout-minutes: 30\n' + text);
const afterIds = text => s => s.replace(/(anthropic_service_account_id: .*\n)/, m => m + text);
const inActionStep = text => s => s.replace('        with:\n          anthropic_federation_rule_id', text + '        with:\n          anthropic_federation_rule_id');
const afterCheckoutInputs = text => s => s.replace('          persist-credentials: false\n', '          persist-credentials: false\n' + text);
const dropAssociation = s => s.replace(/contains\(fromJSON\('\["OWNER","MEMBER","COLLABORATOR"\]'\), github\.event\.[a-z_.]+\.author_association\) \|\| /, '');
const BOT_LIST = '"mephistos-homunculus[bot]","mephistos-euphorion[bot]","mephistos-wagner[bot]"';

test('the two Claude workflows keep their allow-lists', () => {
  const gate = readFileSync(WORKFLOW, 'utf8');
  for (const file of CLAUDE_FILES) assert.deepEqual(claudeProblems(claudeSrc(file), gate, file), [], file);
});

for (const [label, plant, says, only] of [
  // Triggers: the file's own events and types, and none that holds a secret or a write token.
  ['adds a trigger', s => s.replace('\non:\n', '\non:\n  push:\n'), CL.triggers],
  ['adds a manual run', s => s.replace('\non:\n', '\non:\n  workflow_dispatch:\n'), CL.triggers],
  ['adds pull_request_target', s => s.replace('\non:\n', '\non:\n  pull_request_target:\n'), [CL.hot, CL.triggers]],
  ['adds workflow_run', s => s.replace('\non:\n', '\non:\n  workflow_run:\n    workflows: [gate]\n    types: [completed]\n'), [CL.hot, CL.triggers]],
  ['runs on pull_request_target instead of pull_request', s => s.replace('  pull_request:\n', '  pull_request_target:\n'), [CL.hot, CL.triggers], ['claude-code-review.yml']],
  ['names pull_request_target as a flow list', s => s.replace(/\non:\n {2}pull_request:\n {4}types: .*\n/, '\non: [pull_request_target]\n'), [CL.hot, CL.triggers], ['claude-code-review.yml']],
  ['adds an event type', s => s.replace(/types: \[([^\]]*)\]/, 'types: [$1, edited]'), CL.triggers],
  ['drops the assigned type', s => s.replace('[opened, assigned]', '[opened]'), CL.triggers, ['claude.yml']],
  ['drops the synchronize type', s => s.replace('opened, synchronize, ', 'opened, '), CL.triggers, ['claude-code-review.yml']],
  ['drops a trigger', s => s.replace('  pull_request_review:\n    types: [submitted]\n', ''), CL.triggers, ['claude.yml']],
  ['drops the types of its only trigger', s => s.replace(/ {2}pull_request:\n {4}types: .*\n/, '  pull_request:\n'), CL.triggers, ['claude-code-review.yml']],
  // Top level.
  ['adds a top-level key', s => s.replace('\njobs:\n', '\nconcurrency: x\njobs:\n'), extraKey('the file', 'concurrency')],
  ['sets a top-level env', s => s.replace('\njobs:\n', '\nenv:\n  X: y\njobs:\n'), [CL.env, extraKey('the file', 'env')]],
  ['sets top-level defaults', s => s.replace('\njobs:\n', '\ndefaults:\n  run:\n    shell: sh\njobs:\n'), extraKey('the file', 'defaults')],
  ['drops its name', s => s.replace(/^name: .*\n/, ''), file => CL.named(file)],
  ['is renamed', s => s.replace(/^name: .*\n/, 'name: scan\n'), file => CL.named(file)],
  ['is named for the other file', s => s.replace(/^name: .*\n/, s.startsWith('name: claude-code-review') ? 'name: claude\n' : 'name: claude-code-review\n'), file => CL.named(file)],
  ['writes a key twice', s => s.replace('\npermissions:\n  contents: read\n', '\npermissions:\n  contents: read\n  contents: read\n'), /^is not in the YAML the check reads: the key contents repeats/],
  // Permissions: reads, and id-token: write for the job only.
  ['asks for write access at the top level', s => s.replace('\npermissions:\n  contents: read\n', '\npermissions:\n  contents: write\n'), CL.top],
  ['adds a write permission at the top level', s => s.replace('\npermissions:\n  contents: read\n', '\npermissions:\n  contents: read\n  pull-requests: write\n'), CL.top],
  ['asks for id-token at the top level', s => s.replace('\npermissions:\n  contents: read\n', '\npermissions:\n  contents: read\n  id-token: write\n'), CL.top],
  ['drops the top-level permissions', s => s.replace('\npermissions:\n  contents: read\n', '\n'), [CL.top, 'the file lacks permissions']],
  ['gives the job contents: write', s => s.replace('      contents: read\n', '      contents: write\n'), CL.perms],
  ['gives the job pull-requests: write', s => s.replace('      pull-requests: read\n', '      pull-requests: write\n'), CL.perms],
  ['gives the job issues: write', s => s.replace('      issues: read\n', '      issues: write\n'), CL.perms],
  ['adds a permission to the job', s => s.replace('      id-token: write\n', '      id-token: write\n      packages: read\n'), CL.perms],
  ['adds a write permission to the job', s => s.replace('      id-token: write\n', '      id-token: write\n      statuses: write\n'), CL.perms],
  ['drops id-token from the job', s => s.replace('      id-token: write\n', ''), CL.perms],
  ['asks only for id-token: read', s => s.replace('id-token: write', 'id-token: read'), CL.perms],
  ['drops the job permissions', s => s.replace(/ {4}permissions:\n(?: {6}.+\n)+/, ''), [CL.perms, 'the job lacks permissions']],
  ['gives the job actions: write', s => s.replace('      actions: read\n', '      actions: write\n'), CL.perms, ['claude.yml']],
  ['drops actions from the job', s => s.replace('      actions: read\n', ''), CL.perms, ['claude.yml']],
  ['adds actions: read to the job', s => s.replace('      id-token: write\n', '      id-token: write\n      actions: read\n'), CL.perms, ['claude-code-review.yml']],
  // Jobs.
  ['adds a second job', s => s + '  extra:\n    runs-on: ubuntu-24.04\n', CL.jobs],
  ['renames its job', s => s.replace(/\n {2}(claude|claude-review):\n/, '\n  other:\n'), CL.jobs],
  ['names its job gate', s => s.replace(/\n {2}(claude|claude-review):\n/, '\n  gate:\n'), CL.jobs],
  ['gives its job the name gate', s => s.replace('    runs-on:', '    name: gate\n    runs-on:'), extraKey('the job', 'name')],
  ...['needs', 'strategy', 'container', 'services', 'defaults', 'environment', 'concurrency', 'outputs', 'continue-on-error', 'secrets'].map(key => [
    'gives the job a ' + key + ' key',
    afterTimeout('    ' + key + ': x\n'),
    extraKey('the job', key),
  ]),
  ['sets a job-level env', afterTimeout('    env:\n      X: y\n'), [CL.env, extraKey('the job', 'env')]],
  ['drops the job guard', s => s.replace(/ {4}if: [\s\S]*?\n(?= {4}runs-on)/, ''), [CL.guard, 'the job lacks if']],
  ['runs on a self-hosted runner', s => s.replace('runs-on: ubuntu-24.04', 'runs-on: self-hosted'), CL.runner],
  ['runs on ubuntu-latest', s => s.replace('runs-on: ubuntu-24.04', 'runs-on: ubuntu-latest'), CL.runner],
  ['runs on a runner from a variable', s => s.replace('runs-on: ubuntu-24.04', 'runs-on: ${{ vars.RUNNER }}'), CL.runner],
  ['drops the time limit', s => s.replace('    timeout-minutes: 30\n', ''), [CL.runner, 'the job lacks timeout-minutes']],
  ['sets a time limit that is not a number', s => s.replace('timeout-minutes: 30', 'timeout-minutes: soon'), CL.runner],
  // The guard, held exactly as the file writes it.
  ['drops an association check', dropAssociation, CL.guard],
  ['lets in another association', s => s.replace('"COLLABORATOR"', '"COLLABORATOR","CONTRIBUTOR"'), CL.guard],
  ['lets in everyone', s => s.replace('["OWNER","MEMBER","COLLABORATOR"]', '["OWNER","MEMBER","COLLABORATOR","NONE"]'), CL.guard],
  ['drops the @claude check on comments', s => s.replace("contains(github.event.comment.body, '@claude') && ", ''), CL.guard, ['claude.yml']],
  ['drops the @claude check on reviews', s => s.replace("contains(github.event.review.body, '@claude') && ", ''), CL.guard, ['claude.yml']],
  ['drops the @claude check on issues', s => s.replace("(contains(github.event.issue.body, '@claude') || contains(github.event.issue.title, '@claude'))", 'true'), CL.guard, ['claude.yml']],
  ['drops an event from the guard', s => s.replace(/ \|\|\n {6}\(github\.event_name == 'issues'.*\n/, '\n'), CL.guard, ['claude.yml']],
  ['writes its guard on one line', s => s.replace('    if: |\n      (github', '    if: (github').replace(/\n {6}\(github/g, ' (github'), CL.guard, ['claude.yml']],
  ['drops the check that the head is this repo', s => s.replace('github.event.pull_request.head.repo.full_name == github.repository && ', ''), CL.guard, ['claude-code-review.yml']],
  ['checks the base repo instead of the head', s => s.replace('pull_request.head.repo.full_name', 'pull_request.base.repo.full_name'), CL.guard, ['claude-code-review.yml']],
  ['joins its guard with or', s => s.replace(' && (contains(fromJSON', ' || (contains(fromJSON'), CL.guard, ['claude-code-review.yml']],
  ['drops the app logins from the guard', s => s.replace(/ \|\| contains\(fromJSON\('\["mephistos.*?\]'\), github\.event\.[a-z_]+\.user\.login\)/, ''), CL.guard],
  ['lets in an extra login', s => s.replace('"mephistos-wagner[bot]"', '"mephistos-wagner[bot]","other[bot]"'), CL.guard],
  ['lets in an extra login by its bare name', s => s.replace('"mephistos-wagner[bot]"', '"mephistos-wagner[bot]","other"'), CL.guard],
  ['lets in any bot', s => s.replace('"mephistos-wagner[bot]"', '"*[bot]"'), CL.guard],
  ['drops an app from the guard', s => s.replace(',"mephistos-wagner[bot]"', ''), CL.guard],
  ['checks the sender instead of the author', s => s.replace('.user.login', '.sender.login'), CL.guard],
  ['admits a login on its own', s => s.replace(BOT_LIST + ']\'), github.event.', BOT_LIST + ']\'), github.actor, github.event.'), CL.guard],
  ['reads the association of the wrong author', s => s.replace('github.event.pull_request.author_association', 'github.event.sender.author_association'), CL.guard, ['claude-code-review.yml']],
  ['ends its guard in true', s => s.replace(/(if: .*)\n/, '$1 || true\n'), CL.guard, ['claude-code-review.yml']],
  // Steps and pins.
  ['pins checkout to a tag', s => s.replace(/actions\/checkout@[0-9a-f]{40}/, 'actions/checkout@v7'), 'step 1 is not actions/checkout pinned to a full commit SHA'],
  ['pins the action to a tag', s => s.replace(/claude-code-action@[0-9a-f]{40}/, 'claude-code-action@v1'), 'step 2 is not anthropics/claude-code-action pinned to a full commit SHA'],
  ['pins the action to a branch', s => s.replace(/claude-code-action@[0-9a-f]{40}/, 'claude-code-action@main'), 'step 2 is not anthropics/claude-code-action pinned to a full commit SHA'],
  ['pins the action to a short SHA', s => s.replace(/claude-code-action@[0-9a-f]{40}/, 'claude-code-action@eb56b66'), 'step 2 is not anthropics/claude-code-action pinned to a full commit SHA'],
  ['uses another action in its place', s => s.replace('anthropics/claude-code-action@', 'someone/claude-code-action@'), 'step 2 is not anthropics/claude-code-action pinned to a full commit SHA'],
  ['uses a local action', s => s.replace(/anthropics\/claude-code-action@[0-9a-f]{40}/, './.github/actions/mine'), 'step 2 is not anthropics/claude-code-action pinned to a full commit SHA'],
  ["pins checkout apart from gate.yml's", s => s.replace(/actions\/checkout@[0-9a-f]{40}/, 'actions/checkout@' + sha('2')), CL.gatePin],
  ['runs the action before checkout', s => s.replace(/( {6}- uses: actions\/checkout@.*\n(?: {8,}.+\n)+)( {6}- uses: anthropics.*\n[\s\S]*)$/, '$2$1'), CL.steps],
  ['drops the checkout', s => s.replace(/ {6}- uses: actions\/checkout@.*\n(?: {8,}.+\n)+/, ''), CL.steps],
  ['adds a pinned action', s => s + '      - uses: actions/setup-node@' + sha('1') + '\n', CL.steps],
  ['runs a shell step', s => s + '      - run: echo hi\n', [CL.run, CL.steps]],
  ['uploads the workspace', s => s + '      - uses: actions/upload-artifact@' + sha('0') + '\n', [CL.upload, CL.steps]],
  ['caches the workspace', s => s + '      - uses: actions/cache@' + sha('0') + '\n', [CL.upload, CL.steps]],
  ...['name', 'id', 'if', 'shell', 'continue-on-error', 'timeout-minutes'].map(key => ['gives the action step a ' + key + ' key', inActionStep('        ' + key + ': x\n'), extraKey('step 2', key)]),
  ['gives the action step a run key', inActionStep('        run: x\n'), [CL.run, extraKey('step 2', 'run')]],
  ['gives the checkout step a name', s => s.replace('      - uses: actions/checkout', '      - name: x\n        uses: actions/checkout'), extraKey('step 1', 'name')],
  ['sets a step-level env', inActionStep('        env:\n          X: y\n'), [CL.env, extraKey('step 2', 'env')]],
  // Checkout.
  ['keeps the token in the checkout', s => s.replace('persist-credentials: false', 'persist-credentials: true'), CL.checkout],
  ['leaves persist-credentials out', s => s.replace('          persist-credentials: false\n', ''), [CL.checkout, "step 1's with lacks persist-credentials"]],
  ['writes persist-credentials as a word', s => s.replace('persist-credentials: false', "persist-credentials: 'no'"), CL.checkout],
  ...['ref', 'token', 'repository', 'path', 'submodules', 'ssh-key', 'sparse-checkout'].map(key => ['gives checkout a ' + key + ' input', afterCheckoutInputs('          ' + key + ': x\n'), extraKey("step 1's with", key)]),
  ['writes the checkout step\'s with as nothing', s => s.replace(/ {8}with:\n {10}fetch-depth: 1\n {10}persist-credentials: false\n/, '        with:\n'), ["step 1's with is not a map", CL.checkout]],
  ['writes the checkout step\'s with as a word', s => s.replace(/ {8}with:\n {10}fetch-depth: 1\n {10}persist-credentials: false\n/, '        with: x\n'), ["step 1's with is not a map", CL.checkout]],
  ['writes the action step\'s with as nothing', s => s.replace(/ {8}with:\n {10}anthropic_federation_rule_id[\s\S]*$/, '        with:\n'), "step 2's with is not a map"],
  ['writes the action step\'s with as a word', s => s.replace(/ {8}with:\n {10}anthropic_federation_rule_id[\s\S]*$/, '        with: x\n'), "step 2's with is not a map"],
  ['takes the fetch depth from an expression', s => s.replace('fetch-depth: 1', 'fetch-depth: ${{ github.event.number }}'), "step 1's fetch-depth is not a number"],
  ['drops the fetch depth', s => s.replace('          fetch-depth: 1\n', ''), "step 1's with lacks fetch-depth"],
  // The action's inputs.
  ...['allow_fork_prs', 'allowed_non_write_users', 'github_token', 'trigger_phrase', 'settings', 'bot_name', 'use_bedrock'].map(key => [
    'gives the action a ' + key + ' input',
    afterIds('          ' + key + ': x\n'),
    extraKey(WITH, key),
  ]),
  ...['anthropic_api_key', 'claude_code_oauth_token'].map(key => ['gives the action a ' + key + ' input', afterIds('          ' + key + ': x\n'), [extraKey(WITH, key), CL.cred]]),
  ['allows every bot', s => s.replace(/(allowed_bots: ).*/, "$1'*'"), 'holds another allowed_bots than its own'],
  ['allows an extra bot', s => s.replace(/(allowed_bots: .*)/, '$1,renovate'), 'holds another allowed_bots than its own'],
  ['allows an extra bot with its suffix', s => s.replace(/(allowed_bots: .*)/, '$1,dependabot[bot]'), 'holds another allowed_bots than its own'],
  ['drops an app from allowed_bots', s => s.replace(',mephistos-wagner', ''), 'holds another allowed_bots than its own'],
  ['writes the apps with their suffix', s => s.replace(/(allowed_bots: ).*/, "$1'" + APPS.map(a => a + '[bot]').join(',') + "'"), 'holds another allowed_bots than its own'],
  ['allows no bot', s => s.replace(/(allowed_bots: ).*/, "$1''"), 'holds another allowed_bots than its own'],
  ['drops allowed_bots', s => s.replace(/ {10}allowed_bots: .*\n/, ''), WITH + ' lacks allowed_bots'],
  ['reads the API key from a secret', afterIds('          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}\n'), [CL.secret, CL.cred, extraKey(WITH, 'anthropic_api_key')]],
  ['reads the OAuth token from a secret', afterIds('          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}\n'), [CL.secret, CL.cred, extraKey(WITH, 'claude_code_oauth_token')]],
  ['reads a secret by index', afterIds("          settings: ${{ secrets['X'] }}\n"), CL.secret],
  ['passes the job token', afterIds('          github_token: ${{ github.token }}\n'), [CL.secret, extraKey(WITH, 'github_token')]],
  ['passes the job token by an index', afterIds("          github_token: ${{ github['token'] }}\n"), [CL.secret, extraKey(WITH, 'github_token')]],
  ['passes the job token by a double-quoted index', afterIds('          github_token: ${{ github["token"] }}\n'), [CL.secret, extraKey(WITH, 'github_token')]],
  ['passes the job token by its other name', afterIds('          github_token: ${{ env.GITHUB_TOKEN }}\n'), CL.secret],
  ['reads a secret in the checkout', afterCheckoutInputs('          token: ${{ secrets.X }}\n'), [CL.secret, extraKey("step 1's with", 'token')]],
  ['reads a secret in its name', s => s.replace(/^name: .*\n/, 'name: ${{ secrets.X }}\n'), CL.secret],
  ...['anthropic_federation_rule_id', 'anthropic_organization_id', 'anthropic_service_account_id'].map(key => [
    'drops ' + key,
    s => s.replace(new RegExp(' {10}' + key + ': .*\\n'), ''),
    WITH + ' lacks ' + key,
  ]),
  ['gives the rule ID the wrong prefix', s => s.replace('fdrl_', 'xdrl_'), 'holds another anthropic_federation_rule_id than its own'],
  ['gives the service account ID the wrong prefix', s => s.replace('svac_', 'svc_'), 'holds another anthropic_service_account_id than its own'],
  ['gives the organization ID no UUID shape', s => s.replace(/(anthropic_organization_id: ).*/, '$1not-a-uuid'), 'holds another anthropic_organization_id than its own'],
  ['takes the rule ID from an expression', s => s.replace(/(anthropic_federation_rule_id: ).*/, '$1${{ vars.RULE }}'), 'holds another anthropic_federation_rule_id than its own'],
  ['takes the organization ID from a secret', s => s.replace(/(anthropic_organization_id: ).*/, '$1${{ secrets.ORG }}'), [CL.secret, 'holds another anthropic_organization_id than its own']],
  ...[
    ['anthropic_federation_rule_id', 'fdrl_01V8jy6dtvy7Ebf916SRieMF'],
    ['anthropic_organization_id', '6161ef7b-3383-44f6-bd62-34226aa8c2fd'],
    ['anthropic_service_account_id', 'svac_01QUZe8emXQcqnE1opH93J5f'],
  ].map(([key, other]) => ['swaps ' + key + ' for another well-formed ID', s => s.replace(new RegExp('(' + key + ': ).*'), '$1' + other), 'holds another ' + key + ' than its own']),
  ['asks for more permissions', s => s.replace('additional_permissions: |\n            actions: read\n', 'additional_permissions: |\n            actions: write\n'), 'holds another additional_permissions than its own', ['claude.yml']],
  ['adds a permission to additional_permissions', s => s.replace('            actions: read\n', '            actions: read\n            contents: write\n'), 'holds another additional_permissions than its own', ['claude.yml']],
  ['drops additional_permissions', s => s.replace(/ {10}additional_permissions: \|\n {12}actions: read\n/, ''), WITH + ' lacks additional_permissions', ['claude.yml']],
  ['changes the prompt', s => s.replace('--comment ', '--comment --dangerous '), 'holds another prompt than its own', ['claude-code-review.yml']],
  ['takes the prompt from the pull request', s => s.replace(/(prompt: ).*/, "$1'${{ github.event.pull_request.body }}'"), 'holds another prompt than its own', ['claude-code-review.yml']],
  ['widens the allowed tools', s => s.replace('mcp__github_inline_comment__create_inline_comment', 'Bash'), 'holds another claude_args than its own', ['claude-code-review.yml']],
  ['lets the review merge', s => s.replace('Bash(gh pr list:*)', 'Bash(gh pr list:*),Bash(gh pr merge:*)'), 'holds another claude_args than its own', ['claude-code-review.yml']],
  ['lets the review run any gh command', s => s.replace('Bash(gh pr view:*)', 'Bash(gh:*)'), 'holds another claude_args than its own', ['claude-code-review.yml']],
  ['adds an argument', s => s.replace('--allowedTools', '--dangerously-skip-permissions --allowedTools'), 'holds another claude_args than its own', ['claude-code-review.yml']],
  ['drops claude_args', s => s.replace(/ {10}claude_args: .*\n/, ''), WITH + ' lacks claude_args', ['claude-code-review.yml']],
  ['fetches the plugin from another marketplace', s => s.replace('github.com/anthropics/claude-code.git', 'github.com/someone/claude-code.git'), 'holds another plugin_marketplaces than its own', ['claude-code-review.yml']],
  ['loads another plugin', s => s.replace('code-review@claude-code-plugins', 'other@claude-code-plugins'), 'holds another plugins than its own', ['claude-code-review.yml']],
  // YAML forms the reader cannot see through.
  ['uses a YAML anchor and alias', s => s.replace('    runs-on: ubuntu-24.04\n    timeout-minutes: 30\n', '    runs-on: &runner ubuntu-24.04\n    timeout-minutes: *runner\n'), YAML_FORM],
  ['uses a merge key', afterTimeout('    <<: x\n'), YAML_FORM],
  ['uses a flow mapping', s => s.replace('        with:\n          fetch-depth: 1\n          persist-credentials: false\n', '        with: { fetch-depth: 1, persist-credentials: false }\n'), YAML_FORM],
  ['uses a flow mapping for its permissions', s => s.replace('\npermissions:\n  contents: read\n', '\npermissions: { contents: read }\n'), YAML_FORM],
]) {
  for (const file of CLAUDE_FILES.filter(f => !only || only.includes(f))) {
    // Spec 0006 C2: each rule of the Claude workflows' allow-list catches its plant.
    test('bad case: the Claude allow-list catches ' + file + ' when it ' + label, () => {
      const src = claudeSrc(file);
      const planted = plant(src);
      assert.notEqual(planted, src, 'the plant changed nothing');
      const wanted = typeof says === 'function' ? says(file) : says;
      const problems = claudeProblems(planted, readFileSync(WORKFLOW, 'utf8'), file);
      assert.ok(hasProblem(problems, wanted), problems.join('\n'));
    });
  }
}

// Spec 0006 W3: each file is held to its own values, not the other's.
test("bad case: the Claude allow-list catches each file read against the other file's values", () => {
  const gate = readFileSync(WORKFLOW, 'utf8');
  assert.notDeepEqual(claudeProblems(claudeSrc('claude.yml'), gate, 'claude-code-review.yml'), []);
  assert.notDeepEqual(claudeProblems(claudeSrc('claude-code-review.yml'), gate, 'claude.yml'), []);
});

// Spec 0006 W3: the folder check hands the two files to the allow-list, and every other file stays under the common lockdown.
for (const file of CLAUDE_FILES) {
  test('bad case: the folder check holds ' + file + ' to the Claude allow-list', () => {
    const files = realFolder();
    files.set(file, files.get(file).replace('      id-token: write\n', '      id-token: write\n      packages: read\n'));
    assert.ok(folderProblems(files).includes(file + ' ' + CL.perms), folderProblems(files).join('\n'));
  });
  test('bad case: the folder check refuses a job named gate in ' + file, () => {
    const files = realFolder();
    files.set(file, files.get(file).replace(/\n {2}(claude|claude-review):\n/, '\n  gate:\n'));
    assert.ok(folderProblems(files).includes(file + ' defines a job or check named gate'), folderProblems(files).join('\n'));
  });
  for (const gateJob of ['gate-windows', 'gate-macos']) {
    test('bad case: the folder check refuses a job named ' + gateJob + ' through the name key in ' + file, () => {
      const files = realFolder();
      files.set(file, files.get(file).replace('    runs-on:', '    name: ' + gateJob + '\n    runs-on:'));
      assert.ok(folderProblems(files).includes(file + ' defines a job or check named ' + gateJob), folderProblems(files).join('\n'));
    });
  }
  // Spec 0006 W3: a copy under another name gets the common lockdown, which refuses it for asking for more than read access: it holds two permissions blocks.
  for (const copy of ['claude-copy.yml', 'Claude.yml', 'claude.yaml']) {
    test('bad case: the folder check catches a third workflow file, ' + copy + ', that copies ' + file, () => {
      const files = realFolder();
      assert.deepEqual(folderProblems(files), [], 'control: the real folder passes');
      files.set(copy, files.get(file));
      assert.ok(folderProblems(files).includes(copy + ' asks for more than read access to the contents'), folderProblems(files).join('\n'));
    });
  }
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

// #311 C4: on Linux under CI a wrong environment fails the test; anywhere else it skips.
test('skipUnlessLinuxCi fails on Linux under CI and skips elsewhere', () => {
  const skips = [];
  const t = { skip: r => skips.push(r) };
  assert.throws(() => skipUnlessLinuxCi(t, 'why', { platform: 'linux', ci: 'true' }), /Linux CI must run this case, but: why/);
  assert.deepEqual(skips, []);
  skipUnlessLinuxCi(t, 'a', { platform: 'linux', ci: '' });
  skipUnlessLinuxCi(t, 'b', { platform: 'win32', ci: 'true' });
  assert.deepEqual(skips, ['a', 'b']);
  // The call sites use the defaults: the platform and CI of this process.
  const saved = process.env.CI;
  try {
    process.env.CI = 'true';
    assert.throws(() => skipUnlessLinuxCi(t, 'c', { platform: 'linux' }), /Linux CI must run this case/);
    const onLinux = process.platform === 'linux';
    let threw = false;
    try { skipUnlessLinuxCi(t, 'd', { ci: 'true' }); } catch { threw = true; }
    assert.equal(threw, onLinux);
  } finally {
    if (saved === undefined) delete process.env.CI;
    else process.env.CI = saved;
  }
});
