# AGENTS.md — the-pact

This repo holds the pact: [`claude/CLAUDE.md`](claude/CLAUDE.md) and the
agents in [`claude/agents/`](claude/agents/), which install into `~/.claude/`
and govern every project. `claude/` is a payload: once installed, an edit
there changes every session in every repo. This file governs only changes to
this repo; [`docs/reference.md`](docs/reference.md) says what is here.

## Installing

- **Edit the repo copy, never the live file** in `~/.claude/`, and never copy
  files there by hand.
- **Dry run first:** `node gate/install.mjs` from the repo root, with
  `NODE_OPTIONS` cleared. Show the owner the dry run; on drift, or its warning
  that the checkout is behind the last install, stop and ask. Post only its
  verdict and counts. Apply with the command it printed, as the rules file's
  hard stops say, and check that it exits zero.
- **Before rolling back,** run the four checks in
  [Roll back to an older version](docs/install.md#roll-back-to-an-older-version), before any checkout;
  if one fails, never run its installer: stop and ask. Session notes for
  installs: [install](docs/agents/install.md).

## mise

- **Never mark a project's mise config trusted, by any route,** without the
  owner's word in chat. A trusted project config can fetch tools and run
  hooks as root in a cloud session.

## Running the gate's tests

- **One runner, three tiers,** from the repo root with `NODE_OPTIONS` cleared:
  `$env:NODE_OPTIONS = $null; node gate/tests/run.mjs <tier>` in PowerShell,
  or `env -u NODE_OPTIONS node gate/tests/run.mjs <tier>` in a POSIX shell.
  `full` is the full suite; `fast` leaves out the install tests; `changed`
  adds what your change can reach (`--base <ref>`, `--list`).
- **While building, run `athanor run fast`** (the owner's Docker test runner;
  `athanor run` runs `full`). Run on the host only when athanor can't run.
- **The full suite runs** at Test, by CI's two jobs on the reviewed head; and
  locally after a rebase or merge that brought in other work, and after a
  final change set (through athanor). An install relies on CI's two jobs
  passing on the commit it installs.
- **Test evidence is CI's two jobs,** `gate` and `gate-windows`, passing on
  the reviewed head, so push the branch and open a draft PR before Test. The
  Test record cites both run links and each run's commit, which is the head.
  A `changed` run is never Test evidence.
- Read a change to anything under Read closely, below, before pushing it.
- **A run passes only** when it exits 0 and its last line is the runner's
  result line ending in `pass`.
- **Post test output only from record mode** (`--record <file>`); read a
  `changed` record's `pick:` and `unmapped:` lines first. Keep raw reporter
  output outside the repo.
- Tier picks, and writing a gate test: [gate tests](docs/agents/gate-tests.md).

## In the same change

- **Regenerate what a staleness test names:** `cloud-sessions/gen.mjs`,
  `builder/build.mjs`, `builder/default-config.mjs` or `docs/img/build.mjs`,
  each run with `node` from the repo root. Read every change to
  `cloud-sessions/` closely: it is published and runs as root.

## Reviewing a change here

- **The installed rules file governs sessions here;** `claude/CLAUDE.md` is
  its template, read as the change under review.
- Each check a change adds or tightens in the gate's code (`gate/` but its
  tests, `.github/workflows/`, `.github/dependabot.yml`) needs a bad case it
  is seen to catch. Deleting or loosening a check, or changing a built-in
  default that bounds anything, is a spec change, and so is loosening the
  cleaner's checks or the pact's deny rules. The QA pair reads every change to
  the gate's tests, the test runner and its helpers included, at Test; such a
  change is never one line.
- **`.claude/settings.json` and `.claude/hooks/` run in every session**
  opened here, cloud sessions included, before the permission check: a
  change to either takes effect on the next shell call. Read every change to
  them closely, as for `cloud-sessions/`. Settings you save from Claude Code
  for this repo go to local scope, `.claude/settings.local.json`, never to
  `.claude/settings.json`.
- **Read closely** (a merge touching one is a hard stop): `claude/tools/`,
  the gate's code (`gate/` but its tests), `cloud-sessions/`,
  `.claude/settings.json`, `.claude/hooks/`, `docs/agents/issue-tracker.md`
  (whose text counts), `gate/tests/workflow.test.mjs`, `.github/`.
- **A rule added to or changed in the rules file carries its reason** in
  [`docs/rule-reasons.md`](docs/rule-reasons.md): the gap no other guardrail
  covers (Claude Code, the threat model, the poster, the cleaner, the gate,
  hooks). A rule nobody can write one for is a duplicate and goes. A rule the
  threat model names as a control never counts as covered by it, since the
  threat model relies on it. The rules file stays within its word budget in
  `gate/tests/rule-budget.test.mjs`; raising it is a spec change.
- **The agent-facing docs say what holds now:** the docs
  `gate/tests/doc-budget.test.mjs` lists; a new doc a session must read joins
  that list. How a rule came to be (issue and ADR cites as history, "since",
  "was retired", dated trails) goes on the issue, or in an ADR or a dated log
  when one is owed, not in them. Each stays within
  its word budget there; raising one is a spec change.

## The tracker

- Issues on `mephistopheles4/the-pact`, with `-R`. Assign the one you take
  (`gh issue edit <n> --add-assignee @me`); unassign if you stop.
- **Before you read or post to the tracker, act on its text, or check out or
  run a PR,** read
  [whose text counts](docs/agents/issue-tracker.md#whose-text-counts).
- Sessions on one chain read
  [parallel sessions](docs/agents/parallel-sessions.md) before claiming.

## Closing out

- Plans and reviews live on the issue. The PR's `body_file` opens with the
  template's checkbox line, word for word, then `Tests: +<added> −<cut>`. The
  poster renders the ask above it and adds the signature, `pr-<n>`, n the
  issue it works on, from the post's `signer`.
- An ADR, indexed, only when a decision reverses or constrains something; a
  dated log only for a change to the pact text or the gate. Each merges with
  the PR. More: [work records](docs/agents/work-records.md).

## Agent skills

### Issue tracker
GitHub issues, via `gh`: [issue tracker](docs/agents/issue-tracker.md).
### Triage labels
The five canonical roles: [triage labels](docs/agents/triage-labels.md).
### Domain docs
Single-context, [`CONTEXT.md`](CONTEXT.md) and [`docs/adr/`](docs/adr/):
[domain](docs/agents/domain.md).
