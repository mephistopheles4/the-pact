// PACT-64, T2 of spec 0002: the supervisor, ensure, stop, status and remove.
// A stub stands in for llama-server: a node script that checks the key it is
// given, records its arguments and environment, and answers by a mode. Nothing
// here downloads or runs the real server.

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync as clefRm, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { request } from 'node:http';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import * as clef from '../../claude/tools/clef.mjs';
import { REPO } from './text.mjs';
import { longTmp, tempDir } from './tree.mjs';

const CLEF_PATH = join(REPO, 'claude', 'tools', 'clef.mjs');
const SOURCE_TEXT = readFileSync(CLEF_PATH, 'utf8');
const WIN = process.platform === 'win32';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const STUB = `
import { createServer } from 'node:http';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
const [cfgPath, ...args] = process.argv.slice(2);
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
const arg = n => args[args.indexOf(n) + 1];
const key = readFileSync(arg('--api-key-file'), 'utf8').trim();
writeFileSync(cfg.record, JSON.stringify({ args, cwd: process.cwd(), env: process.env, pid: process.pid, key }));
const t0 = Date.now();
if (cfg.exitAfterMs) setTimeout(() => process.exit(1), cfg.exitAfterMs);
if (cfg.ignoreTerm) process.on('SIGTERM', () => {});
// A server busy on the keeper's pipes: a broken pipe is an error event, which this one ignores, so only a signal ends it.
if (cfg.writeLoop) { process.stdout.on('error', () => {}); setInterval(() => process.stdout.write('loading\\n'), 5); }
createServer((req, res) => {
  // /props as b12211 answers it: the ready check comes before the key check (spec 0003 M6).
  if (req.url === '/props') {
    const how = req.headers.authorization === undefined ? 'none' : req.headers.authorization === 'Bearer ' + key ? 'right' : 'wrong';
    if (cfg.propsLog) appendFileSync(cfg.propsLog, how + '\\n');
    if (cfg.anyBearer) { res.writeHead(200); return res.end('{}'); }
    if (cfg.propsNotReady || (cfg.readyAfterMs && Date.now() - t0 < cfg.readyAfterMs)) { res.writeHead(503); return res.end('{}'); }
    res.writeHead(how === 'right' ? 200 : 401);
    return res.end('{}');
  }
  if (req.headers.authorization !== 'Bearer ' + key) { res.writeHead(401); return res.end('no'); }
  if (req.url === '/health') {
    if (cfg.notReady || (cfg.readyAfterMs && Date.now() - t0 < cfg.readyAfterMs)) { res.writeHead(503); return res.end('{}'); }
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end('{"status":"ok"}');
  }
  let b = '';
  req.on('data', c => (b += c));
  req.on('end', () => setTimeout(() => {
    appendFileSync(cfg.requests, 'x\\n');
    if (cfg.mode === 'status500') { res.writeHead(500); return res.end('SECRET-SERVER-TEXT'); }
    if (cfg.mode === 'text') { res.writeHead(200); return res.end('SECRET-SERVER-TEXT'); }
    const { questions } = JSON.parse(b);
    const out = {};
    for (const [id, q] of Object.entries(questions)) {
      // The shapes below are b12211's own: each answer carries its question's type and a confidence.
      if (cfg.mode === 'range') out[id] = q.type === 'choice' ? { type: 'choice', choice: Object.keys(q.criteria)[0], probabilities: Object.fromEntries(Object.keys(q.criteria).map(k => [k, 5])) } : { type: q.type, [q.type]: 5 };
      else if (q.type === 'noul') out[id] = { type: 'noul', noul: 0.5, confidence: 0.5 };
      else if (q.type === 'score') out[id] = { type: 'score', score: 0.25 };
      else {
        const ks = Object.keys(q.criteria);
        out[id] = { type: 'choice', choice: cfg.mode === 'badchoice' ? 'zzz' : ks[0], probabilities: Object.fromEntries(ks.map(k => [k, 1 / ks.length])), confidence: 0.5 };
        if (cfg.mode === 'extra') out[id].extra = 'SECRET-SERVER-TEXT';
      }
    }
    if (cfg.mode === 'extraid') out.zzz = { type: 'noul', noul: 0.5 };
    // 'bare' is the shape the first build assumed: the answers without b12211's wrapper.
    const reply = cfg.mode === 'bare' ? out : { model: 'SECRET-SERVER-TEXT', answers: out, usage: { input_tokens: 1, output_tokens: 0 } };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(reply));
  }, cfg.answerDelayMs || 0));
}).listen(Number(arg('--port')), '127.0.0.1');
`;

/** The fixture's own folder. On Windows a stopped server can hold it for a moment, so the removal retries, for about 3 s at most, then fails the test. */
function fixtureDir(t) {
  const d = mkdtempSync(join(longTmp(), 'clef-run-'));
  t.after(() => clefRm(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
  return d;
}

/** A set-up clef folder with placeholder files, the stub, and its config. */
function fixture(t, cfgExtra = {}) {
  // Registered before the folder's own clean-up, so the servers stop first: a running server holds its folder on Windows.
  const stoppers = [];
  t.after(async () => {
    for (const s of stoppers.reverse()) await Promise.resolve(s()).catch(() => {});
  });
  const root = fixtureDir(t);
  const cfgHome = join(root, 'cfg');
  const dir = join(cfgHome, 'pact-clef');
  const key = Object.keys(clef.SERVER.archives)[0];
  const a = clef.SERVER.archives[key];
  const p = clef.paths(dir);
  mkdirSync(p.runtime, { recursive: true });
  mkdirSync(p.models, { recursive: true });
  writeFileSync(join(p.runtime, clef.destName(a.exe, a.exe)), 'x');
  writeFileSync(p.model, 'x');
  writeFileSync(p.setup, JSON.stringify({ platform: key, tag: clef.SERVER.tag, model: clef.MODEL.sha256, backend: 'cpu', node: process.execPath }));
  const stub = join(root, 'stub.mjs');
  const cfg = join(root, 'stub.json');
  const record = join(root, 'record.json');
  const requests = join(root, 'requests.txt');
  writeFileSync(stub, STUB);
  writeFileSync(cfg, JSON.stringify({ record, requests, ...cfgExtra }));
  const forwarded = () => (existsSync(requests) ? readFileSync(requests, 'utf8').split('\n').filter(Boolean).length : 0);
  const exe = { exe: process.execPath, exePrefix: [stub, cfg], pdeathsig: false };
  const recorded = async () => {
    for (let i = 0; i < 100 && !existsSync(record); i++) await sleep(50);
    return JSON.parse(readFileSync(record, 'utf8'));
  };
  const setCfg = extra => writeFileSync(cfg, JSON.stringify({ record, requests, ...cfgExtra, ...extra }));
  return { root, cfgHome, dir, p, stub, cfg, record, exe, recorded, setCfg, forwarded, stoppers, run: clef.runPaths(dir) };
}

async function startServe(t, f, opts = {}) {
  const h = await clef.serve({ dir: f.dir, ...f.exe, idleMs: 60_000, checkMs: 60_000, pollMs: 50, ...opts });
  f.stoppers.push(() => h.stop('test'));
  return h;
}

async function ready(f) {
  for (let i = 0; i < 200; i++) {
    const live = await clef.liveSupervisor(f.dir);
    if (live?.health.ready) return live;
    await sleep(50);
  }
  throw new Error('the supervisor did not get ready');
}

function call({ port, path = '/v1/systemone', method = 'POST', headers = {}, body, host = `127.0.0.1:${port}`, raw, chunked = false }) {
  return new Promise((resolveP, reject) => {
    const data = raw ?? (body === undefined ? null : Buffer.from(JSON.stringify(body)));
    const h = { host, ...headers };
    if (data) {
      if (!('content-type' in h)) h['content-type'] = 'application/json';
      // without a content-length node sends the body chunked
      if (!chunked) h['content-length'] = String(data.length);
    }
    const req = request({ host: '127.0.0.1', port, path, method, headers: h, agent: false }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolveP({ status: res.statusCode, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const QUESTIONS = {
  a: { type: 'noul', instructions: 'x' },
  b: { type: 'score', instructions: 'y' },
  c: { type: 'choice', instructions: 'z', criteria: { yes: 'ok', no: 'not ok' } },
};

// ------------------------------------------------------------ pure pieces

// #PACT-106 C1 (spec 0002 S7): the list is fixed, with -c 65536 -ub 8192 -b 8192 on every backend.
test('serverArgs: the list is fixed, the key is a file, and Vulkan adds -ngl 99', () => {
  const a = clef.serverArgs({ port: 4242, keyFile: '/k/run.key', modelPath: '/m/x.gguf', vulkan: false });
  assert.deepEqual(a, ['--host', '127.0.0.1', '--port', '4242', '--api-key-file', '/k/run.key', '--no-webui', '--no-slots', '--cors-origins', 'http://127.0.0.1.invalid', '-c', '65536', '-ub', '8192', '-b', '8192', '-m', '/m/x.gguf']);
  const v = clef.serverArgs({ port: 4242, keyFile: '/k/run.key', modelPath: '/m/x.gguf', vulkan: true });
  assert.deepEqual(v, [...a.slice(0, 10), '-ngl', '99', ...a.slice(10)]);
  assert.ok(!a.includes('--api-key'), 'no key on the command line');
  // Spec 0003 M4: Metal offloads as Vulkan does; macOS's CPU key names no device, so Metal is never used.
  assert.deepEqual(clef.serverArgs({ port: 4242, keyFile: '/k/run.key', modelPath: '/m/x.gguf', metal: true }), v);
  const c = clef.serverArgs({ port: 4242, keyFile: '/k/run.key', modelPath: '/m/x.gguf', noDevice: true });
  assert.deepEqual(c, [...a.slice(0, 10), '--device', 'none', ...a.slice(10)]);
  assert.ok(!c.includes('-ngl'));
});

// #PACT-91 C-U11 (spec 0005 U4): `-nr` ends the list on a CPU backend, after 0003's `--device none`, and never appears on Vulkan or Metal.
test('serverArgs: a CPU backend ends with -nr, after --device none, and a GPU backend never holds it', () => {
  const base = { port: 4242, keyFile: '/k/run.key', modelPath: '/m/x.gguf' };
  const cpu = clef.serverArgs({ ...base, cpu: true });
  assert.deepEqual(cpu.slice(-3), ['-m', '/m/x.gguf', '-nr']);
  assert.deepEqual(cpu.slice(0, -1), clef.serverArgs(base), 'the CPU list is the plain list plus -nr');
  const mac = clef.serverArgs({ ...base, cpu: true, noDevice: true });
  assert.deepEqual(mac.slice(0, -1), clef.serverArgs({ ...base, noDevice: true }), 'the macOS CPU list is the no-device list plus -nr');
  assert.equal(mac.at(-1), '-nr');
  assert.ok(mac.indexOf('--device') < mac.indexOf('-nr'));
  for (const gpu of [{ vulkan: true }, { metal: true }, {}]) assert.ok(!clef.serverArgs({ ...base, ...gpu }).includes('-nr'), JSON.stringify(gpu));
});

// #PACT-91 C-U11: serve passes the setup's backend, so every CPU key (macOS arm64 CPU included) launches with -nr last and no GPU key does.
for (const [backend, nr] of [['cpu', true], ['vulkan', false], ['metal', false]]) {
  test(`serve: a ${backend} setup launches the server ${nr ? 'with -nr last' : 'without -nr'}`, async t => {
    const f = fixture(t);
    const setup = JSON.parse(readFileSync(f.p.setup, 'utf8'));
    writeFileSync(f.p.setup, JSON.stringify({ ...setup, backend }));
    await startServe(t, f);
    const rec = await f.recorded();
    if (nr) assert.equal(rec.args.at(-1), '-nr');
    else assert.ok(!rec.args.includes('-nr'));
  });
}

test('launchCommand: Linux goes through /usr/bin/setpriv --pdeathsig KILL, and the seam drops it', () => {
  const args = ['--x'];
  assert.deepEqual(clef.launchCommand({ platform: 'linux', exe: '/r/llama-server', args }), { file: '/usr/bin/setpriv', args: ['--pdeathsig', 'KILL', '--', '/r/llama-server', '--x'] });
  assert.deepEqual(clef.launchCommand({ platform: 'win32', exe: 'C:\\r\\llama-server.exe', args }), { file: 'C:\\r\\llama-server.exe', args });
  assert.deepEqual(clef.launchCommand({ platform: 'linux', exe: '/r/llama-server', args, pdeathsig: false }), { file: '/r/llama-server', args });
});

test('serveEnv: only the named names pass, PATH is set, LD_LIBRARY_PATH only on Linux', () => {
  const env = { SYSTEMROOT: 'C:\\W', HOME: '/h', PATH: '/evil', GGML_BACKEND_PATH: '/e', LLAMA_ARG_X: '1', HF_TOKEN: 's', VK_ICD_FILENAMES: '/e', NODE_OPTIONS: '--require x', SECRET: 's' };
  const w = clef.serveEnv(env, 'win32', 'C:\\r');
  assert.deepEqual(Object.keys(w).sort(), ['HOME', 'PATH', 'SYSTEMROOT']);
  assert.equal(w.PATH, 'C:\\W\\System32;C:\\W');
  const l = clef.serveEnv(env, 'linux', '/r');
  assert.deepEqual(Object.keys(l).sort(), ['HOME', 'LD_LIBRARY_PATH', 'PATH', 'SYSTEMROOT']);
  assert.equal(l.PATH, '/usr/bin:/bin');
  assert.equal(l.LD_LIBRARY_PATH, '/r');
  assert.equal(clef.serveEnv({ ...env, TMPDIR: '/t' }, 'linux', '/r').TMPDIR, undefined, 'TMPDIR passes on macOS only');
  // Spec 0003 M4: on macOS the caller's TMPDIR passes, and no DYLD_* or library path is set.
  const m = clef.serveEnv({ ...env, TMPDIR: '/var/folders/x/T/', DYLD_INSERT_LIBRARIES: '/e.dylib', DYLD_LIBRARY_PATH: '/e' }, 'darwin', '/r');
  assert.deepEqual(Object.keys(m).sort(), ['HOME', 'PATH', 'SYSTEMROOT', 'TMPDIR']);
  assert.equal(m.PATH, '/usr/bin:/bin');
  assert.equal(m.TMPDIR, '/var/folders/x/T/');
});

test('checkedAnswer: a body built from checked values, and every other shape is null', () => {
  const ok = { a: { noul: 0.5 }, b: { score: 1 }, c: { choice: 'yes', probabilities: { yes: 0.4, no: 0.6 } } };
  assert.deepEqual(clef.checkedAnswer(QUESTIONS, ok), ok);
  const bad = [
    { ...ok, a: { noul: 1.5 } },
    { ...ok, a: { noul: -0.1 } },
    { ...ok, a: { noul: '0.5' } },
    { ...ok, a: { noul: null } },
    { ...ok, a: { noul: 0.5, extra: 1 } },
    { ...ok, a: { score: 0.5 } },
    { ...ok, b: { score: NaN } },
    { ...ok, c: { choice: 'maybe', probabilities: { yes: 0.4, no: 0.6 } } },
    { ...ok, c: { choice: 'yes', probabilities: { yes: 0.4 } } },
    { ...ok, c: { choice: 'yes', probabilities: { yes: 0.4, no: 0.6, maybe: 0.1 } } },
    { ...ok, c: { choice: 'yes', probabilities: { yes: 2, no: 0.6 } } },
    { ...ok, c: { choice: 'yes' } },
    { ...ok, c: { choice: 'yes', probabilities: { yes: 0.4, no: 0.6 }, extra: 'x' } },
    { a: ok.a, b: ok.b },
    { ...ok, d: { noul: 0.5 } },
    { ...ok, a: 'text' },
    [],
    null,
  ];
  for (const b of bad) assert.equal(clef.checkedAnswer(QUESTIONS, b), null, JSON.stringify(b));
  assert.equal(clef.checkedAnswer(QUESTIONS, JSON.parse('{"a":{"noul":0.5},"b":{"score":1},"__proto__":{"x":1}}')), null);
  const odd = { constructor: { type: 'noul' } };
  assert.equal(clef.checkedAnswer(odd, {}), null, 'a name inherited from Object.prototype is not an answer');
  assert.equal(clef.checkedAnswer({ a: { type: 'noul' } }, { a: { noul: 0.5 } }).a.noul, 0.5);
  assert.equal(clef.checkedAnswer({ a: { type: 'weird' } }, { a: { noul: 0.5 } }), null);
});

test('serverAnswer: b12211\'s own reply shape gives the checked body, and the bare shape and any other wrapper are null', () => {
  // The reply b12211 sent for a noul and a choice question on the owner's machine (T4), with the numbers shortened.
  const real = {
    model: 'a-path-that-never-reaches-a-caller.gguf',
    answers: {
      a: { type: 'noul', noul: 0.0085 },
      c: { type: 'choice', choice: 'no', probabilities: { yes: 0.015, no: 0.97 }, confidence: 0.957 },
    },
    usage: { input_tokens: 251, output_tokens: 0 },
  };
  const qs = { a: QUESTIONS.a, c: QUESTIONS.c };
  assert.deepEqual(clef.serverAnswer(qs, real), { a: { noul: 0.0085 }, c: { choice: 'no', probabilities: { yes: 0.015, no: 0.97 } } });
  const bare = real.answers;
  assert.equal(clef.serverAnswer(qs, bare), null, 'the answers without the wrapper');
  const bad = [
    { ...real, answers: undefined },
    { ...real, answers: null },
    { ...real, answers: [] },
    { ...real, answers: 'text' },
    { ...real, answers: { ...real.answers, a: { type: 'choice', noul: 0.5 } } },
    { ...real, answers: { ...real.answers, a: { type: 'noul', noul: 0.5, confidence: 2 } } },
    { ...real, answers: { ...real.answers, a: { type: 'noul', noul: 0.5, confidence: -0.1 } } },
    { ...real, answers: { ...real.answers, a: { type: 'noul', noul: 0.5, legend: { 0: 'x' } } } },
    { ...real, answers: { ...real.answers, a: { type: 'noul', noul: 0.5, extra: 'x' } } },
    { ...real, answers: { ...real.answers, c: { type: 'noul', choice: 'no', probabilities: { yes: 0.1, no: 0.9 } } } },
    { ...real, answers: { ...real.answers, zzz: { type: 'noul', noul: 0.5 } } },
    [],
    null,
    'text',
  ];
  for (const b of bad) assert.equal(clef.serverAnswer(qs, b), null, JSON.stringify(b));
});

// ------------------------------------------------------------ the supervisor, in process

test('serve: an answer is built from checked values, with the fixed server arguments and a named environment', async t => {
  const f = fixture(t);
  await startServe(t, f);
  const live = await ready(f);
  const { port } = live.run;
  const r = await call({ port, body: { state: { s: 1 }, questions: QUESTIONS } });
  assert.equal(r.status, 200);
  assert.deepEqual(JSON.parse(r.text), { a: { noul: 0.5 }, b: { score: 0.25 }, c: { choice: 'yes', probabilities: { yes: 0.5, no: 0.5 } } });
  const rec = await f.recorded();
  const i = n => rec.args.indexOf(n);
  assert.equal(rec.args[i('--host') + 1], '127.0.0.1');
  assert.notEqual(Number(rec.args[i('--port') + 1]), port, 'the server has its own port');
  assert.equal(rec.args[i('--api-key-file') + 1], f.run.key);
  for (const flag of ['--no-webui', '--no-slots']) assert.ok(rec.args.includes(flag), flag);
  assert.ok(!rec.args.includes(rec.key), 'no key on the command line');
  assert.equal(readFileSync(f.run.key, 'utf8').trim(), rec.key);
  assert.equal(statSync(f.p.runtime).isDirectory(), true);
  assert.equal(rec.cwd.toLowerCase(), f.p.runtime.toLowerCase(), 'the server runs from runtime/<tag>/');
  const allowed = new Set([...'SYSTEMROOT WINDIR TEMP TMP HOME USERPROFILE LOCALAPPDATA XDG_RUNTIME_DIR PATH LD_LIBRARY_PATH'.split(' ')]);
  // Windows itself fills in these when it starts a process for the user; none comes from the caller.
  if (WIN) for (const n of ['HOMEDRIVE', 'HOMEPATH', 'LOGONSERVER', 'SYSTEMDRIVE', 'USERDOMAIN', 'USERNAME']) allowed.add(n);
  // macOS's own runtime sets this one in each process it starts, when it is missing; it never comes from the caller.
  if (process.platform === 'darwin') for (const n of [MAC_OWN, 'TMPDIR']) allowed.add(n);
  for (const k of Object.keys(rec.env)) assert.ok(allowed.has(k.toUpperCase()), `${k} is not on the list`);
  const run = JSON.parse(readFileSync(f.run.run, 'utf8'));
  assert.deepEqual(Object.keys(run).sort(), ['pid', 'port', 'run', 'serverPid', 'started']);
  assert.equal(run.serverPid, rec.pid);
});

test('serve: the environment a caller holds never reaches the server', async t => {
  const f = fixture(t);
  const env = { ...process.env, GGML_BACKEND_PATH: '/evil', LLAMA_ARG_HOST: '0.0.0.0', HF_TOKEN: 'secret', NODE_OPTIONS: '--require x', VK_ICD_FILENAMES: '/evil' };
  await startServe(t, f, { env });
  const rec = await f.recorded();
  for (const k of Object.keys(rec.env)) assert.doesNotMatch(k, /^(GGML_|LLAMA_|HF_|VK_|NODE_)/i, k);
});

test('serve: each request is checked, refused with a fixed reason, and never echoed', async t => {
  const f = fixture(t);
  await startServe(t, f);
  const { port } = (await ready(f)).run;
  const body = { state: {}, questions: QUESTIONS };
  const refused = async (word, status, o) => {
    const r = await call({ port, ...o });
    assert.equal(r.status, status, word);
    assert.deepEqual(JSON.parse(r.text), { error: word });
  };
  await refused('host', 400, { body, host: 'localhost' });
  await refused('host', 400, { body, host: `127.0.0.1:${port + 1}` });
  await refused('origin', 403, { body, headers: { origin: 'http://evil.example' } });
  // A page served from another port on this machine is still another origin.
  await refused('origin', 403, { body, headers: { origin: `http://127.0.0.1:${port}` } });
  await refused('route', 404, { path: '/v1/other', body });
  await refused('route', 404, { path: '/props', method: 'GET' });
  await refused('method', 405, { method: 'GET', path: '/v1/systemone' });
  await refused('content-type', 415, { body, headers: { 'content-type': 'text/plain' } });
  await refused('too-large', 413, { raw: Buffer.alloc(300 * 1024, 0x20) });
  await refused('body', 400, { raw: Buffer.from('not json') });
  await refused('body', 400, { body: { state: {} } });
  await refused('body', 400, { body: { state: {}, questions: {} } });
  await refused('body', 400, { body: { state: {}, questions: { a: { type: 'other' } } } });
  await refused('body', 400, { body: { state: {}, questions: { a: { type: 'choice' } } } });
  await refused('too-large', 413, { raw: Buffer.alloc(300 * 1024, 0x20), chunked: true });
  assert.equal(f.forwarded(), 0, 'no refused request reached the server');
  const ok = await call({ port, path: '/health', method: 'GET' });
  assert.equal(ok.status, 200);
  assert.deepEqual(Object.keys(JSON.parse(ok.text)).sort(), ['pid', 'ready', 'run', 'serverPid']);
});

test('serve: a server body that is not an exact answer becomes 502 no-answer, and none of its text reaches the caller', async t => {
  for (const mode of ['range', 'badchoice', 'extra', 'extraid', 'bare', 'text', 'status500']) {
    const f = fixture(t, { mode });
    const h = await startServe(t, f);
    const { port } = (await ready(f)).run;
    const r = await call({ port, body: { state: {}, questions: QUESTIONS } });
    assert.equal(r.status, 502, mode);
    assert.deepEqual(JSON.parse(r.text), { error: 'no-answer' }, mode);
    assert.doesNotMatch(r.text, /SECRET/, mode);
    assert.doesNotMatch(readFileSync(f.run.log, 'utf8'), /SECRET/, `${mode}: not in the log`);
    await h.stop('test');
  }
});

test('serve: serve.log holds reason words and counts, never a token, key, body or argument, and is capped', async t => {
  const f = fixture(t);
  writeFileSync(f.run.log, 'x'.repeat(1_200_000));
  await startServe(t, f);
  const live = await ready(f);
  await call({ port: live.run.port, body: { state: { secret: 'BODY-TEXT' }, questions: QUESTIONS } });
  const log = readFileSync(f.run.log, 'utf8');
  assert.ok(log.length < 100_000, 'a log past 1 MB starts again');
  const rec = await f.recorded();
  for (const bad of [rec.key, 'BODY-TEXT', 'SECRET-SERVER-TEXT', f.p.model, 'api-key-file']) assert.ok(!log.includes(bad), bad);
  assert.match(log, /forward answer ms \d+/);
});

test('serve: ends the server and itself after the idle time, removing run.json and run.key', async t => {
  const f = fixture(t);
  const h = await clef.serve({ dir: f.dir, ...f.exe, idleMs: 400, checkMs: 100, pollMs: 50 });
  await ready(f);
  const rec = await f.recorded();
  assert.equal(await h.done, 'idle');
  assert.equal(existsSync(f.run.run), false);
  assert.equal(existsSync(f.run.key), false);
  await sleep(200);
  assert.throws(() => process.kill(rec.pid, 0), 'the server is gone');
  assert.equal(await clef.liveSupervisor(f.dir), null);
});

test('serve: a forwarded request keeps it alive past the idle time', async t => {
  const f = fixture(t);
  const h = await clef.serve({ dir: f.dir, ...f.exe, idleMs: 700, checkMs: 100, pollMs: 50 });
  f.stoppers.push(() => h.stop('test'));
  const { port } = (await ready(f)).run;
  for (let i = 0; i < 4; i++) {
    await sleep(300);
    const r = await call({ port, body: { state: {}, questions: QUESTIONS } });
    assert.equal(r.status, 200, `request ${i}`);
  }
});

// PACT-82: the idle time counts from the last forward's end, and never runs out while one is in flight.
test('serve: a forward slower than the idle time is answered, and the idle time counts from its end', async t => {
  const f = fixture(t, { answerDelayMs: 900 });
  const h = await clef.serve({ dir: f.dir, ...f.exe, idleMs: 400, checkMs: 50, pollMs: 50 });
  f.stoppers.push(() => h.stop('test'));
  const { port } = (await ready(f)).run;
  const body = { state: {}, questions: QUESTIONS };
  assert.equal((await call({ port, body })).status, 200, 'the slow forward is answered');
  await sleep(150);
  assert.equal((await call({ port, body })).status, 200, 'still up after the forward ended');
});

test('serve: a server that exits ends the supervisor and records run.fail with a fixed word', async t => {
  const f = fixture(t, { exitAfterMs: 500 });
  const h = await clef.serve({ dir: f.dir, ...f.exe, idleMs: 60_000, checkMs: 60_000, pollMs: 50 });
  assert.equal(await h.done, 'exit');
  const fail = JSON.parse(readFileSync(f.run.fail, 'utf8'));
  assert.equal(fail.reason, 'exit');
  assert.equal(existsSync(f.run.run), false);
  assert.equal(existsSync(f.run.key), false);
  const rec = await f.recorded();
  const log = readFileSync(f.run.log, 'utf8');
  for (const bad of [rec.key, 'api-key-file', f.p.model, f.dir]) assert.ok(!log.includes(bad), `the log after a failed start holds no ${bad === rec.key ? 'key' : bad}`);
  assert.match(log, /stopped exit lines \d+/);
});

test('serve: a failure after the server is spawned ends the server and clears run.key before it is rethrown', async t => {
  const f = fixture(t);
  let calls = 0;
  const now = () => {
    calls += 1;
    if (calls === 2) {
      // let the stub start and record itself before the failure, so the test can name its pid
      for (const until = Date.now() + 8000; !existsSync(f.record) && Date.now() < until;) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
      throw new Error('boom');
    }
    return Date.now();
  };
  await assert.rejects(clef.serve({ dir: f.dir, ...f.exe, idleMs: 60_000, checkMs: 60_000, pollMs: 50, now }), /boom/);
  const rec = await f.recorded();
  assert.ok(await gone(rec.pid), 'the server is not left running');
  assert.equal(existsSync(f.run.key), false);
  assert.equal(JSON.parse(readFileSync(f.run.fail, 'utf8')).reason, 'exit');
});

test('serve: a stop leaves a newer run\'s key and run.json alone', async t => {
  const f = fixture(t);
  const h = await startServe(t, f);
  await ready(f);
  writeFileSync(f.run.key, 'another-runs-key\n');
  const newer = JSON.stringify({ port: 1, run: 'another-run', pid: 1, serverPid: 1, started: 'now' });
  writeFileSync(f.run.run, newer);
  await h.stop('test');
  assert.equal(readFileSync(f.run.key, 'utf8'), 'another-runs-key\n');
  assert.equal(readFileSync(f.run.run, 'utf8'), newer);
});

test('takeLock: a stale lock is taken over under run.lock.take, and not while another caller holds that step', t => {
  const f = fixture(t);
  writeFileSync(f.run.lock, '2000000000\n');
  mkdirSync(`${f.run.lock}.take`);
  assert.equal(clef.takeLock(f.dir), false, 'a caller is already taking it over');
  assert.equal(readFileSync(f.run.lock, 'utf8'), '2000000000\n', 'the lock is untouched');
  clefRm(`${f.run.lock}.take`, { recursive: true });
  assert.equal(clef.takeLock(f.dir), true);
  assert.equal(Number.parseInt(readFileSync(f.run.lock, 'utf8'), 10), process.pid);
  assert.equal(existsSync(`${f.run.lock}.take`), false, 'the step is released');
  assert.equal(clef.takeLock(f.dir, process.pid + 1), false, 'a live holder keeps it');
  clefRm(f.run.lock);
  writeFileSync(f.run.lock, '');
  assert.equal(clef.takeLock(f.dir), false, 'an empty lock that is being written is not stale');
  const aged = new Date(Date.now() - 60_000);
  utimesSync(f.run.lock, aged, aged);
  assert.equal(clef.takeLock(f.dir), true, 'an old empty lock is');
  clefRm(f.run.lock);
  mkdirSync(`${f.run.lock}.take`);
  writeFileSync(f.run.lock, '2000000000\n');
  const old = new Date(Date.now() - 60_000);
  utimesSync(`${f.run.lock}.take`, old, old);
  assert.equal(clef.takeLock(f.dir), false, 'this try is lost, but a step left by a dead caller is cleared');
  assert.equal(existsSync(`${f.run.lock}.take`), false);
  assert.equal(clef.takeLock(f.dir), true, 'the next try wins');
  clefRm(f.run.lock);
});

test('serve: a server that never gets ready times out with run.fail timeout', async t => {
  const f = fixture(t, { notReady: true });
  const h = await clef.serve({ dir: f.dir, ...f.exe, idleMs: 60_000, checkMs: 60_000, pollMs: 50, startTimeoutMs: 400 });
  assert.equal(await h.done, 'timeout');
  assert.equal(JSON.parse(readFileSync(f.run.fail, 'utf8')).reason, 'timeout');
  const live = await clef.liveSupervisor(f.dir);
  assert.equal(live, null);
});

test('serve: a request before the server is ready is 503 not-ready and is not forwarded', async t => {
  const f = fixture(t, { notReady: true });
  await startServe(t, f);
  let live = null;
  for (let i = 0; i < 100 && !live; i++) {
    live = await clef.liveSupervisor(f.dir);
    await sleep(50);
  }
  const r = await call({ port: live.run.port, body: { state: {}, questions: QUESTIONS } });
  assert.equal(r.status, 503);
  assert.deepEqual(JSON.parse(r.text), { error: 'not-ready' });
  assert.equal(live.health.ready, false);
});

test('serve: when its own script changes it answers nothing more, ends the server and exits (off the list)', async t => {
  const f = fixture(t);
  const script = join(f.root, 'clef-copy.mjs');
  writeFileSync(script, '// a copy\n');
  const h = await clef.serve({ dir: f.dir, ...f.exe, idleMs: 60_000, checkMs: 60_000, pollMs: 50, scriptUrl: pathToFileURL(script).href });
  const { port } = (await ready(f)).run;
  const rec = await f.recorded();
  writeFileSync(script, '// a copy, changed\n');
  const r = await call({ port, body: { state: {}, questions: QUESTIONS } });
  assert.equal(r.status, 503);
  assert.deepEqual(JSON.parse(r.text), { error: 'stopping' });
  assert.equal(await h.done, 'changed');
  assert.equal(existsSync(f.run.run), false);
  assert.equal(existsSync(f.run.key), false);
  await sleep(200);
  assert.throws(() => process.kill(rec.pid, 0), 'the server is gone');
});

test('serve: the once-a-minute check also ends it when its script is gone or only its mtime moved', async t => {
  const f = fixture(t);
  const script = join(f.root, 'clef-copy.mjs');
  writeFileSync(script, '// a copy\n');
  const h = await clef.serve({ dir: f.dir, ...f.exe, idleMs: 60_000, checkMs: 100, pollMs: 50, scriptUrl: pathToFileURL(script).href });
  await ready(f);
  const when = new Date(Date.now() + 5000);
  utimesSync(script, when, when);
  assert.equal(await h.done, 'changed');
  const g = fixture(t);
  const script2 = join(g.root, 'clef-copy.mjs');
  writeFileSync(script2, '// a copy\n');
  const h2 = await clef.serve({ dir: g.dir, ...g.exe, idleMs: 60_000, checkMs: 100, pollMs: 50, scriptUrl: pathToFileURL(script2).href });
  await ready(g);
  clefRm(script2);
  assert.equal(await h2.done, 'changed');
});

test('serve: a folder that is not set up fails with clef-setup and run.fail setup, and starts no server', async t => {
  const f = fixture(t);
  writeFileSync(f.p.setup, JSON.stringify({ platform: 'x', tag: 'b1', model: 'y' }));
  await assert.rejects(clef.serve({ dir: f.dir, ...f.exe }), e => e instanceof clef.Refused && e.code === 'clef-setup');
  assert.equal(JSON.parse(readFileSync(f.run.fail, 'utf8')).reason, 'exit');
  assert.equal(existsSync(f.record), false, 'the stub never started');
});

// ------------------------------------------------------------ ensure, stop, status, remove

function wrapperFor(f, extra = '') {
  const wrapper = join(f.root, 'supervise.mjs');
  writeFileSync(wrapper, `import { serve } from ${JSON.stringify(pathToFileURL(CLEF_PATH).href)};
import { writeFileSync } from 'node:fs';
writeFileSync(${JSON.stringify(join(f.root, 'supervisor-env.json'))}, JSON.stringify({ env: process.env, cwd: process.cwd() }));
const h = await serve({ dir: ${JSON.stringify(f.dir)}, exe: ${JSON.stringify(process.execPath)}, exePrefix: ${JSON.stringify(f.exe.exePrefix)}, pdeathsig: false, idleMs: 60000, checkMs: 60000, pollMs: 50 ${extra} });
await h.done;
`);
  return () => ({ file: process.execPath, args: [wrapper] });
}

/** Waits for a supervisor that is still starting to write run.json, then stops it. */
async function stopFixture(f) {
  const lockPid = () => Number.parseInt(existsSync(f.run.lock) ? readFileSync(f.run.lock, 'utf8') : '', 10);
  for (let i = 0; i < 100 && existsSync(f.run.lock) && !existsSync(f.run.run) && alive(lockPid()); i++) await sleep(100);
  await clef.stopRun({ dir: f.dir });
}

const ensure = (f, o = {}) => clef.ensure({ dir: f.dir, ...o, supervisorCommand: o.supervisorCommand ?? wrapperFor(f) });

/** A live process that is not a supervisor, ended when the fixture is. */
function sleeperProcess(f) {
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120000)'], { stdio: 'ignore' });
  f.stoppers.push(() => child.kill());
  return child;
}
const alive = pid => {
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  // A process that was killed and has no parent left to reap it stays as a zombie in a container without an init.
  try {
    return !/^\d+ \(.*\) Z /.test(readFileSync(`/proc/${pid}/stat`, 'utf8'));
  } catch {
    return true;
  }
};
async function gone(pid, ms = 8000) {
  for (let i = 0; i < ms / 50 && alive(pid); i++) await sleep(50);
  return !alive(pid);
}

test('ensure: not set up is state not-set-up and exit 3, never a fetch and never a token', async t => {
  const f = fixture(t);
  writeFileSync(f.p.setup, JSON.stringify({ platform: Object.keys(clef.SERVER.archives)[0], tag: 'b1', model: clef.MODEL.sha256 }));
  assert.deepEqual(await ensure(f), { out: { state: 'not-set-up', reason: 'pin-changed' }, code: 3 });
  writeFileSync(f.p.setup, '{');
  assert.deepEqual(await ensure(f), { out: { state: 'not-set-up', reason: 'missing' }, code: 3 });
  const g = fixture(t);
  assert.equal(readdirSync(g.p.models).length, 1);
  writeFileSync(g.p.model, 'x');
  const key = Object.keys(clef.SERVER.archives)[0];
  const a = clef.SERVER.archives[key];
  const exePath = join(g.p.runtime, clef.destName(a.exe, a.exe));
  clefRm(exePath);
  assert.deepEqual(await ensure(g), { out: { state: 'not-set-up', reason: 'missing' }, code: 3 });
});

test('ensure: starts a detached supervisor, waits for ready, and a second ensure finds it live; stop ends supervisor and server', async t => {
  const f = fixture(t);
  f.stoppers.push(() => stopFixture(f));
  const first = await ensure(f, { wait: 20 });
  assert.equal(first.code, 0);
  assert.equal(first.out.state, 'ready');
  assert.match(first.out.url, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.deepEqual(Object.keys(first.out).sort(), ['state', 'url']);
  const run = JSON.parse(readFileSync(f.run.run, 'utf8'));
  const again = await ensure(f);
  assert.deepEqual(again.out, first.out);
  const rec = await f.recorded();
  assert.equal(rec.pid, run.serverPid);
  const status = await clef.statusRun({ dir: f.dir });
  assert.ok(status.lines.includes('run: ready'));
  assert.ok(!status.lines.join('\n').includes(rec.key), 'status prints no key');
  assert.ok(!status.lines.join('\n').includes(f.root), 'status prints no path');
  const stopped = await clef.stopRun({ dir: f.dir });
  assert.deepEqual(stopped.lines, ['stopped']);
  assert.ok(await gone(run.pid), 'the supervisor is gone');
  assert.ok(await gone(run.serverPid), 'the server is gone with it');
  for (const p of [f.run.run, f.run.key, f.run.fail]) assert.equal(existsSync(p), false);
  assert.equal(await clef.liveSupervisor(f.dir), null);
  assert.deepEqual((await clef.stopRun({ dir: f.dir })).lines, ['none running']);
});

test('ensure: with --wait 0 it prints starting and does not wait', async t => {
  const f = fixture(t, { notReady: true });
  f.stoppers.push(() => stopFixture(f));
  const r = await ensure(f, { wait: 0 });
  assert.deepEqual(r, { out: { state: 'starting' }, code: 0 });
});

test('ensure: a start that failed less than 10 minutes ago is state failed with the reason, exit 4, and starts nothing; stop clears it', async t => {
  const f = fixture(t);
  writeFileSync(f.run.fail, `${JSON.stringify({ time: Date.now() - 60_000, reason: 'exit' })}\n`);
  const r = await ensure(f, { wait: 1 });
  assert.deepEqual(r, { out: { state: 'failed', reason: 'exit' }, code: 4 });
  assert.equal(existsSync(f.record), false);
  assert.ok((await clef.statusRun({ dir: f.dir })).lines.includes('last failure: exit'));
  writeFileSync(f.run.fail, `${JSON.stringify({ time: Date.now() - 9 * 60_000, reason: 'timeout' })}\n`);
  assert.deepEqual(await ensure(f, { wait: 1 }), { out: { state: 'failed', reason: 'timeout' }, code: 4 }, 'still held at 9 minutes');
  assert.equal(existsSync(f.record), false, 'nothing was started');
  await clef.stopRun({ dir: f.dir });
  assert.equal(existsSync(f.run.fail), false);
  writeFileSync(f.run.fail, `${JSON.stringify({ time: Date.now() - 11 * 60_000, reason: 'exit' })}\n`);
  f.stoppers.push(() => stopFixture(f));
  assert.equal((await ensure(f, { wait: 20 })).out.state, 'ready', 'a failure older than 10 minutes does not hold');
});

test('ensure: a run.json that does not match a live supervisor (a dead pid, a wrong run id) is removed and a fresh start follows', async t => {
  const f = fixture(t);
  f.stoppers.push(() => stopFixture(f));
  writeFileSync(f.run.run, JSON.stringify({ port: 1, run: 'y', pid: 2_000_000_000, serverPid: 1, started: 'now' }));
  const r = await ensure(f, { wait: 20 });
  assert.equal(r.out.state, 'ready');
  const run = JSON.parse(readFileSync(f.run.run, 'utf8'));
  assert.notEqual(run.pid, 2_000_000_000);
  // a live pid that is not a supervisor (this test process) with a wrong health answer
  await clef.stopRun({ dir: f.dir });
  writeFileSync(f.run.run, JSON.stringify({ port: run.port, run: 'y', pid: process.pid, serverPid: 1, started: 'now' }));
  assert.equal(await clef.liveSupervisor(f.dir), null, 'a live pid alone is not a supervisor');
});

test('liveSupervisor: an answering /health that disagrees with run.json on run, pid or serverPid is not a live supervisor', async t => {
  const f = fixture(t);
  await startServe(t, f);
  const live = await ready(f);
  const good = JSON.parse(readFileSync(f.run.run, 'utf8'));
  assert.ok(await clef.liveSupervisor(f.dir));
  const sleeper = sleeperProcess(f);
  for (const change of [{ run: 'other' }, { serverPid: good.serverPid + 1 }, { pid: sleeper.pid }, { port: live.run.port + 1 }]) {
    writeFileSync(f.run.run, JSON.stringify({ ...good, ...change }));
    assert.equal(await clef.liveSupervisor(f.dir), null, JSON.stringify(Object.keys(change)));
  }
  writeFileSync(f.run.run, JSON.stringify(good));
  assert.ok(await clef.liveSupervisor(f.dir));
});

test('ensure: a stale lock is removed, and a live lock makes a losing ensure wait instead of spawning', async t => {
  const f = fixture(t);
  writeFileSync(f.run.lock, '2000000000\n');
  f.stoppers.push(() => stopFixture(f));
  assert.equal((await ensure(f, { wait: 20 })).out.state, 'ready', 'a lock whose pid is gone is stale');
  await clef.stopRun({ dir: f.dir });
  clefRm(f.record);
  writeFileSync(f.run.lock, `${process.pid}\n`);
  let asked = 0;
  const wrapper = wrapperFor(f);
  const r = await ensure(f, { wait: 1, supervisorCommand: () => { asked += 1; return wrapper(); } });
  assert.deepEqual(r, { out: { state: 'starting' }, code: 0 });
  assert.equal(asked, 0, 'the losing ensure never asked for a supervisor');
  assert.equal(existsSync(f.record), false, 'the losing ensure never spawned');
  clefRm(f.run.lock);
});

test('remove: without --yes it deletes nothing; with --yes it stops a live supervisor and deletes the folder without following a link out of it', async t => {
  const f = fixture(t);
  const outside = join(f.root, 'outside');
  mkdirSync(outside);
  writeFileSync(join(outside, 'keep.txt'), 'x');
  writeFileSync(join(f.cfgHome, 'sibling.txt'), 'x');
  let linked = true;
  try {
    symlinkSync(outside, join(f.dir, 'trap'), 'junction');
  } catch {
    linked = false;
  }
  const plan = await clef.removeRun({ dir: f.dir });
  assert.match(plan.lines.join('\n'), /clef folder: /);
  assert.match(plan.lines.join('\n'), /size: [0-9.]+ MB/);
  assert.equal(existsSync(f.dir), true, 'nothing deleted without --yes');
  assert.match(plan.lines.at(-1), /--yes/);
  assert.equal((await ensure(f, { wait: 20 })).out.state, 'ready');
  const run = JSON.parse(readFileSync(f.run.run, 'utf8'));
  const done = await clef.removeRun({ dir: f.dir, yes: true });
  assert.equal(done.lines.at(-1), 'removed');
  assert.equal(existsSync(f.dir), false);
  assert.ok(await gone(run.pid) && (await gone(run.serverPid)));
  assert.equal(readFileSync(join(f.cfgHome, 'sibling.txt'), 'utf8'), 'x', 'only the clef folder is deleted, not the folder it sits in');
  if (linked) assert.equal(readFileSync(join(outside, 'keep.txt'), 'utf8'), 'x', 'the link target is untouched');
});

// ------------------------------------------------------------ the orphan sweep (Linux's /proc)

test('sweepOrphans: ends a process whose exe lies under runtime/ and whose parent is not the live supervisor, and nothing else', t => {
  if (WIN) return t.skip('/proc is Linux only');
  const f = fixture(t);
  const proc = join(f.root, 'proc');
  const mk = (pid, exe, ppid) => {
    mkdirSync(join(proc, String(pid)), { recursive: true });
    writeFileSync(join(proc, String(pid), 'stat'), `${pid} (llama (server)) S ${ppid} 1 1 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 1 1 1 1\n`);
    if (exe !== null) symlinkSync(exe, join(proc, String(pid), 'exe'));
  };
  const under = `${f.dir.split('\\').join('/')}/runtime`;
  try {
    mk(101, `${under}/b1/llama-server`, 1);
    mk(102, `${under}/b0/llama-server (deleted)`, 1);
    mk(103, `${under}/b1/llama-server`, 555);
    mk(104, '/usr/bin/node', 1);
    mk(105, `${under}x/llama-server`, 1);
    mk(106, null, 1);
  } catch {
    return t.skip('this machine cannot make a link');
  }
  const killed = [];
  const ended = clef.sweepOrphans({ dir: f.dir, procRoot: proc, kill: pid => killed.push(pid), liveSupervisorPid: 555 });
  assert.deepEqual([...ended].sort(), [101, 102]);
  assert.deepEqual(killed.sort(), [101, 102]);
});

// ------------------------------------------------------------ setup's new refusals (main)

test('main: setup refuses clef-running while a supervisor is live, and clef-setpriv on Linux without /usr/bin/setpriv, each before any fetch', async t => {
  const f = fixture(t);
  f.stoppers.push(() => stopFixture(f));
  const base = { env: { CLAUDE_CONFIG_DIR: f.cfgHome }, cwd: tempDir(t, 'clef-start-'), chdir: () => {}, transport: { request: () => { throw new Error('a request was made'); } }, account: f.cfgHome };
  const out = [];
  assert.equal(await clef.main(['setup', '--yes'], { ...base, platform: 'linux', arch: 'x64', exists: () => false, out: l => out.push(l) }), 2);
  assert.equal(out.at(-1), 'RESULT: refused clef-setpriv');
  await startServe(t, f);
  await ready(f);
  out.length = 0;
  assert.equal(await clef.main(['setup', '--yes'], { ...base, platform: 'win32', arch: 'x64', exists: () => true, out: l => out.push(l) }), 2);
  assert.equal(out.at(-1), 'RESULT: refused clef-running');
  assert.match(out.at(-2), /clef stop/);
  out.length = 0;
  assert.equal(await clef.main(['setup'], { ...base, platform: 'win32', arch: 'x64', exists: () => true, out: l => out.push(l) }), 2, 'the plan refuses too');
  assert.equal(out.at(-1), 'RESULT: refused clef-running');
});

test('main: ensure, status, stop and remove run from the clef folder (remove from its parent), and ensure prints one JSON line', async t => {
  const f = fixture(t);
  const moved = [];
  const base = { env: { CLAUDE_CONFIG_DIR: f.cfgHome }, cwd: tempDir(t, 'clef-start-'), chdir: d => moved.push(d), account: f.cfgHome };
  const out = [];
  writeFileSync(f.p.setup, '{');
  assert.equal(await clef.main(['ensure'], { ...base, out: l => out.push(l) }), 3);
  assert.deepEqual(out, ['{"state":"not-set-up","reason":"missing"}']);
  out.length = 0;
  assert.equal(await clef.main(['status'], { ...base, out: l => out.push(l) }), 0);
  assert.equal(out.at(-1), 'RESULT: pass');
  assert.ok(out.includes('setup: none'));
  out.length = 0;
  assert.equal(await clef.main(['stop'], { ...base, out: l => out.push(l) }), 0);
  assert.equal(out[0], 'none running');
  out.length = 0;
  assert.equal(await clef.main(['remove'], { ...base, out: l => out.push(l) }), 0);
  assert.equal(existsSync(f.dir), true);
  assert.equal(moved.at(-1), f.cfgHome, 'remove starts from the parent, so the folder can be deleted');
  assert.deepEqual(moved.slice(0, 3), [f.dir, f.dir, f.dir]);
  assert.equal(await clef.main(['remove', '--yes'], { ...base, out: l => out.push(l) }), 0);
  assert.equal(existsSync(f.dir), false);
});

// ------------------------------------------------------------ the real start path, the lock and the kill (round 1)

const NAMED_ENV = new Set('SYSTEMROOT WINDIR TEMP TMP HOME USERPROFILE LOCALAPPDATA XDG_RUNTIME_DIR PATH LD_LIBRARY_PATH'.split(' '));
/** The one name macOS's runtime sets in every process it starts when it is missing (spec 0003 M7); the caller's copy never passes. */
const MAC_OWN = '__CF_USER_TEXT_ENCODING';
/** On macOS, that name, and TMPDIR, which clef passes there (spec 0003 M4). */
const macOwn = k => process.platform === 'darwin' && (k === MAC_OWN || k === 'TMPDIR');
// Windows itself fills in these when it starts a process for the user; Node copies them from the caller's own environment.
if (WIN) for (const n of ['HOMEDRIVE', 'HOMEPATH', 'LOGONSERVER', 'SYSTEMDRIVE', 'USERDOMAIN', 'USERNAME']) NAMED_ENV.add(n);
const sameFolder = (a, b) => realpathSync.native(a).toLowerCase() === realpathSync.native(b).toLowerCase();
const POISON = { NODE_OPTIONS: '--no-warnings', GGML_BACKEND_PATH: '/evil', LLAMA_ARG_HOST: '0.0.0.0', HF_TOKEN: 'secret', VK_ICD_FILENAMES: '/evil', SECRET_X: 's', DYLD_INSERT_LIBRARIES: '/evil.dylib', DYLD_LIBRARY_PATH: '/evil', [MAC_OWN]: 'POISON' };

test('supervisorEnv: the named list plus CLAUDE_CONFIG_DIR when set; the server\'s list never carries it', () => {
  const env = { HOME: '/h', CLAUDE_CONFIG_DIR: '/c', NODE_OPTIONS: '--x' };
  assert.deepEqual(Object.keys(clef.supervisorEnv(env, 'linux', '/r')).sort(), ['CLAUDE_CONFIG_DIR', 'HOME', 'LD_LIBRARY_PATH', 'PATH']);
  assert.equal(clef.supervisorEnv({ HOME: '/h' }, 'linux', '/r').CLAUDE_CONFIG_DIR, undefined);
  assert.equal(clef.serveEnv(env, 'linux', '/r').CLAUDE_CONFIG_DIR, undefined);
});

test('ensure: the supervisor it starts is `node <script> serve` run from runtime/<tag>/, with a named environment and CLAUDE_CONFIG_DIR', async t => {
  const f = fixture(t);
  const recorder = join(f.root, 'recorder.mjs');
  const seenFile = join(f.root, 'launched.json');
  writeFileSync(recorder, `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(seenFile)}, JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd(), env: process.env }));\n`);
  f.stoppers.push(() => stopFixture(f));
  const r = await clef.ensure({ dir: f.dir, wait: 0, scriptPath: recorder, env: { ...process.env, ...POISON, CLAUDE_CONFIG_DIR: f.cfgHome } });
  assert.deepEqual(r, { out: { state: 'starting' }, code: 0 });
  for (let i = 0; i < 100 && !existsSync(seenFile); i++) await sleep(50);
  const seen = JSON.parse(readFileSync(seenFile, 'utf8'));
  assert.deepEqual(seen.argv, ['serve']);
  assert.ok(sameFolder(seen.cwd, f.p.runtime), 'started from runtime/<tag>/');
  const named = new Set([...NAMED_ENV, 'CLAUDE_CONFIG_DIR']);
  for (const k of Object.keys(seen.env)) assert.ok(named.has(k.toUpperCase()) || macOwn(k), `${k} is not on the list`);
  assert.notEqual(seen.env[MAC_OWN], 'POISON', 'the caller\'s own copy of the macOS name is not passed');
  assert.ok(Object.keys(seen.env).some(k => k.toUpperCase() === 'PATH'), 'the named environment is passed, not an empty one');
  assert.equal(seen.env.CLAUDE_CONFIG_DIR, f.cfgHome, 'the supervisor gets the variable so it works out the same folder');
});

test('main: serve runs only from runtime/<tag>/ of the clef folder the other modes work out, and refuses any other folder, even one of the right shape', async t => {
  const f = fixture(t);
  const env = { ...process.env, CLAUDE_CONFIG_DIR: f.cfgHome };
  const out = [];
  const code = await clef.main(['serve'], { env, cwd: f.p.runtime, account: f.cfgHome, out: l => out.push(l), chdir: () => { throw new Error('serve does not change folder'); }, serveOptions: { ...f.exe, idleMs: 500, checkMs: 100, pollMs: 50 } });
  assert.equal(code, 0, out.join('\n'));
  assert.match(readFileSync(f.run.log, 'utf8'), /stopped idle/);
  // a folder of the right shape that is not the account's (what a clone could carry), and folders of the wrong shape
  const decoy = fixture(t);
  for (const cwd of [decoy.p.runtime, f.dir, f.p.models, tempDir(t, 'clef-start-')]) {
    const lines = [];
    assert.equal(await clef.main(['serve'], { env, cwd, account: f.cfgHome, out: l => lines.push(l), chdir: () => {}, serveOptions: { ...decoy.exe } }), 2, cwd);
    assert.equal(lines.at(-1), 'RESULT: refused clef-home');
  }
  assert.equal(existsSync(decoy.record), false, 'the decoy folder\'s program was never started');
  assert.equal(existsSync(decoy.run.run) || existsSync(decoy.run.key), false, 'nothing was written in the decoy');
  const fail = JSON.parse(readFileSync(f.run.fail, 'utf8'));
  assert.equal(fail.reason, 'exit', 'a refused start is recorded in the account\'s folder so ensure does not respawn without end');
});

test('ensure: the supervisor and the server get only the named environment, and the server\'s PATH is the fixed one', async t => {
  const f = fixture(t);
  f.stoppers.push(() => stopFixture(f));
  const env = { ...process.env, ...POISON, CLAUDE_CONFIG_DIR: f.cfgHome };
  assert.equal((await ensure(f, { wait: 20, env })).out.state, 'ready');
  const sup = JSON.parse(readFileSync(join(f.root, 'supervisor-env.json'), 'utf8'));
  for (const k of Object.keys(sup.env)) assert.ok(NAMED_ENV.has(k.toUpperCase()) || k === 'CLAUDE_CONFIG_DIR' || macOwn(k), `the supervisor got ${k}`);
  assert.ok(sameFolder(sup.cwd, f.p.runtime));
  const rec = await f.recorded();
  const pathKey = Object.keys(rec.env).find(k => k.toUpperCase() === 'PATH');
  assert.equal(rec.env[pathKey].toLowerCase(), clef.serveEnv(env, process.platform, f.p.runtime).PATH.toLowerCase(), 'the server\'s PATH is the fixed one, not the caller\'s');
  for (const k of Object.keys(rec.env)) assert.ok(NAMED_ENV.has(k.toUpperCase()) || macOwn(k), `the server got ${k}`);
  for (const e of [sup.env, rec.env]) assert.notEqual(e[MAC_OWN], 'POISON', 'the caller\'s own copy of the macOS name is not passed');
});

test('ensure: with --wait N and a supervisor that is already starting, it waits for ready', async t => {
  const f = fixture(t, { readyAfterMs: 1200 });
  await startServe(t, f);
  let live = null;
  for (let i = 0; i < 100 && !live; i++) {
    live = await clef.liveSupervisor(f.dir);
    if (!live) await sleep(50);
  }
  assert.equal(live.health.ready, false);
  assert.equal((await ensure(f, { wait: 0 })).out.state, 'starting');
  const r = await ensure(f, { wait: 15 });
  assert.equal(r.out.state, 'ready');
  assert.equal(r.code, 0);
});

test('ensure and stop leave alone a live process that run.json names but that is not a supervisor', async t => {
  const f = fixture(t);
  f.stoppers.push(() => stopFixture(f));
  const sleeper = sleeperProcess(f);
  const decoy = () => writeFileSync(f.run.run, JSON.stringify({ port: 1, run: 'y', pid: sleeper.pid, serverPid: 1, started: 'now' }));
  decoy();
  assert.equal((await ensure(f, { wait: 20 })).out.state, 'ready');
  assert.ok(alive(sleeper.pid), 'ensure left it');
  await clef.stopRun({ dir: f.dir });
  assert.ok(alive(sleeper.pid), 'stop left it');
  decoy();
  assert.deepEqual((await clef.stopRun({ dir: f.dir })).lines, ['none running']);
  assert.ok(alive(sleeper.pid), 'stop with none live left it');
});

test('a supervisor that is killed outright leaves no server behind within 2 seconds', async t => {
  if (!WIN && !existsSync('/usr/bin/setpriv')) return t.skip('no /usr/bin/setpriv on this machine');
  const f = fixture(t);
  f.stoppers.push(() => stopFixture(f));
  assert.equal((await ensure(f, { wait: 20, supervisorCommand: wrapperFor(f, ', pdeathsig: true') })).out.state, 'ready');
  const run = JSON.parse(readFileSync(f.run.run, 'utf8'));
  assert.ok(alive(run.serverPid));
  process.kill(run.pid, 'SIGKILL');
  assert.ok(await gone(run.serverPid, 2000), 'the server went with its supervisor');
});

test('ensure: the orphan sweep runs only while it holds run.lock', async t => {
  if (WIN) return t.skip('/proc is Linux only');
  const f = fixture(t);
  const proc = join(f.root, 'proc');
  try {
    mkdirSync(join(proc, '201'), { recursive: true });
    writeFileSync(join(proc, '201', 'stat'), '201 (llama-server) S 1 1 1 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 1 1 1 1\n');
    symlinkSync(`${f.dir}/runtime/b1/llama-server`, join(proc, '201', 'exe'));
  } catch {
    return t.skip('this machine cannot make a link');
  }
  const killed = [];
  writeFileSync(f.run.lock, `${process.pid}\n`);
  await ensure(f, { wait: 0, platform: 'linux', procRoot: proc, kill: p => killed.push(p) });
  assert.deepEqual(killed, [], 'someone else holds the lock: nothing is ended');
  clefRm(f.run.lock);
  f.stoppers.push(() => stopFixture(f));
  await ensure(f, { wait: 20, platform: 'linux', procRoot: proc, kill: p => killed.push(p) });
  assert.deepEqual(killed, [201], 'holding the lock: the orphan is ended');
});

test('ensure: callers at the same moment over a stale lock start exactly one supervisor', async t => {
  const f = fixture(t);
  f.stoppers.push(() => stopFixture(f));
  const launches = join(f.root, 'launches.txt');
  const runner = join(f.root, 'ensure-once.mjs');
  const command = wrapperFor(f)();
  writeFileSync(runner, `import { ensure } from ${JSON.stringify(pathToFileURL(CLEF_PATH).href)};
import { appendFileSync } from 'node:fs';
const r = await ensure({ dir: ${JSON.stringify(f.dir)}, wait: 0, supervisorCommand: () => { appendFileSync(${JSON.stringify(launches)}, 'x\\n'); return ${JSON.stringify(command)}; } });
process.stdout.write(JSON.stringify(r.out));
`);
  for (let round = 0; round < 3; round++) {
    await clef.stopRun({ dir: f.dir });
    clefRm(launches, { force: true });
    writeFileSync(f.run.lock, '2000000000\n');
    const results = await Promise.all(Array.from({ length: 12 }, () => new Promise(resolveP => {
      const c = spawn(process.execPath, [runner], { stdio: ['ignore', 'pipe', 'inherit'] });
      let text = '';
      c.stdout.on('data', d => (text += d));
      c.on('exit', code => resolveP({ code, text }));
    })));
    for (const r of results) assert.equal(r.code, 0);
    const n = existsSync(launches) ? readFileSync(launches, 'utf8').split('\n').filter(Boolean).length : 0;
    assert.equal(n, 1, `round ${round}: one supervisor was started`);
    await stopFixture(f);
  }
});

test('ensure: a caller that saw no supervisor, then finds the lock free, starts no second one and keeps run.json', async t => {
  const f = fixture(t);
  f.stoppers.push(() => stopFixture(f));
  assert.equal((await ensure(f, { wait: 20 })).out.state, 'ready');
  for (let i = 0; i < 100 && existsSync(f.run.lock); i++) await sleep(50);
  assert.equal(existsSync(f.run.lock), false, 'the supervisor let go of run.lock');
  const before = readFileSync(f.run.run, 'utf8');
  // This caller's first check ran just before the supervisor wrote run.json; the check is held back to that moment.
  let checks = 0;
  const launches = [];
  const r = await clef.ensure({
    dir: f.dir,
    wait: 0,
    liveCheck: dir => (checks++ === 0 ? null : clef.liveSupervisor(dir)),
    supervisorCommand: () => {
      launches.push('launched');
      return { file: process.execPath, args: ['-e', ''] };
    },
  });
  assert.equal(checks, 2, 'ensure checked twice, both through liveCheck: once before the lock and once after');
  assert.deepEqual(launches, [], 'no second supervisor was started');
  assert.equal(r.out.state, 'ready');
  assert.equal(readFileSync(f.run.run, 'utf8'), before, 'the live run.json was not removed');
  assert.equal(existsSync(f.run.lock), false, 'the caller let go of the lock it took');
});

// ------------------------------------------------------------ the shape of the source

test('the supervisor source: only the named routes, no shell, no wildcard bind, no token on a command line or in a log call', () => {
  assert.doesNotMatch(SOURCE_TEXT, /listen\(0, '0\.0\.0\.0'|listen\(0\)|listen\(0, '::/);
  assert.equal(SOURCE_TEXT.split("listen(0, '127.0.0.1'").length - 1, 2, 'the supervisor and the port probe bind loopback only');
  assert.doesNotMatch(SOURCE_TEXT, /process\.env\.(GGML|LLAMA|HF_|VK_)/);
  assert.doesNotMatch(SOURCE_TEXT, /logLine\([^)]*(token|serverKey|body)/i);
});

// ------------------------------------------------------------ the keeper (spec 0003 M5)

/** A fake keeper process: its sends are recorded, and a send's callback runs on the next turn. */
function fakeProc() {
  const p = new EventEmitter();
  p.sent = [];
  p.exits = [];
  p.send = (m, cb) => {
    p.sent.push(m);
    if (cb) setImmediate(cb);
  };
  p.exit = code => p.exits.push(code);
  return p;
}
/** A fake server child that records the signals it is sent. */
function fakeServer(pid = 4242) {
  const c = new EventEmitter();
  c.pid = pid;
  c.signals = [];
  c.kill = sig => c.signals.push(sig);
  return c;
}
const MSG = { file: '/r/llama-server', args: ['--x'], cwd: '/r', env: { PATH: '/usr/bin:/bin' } };

test('keep: refuses clef-keep without an IPC channel', () => {
  const p = new EventEmitter();
  assert.throws(() => clef.keep({ proc: p }), e => e instanceof clef.Refused && e.code === 'clef-keep');
});

test('keep: spawns what the one message names, sends {pid}, and on the server\'s exit leaves only from {gone}\'s send callback', async () => {
  const p = fakeProc();
  const srv = fakeServer();
  let spawned;
  clef.keep({ proc: p, spawnFn: (file, args, o) => ((spawned = { file, args, o }), srv) });
  p.emit('message', MSG);
  assert.deepEqual([spawned.file, spawned.args, spawned.o.cwd, spawned.o.env, spawned.o.shell], [MSG.file, MSG.args, MSG.cwd, MSG.env, false]);
  assert.deepEqual(spawned.o.stdio, ['ignore', 'inherit', 'inherit']);
  assert.deepEqual(p.sent, [{ pid: 4242 }]);
  srv.emit('exit', 0);
  assert.deepEqual(p.sent.at(-1), { gone: true });
  assert.deepEqual(p.exits, [], 'not straight after the send');
  await new Promise(r => setImmediate(r));
  assert.deepEqual(p.exits, [0]);
});

test('keep: the channel closing sends the server SIGKILL and the keeper leaves', () => {
  const p = fakeProc();
  const srv = fakeServer();
  clef.keep({ proc: p, spawnFn: () => srv });
  p.emit('message', MSG);
  p.emit('disconnect');
  assert.deepEqual(srv.signals, ['SIGKILL']);
  assert.deepEqual(p.exits, [0]);
});

test('keep: SIGTERM sends the server SIGTERM, then SIGKILL after the wait', async () => {
  const p = fakeProc();
  const srv = fakeServer();
  clef.keep({ proc: p, spawnFn: () => srv, termWaitMs: 20 });
  p.emit('message', MSG);
  p.emit('SIGTERM');
  assert.deepEqual(srv.signals, ['SIGTERM']);
  await new Promise(r => setTimeout(r, 60));
  assert.deepEqual(srv.signals, ['SIGTERM', 'SIGKILL']);
});

// Spec 0003 M5: the keeper waits 5 seconds after SIGTERM, which the supervisor's 7-second wait must outlast.
test('keep: the default wait after SIGTERM is 5 seconds', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const p = fakeProc();
  const srv = fakeServer();
  clef.keep({ proc: p, spawnFn: () => srv });
  p.emit('message', MSG);
  p.emit('SIGTERM');
  t.mock.timers.tick(4999);
  assert.deepEqual(srv.signals, ['SIGTERM']);
  t.mock.timers.tick(1);
  assert.deepEqual(srv.signals, ['SIGTERM', 'SIGKILL']);
});

test('bad case: keep ends the server on a second message', () => {
  const p = fakeProc();
  const srv = fakeServer();
  clef.keep({ proc: p, spawnFn: () => srv });
  p.emit('message', MSG);
  p.emit('message', MSG);
  assert.deepEqual(srv.signals, ['SIGKILL']);
});

for (const [label, m] of [['a shell string for args', { ...MSG, args: 'rm -rf /' }], ['a number in the environment', { ...MSG, env: { X: 1 } }], ['a missing folder', { file: MSG.file, args: MSG.args, env: MSG.env }], ['an extra key', { ...MSG, extra: 1 }]]) {
  test(`bad case: keep spawns nothing and leaves on a first message with ${label}`, () => {
    const p = fakeProc();
    let spawned = false;
    clef.keep({ proc: p, spawnFn: () => ((spawned = true), fakeServer()) });
    p.emit('message', m);
    assert.equal(spawned, false);
    assert.deepEqual(p.exits, [1]);
  });
}

test('keep: a spawn that throws sends {error: spawn} and leaves from its callback', async () => {
  const p = fakeProc();
  clef.keep({ proc: p, spawnFn: () => { throw new Error('ENOENT'); } });
  p.emit('message', MSG);
  assert.deepEqual(p.sent, [{ error: 'spawn' }]);
  await new Promise(r => setImmediate(r));
  assert.deepEqual(p.exits, [1]);
});

test('main: keep without an IPC channel refuses clef-keep and works out no folder', async t => {
  const out = [];
  const code = await clef.main(['keep'], { env: { CLAUDE_CONFIG_DIR: 'not absolute' }, out: l => out.push(l), chdir: () => assert.fail('no folder work') });
  assert.equal(code, 2);
  assert.equal(out.at(-1), 'RESULT: refused clef-keep');
  // From a command line there is no message to act on, so no program is started.
  const children = () => process._getActiveHandles().filter(h => h.constructor?.name === 'ChildProcess').length;
  const before = children();
  await clef.main(['keep'], { out: () => {}, chdir: () => assert.fail('no folder work') });
  assert.equal(children(), before, 'no child process was started');
});

test('lifetimeLine: a job object on Windows, the keeper on macOS, setpriv on Linux', () => {
  assert.equal(clef.lifetimeLine({ platform: 'win32' }), 'job-object');
  assert.equal(clef.lifetimeLine({ platform: 'darwin' }), 'keeper');
  assert.equal(clef.lifetimeLine({ platform: 'linux' }), 'setpriv');
});

const KEEPER = { line: 'keeper' };

test('serve on the keeper line: the server answers, its pid is the keeper\'s child, and a stop ends it', async t => {
  const f = fixture(t);
  const h = await startServe(t, f, KEEPER);
  const live = await ready(f);
  const r = await call({ port: live.run.port, body: { state: { s: 1 }, questions: QUESTIONS } });
  assert.equal(r.status, 200);
  const sp = live.run.serverPid;
  assert.equal((await f.recorded()).pid, sp, 'serverPid is the server, not the keeper');
  assert.ok(h.keeperPid !== sp && h.keeperPid !== process.pid);
  await h.stop('test');
  assert.ok(await gone(sp, 9000), 'the server is ended');
});

// Spec 0003 C-M4: the keeper itself runs in the named environment, not the supervisor's.
test('serve on the keeper line: the keeper is forked in serveEnv\'s environment and with no node flags', async t => {
  const f = fixture(t);
  const env = { ...process.env, ...POISON, CLAUDE_CONFIG_DIR: f.cfgHome };
  let seen;
  await startServe(t, f, { ...KEEPER, env, onKeeperOptions: o => (seen = o) });
  await ready(f);
  assert.deepEqual(Object.keys(seen.env).sort(), Object.keys(clef.serveEnv(env, process.platform, f.p.runtime)).sort());
  for (const k of Object.keys(POISON)) assert.ok(!(k in seen.env) || seen.env[k] !== POISON[k], `the keeper got ${k}`);
  assert.equal('CLAUDE_CONFIG_DIR' in seen.env, false);
  assert.deepEqual(seen.execArgv, []);
});

// Spec 0003 C-M5: the darwin rows of setup.json reach the server's arguments through serve.
for (const [row, backend, flags] of [['darwin-arm64-cpu', 'cpu', ['--device', 'none']], ['darwin-arm64-metal', 'metal', ['-ngl', '99']]]) {
  test(`serve: a ${row} setup gives the server ${flags.join(' ')}`, async t => {
    const f = fixture(t);
    const a = clef.SERVER.archives[row];
    writeFileSync(join(f.p.runtime, clef.destName(a.exe, a.exe)), 'x');
    writeFileSync(f.p.setup, JSON.stringify({ ...JSON.parse(readFileSync(f.p.setup, 'utf8')), platform: row, backend }));
    await startServe(t, f, { platform: 'darwin', line: 'job-object', env: { ...process.env } });
    const rec = await f.recorded();
    const at = rec.args.indexOf(flags[0]);
    assert.ok(at >= 0, `${flags[0]} is among the arguments`);
    assert.deepEqual(rec.args.slice(at, at + 2), flags);
    assert.equal(rec.args.includes('--device') || rec.args.includes('-ngl'), true);
    assert.equal(rec.args.includes(flags[0] === '-ngl' ? '--device' : '-ngl'), false, 'only the one that row names');
  });
}

test('serve on the keeper line: with the keeper sent SIGKILL, the supervisor ends the server, records run.fail and stops', async t => {
  const f = fixture(t);
  const h = await startServe(t, f, KEEPER);
  const live = await ready(f);
  process.kill(h.keeperPid, 'SIGKILL');
  assert.equal(await h.done, 'exit');
  assert.ok(await gone(live.run.serverPid, 3000), 'the server went with its keeper');
  assert.equal(JSON.parse(readFileSync(f.run.fail, 'utf8')).reason, 'exit');
});

test('serve on the keeper line: a supervisor killed outright leaves no server behind within 2 seconds', async t => {
  // The server is busy writing to the keeper's pipes, which break when the supervisor dies (spec 0003 C-M6).
  const f = fixture(t, { writeLoop: true });
  f.stoppers.push(() => stopFixture(f));
  assert.equal((await ensure(f, { wait: 20, supervisorCommand: wrapperFor(f, ", line: 'keeper'") })).out.state, 'ready');
  const run = JSON.parse(readFileSync(f.run.run, 'utf8'));
  assert.ok(alive(run.serverPid));
  process.kill(run.pid, 'SIGKILL');
  assert.ok(await gone(run.serverPid, 2000), 'the keeper ended the server when its channel closed');
});

test('serve on the keeper line: a server that exits on its own gets no signal from the supervisor', async t => {
  const runs = process.platform === 'darwin' ? 50 : 3;
  for (let i = 0; i < runs; i++) {
    const f = fixture(t, { exitAfterMs: 300 });
    const sent = [];
    const h = await startServe(t, f, { ...KEEPER, kill: (pid, sig) => sent.push([pid, sig]) });
    assert.equal(await h.done, 'exit');
    assert.deepEqual(sent, [], `run ${i + 1}: no signal after {gone}`);
  }
});

test('serve on the keeper line: a stop sends the server no signal from the supervisor, and a server that ignores SIGTERM is still ended', { skip: WIN && 'Windows has no SIGTERM to catch; its line is the job object (not run)' }, async t => {
  const f = fixture(t, { ignoreTerm: true });
  const sent = [];
  const h = await startServe(t, f, { ...KEEPER, kill: (pid, sig) => sent.push([pid, sig]) });
  const live = await ready(f);
  await h.stop('test');
  assert.deepEqual(sent, [], 'the keeper reaped it and said {gone}');
  assert.ok(await gone(live.run.serverPid, 1000), 'SIGKILL after the keeper\'s wait');
});

test('serve on the keeper line: the idle time ends the server, counted from ready, not from start', async t => {
  const f = fixture(t);
  // PACT-82: a slow start (the keeper hop on macOS) must not use up the idle time. After its first read the clock
  // stands 1 s ahead, a start slower than the idle time and far inside the start timeout. The stub is not ready for
  // its first 300 ms, so idle checks run before ready.
  f.setCfg({ readyAfterMs: 300 });
  let reads = 0;
  const now = () => Date.now() + (reads++ > 0 ? 1000 : 0);
  const h = await clef.serve({ dir: f.dir, ...f.exe, idleMs: 400, checkMs: 50, pollMs: 50, now, ...KEEPER });
  f.stoppers.push(() => h.stop('test'));
  const live = await ready(f);
  assert.equal(await h.done, 'idle');
  assert.ok(await gone(live.run.serverPid, 9000));
});

test('serve on the keeper line: a missing server executable leaves run.fail (exit) and no keeper', async t => {
  const f = fixture(t);
  await assert.rejects(clef.serve({ dir: f.dir, exe: join(f.root, 'no-such-server'), pdeathsig: false, idleMs: 60_000, checkMs: 60_000, pollMs: 50, ...KEEPER, keeperPidMs: 5000 }), e => e.code === 'clef-setup');
  assert.ok(existsSync(f.run.fail));
  assert.equal(existsSync(f.run.key), false);
});

// ------------------------------------------------------------ the server record and keyed probe (spec 0003 M6)

/** A stub server left running as an orphan, with run.server and run.key written as its supervisor would have. */
async function orphan(t, f, cfgExtra = {}, { started = new Date().toISOString(), pid } = {}) {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const key = randomHex();
  writeFileSync(f.run.key, `${key}\n`);
  f.setCfg({ propsLog: join(f.root, 'props.txt'), ...cfgExtra });
  const child = spawn(process.execPath, [f.stub, f.cfg, '--port', String(port), '--api-key-file', f.run.key], { stdio: 'ignore' });
  t.after(() => child.kill('SIGKILL'));
  for (let i = 0; i < 100 && (await clef.probeProps({ port, timeoutMs: 200 })) === 'refused'; i++) await sleep(50);
  clefRm(join(f.root, 'props.txt'), { force: true });
  writeFileSync(f.run.server, JSON.stringify({ run: 'old', pid: pid ?? child.pid, port, started }));
  return { child, port, key, props: () => (existsSync(join(f.root, 'props.txt')) ? readFileSync(join(f.root, 'props.txt'), 'utf8').split('\n').filter(Boolean) : []) };
}
const randomHex = () => Array.from({ length: 64 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
const noSpawn = () => assert.fail('nothing is spawned beside a loading orphan');

test('serve on the keeper line: run.server names the server, is mode 0600, and goes with run.key on a stop', async t => {
  const f = fixture(t);
  const h = await startServe(t, f, { line: 'keeper' });
  const live = await ready(f);
  const rec = JSON.parse(readFileSync(f.run.server, 'utf8'));
  assert.deepEqual(Object.keys(rec).sort(), ['pid', 'port', 'run', 'started']);
  assert.equal(rec.pid, live.run.serverPid);
  assert.equal(rec.run, live.run.run);
  await h.stop('test');
  assert.equal(existsSync(f.run.server), false);
  assert.equal(existsSync(f.run.key), false);
});

test('sweep: an orphan is ended only after it refuses no key and a wrong key and takes the run\'s key', async t => {
  const f = fixture(t);
  const o = await orphan(t, f);
  const r = await clef.sweepServer({ dir: f.dir, boundMs: 5000 });
  assert.equal(r.result, 'ended');
  assert.deepEqual(o.props(), ['none', 'wrong', 'right']);
  assert.ok(await gone(o.child.pid, 3000));
  assert.equal(existsSync(f.run.server), false);
  assert.equal(existsSync(f.run.key), false);
});

for (const [label, cfgExtra, rec, why] of [
  ['answers 200 to any bearer', { anyBearer: true }, {}, 'never sent the key'],
  ['is a record dated before boot', {}, { started: new Date(0).toISOString() }, 'step 1'],
]) {
  test(`sweep: a record whose listener ${label} ends nothing and is removed`, async t => {
    const f = fixture(t);
    const o = await orphan(t, f, cfgExtra, rec);
    const killed = [];
    const r = await clef.sweepServer({ dir: f.dir, boundMs: 5000, kill: p => killed.push(p) });
    assert.equal(r.result, 'dropped', why);
    assert.deepEqual(killed, []);
    assert.ok(!o.props().includes('right'), 'the run\'s key never went out');
    assert.equal(existsSync(f.run.server), false);
  });
}

test('sweep: a live pid whose port stays closed for 2 s ends nothing and is removed', async t => {
  const f = fixture(t);
  const other = sleeperProcess(f);
  writeFileSync(f.run.key, `${randomHex()}\n`);
  writeFileSync(f.run.server, JSON.stringify({ run: 'old', pid: other.pid, port: 1, started: new Date().toISOString() }));
  const killed = [];
  const t1 = Date.now();
  assert.equal((await clef.sweepServer({ dir: f.dir, boundMs: 5000, kill: p => killed.push(p) })).result, 'dropped');
  assert.ok(Date.now() - t1 >= 1900, 'it waited the 2 s');
  assert.deepEqual(killed, []);
  assert.ok(alive(other.pid));
});

test('sweep: an orphan still loading keeps its record: ensure starts nothing, stop and remove exit 1, status names it', async t => {
  const f = fixture(t);
  const o = await orphan(t, f, { propsNotReady: true });
  const t1 = Date.now();
  const e = await clef.ensure({ dir: f.dir, wait: 0, line: 'keeper', supervisorCommand: noSpawn });
  assert.deepEqual(e.out, { state: 'starting' });
  assert.ok(Date.now() - t1 < 1000, 'within 1 s');
  const st = await clef.stopRun({ dir: f.dir, line: 'keeper', orphanWaitMs: 300 });
  assert.equal(st.code, 1);
  assert.deepEqual(st.lines, [`orphan still loading (pid ${o.child.pid}); run stop again`]);
  assert.ok(existsSync(f.run.server) && existsSync(f.run.key), 'removing nothing');
  const rm = await clef.removeRun({ dir: f.dir, yes: true, line: 'keeper', orphanWaitMs: 300 });
  assert.equal(rm.code, 1);
  assert.ok(existsSync(f.dir), 'remove deletes nothing');
  const status = await clef.statusRun({ dir: f.dir });
  assert.ok(status.lines.includes(`orphan: pid ${o.child.pid}`));
  assert.ok(alive(o.child.pid));
  // Spec 0003 C-M8: the run's key is in none of what the commands print.
  const shown = [JSON.stringify(e.out), ...st.lines, ...rm.lines, ...status.lines].join('\n');
  assert.ok(!shown.includes(o.key), 'no output holds the run key');
  assert.ok(!(await clef.statusRun({ dir: f.dir })).lines.join('\n').includes(o.key));
});

test('sweep: an orphan that finishes loading during the sweep is ended', async t => {
  const f = fixture(t);
  const o = await orphan(t, f, { readyAfterMs: 1500 });
  const r = await clef.sweepServer({ dir: f.dir, boundMs: 10_000 });
  assert.equal(r.result, 'ended', `probes: ${o.props().join(',')}`);
  assert.ok(await gone(o.child.pid, 3000));
});

test('stop on the keeper line: a stop under another holder\'s lock leaves run.key', async t => {
  const f = fixture(t);
  writeFileSync(f.run.key, `${randomHex()}\n`);
  writeFileSync(f.run.lock, `${process.pid}\n`);
  await clef.stopRun({ dir: f.dir, line: 'keeper', orphanWaitMs: 300 });
  assert.ok(existsSync(f.run.key));
});

test('main: setup on macOS refuses clef-orphan while a recorded server is still loading, before any fetch', async t => {
  const f = fixture(t);
  const o = await orphan(t, f, { propsNotReady: true });
  const base = { env: { CLAUDE_CONFIG_DIR: f.cfgHome }, cwd: tempDir(t, 'clef-start-'), chdir: () => {}, transport: { request: () => { throw new Error('a request was made'); } }, account: f.cfgHome, platform: 'darwin', arch: 'arm64', exists: () => true, orphanWaitMs: 300 };
  for (const argv of [['setup', '--yes'], ['setup']]) {
    const out = [];
    assert.equal(await clef.main(argv, { ...base, out: l => out.push(l) }), 2, argv.join(' '));
    assert.equal(out.at(-1), 'RESULT: refused clef-orphan');
    assert.ok(!out.join('\n').includes(o.key), `${argv.join(' ')}: no output holds the run key`);
  }
  assert.ok(existsSync(f.run.server) && alive(o.child.pid), 'the record and the server are left');
});

// Spec 0003 M6 step 4: `setup --yes` sweeps with the 60-second bound, as stop does, and the tests that need less inject it.
test('main: setup --yes on macOS sweeps an old server with a 60 second bound', async t => {
  const f = fixture(t);
  const seen = [];
  const base = { env: { CLAUDE_CONFIG_DIR: f.cfgHome }, cwd: tempDir(t, 'clef-start-'), chdir: () => {}, transport: { request: () => { throw new Error('a request was made'); } }, account: f.cfgHome, platform: 'darwin', arch: 'arm64', exists: () => true, out: () => {} };
  assert.equal(await clef.main(['setup', '--yes'], { ...base, sweep: async o => (seen.push(o.boundMs), { result: 'kept', pid: 1 }) }), 2);
  assert.deepEqual(seen, [60_000]);
  assert.equal(await clef.main(['setup', '--yes'], { ...base, orphanWaitMs: 300, sweep: async o => (seen.push(o.boundMs), { result: 'kept', pid: 1 }) }), 2);
  assert.deepEqual(seen, [60_000, 300], 'a test can inject a shorter bound');
});

// Spec 0003 C-M7, C-M10: a stop under another holder's lock with a loading record leaves both files; remove --yes sweeps an orphan, then deletes the folder.
test('stop on the keeper line: under another holder\'s lock, a loading record and its key are left and nothing is ended', async t => {
  const f = fixture(t);
  const o = await orphan(t, f, { propsNotReady: true });
  writeFileSync(f.run.lock, `${process.pid}\n`);
  const st = await clef.stopRun({ dir: f.dir, line: 'keeper', orphanWaitMs: 300 });
  assert.equal(st.code, 0);
  assert.ok(existsSync(f.run.server) && existsSync(f.run.key));
  assert.ok(alive(o.child.pid));
  assert.deepEqual(o.props(), [], 'a sweep it does not hold the lock for sends nothing');
});

test('remove --yes on the keeper line: an orphan is swept (keyed) and ended, then the folder is deleted', async t => {
  const f = fixture(t);
  const o = await orphan(t, f);
  const r = await clef.removeRun({ dir: f.dir, yes: true, line: 'keeper', orphanWaitMs: 5000 });
  assert.equal(r.code, 0);
  assert.deepEqual(o.props(), ['none', 'wrong', 'right']);
  assert.ok(await gone(o.child.pid, 3000));
  assert.equal(existsSync(f.dir), false);
});

test('stop on the keeper line: a clean stop of an orphan leaves neither run.server nor run.key, and no output holds the key', async t => {
  const f = fixture(t);
  const o = await orphan(t, f);
  const key = readFileSync(f.run.key, 'utf8').trim();
  const st = await clef.stopRun({ dir: f.dir, line: 'keeper', orphanWaitMs: 5000 });
  assert.equal(st.code, 0);
  assert.equal(existsSync(f.run.server) || existsSync(f.run.key), false);
  assert.ok(await gone(o.child.pid, 3000));
  assert.ok(!st.lines.join('\n').includes(key));
});

// Spec 0003 C-M11: macOS folds case, so the runtime folder named in another case is the same folder and serve starts from it.
test('main: on macOS, serve from the runtime folder named in another case is accepted', { skip: process.platform !== 'darwin' && 'needs the case-folding macOS file system (runs on gate-macos)' }, async t => {
  const f = fixture(t);
  const env = { ...process.env, CLAUDE_CONFIG_DIR: f.cfgHome };
  const cased = f.p.runtime.replace(/runtime(?=\/[^/]*$)/, 'RunTime');
  assert.notEqual(cased, f.p.runtime);
  const out = [];
  const code = await clef.main(['serve'], { env, cwd: cased, account: f.cfgHome, out: l => out.push(l), chdir: () => {}, serveOptions: { ...f.exe, idleMs: 500, checkMs: 100, pollMs: 50 } });
  assert.equal(code, 0, out.join('\n'));
  assert.match(readFileSync(f.run.log, 'utf8'), /stopped idle/);
});

// The same check on every job: `real` stands for a file system that keeps case, so only the fold in `norm` can make the two spellings equal.
test('main: on macOS, serve from the runtime folder named in another case is accepted, on any file system', async t => {
  const f = fixture(t);
  const env = { ...process.env, CLAUDE_CONFIG_DIR: f.cfgHome };
  const cased = f.p.runtime.replace(/runtime(?=[\\/][^\\/]*$)/, 'RunTime');
  assert.notEqual(cased, f.p.runtime);
  const out = [];
  const code = await clef.main(['serve'], { env, platform: 'darwin', cwd: cased, account: f.cfgHome, real: p => p, out: l => out.push(l), chdir: () => {}, serveOptions: { ...f.exe, idleMs: 500, checkMs: 100, pollMs: 50 } });
  assert.equal(code, 0, out.join('\n'));
  assert.match(readFileSync(f.run.log, 'utf8'), /stopped idle/);
});

// gate-macos on 020f852 (run 45221886335): every test here passed, then the file never exited, and the job ran to its
// 45-minute cap. Something a test started outlived it. This names whatever child process or pipe is still open once
// every test has ended, ends it, and fails the file, so a leak fails fast with its name instead of holding the job.
after(async () => {
  const own = new Set([process.stdin, process.stdout, process.stderr]);
  const open = () => process._getActiveHandles().filter(h => !own.has(h) && (h.constructor?.name === 'ChildProcess' || (h.constructor?.name === 'Socket' && !h.destroyed)));
  // A process a test has just ended can take a moment to be reaped.
  for (let i = 0; i < 30 && open().length; i++) await sleep(100);
  const left = open();
  const names = left.map(h => (h.constructor.name === 'ChildProcess' ? `child ${h.pid} ${(h.spawnargs ?? []).slice(-2).join(' ')}` : `pipe ${h._handle?.fd ?? '?'}`));
  for (const h of left) {
    try {
      if (h.constructor.name === 'ChildProcess') {
        h.disconnect?.();
        h.kill('SIGKILL');
      } else h.destroy();
    } catch {
      // gone already
    }
  }
  assert.deepEqual(names, [], 'nothing a test started is left open');
});
