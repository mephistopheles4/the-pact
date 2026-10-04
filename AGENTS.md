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
  repo root under PowerShell 7 (Windows or macOS). Never copy files by hand.
  The script installs from the clone, not through a symlink, so a checked-out
  branch is never live until you install it.
- **Run it without a switch first.** That is a dry run: it prints the files it
  would overwrite, add and delete, whether live files drifted since the last
  install (it compares them with `~/.claude/.pact-install.json`), and the commit
  it would install. If there is drift, stop and ask rather than overwrite.
- **The install is gated.** It stages HEAD's files (never the working tree),
  runs the pact's own check, `gate/seam-a.mjs`, on them under Node 20 or later,
  and copies only the files that check listed. It refuses when the check fails
  or can't run. The dry run also shows the Node it used, the pinned grimoire
  commit, and whether the gate changed since the last install. Run the gate's
  tests with `node --test "gate/tests/*.test.mjs"`.
<!-- pact:begin install-go-ahead -->
- **Install only on the owner's go-ahead.** Show the owner the dry run, then
  pass `-Apply` only after they say so in chat. `-Apply` refuses on drift or a
  dirty working tree.
<!-- pact:end install-go-ahead -->
- **The script confirms the hashes.** After `-Apply` it re-hashes every live
  file against its repo copy and exits non-zero on a mismatch. Check that it
  exited zero.
- **It deletes only pact files:** those the last manifest lists that the repo
  dropped. Your own agents and skills are never touched.

## Where work lives

- **Work items:** GitHub issues on `mephistopheles4/the-pact`. See
  [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md). The repo is
  private; `main` was first pushed on 2026-09-30. Cite a commit by its short
  hash; GitHub links it only once the commit is on the remote.
- **Plans:** a plan and its review rounds live on the issue, as the body and
  comments. The two plans created before the repo existed stay in
  `docs/plans/` until their close-out issues finish them.
- **When the work finishes:** each lasting decision becomes one ADR in
  [`docs/adr/`](docs/adr/), with its reasoning. The work itself becomes one
  dated narrative in [`docs/log/`](docs/log/), ending in a **Record** list of
  the commits that hold the verbatim plan, reviews and probe records. Then the
  plan and its files are deleted from the tree; history keeps them.
- **Vocabulary:** [`CONTEXT.md`](CONTEXT.md), created when a term first needs
  pinning down. See [`docs/agents/domain.md`](docs/agents/domain.md).

## Testing a change to an agent or a rule

Some changes to an agent or a rule need a planted probe, seen to fail, before
they count. Others may be proved by use. The protected set, at the end of this
section, holds what no periodic review may cut or weaken.

The words below come from #35, the review lenses. A lens is a reviewer agent
that asks one question from one angle. A lens review is one run of lenses on
real work. A practice case is a planted input for one lens, with its expected
result written down first. A periodic review is the owner's recurring look at
the standing measures (below), which can add, merge, cut or retune lenses.

### Which changes need a probe

- **A change to the risk floor, the security route, a gated clause, the
  protected set, or any lens in the security set still needs a planted probe
  that is seen to fail.** A gated clause is a block the install gate holds
  word for word; its canonical text is in `gate/clauses/`. The security set
  is the few practice cases that still run for real, because the risk floor
  requires it. A security-set lens is one that holds a shell or network tools,
  or guards the security route or the risk floor. A change to one reruns that
  lens's whole security set and rescores every bad report before the change
  is relied on. A bad report is a ready-made report that gets a practice case
  wrong; it is scored, not run, and must score FAIL.
- **Any other change to an agent or a rule is a two-way door.** Here that
  means only a change outside the list above; whether it can be undone does
  not decide it. It may instead go in with its bad reports scored and its
  standing measures recorded, and be proved by use. The standing measures are
  the numbers recorded at every lens review on real work.
- **When it is unclear which kind a change is, the probe is required, and the
  owner classifies it.** The building session never classifies a change as a
  two-way door on its own.

### Running a probe

While the work is live, a probe's record is committed beside the live plan in
`docs/plans/`. When the work finishes, the probe's results go in the work's
log entry in [`docs/log/`](docs/log/), with the commits that hold the verbatim
record.

- **Write the expected result, and commit it, before running the probe.**
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
- **Record every run, pass or fail, with the agent's report verbatim.**

### The protected set

These rules come from #35's spec, which is deleted when that work closes, so
they live here to outlive it. A security lens, here and below, is any
security-set lens. No periodic review may cut or weaken:

- **The gated clauses, the security route and the risk floor.**
- **The thorough-only rule for security reports, the "not verified" mark, the
  not-checked lists and the fail-closed checks.** The script that checks lens
  reports refuses a security report at any tier but thorough. A lens that
  could not verify something it was asked to check carries the "not verified"
  mark wherever its result shows, at every tier, and is never shown as a
  pass. Each lens's list of what it did not check is shown at every tier. The
  fail-closed checks are every rule by which that script refuses a report
  rather than pass it, not only a malformed one: for example, a report from
  a lens the session did not send, or a verdict that disagrees with its own
  findings.
- **The security set's contents, and its rerun after a model change.**
- **The per-lens tool allow-list:** no lens gains a tool.
- **The security lenses' carried rules:** a secret named by location, never
  by value; no working exploit or payload; checklists carried in the lens,
  never fetched; fetched pages treated as untrusted data; a missing tool never
  rebuilt through the shell.

A proposal touching any of them, and any change to the roster of lenses, comes
back as a spec change, read by both the plan review and the security review.
**A low finding rate alone is never a reason to cut a security lens:** security
reads are clean most of the time, so the measures would otherwise keep
pointing at them.

## Agent skills

Configuration for the optional [engineering skills](https://github.com/mattpocock/skills).

### Issue tracker

GitHub issues on `mephistopheles4/the-pact`, via the `gh` CLI; external PRs are not a triage surface. The repo is private; `main` is pushed, and going public waits for a sweep (#9, #10). See [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md).

### Triage labels

The five canonical roles, each label string equal to its name, as in stacks. `ready-for-human` is the tracker's form of the pact's "Needs a human" gate. See [`docs/agents/triage-labels.md`](docs/agents/triage-labels.md).

### Domain docs

Single-context: one [`CONTEXT.md`](CONTEXT.md) and [`docs/adr/`](docs/adr/) at the root. `CONTEXT.md` is created when a term first needs it. See [`docs/agents/domain.md`](docs/agents/domain.md).
