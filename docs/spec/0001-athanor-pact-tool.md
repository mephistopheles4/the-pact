# Spec: athanor as an opt-in pact tool, with its guard hook — V1

Status: draft, reviewed (two rounds). The owner has settled the design
questions (S2). The spec counts once it is on `main`.

<!-- toc -->

- [S1 Objective](#s1-objective)
- [S2 Decisions](#s2-decisions)
- [S3 Terms](#s3-terms)
- [S4 The switch and the owners list](#s4-the-switch-and-the-owners-list)
- [S5 The pin and the npm install](#s5-the-pin-and-the-npm-install)
  - [The pin](#the-pin)
  - [Where npm comes from, and how it runs](#where-npm-comes-from-and-how-it-runs)
  - [The dry run](#the-dry-run)
  - [The apply](#the-apply)
- [S6 Admitted repos](#s6-admitted-repos)
- [S7 Not set up is fine](#s7-not-set-up-is-fine)
- [S8 Reading files from a repo](#s8-reading-files-from-a-repo)
- [S9 What the guard refuses](#s9-what-the-guard-refuses)
- [S10 Settings, seam A and the cloud copy](#s10-settings-seam-a-and-the-cloud-copy)
- [S11 Retiring the repo copies](#s11-retiring-the-repo-copies)
- [S12 The door to other people's tools](#s12-the-door-to-other-peoples-tools)
- [S13 Threat model](#s13-threat-model)
- [S14 Trade-offs](#s14-trade-offs)
- [S15 Target environments](#s15-target-environments)
- [S16 Acceptance claims](#s16-acceptance-claims)
- [S17 Rollback](#s17-rollback)
- [S18 Tickets](#s18-tickets)
  - [Needs the owner](#needs-the-owner)
  - [Stop and ask when](#stop-and-ask-when)
- [S19 Out of scope (deferred)](#s19-out-of-scope-deferred)

<!-- /toc -->

## S1 Objective

athanor, the owner's Docker test runner, becomes a pact tool the owner turns
on with one switch. With the switch on:

- the pact installs athanor from npm, at an exact version whose bytes it
  checks;
- it installs one guard hook, which holds host test runs to athanor in each
  repo the owner has admitted.

With the switch off, the install renders and writes exactly what it does
today.

Why: the pact, grimoire, athanor, stacks and aymandiab.com each keep their
own copy of the guard, and the copies drift. Today only the pact's copy
reads node's options and wrappers. With one guard that ships with the pact,
a fix lands once.

Who uses it: the owner, through Scriptorium and the home configuration, and
every local session the owner runs.

## S2 Decisions

The owner settled these design questions:

1. The guard's source lives in the pact (`claude/hooks/athanor-guard.mjs`),
   not in the npm package.
2. A host test run is one of the commands in the repo's own `athanor.json`,
   read as data. The pact's extra refusal of a host `changed` run is dropped;
   the written rule still covers it.
3. A direct `node --test` is refused only when it names the folder of an
   `athanor.json` command's script. A bare `node --test` passes (ADR 0104).
   The wrappers and valued options on `main` at d708d88 stay.
4. `--host-fallback=<reason>` stays the named way out.
5. "Set up" means athanor can really run here (S7).
6. When a repo isn't set up, the call goes ahead with one line, never with
   an explicit allow.
7. The pin is an exact version plus its integrity hash, bumped only by a PR.
   The apply checks the bytes and installs with scripts off.
8. Provenance is checked when a pin is set or bumped, in review.
9. The switch is a user setting, like `agent-identity`.
10. This work retires only the pact's own copy. The other repos' copies
    follow in their own trackers.
11. The door for other people's tools is named, not built.

The session took these further picks from review and logged each one as a
checkpoint:

- The guard acts only in repos whose `origin` belongs to an owner on a home
  list (S6), so a stranger's clone can't turn it on.
- The hook runs nothing that npm installed. It reads the version as data.
- The registry is pinned to `https://registry.npmjs.org/`.
- An athanor that comes earlier on PATH gets a dry-run warning; it doesn't
  make a repo "not set up". Under mise, the npm global install is reached
  through mise's own shim, so a stricter check would never pass on the
  owner's machine. Owner action and T4's end-to-end check cover the gap.
- Retiring this repo's copy and the end-to-end run move to a fourth ticket,
  T4, which follows the install.

## S3 Terms

- **The switch:** the user setting `athanor`, `on` or `off`. A missing key
  means off.
- **The owners list:** the home configuration's `athanor-owners`, a list of
  GitHub account names. A missing key means an empty list.
- **The pin:** the package, exact version, sha512 integrity and registry of
  the athanor release the pact installs. It lives in `gate/athanor-pin.json`.
- **Admitted:** a repo whose `origin` owner is on the owners list (S6).
- **Set up:** an admitted repo where athanor can really run (S7).
- **The guard:** `claude/hooks/athanor-guard.mjs`, installed to
  `pact/hooks/athanor-guard.mjs` under the Claude home folder while the
  switch is on.

## S4 The switch and the owners list

- **The switch.** `athanor on|off` is a user setting, off by default, in the
  same family as `agent-identity`.
  - The renderer reports it as `VALUE athanor on|off`; no line means off.
  - It is not a name on the home `tools` list, which refuses `athanor`
    (`config-tools`).
- **The owners list.** `athanor-owners` holds 0 to 20 unique GitHub account
  names, each `[A-Za-z0-9-]{1,39}`.
  - It enters the configuration digest.
  - A bad value refuses (`config-athanor-owners`).
  - The install copies it into its record, where the guard reads it (S7).
- **Who can set them.** A project configuration may not set either key
  (`project-key`). A preset or shared builder file that holds either one is
  refused the way one holding `tools` is refused today, through the
  builder's preset check. The cloud copy passes the switch off, from a
  frozen value, and carries no owners list.
- **The combinations:**
  - **Neither key:** the render is byte for byte what it is today.
  - **Switch on with an empty list:** allowed. The dry run warns: "athanor
    on, no owners listed: the guard acts nowhere".
  - **A list with the switch off:** allowed. The list enters the digest and
    renders nothing. The dry run warns that the list has no effect.
  - **Switch on:** the rendered hash changes, so the `--apply` go-ahead binds
    the choice the dry run showed.
- **Scriptorium.** A box in "Pact tools" and an owners field beside it. Each
  is left as it is until it is set on the page. Unticking drops the key; it
  never writes `athanor: off`. The box's description reads: "Downloads
  athanor from npm, and adds a hook that runs before every shell call to
  hold test runs to athanor in your listed owners' repos."
- **No rules-file text.** The guard's refusal carries the way out.

## S5 The pin and the npm install

### The pin

`gate/athanor-pin.json` holds:

`{ "package": "@mephistopheles4/athanor", "version": "<x.y.z>", "integrity": "sha512-<base64>", "registry": "https://registry.npmjs.org/" }`

- The version is exact semver: no range, no tag, no `latest`. The registry
  is `https:`. Any other shape refuses (`athanor-pin`).
- **Setting or bumping the pin is a PR** that changes only the pin, read
  closely by the security pair. The PR's record cites npm's provenance
  attestation for that version. The attestation must:
  - name `github.com/mephistopheles4/athanor`;
  - have a subject digest whose bytes equal the pin's integrity, compared
    after decoding (one is hex, the other base64);
  - name the workflow file and source commit.
- The first pin, set in T1, follows the same rule. T1's record also states
  which request headers the npm that ships with the target Node sends,
  taken from npm's source (S13).
- Together, the hash and this review-time check are the whole control on
  the bytes. The install does not check provenance.

### Where npm comes from, and how it runs

- **npm runs from the install runner** as
  `process.execPath <npm-cli.js> ...`, with no shell.
  - `npm-cli.js` is the one beside the Node that runs the install:
    `<node dir>/node_modules/npm/bin/npm-cli.js` on Windows, and
    `<node dir>/../lib/node_modules/npm/bin/npm-cli.js` elsewhere.
  - If that file is missing, or isn't a regular file, the install refuses
    (`athanor-npm`).
- **Its environment.** The bootstrap keeps its `KEEP` list as it is. It also
  hands the runner a second, separate list, which only npm calls receive:
  - `APPDATA` and `LOCALAPPDATA` on Windows, which npm needs for its global
    prefix;
  - `HTTPS_PROXY`, `HTTP_PROXY` and `NO_PROXY`, when they are set.
  So git and every other child the runner starts get exactly what they get
  today. npm gets `KEEP` plus that list, with no `npm_config_*` (in any
  case), no `PREFIX` and no `NODE_OPTIONS`. The dry run and the apply use
  the same environment. This is a change to `gate/install.mjs`, read
  closely, and C20 is the bad case that shows it.
- **Its working folder** is a fresh, empty temp folder.
- **Every call passes:**
  - `--registry <the pin's registry>`;
  - `--@mephistopheles4:registry <the same>`;
  - `--ignore-scripts`;
  - `--no-audit` and `--no-fund`;
  - `--cache <a folder inside the temp folder>`.

  The install writes no `.npmrc`. npm still reads the owner's user npmrc,
  which may hold a token for that registry. The token goes only over
  `https:`.
- **Output.** The install parses npm's and athanor's output where a step
  needs a value, and never prints it. Every npm failure is one fixed
  refusal (`athanor-npm-failed`) that carries no text from npm. The one
  exception is the global prefix the dry run shows. It must be an absolute
  path with no control or hidden characters; otherwise the run refuses
  (`athanor-npm-failed`).
- **The test seam.** The path to `npm-cli.js` is a parameter of an imported
  function, which tests call directly, as `gate/tests/install-harness.mjs`
  does. No command-line flag and no environment variable reaches it (C19).
  The tests never touch the network. They use a fake `npm-cli.js` and a
  local tarball.

### The dry run

With the switch on, the dry run prints an `athanor:` block:

- the pin: package, version, integrity and registry;
- the action: `install`, `keep`, `upgrade` from the recorded version, or
  `remove`;
- the global prefix, from `npm prefix -g` (read-only) under S5's
  environment;
- the owners list, and S4's warnings about it;
- a `WARN` when the pinned package's `package.json` is already at the prefix
  with no record entry. The apply then installs over it and records it;
- a `WARN` for each `athanor` that comes before the pinned install on PATH,
  naming its path;
- a `WARN` that reads: "the athanor switch adds a hook that runs before
  every shell call, in every session, reads the git config and athanor.json
  of the repo it runs in, and checks Docker".

`keep` means three things agree: the record's version and bin match the pin,
and the bin's `package.json`, read as data, gives that version. The dry run
fetches nothing.

### The apply

The apply runs only on the owner's go-ahead, with the command the dry run
printed. That go-ahead is a hard stop. No apply turns the switch on before
T3 has merged.

**Before the backup.** These steps run inside the checks' time limit and
touch only the temp folder.

1. Run `npm pack <package>@<version> --pack-destination <temp>/pack`.
2. The pack folder must hold exactly one regular file. Hash it with sha512
   and compare it with the pin's integrity. On any difference, refuse
   (`athanor-integrity`).
3. Read `package/package.json` from the checked tarball. Use Node's
   built-ins only: `node:zlib` to gunzip, and a reader for ustar headers
   that takes that one entry, at most 64 KiB. Refuse (`athanor-manifest`)
   unless all of these hold:
   - `name` and `version` equal the pin;
   - `bin` is exactly `{ "athanor": "bin/athanor.mjs" }`;
   - it declares no `dependencies`, `optionalDependencies`,
     `peerDependencies` or `bundleDependencies`;
   - it declares no install-time `scripts` (`preinstall`, `install`,
     `postinstall`, `prepare`).

**The first write after CHECKS DONE.** It has its own 120 s limit. The
runner enforces the limit by killing npm's process tree.

4. Run `npm install -g <the checked tarball path>`. For `remove`, run
   `npm uninstall -g <package>`.
5. Read the installed `package.json` under the global prefix as data. It must
   give the pin's version and the same `bin`. Otherwise run
   `npm uninstall -g <package>`, then refuse (`athanor-version`).
6. Record `athanor: { version, integrity, prefix, bin, owners }` in
   `.pact-install.json`, where `bin` is the absolute path of
   `bin/athanor.mjs`.
7. Delete the temp folder.

**What the outcome lines say.** After step 4, no outcome line says "Nothing
was changed": not a refusal, not a timeout, and not a crash of the runner,
including the bootstrap's own crash line. Each one names the npm change:
"athanor <version> may have been installed globally (or removed) before
this; the next dry run shows it". The dry run's unrecorded-install `WARN`
finds whatever a failed run left behind.

**Switching off** runs step 4's uninstall only when the installed
`package.json` gives the recorded version at the recorded prefix. If it
doesn't, the install leaves athanor where it is, prints a `WARN`, and clears
the record entry. A newer pin on an unchanged switch is an `upgrade`,
through steps 1 to 7. A `keep` apply runs no npm command.

**Refusals before any write:**

- no npm (`athanor-npm`);
- no network, or a registry error (`athanor-npm-failed`).

## S6 Admitted repos

The guard acts only in an admitted repo. Elsewhere it stays silent and runs
no probe.

A repo is admitted when its `origin` URL's owner is on the owners list. The
guard reads that URL as data and never runs git, because a clone's git
config can run code. It finds the URL in four steps:

1. The project folder is `CLAUDE_PROJECT_DIR`. When that is unset, it is
   the hook's working folder.
2. `.git` in that folder is either a folder, or a file whose one line reads
   `gitdir: <path>` (a worktree). For a worktree, follow that line, then the
   `commondir` file in the folder it names. Each pointer must be an
   absolute local path: a drive letter with a backslash or slash on Windows,
   or a path starting with `/` elsewhere. A UNC path, a device path
   (`\\?\`, `\\.\`), a drive-relative path or a relative path means "not
   admitted".
3. In the folder those steps reach, read `config`, and find the `url` line in
   its `[remote "origin"]` section.
4. Parse the URL. Its host must be exactly `github.com`, in one of these
   forms:
   - `https://github.com/<owner>/...`
   - `ssh://git@github.com/<owner>/...`
   - `git@github.com:<owner>/...`

   The owner is the first path part, compared without case.

Each file is read under S8's file rules. Any other shape means "not
admitted".

## S7 Not set up is fine

In an admitted repo, the guard refuses only when athanor can really run
there. All of these must hold:

- **The installed athanor:** the record names a `bin` that exists as a regular
  file, and its package's `package.json`, read as data, gives the recorded
  version.
- **PATH has no empty or relative entry,** as on `main` today. With one, a
  bare `athanor` could resolve inside the repo.
- **Docker answers** `docker version --format {{.Server.Version}}`:
  - The `docker` program is found on PATH's absolute entries only, as a
    `.exe` on Windows, and run by absolute path with no shell.
  - Its working folder is System32 on Windows and `/` elsewhere. On Windows,
    `NoDefaultCurrentDirectoryInExePath` is set.
  - It runs with the install's `KEEP` list plus `DOCKER_HOST`,
    `DOCKER_CONTEXT`, `DOCKER_CONFIG`, `DOCKER_CERT_PATH` and
    `DOCKER_TLS_VERIFY`.
  - It has a 5 s limit, which kills its process tree.

The hook runs nothing that npm installed. Docker is its only child process,
and it starts only after a segment has matched S9. The hook keeps its 15 s
timeout.

The guard reads the record, the owners list included, at
`<hook folder>/../../.pact-install.json`, under S8's file rules. So a
non-default Claude home works.

**When a matched call is not set up,** it goes ahead with one line to the
model, sent through `hookSpecificOutput.additionalContext` with no
`permissionDecision`:

`athanor is not set up here (<athanor not installed | PATH has a relative entry | Docker not answering>); this host run goes ahead.`

The owner's permission rules still apply. T2 confirms this in a probe
session on the installed Claude Code version: the line reaches the model,
and the call keeps its normal permission flow. T2's record holds the result.

- If `additionalContext` doesn't reach the model, T2 uses top-level
  `systemMessage` instead, which shows the line to the owner.
- If neither works, T2 stops and asks.

Ticking the box never locks a session out.

## S8 Reading files from a repo

These rules cover `athanor.json`, git's files in S6, and the record. All of
them are read before the permission check.

- Start with `lstat`. Accept only a regular file: no link, no reparse point,
  no device.
- `athanor.json` must sit inside the project folder.
- Open each file once and read at most 64 KiB + 1 byte. A file over 64 KiB
  fails.
- `athanor.json` must be JSON whose `commands` is an object of 1 to 32
  entries:
  - each name is `[A-Za-z0-9_-]{1,32}` (ASCII);
  - each value is an array of 1 to 32 strings, each 1 to 512 characters.
- After S9's wrapper stripping, every command must keep at least two words:
  a program and a script.
- A script's folder may not be empty, `.` or `..`, may not be absolute, and
  may not reach outside the repo.
- Any failure means not set up, or not admitted.
- Paths and words compare part by part, as strings. No regular expression
  is ever built from a file, and nothing from a file is echoed into any
  output.

## S9 What the guard refuses

The guard is a PreToolUse hook on `Bash|PowerShell`, as today:

- it reads the call as data and never runs or changes it;
- it gives no explicit allow;
- it fails open on any error.

It ports the tokenizer and classifier on `main` at d708d88. That covers:

- quotes, heredocs, here-strings, comments, continuations and separators;
- the wrappers: `env` with its options, assignments, `timeout`, `&`, `call`,
  `time`, `mise x|exec [tool@ver] --`, `npx [options]` (with
  `-p`/`--package` taking a value), and `npx node@<ver>`;
- node's options, including those whose value is the next word.

In a set-up repo, a segment is a **host test run** in two cases:

1. **An `athanor.json` command.** With the wrappers stripped, its words
   begin with the words of one of `athanor.json`'s `commands`, stripped the
   same way. Paths compare with either slash, and `node` matches `node.exe`
   regardless of case. In this repo, that means
   `node gate/tests/run.mjs full` and `node gate/tests/run.mjs fast`.
2. **A direct `node --test` over the test folder.** This is node with its
   own `--test` option and a word that names, as whole path parts in either
   slash, one of these:
   - the folder that holds a kind-1 command's script (`gate/tests` in this
     repo);
   - a file or glob under that folder.

A bare `node --test` passes.

**The way out.** A segment that carries `--host-fallback=<reason>` with a
non-empty reason is freed. For kind 2, the flag is one more word after the
files.

**The refusal** is fixed text and carries nothing from the repo:

> Run this through athanor: `athanor run` with the name of the command in this repo's athanor.json that this call matches. When athanor can't run (no Docker, or a run that ends 124, 125 or 137), rerun the same command with `--host-fallback='<reason>'`, the reason quoted so PowerShell keeps it one argument, and short, in your own plain words (no path, token or pasted error text), and say in your report that you used the fallback.

## S10 Settings, seam A and the cloud copy

- **The install's copy set.** `claude/hooks/athanor-guard.mjs` installs to
  `pact/hooks/athanor-guard.mjs` only while the switch is on. Seam A takes a
  new required flag, `--athanor on|off`, the way it takes `--compact`. The
  cloud generator passes `off`.
- **The settings entry.** The guard's entry merges into the home
  `settings.json` by key, as `compact-handoff`'s does:
  - it is a `PreToolUse` group with matcher `Bash|PowerShell`, a `node`
    command, the script's absolute path and a 15 s timeout;
  - the pact finds its own hooks by script path, and the owner's other hooks
    stay;
  - switching off removes only the pact's entry;
  - the record lists the entry under `hooks`, beside `compact-handoff`.

## S11 Retiring the repo copies

- **This repo's copy** retires in T4, after the owner has applied the
  install from `main` with the switch on, and the installed guard has been
  seen to refuse here (C18). T4 deletes:
  - `.claude/hooks/athanor-guard.mjs` and its test;
  - `.claude/settings.json`, which holds only this hook;
  - the `.gitignore` line that lets that file out.

  The gate test that holds the file changes with them. While the switch is
  off, this repo has no guard from then on, and the dry run says so. Today
  the repo copy is silent in cloud sessions and CI, where athanor is missing,
  so nothing is lost there.
- **The other repos' copies** (grimoire, athanor, stacks, aymandiab.com).
  T4's close-out lists one item for each, and the owner picks which to file,
  under the follow-up limit. Until a copy retires, it and the pact's guard
  may both refuse a call. That is harmless.

## S12 The door to other people's tools

The route S5 builds is "an npm pact tool". It has:

- a pin of exact version, integrity and `https:` registry;
- a provenance check at review time;
- a manifest check that allows no dependencies;
- a dry run that shows what will happen;
- an apply on the owner's go-ahead, with `--ignore-scripts`;
- a version check after install;
- a record, and a removal bound to the record.

The tool's output and files are outside input. V1 builds the route for
athanor alone. Each further tool is its own spec on the sensitive route, and
generalising the code waits for the second tool.

## S13 Threat model

**New crossings:**

- **Code that runs:** the npm registry and athanor's publisher, at install
  and at each pin bump.
- **What leaves the machine:** the install's request to the pinned registry.
  It carries the package and version, the request headers T1 confirms from
  npm's source, and any token the owner's npmrc holds for that host. All of
  it goes over `https:` only.
- **Text into a session:** before the permission check, on every shell call,
  the guard reads the repo's git files. In an admitted repo it also reads
  `athanor.json`, which decides which calls it refuses. Its refusal carries
  no text from either.

**Controls:**

- the exact pin, the integrity hash and the manifest check, which hold the
  bytes and forbid dependencies;
- `--ignore-scripts`;
- the `https:` registry pin;
- the owner's go-ahead on `--apply` (a hard stop);
- the provenance check at review;
- the owners list, with a host-anchored URL parse and local-only git
  pointers;
- S8's file rules;
- a hook that runs no npm code and starts Docker only from a fixed folder.

**Residual:**

- **A bad pinned release.** If the owner pins a malicious or compromised
  release, it runs with the owner's rights whenever a session calls
  `athanor`.
- **The repo's own build.** In an admitted repo, `athanor.json` and the
  Dockerfile come from the repo, and an admitted repo includes the owner's
  fork of another project, and an outside PR checked out in it. A refusal
  sends the session to `athanor run`, which builds that Dockerfile with
  network access. athanor's own threat model says it is not a sandbox for a
  repo the owner doesn't trust.
- **A shadowing athanor.** An `athanor` that comes earlier on PATH than the
  pinned install runs instead of it. This fits "What you install and CI
  run".

**The class.** "What you install and CI run" widens to name the pinned npm
athanor and the guard's reads. Widening a class merges only on the owner's
own words in chat (a hard stop). The threat model is at 2998 of its 3000
words, so the edit must cut as many words as it adds.

## S14 Trade-offs

| Pull | Side taken | Driver |
| --- | --- | --- |
| One generic guard vs. each repo's exact cases (the pact's `changed`) | Generic, from `athanor.json` | One fix lands once |
| Admitting repos by owner vs. any repo with `athanor.json` | By owner, at the cost of one setting | A stranger's clone can't steer the guard |
| Global npm install (on PATH) vs. a pact-owned folder | Global; a shadowing athanor gets a warning | Sessions run `athanor` by bare name; mise exposes the global install through its own shim |
| Provenance at every install vs. at review | At review, with the subject digest bound to the pin | The hash binds the bytes; the install fetches only the tarball |
| Refusing when not set up vs. letting the call through | Let it through, with one line | Ticking the box must never lock a session out |

## S15 Target environments

- **The owner's Windows 11 machine.** Node 24 runs under mise, with Docker
  Desktop. npm's global prefix there is mise's own Node folder, not
  `%APPDATA%\npm`, and mise's shims expose the global install after
  `mise reshim`.
  - A Node upgrade under mise moves the prefix, so the next dry run shows an
    `install` and a stale record.
  - On other machines, Node's own installer gives `%APPDATA%\npm`, which is
    why `APPDATA` is passed.
- **Linux, in CI's `gate` job, and Windows in `gate-windows`.**
- **WSL** has its own Claude home. It is guarded only by its own install
  with the switch on; otherwise it is unguarded, as stated in S19.

## S16 Acceptance claims

**The switch and the owners list**

- **C1** With neither key present, a dry run and an apply render, write and
  record the same bytes as at the base, and run no npm command.
- **C2** Each of these refuses:
  - `athanor` on the `tools` list (`config-tools`);
  - the switch or the owners list in a project configuration
    (`project-key`);
  - either key in a preset or a shared builder file (the builder's preset
    check);
  - a bad owners list (`config-athanor-owners`).

**The pin and the npm install**

- **C3** A pin with a range, a tag, `latest`, an extra key or an `http:`
  registry refuses (`athanor-pin`).
- **C4** With the switch on, the dry run writes nothing, fetches nothing, and
  shows:
  - the pin, the action, the prefix and the owners list;
  - the hook `WARN`;
  - each of these `WARN`s when its case holds: an empty owners list, an
    unrecorded install at the prefix, another `athanor` ahead on PATH.

  A list with the switch off gets its own `WARN`. A prefix that isn't a
  clean absolute path refuses.
- **C5** Each of these refuses (`athanor-integrity`) before the backup and
  before any `npm install`:
  - a tarball whose sha512 differs from the pin;
  - a pack folder holding more than one file.
- **C6** Each of these refuses (`athanor-manifest`) before any write:
  - a tarball that declares a dependency;
  - an install script;
  - another `bin`;
  - another version.
- **C7** A good apply:
  - installs from the temp folder, with S5's flags and environment;
  - checks the installed `package.json`;
  - records version, integrity, prefix, bin and owners.

  A test asserts the arguments, environment and working folder the fake npm
  received. An `upgrade` from a recorded older version installs the new one
  and records it again. A `keep` apply runs no npm command.
- **C8** An installed version that differs from the pin is uninstalled, and
  the apply refuses (`athanor-version`). Its outcome line names the npm
  change. So do:
  - a refusal planted after step 4;
  - the 120 s limit firing on a hanging fake npm.
- **C9** With no `npm-cli.js`, the install refuses (`athanor-npm`). With a
  failing fake npm, it refuses (`athanor-npm-failed`) and prints none of
  npm's output.
- **C10** Switching off uninstalls only a recorded, matching install. An
  unmatched one stays, with a `WARN`.

**The guard**

- **C11** In an admitted, set-up repo, the guard refuses each S9 kind-1 and
  kind-2 form, across the tokenizer and wrapper cases the test on `main`
  covers. The refusal is S9's text exactly. A named fallback frees both
  kinds. Everything else passes silently, a bare `node --test` included.
- **C12** The guard is silent and runs no probe in each of these repos:
  - a repo whose `origin` owner is not on the list, with the cases covered
    by a worktree, a `.git` file, an SSH URL, a look-alike host, and a
    missing or malformed config;
  - a repo whose git pointer is UNC, a device path, drive-relative or
    relative.
- **C13** In each of these cases a matched call goes ahead with S7's line,
  with no deny and no explicit allow:
  - no installed athanor;
  - a relative or empty PATH entry;
  - no Docker answer.
- **C14** The guard treats the repo as not set up for each of these, and no
  text from the file reaches any output:
  - a malformed, oversized, linked or device `athanor.json`;
  - an empty or wrapper-only command;
  - a bad name;
  - a script folder that is `.`, absolute or outside the repo.
- **C15** A `node`, `docker` or `athanor` program planted in the project
  folder never runs. The test carries over the planted-program test on
  `main`.
- **C16** The guard's settings entry merges by key: the owner's hooks stay,
  and switching off removes only the pact's entry. Seam A's flag works both
  on and off, and a test asserts that the cloud copy passes `off`.

**The test seam and the environment split**

- **C19** No command-line flag or environment variable given to
  `gate/install.mjs` can set the `npm-cli.js` path. A test passes each one,
  and the install either refuses or ignores it.
- **C20** On Windows, the fake npm receives `APPDATA`. Git's environment
  stays exactly the `KEEP` list. A test asserts both, and fails if the second
  list reaches git.

**End to end, retiring and rolling back (T4)**

- **C17** After the retirement:
  - this repo's copy, its settings file, its `.gitignore` line and its test
    are gone;
  - `docs/agents/gate-tests.md`, `AGENTS.md`, `docs/install.md` and
    `docs/reference.md` describe the pact's guard;
  - the `4121c28` requirement becomes the pinned version.
- **C18** On the owner's machine, with the go-ahead at each apply:
  1. the owner sets the switch and lists their account;
  2. a dry run, then an apply from `main`;
  3. `mise reshim` if mise manages Node;
  4. `athanor --version` from a session gives the pinned version;
  5. the guard refuses `node gate/tests/run.mjs fast` here;
  6. switching off, then an apply, removes athanor.

  T4's record cites the run.
- **C21** `docs/install.md`'s rollback section gains the step "switch off,
  apply, then take the keys out" before any rollback past T1. The step sits
  as a documented check, like the existing rollback cases.

## S17 Rollback

An older installer ignores the `athanor` record entry. It also deletes
`pact/hooks/athanor-guard.mjs` while the entry in `settings.json` still
points at it. So a rollback goes in the order `agent-identity`'s does:

1. switch off;
2. apply;
3. take the keys out of the configuration;
4. roll back.

`docs/install.md` documents this as a check, as it does the existing
rollback cases (C21). There is no automated test, because CI's shallow
checkout holds no older installer.

## S18 Tickets

1. **T1: the switch, the owners list, the pin and the npm install.**
   - **Covers:** S4, S5, S10's seam A flag and S17; claims C1 to C10, C16's
     seam A and cloud parts, C19, C20 and C21.
   - **Work:** the builder, renderer, install core, bootstrap and runner; the
     dry run, the record and Scriptorium; the first pin, with its provenance
     and npm-header records; `node builder/default-config.mjs`; a dated log.
2. **T2: the shared guard.**
   - **Covers:** S6 to S9 and S10's settings entry; claims C11 to C16.
   - **Depends on:** T1.
   - **Work:** port the copy on `main` at d708d88, with its test, into
     `claude/hooks/`; the probe-session record; a dated log. It doesn't
     touch `.claude/`.
3. **T3: the threat model and the ADR.**
   - **Covers:** S13.
   - **Work:** an ADR that amends ADR 0104, ADR 0074 and ADR 0039 (the last
     for the npm step after CHECKS DONE), and the threat-model edit.
   - **Order:** it may run beside T1 and T2. No apply turns the switch on
     before it merges.
4. **T4: the end-to-end run and retiring this repo's copy.**
   - **Covers:** S11; claims C17 and C18.
   - **Depends on:** T1, T2 and T3 merged, then the owner's apply from
     `main`.
   - **Merge:** its PR touches `.claude/`.

The work runs at the thorough tier on the sensitive route. The security pair
reads this spec and each ticket's diff.

### Needs the owner

| What | Kind | When |
| --- | --- | --- |
| The first pin's version and its provenance record | checkpoint | in T1's PR |
| Merging T3 (a threat-model class widened) | hard stop | after T3's Test |
| Setting the switch and listing an owner, in Scriptorium | the owner's own config | before T4's apply |
| Each install apply | hard stop | in T4, after T1 to T3 merge |
| `mise reshim`, and moving any athanor the dry run warns about | the owner's own machine | right after T4's apply |
| Merging T4 (`.claude/settings.json`, `.claude/hooks/`) | hard stop | after T4's Test |
| Which other-repo retirement items to file | the owner's pick | at T4's close-out |

### Stop and ask when

- npm can't be started as S5 says, on Windows or Linux;
- the pack and checks don't fit in the checks' time limit;
- neither `additionalContext` nor `systemMessage` reaches anyone (S7);
- the threat-model edit can't fit in 3000 words;
- the published tarball fails S5's manifest check;
- on the owner's machine, a session's bare `athanor` doesn't run the pinned
  version (C18 step 4).

## S19 Out of scope (deferred)

- A second npm tool, and generalising the route's code for one (S12).
- Retiring the other repos' copies here (S11).
- Guarding cloud sessions, CI, or WSL without its own install.
- A registry other than the pinned one, such as a mirror.
- A rules-file part for athanor.
