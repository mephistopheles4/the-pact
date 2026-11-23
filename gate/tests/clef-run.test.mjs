// PACT-64, T2 of spec 0002: the supervisor, ensure, stop, status and remove.
// A stub stands in for llama-server: a node script that checks the key it is
// given, records its arguments and environment, and answers by a mode. Nothing
// here downloads or runs the real server.

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync as clefRm, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import * as clef from '../../claude/tools/clef.mjs';
import { REPO } from './text.mjs';
import { tempDir } from './tree.mjs';

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
createServer((req, res) => {
  if (req.headers.authorization !== 'Bearer ' + key) { res.writeHead(401); return res.end('no'); }
  if (req.url === '/health') {
    if (cfg.notReady || (cfg.readyAfterMs && Date.now() - t0 < cfg.readyAfterMs)) { res.writeHead(503); return res.end('{}'); }
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end('{"status":"ok"}');
  }
  let b = '';
  req.on('data', c => (b += c));
  req.on('end', () => {
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
  });
}).listen(Number(arg('--port')), '127.0.0.1');
`;

/** A set-up clef folder with placeholder files, the stub, and its config. */
function fixture(t, cfgExtra = {}) {
  // Registered before the folder's own clean-up, so the servers stop first: a running server holds its folder on Windows.
  const stoppers = [];
  t.after(async () => {
    for (const s of stoppers.reverse()) await Promise.resolve(s()).catch(() => {});
    await sleep(WIN ? 400 : 0);
  });
  const root = tempDir(t, 'clef-run-');
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

function call({ port, token, path = '/v1/systemone', method = 'POST', headers = {}, body, host = `127.0.0.1:${port}`, raw, chunked = false }) {
  return new Promise((resolveP, reject) => {
    const data = raw ?? (body === undefined ? null : Buffer.from(JSON.stringify(body)));
    const h = { host, ...headers };
    if (token) h.authorization = `Bearer ${token}`;
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

test('serverArgs: the list is fixed, the key is a file, and Vulkan adds -ngl 99', () => {
  const a = clef.serverArgs({ port: 4242, keyFile: '/k/run.key', modelPath: '/m/x.gguf', vulkan: false });
  assert.deepEqual(a, ['--host', '127.0.0.1', '--port', '4242', '--api-key-file', '/k/run.key', '--no-webui', '--no-slots', '--cors-origins', 'http://127.0.0.1.invalid', '-c', '16384', '-ub', '4096', '-b', '4096', '-m', '/m/x.gguf']);
  const v = clef.serverArgs({ port: 4242, keyFile: '/k/run.key', modelPath: '/m/x.gguf', vulkan: true });
  assert.deepEqual(v.slice(10, 12), ['-ngl', '99']);
  assert.ok(!a.includes('--api-key'), 'no key on the command line');
});

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
  const { port, token } = live.run;
  const r = await call({ port, token, body: { state: { s: 1 }, questions: QUESTIONS } });
  assert.equal(r.status, 200);
  assert.deepEqual(JSON.parse(r.text), { a: { noul: 0.5 }, b: { score: 0.25 }, c: { choice: 'yes', probabilities: { yes: 0.5, no: 0.5 } } });
  const rec = await f.recorded();
  const i = n => rec.args.indexOf(n);
  assert.equal(rec.args[i('--host') + 1], '127.0.0.1');
  assert.notEqual(Number(rec.args[i('--port') + 1]), port, 'the server has its own port');
  assert.equal(rec.args[i('--api-key-file') + 1], f.run.key);
  for (const flag of ['--no-webui', '--no-slots']) assert.ok(rec.args.includes(flag), flag);
  assert.ok(!rec.args.includes(token) && !rec.args.includes(rec.key), 'no key or token on the command line');
  assert.notEqual(rec.key, token, 'two different values');
  assert.equal(readFileSync(f.run.key, 'utf8').trim(), rec.key);
  assert.equal(statSync(f.p.runtime).isDirectory(), true);
  assert.equal(rec.cwd.toLowerCase(), f.p.runtime.toLowerCase(), 'the server runs from runtime/<tag>/');
  const allowed = new Set([...'SYSTEMROOT WINDIR TEMP TMP HOME USERPROFILE LOCALAPPDATA XDG_RUNTIME_DIR PATH LD_LIBRARY_PATH'.split(' ')]);
  // Windows itself fills in these when it starts a process for the user; none comes from the caller.
  if (WIN) for (const n of ['HOMEDRIVE', 'HOMEPATH', 'LOGONSERVER', 'SYSTEMDRIVE', 'USERDOMAIN', 'USERNAME']) allowed.add(n);
  for (const k of Object.keys(rec.env)) assert.ok(allowed.has(k.toUpperCase()), `${k} is not on the list`);
  const run = JSON.parse(readFileSync(f.run.run, 'utf8'));
  assert.deepEqual(Object.keys(run).sort(), ['pid', 'port', 'run', 'serverPid', 'started', 'token']);
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
  const { port, token } = (await ready(f)).run;
  const body = { state: {}, questions: QUESTIONS };
  const refused = async (word, status, o) => {
    const r = await call({ port, ...o });
    assert.equal(r.status, status, word);
    assert.deepEqual(JSON.parse(r.text), { error: word });
  };
  await refused('auth', 401, { body });
  await refused('auth', 401, { token: 'wrong', body });
  await refused('auth', 401, { body, headers: { authorization: 'Basic abc' } });
  await refused('host', 400, { token, body, host: 'localhost' });
  await refused('host', 400, { token, body, host: `127.0.0.1:${port + 1}` });
  await refused('origin', 403, { token, body, headers: { origin: 'http://evil.example' } });
  await refused('route', 404, { token, path: '/v1/other', body });
  await refused('route', 404, { token, path: '/props', method: 'GET' });
  await refused('method', 405, { token, method: 'GET', path: '/v1/systemone' });
  await refused('content-type', 415, { token, body, headers: { 'content-type': 'text/plain' } });
  await refused('too-large', 413, { token, raw: Buffer.alloc(300 * 1024, 0x20) });
  await refused('body', 400, { token, raw: Buffer.from('not json') });
  await refused('body', 400, { token, body: { state: {} } });
  await refused('body', 400, { token, body: { state: {}, questions: {} } });
  await refused('body', 400, { token, body: { state: {}, questions: { a: { type: 'other' } } } });
  await refused('body', 400, { token, body: { state: {}, questions: { a: { type: 'choice' } } } });
  await refused('too-large', 413, { token, raw: Buffer.alloc(300 * 1024, 0x20), chunked: true });
  assert.equal(f.forwarded(), 0, 'no refused request reached the server');
  const ok = await call({ port, token, path: '/health', method: 'GET' });
  assert.equal(ok.status, 200);
  assert.deepEqual(Object.keys(JSON.parse(ok.text)).sort(), ['pid', 'ready', 'run', 'serverPid']);
  assert.ok(!ok.text.includes(token), 'the health answer holds no token');
});

test('serve: a server body that is not an exact answer becomes 502 no-answer, and none of its text reaches the caller', async t => {
  for (const mode of ['range', 'badchoice', 'extra', 'extraid', 'bare', 'text', 'status500']) {
    const f = fixture(t, { mode });
    const h = await startServe(t, f);
    const { port, token } = (await ready(f)).run;
    const r = await call({ port, token, body: { state: {}, questions: QUESTIONS } });
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
  await call({ port: live.run.port, token: live.run.token, body: { state: { secret: 'BODY-TEXT' }, questions: QUESTIONS } });
  const log = readFileSync(f.run.log, 'utf8');
  assert.ok(log.length < 100_000, 'a log past 1 MB starts again');
  const rec = await f.recorded();
  for (const bad of [live.run.token, rec.key, 'BODY-TEXT', 'SECRET-SERVER-TEXT', f.p.model, 'api-key-file']) assert.ok(!log.includes(bad), bad);
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
  const { port, token } = (await ready(f)).run;
  for (let i = 0; i < 4; i++) {
    await sleep(300);
    const r = await call({ port, token, body: { state: {}, questions: QUESTIONS } });
    assert.equal(r.status, 200, `request ${i}`);
  }
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
  const newer = JSON.stringify({ port: 1, token: 'x', run: 'another-run', pid: 1, serverPid: 1, started: 'now' });
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
  const r = await call({ port: live.run.port, token: live.run.token, body: { state: {}, questions: QUESTIONS } });
  assert.equal(r.status, 503);
  assert.deepEqual(JSON.parse(r.text), { error: 'not-ready' });
  assert.equal(live.health.ready, false);
});

test('serve: when its own script changes it answers nothing more, ends the server and exits (off the list)', async t => {
  const f = fixture(t);
  const script = join(f.root, 'clef-copy.mjs');
  writeFileSync(script, '// a copy\n');
  const h = await clef.serve({ dir: f.dir, ...f.exe, idleMs: 60_000, checkMs: 60_000, pollMs: 50, scriptUrl: pathToFileURL(script).href });
  const { port, token } = (await ready(f)).run;
  const rec = await f.recorded();
  writeFileSync(script, '// a copy, changed\n');
  const r = await call({ port, token, body: { state: {}, questions: QUESTIONS } });
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
  assert.ok(!JSON.stringify(first).includes(run.token), 'ensure prints no token');
  const again = await ensure(f);
  assert.deepEqual(again.out, first.out);
  const rec = await f.recorded();
  assert.equal(rec.pid, run.serverPid);
  const status = await clef.statusRun({ dir: f.dir });
  assert.ok(status.lines.includes('run: ready'));
  assert.ok(!status.lines.join('\n').includes(run.token) && !status.lines.join('\n').includes(rec.key), 'status prints no token or key');
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
  writeFileSync(f.run.run, JSON.stringify({ port: 1, token: 'x', run: 'y', pid: 2_000_000_000, serverPid: 1, started: 'now' }));
  const r = await ensure(f, { wait: 20 });
  assert.equal(r.out.state, 'ready');
  const run = JSON.parse(readFileSync(f.run.run, 'utf8'));
  assert.notEqual(run.pid, 2_000_000_000);
  // a live pid that is not a supervisor (this test process) with a wrong health answer
  await clef.stopRun({ dir: f.dir });
  writeFileSync(f.run.run, JSON.stringify({ port: run.port, token: 'x', run: 'y', pid: process.pid, serverPid: 1, started: 'now' }));
  assert.equal(await clef.liveSupervisor(f.dir), null, 'a live pid alone is not a supervisor');
});

test('liveSupervisor: an answering /health that disagrees with run.json on run, pid or serverPid is not a live supervisor', async t => {
  const f = fixture(t);
  await startServe(t, f);
  const live = await ready(f);
  const good = JSON.parse(readFileSync(f.run.run, 'utf8'));
  assert.ok(await clef.liveSupervisor(f.dir));
  const sleeper = sleeperProcess(f);
  for (const change of [{ run: 'other' }, { serverPid: good.serverPid + 1 }, { pid: sleeper.pid }, { token: 'wrong' }, { port: live.run.port + 1 }]) {
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
// Windows itself fills in these when it starts a process for the user; Node copies them from the caller's own environment.
if (WIN) for (const n of ['HOMEDRIVE', 'HOMEPATH', 'LOGONSERVER', 'SYSTEMDRIVE', 'USERDOMAIN', 'USERNAME']) NAMED_ENV.add(n);
const sameFolder = (a, b) => realpathSync.native(a).toLowerCase() === realpathSync.native(b).toLowerCase();
const POISON = { NODE_OPTIONS: '--no-warnings', GGML_BACKEND_PATH: '/evil', LLAMA_ARG_HOST: '0.0.0.0', HF_TOKEN: 'secret', VK_ICD_FILENAMES: '/evil', SECRET_X: 's' };

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
  for (const k of Object.keys(seen.env)) assert.ok(named.has(k.toUpperCase()), `${k} is not on the list`);
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
  for (const k of Object.keys(sup.env)) assert.ok(NAMED_ENV.has(k.toUpperCase()) || k === 'CLAUDE_CONFIG_DIR', `the supervisor got ${k}`);
  assert.ok(sameFolder(sup.cwd, f.p.runtime));
  const rec = await f.recorded();
  const pathKey = Object.keys(rec.env).find(k => k.toUpperCase() === 'PATH');
  assert.equal(rec.env[pathKey].toLowerCase(), clef.serveEnv(env, process.platform, f.p.runtime).PATH.toLowerCase(), 'the server\'s PATH is the fixed one, not the caller\'s');
  for (const k of Object.keys(rec.env)) assert.ok(NAMED_ENV.has(k.toUpperCase()), `the server got ${k}`);
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
  const decoy = () => writeFileSync(f.run.run, JSON.stringify({ port: 1, token: 'x', run: 'y', pid: sleeper.pid, serverPid: 1, started: 'now' }));
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
