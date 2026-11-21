#!/usr/bin/env node
// The GitHub App helper (#599, T1). While an app is pinned, a session's
// writes to GitHub go out as the provider's own GitHub App, with tokens minted
// without a prompt from a key kept in Windows Credential Manager.
//
//   node gh-app.mjs setup --provider <p> --app-id <n> --key <downloaded .pem>
//   node gh-app.mjs git-credential --provider <p> get|store|erase
//   node gh-app.mjs gh --provider <p> -R <owner>/<name> -- <gh args>
//   node gh-app.mjs status --provider <p> [--repo <folder>]
//   node gh-app.mjs forget --provider <p>
//
// setup writes the absolute path of the Node it runs under into the gitconfig's
// helper line; after a Node upgrade or move, run setup again to refresh it. Setup
// deletes the downloaded key when it succeeds, so generate a new private key on the
// app's GitHub page and pass that file as --key.
//
// <p> is claude, codex or antigravity. No mode prints a token: mintToken is a
// module export only, and git-credential get answers git on git's own pipe.
// Every mode catches every error at its top level and prints one fixed
// reason line, never an error's message, a stack or JSON it failed to parse.
// Exit codes: 0 done (a refused git-credential call too), 1 refused or
// failed, 2 a usage fault.
//
// Node 24 or later, ESM, node: built-ins only. Every side effect goes through
// one `io` object (platform, fetch, credStore, spawn, now, fs, env, stdin,
// out, err), so a test injects fakes and the suite runs on every platform.
// Importing this file does nothing; main runs only when this file is the entry
// script. The only network host is https://api.github.com. Windows only.

import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROVIDERS = Object.freeze(['claude', 'codex', 'antigravity']);
const API = 'https://api.github.com';
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38})$/;
const LOGIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const NAME_RE = /^[A-Za-z0-9._-]{1,100}$/;
// An installation token is opaque: the stateless ghs_APPID_JWT format is about 520 characters with dots, the older one 40.
const TOKEN_RE = /^[A-Za-z0-9_.-]{20,2048}$/;
const SKEW_MS = 5 * 60 * 1000;
export const CLAIM_PERMISSIONS = Object.freeze({ contents: 'write', pull_requests: 'write', issues: 'write', workflows: 'write', actions: 'read', checks: 'read', statuses: 'read', metadata: 'read' });
export const SETS = Object.freeze({
  git: Object.freeze({ contents: 'write', workflows: 'write' }),
  post: Object.freeze({ issues: 'write', pull_requests: 'write' }),
  gh: CLAIM_PERMISSIONS,
});
const STRIPPED_ENV = new Set(['GH_TOKEN', 'GITHUB_TOKEN', 'GH_HOST', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN', 'GH_DEBUG', 'DEBUG']);
const GH_FORBIDDEN_FIRST = new Set(['auth', 'extension', 'extensions', 'ext', 'alias', 'config']);

// ---------------------------------------------------------------- reasons

/** The fixed words a refusal can print. A refusal carries an id from here, never a message. */
export const REASONS = Object.freeze({
  usage: 'usage: see the header of gh-app.mjs',
  platform: 'this helper runs on Windows only',
  provider: 'the provider is not claude, codex or antigravity',
  'pin/missing': 'there is no pin file, or it is not the pinned shape',
  'pin/unpinned': 'that provider is not pinned',
  'pin/check': "the pin does not match GitHub's records",
  'owner/unavailable': 'your gh login could not be read; run gh auth status',
  'pin/unavailable': "the pin check could not run; nothing was posted as the owner",
  'pin/owner': 'the pinned owner differs from the owner of this login',
  'repo/owner': "the repository is not the pinned owner's",
  'repo/shape': 'the repository is not <owner>/<name>',
  'install/owner': "the app's installation is not on the pinned owner's account",
  'key/missing': 'the provider has no key',
  'key/not-rsa': 'the key is not an RSA key of 2048 bits or more',
  'key/read': 'the key file could not be read',
  tls: 'certificate checks are switched off in the environment',
  net: 'GitHub could not be reached or refused the call (the app may not be installed on your account)',
  shape: 'GitHub answered with something that is not the expected shape',
  store: 'the credential store failed',
  app: 'the app does not match: id, owner, permissions or events differ from the pinned set',
  gitconfig: 'the gitconfig could not be written or did not read back as expected',
  git: 'git failed',
  left: 'the key and tokens are gone, but the pin entry in ~/.claude/pact/github.json or the file ~/.claude/pact/gh-app-<provider>.gitconfig could not be removed; remove it yourself, then run forget again',
  settings: "the settings env points at this provider's gitconfig, or the settings file cannot be read as settings; remove that setting or fix the file, and apply first",
  mode: 'unknown mode',
  gh: 'that gh command is not allowed here',
  refused: 'refused',
});

export class Refusal extends Error {
  constructor(id) {
    super(id);
    this.id = Object.hasOwn(REASONS, id) ? id : 'refused';
  }
}
const refuse = id => {
  throw new Refusal(id);
};

// ---------------------------------------------------------------- io

/** The real io. A test passes its own, with only what it fakes. */
export function realIo(overrides = {}) {
  const io = {
    platform: process.platform,
    env: { ...process.env },
    home: homedir(),
    tmp: tmpdir(),
    execPath: process.execPath,
    now: () => Date.now(),
    fetch: (...a) => fetch(...a),
    spawn: (file, args, opts) => spawnSync(file, args, opts),
    fs: { readFileSync, writeFileSync, renameSync, unlinkSync, existsSync, mkdirSync, mkdtempSync, rmSync },
    stdin: () => {
      try {
        return readFileSync(0, 'utf8');
      } catch {
        return '';
      }
    },
    out: s => process.stdout.write(s),
    err: s => process.stderr.write(s),
    ...overrides,
  };
  io.secrets ??= new Set();
  io.credStore ??= makeCredStore(io);
  return io;
}

/** Remember a value that must never be printed or written. */
function guard(io, ...values) {
  for (const v of values) if (typeof v === 'string' && v.length >= 8) io.secrets.add(v);
}
const holdsSecret = (io, text) => [...io.secrets].some(s => text.includes(s));

/** One line out, unless it holds a secret this run saw. */
function say(io, line, stream = 'out') {
  const text = String(line);
  io[stream](`${holdsSecret(io, text) ? '(withheld)' : text}\n`);
}

// ---------------------------------------------------------------- the runner

/** An environment value by name, any letter case (Windows names are case-insensitive). */
const envGet = (env, name) => Object.entries(env ?? {}).find(([k]) => k.toUpperCase() === name.toUpperCase())?.[1];

/** The caller's environment without the variables that carry or redirect a GitHub credential. */
export function cleanEnv(env, extra = {}) {
  const out = {};
  for (const [k, v] of Object.entries(env ?? {})) if (!STRIPPED_ENV.has(k.toUpperCase()) && typeof v === 'string') out[k] = v;
  return { ...out, ...extra };
}

/**
 * One process runner: each call runs `file` from a new, empty folder under the
 * temp folder, removed afterwards, with a cleaned environment and no shell, so
 * a file planted in the caller's folder never runs and no program is found by
 * bare name there. Returns { ok, status, stdout, stderr }.
 */
export function makeRun(io) {
  return (file, args, { input = '', env = null, keep = false } = {}) => {
    const cwd = io.fs.mkdtempSync(join(io.tmp, 'pact-gh-app-'));
    try {
      const r = io.spawn(file, args, { cwd, env: env ?? cleanEnv(io.env), input, encoding: 'utf8', shell: false, maxBuffer: 16 * 1024 * 1024, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      const stdout = typeof r?.stdout === 'string' ? r.stdout : '';
      const stderr = typeof r?.stderr === 'string' ? r.stderr : '';
      return { ok: !r?.error && r?.status === 0, status: r?.status ?? null, stdout, stderr: keep ? stderr : '' };
    } finally {
      try {
        io.fs.rmSync(cwd, { recursive: true, force: true });
      } catch {
        // an empty run folder left behind
      }
    }
  };
}

// ---------------------------------------------------------------- the credential store (Windows Credential Manager)

// One fixed script, passed with -EncodedCommand. Its text holds no secret.
// It reads three lines on standard input (the operation, the target and the
// data, each base64) and answers on standard output; it touches a secret only
// through .NET calls, never as a cmdlet parameter, a pipeline value or host
// output, so no script-block, module or transcript log records one.
const PS_SOURCE = String.raw`$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class PactCred {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct CREDENTIAL {
    public uint Flags; public uint Type; public string TargetName; public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public uint CredentialBlobSize; public IntPtr CredentialBlob; public uint Persist;
    public uint AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName;
  }
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CredReadW(string t, uint type, uint flags, out IntPtr p);
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CredWriteW(ref CREDENTIAL c, uint flags);
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CredDeleteW(string t, uint type, uint flags);
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CredEnumerateW(string f, uint flags, out uint count, out IntPtr p);
  [DllImport("advapi32.dll")] static extern void CredFree(IntPtr p);
  static string Text(string b64) { return Encoding.UTF8.GetString(Convert.FromBase64String(b64)); }
  public static void Run() {
    string op = Console.In.ReadLine(), target = Text(Console.In.ReadLine() ?? ""), data = Console.In.ReadLine() ?? "";
    int err;
    if (op == "read") {
      IntPtr p;
      if (!CredReadW(target, 1, 0, out p)) { err = Marshal.GetLastWin32Error(); Console.Out.Write(err == 1168 ? "NONE" : "ERR " + err); return; }
      CREDENTIAL c = (CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL));
      byte[] blob = new byte[c.CredentialBlobSize];
      if (c.CredentialBlobSize > 0) Marshal.Copy(c.CredentialBlob, blob, 0, blob.Length);
      CredFree(p);
      Console.Out.Write("OK " + Convert.ToBase64String(blob));
    } else if (op == "write") {
      byte[] blob = Convert.FromBase64String(data);
      IntPtr buf = Marshal.AllocHGlobal(blob.Length);
      try {
        Marshal.Copy(blob, 0, buf, blob.Length);
        CREDENTIAL c = new CREDENTIAL();
        c.Type = 1; c.TargetName = target; c.UserName = "the-pact"; c.CredentialBlobSize = (uint)blob.Length; c.CredentialBlob = buf; c.Persist = 2;
        if (!CredWriteW(ref c, 0)) { Console.Out.Write("ERR " + Marshal.GetLastWin32Error()); return; }
      } finally { Marshal.FreeHGlobal(buf); }
      Console.Out.Write("OK");
    } else if (op == "delete") {
      if (!CredDeleteW(target, 1, 0)) { err = Marshal.GetLastWin32Error(); Console.Out.Write(err == 1168 ? "OK" : "ERR " + err); return; }
      Console.Out.Write("OK");
    } else if (op == "list") {
      uint n; IntPtr arr;
      if (!CredEnumerateW(target + "*", 0, out n, out arr)) { err = Marshal.GetLastWin32Error(); Console.Out.Write(err == 1168 ? "OK" : "ERR " + err); return; }
      StringBuilder sb = new StringBuilder("OK");
      for (int i = 0; i < n; i++) {
        IntPtr q = Marshal.ReadIntPtr(arr, i * IntPtr.Size);
        CREDENTIAL c = (CREDENTIAL)Marshal.PtrToStructure(q, typeof(CREDENTIAL));
        sb.Append("\n").Append(Convert.ToBase64String(Encoding.UTF8.GetBytes(c.TargetName)));
      }
      CredFree(arr);
      Console.Out.Write(sb.ToString());
    } else { Console.Out.Write("ERR usage"); }
  }
}
'@
[PactCred]::Run()`;

/** The encoded form of the script, as -EncodedCommand wants it: base64 of UTF-16LE. */
export const PS_ENCODED = Buffer.from(PS_SOURCE, 'utf16le').toString('base64');
export const PS_SCRIPT = PS_SOURCE;

/** The credential store: read, write, delete and list generic credentials, each one PowerShell call. */
export function makeCredStore(io) {
  const run = makeRun(io);
  const root = envGet(io.env, 'SYSTEMROOT');
  const ps = `${/^[A-Za-z]:\\[A-Za-z0-9 _.\\-]{1,120}$/.test(root ?? '') ? root : 'C:\\Windows'}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
  const call = (op, target, data) => {
    const input = `${op}\n${Buffer.from(target, 'utf8').toString('base64')}\n${data ? data.toString('base64') : ''}\n`;
    const r = run(ps, ['-NoProfile', '-NonInteractive', '-NoLogo', '-EncodedCommand', PS_ENCODED], { input });
    const lines = r.stdout.trim().split(/\r?\n/);
    if (!r.ok || !lines.length) refuse('store');
    return lines;
  };
  return {
    read(target) {
      const [first] = call('read', target);
      if (first === 'NONE') return null;
      const m = /^OK ([A-Za-z0-9+/]*={0,2})$/.exec(first);
      if (!m) refuse('store');
      return Buffer.from(m[1], 'base64');
    },
    write(target, bytes) {
      if (call('write', target, bytes)[0] !== 'OK') refuse('store');
    },
    delete(target) {
      if (call('delete', target)[0] !== 'OK') refuse('store');
    },
    list(prefix) {
      const [first, ...rest] = call('list', prefix);
      if (first !== 'OK') refuse('store');
      return rest.filter(l => l).map(l => Buffer.from(l, 'base64').toString('utf8'));
    },
  };
}

const keyTarget = p => `the-pact/gh-app/${p}/key`;
const tokenPrefix = p => `the-pact/gh-app/${p}/token/`;
const tokenTarget = (p, owner, name, set) => `${tokenPrefix(p)}${owner.toLowerCase()}/${name.toLowerCase()}/${set}`;

// ---------------------------------------------------------------- shapes

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isId = v => Number.isSafeInteger(v) && v > 0;
const sameLogin = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
const sameKeys = (o, keys) => isObject(o) && Object.keys(o).length === keys.length && keys.every(k => Object.hasOwn(o, k));

/** A JSON answer, or a refusal; never the parse error, which would quote the answer. */
function parseJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return refuse('shape');
  }
}

/** { owner, name } for "<owner>/<name>", or a refusal. A trailing .git is dropped when `git` is set. */
export function parseRepo(s, git = false) {
  const m = typeof s === 'string' ? /^([^/]+)\/([^/]+)$/.exec(s) : null;
  if (!m) return refuse('repo/shape');
  let name = m[2];
  if (git && name.endsWith('.git')) name = name.slice(0, -4);
  if (!LOGIN_RE.test(m[1]) || !NAME_RE.test(name) || name === '.' || name === '..') return refuse('repo/shape');
  return { owner: m[1], name };
}

const samePermissions = (got, want) => isObject(got) && Object.keys(got).length === Object.keys(want).length && Object.entries(want).every(([k, v]) => got[k] === v);

// ---------------------------------------------------------------- the pin file

/** Where the pin file and a provider's gitconfig live under `home`. */
export const pinPath = home => join(home, '.claude', 'pact', 'github.json');
export const gitconfigPath = (home, p) => join(home, '.claude', 'pact', `gh-app-${p}.gitconfig`);
export const settingsPath = home => join(home, '.claude', 'settings.json');
export const helperPath = home => `${home.replaceAll('\\', '/')}/.claude/pact/tools/gh-app.mjs`;

/** The pin file's parsed, checked shape, or a refusal. Exactly these fields; nothing is looked up. */
export function readPin(io) {
  let text;
  try {
    text = io.fs.readFileSync(pinPath(io.home), 'utf8');
  } catch {
    return refuse('pin/missing');
  }
  let pin;
  try {
    pin = JSON.parse(text);
  } catch {
    return refuse('pin/missing');
  }
  if (!sameKeys(pin, ['owner', 'apps']) || !sameKeys(pin.owner, ['login', 'id']) || !LOGIN_RE.test(pin.owner.login ?? '') || !isId(pin.owner.id) || !isObject(pin.apps)) return refuse('pin/missing');
  for (const [p, a] of Object.entries(pin.apps)) {
    if (!PROVIDERS.includes(p) || !sameKeys(a, ['app_id', 'slug', 'bot_login', 'bot_id'])) return refuse('pin/missing');
    if (!isId(a.app_id) || !isId(a.bot_id) || typeof a.slug !== 'string' || !SLUG_RE.test(a.slug) || a.bot_login !== `${a.slug}[bot]`) return refuse('pin/missing');
  }
  return pin;
}

/** One read as the owner's own gh login, by `gh api <path>`: no token in this process, and the keys it compares only. */
function ownerRead(io, path) {
  const r = makeRun(io)('gh', ['api', '--hostname', 'github.com', '--method', 'GET', path]);
  if (!r.ok) return refuse('pin/unavailable');
  const v = parseJson(r.stdout);
  return isObject(v) ? v : refuse('shape');
}

/**
 * The pin checks: the app's public record against the pin (id, owner,
 * permissions exactly the set, no event), the bot's login, id and type, and the
 * owner's own login and id. A mismatch or a check that cannot run refuses, and
 * never falls back to the owner. mintToken runs this when the cache misses, so a
 * cached token is reused, unchecked, for at most the hour it lives.
 */
export function checkPin(io, pin, provider) {
  const a = pin.apps[provider];
  if (!a) return refuse('pin/unpinned');
  let app;
  let bot;
  let me;
  try {
    app = ownerRead(io, `apps/${a.slug}`);
    bot = ownerRead(io, `users/${a.bot_login}`);
    me = ownerRead(io, 'user');
  } catch (e) {
    if (e instanceof Refusal && e.id === 'pin/unavailable') throw e;
    return refuse('pin/check');
  }
  const events = app.events;
  if (app.id !== a.app_id || app.owner?.id !== pin.owner.id || !samePermissions(app.permissions, CLAIM_PERMISSIONS) || !Array.isArray(events) || events.length !== 0) return refuse('pin/check');
  if (bot.id !== a.bot_id || bot.type !== 'Bot' || !sameLogin(bot.login, a.bot_login)) return refuse('pin/check');
  if (me.id !== pin.owner.id || !sameLogin(me.login, pin.owner.login)) return refuse('pin/check');
}

// ---------------------------------------------------------------- GitHub

/** One GitHub call. `auth` is a JWT or an installation token; the body is JSON. Returns { status, json }. */
async function api(io, method, path, { auth, body } = {}) {
  if (!path.startsWith('/')) refuse('shape');
  // Every request carries a credential, so none goes out with certificate checks off.
  if (envGet(io.env, 'NODE_TLS_REJECT_UNAUTHORIZED') === '0') refuse('tls');
  guard(io, auth);
  let res;
  let text;
  try {
    res = await io.fetch(`${API}${path}`, {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'the-pact-gh-app',
        ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    text = await res.text();
  } catch {
    return refuse('net');
  }
  if (text.length > 4 * 1024 * 1024) return refuse('shape');
  return { status: res.status, json: text.trim() === '' ? null : text };
}

const jsonOf = r => {
  const v = parseJson(r.json ?? '');
  return isObject(v) ? v : refuse('shape');
};
const b64url = b => Buffer.from(b).toString('base64url');

/** An RS256 JWT for the app: iat now minus 60 s, exp now plus 540 s, iss the app id. */
export function makeJwt(io, appId, keyDer) {
  const now = Math.floor(io.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }));
  let sig;
  try {
    sig = sign('RSA-SHA256', Buffer.from(`${head}.${claims}`), createPrivateKey({ key: keyDer, format: 'der', type: 'pkcs1' }));
  } catch {
    return refuse('key/not-rsa');
  }
  const jwt = `${head}.${claims}.${b64url(sig)}`;
  guard(io, jwt);
  return jwt;
}

/** A PEM as a PKCS#1 DER buffer, or a refusal: an RSA key of 2048 bits or more. */
export function pemToDer(pem) {
  let key;
  try {
    key = createPrivateKey(pem);
  } catch {
    return refuse('key/not-rsa');
  }
  if (key.asymmetricKeyType !== 'rsa' || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) return refuse('key/not-rsa');
  return key.export({ type: 'pkcs1', format: 'der' });
}

/** The key's public fingerprint as GitHub's key list shows it: SHA256 of the public key's DER, base64. */
export function fingerprint(keyDer) {
  const pub = createPublicKey(createPrivateKey({ key: keyDer, format: 'der', type: 'pkcs1' })).export({ type: 'spki', format: 'der' });
  return `SHA256:${createHash('sha256').update(pub).digest('base64')}`;
}

/** The installation for a repo or an account, as the app's JWT reads it, with its account checked against the pinned owner. */
async function installationFor(io, path, jwt, pin, provider) {
  const r = await api(io, 'GET', path, { auth: jwt });
  if (r.status !== 200) return refuse('net');
  const inst = jsonOf(r);
  if (!isId(inst.id) || inst.account?.id !== pin.owner.id || inst.app_id !== pin.apps[provider].app_id) return refuse('install/owner');
  return inst;
}

/** The result of a revoke: 'revoked' for a 204 or a 401 (already dead), else 'unconfirmed'. Never throws. */
async function revoke(io, token) {
  try {
    const r = await api(io, 'DELETE', '/installation/token', { auth: token });
    return r.status === 204 || r.status === 401 ? 'revoked' : 'unconfirmed';
  } catch {
    return 'unconfirmed';
  }
}

// ---------------------------------------------------------------- mintToken

const needWindows = io => {
  if (io.platform !== 'win32') refuse('platform');
};

/** The cached token for this target, or null: a malformed or near-expiry entry is a miss, and nothing of it is printed. */
function cachedToken(io, target) {
  let bytes;
  try {
    bytes = io.credStore.read(target);
  } catch {
    return null;
  }
  if (!bytes) return null;
  let v;
  try {
    v = JSON.parse(bytes.toString('utf8'));
  } catch {
    return null;
  }
  if (!sameKeys(v, ['token', 'expires_at']) || typeof v.token !== 'string' || !TOKEN_RE.test(v.token) || typeof v.expires_at !== 'string') return null;
  const at = Date.parse(v.expires_at);
  if (!Number.isFinite(at) || at - SKEW_MS <= io.now()) return null;
  guard(io, v.token);
  return v.token;
}

/**
 * An installation token narrowed to one repo and a permission set ("git",
 * "post" or "gh"). Module export only: no mode prints it. Refuses a repo
 * outside the pinned owner, a foreign installation, an unpinned provider or
 * one with no key, a pin that fails the pin checks on a cache miss, and certificate checks off.
 */
export async function mintToken({ provider, repo, set }, io = realIo()) {
  needWindows(io);
  if (!PROVIDERS.includes(provider)) refuse('provider');
  if (!Object.hasOwn(SETS, set)) refuse('usage');
  if (envGet(io.env, 'NODE_TLS_REJECT_UNAUTHORIZED') === '0') refuse('tls');
  // An object repo is held to the same shape as the text form: callers in code (the poster, T3) pass either.
  const { owner, name } = parseRepo(typeof repo === 'string' ? repo : isObject(repo) ? `${repo.owner}/${repo.name}` : null);
  const pin = readPin(io);
  const app = pin.apps[provider] ?? refuse('pin/unpinned');
  if (!sameLogin(owner, pin.owner.login)) refuse('repo/owner');
  const target = tokenTarget(provider, owner, name, set);
  const hit = cachedToken(io, target);
  if (hit) return hit;
  checkPin(io, pin, provider);
  const der = io.credStore.read(keyTarget(provider)) ?? refuse('key/missing');
  guard(io, der.toString('base64'));
  const jwt = makeJwt(io, app.app_id, der);
  const inst = await installationFor(io, `/repos/${owner}/${name}/installation`, jwt, pin, provider);
  const permissions = { ...SETS[set] };
  const r = await api(io, 'POST', `/app/installations/${inst.id}/access_tokens`, { auth: jwt, body: { repositories: [name], permissions } });
  if (r.status !== 201) return refuse('net');
  const v = jsonOf(r);
  if (typeof v.token !== 'string' || !TOKEN_RE.test(v.token) || typeof v.expires_at !== 'string' || !Number.isFinite(Date.parse(v.expires_at))) return refuse('shape');
  guard(io, v.token);
  if (v.repositories !== undefined && !(Array.isArray(v.repositories) && v.repositories.length === 1 && sameLogin(v.repositories[0]?.name, name))) {
    await revoke(io, v.token);
    return refuse('shape');
  }
  try {
    io.credStore.write(target, Buffer.from(JSON.stringify({ token: v.token, expires_at: v.expires_at }), 'utf8'));
  } catch {
    // an uncached token is still good for this call
  }
  return v.token;
}

// ---------------------------------------------------------------- the modes

/** Revoke each cached token for a provider and delete its cache entries. Never throws; counts what was not confirmed. */
async function dropCache(io, provider) {
  let unconfirmed = 0;
  let targets = [];
  let listed = true;
  try {
    targets = io.credStore.list(tokenPrefix(provider));
  } catch {
    listed = false;
  }
  for (const t of targets) {
    let token = null;
    let readable = true;
    try {
      const bytes = io.credStore.read(t);
      const v = bytes ? JSON.parse(bytes.toString('utf8')) : null;
      if (isObject(v) && typeof v.token === 'string' && TOKEN_RE.test(v.token)) token = v.token;
    } catch {
      readable = false;
    }
    // A token that could not be read cannot be revoked: it is deleted below and counted as unconfirmed.
    if (!readable || (token && (await revoke(io, token)) !== 'revoked')) unconfirmed += 1;
    try {
      io.credStore.delete(t);
    } catch {
      unconfirmed += 1;
    }
  }
  return { unconfirmed, listed };
}

/** The fixed lines for what dropCache could not do. */
function cacheLines(io, who, { unconfirmed, listed }) {
  if (!listed) say(io, `${who}: the token cache could not be listed, so it was not cleared; each cached token lives at most an hour`);
  if (unconfirmed) say(io, `${who}: a token revoke was not confirmed; each lives at most an hour`);
}

/** Atomic text write: a sibling temp file, then a rename. */
function writeText(io, path, text) {
  io.fs.mkdirSync(join(path, '..'), { recursive: true });
  const tmp = `${path}.tmp`;
  io.fs.writeFileSync(tmp, text, { encoding: 'utf8', mode: 0o600 });
  io.fs.renameSync(tmp, path);
}

const slash = p => p.replaceAll('\\', '/');
/** One gitconfig value: raw when plain, else quoted with " and \ escaped. */
function iniValue(v, force = false) {
  if (/[\r\n\0]/.test(v)) refuse('gitconfig');
  return force || /["\\#;]|^\s|\s$/.test(v) ? `"${v.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"` : v;
}

/**
 * The gitconfig setup writes for a provider, as text: the text the install compares against.
 * `nodePath` is the Node setup runs under (process.execPath), so a Node upgrade is
 * followed by running setup again, which writes the new path.
 */
export function gitconfigText({ home, nodePath, app, provider, xdg = false }) {
  const h = slash(home);
  const node = slash(nodePath);
  const helper = `!"${node}" "${helperPath(home)}" git-credential --provider ${provider}`;
  return [
    '[include]',
    `  path = ${iniValue(`${h}/.gitconfig`)}`,
    ...(xdg ? [`  path = ${iniValue(`${h}/.config/git/config`)}`] : []),
    '[user]',
    `  name = ${iniValue(app.bot_login)}`,
    `  email = ${iniValue(`${app.bot_id}+${app.bot_login}@users.noreply.github.com`)}`,
    '[credential "https://github.com"]',
    '  helper =',
    `  helper = ${iniValue(helper, true)}`,
    '  useHttpPath = true',
    '',
  ].join('\n');
}

/** setup: pin one app and store its key. Nothing is written until the key write, after the owner, app, installation and test-token checks. */
async function setup(io, { provider, appId, keyPath }) {
  const run = makeRun(io);
  const me = (() => {
    const r = run('gh', ['api', '--hostname', 'github.com', '--method', 'GET', 'user']);
    if (!r.ok) return refuse('owner/unavailable');
    const v = parseJson(r.stdout);
    return isObject(v) && isId(v.id) && LOGIN_RE.test(v.login ?? '') ? { login: v.login, id: v.id } : refuse('shape');
  })();
  let pem;
  try {
    pem = io.fs.readFileSync(keyPath, 'utf8');
  } catch {
    return refuse('key/read');
  }
  guard(io, pem);
  const der = pemToDer(pem);
  guard(io, der.toString('base64'));
  const jwt = makeJwt(io, appId, der);

  // A pin file that exists but is not the pinned shape is never taken for a first run: readPin refuses it, and nothing is written.
  const pinNow = io.fs.existsSync(pinPath(io.home)) ? readPin(io) : null;
  if (pinNow && (pinNow.owner.id !== me.id || !sameLogin(pinNow.owner.login, me.login))) refuse('pin/owner');

  const appRes = await api(io, 'GET', '/app', { auth: jwt });
  if (appRes.status !== 200) return refuse('net');
  const app = jsonOf(appRes);
  if (app.id !== appId || app.owner?.id !== me.id || !samePermissions(app.permissions, CLAIM_PERMISSIONS) || !Array.isArray(app.events) || app.events.length !== 0 || typeof app.slug !== 'string' || !SLUG_RE.test(app.slug)) return refuse('app');
  const slug = app.slug;
  const fp = fingerprint(der);

  const pinForCheck = { owner: me, apps: { [provider]: { app_id: appId, slug, bot_login: `${slug}[bot]`, bot_id: 0 } } };
  const inst = await installationFor(io, `/users/${me.login}/installation`, jwt, pinForCheck, provider);

  const test = await api(io, 'POST', `/app/installations/${inst.id}/access_tokens`, { auth: jwt, body: { permissions: { metadata: 'read' } } });
  if (test.status !== 201) return refuse('net');
  const testToken = jsonOf(test).token;
  if (typeof testToken !== 'string' || !TOKEN_RE.test(testToken)) return refuse('shape');
  guard(io, testToken);
  let botRes;
  try {
    botRes = await api(io, 'GET', `/users/${slug}%5Bbot%5D`, { auth: testToken });
  } catch (e) {
    // The test token is live: revoke it before the lookup's failure goes on.
    if ((await revoke(io, testToken)) !== 'revoked') say(io, 'setup: the test token revoke was not confirmed; it lives at most an hour', 'err');
    throw e;
  }
  const revoked = await revoke(io, testToken);
  if (botRes.status !== 200) {
    if (revoked !== 'revoked') say(io, 'setup: the test token revoke was not confirmed; it lives at most an hour', 'err');
    return refuse('net');
  }
  const bot = jsonOf(botRes);
  if (!isId(bot.id) || bot.type !== 'Bot' || !sameLogin(bot.login, `${slug}[bot]`)) {
    if (revoked !== 'revoked') say(io, 'setup: the test token revoke was not confirmed; it lives at most an hour', 'err');
    return refuse('shape');
  }
  const entry = { app_id: appId, slug, bot_login: `${slug}[bot]`, bot_id: bot.id };
  const gitconfig = provider === 'claude' ? gitconfigText({ home: io.home, nodePath: io.execPath, app: entry, provider, xdg: io.fs.existsSync(join(io.home, '.config', 'git', 'config')) }) : null;

  // The checks above wrote nothing. From here each write is put back on a failure.
  const before = { key: io.credStore.read(keyTarget(provider)), pin: (() => { try { return io.fs.readFileSync(pinPath(io.home), 'utf8'); } catch { return null; } })(), gitconfig: (() => { try { return io.fs.readFileSync(gitconfigPath(io.home, provider), 'utf8'); } catch { return null; } })() };
  try {
    io.credStore.write(keyTarget(provider), der);
    const next = pinNow ?? { owner: me, apps: {} };
    next.apps[provider] = entry;
    writeText(io, pinPath(io.home), `${JSON.stringify(next, null, 2)}\n`);
    if (gitconfig) {
      const path = gitconfigPath(io.home, provider);
      writeText(io, path, gitconfig);
      const back = makeRun(io)('git', ['config', '--file', path, '--get-all', 'credential.https://github.com.helper']);
      const want = gitconfig.split('\n').filter(l => l.startsWith('  helper =')).map(l => l.slice('  helper ='.length).trim());
      const got = back.stdout.split(/\r?\n/).slice(0, -1);
      const wantHelper = want[1].replace(/^"|"$/g, '').replaceAll('\\"', '"').replaceAll('\\\\', '\\');
      if (!back.ok || got.length !== 2 || got[0] !== '' || got[1] !== wantHelper) refuse('gitconfig');
    }
  } catch (e) {
    // Each put-back is tried on its own, so one that fails never leaves the others replaced.
    let incomplete = false;
    const attempt = f => {
      try {
        f();
      } catch {
        incomplete = true;
      }
    };
    attempt(() => {
      if (before.key) io.credStore.write(keyTarget(provider), before.key);
      else io.credStore.delete(keyTarget(provider));
    });
    for (const [path, text] of [[pinPath(io.home), before.pin], [gitconfigPath(io.home, provider), before.gitconfig]]) {
      if (text === null) {
        try {
          io.fs.unlinkSync(path);
        } catch (err) {
          // never written is fine; a file that is there and cannot be removed is an incomplete rollback
          if (err?.code !== 'ENOENT') incomplete = true;
        }
      } else attempt(() => writeText(io, path, text));
    }
    if (incomplete) say(io, 'setup: the rollback was incomplete; run status, then setup again', 'err');
    say(io, `setup: the key file is still at ${keyPath}`, 'err');
    throw e instanceof Refusal ? e : new Refusal('refused');
  }
  const dropped = await dropCache(io, provider);
  try {
    io.fs.unlinkSync(keyPath);
  } catch {
    say(io, `setup: the key file could not be deleted; delete it yourself: ${keyPath}`, 'err');
  }
  say(io, `setup: ${provider} pinned as ${entry.bot_login}`);
  say(io, `setup: key fingerprint ${fp}; match it on the app's key list`);
  cacheLines(io, 'setup', { ...dropped, unconfirmed: dropped.unconfirmed + (revoked === 'revoked' ? 0 : 1) });
}

// ---------------------------------------------------------------- git-credential

/** git's request lines as { key: value }, to the first blank line. */
function readRequest(text) {
  const out = {};
  for (const l of text.split(/\r?\n/)) {
    if (l === '') break;
    const i = l.indexOf('=');
    if (i > 0) out[l.slice(0, i)] = l.slice(i + 1);
  }
  return out;
}

/** Whether a `git -c` or GIT_CONFIG_COUNT setting in the environment turns http.sslVerify off, for any url. */
function sslVerifyOffByEnv(env) {
  // git reads false, no, off, an empty value and any integer that is zero as false.
  const off = v => /^(?:false|no|off|[+-]?0+)$/i.test(String(v ?? '').trim());
  const key = k => /^http\.(?:[^=\s]*\.)?sslverify$/i.test(k);
  // Git writes `git -c k=v` as 'k=v' (before 2.31) or 'k'='v' (since), and a bare -c k as 'k', which means true.
  const packed = envGet(env, 'GIT_CONFIG_PARAMETERS') ?? '';
  for (const m of packed.matchAll(/'([^']*)'(?:='([^']*)')?/g)) {
    let [k, v] = [m[1], m[2]];
    if (v === undefined && k.includes('=')) [k, v] = [k.slice(0, k.indexOf('=')), k.slice(k.indexOf('=') + 1)];
    if (v !== undefined && key(k) && (v === '' || off(v))) return true;
  }
  const n = Number.parseInt(envGet(env, 'GIT_CONFIG_COUNT') ?? '0', 10);
  for (let i = 0; i < (Number.isSafeInteger(n) ? Math.min(n, 100000) : 0); i += 1) if (key(envGet(env, `GIT_CONFIG_KEY_${i}`) ?? '') && off(envGet(env, `GIT_CONFIG_VALUE_${i}`))) return true;
  return false;
}

/** git-credential: `get` answers on git's pipe; `store` and `erase` do nothing. A refusal prints nothing on stdout and exits 0. */
async function gitCredential(io, provider, op) {
  if (op === 'store' || op === 'erase') return;
  if (op !== 'get') refuse('usage');
  try {
    const q = readRequest(io.stdin());
    if (q.protocol !== 'https' || q.host !== 'github.com' || typeof q.path !== 'string') refuse('repo/shape');
    needWindows(io);
    // git reads GIT_SSL_NO_VERIFY as set for any value, an empty one included.
    if (envGet(io.env, 'GIT_SSL_NO_VERIFY') !== undefined || sslVerifyOffByEnv(io.env)) refuse('tls');
    // mintToken refuses a repo outside the pinned owner before any spawn or request.
    const token = await mintToken({ provider, repo: parseRepo(q.path, true), set: 'git' }, io);
    io.out(`username=x-access-token\npassword=${token}\n`);
  } catch (e) {
    say(io, `gh-app: ${REASONS[e instanceof Refusal ? e.id : 'refused']}`, 'err');
  }
}

// ---------------------------------------------------------------- the gh mode

/** gh with a `gh`-set token in GH_TOKEN, from a fresh empty folder; output lines that hold the token are withheld. */
async function ghMode(io, provider, repoArg, args) {
  // The first argument is the subcommand: a leading flag could hide a forbidden one from the check.
  if (args.length === 0 || String(args[0]).startsWith('-') || GH_FORBIDDEN_FIRST.has(String(args[0]).toLowerCase())) refuse('gh');
  const repo = parseRepo(repoArg);
  const token = await mintToken({ provider, repo, set: 'gh' }, io);
  guard(io, token);
  const run = makeRun(io);
  const r = run('gh', args, { env: cleanEnv(io.env, { GH_TOKEN: token, GH_REPO: `${repo.owner}/${repo.name}` }), keep: true });
  for (const [text, stream] of [[r.stdout, 'out'], [r.stderr, 'err']]) {
    for (const l of text.split(/\r?\n/)) if (l !== '') io[stream](`${l.includes(token) ? '(withheld)' : l}\n`);
  }
  return r.ok ? 0 : 1;
}

// ---------------------------------------------------------------- forget

async function forget(io, provider) {
  // A missing settings file is no guard. One that is there is read as the harness reads it (a leading byte-order mark skipped); if it cannot be read as settings, forget cannot tell whether it points at the gitconfig, so it refuses.
  let text = null;
  try {
    text = io.fs.readFileSync(settingsPath(io.home), 'utf8');
  } catch (e) {
    if (e?.code !== 'ENOENT') refuse('settings');
  }
  let env = null;
  if (text !== null) {
    try {
      const v = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
      if (!isObject(v)) throw new Error('settings are not an object');
      env = v.env;
    } catch {
      refuse('settings');
    }
  }
  const mine = slash(gitconfigPath(io.home, provider)).toLowerCase();
  const pointed = isObject(env) && typeof env.GIT_CONFIG_GLOBAL === 'string' && slash(env.GIT_CONFIG_GLOBAL).toLowerCase() === mine;
  if (pointed) refuse('settings');
  const dropped = await dropCache(io, provider);
  try {
    io.credStore.delete(keyTarget(provider));
  } catch {
    refuse('store');
  }
  let pin = null;
  try {
    pin = readPin(io);
  } catch {
    // no pin file, or one that is not the pinned shape, is left for the owner
  }
  // A failed write to a valid pin, or a gitconfig that exists but cannot be deleted, is not "forgotten".
  let left = false;
  if (pin) {
    try {
      delete pin.apps[provider];
      writeText(io, pinPath(io.home), `${JSON.stringify(pin, null, 2)}\n`);
    } catch {
      left = true;
    }
  }
  try {
    io.fs.unlinkSync(gitconfigPath(io.home, provider));
  } catch (e) {
    if (e?.code !== 'ENOENT') left = true;
  }
  cacheLines(io, 'forget', dropped);
  if (left) refuse('left');
  say(io, `forget: ${provider} forgotten`);
}

// ---------------------------------------------------------------- status

/** The class of one helper line. `pact` is the exact line the gitconfig writes, so look-alike text reads as shell. */
const helperClass = (text, pactText) => {
  const body = text.startsWith('!') ? text.slice(1) : text;
  if (text.toLowerCase() === pactText.toLowerCase()) return 'pact';
  if (/(?:^|[\\/"'\s])gh(?:\.exe)?["']?\s+auth\s+git-credential/i.test(body)) return 'github-cli';
  const prog = basename(body.trim().replace(/^["']/, '').split(/["']|\s/)[0] ?? '').replace(/\.exe$/i, '').toLowerCase();
  if (/^(?:manager|manager-core|git-credential-manager(?:-core)?)$/.test(prog)) return 'gcm';
  if (text.startsWith('!')) return 'shell';
  return `other:${prog.replace(/[^a-z0-9._-]/g, '_').slice(0, 40) || 'unknown'}`;
};

/** Whether a credential.<url>.helper key's url applies to https://github.com/<owner>/<name>. */
function urlApplies(url, owner, name) {
  if (url === '') return true;
  const m = /^https:\/\/([^/]+)(\/.*)?$/i.exec(url);
  if (!m) return false;
  // As git's urlmatch reads it: user info and the default port do not change the host.
  const host = m[1].replace(/^[^@]*@/, '').replace(/:443$/, '').toLowerCase();
  const wild = host.includes('*') ? new RegExp(`^${host.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^.]*')}$`) : null;
  if (host !== 'github.com' && !(wild && wild.test('github.com'))) return false;
  const path = (m[2] ?? '').replace(/\/$/, '').toLowerCase();
  return path === '' || `/${owner}/${name}`.toLowerCase() === path || `/${owner}/${name}.git`.toLowerCase() === path || `/${owner}`.toLowerCase() === path;
}

async function status(io, provider, repoDir) {
  const run = makeRun(io);
  const gitEnv = cleanEnv(io.env);
  // git runs from a fresh empty folder, so a relative --repo is resolved against the caller's folder first.
  const git = args => run('git', repoDir ? ['-C', resolve(repoDir), ...args] : args, { env: gitEnv });
  let pin = null;
  let pinned = false;
  try {
    pin = readPin(io);
    pinned = Boolean(pin.apps[provider]);
  } catch {
    pin = null;
  }
  const app = pin?.apps[provider];
  say(io, `provider: ${provider}`);
  say(io, `bot: ${app ? app.bot_login : 'not pinned'}`);
  let check = 'fail';
  if (app) {
    try {
      checkPin(io, pin, provider);
      check = 'pass';
    } catch {
      check = 'fail';
    }
  }
  say(io, `pin check: ${check}`);
  let key = false;
  try {
    key = Boolean(io.credStore.read(keyTarget(provider)));
  } catch {
    key = false;
  }
  say(io, `key: ${key ? 'present' : 'absent'}`);
  const cfgPath = gitconfigPath(io.home, provider);
  let nodeExists = false;
  let nodeNamed = slash(io.execPath);
  try {
    const text = io.fs.readFileSync(cfgPath, 'utf8');
    const m = /^\s*helper = "!\\"([^"\\]+)\\"/m.exec(text);
    nodeExists = Boolean(m) && io.fs.existsSync(m[1]);
    if (m) nodeNamed = m[1];
  } catch {
    nodeExists = false;
  }
  say(io, `gitconfig node path exists: ${nodeExists ? 'yes' : 'no'}`);

  // The push address, as a push would use it (pushInsteadOf applied), and the configured one, which the rewrite rules are read against.
  const remote = git(['remote', 'get-url', '--push', 'origin']);
  const url = remote.ok ? remote.stdout.trim() : '';
  const configured = git(['config', '--get', 'remote.origin.url']);
  const raw = configured.ok ? configured.stdout.trim() : url;
  let owner = pin?.owner.login ?? 'x';
  let name = 'x';
  let proto = 'none';
  let creds = 'no';
  if (url) {
    const m = /^https:\/\/(?:[^@/]*@)?github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i.exec(url);
    proto = /^https:/i.test(url) ? 'https' : /^(?:ssh:|git@)/i.test(url) ? 'ssh' : 'other';
    if (m) [, owner, name] = m;
    for (const each of [url, raw]) {
      try {
        const u = new URL(each);
        if (u.username || u.password) creds = 'yes';
      } catch {
        // a scp-style URL has none
      }
    }
  }
  const list = git(['config', '--show-scope', '--get-regexp', '^credential\\..*helper$']);
  const effective = [];
  for (const l of list.stdout.split(/\r?\n/)) {
    const m = /^(\S+)\s+credential\.(.*?)\.?helper(?:\s(.*))?$/i.exec(l.replace(/\t/g, ' '));
    if (!m) continue;
    if (m[2] !== '' && !urlApplies(m[2], owner, name)) continue;
    const text = (m[3] ?? '').trim();
    if (text === '') {
      effective.length = 0;
      continue;
    }
    effective.push({ scope: m[1], cls: helperClass(text, `!"${nodeNamed}" "${helperPath(io.home)}" git-credential --provider ${provider}`) });
  }
  const at = effective.findIndex(h => h.cls === 'pact');
  say(io, `helpers: ${effective.length}`);
  effective.forEach((h, i) => say(io, `helper ${i + 1}: scope ${h.scope}, ${h.cls}${at >= 0 && i > at ? ', FLAGGED: after the pact helper' : ''}`));
  say(io, `pact helper resolved: ${at >= 0 ? 'yes' : 'no'}`);
  const email = git(['config', '--get', 'user.email']);
  const bot = app ? `${app.bot_id}+${app.bot_login}@users.noreply.github.com` : null;
  say(io, `user.email: ${!email.ok || email.stdout.trim() === '' ? 'unset' : bot && email.stdout.trim().toLowerCase() === bot.toLowerCase() ? 'bot address' : 'something else'}`);
  say(io, `remote protocol: ${proto}`);
  const askpass = git(['config', '--get', 'core.askPass']);
  const askSet = (askpass.ok && askpass.stdout.trim() !== '') || ['GIT_ASKPASS', 'SSH_ASKPASS'].some(k => (envGet(io.env, k) ?? '') !== '');
  say(io, `askpass: ${askSet ? 'set' : 'not set'}`);
  // git reads the pattern as a POSIX extended regex: a plain group, never (?:).
  const rewrites = git(['config', '--get-regexp', '^url\\..*\\.(pushinsteadof|insteadof)$']);
  const rewritten = rewrites.stdout.split(/\r?\n/).some(l => {
    const v = l.replace(/^\S+\s+/, '');
    return v !== '' && raw.toLowerCase().startsWith(v.toLowerCase());
  });
  say(io, `url rewrite applies: ${rewritten ? 'yes' : 'no'}`);
  // URL-specific settings match the address git really uses (a .git suffix included); its user info is left out, and it is never printed.
  let target = `https://github.com/${owner}/${name}`;
  try {
    const u = new URL(url);
    if (u.protocol === 'https:' && u.hostname.toLowerCase() === 'github.com') {
      u.username = '';
      u.password = '';
      target = u.href.replace(/\/$/, '');
    }
  } catch {
    // not an https address: the reconstructed one stands
  }
  const ssl = git(['config', '--type=bool', '--get-urlmatch', 'http.sslVerify', target]);
  const noVerify = (ssl.ok && ssl.stdout.trim() === 'false') || envGet(io.env, 'GIT_SSL_NO_VERIFY') !== undefined;
  say(io, `http.sslVerify off: ${noVerify ? 'yes' : 'no'}`);
  say(io, `remote url carries credentials: ${creds}`);
  const header = git(['config', '--get-urlmatch', 'http.extraHeader', target]);
  say(io, `http extraHeader applies: ${header.ok && header.stdout.trim() !== '' ? 'yes' : 'no'}`);
  if (!pinned) return 1;
  return check === 'pass' ? 0 : 1;
}

// ---------------------------------------------------------------- command line

const FLAGS = Object.freeze({
  setup: ['--provider', '--app-id', '--key'],
  'git-credential': ['--provider'],
  gh: ['--provider', '-R'],
  status: ['--provider', '--repo'],
  forget: ['--provider'],
});

/** The arguments as { mode, flags, rest, after }, or a usage refusal. Each flag once; a flag's value never starts with a dash. */
export function parseArgs(argv) {
  const [mode, ...tail] = argv;
  if (typeof mode !== 'string' || !Object.hasOwn(FLAGS, mode)) return refuse('mode');
  const flags = {};
  const rest = [];
  let after = [];
  for (let i = 0; i < tail.length; i += 1) {
    const a = tail[i];
    if (a === '--' && mode === 'gh') {
      after = tail.slice(i + 1);
      break;
    }
    if (FLAGS[mode].includes(a)) {
      const v = tail[i + 1];
      if (Object.hasOwn(flags, a) || typeof v !== 'string' || v === '' || v.startsWith('-')) return refuse('usage');
      flags[a] = v;
      i += 1;
    } else if (mode === 'git-credential' && !a.startsWith('-') && rest.length === 0) rest.push(a);
    else return refuse('usage');
  }
  if (!Object.hasOwn(flags, '--provider') || !PROVIDERS.includes(flags['--provider'])) return refuse('provider');
  return { mode, flags, rest, after };
}

/** Run one command line; returns the exit code. Every error ends as one fixed line. */
export async function main(argv, io = realIo()) {
  io.secrets ??= new Set();
  try {
    const { mode, flags, rest, after } = parseArgs(argv);
    const provider = flags['--provider'];
    if (mode === 'git-credential') {
      await gitCredential(io, provider, rest[0]);
      return 0;
    }
    needWindows(io);
    if (mode === 'setup') {
      const appId = Number(flags['--app-id']);
      if (!/^[1-9][0-9]{0,15}$/.test(flags['--app-id'] ?? '') || !isId(appId) || !flags['--key']) return refuse('usage');
      await setup(io, { provider, appId, keyPath: flags['--key'] });
      return 0;
    }
    if (mode === 'gh') return await ghMode(io, provider, flags['-R'] ?? '', after);
    if (mode === 'forget') {
      await forget(io, provider);
      return 0;
    }
    return await status(io, provider, flags['--repo']);
  } catch (e) {
    const id = e instanceof Refusal ? e.id : 'refused';
    try {
      say(io, `gh-app: ${REASONS[id]}`, 'err');
    } catch {
      // nothing more to say
    }
    return id === 'usage' || id === 'mode' || id === 'provider' ? 2 : 1;
  }
}

/** Whether this file is the entry script. Node added import.meta.main in 24.2; an earlier Node 24 compares the real paths. */
function isEntry() {
  if (typeof import.meta.main === 'boolean') return import.meta.main;
  try {
    return typeof process.argv[1] === 'string' && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntry()) process.exitCode = await main(process.argv.slice(2));
