// The gate-macos smoke step (PACT-82, spec 0003 M7): the one run of the pinned
// macOS server on a real Mac before a merge. It fetches the pinned
// `darwin-arm64-cpu` archive through clef's own fetch, which refuses a size or
// sha256 that is not the pin's, unpacks it through clef's own unpack, which
// checks each kept file again, and runs `llama-server --device none --version`
// in the server's fixed folder and environment. The run passes only when that
// exits 0. It starts no model and opens no port, and reads no secret. It runs the
// server only when the change touches claude/tools/clef.mjs (which holds the pin
// table) or this script; otherwise it prints a skipped line and exits 0.
//
// usage: node .github/scripts/clef-smoke.mjs

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SERVER, archiveUrl, destName, fetchFile, makeTransport, paths, serveEnv, unpackServer } from '../../claude/tools/clef.mjs';

/** The pin row the run uses: Apple Silicon's CPU build, which names no device. */
export const KEY = 'darwin-arm64-cpu';

/**
 * Fetches, checks and unpacks the pinned archive under `dir`, runs the server
 * with `--device none --version`, and returns what `run` returned. Throws a
 * `Refused` from the fetch or unpack on a pin mismatch, and an Error when the
 * server does not exit 0.
 */
export async function smoke({ dir, key = KEY, server = SERVER, transport = makeTransport(), run = spawnSync, env = process.env, platform = 'darwin' }) {
  const a = server.archives[key];
  if (!a) throw new Error(`the pin table has no ${key} row`);
  const p = paths(dir, server);
  mkdirSync(p.partial, { recursive: true, mode: 0o700 });
  const out = join(p.partial, a.asset);
  await fetchFile({ url: archiveUrl(server, key).href, source: 'server', size: a.size, sha256: a.sha256, out, transport });
  unpackServer({ dir, key, archivePath: out, platform, server });
  rmSync(out, { force: true });
  const exe = join(p.runtime, destName(a.exe, a.exe));
  const r = run(exe, ['--device', 'none', '--version'], { cwd: p.runtime, env: serveEnv(env, platform, p.runtime), encoding: 'utf8', timeout: 120_000, shell: false });
  if (r.status !== 0) throw new Error(`llama-server --device none --version did not exit 0 (status ${r.status}, signal ${r.signal}, error ${r.error?.message ?? 'none'})`);
  return r;
}

/** The files whose change makes the smoke run: the pin table's file and this script. */
export const WATCHED = ['claude/tools/clef.mjs', '.github/scripts/clef-smoke.mjs'];

const gitRun = args => spawnSync('git', args, { encoding: 'utf8', shell: false, timeout: 60_000 });

/**
 * The paths the change touches, from the base commit named in the Actions event
 * file (`pull_request.base.sha`, or `before` on a push), or null when anything is
 * unknown: no event, a bad or all-zero sha, a failed fetch or diff. The fetch is
 * anonymous, since the repo is public and the checkout keeps no credential.
 */
export function changedFiles({ env = process.env, readFile = p => readFileSync(p, 'utf8'), git = gitRun } = {}) {
  try {
    if (!env.GITHUB_EVENT_PATH) return null;
    const ev = JSON.parse(readFile(env.GITHUB_EVENT_PATH));
    const sha = ev.pull_request ? ev.pull_request.base?.sha : ev.before;
    if (typeof sha !== 'string' || !/^[0-9a-f]{40}$/.test(sha) || /^0+$/.test(sha)) return null;
    if (git(['fetch', '--no-tags', '--depth=1', 'origin', sha]).status !== 0) return null;
    const d = git(['diff', '--name-only', '--no-renames', sha, 'HEAD']);
    if (d.status !== 0 || typeof d.stdout !== 'string') return null;
    return d.stdout.split('\n').filter(Boolean);
  } catch {
    return null;
  }
}

/** True unless `changed` is a known list that names neither watched path. */
export const smokeNeeded = changed => changed === null || WATCHED.some(f => changed.includes(f));

const startedAsScript = () => {
  try {
    const self = fileURLToPath(import.meta.url);
    if (!process.argv[1]) return false;
    if (resolve(process.argv[1]) === self) return true;
    // Only a script of this file's name is looked up on disk, so an importer touches no file.
    return basename(process.argv[1]) === basename(self) && realpathSync(process.argv[1]) === realpathSync(self);
  } catch {
    return false;
  }
};
if (startedAsScript() && !smokeNeeded(changedFiles())) {
  process.stdout.write('smoke: skipped: no change to clef.mjs or the smoke script\n');
} else if (startedAsScript()) {
  const dir = mkdtempSync(join(process.env.RUNNER_TEMP || tmpdir(), 'clef-smoke-'));
  let code = 0;
  try {
    if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('this smoke run needs an Apple Silicon Mac');
    const r = await smoke({ dir: join(dir, 'pact-clef') });
    process.stdout.write(`${r.stdout ?? ''}${r.stderr ?? ''}`);
    process.stdout.write(`smoke: ${KEY} ${SERVER.tag} pass\n`);
  } catch (e) {
    process.stdout.write(`smoke: fail: ${e.message}\n`);
    code = 1;
  } finally {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
  process.exitCode = code;
}
