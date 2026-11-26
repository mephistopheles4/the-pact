#!/usr/bin/env node
// The release bootstrap (spec 0007 S10), which npx fetches and runs:
//   pact [--default | --builder] [--home <path>] [--channel beta | --release <tag>]
// It takes the highest stable release tag, or with --channel beta the newest
// tag, a release candidate included, or with --release exactly the tag named,
// clones it under ~/.pact/source/<commit>,
// checks the clone's head, and runs the clone's install as a dry run, or, on
// the builder choice, only the clone's builder, which writes Scriptorium to
// ~/.pact/scriptorium.html. It never passes --apply: the owner types the apply
// line the dry run prints. Node's
// built-ins and git only. git is found by walking PATH's full entries, never by
// bare name and never in a package folder npx put on PATH, and runs from the
// home folder, so a git planted in the folder npx ran from never runs.
import { spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, isAbsolute, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const REPO_URL = 'https://github.com/mephistopheles4/the-pact.git';
const KEEP_CLONES = 3;
const LIMIT_MS = 300000;
// A release tag is named exactly v1.<n>.0 or v1.<n>.0-rc.<k>; a peeled line gives an annotated tag's commit.
const TAG = /^v1\.(0|[1-9]\d{0,8})\.0(?:-rc\.([1-9]\d{0,8}))?$/;
const TAG_LINE = /^([0-9a-f]{40})\trefs\/tags\/(v1\.(?:0|[1-9]\d{0,8})\.0(?:-rc\.[1-9]\d{0,8})?)(\^\{\})?$/;
const COMMIT = /^[0-9a-f]{40}$/;
const WIN = process.platform === 'win32';

class Refusal extends Error {
  constructor(rule, why) {
    super(why);
    this.rule = rule;
  }
}
const refuse = (rule, why) => {
  throw new Refusal(rule, why);
};

function parseArgs(argv) {
  const out = { choice: null, home: null, channel: null, release: null };
  const usage = () => refuse('bootstrap-args', 'the command takes --default or --builder, --home <path>, and one of --channel stable|beta or --release v1.<n>.0[-rc.<k>], each once. It never applies: run the apply line the dry run prints.');
  for (let i = 0; i < argv.length; i += 1) {
    const w = argv[i];
    if ((w === '--default' || w === '--builder') && out.choice === null) out.choice = w.slice(2);
    else if (w === '--home' && out.home === null && i + 1 < argv.length) out.home = argv[(i += 1)];
    else if (w === '--channel' && out.channel === null && i + 1 < argv.length && ['stable', 'beta'].includes(argv[i + 1])) out.channel = argv[(i += 1)];
    else if (w === '--release' && out.release === null && i + 1 < argv.length && TAG.test(argv[i + 1])) out.release = argv[(i += 1)];
    else usage();
  }
  if (out.channel !== null && out.release !== null) usage();
  return out;
}

/**
 * The environment git and the install run with: this one, with PATH cut to its
 * full entries outside any node_modules folder (npx puts the running folder's
 * node_modules/.bin first), no GIT_ variable, and no NODE_OPTIONS.
 */
function childEnv(env) {
  const out = {};
  let path = '';
  for (const [k, v] of Object.entries(env)) {
    if (/^path$/i.test(k)) path = v;
    else if (!/^(git_|node_options$)/i.test(k)) out[k] = v;
  }
  const full = dir => (WIN ? /^"?[A-Za-z]:[\\/]/.test(dir) : dir.startsWith('/'));
  out.PATH = path.split(delimiter).filter(d => full(d) && !/(^|[\\/])node_modules([\\/"]|$)/i.test(d)).join(delimiter);
  if (WIN) out.NoDefaultCurrentDirectoryInExePath = '1';
  return out;
}

function findGit(path) {
  for (const raw of path.split(delimiter)) {
    const p = join(raw.replace(/^"(.*)"$/, '$1'), WIN ? 'git.exe' : 'git');
    try {
      if (statSync(p).isFile()) {
        if (!WIN) accessSync(p, constants.X_OK);
        return p;
      }
    } catch {}
  }
  return refuse('bootstrap-git', 'no git found on PATH.');
}

/**
 * The release the options pick among `ls-remote --tags` lines, as { tag, commit },
 * or null. A named tag is that tag alone. Otherwise the highest by number, a
 * stable release above its own candidates, a candidate only on the beta channel.
 */
function pickRelease(listing, { channel, release }) {
  const found = new Map();
  for (const line of listing.split('\n')) {
    const m = TAG_LINE.exec(line.replace(/\r$/, ''));
    // A peeled line, which follows its tag's own, gives the commit an annotated tag names.
    if (m && (m[3] || !found.has(m[2]))) found.set(m[2], m[1]);
  }
  if (release !== null) return found.has(release) ? { tag: release, commit: found.get(release) } : null;
  let best = null;
  for (const [tag, commit] of found) {
    const [, n, k] = TAG.exec(tag);
    if (k && channel !== 'beta') continue;
    const rank = [Number(n), k ? Number(k) : Infinity];
    if (!best || rank[0] > best.rank[0] || (rank[0] === best.rank[0] && rank[1] > best.rank[1])) best = { rank, tag, commit };
  }
  return best && { tag: best.tag, commit: best.commit };
}

/** The clones this bootstrap made, oldest first, as the list beside them holds them. */
function readList(file) {
  try {
    const list = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(list) ? list.filter(c => typeof c === 'string' && COMMIT.test(c)) : [];
  } catch {
    return [];
  }
}

/** The release's clone under the home folder, made if it is missing, with its head checked, and older clones of its own deleted. */
function cloneRelease(git, home, url, { tag, commit }) {
  const source = join(home, '.pact', 'source');
  mkdirSync(source, { recursive: true });
  const dest = join(source, commit);
  const headIs = dir => {
    const r = git(['--git-dir', join(dir, '.git'), 'rev-parse', '--verify', 'HEAD']);
    return r.status === 0 && r.stdout.trim() === commit;
  };
  const wrongHead = dir => {
    rmSync(dir, { recursive: true, force: true });
    refuse('release-head', `the clone's head is not the commit ${tag} names; the clone was deleted. Run the command again.`);
  };
  const list = readList(join(source, 'clones.json'));
  let mine = list.includes(commit);
  if (existsSync(dest)) {
    if (!headIs(dest)) wrongHead(dest);
  } else {
    // Cloned beside its place and moved in once checked, so a stopped run leaves no half clone under the commit's name.
    const part = `${dest}.part`;
    rmSync(part, { recursive: true, force: true });
    const r = git(['clone', '--quiet', '--depth', '1', '--branch', tag, '-c', 'core.autocrlf=false', '-c', 'core.eol=lf', '--', url, part]);
    if (r.status !== 0) {
      rmSync(part, { recursive: true, force: true });
      refuse('release-clone', `the release ${tag} could not be cloned.`);
    }
    if (!headIs(part)) wrongHead(part);
    renameSync(part, dest);
    mine = true;
  }
  if (mine) {
    const kept = [...list.filter(c => c !== commit), commit];
    while (kept.length > KEEP_CLONES) {
      const old = join(source, kept.shift());
      if (existsSync(old) && lstatSync(old).isDirectory()) rmSync(old, { recursive: true, force: true });
    }
    writeFileSync(join(source, 'clones.json'), `${JSON.stringify(kept)}\n`, { mode: 0o600 });
  }
  return dest;
}

async function askTerminal() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question('1) Install the default configuration\n2) Build your own configuration in Scriptorium first (installs nothing)\nChoose 1 or 2: ');
  } finally {
    rl.close();
  }
}

/** One run. Returns the exit code. The options are the command's own; a test hands in the rest. */
export async function main({
  argv = process.argv.slice(2),
  env = process.env,
  url = REPO_URL,
  tty = Boolean(process.stdin.isTTY && process.stdout.isTTY),
  ask = askTerminal,
  say = line => process.stdout.write(`${line}\n`),
  stdio = 'inherit',
} = {}) {
  try {
    const opts = parseArgs(argv);
    const noChoice = () => refuse('bootstrap-choice', 'choose what to install: run again with --default or --builder, or on a terminal answer 1 or 2.');
    if (opts.choice === null && !tty) noChoice();
    const home = opts.home ?? homedir();
    if (!isAbsolute(home) || /^[\\/]{2}/.test(home)) refuse('home-path', '--home must be a full path on this machine.');
    if (!existsSync(home) || !statSync(home).isDirectory()) refuse('home-path', 'the home folder does not exist.');
    const run = childEnv(env);
    const gitPath = findGit(run.PATH);
    const git = args => spawnSync(gitPath, ['-c', 'core.fsmonitor=false', ...args], { cwd: home, env: { ...run, GIT_TERMINAL_PROMPT: '0' }, encoding: 'utf8', timeout: LIMIT_MS, maxBuffer: 1 << 26, windowsHide: true, shell: false });
    if (opts.home !== null && git(['rev-parse', '--is-inside-work-tree']).stdout?.trim() === 'true') refuse('home-work-tree', '--home is inside a git work tree; give a folder outside any repository.');
    const listed = git(['ls-remote', '--tags', url]);
    if (listed.status !== 0) refuse('release-list', "the pact's release tags could not be read.");
    const release = pickRelease(listed.stdout, opts);
    if (!release) refuse('release-none', opts.release === null ? `the repository holds no ${opts.channel === 'beta' ? 'release tag' : 'stable release tag'} named v1.<n>.0${opts.channel === 'beta' ? ' or v1.<n>.0-rc.<k>' : ''}.` : `the repository holds no release tag ${opts.release}.`);
    say(`Release: ${release.tag} (commit ${release.commit})`);
    const clone = cloneRelease(git, home, url, release);
    /** Run one of the clone's scripts from the home folder; true when it passes. */
    const pass = (args, given) => {
      const r = spawnSync(process.execPath, args, { cwd: home, env: given, stdio, windowsHide: true, shell: false });
      // With stdio piped, as a test runs it, the script's lines are passed on.
      if (r.stdout) say(String(r.stdout).trimEnd());
      return r.status === 0;
    };
    const choice = opts.choice ?? { 1: 'default', 2: 'builder' }[(await ask()).trim()] ?? noChoice();
    // Spec 0007 S11: Scriptorium before any install. The builder writes the page under the home folder it runs with.
    if (choice === 'builder') {
      const own = join(home, '.pact', 'builder.json');
      const file = existsSync(own) ? own : join(clone, 'examples', 'pact-config', 'builder.json');
      const forHome = opts.home === null ? run : { ...run, HOME: home, USERPROFILE: home };
      if (!pass([join(clone, 'builder', 'build.mjs'), '--builder', file], forHome)) return 1;
      say('Nothing is installed yet. Open the page named above in a browser, save from it into your .pact folder, then run this command again, with the same --home if you gave one, and choose 1 or pass --default: it shows the dry run of what you saved.');
      return 0;
    }
    // The default is only the dry run's input: the install keeps an existing ~/.pact/config.json and uses it.
    const args = [join(clone, 'gate', 'install.mjs'), '--release', release.tag, ...(opts.home === null ? [] : ['--home', opts.home])];
    return pass(args, run) ? 0 : 1;
  } catch (e) {
    say(`REFUSED: ${e instanceof Refusal ? `${e.message} [${e.rule}]` : 'the bootstrap failed.'}`);
    say('RESULT: refused');
    return 1;
  }
}

// Run only as the command, by its own path or a link to it, never on import.
const invoked = () => {
  try {
    return realpathSync.native(process.argv[1]) === realpathSync.native(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
};
if (invoked()) process.exitCode = await main();
