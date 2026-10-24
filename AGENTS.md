# AGENTS.md — the-pact

This repo holds the pact: [`claude/CLAUDE.md`](claude/CLAUDE.md) and the
agents in [`claude/agents/`](claude/agents/), which install into `~/.claude/`
and govern every project. `claude/` is a payload: once installed, an edit
there changes every session in every repo. This file governs only changes to
this repo; [`docs/reference.md`](docs/reference.md) says what is here.

## Installing

- **Edit the repo copy, never the live file** in `~/.claude/`, and never copy
  files there by hand.
- **Dry run first,** from the repo root, on Node 24 or later, with
  `NODE_OPTIONS` cleared: `$env:NODE_OPTIONS = $null; node gate/install.mjs`
  in PowerShell, or `env -u NODE_OPTIONS node gate/install.mjs` in a POSIX
  shell. Show the owner the dry run; on drift, stop and ask. Post only its
  verdict and counts, as for any review-folder file.
- **Apply only on the owner's go-ahead in chat,** with the apply command the
  dry run printed, and check that it exits zero.
- **Before rolling back,** run the four checks in
  [Rolling back](docs/agents/install.md#rolling-back), before any checkout;
  if one fails, never run its installer: stop and ask. Configuration, tools,
  project installs: [install](docs/agents/install.md).

## mise

- **Never mark a project's mise config trusted, by any means,** without the
  owner's word in chat: `mise trust`, the `trusted_config_paths` setting or
  `MISE_TRUSTED_CONFIG_PATHS`, safe mode (`MISE_SAFE`) in a project folder, an edit to mise's
  global or system config, or `paranoid` off. A trusted project config can
  fetch tools and run hooks as root in a cloud session
  ([ADR 0088](docs/adr/0088-the-cloud-setup-installs-a-pinned-verified-node.md)).

## Running the gate's tests

- **One runner, three tiers,** from the repo root with `NODE_OPTIONS` cleared:
  `$env:NODE_OPTIONS = $null; node gate/tests/run.mjs <tier>` in PowerShell,
  or `env -u NODE_OPTIONS node gate/tests/run.mjs <tier>` in a POSIX shell.
  `full` is the full suite; `fast` leaves out the install tests; `changed`
  adds what your change can reach (`--base <ref>`, `--list`).
- **Local runs go through athanor by default** (the owner's Docker test
  runner, in a Linux container): `athanor run` runs `full`, and
  `athanor run fast` runs `fast`. Run on the host only for `full` before an
  install, for a quick `changed` pick, or when athanor can't run.
- **A hook holds you to that** (`.claude/settings.json`, ADR 0104): while
  `athanor --version` works, it refuses a host `fast` or `full` run. For the
  two host cases, add `--host-fallback='<reason>'` to the same command,
  quoted so PowerShell keeps it one argument: a short reason in your own
  plain words (no path, token or pasted error text). Say in your report that
  you used the fallback. The runner prints the reason.
  [The hook](docs/agents/gate-tests.md#the-hook).
- **While building, run `athanor run fast`.** For a quick pick on the host,
  run `changed`:
  `$env:NODE_OPTIONS = $null; node gate/tests/run.mjs changed` in PowerShell, or
  `env -u NODE_OPTIONS node gate/tests/run.mjs changed` in a POSIX shell.
- **The full suite runs** at Test, by CI's two jobs on the reviewed head; and
  locally before an install (on the host), after a rebase or merge that
  brought in other work, and after a final change set (through athanor).
- **Test evidence is CI's two jobs,** `gate` and `gate-windows`, passing on
  the reviewed head, so push the branch and open a draft PR before Test. The
  Test record cites both run links and each run's commit, which is the head.
  Before any push, read every commit it publishes for a secret, a personal
  detail, or this machine's paths and names. Push without asking only off the
  sensitive route, when the security pair isn't due or offered, and when the
  diff leaves `.github/`, the lockdown test (`gate/tests/workflow.test.mjs`),
  `.claude/settings.json` and `.claude/hooks/` alone. Otherwise squash to one
  commit and wait for the owner's answer to
  the pair's offer and, when the pair runs, for its read of that local
  commit, which comes before the push and the rest of Test; a diff held back only by those paths
  may go on the owner's word instead, and a decline of the
  offer never frees it. Push only the commit the
  pair's report names; a later change waits for its follow-up read or the
  owner's word. Details: [gate tests](docs/agents/gate-tests.md).
  A `changed` run is never Test evidence.
- **A run passes only** when it exits 0 and its last line is the runner's
  result line ending in `pass`.
- **Post test output only from record mode** (`--record <file>`); read a
  `changed` record's `pick:` and `unmapped:` lines first. Keep raw reporter
  output, such as a junit file, outside the repo.
- **An athanor run** needs athanor at commit `4121c28` or later; an older
  copy exits 125 asking for a `package.json`: ask the owner to update it, and
  run on the host meanwhile. It passes when athanor exits 0 and the runner's
  result line, the last but one, ends in `pass`. It is never Test evidence,
  and nothing from it is posted. [Athanor](docs/agents/gate-tests.md#athanor).
- Tier picks, and writing a gate test: [gate tests](docs/agents/gate-tests.md).

## In the same change

- After a change to `claude/`, `familiars/` or the templates, run
  `$env:NODE_OPTIONS = $null; node cloud-sessions/gen.mjs` in PowerShell, or
  `env -u NODE_OPTIONS node cloud-sessions/gen.mjs` in a POSIX shell. Read
  every change to `cloud-sessions/` closely: it is published and runs as root.
- After a change to the pact text, the renderer's lists, the example blocks
  or a preset, run `node builder/build.mjs` to refresh
  [`builder/scriptorium.html`](builder/scriptorium.html).
- After a change to the pact text, the builder or
  `builder/presets/level-3-full.json`, run `node builder/default-config.mjs`
  to refresh [`builder/default-config/`](builder/default-config/), the
  pact's default configuration.
- Keep in step: `docs/install.md` with the install's output, settings and
  agents; the README's figures (`node docs/img/build.mjs`), prose and
  `docs/reference.md` with the tiers, lenses, models, sensitive-work default
  and roster; `docs/threat-model.md` with any defence it names.

## Reviewing a change here

- Work here takes the pact's tiers and sensitive route, as in any project
  ([ADR 0072](docs/adr/0072-this-repo-has-no-security-route-of-its-own.md)).
- **A change to the default** (`builder/presets/level-3-full.json`,
  `builder/default-config/`, `builder/default-config.mjs`, the installer's
  choice of the default, or `cloud-sessions/pin-floor`, the lowest pact commit
  the cloud wrapper accepts, which #183 T4b adds) takes the sensitive route
  with the security pair: it changes the security defaults of every install
  with no configuration. This is the one exception to ADR 0072 (ADR 0094).
- Each check a change adds or tightens in the gate's code (`gate/` but its
  tests, `.github/workflows/`, `.github/dependabot.yml`) needs a bad case it
  is seen to catch. Deleting or loosening a check, or changing a built-in
  default that bounds anything, is a spec change. The QA pair reads every
  change to the gate's tests at Test; such a change is never one line.
- **`.claude/settings.json` and `.claude/hooks/` run in every session**
  opened here, cloud sessions included, before the permission check: a
  change to either takes effect on the next shell call. Read every change to
  them closely, as for `cloud-sessions/`. Settings you save from Claude Code
  for this repo go to local scope, `.claude/settings.local.json`, never to
  `.claude/settings.json`.
- **The protected set** (the offers paragraph, the sensitive-work default and
  the security lenses' carried rules) is cut or weakened, and the lens roster
  changed, only by a spec change read by the spec pair and the security pair.
  Full text, and probes: [changing rules](docs/agents/changing-rules.md).

## The tracker

- Issues on `mephistopheles4/the-pact`, with `-R`. Assign the one you take
  (`gh issue edit <n> --add-assignee @me`); unassign if you stop.
- **Before you read or post to the tracker, act on its text, or check out or
  run a PR,** read
  [whose text counts](docs/agents/issue-tracker.md#whose-text-counts).
- A security escape row holds only the lens, the review's link and a
  placeholder until the fix ships.
- Sessions on one chain read
  [parallel sessions](docs/agents/parallel-sessions.md) before claiming.

## Closing out

- Plans and reviews live on the issue. The PR body opens with the template's
  checkbox line, word for word, then `Tests: +<added> −<cut>`.
- One ADR per lasting decision and one dated log, each indexed, merge with
  the PR. More: [work records](docs/agents/work-records.md).

## Agent skills

### Issue tracker
GitHub issues, via `gh`: [issue tracker](docs/agents/issue-tracker.md).
### Triage labels
The five canonical roles: [triage labels](docs/agents/triage-labels.md).
### Domain docs
Single-context, [`CONTEXT.md`](CONTEXT.md) and [`docs/adr/`](docs/adr/):
[domain](docs/agents/domain.md).
