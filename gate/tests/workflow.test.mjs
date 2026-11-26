// The commit-time layer's lockdown (#153, S11): the gate workflow reads the
// repo with a read-only token, holds no secret, never runs on
// pull_request_target, pins every action to a full commit SHA, leaves no
// token in the checkout, uploads nothing, and runs the dry run and the full
// tier, install tests included (#303), on the Node floor. Every other workflow file keeps the same lockdown,
// and none may define a job named gate, the required check's name (#166). It
// reads the files' text; it can't see what GitHub does with them, which the
// S15 CI probe records.
//
// The release workflow (spec 0007 S10) alone may run on workflow_run; it is
// held to an exact allow-list of its own.
//
// The CodeQL workflow (#239, #244) may ask for more: it uploads code-scanning
// results, so its one job holds security-events: write. The Claude
// workflow (spec 0006) may too: its job holds id-token: write, to trade
// GitHub's OIDC token for an Anthropic token, and holds no secret. Each of the
// two is held to an exact allow-list instead of the common lockdown. The
// CodeQL configuration leaves the gate's test files out of the scan, which is safe
// only while nothing outside gate/tests/ loads a file inside it; the premise
// test below checks that. Each check keeps its passing case on the real
// files; their planted bad cases were cut (PACT-114, decision 197), but for
// the review workflow's refusal, a check family #686 added, and the release
// allow-list and the secret, environment and #-line rules PACT-105 added.
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
// codeOf drops such a line even inside a script block, where GitHub still fills in an expression.
const HIDDEN = /^\s*#.*\$\{\{/m;
const HIDES = 'holds an expression on a line that starts with #';

/** Where any workflow file breaks the lockdown every workflow keeps, as plain sentences; empty when it keeps it. */
function commonProblems(src) {
  const code = codeOf(src);
  const out = [];
  if (/pull_request_target|workflow_run/.test(code)) out.push('runs on a trigger that holds secrets or a write token');
  const perms = /^permissions:\n((?:[ \t]+.+\n)+)/m.exec(`${code}\n`);
  if (!perms || perms[1].trim() !== 'contents: read' || (code.match(/^\s*permissions:/gm) ?? []).length !== 1) out.push('asks for more than read access to the contents');
  // Spec 0007 S10: any form of a secret read, in any case, and no environment, which could hold a secret.
  if (/\bsecrets\b|\$\{\{\s*github\.token|GITHUB_TOKEN/i.test(code)) out.push('reads a secret or the token');
  if (/(?:^\s*(?:- )?|[{,]\s*)['"]?environment['"]?\s*:/im.test(code)) out.push('names a deployment environment');
  if (HIDDEN.test(src)) out.push(HIDES);
  for (const m of code.matchAll(/uses:\s*(\S+)/g)) if (!/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/.test(m[1])) out.push(`uses ${m[1]}, not pinned to a full commit SHA`);
  // #351: every checkout step, not only the first.
  const checkouts = [...`${code}\n`.matchAll(/uses: actions\/checkout@[0-9a-f]{40}[^\n]*\n((?: {8,}.+\n)*)/g)];
  if (checkouts.length !== (code.match(/uses: actions\/checkout@/g) ?? []).length || checkouts.some(c => !/persist-credentials: false/.test(c[1]))) out.push('leaves the token in the checkout');
  if (/upload-artifact|actions\/cache/.test(code)) out.push('uploads or caches the workspace');
  return out;
}

// #351 (#348 S4.1): the gate workflow's two jobs, the runner each is pinned to, and its full-tier line; the Windows run checks its skips against a committed list (q2).
const FULL = 'env -u NODE_OPTIONS node gate/tests/run.mjs full';
const DRY_RUN = 'env -u NODE_OPTIONS node gate/install.mjs --home "$RUNNER_TEMP/pact-home"';
const DRY_STEP = `mkdir -p "$RUNNER_TEMP/pact-home/.claude"\n${DRY_RUN}\n`;
// The Windows step also plants a real Claude folder with a plain subfolder in the runner's home, as the Linux container's image does, so the installer's real-folder guards run (q11).
const REAL_DRY_STEP = `mkdir -p "$RUNNER_TEMP/pact-home/.claude"\nmkdir -p "$HOME/.claude/agents"\n${DRY_RUN}\n`;
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
  if (/\bsecrets\b|\$\{\{\s*github\.token|GITHUB_TOKEN/i.test(code)) out.push('reads a secret or the token');
  if (HIDDEN.test(src)) out.push(HIDES);
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

// Spec 0006 V2 W3, W4: the one Claude workflow, held to an exact allow-list of its own. It reads no secret:
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
// The federation IDs are identifiers, not credentials, and are held exactly: another well-formed ID would point a run at another rule.
const FEDERATION = {
  anthropic_federation_rule_id: 'fdrl_01V8jy6dtvy7Ebf916SRieME',
  anthropic_organization_id: '6161ef7b-3383-44f6-bd62-34226aa8c2fc',
  anthropic_service_account_id: 'svac_01QUZe8emXQcqnE1opH93J5e',
};
// W2.5, W2.6: the caps and the two tools tag mode lacks, held exactly. A run reviews through the inline comment tool and opens a pull request through gh pr create.
const CLAUDE_ARGS = '--model claude-sonnet-5-5 --max-turns 60 --max-budget-usd 5 --allowedTools "mcp__github_inline_comment__create_inline_comment,Bash(gh pr create:*)"';
const CLAUDE = {
  'claude.yml': {
    name: 'claude',
    job: 'claude',
    on: { issue_comment: ['created'], pull_request_review_comment: ['created'], issues: ['opened', 'assigned'], pull_request_review: ['submitted'] },
    permissions: { contents: 'read', 'pull-requests': 'read', issues: 'read', actions: 'read', 'id-token': 'write' },
    guard: ANSWER_GUARD,
    // W2.6: one group per issue or pull request; a run in progress is never cancelled.
    concurrency: { group: 'claude-${{ github.event.issue.number || github.event.pull_request.number }}', 'cancel-in-progress': 'false' },
    inputs: { ...FEDERATION, allowed_bots: APPS.join(','), additional_permissions: 'actions: read\n', claude_args: CLAUDE_ARGS },
  },
};
// Spec 0006 V2 W1: the review workflow ran on every push to every pull request; it is gone, and a file by its name is refused.
const REVIEW_GONE = 'is the review workflow V2 removed';
const isReviewFile = n => /^claude-code-review\.ya?ml$/i.test(n);
/** A value with every map's keys in order, so two maps compare by what they hold. */
const sorted = v => (isMap(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => [k, sorted(x)])) : v);
const sameSet = (a, b) => same(sorted(a), sorted(b));

/**
 * Where the Claude workflow breaks its allow-list, as plain
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
  if (HIDDEN.test(src)) out.push(HIDES);
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
  extras('the job', job, ['if', 'runs-on', 'timeout-minutes', 'concurrency', 'permissions', 'steps']);
  if (!sameSet(job.permissions, spec.permissions)) out.push('gives the job other permissions than its own');
  if (job.if !== spec.guard) out.push('runs its job under another guard than its own');
  if (job['runs-on'] !== 'ubuntu-24.04' || job['timeout-minutes'] !== '30') out.push('does not run on ubuntu-24.04 with a 30-minute time limit');
  if (!sameSet(job.concurrency, spec.concurrency)) out.push('runs under another concurrency group than its own');

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
    // W2.7: a review's git diff needs a merge base, so the checkout keeps the full history.
    if (checkout['fetch-depth'] !== '0') out.push("step 1's fetch-depth is not 0, a full history");
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

// Spec 0007 S10, decision 177: the release workflow, the one file that may run on workflow_run. Its one job's condition, held as written.
const RELEASE_IF = `github.ref == 'refs/heads/main' &&
vars.PACT_RELEASES == 'on' &&
github.event_name == 'workflow_run' &&
github.event.workflow_run.conclusion == 'success' &&
github.event.workflow_run.event == 'push' &&
github.event.workflow_run.head_branch == 'main' &&
github.event.workflow_run.head_repository.full_name == github.repository
`;
// The one trigger: the gate's completion. No manual run, so no input.
const RELEASE_ON = { workflow_run: { workflows: ['gate'], types: ['completed'] } };
// The tag step's name and script env: the workflow's own token, and the run's commit.
const RELEASE_STEP = { name: 'Tag a release candidate', env: { TOKEN: '${{ github.token }}', HEAD_SHA: '${{ github.event.workflow_run.head_sha }}' } };

/**
 * Where the release workflow breaks its allow-list, as plain sentences; empty
 * when it keeps it. One job, candidate, tags a release candidate with the
 * workflow's own token, contents: write on that job alone; it reads no secret,
 * names no environment, uses no app token and takes no manual run, and checks
 * nothing out. What its script does is the release job test's.
 */
function releaseProblems(src) {
  const code = codeOf(src);
  const out = [];
  const extras = (where, obj, keys) => {
    if (!isMap(obj)) return out.push(`${where} is not a map`);
    for (const k of Object.keys(obj)) if (!keys.includes(k)) out.push(extraKey(where, k));
    for (const k of keys) if (!Object.hasOwn(obj, k)) out.push(`${where} lacks ${k}`);
  };
  if (/pull_request_target/.test(code)) out.push('runs on a trigger that holds secrets or a write token');
  if (HIDDEN.test(src)) out.push(HIDES);
  // GitHub reads context names in any case: no secret in any form, no environment, no app token.
  if (/\bsecrets\b/i.test(code)) out.push('reads a secret');
  if (/(?:^\s*(?:- )?|[{,]\s*)['"]?environment['"]?\s*:/im.test(code)) out.push('names a deployment environment');
  if (/create-github-app-token|PACT_RELEASE_APP/i.test(code)) out.push('uses a release app or its key');
  // The workflow's token is read once, in the tag step's TOKEN.
  if ((code.match(/\bgithub\s*\.\s*token\b|\bgithub\s*\[\s*['"]token|GITHUB_TOKEN/gi) ?? []).length !== 1) out.push("reads the workflow's token other than once, in the tag step's TOKEN");
  if (/actions\/checkout/.test(code)) out.push('checks the repo out');
  if (/upload-artifact|\bcache\b/.test(code)) out.push('uploads or caches the workspace');
  let w;
  try {
    w = readYaml(code);
  } catch (e) {
    return [...out, `is not in the YAML the check reads: ${e.message}`];
  }
  extras('the file', w, ['name', 'on', 'permissions', 'jobs']);
  if (w.name !== 'release') out.push('is not named release');
  if (!sameSet(w.on, RELEASE_ON)) out.push("runs on another trigger than the gate workflow's completion");
  if (!same(w.permissions, { contents: 'read' })) out.push('asks for more than read access to the contents');
  if (!isMap(w.jobs) || !same(Object.keys(w.jobs), ['candidate'])) out.push('holds jobs other than candidate');
  const at = 'the candidate job';
  const job = isMap(w.jobs?.candidate) ? w.jobs.candidate : {};
  extras(at, job, ['if', 'runs-on', 'timeout-minutes', 'permissions', 'concurrency', 'steps']);
  if (job.if !== RELEASE_IF) out.push(`${at} runs without exactly spec 0007's conditions`);
  if (job['runs-on'] !== 'ubuntu-24.04' || !/^[1-9]\d*$/.test(job['timeout-minutes'] ?? '')) out.push(`${at} does not run on ubuntu-24.04 with a time limit`);
  if (!same(job.permissions, { contents: 'write' })) out.push(`${at} does not hold exactly contents: write`);
  if (!sameSet(job.concurrency, { group: 'release', 'cancel-in-progress': 'false' })) out.push(`${at} does not run in the release concurrency group that never cancels`);
  const steps = Array.isArray(job.steps) ? job.steps : [];
  if (steps.length !== 1) out.push(`${at} holds other steps than the tag's`);
  const [tag] = steps;
  extras(`${at} step 1`, tag, ['name', 'env', 'shell', 'run']);
  if (tag?.name !== RELEASE_STEP.name || !sameSet(tag?.env, RELEASE_STEP.env) || tag?.shell !== 'node {0}') out.push(`${at} hands the script another name, environment or shell than its own`);
  // An expression inside the script would be pasted into the code before it runs.
  if (typeof tag?.run !== 'string' || tag.run.includes('${{')) out.push(`${at} has no script, or puts an expression into it`);
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
/** Where the workflow folder breaks the lockdown: the gate workflow's own, the allow-lists of the CodeQL workflow and the Claude workflow, every other file's common lockdown, no review workflow, and no other job named gate or gate-windows. */
function folderProblems(files) {
  const out = [];
  if (!files.has('gate.yml')) out.push('has no gate.yml');
  for (const [name, src] of files) {
    const problems = name === 'gate.yml' ? lockdownProblems(src) : name === 'codeql.yml' ? codeqlProblems(src, files.get('gate.yml') ?? '') : Object.hasOwn(CLAUDE, name) ? claudeProblems(src, files.get('gate.yml') ?? '', name) : name === 'release.yml' ? releaseProblems(src) : commonProblems(src);
    out.push(...problems.map(p => `${name} ${p}`));
    if (isReviewFile(name)) out.push(`${name} ${REVIEW_GONE}`);
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

test('the gate workflow keeps its lockdown', () => {
  assert.deepEqual(lockdownProblems(readFileSync(WORKFLOW, 'utf8')), []);
});

test('every workflow file keeps the lockdown, and only the gate workflow names a gate job', () => {
  assert.deepEqual(folderProblems(realFolder()), []);
});

const OTHER = "name: other\non:\n  pull_request:\npermissions:\n  contents: read\njobs:\n  lint:\n    runs-on: ubuntu-24.04\n    steps:\n      - run: echo ok\n";
test('a CRLF line ending and a tab are not read as a stray line break', () => {
  const files = new Map([...realFolder(), ['other.yml', OTHER.replace('echo ok', 'echo\tok').replace(/\n/g, '\r\n')]]);
  assert.ok(!folderProblems(files).includes('other.yml holds a line break or control character other than a line feed'), folderProblems(files).join('\n'));
});

// #244 C2: the CodeQL workflow as it is passes its allow-list.
test('the CodeQL workflow keeps its allow-list', () => {
  assert.deepEqual(codeqlProblems(readFileSync(CODEQL, 'utf8'), readFileSync(WORKFLOW, 'utf8')), []);
});

// Spec 0006 W3, W4: the one Claude workflow is held to its own allow-list.
const CLAUDE_FILES = ['claude.yml'];
const claudeSrc = file => readFileSync(join(WORKFLOWS, file), 'utf8');

test('the Claude workflow keeps its allow-list', () => {
  const gate = readFileSync(WORKFLOW, 'utf8');
  for (const file of CLAUDE_FILES) assert.deepEqual(claudeProblems(claudeSrc(file), gate, file), [], file);
});

// Spec 0006 V2 W3: the review workflow is gone, and a file by its name, in any case or extension, is refused.
for (const name of ['claude-code-review.yml', 'Claude-Code-Review.yml', 'claude-code-review.yaml']) {
  test('bad case: the folder check refuses a review workflow named ' + name, () => {
    const files = realFolder();
    assert.deepEqual(folderProblems(files), [], 'control: the real folder passes');
    // OTHER passes the common lockdown, so the name alone is what the check refuses.
    files.set(name, OTHER);
    assert.deepEqual(folderProblems(files), [name + ' ' + REVIEW_GONE]);
  });
}

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

const RELEASE = join(WORKFLOWS, 'release.yml');
// PACT-105 C23: the release workflow as it is passes its allow-list.
test('the release workflow keeps its allow-list', () => {
  assert.deepEqual(releaseProblems(readFileSync(RELEASE, 'utf8')), []);
});

const C = 'the candidate job';
const TRIGGERS_SAY = "runs on another trigger than the gate workflow's completion";
const NO_CONDITION = `${C} runs without exactly spec 0007's conditions`;
const SECRET = 'reads a secret';
const ENVIRONMENT = 'names a deployment environment';
const APP = 'uses a release app or its key';
const TOKEN_ONCE = "reads the workflow's token other than once, in the tag step's TOKEN";
const HANDS = `${C} hands the script another name, environment or shell than its own`;
const NO_WRITE = `${C} does not hold exactly contents: write`;
const NO_GROUP = `${C} does not run in the release concurrency group that never cancels`;
const NO_SCRIPT = `${C} has no script, or puts an expression into it`;
const ONE_JOB = 'holds jobs other than candidate';
const TOP_READ = 'asks for more than read access to the contents';
const cut = line => s => s.split('\n').filter(l => !l.includes(line)).join('\n');
const JOB_WRITE = '    permissions:\n      contents: write\n';
const APP_STEP = `      - uses: actions/create-github-app-token@${'a'.repeat(40)}\n        id: app\n        with:\n          client-id: x\n          private-key: x\n`;
const FIRST_RUN = /(\n        run: \|-?\n)/;
// PACT-105 C23 and decision 177: each rule of the release allow-list catches its plant. Each plant is a change that would give the workflow more power or make its tag easier to forge.
for (const [label, plant, says] of [
  ['drops the success condition', cut("github.event.workflow_run.conclusion == 'success'"), NO_CONDITION],
  ['drops the push condition', cut("github.event.workflow_run.event == 'push'"), NO_CONDITION],
  ['drops the head branch condition', cut("github.event.workflow_run.head_branch == 'main'"), NO_CONDITION],
  ['drops the same-repository condition', cut('github.event.workflow_run.head_repository.full_name == github.repository'), NO_CONDITION],
  ['drops the main ref condition', cut("github.ref == 'refs/heads/main'"), NO_CONDITION],
  ['drops the releases switch', s => s.replace("      vars.PACT_RELEASES == 'on' &&\n", ''), NO_CONDITION],
  ['runs on any switch value', s => s.replace("vars.PACT_RELEASES == 'on'", "vars.PACT_RELEASES != 'off'"), NO_CONDITION],
  ['joins a condition with or', s => s.replace("== 'success' &&", "== 'success' ||"), NO_CONDITION],
  ['lets a manual run reach the job', s => s.replace("github.event_name == 'workflow_run' &&", "(github.event_name == 'workflow_run' || github.event_name == 'workflow_dispatch') &&"), NO_CONDITION],
  ['lets any event reach the job', s => s.replace("github.event_name == 'workflow_run' &&", "github.event_name != '' &&"), NO_CONDITION],
  ['drops the concurrency group', s => s.replace('    concurrency:\n      group: release\n      cancel-in-progress: false\n', ''), NO_GROUP],
  ['gives the job a group of its own', s => s.replace('group: release', 'group: release-candidate'), NO_GROUP],
  ['cancels a running release', s => s.replace('cancel-in-progress: false', 'cancel-in-progress: true'), NO_GROUP],
  // Any environment: it could hold a secret or a reviewer rule the workflow does not name.
  ['names an environment on the job', s => s.replace('    runs-on:', '    environment: release\n    runs-on:'), ENVIRONMENT],
  ['names an environment in a flow mapping', s => s.replace('    runs-on: ubuntu-24.04', '    runs-on: ubuntu-24.04\n    x: {"environment": release}'), ENVIRONMENT],
  ['names an environment in capitals', s => s.replace('    runs-on:', '    Environment: release\n    runs-on:'), ENVIRONMENT],
  // Any secret, in any form and case.
  ['reads a secret in the tag step', s => s.replace('          HEAD_SHA:', '          OTHER: ${{ secrets.OTHER }}\n          HEAD_SHA:'), SECRET],
  ['reads a secret by an index', s => s.replace('          HEAD_SHA:', "          OTHER: ${{ secrets['OTHER'] }}\n          HEAD_SHA:"), SECRET],
  ["reads a secret, in capitals, in a step's name", s => s.replace('name: Tag a release candidate', 'name: ${{ SECRETS.OTHER }}'), SECRET],
  ['reads a secret in a second job', s => `${s}  second:\n    runs-on: ubuntu-24.04\n    steps:\n      - run: echo\n        env:\n          X: \${{ secrets.OTHER }}\n`, SECRET],
  ['hides a secret on a script line that starts with #', s => s.replace(FIRST_RUN, '$1          #${{ SECRETS.OTHER }}\n'), HIDES],
  // A manual run: a person's input would reach the job.
  ['adds a manual run', s => s.replace('\non:\n', '\non:\n  workflow_dispatch:\n'), TRIGGERS_SAY],
  ['adds a trigger', s => s.replace('\non:\n', '\non:\n  push:\n'), TRIGGERS_SAY],
  ['listens to another workflow', s => s.replace('workflows: [gate]', 'workflows: [gate, other]'), TRIGGERS_SAY],
  // Permissions: read at the top, contents: write on the one job and nothing more.
  ['gives the top level write access', s => s.replace('permissions:\n  contents: read\n', 'permissions:\n  contents: write\n'), TOP_READ],
  ['gives the top level write-all', s => s.replace('permissions:\n  contents: read\n', 'permissions: write-all\n'), TOP_READ],
  ['gives the top level a second permission', s => s.replace('permissions:\n  contents: read\n', 'permissions:\n  contents: read\n  id-token: write\n'), TOP_READ],
  ['drops the top-level permissions', s => s.replace('permissions:\n  contents: read\n\n', ''), TOP_READ],
  ['gives the job no permissions of its own', s => s.replace(JOB_WRITE, ''), NO_WRITE],
  ['gives the job read access only', s => s.replace(JOB_WRITE, '    permissions:\n      contents: read\n'), NO_WRITE],
  ['gives the job a second permission', s => s.replace(JOB_WRITE, `${JOB_WRITE}      pull-requests: write\n`), NO_WRITE],
  ['gives the job write-all', s => s.replace(JOB_WRITE, '    permissions: write-all\n'), NO_WRITE],
  // A key the job's allow-list does not name, here a container the steps would run in.
  ['gives the job a container', s => s.replace('    runs-on:', '    container: x\n    runs-on:'), extraKey(C, 'container')],
  // One job.
  ['adds a second job', s => `${s}  second:\n    runs-on: ubuntu-24.04\n`, ONE_JOB],
  ['drops the one job', s => s.slice(0, s.indexOf('  candidate:\n')), ONE_JOB],
  // The app token action does not come back, whether or not its output is used.
  ['brings the app token action back', s => s.replace('    steps:\n', `    steps:\n${APP_STEP}`), APP],
  ['names the release app key variable', s => s.replace('          HEAD_SHA:', '          KEY: PACT_RELEASE_APP_KEY\n          HEAD_SHA:'), APP],
  // The tag step's token is the workflow's own, read once.
  ['hands the script another token', s => s.replace('${{ github.token }}', '${{ steps.app.outputs.token }}'), HANDS],
  ['hands the script a token from the env context', s => s.replace('${{ github.token }}', '${{ env.TOKEN }}'), HANDS],
  ['hands the script no token expression', s => s.replace('${{ github.token }}', 'literal'), TOKEN_ONCE],
  ['hands the script the token twice', s => s.replace('          HEAD_SHA:', '          OTHER: ${{ github.token }}\n          HEAD_SHA:'), TOKEN_ONCE],
  ['hands the script the token in capitals', s => s.replace('${{ github.token }}', '${{ GITHUB.TOKEN }}'), HANDS],
  ['reads GITHUB_TOKEN', s => s.replace('          HEAD_SHA:', '          GITHUB_TOKEN: ${{ github.token }}\n          HEAD_SHA:'), TOKEN_ONCE],
  ["reads the token, in capitals, in a step's name", s => s.replace('name: Tag a release candidate', 'name: ${{ github.Token }}'), TOKEN_ONCE],
  // The step and its script.
  ['names the step with an expression', s => s.replace('name: Tag a release candidate', 'name: ${{ env.X }}'), HANDS],
  ['pastes an expression into the script', s => s.replace('          main().then', '          // ${{ github.event.workflow_run.head_commit.message }}\n          main().then'), NO_SCRIPT],
  ['adds a step', s => s.replace('    steps:\n', '    steps:\n      - run: echo ok\n'), `${C} holds other steps than the tag's`],
  ['hands the script an input', s => s.replace('          HEAD_SHA:', '          RC: ${{ inputs.rc }}\n          HEAD_SHA:'), HANDS],
  ['checks the repo out', s => s.replace('    steps:\n', `    steps:\n      - uses: actions/checkout@${'a'.repeat(40)}\n`), 'checks the repo out'],
]) {
  test(`bad case: the release allow-list catches a workflow that ${label}`, () => {
    const src = readFileSync(RELEASE, 'utf8').replace(/\r\n/g, '\n');
    const planted = plant(src);
    assert.notEqual(planted, src, 'the plant changed the file');
    assert.ok(releaseProblems(planted).includes(says), releaseProblems(planted).join('\n'));
  });
}

// PACT-105 C23: the folder check hands the file to its allow-list, and a second file that uses workflow_run still fails.
test('bad case: the folder check holds the release workflow to its allow-list, and no other file may use workflow_run', () => {
  const files = realFolder();
  assert.deepEqual(folderProblems(files), [], 'control: the real folder passes');
  const broken = new Map([...files, ['release.yml', files.get('release.yml').replace('    runs-on:', '    environment: release\n    runs-on:')]]);
  assert.ok(folderProblems(broken).includes('release.yml names a deployment environment'), folderProblems(broken).join('\n'));
  for (const name of ['release-copy.yml', 'Release.yml', 'release.yaml']) {
    const copied = new Map([...files, [name, files.get('release.yml')]]);
    assert.ok(folderProblems(copied).includes(`${name} runs on a trigger that holds secrets or a write token`), folderProblems(copied).join('\n'));
  }
});

// PACT-105 C23: the tightened common rules, one bad case each: no environment, a secret in any case, no expression on a #-line.
for (const [label, other, says] of [
  ['names an environment', OTHER.replace('    steps:', '    environment: release\n    steps:'), 'other.yml names a deployment environment'],
  ['reads a secret in capitals', OTHER.replace('echo ok', 'echo ${{ SECRETS.X }}'), 'other.yml reads a secret or the token'],
  ['hides an expression on a script line that starts with #', OTHER.replace('run: echo ok', 'run: |\n          # ${{ github.event.pull_request.title }}\n          echo ok'), `other.yml ${HIDES}`],
]) {
  test(`bad case: the folder check catches a second workflow file that ${label}`, () => {
    const files = new Map([...realFolder(), ['other.yml', other]]);
    assert.ok(folderProblems(files).includes(says), folderProblems(files).join('\n'));
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
