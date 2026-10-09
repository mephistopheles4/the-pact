# AGENTS.md — the-pact

The rules for working **on** this repo. They are not the pact itself: the pact
is [`claude/CLAUDE.md`](claude/CLAUDE.md) and the agents in
[`claude/agents/`](claude/agents/), which install into `~/.claude/` and govern
every project. This file governs only changes to this repo. See
[`README.md`](README.md) for what is here and what never goes in.

Every rule for this repo lives here, whichever agent reads it.
[`CLAUDE.md`](CLAUDE.md) only imports this file, for Claude Code.

## Changes here reach every project

`claude/` is a payload, not documentation. Once installed, an edit there changes
how every session in every repo behaves. So:

- **Edit the repo copy, never the live file.** A direct edit to `~/.claude/`
  drifts from the repo.
- **Install with [`scripts/install.ps1`](scripts/install.ps1)**, run from the
  repo root under PowerShell 7 (Windows, macOS or Linux). Never copy files by
  hand. The script installs from the clone, not through a symlink, so a
  checked-out branch is never live until you install it.
- **Run it without a switch first.** That is a dry run: it prints the files it
  would overwrite, add and delete, whether live files drifted since the last
  install (it compares them with `~/.claude/.pact-install.json`), and the commit
  it would install. If there is drift, stop and ask rather than overwrite.
- **The install is gated.** It stages HEAD's files (never the working tree),
  runs the pact's own check, `gate/seam-a.mjs`, on them under Node 20 or later,
  and copies only the files that check listed. It refuses when the check fails
  or can't run. The dry run also shows the Node it used, the pinned grimoire
  commit, and whether the gate changed since the last install. The gate's
  tests run through one runner; see "Running the gate's tests" below.
<!-- pact:begin install-go-ahead -->
- **Keep the how-to in step.** [`docs/install.md`](docs/install.md) quotes
  the script's output and lists what the settings merge sets. A change to
  either updates the how-to in the same change.
- **Install only on the owner's go-ahead.** Show the owner the dry run, then
  pass `-Apply` only after they say so in chat. `-Apply` refuses on drift or a
  dirty working tree.
<!-- pact:end install-go-ahead -->
- **The script confirms the hashes.** After `-Apply` it re-hashes every live
  file against the bytes it checked and installed: the rendered bytes for the
  rules file, and the repo copy for every other file. It exits non-zero on a
  mismatch. Check that it exited zero.
- **It deletes only pact files:** those the last manifest lists that the repo
  dropped. Your own agents and skills are never touched.
- **Configuration.** The owner's settings live in `~/.claude/pact/config.json`
  (an example is [`examples/pact-config/config.json`](examples/pact-config/config.json)).
  Its edits to open parts take their text from block files in
  `~/.claude/pact/blocks/` (examples are in
  [`examples/pact-config/blocks/`](examples/pact-config/blocks/)).
  The installer reads them, never writes, deletes or lists them, and renders
  them into the rules file. The dry run's Configuration block shows each
  file's hash and whether it changed since the last install, the configuration
  digest, the full rendered hash, and one warning per value set and per part
  edited. When a configuration applies, `-Apply` needs that full rendered hash
  handed back as `-RenderedHash <hash>`, and refuses if it does not match this
  run's render. A pact from before edits (#94) refuses a file that has any, so
  to install such a commit, empty the edit list first.
- **Agent settings.** The file's `agents` key may set any pact lens's
  `model` (`opus` or `sonnet`) and `effort` (`low`, `medium` or `high`); each
  lens's own file holds its default. `scout` is sealed and refused by name.
  The installer renders and installs each set agent's file with those two
  lines changed, and warns about each setting in the dry run. A security-set
  lens set off its default is marked "override, not security-tested" in the
  dry run, the installed notice, every report posted from it and its Lens
  dispositions row (ADR 0027). A pact from before agent settings (#97)
  refuses a file that has an `agents` key, and one from before #97's unlock
  refuses a setting for any lens but `integrity-lens`, so to install such a
  commit, remove the key first.
- **The builder page.** [`builder/scriptorium.html`](builder/scriptorium.html)
  builds a configuration without writing JSON. After a change to the pact
  text, the renderer's lists or the example blocks, run
  `node builder/build.mjs` to refresh it; a gate test fails until you do. A
  person's own builder comes from the `scriptorium` skill in
  `.claude/skills/`. It reads their skills, commands, agents and
  configuration, keeps the result in `~/.claude/pact/builder.json`, and
  renders a page that carries those lists in plain text. Such a page belongs
  outside any repo; `build.mjs` refuses to write one inside this clone.
- **Review output.** To read what a configuration does before installing it,
  add `-ReviewFolder <full path>`. Once every check for the run has passed, the
  script writes `rendered-rules.txt` and `config.diff` (the change from the
  no-configuration render) there. The folder must be new or empty, and outside
  the Claude home folder and any `.claude` folder. Without the switch, a dry
  run changes nothing on disk.
- **Project install.** To make the pact stricter in one repo, add
  `-ProjectFolder <full path>`. It reads the project's
  `.claude/pact-config.json`, which may only set values strictly tighter than
  your own, and writes one rules file, `.claude/rules/pact-project.md`, with a
  record beside it. It installs nothing in the Claude home folder and no
  agents into the project. It refuses a project with no configuration file, a
  project that is or holds your home folder, or is, holds or sits inside a
  Claude folder, any link on its write path, and an existing rules file it has
  no record of writing. Like a home install it is a dry run first, and
  `-Apply` needs the project rules file's full rendered hash, given as
  `-RenderedHash <hash>`. On a project install that hash binds the bytes
  installed, not the configuration files: a file changed after the dry run
  still installs if it renders the same bytes, which can never be looser.

## Running the gate's tests

- **One runner, three tiers.** Run the gate's tests through
  [`gate/tests/run.mjs`](gate/tests/run.mjs), from the repo root, with
  `NODE_OPTIONS` cleared in the shell first, as for the cross script. In
  PowerShell:
  `$env:NODE_OPTIONS = $null; node gate/tests/run.mjs <tier>`
  In a POSIX shell:
  `env -u NODE_OPTIONS node gate/tests/run.mjs <tier>`
  - **`full`** runs every top-level test file. This is "the full suite".
  - **`fast`** runs every test file that doesn't run the install script. The
    runner finds the install tier from each file's imports and text on every
    run.
  - **`changed`** runs `fast` plus the tests your change can reach, and
    prints why it picked each file. It's the only tier that reads git.
    - **The changed paths:** what differs from where your branch left
      `--base` (default: the branch `main`), committed, staged or not, plus
      untracked files git doesn't ignore.
    - **What they pick:** a changed test runs itself, and a changed helper
      runs every test that imports it. A test that names a changed path runs
      too. A payload path also runs the install smoke file. Any change to the
      gate's code runs `full`, and so do more than 2,000 changed paths.
    - **A path no rule maps** is printed as unmapped. `fast` covers it, plus
      the install smoke file for a payload path.
    - **What an agent-file change picks.** The test helpers are split by
      what they touch (ADR 0034), so an agent file picks only the tests that
      read agents: those that import `payload.mjs` or read them themselves.
      Of the install files, that's the smoke set and five others, 6 of 9.
    - **Some changes still cost about a full suite.** The pact's rules file,
      `claude/CLAUDE.md`, is read by nearly every test. A fixture edit, or a
      deleted or renamed test file, is named by the copy list's entry for the
      tests folder, so every install test runs. So is an edit to
      `gate/tests/run.mjs`, which a comment in the copy list names. For such
      a change, check the pick with `--list` first, and run it once rather
      than after every edit.

  All three cap the run at four test files at once, which keeps it from
  starving other sessions (ADR 0029). Never run the suite without the cap.
- **It fails closed.** It hands the Node running it an explicit file list, so
  it needs no glob and works the same in any shell, on Node 20.10 or later (the
  cap flag needs 20.10). An empty pick, an odd test-file name or a usage error
  exits 2 and runs nothing. A failed, killed or unstarted node exits 1. Its
  last line, on stderr, names the tier, the file count and the result.
  `--reporter` takes `spec`, `tap`, `dot` or `junit`, and `--list` prints the
  pick and runs nothing.
- **A run passes only when it exits 0 and its last line is the runner's
  result line ending in `pass`.** An exit 0 with no result line is not a pass.
- **Run the tests on the current Node LTS** (Node 24, "Krypton", as of
  2026-10-08); `volta install node@24` gets it. The install itself still
  accepts any Node 20 or later. The Linux run in a container (#96) is in
  [`gate/tests/fixtures/linux/`](gate/tests/fixtures/linux/) and runs `full`
  on Node 20.
- **While building, run `changed`:**
  `$env:NODE_OPTIONS = $null; node gate/tests/run.mjs changed` in PowerShell, or
  `env -u NODE_OPTIONS node gate/tests/run.mjs changed` in a POSIX shell. Add
  `--base <ref>` when your branch starts from somewhere other than `main`. A
  base that starts with a dash, or one that isn't a commit, exits 2.
- **The full suite runs** once at move 4; before an install; after a rebase or
  merge that brought in other work; and after a final change set. It doesn't
  run before and after each change.
- **A changed-files run is never move-4 evidence.** Move 4's verdict rests on
  `full`.
- **Test output is posted only from record mode.** `--record <file>` writes a
  copy of everything printed to a file outside the repo, with the repo, home
  and temp folders, the user name and the host name replaced by placeholders.
  If a local path or either name survives, it writes nothing and exits 3. Keep
  raw reporter output, such as a junit file, outside the repo.
- **Read a `changed` record before you post it.** Its `pick:` and `unmapped:`
  lines name your changed and untracked files. If one of them shouldn't be
  shared, post a `fast` or `full` record instead.

## Writing a gate test

- **A bad case for a gate module is a row in its table.** A table, from
  [`gate/tests/tables.mjs`](gate/tests/tables.mjs), has a base input that
  passes and rows; a row is one plant on the base and the exact rule ids it
  must fail with. Write the table's name and each row's id as string literals
  in the `table(...)` call, and register its tests in the test file itself,
  at its top level:
  `for (const c of table('<name>', { ... })) test(c.name, c.fn);`. node's
  reports name the file that calls `test()`, and a guard checks the loop. The
  first tables are `render-edits`' edit list and block paths. A file already
  in `fast` converts its loops when a session next changes its cases for
  another reason.
- **How a case runs the module.** In-process, through its core: call
  `runCore` from [`gate/tests/gate-run.mjs`](gate/tests/gate-run.mjs), or
  `renderStage` and `runSeamA`, which use it. Keep a case a child run when it
  varies the environment, plants a copy of the module, or runs under a test
  preload. A test file or helper never imports a fault fixture, the contained
  driver, the import trap, or any other code under `gate/tests/fixtures/`;
  hand a fixture to a child as its `--import` or main script.
- **A case runs the install** only when the install script itself decides it,
  or for a happy path.
- **Each test file holds one layer:** install cases, or cases that never
  install. The install harness fails a test in an install-tier file that
  neither runs the install script nor calls `t.skip()`, naming it (ADR 0033).
  A subtest's installs count toward the test it runs in.
  A test that runs the script without `install()` goes through the harness's
  `spawnInstall`, so it counts. A test that only reads the script's text
  belongs in a file that never installs, and reads it with
  `installScriptText()` from `gate-files.mjs`: a test file that names the
  script is in the install tier.
- **Import helpers by what they touch** (ADR 0034), and take only what the
  test uses. `text.mjs` touches nothing; `tree.mjs` touches the files a test
  names; `gate-files.mjs` reads the gate's own files; `payload.mjs` reads the
  payload, agents included; `gate-run.mjs` runs gate modules; and
  `install-harness.mjs` runs the install. A test that imports `payload.mjs`
  is picked for every agent-file change, so import it only to read the
  payload. A helper touches no file and starts no process when imported; the
  import guard checks every helper. A `makeRepo` mutate that adds a test
  agent routes it with `routeTree`; `install()` fails a routing refusal the
  test didn't name in `unrouted`.
- **Moving or renaming a case.** Every case in the T1 baseline,
  [`gate/tests/fixtures/baseline-140/`](gate/tests/fixtures/baseline-140/), keeps
  a home. A case that changes file, or becomes a table row in its own file,
  gets a line in `moves.tsv` beside the baseline. Move 4's full run, in record
  mode with the junit reporter, goes through the no-loss compare, which must
  exit 0 with its `RESULT: compare pass` line last:
  `$env:NODE_OPTIONS = $null; node gate/tests/baseline-compare.mjs <record>` in
  PowerShell, or `env -u NODE_OPTIONS node gate/tests/baseline-compare.mjs <record>`
  in a POSIX shell.

## Where work lives

- **Work items:** GitHub issues on `mephistopheles4/the-pact`. See
  [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md). `main` was
  first pushed on 2026-09-30. Cite a commit by its short
  hash; GitHub links it only once the commit is on the remote.
- **A session assigns the issue it takes.** When it starts work on an issue,
  it runs `gh issue edit <n> --add-assignee @me`. If it stops before the work
  is done, it removes itself with `--remove-assignee @me`.
- **The assignee is for visibility, not a claim.** Every session
  authenticates as the same GitHub user, so an assignee can't tell "mine, a
  minute ago" from "free". Claims still go by the live-session check and the
  presumed-live hour in the pact's wayfinder rules, in
  [`claude/CLAUDE.md`](claude/CLAUDE.md).
- **Plans:** a plan, its review rounds and its probe records live on the
  issue, as the body and comments. Nothing in the tree holds a plan. A record
  a check can run becomes a test or fixture beside the code it checks.
- **When the work finishes:** each lasting decision becomes one ADR in
  [`docs/adr/`](docs/adr/), with its reasoning. The work itself becomes one
  dated narrative in [`docs/log/`](docs/log/), ending in a **Record** list of
  the issue comments that hold the verbatim plan, reviews and probe records.
  Work that finished before #52 keeps its commit citations. The PR that
  finishes a piece of work carries its log entry and its ADRs, and a session
  doesn't report the work as finished until both are merged. If that PR can't
  carry them, for example a security-set record merged before the narrative
  is written, the session opens a docs PR before it is cleaned up.
- **Every PR carries the close-out checkbox.** GitHub fills a PR from
  [`.github/pull_request_template.md`](.github/pull_request_template.md) only
  in the web UI; `gh pr create --body` skips it. So a session that opens a PR
  from the CLI makes the template's checkbox line the first line of its
  `--body`, copied word for word. It ticks the box when the PR finishes the
  work, and leaves it unticked otherwise.
- **Finding a decision or a log:** start from the indexes,
  [`docs/adr/README.md`](docs/adr/README.md) and
  [`docs/log/README.md`](docs/log/README.md), one line per file. Add a line
  there with every new ADR or log entry; `gate/tests/docs-index.test.mjs`
  fails when one is missing.
- **Vocabulary:** [`CONTEXT.md`](CONTEXT.md), created when a term first needs
  pinning down. See [`docs/agents/domain.md`](docs/agents/domain.md).

## Testing a change to an agent or a rule

Size the evidence to the cost of being wrong. When a session misbehaves after a
rule change, the usual cost is one wasted session that the owner restarts. So a
change to an agent or a rule is proved by use by default. A planted probe, seen
to fail, is required only on the floor below, where a miss is expensive or
silent.

The words below come from #35, the review lenses. A lens is a reviewer agent
that asks one question from one angle. A lens review is one run of lenses on
real work. A practice case is a planted input for one lens, with its expected
result written down first. The security set is the few practice cases that
still run for real, because the risk floor requires it. A security-set lens is
either lens of the security pair, the reviewers the security route names, or
any other lens that holds a shell or network tools, or guards the security
route or the risk floor. The security set covers every security-set lens, so
each such lens has cases in it. A bad report is a ready-made report that gets
a practice case wrong; it is scored, not run, and must score FAIL. The
standing measures are the numbers recorded at every lens review on real work.
A periodic review is the owner's recurring look at the standing measures,
which can add, merge, cut or retune lenses. A gated clause is a block the
install gate holds word for word; its canonical text is in `gate/clauses/`.
The risk floor and the security route are the pact's, defined in
[`claude/CLAUDE.md`](claude/CLAUDE.md).

### Which changes need a probe

Where two bullets apply, the stricter one holds.

- **A change to the risk floor, the security route, a gated clause, anything
  in the protected set below, any security-set lens, or a change to this
  section, "Testing a change to an agent or a rule", that loosens a rule on
  this floor, still needs a planted probe that is seen to fail.** A change to
  a security-set lens reruns that lens's whole security set and rescores
  every bad report before the change is relied on.
- **The same holds for any agent that is not a lens,** when it holds a shell
  or network tools, or guards the security route or the risk floor; for the
  install gate's tool allow-list, `gate/tool-allowlist.json`; and for the
  settings guard, `gate/settings-allowlist.json` and
  `claude/settings.overlay.json`.
- **The gate's code also needs its own tests, on top of any probe above.** The
  gate's code is every file in `gate/` but its tests, and
  `scripts/install.ps1`. Every change to it takes the security route. Each
  check a change adds or tightens needs a bad case in the gate's tests that it
  is seen to catch. Deleting or loosening a check, or changing a built-in
  default that bounds anything above, counts as a change to what it bounds.
  One example is the tools an agent gets when the allow-list has no entry for
  it. Another is the renderer's list of agents a configuration may set:
  adding an agent to it is a spec change, and on this floor.
- **The test runner and the copy list are on this floor too,** though they sit
  in the gate's tests: `gate/tests/run.mjs` and `gate/tests/copy-list.mjs`,
  with the tests that hold their bad cases, `gate/tests/run.test.mjs` and
  `gate/tests/run-guards.test.mjs`. A change to any of them takes the
  security route and needs a bad case in the gate's tests that it is seen to
  catch; weakening or deleting a bad case counts as a change to what it
  guards. That covers the tiers and how they
  are picked, the exit handling, how the runner starts node (the binary, its
  flags and its environment) and record mode, so "the full suite" can't be
  narrowed by an ordinary test edit.
- **The table module and the no-loss compare are on this floor too:**
  `gate/tests/tables.mjs` and `gate/tests/baseline-compare.mjs`, the baseline
  `gate/tests/fixtures/baseline-140/baseline.tsv` and its two lists beside it,
  `env-cases.tsv` and `reporter-names.tsv`, with the tests that hold their bad
  cases, `gate/tests/tables.test.mjs` and `gate/tests/baseline-compare.test.mjs`.
  The same rules hold as for the runner. Weakening the table module could let
  a row pass for the wrong reason, and weakening the compare or its lists
  could hide a lost case. The map of moves, `moves.tsv`, is not on the floor:
  its lines change with every move, and the compare bounds what a line can do.
- **The in-process runner and its two guards are on this floor too:** the
  runner's module `gate/tests/gate-run.mjs`, with its tests
  `gate/tests/gate-run.test.mjs`; the parity guard,
  `gate/tests/parity.test.mjs`; and the fault-fixture guard,
  `gate/tests/fault-fixtures.test.mjs`. The same rules hold as for the
  runner. Weakening the in-process runner could let every in-process case
  pass, and weakening a guard could let in-process cases drift from what the
  install runs.
- **Everything else is proved by use.** That means the repo's tests and gates
  pass, a reviewer reads the change at move 4, and the standing measures are
  recorded where they apply. Any other edit to this section is also proved by
  use.
- **Depth is the owner's dial.** The owner may ask for a planted probe, or a
  closer look, on any change, at triage or in chat. Silence means the default
  above. Nobody can go below the floor.
- **Doubt.** When it is unclear whether a change is on the floor, it is on the
  floor. Doubt about anything else falls to the default.

### Running a probe

A probe's record lives on the issue, as comments. When the work finishes, the
probe's results go in the work's log entry in [`docs/log/`](docs/log/), and its
Record list cites the comments that hold the verbatim record.

- **Post the expected result on the issue before running the probe.** Never
  edit it after a run; post a correction as a new comment.
- **Run it after installing, in a fresh session.** A fresh session starts
  with a clean context: it holds no earlier instructions and no memory of the
  change, and its record shows only the probe.
- **Run a rule probe in an interactive session, not through `claude -p`.** A
  headless run has no human to approve anything, which changes what the model
  does: the 2026-09-29 P5 probe failed headless and passed interactively. See
  [its log entry](docs/log/2026-09-29-hand-over-the-trigger.md).
- **Don't hand the agent the rule under test as evidence.** It may then apply
  what it read rather than its own definition.
- **A probe's pass counts only once the probe has been seen to fail** — a
  control run, or a planted bad case that it catches.
- **Record every run, pass or fail, with the agent's report verbatim.** Post
  each run on the issue.

### The protected set

These rules come from #35's spec, which is deleted when that work closes, so
they live here to outlive it. No periodic review may cut or weaken:

- **The gated clauses, the security route and the risk floor.**
- **The thorough-only rule for security reports, the "not verified" mark, the
  not-checked lists and the fail-closed checks.** Under the thorough-only
  rule, the script that checks lens reports refuses a report from either lens
  of the security pair at any tier but thorough.
- **The security set's contents, and its rerun after a model change.** The
  rerun binds the pact's shipped defaults: a change to a shipped agent file's
  model or effort reruns that lens's set. A person's configuration override is never
  run there, so it carries the mark "override, not security-tested" (ADR 0027).
- **The per-lens tool allow-list:** no lens gains a tool.
- **The security lenses' carried rules:** a secret named by location, never
  by value; no working exploit or payload; checklists carried in the lens,
  never fetched; fetched pages treated as untrusted data; a missing tool never
  rebuilt through the shell. Here a security lens is any security-set lens.

A proposal touching any of them, and any change to the roster of lenses, comes
back as a spec change, read by both the plan review and the security review.
**A low finding rate alone is never a reason to cut a security-set lens:**
security reads are clean most of the time, so the measures would otherwise
keep pointing at them.

## Agent skills

Configuration for the optional [engineering skills](https://github.com/mattpocock/skills).

### Issue tracker

GitHub issues on `mephistopheles4/the-pact`, via the `gh` CLI; external PRs are not a triage surface. `main` is pushed; the publish sweep was #9 and #10. See [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md).

### Triage labels

The five canonical roles, each label string equal to its name, as in stacks. `ready-for-human` is the tracker's form of the pact's "Needs a human" gate. See [`docs/agents/triage-labels.md`](docs/agents/triage-labels.md).

### Domain docs

Single-context: one [`CONTEXT.md`](CONTEXT.md) and [`docs/adr/`](docs/adr/) at the root. `CONTEXT.md` is created when a term first needs it. See [`docs/agents/domain.md`](docs/agents/domain.md).
