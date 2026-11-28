# The agent app wherever it is installed

**2026-11-28.** PACT-125, T1 of [spec 0012](../spec/0012-app-wherever-installed.md). The owner's ask: where the app is installed, the agent works as the app, whoever owns the repo, and falls back to the owner where it isn't. Sensitive route (credential selection and token minting), thorough, cut in two; T2, the guard, stacks on this.

## What was built

- **`gh-app.mjs`:** `mintToken` finds the app's installation through `/repos/<owner>/<name>/installation`, for any owner, and refuses another app's. A 404 is the new refusal `install/none`, remembered for ten minutes beside the token cache; any other answer to the lookup is `net`. `repo/owner` is gone.
- **The fallback:** `git-credential get` answers `install/none` with the owner's credential from `git credential fill` under the owner's normal config, and says so on stderr. No other refusal falls back. `gh` mode and the poster refuse `install/none`.
- **The owner's lines:** the gitconfig ends with a marker line; setup and refresh keep what follows it, refusing a credential, url, http or include section there, and the install compares only what comes before, flagging such a section.
- **SSH remotes:** accepted and documented in `agent-identity.md`.
- **Tests: +13 −4.** Three rows that held the old owner rule went (`repo-outside-owner`, `foreign-installation`, `another-owner`), and the poster's another-account row went as a duplicate of its generic refusal rows and the mint row `installation-of-another-app`; the gh test changed to the new behaviour.

## The first Test round

The security pair found that draft 1's `gh` fallback ran `gh` as the owner with arguments that could reach any repo (a high from the data lens), and that lines below the marker could put a credential helper back unseen. Both were fixed. That any caller of the helper can read the owner's credential for a repo the app isn't on is written into the threat model and comes to the owner as an accepted-risk candidate.

## T2, the guard

**2026-11-28.** A `git` write is now guarded on every GitHub repo, whoever owns it, so it goes through the app's gitconfig and the helper decides app or owner. `gh` writes keep the owner scope: after T1's security review, `gh` mode no longer falls back to the owner, so denying every github.com `gh` write would have blocked them where the app isn't installed. The lead picked this (decision 117), flagged to the owner. Left open: a plain `gh` write to another owner's repo where the app is installed goes out as the owner (spec 0012 S5). Tests: +1 −0; the exempt `git` cases moved to a non-GitHub host.

## Rolling back

As spec 0012 S4 says: copy any lines below the marker out of the gitconfig, revert the merge, then run `gh-app.mjs refresh`.

## Record

- The ticket: PACT-125 on Linear. Its comments hold the plan and the reviews.
