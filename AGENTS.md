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
  commit, and whether the gate changed since the last install. Run the gate's
  tests with `node --test "gate/tests/*.test.mjs"`. Node 20 doesn't expand the
  quoted pattern, so under Node 20 hand it the files instead: leave the pattern
  unquoted in a POSIX shell, or in PowerShell run
  `node --test (Get-ChildItem gate/tests/*.test.mjs).FullName`. The Linux run
  in a container (#96) is in
  [`gate/tests/fixtures/linux/`](gate/tests/fixtures/linux/).
<!-- pact:begin install-go-ahead -->
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
- **The builder page.** [`builder/pact-config.html`](builder/pact-config.html)
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

## Where work lives

- **Work items:** GitHub issues on `mephistopheles4/the-pact`. See
  [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md). The repo is
  private; `main` was first pushed on 2026-09-30. Cite a commit by its short
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

GitHub issues on `mephistopheles4/the-pact`, via the `gh` CLI; external PRs are not a triage surface. The repo is private; `main` is pushed, and going public waits for a sweep (#9, #10). See [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md).

### Triage labels

The five canonical roles, each label string equal to its name, as in stacks. `ready-for-human` is the tracker's form of the pact's "Needs a human" gate. See [`docs/agents/triage-labels.md`](docs/agents/triage-labels.md).

### Domain docs

Single-context: one [`CONTEXT.md`](CONTEXT.md) and [`docs/adr/`](docs/adr/) at the root. `CONTEXT.md` is created when a term first needs it. See [`docs/agents/domain.md`](docs/agents/domain.md).
