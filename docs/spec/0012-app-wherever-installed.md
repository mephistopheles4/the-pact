# Spec: the agent app wherever it is installed

Status: draft 2, after T1's first Test round (the QA pair and the security
pair), with their fixes folded in. A delta on
[0010](0010-agent-identity-guard.md): in T2, its repo-owner scoping for `git`
writes moves from the owner's name to the app's installations. Everything else
in 0010 holds. The spec counts once it is on `main`.

- **Business driver:** the owner's ask: where the app is installed, the agent
  works as the app, whoever owns the repo; where it isn't, the work goes on
  under the owner's own credentials. Where nothing else decides, take the
  option that is cheaper to reverse.
- **Trade-off:** one test against a fast guard. The guard runs before every
  shell call and can't ask GitHub. So the helper holds the installation test,
  and the guard (T2) sends every github.com git write through the helper, which
  falls back to the owner where no installation covers the repo. A write to a
  repo the app isn't on then costs a helper call; the guard stays offline.
- **Trade-off:** one line for git and `gh` against a `gh` write that still goes
  through. `gh-app.mjs gh` has no fallback (S1.2), so a guard that denied
  every github.com `gh` write would block them wherever the app isn't
  installed. T2 leaves the `gh` side as it was, the option cheaper to
  reverse; S5 names the gap.
- **Trade-off:** the owner's credential against a stuck push. Where the app
  isn't installed, the helper hands git the owner's own credential instead of
  failing. That is the owner's call ("they have access and i asked for it").
  A failed pin check, or any refusal but "not installed", still never falls
  back.

<!-- toc -->

- [S1 What changes](#s1-what-changes)
- [S2 Acceptance claims](#s2-acceptance-claims)
- [S3 Tickets, route and boundaries](#s3-tickets-route-and-boundaries)
- [S4 Rollback](#s4-rollback)
- [S5 What T2 leaves open](#s5-what-t2-leaves-open)

<!-- /toc -->

## S1 What changes

1. **The app works wherever it is installed (T1).** `mintToken` drops the
   owner-name check. It finds the installation with
   `GET /repos/<owner>/<name>/installation` under the app's JWT, and refuses
   another app's installation (`install/owner`). A 404 is `install/none`,
   remembered for ten minutes beside the token cache, so `setup` and `forget`
   clear it with the tokens. An entry claiming more than ten minutes is not
   taken.
2. **The fallback (T1).** On `install/none`, `git-credential get` runs
   `git credential fill` with `GIT_CONFIG_GLOBAL` dropped, so git reads the
   owner's normal config, `GIT_TERMINAL_PROMPT=0`, and
   `PACT_GH_APP_OWNER_FALLBACK=1`, which makes a helper reached from that git
   refuse at once. It passes on only the `username` and `password` lines and
   says on stderr that it used the owner's credentials; `GCM_INTERACTIVE=never`
   keeps Git Credential Manager from opening a window. `gh` mode and the poster
   do not fall back: they refuse `install/none`. (Draft 1 ran `gh` as the
   owner; the security pair showed its other arguments reach any repo, so it
   went.) Any caller of the helper, a session included, can read the owner's
   credential for a repo the app isn't on: written into the threat model as an
   accepted-risk candidate for the owner.
3. **SSH remotes: accepted and documented (T1).** The commit is the bot's, the
   push uses the owner's SSH key. `status` already prints
   `remote protocol: ssh`; `agent-identity.md` says how to move the push to
   HTTPS. Cheapest to reverse of the three options; a rewrite or a refusal can
   follow if the owner wants one.
4. **The owner's global writes are kept (T1).** The gitconfig's last pact line
   is `# pact: the lines below are yours; setup and refresh keep them`. Setup
   and refresh keep what follows it, and in a file written before the marker,
   what follows `  useHttpPath = true`, with either line ending. A
   `[credential]`, `[url]`, `[http]`, `[include]` or `[includeIf]` section
   among those lines makes setup and refresh refuse and the install's verdict
   fail, since it could put a helper back. Otherwise the verdict compares only
   the text through the marker. A key git adds inside a pact section is the
   pact's.
5. **The guard sends every github.com git write through the app (T2).** For a
   `git` write, the guard's owner test (`resolveOwnerMatch`) becomes "the host
   is GitHub": the write needs the app's gitconfig whoever owns the repo, and
   the credential helper decides app or owner. `gh` writes are scoped as
   before, to the pinned owner's repos and the account-scoped commands. Hosts
   other than GitHub stay exempt, so 0010's exempt `git` tests move their
   stranger repos to a non-GitHub host.

## S2 Acceptance claims

- **C1:** a repo another account owns, where an installation of the pinned
  app covers it, gets a token narrowed to that repo and the set's permissions.
- **C2:** a repo no installation covers is refused `install/none`; a repeat
  within ten minutes makes no request and no spawn; after that the helper
  looks again; an entry past ten minutes is ignored; the poster refuses it.
- **C3:** `git-credential get` on such a repo prints the owner's username and
  password from `git credential fill`, run without `GIT_CONFIG_GLOBAL` and
  with the fallback variable set; when that git gives no credential, stdout is
  empty; no other refusal runs it; a helper run with the variable set refuses.
- **C4:** `gh` mode runs with the app's token on an installed repo of another
  account, and refuses `install/none` without running `gh`.
- **C5:** setup and refresh keep the owner's lines, with and without the
  marker and with CRLF endings; they refuse a credential, url, http or include
  section there; the install's verdict ignores the owner's lines, flags such a
  section and still sees a changed pact line; under real git, a
  `git config --global` write lands below the marker.
- **C6 (T2):** with the guard on, a `git` write to a github.com repo of any
  owner is guarded; a non-GitHub host passes; `gh` writes are scoped as
  before.

## S3 Tickets, route and boundaries

- **Route:** the sensitive route (credential selection and token minting),
  thorough, cut in two.
- **T1:** `claude/tools/gh-app.mjs`, `gate/install-core.mjs` (the gitconfig
  text and verdict), their tests, `agent-identity.md`, the threat model. No
  guard line.
- **T2:** stacks on T1. `claude/guard/guard.mjs` (S1.5) and its tests,
  0010's scoping text, `agent-identity.md`'s scoping paragraph, and the
  guard's lines in the threat model and `install.md`. It
  shares no lines with the guard fix running beside it
  (`hasClosingDelimiterAfter`, `buildGitDenyReason` and its two call sites,
  the end of `guard.test.mjs`).

## S4 Rollback

Revert the merge, then run `gh-app.mjs refresh --provider <p>`: the older
helper writes the gitconfig without the marker and keeps nothing below it, so
copy the owner's lines out first. Cached "not installed" entries hold no token
and age out in ten minutes; `forget` clears them at once.

## S5 What T2 leaves open

A plain `gh` write to another owner's repo where the app is installed still
goes out as the owner's login: `gh-app.mjs gh` works there, and nothing
enforces it. Enforcing it is a follow-up: the guard would read the helper's
remembered "not installed" answers and deny every other github.com `gh`
write.
