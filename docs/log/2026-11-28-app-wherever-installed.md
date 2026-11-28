# The agent app wherever it is installed (T1)

**2026-11-28.** PACT-125, T1 of [spec 0012](../spec/0012-app-wherever-installed.md). The owner's ask: where the app is installed, the agent works as the app, whoever owns the repo, and falls back to the owner where it isn't. Sensitive route (credential selection and token minting), thorough, cut in two; T2, the guard, stacks on this.

## What was built

- **`gh-app.mjs`:** `mintToken` finds the app's installation through `/repos/<owner>/<name>/installation`, for any owner, and refuses another app's. A 404 is the new refusal `install/none`, remembered for ten minutes beside the token cache. `repo/owner` is gone.
- **The fallback:** `git-credential get` answers `install/none` with the owner's credential from `git credential fill` under the owner's normal config; `gh` mode runs `gh` as the owner's login. Both say so on stderr. No other refusal falls back, and the poster never does.
- **The owner's lines:** the gitconfig ends with a marker line; setup and refresh keep what follows it, and the install compares only what comes before.
- **SSH remotes:** accepted and documented in `agent-identity.md`.
- **Tests: +11 −3.** Three rows that held the old owner rule went (`repo-outside-owner`, `foreign-installation`, `another-owner`); the gh test and the poster's another-account row changed to the new behaviour.

## Rolling back

As spec 0012 S4 says: copy any lines below the marker out of the gitconfig, revert the merge, then run `gh-app.mjs refresh`.

## Record

- The ticket: PACT-125 on Linear. Its comments hold the plan and the reviews.
