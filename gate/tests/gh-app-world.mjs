// A fake GitHub, Credential Manager, gh and git for the GitHub App helper's
// tests (#599, T1). Nothing here touches the network, the real Credential
// Manager or the real gh and git: the helper's `io` is injected whole. Every
// key and token is built at run time, so this source holds no credential.
// Importing this file touches nothing; `world()` makes a temp home.
import { createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, verify } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLAIM_PERMISSIONS, realIo } from '../../claude/tools/gh-app.mjs';
import { tempDir } from './tree.mjs';

export const IDS = Object.freeze({ owner: 1000001, app: 2000001, bot: 3000001, inst: 4000001 });
export const OWNER = 'example-owner';
export const SLUG = 'example-owner-claude';
export const BOT = `${SLUG}[bot]`;
export const NODE = 'C:\\Program Files\\nodejs\\node.exe';

let keyCache;
/** One RSA key pair for the file, as a PKCS#1 PEM, a PKCS#8 PEM and the public key. Built once; no key is committed. */
export function keys() {
  if (!keyCache) {
    const a = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs1', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
    const b = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
    keyCache = { a, b };
  }
  return keyCache;
}

const text = v => JSON.stringify(v);
const res = (status, body) => ({ status, text: async () => (body === undefined ? '' : typeof body === 'string' ? body : text(body)) });

/** A new token string the helper's shape check accepts: built from random pieces at run time. */
const newToken = stateless => (stateless
  // GitHub's stateless format: ghs_APPID_JWT, about 520 characters, two dots.
  ? `ghs_${IDS.app}_${randomBytes(30).toString('base64url')}.${randomBytes(300).toString('base64url')}.${randomBytes(60).toString('base64url')}`
  : `ghs_${randomBytes(24).toString('hex')}`);

/**
 * One fake world: a home folder, a fake GitHub, an in-memory credential store
 * and a spy over every process, file write, output line and request.
 * `state` is the fake's knobs; a test changes it before it runs the helper.
 */
export function world(t, { platform = 'win32', env = {}, pin = true, key = true, keyPair = 'a' } = {}) {
  const home = tempDir(t, 'pact-ghapp-home-');
  const tmp = tempDir(t, 'pact-ghapp-tmp-');
  // The pact folder holds the pin file and the gitconfig; Claude Code's folder holds the settings file the helper reads.
  mkdirSync(join(home, '.pact'), { recursive: true });
  mkdirSync(join(home, '.claude'), { recursive: true });
  const pair = keys()[keyPair];
  const publicKey = createPublicKey(pair.publicKey);
  const store = new Map();
  const spy = { out: [], err: [], fetches: [], spawns: [], writes: [], cwdChecks: [] };
  const state = {
    now: Date.UTC(2026, 10, 21, 12, 0, 0),
    owner: { login: OWNER, id: IDS.owner },
    me: { login: OWNER, id: IDS.owner },
    app: { id: IDS.app, slug: SLUG, owner: { id: IDS.owner }, permissions: { ...CLAIM_PERMISSIONS }, events: [] },
    bot: { id: IDS.bot, login: BOT, type: 'Bot' },
    installation: { id: IDS.inst, app_id: IDS.app, account: { id: IDS.owner } },
    // "<owner>/<name>" in lower case: repos no installation of the app covers, which GitHub answers with a 404.
    notInstalled: new Set(),
    tokens: new Map(),
    revoked: [],
    revokeStatus: null,
    mintStatus: 201,
    stateless: false,
    mintOverride: null,
    ghReadFails: new Set(),
    gh: () => ({ status: 0, stdout: '', stderr: '' }),
    git: () => ({ status: 1, stdout: '', stderr: '' }),
    helperReadBack: null,
  };
  const knownTokens = new Set();
  const fsSpy = {
    readFileSync,
    writeFileSync: (p, d, o) => {
      spy.writes.push({ path: String(p), data: String(d) });
      return writeFileSync(p, d, o);
    },
    renameSync,
    unlinkSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    rmSync,
  };
  const fetch = async (url, init = {}) => {
    const u = new URL(url);
    const rec = { url: String(url), method: init.method ?? 'GET', headers: init.headers ?? {}, body: init.body ? JSON.parse(init.body) : null, host: u.host };
    spy.fetches.push(rec);
    if (u.host !== 'api.github.com' || u.protocol !== 'https:') return res(500, {});
    const auth = (init.headers?.Authorization ?? '').replace(/^Bearer /, '');
    const path = decodeURIComponent(u.pathname);
    // An issued installation token in the stateless format has two dots too, so it is told from an App JWT by being known.
    const isJwt = auth.split('.').length === 3 && !knownTokens.has(auth);
    let jwt = null;
    if (isJwt) {
      const [h, c, s] = auth.split('.');
      const ok = verify('RSA-SHA256', Buffer.from(`${h}.${c}`), publicKey, Buffer.from(s, 'base64url'));
      if (!ok) return res(401, { message: 'Bad credentials' });
      jwt = JSON.parse(Buffer.from(c, 'base64url').toString('utf8'));
      rec.jwt = jwt;
    } else if (path !== '/installation/token' && !(auth && knownTokens.has(auth) && !state.revoked.includes(auth))) return res(401, { message: 'Bad credentials' });
    if (rec.method === 'DELETE' && path === '/installation/token') {
      if (state.revokeStatus) return res(state.revokeStatus, {});
      if (!knownTokens.has(auth) || state.revoked.includes(auth)) return res(401, {});
      state.revoked.push(auth);
      return res(204);
    }
    if (rec.method === 'GET' && path === '/app') return res(200, state.app);
    if (rec.method === 'GET' && path === `/users/${state.owner.login}/installation`) return res(200, state.installation);
    const repoInst = /^\/repos\/([^/]+\/[^/]+)\/installation$/.exec(path);
    if (rec.method === 'GET' && repoInst) return state.notInstalled.has(repoInst[1].toLowerCase()) ? res(404, { message: 'Not Found' }) : res(200, state.installation);
    if (rec.method === 'POST' && path === `/app/installations/${state.installation.id}/access_tokens`) {
      if (state.mintStatus !== 201) return res(state.mintStatus, {});
      if (state.mintOverride !== null) return res(201, state.mintOverride);
      const token = newToken(state.stateless);
      knownTokens.add(token);
      const expires = new Date(state.now + 3600 * 1000).toISOString();
      const names = rec.body?.repositories;
      return res(201, { token, expires_at: expires, permissions: rec.body?.permissions ?? {}, ...(names ? { repositories: names.map(name => ({ name })) } : {}) });
    }
    if (rec.method === 'GET' && path === `/users/${state.bot.login}`) return res(200, state.bot);
    return res(404, {});
  };
  const cwdOk = opts => {
    const entries = existsSync(opts.cwd) ? readdirSync(opts.cwd) : ['?'];
    spy.cwdChecks.push({ cwd: opts.cwd, entries, underTmp: String(opts.cwd).startsWith(tmp) });
  };
  const spawn = (file, args, opts = {}) => {
    cwdOk(opts);
    spy.spawns.push({ file, args: [...args], env: opts.env, input: opts.input, cwd: opts.cwd });
    if (file === 'gh' && args[0] === 'api' && args.includes('--method') && args[args.indexOf('--method') + 1] === 'GET') {
      const path = args[args.length - 1];
      if (state.ghReadFails.has(path)) return { status: 1, stdout: '', stderr: 'boom' };
      const body = path === `apps/${state.app.slug}` ? state.app : path === `users/${state.bot.login}` ? state.bot : path === 'user' ? state.me : null;
      return body ? { status: 0, stdout: text(body), stderr: '' } : { status: 1, stdout: '', stderr: '' };
    }
    if (file === 'gh') return state.gh(args, opts);
    if (file === 'git') return state.git(args, opts);
    return { status: 1, stdout: '', stderr: '' };
  };
  const credStore = {
    read: tgt => (store.has(tgt) ? Buffer.from(store.get(tgt)) : null),
    write: (tgt, b) => {
      store.set(tgt, Buffer.from(b));
    },
    delete: tgt => {
      store.delete(tgt);
    },
    list: prefix => [...store.keys()].filter(k => k.startsWith(prefix)),
  };
  const io = realIo({
    platform,
    env: { SystemRoot: 'C:\\Windows', ...env },
    home,
    tmp,
    execPath: NODE,
    now: () => state.now,
    fetch,
    spawn,
    fs: fsSpy,
    stdin: () => state.stdin ?? '',
    out: s => spy.out.push(s),
    err: s => spy.err.push(s),
    credStore,
  });
  const w = { io, state, spy, store, home, tmp, pair, publicKey, knownTokens, text };
  if (key) store.set('the-pact/gh-app/claude/key', Buffer.from(derOf(pair.privateKey)));
  if (pin) writePin(w);
  return w;
}

/** The PKCS#1 DER of a PEM private key, as the helper stores it. */
export function derOf(pem) {
  return createPrivateKey(pem).export({ type: 'pkcs1', format: 'der' });
}

/** The pin file for the fake's owner and claude app, written into the world's home. */
export function writePin(w, apps) {
  const entry = { app_id: IDS.app, slug: SLUG, bot_login: BOT, bot_id: IDS.bot };
  const body = { owner: { login: OWNER, id: IDS.owner }, apps: apps ?? { claude: entry } };
  writeFileSync(join(w.home, '.pact', 'github.json'), `${JSON.stringify(body, null, 2)}\n`);
}

/** Everything the run printed, split by stream, as one string each. */
export const printed = w => ({ out: w.spy.out.join(''), err: w.spy.err.join('') });

/** Every place a secret could land: output, argv, process input, file writes and request bodies. */
export function leakSurface(w) {
  const { out, err } = printed(w);
  return [
    out,
    err,
    ...w.spy.spawns.map(s => `${s.file} ${s.args.join(' ')}`),
    ...w.spy.spawns.map(s => String(s.input ?? '')),
    ...w.spy.writes.map(x => `${x.path}\n${x.data}`),
    ...w.spy.fetches.map(f => `${f.url} ${JSON.stringify(f.body)}`),
  ].join('\n');
}

/** A GitHub-issued PKCS#1 PEM for a key pair `a`, written to `path`. */
export function writePem(w, name = 'download.pem', pem = keys().a.privateKey) {
  const p = join(w.home, name);
  writeFileSync(p, pem);
  return p;
}
