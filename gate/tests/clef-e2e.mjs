// PACT-93, T3 of spec 0005 (U7): Clef end to end on one platform, with the real
// server and model on the CPU. It installs the tool into a throwaway home, sets
// it up, asks the six cases in docs/clef-cases.json and removes it again.
//
//   node gate/tests/clef-e2e.mjs <scratch folder outside the repo> <platform key>
//
// .github/workflows/clef-e2e.yml runs it. It downloads gigabytes, so it is not
// a gate test: the runner leaves it out, and the install never stages it. Apply
// refuses a dirty checkout, so a run needs a clean one.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { cpus, release, totalmem, type } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkedAnswer, forwardTimeoutMs, lifetimeLine, runPaths } from '../../claude/tools/clef.mjs';
import { realOrResolved, within } from '../paths.mjs';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
/** The keys the workflow's jobs pass: the CPU builds of Linux and Windows. */
const KEYS = Object.freeze(['linux-x64-cpu', 'linux-arm64-cpu', 'win32-x64-cpu', 'win32-arm64-cpu']);
const READY_LIMIT_MS = 5 * 60_000;
const GONE_LIMIT_MS = 5000;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------- the checks

export function parseArgs(argv) {
  if (argv.length !== 2) throw new Error('takes two arguments: a scratch folder and a platform key');
  const [scratch, key] = argv;
  if (!KEYS.includes(key)) throw new Error(`the platform key is one of ${KEYS.join(', ')}`);
  if (!isAbsolute(scratch)) throw new Error('the scratch folder takes a full path');
  const folder = realOrResolved(scratch);
  const repo = realOrResolved(REPO);
  if (within(folder, repo) || within(repo, folder)) throw new Error('the scratch folder must lie outside the repo, and not hold it');
  return { scratch, key };
}

/** The one writer: every line the script prints goes through it. It refuses a line that holds a secret. */
export function writeLine(line, secrets, write = l => process.stdout.write(`${l}\n`)) {
  if (secrets.some(s => s && line.includes(s))) throw new Error("a line holding run.json's run id or run.key's value is not written");
  write(line);
}

/** A yes/no answer's band, as docs/clef-cases.json states it. */
const band = p => (p > 0.7 ? 'yes' : p < 0.3 ? 'no' : 'unsure');
const topOption = probabilities => Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0][0];

/** One case's answer against its baseline and the time budget: what it said, and each problem. */
export function judgeCase(testCase, answer, ms, limitMs) {
  const problems = ms > limitMs ? [`the answer took ${ms} ms, past ${limitMs}`] : [];
  const checked = checkedAnswer(testCase.questions, answer);
  if (!checked) return { said: 'nothing', problems: [...problems, 'the answer is not the shape the supervisor checks'] };
  const said = [];
  for (const id of Object.keys(testCase.questions)) {
    // A joint case holds a baseline per question; the other kinds have one question.
    const want = testCase.kind === 'joint' ? testCase.baseline[id] : testCase.baseline;
    const picks = testCase.kind === 'pick';
    const got = picks ? topOption(checked[id].probabilities) : band(checked[id].noul);
    const expected = picks ? want.choice : want.band;
    said.push(`${id}=${got}`);
    if (got !== expected) problems.push(`${id} ${picks ? 'picks' : 'is'} ${got}, not ${expected}`);
  }
  return { said: said.join(' '), problems };
}

/** Whether the server's parents fit the line that ends it with its supervisor: a problem, or null. */
export function lineCheck({ line, supervisor, parent, grandparent }) {
  if (line === 'setpriv') return parent === supervisor ? null : "on the setpriv line the server's parent is not the supervisor";
  if (parent === supervisor) return "on the keeper line the server's parent is the supervisor";
  return grandparent === supervisor ? null : "on the keeper line the supervisor is not the server's grandparent";
}

/** The names, of { name: pid }, whose process is still alive. */
export const goneCheck = (pids, alive) => Object.keys(pids).filter(name => alive(pids[name]));

// ---------------------------------------------------------------- the machine

/** The fields of /proc/<pid>/stat after the command name: state, then the parent pid. */
const statOf = pid => readFileSync(`/proc/${pid}/stat`, 'utf8').replace(/^.*\) /s, '').split(' ');
const parentOf = pid => Number(statOf(pid)[1]);

function alive(pid) {
  try {
    process.kill(pid, 0);
  } catch (e) {
    return e.code === 'EPERM';
  }
  if (process.platform !== 'linux') return true;
  // A process that has ended but is not yet reaped still takes a signal.
  try {
    return statOf(pid)[0] !== 'Z';
  } catch {
    return false;
  }
}

/** The process's peak resident memory in bytes. */
function peakMemory(pid) {
  if (process.platform === 'linux') {
    const kb = /^VmHWM:\s+(\d+) kB$/m.exec(readFileSync(`/proc/${pid}/status`, 'utf8'));
    if (!kb) throw new Error('the server has no VmHWM line');
    return Number(kb[1]) * 1024;
  }
  const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', `(Get-Process -Id ${Number(pid)}).PeakWorkingSet64`], { encoding: 'utf8', timeout: 60_000, windowsHide: true });
  const bytes = Number(String(r.stdout ?? '').trim());
  if (r.status !== 0 || !(bytes > 0)) throw new Error("Get-Process did not give the server's peak working set");
  return bytes;
}

/** One question set to the supervisor: { status, json, ms }. */
function ask(port, body, timeoutMs) {
  const data = Buffer.from(JSON.stringify(body));
  const t0 = Date.now();
  return new Promise((resolveP, reject) => {
    const req = request({ host: '127.0.0.1', port, path: '/v1/systemone', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': String(data.length) }, agent: false, signal: AbortSignal.timeout(timeoutMs) }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('error', reject);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          // not JSON: the shape check fails it
        }
        resolveP({ status: res.statusCode, json, ms: Date.now() - t0 });
      });
    });
    req.on('error', reject);
    req.end(data);
  });
}

// ---------------------------------------------------------------- the run

const secrets = new Set();
let runFiles = null;

/** Prints through writeLine, against every run id and key the clef folder has held so far. */
function say(line) {
  if (runFiles) {
    for (const read of [() => JSON.parse(readFileSync(runFiles.run, 'utf8')).run, () => readFileSync(runFiles.key, 'utf8').trim()]) {
      try {
        secrets.add(String(read() ?? ''));
      } catch {
        // not there yet, or gone
      }
    }
  }
  writeLine(line, [...secrets]);
}

/** A failed child's output, line by line; a line the writer refuses is named, not shown. */
function relay(label, r) {
  for (const line of `${r.stdout ?? ''}\n${r.stderr ?? ''}`.split(/\r?\n/).filter(Boolean)) {
    try {
      say(`${label}> ${line}`);
    } catch {
      say(`${label}> a line was held back`);
    }
  }
}

/** Runs node with `args`. A non-zero end relays the output and fails the run. Returns stdout. */
function node(label, args, { cwd, env, timeout }) {
  const r = spawnSync(process.execPath, args, { cwd, env, timeout, encoding: 'utf8', windowsHide: true, maxBuffer: 16 << 20 });
  if (r.status !== 0) {
    relay(label, r);
    throw new Error(`${label} ended with ${r.status ?? r.signal ?? r.error?.code}`);
  }
  return r.stdout;
}

async function run({ scratch, key }) {
  const record = (step, text) => say(`clef-e2e ${key} ${step}: ${text}`);
  const since = t0 => `${Math.round((Date.now() - t0) / 1000)} s`;
  record('machine', `${type()} ${release()}, ${cpus().length} x ${cpus()[0]?.model.trim() ?? 'unknown CPU'}, ${Math.round(totalmem() / 2 ** 30)} GiB RAM, node ${process.version} ${process.arch}`);

  // 1: install into a throwaway home, by the dry run and the apply command it prints.
  let t0 = Date.now();
  mkdirSync(scratch, { recursive: true });
  const home = join(scratch, 'home');
  const work = join(scratch, 'work');
  mkdirSync(home);
  mkdirSync(join(home, '.claude'));
  mkdirSync(join(home, '.pact'));
  mkdirSync(work);
  writeFileSync(join(home, '.pact', 'config.json'), `${JSON.stringify({ schema: 1, tools: ['clef'] })}\n`);
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  const install = ['gate/install.mjs', '--home', home];
  const dry = node('install dry run', install, { cwd: REPO, env, timeout: READY_LIMIT_MS });
  const apply = / --apply --commit ([0-9a-f]{40})(?: --rendered-hash ([0-9a-f]{64}))?\s*$/m.exec(dry);
  if (!apply) throw new Error('the dry run printed no apply command');
  const [, commit, hash] = apply;
  node('install apply', [...install, '--apply', '--commit', commit, ...(hash ? ['--rendered-hash', hash] : [])], { cwd: REPO, env, timeout: READY_LIMIT_MS });
  const tool = join(home, '.pact', 'tools', 'clef.mjs');
  if (!existsSync(tool) || !readFileSync(tool).equals(readFileSync(join(REPO, 'claude', 'tools', 'clef.mjs')))) throw new Error("the installed clef.mjs is not the repo's copy");
  record('install', `commit ${commit}, ${since(t0)}`);

  // 2: setup and verify, from a folder that holds neither the home nor the repo.
  const clefEnv = { ...env, CLAUDE_CONFIG_DIR: join(home, '.claude') };
  const clef = (label, args, timeout) => node(label, [tool, ...args], { cwd: work, env: clefEnv, timeout });
  const dir = join(home, '.claude', 'pact-clef');
  runFiles = runPaths(dir);
  const picked = /^platform: (\S+) /m.exec(clef('setup plan', ['setup', '--cpu'], READY_LIMIT_MS))?.[1];
  if (picked !== key) throw new Error(`setup --cpu picks ${picked ?? 'no platform'}, not ${key}`);
  t0 = Date.now();
  clef('setup', ['setup', '--cpu', '--yes']);
  record('setup', since(t0));
  t0 = Date.now();
  clef('verify', ['verify']);
  record('verify', since(t0));

  let stopped = false;
  try {
    // 3: ensure until ready.
    t0 = Date.now();
    for (;;) {
      const r = spawnSync(process.execPath, [tool, 'ensure', '--wait', '60'], { cwd: work, env: clefEnv, timeout: 90_000, encoding: 'utf8', windowsHide: true });
      let said = null;
      try {
        said = JSON.parse(String(r.stdout).trim().split(/\r?\n/).at(-1));
      } catch {
        // judged below
      }
      if (said?.state === 'ready') break;
      if (said?.state !== 'starting' || Date.now() - t0 >= READY_LIMIT_MS) {
        relay('ensure', r);
        throw new Error(said?.state === 'starting' ? 'the server was not ready within 5 minutes' : `ensure said ${said?.state ?? 'nothing'} ${said?.reason ?? ''}`.trim());
      }
    }
    if (Date.now() - t0 > READY_LIMIT_MS) throw new Error('the server was not ready within 5 minutes');
    record('ready', since(t0));

    // 4: the six cases through the supervisor.
    const live = JSON.parse(readFileSync(runFiles.run, 'utf8'));
    const limit = forwardTimeoutMs('cpu');
    const { cases } = JSON.parse(readFileSync(join(REPO, 'docs', 'clef-cases.json'), 'utf8'));
    const wrong = [];
    for (const c of cases) {
      const r = await ask(live.port, { state: c.state, questions: c.questions }, limit + 10_000);
      if (r.status !== 200) throw new Error(`case ${c.id}: status ${r.status} after ${r.ms} ms`);
      const { said, problems } = judgeCase(c, r.json, r.ms, limit);
      record(`case ${c.id}`, `${said}, ${r.ms} ms`);
      wrong.push(...problems.map(p => `case ${c.id}: ${p}`));
    }
    if (wrong.length) throw new Error(wrong.join('; '));

    // 5: what ends the server when its supervisor dies.
    const pids = { server: live.serverPid, supervisor: live.pid };
    if (process.platform === 'linux') {
      const line = lifetimeLine({ platform: process.platform });
      const parent = parentOf(live.serverPid);
      const problem = lineCheck({ line, supervisor: live.pid, parent, grandparent: parentOf(parent) });
      if (problem) throw new Error(problem);
      if (line === 'keeper') pids.keeper = parent;
      record('lifetime', `the ${line} line, as the server's parents show`);
    } else record('lifetime', 'the job-object line; no parent is read');

    // 6
    record('memory', `peak resident ${Math.round(peakMemory(live.serverPid) / 2 ** 20)} MiB`);

    // 7: status, stop and remove.
    const status = clef('status', ['status'], 60_000).split(/\r?\n/);
    for (const want of [`platform: ${key}`, 'backend: cpu']) if (!status.includes(want)) throw new Error(`status does not say "${want}"`);
    t0 = Date.now();
    clef('stop', ['stop'], 90_000);
    stopped = true;
    let left = goneCheck(pids, alive);
    for (const until = Date.now() + GONE_LIMIT_MS; left.length && Date.now() < until; left = goneCheck(pids, alive)) await sleep(100);
    if (left.length) throw new Error(`still alive 5 s after stop: ${left.join(', ')}`);
    record('stop', `${Object.keys(pids).join(', ')} gone, ${since(t0)}`);
    clef('remove', ['remove', '--yes'], 120_000);
    if (existsSync(dir)) throw new Error('the clef folder is left after remove');
    record('remove', 'the clef folder is gone');
  } finally {
    // A failed run still ends the server it started.
    if (!stopped) spawnSync(process.execPath, [tool, 'stop'], { cwd: work, env: clefEnv, timeout: 90_000, stdio: 'ignore', windowsHide: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await run(parseArgs(process.argv.slice(2)));
    say('clef-e2e: pass');
  } catch (e) {
    process.exitCode = 1;
    try {
      say(`clef-e2e: fail: ${e.message}`);
    } catch {
      say('clef-e2e: fail: the reason was held back');
    }
  }
}
