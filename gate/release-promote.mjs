#!/usr/bin/env node
// The owner's command that makes a stable release (spec 0007 S10, decision 177):
//   node gate/release-promote.mjs v1.<n>.0-rc.<k>
// It tags that release candidate's commit v1.<n>.0 through the GitHub API,
// with the token of the account that runs it: GH_TOKEN when set, else the one
// `gh auth token` prints. The release workflow only ever makes candidates; the
// repository's tag rulesets, which the owner sets, decide who may make a stable
// tag. Nothing here is installed to run unattended, and it needs no package.
// GITHUB_API_URL and GITHUB_REPOSITORY, as GitHub's own tools read them, name
// another server or repository; a test points them at a stand-in.
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const RC_TAG = /^v1\.(0|[1-9]\d{0,8})\.0-rc\.[1-9]\d{0,8}$/;
const RELEASE_REF = /^refs\/tags\/(v1\.(0|[1-9]\d{0,8})\.0(?:-rc\.([1-9]\d{0,8}))?)$/;

/** The token of this run: GH_TOKEN when it is set at all, else gh's. An empty one is refused before any request. */
export function tokenFor(env, run = execFileSync) {
  let token = env.GH_TOKEN;
  if (token === undefined) {
    // gh's token for the host the requests go to: github.com for the default API URL, else the URL's host.
    const url = env.GITHUB_API_URL || 'https://api.github.com';
    const host = url === 'https://api.github.com' ? 'github.com' : new URL(url).host;
    try {
      token = run('gh', ['auth', 'token', '--hostname', host], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      throw new Error('No token: set GH_TOKEN, or sign in with gh auth login.');
    }
  }
  token = String(token).trim();
  if (!token) throw new Error('No token: set GH_TOKEN, or sign in with gh auth login.');
  return token;
}

/** Tags the commit of release candidate `rc` as its stable release; returns the line to print. */
export async function promote(rc, env = process.env, run = execFileSync) {
  if (!RC_TAG.test(rc ?? '')) throw new Error('The argument is not a release candidate tag, v1.<n>.0-rc.<k>.');
  const token = tokenFor(env, run);
  const api = env.GITHUB_API_URL || 'https://api.github.com';
  const repo = env.GITHUB_REPOSITORY || 'mephistopheles4/the-pact';
  async function call(path, body) {
    const r = await fetch(`${api}/repos/${repo}/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' },
      body: body && JSON.stringify(body),
      redirect: 'error',
    });
    if (!r.ok) throw new Error(`GitHub answered ${r.status} for ${path}.`);
    return r.json();
  }
  // Every v1.<n>.0 and v1.<n>.0-rc.<k> tag; k is null for a stable release.
  const done = [];
  for (const { ref, object } of await call('git/matching-refs/tags/v1.')) {
    const m = RELEASE_REF.exec(ref);
    if (!m) continue;
    // An annotated tag may name another tag; follow at most five, and refuse if no commit is reached.
    let target = object;
    for (let level = 0; target.type === 'tag' && level < 5; level++) target = (await call(`git/tags/${target.sha}`)).object;
    if (target.type === 'tag') {
      // Candidate names are open, so another candidate that leads nowhere is skipped, not a stop.
      if (m[3] && m[1] !== rc) continue;
      throw new Error(`${m[1]} does not lead to a commit within five tags.`);
    }
    done.push({ tag: m[1], n: Number(m[2]), k: m[3] ? Number(m[3]) : null, sha: target.sha });
  }
  // An existing candidate of the next minor becomes that minor's stable release.
  const found = done.find(r => r.tag === rc);
  if (!found) throw new Error(`${rc} does not exist.`);
  const tag = `v1.${found.n}.0`;
  if (done.some(r => r.tag === tag)) throw new Error(`${tag} already exists.`);
  const next = Math.max(0, ...done.filter(r => r.k === null).map(r => r.n)) + 1;
  if (found.n !== next) throw new Error(`${tag} is not the next minor, v1.${next}.0.`);
  // Only a commit on main is released: compare names it ahead or identical only when main holds it.
  const { status } = await call(`compare/${found.sha}...main`);
  if (status !== 'ahead' && status !== 'identical') throw new Error(`${rc}'s commit is not on main.`);
  await call('git/refs', { ref: `refs/tags/${tag}`, sha: found.sha });
  return `Tagged ${tag} on ${found.sha}, the commit of ${rc}.`;
}

// Run as a command, not when a test imports it.
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  promote(process.argv[2]).then(console.log, e => {
    console.error(String(e.message).split('\n')[0]);
    process.exitCode = 1;
  });
}
