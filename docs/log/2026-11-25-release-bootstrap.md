# 2026-11-25: releases and the bootstrap (PACT-105 T6)

The pact gains a release path (spec 0007 S10): `package.json` and
`bin/pact.mjs` for `npx`, `.github/workflows/release.yml`, and a behind check
that compares release numbers.

- **The tag ruleset's bypass.** It names a role, app, team, user or deploy key,
  never a workflow. With `github.token` the narrowest actor is one every
  workflow shares, and a workflow file on any branch sets its own permissions.
  T6 stopped, as the spec says. The lead picked a release-only GitHub App, its
  key in an environment only `main` deploys to (spec 0007 S2 item 49). The
  owner hasn't answered it.
- **A loosened check.** `release.yml` alone may use `workflow_run`, and alone
  may read one secret; the file is held to an exact allow-list, with a bad case
  for each rule.
- **The planted `git`.** `npx` puts the running folder's `node_modules/.bin`
  on PATH, so the bootstrap cuts relative and `node_modules` entries from the
  PATH it and the clone's install search.
- **npm's pick.** npm prefers a tag on the default branch's tip over a higher
  one; the bootstrap picks the highest release itself. Seen with npm's bundled
  resolver on sample listings; no real tag existed to try it end to end.
- **Two doc budgets rise** (`docs/install.md`, `docs/reference.md`) rather
  than cut needed text; PACT-110 cleans up.
- **Two tag rulesets, not one.** The lenses found that a ruleset's bypass
  covers each of its rules, so the app would also have moved or deleted tags.
- **The lenses also found** a step name the allow-list never read, an untested
  head check on a fresh clone, and `NODE_OPTIONS` reaching the install.
- Nothing is tagged: `PACT_RELEASES` is unset, and the app, environment and
  rulesets are the owner's to make.

**Record:** PACT-105's comments signed `build-pact-105-t6`: the T6 stop, the
test rounds and the status.
