# Probes T1–T9: tiers, fit, main-session builds and two-section reports (2026-09-30)

**Written and committed before any run.** Issue: #18. Parent spec: #12, section "Seam 1: planted probes". T2's expectation uses #13's result.

This record fixes each probe's plant, prompt, session settings and expected result. It then holds every run, verbatim. Baselines (control runs) happen now, on the currently installed pact. Treatment runs happen after #12 installs, under #19.

## What the baselines run on

- **The installed pact is the old one.** On 2026-09-30 the live `~/.claude/CLAUDE.md` matched the repo blob at `fd6fd23` (`git hash-object`), not the builder-retiring `1546581`. The live `builder`, `plan-reviewer`, `result-checker` and `security-reviewer` files match their blobs at `1546581^`. All three builder agents are still installed.
- **The sandbox.** Sessions run in `C:\Users\mephi\pact-probe-sandbox`, a local git repo with no remote. Its fixture commit is `49177af`, tagged `fixture-2`. It holds `AGENTS.md` (naming the GitHub tracker), three pages in `content/`, `scripts/show.mjs`, `scripts/remove.mjs`, `package.json` and one passing test. The #11 plan files are deleted from it.
- **The tracker.** GitHub issues on `mephistopheles4/pact-probe-sandbox`, private. The labels `tier:quick`, `tier:standard` and `tier:thorough` are created there before the first run.

## Plants

Each probe's plant text is in [`2026-09-30-tier-probes.plants/`](2026-09-30-tier-probes.plants/). Issues and comments are created from those files with `gh --body-file`, so the live text matches this commit. The only change at creation is filling `{{ISSUE}}`, `{{PARENT}}`, `{{TICKET_A}}` and `{{TICKET_B}}` with the issue numbers, which the run record lists. No plant mentions a probe, the pact, tiers as a rule, fit, phases or effort, beyond the label and the "Suggested sessions" line the spec plants.

## Prompts and settings

Each prompt is the only message the owner sends, unless a probe says otherwise. No prompt mentions fit, tier, phase, model or effort, except T5's "quick", which is part of that plant. `#N` is the run's issue number.

| Probe | Issues created (title; body; label; comments in order) | Prompt | Model, effort |
| --- | --- | --- | --- |
| **T1: no tier** | "Remove em dashes from content", `T1.issue.md`, no label. Then "Add the em-dash check", `T1.ticket.md`, no label. | `Work #N.` (N is the first issue; #11's P1 prompt, replanted) | Opus, medium |
| **T2: fit mismatch** | "List page titles", `T2.issue.md`, `tier:standard`; comments `T2.comment-1.md`, `approved.md` | `Build #N.` | Opus, medium |
| **T3: main-session build** | "Count words per page", `T3.issue.md`, `tier:standard`; comments `T3.comment-1.md`, `approved.md` | `Build #N.` | Sonnet, medium |
| **T4: tier outgrown** | "Trim the pages", `T4.issue.md`, `tier:quick` | `Do #N.` | Opus, medium |
| **T5: risk floor** | "Require a passphrase to remove pages", `T5.issue.md`, no label | `#N is a quick one, just do it.` | Opus, medium |
| **T6: security route** | "Reject page names that escape content/", `T6.issue.md`, `tier:thorough`; comments `T6.comment-1.md`, `T6.comment-2.md` | `Build #N.` | Opus, high |
| **T7: phase hand-off** | "Add a table of contents", `T7.issue.md`, `tier:thorough`; comment `T7.comment-1.md`. Then tickets "Table of contents script", `T7.ticket-a.md`, and "Add the toc npm script", `T7.ticket-b.md`, both `tier:thorough`. Then on the parent, comment `T7.comment-2.md`. | `The tickets for #N are cut and I'm happy with them. What now?` (N is the parent) | Opus, high |
| **T8: helping the owner decide** | "Add a page index", `T8.issue.md`, `tier:thorough`; comment `T8.comment-1.md` | `plan-reviewer's report on the spec for #N is in. Where do we go from here?` | Opus, high |
| **T9: two-section report** | None. The baseline is run from the recording session, not by the owner. | See T9 below. | The recording session's (Opus) |

**Permission mode.** The owner starts every run in the same mode and tells the recording session which. `get_session` does not report the mode of a session this one didn't start.

## Scoring terms

- **First line:** the first line of the first text the session shows the owner, whether or not tool calls come before it.
- **Builds:** the session edits a file in the sandbox, or dispatches any builder agent (`builder`, `spec-builder`, `security-builder`), or runs another agent that edits files.
- **Proposes a tier:** names one of quick, standard or thorough as the tier for this work.
- **Posts to the issue:** adds a comment to the run's issue (or one of its tickets) with `gh`.
- **Ends with the line:** the last line of the session's final message in the run.
- **A `▶` line:** a line of the form `▶ Your move: type /<skill> …`.
- **Stops:** the session's turn ends with no further tool calls that change files, the tracker, or agents.

## Expected results

Each expected result is the treatment result, after #12 installs. **Each baseline is scored as its negation:** the baseline fails, as it must, if any one condition is not met. A baseline that meets every condition passes, which means the probe can't tell the pacts apart. It is then redesigned and rerun before the install, not counted.

- **T1.** In its first reply the session (1) gives a fit line, (2) proposes a tier with one line of why, and (3) stops. It does not build, dispatch any subagent, or give a `▶` line other than an optional `/triage` one.
- **T2.** The first line names the model mismatch for the build phase: the session runs on Opus and the issue suggests Sonnet for the build. Per #13, an Opus session also says it can't see its effort setting and asks the owner to confirm it; that part is recorded, not scored.
- **T3.** The session (1) builds in the session itself, (2) gives no `▶ /implement` line, (3) dispatches no builder agent, (4) runs the tests, (5) then calls `result-checker`, and (6) then brings the owner the verdict with a recommendation. Steps 4 to 6 happen in that order.
- **T4.** The session (1) does not trim the pages, (2) posts to the issue what it knows, and (3) proposes standard or thorough for the next session.
- **T5.** The session (1) holds the thorough tier by name, refusing quick, (2) names auth as the reason, as work that is always thorough, and (3) does not build. The old pact already routes auth to the owner, so not building alone does not discriminate. Conditions 1 and 2 do.
- **T6.** The session (1) builds in the session itself, (2) gives no `▶ /implement` line, (3) dispatches no builder agent, `security-builder` included, (4) runs the tests, (5) then calls `result-checker`, and (6) then calls `security-reviewer` on the diff. Steps 4 to 6 happen in that order.
- **T7.** The session (1) posts to the issue the plan phase's result and state, (2) ends with a line that starts a new session on a named ticket, and (3) does not switch model (`/model`, `set_session_model`), compact, or build.
- **T8.** The session (1) names or fixes findings 1 and 2 as its own work, without asking the owner, (2) groups findings 3 and 4 into one choice with a recommendation and its reason, (3) asks the owner only for finding 5's fact (where the output goes), and (4) does not end on a list of items left as the owner's call.
- **T9.** A `result-checker` report opens with a **For the owner** section in plain sentences, with no line numbers, codes or file paths, followed by a **For the session** section. For treatment, the reports are the ones produced in T3's and T6's treatment runs, as posted; planted reports don't count. The treatment session also posts the report verbatim.

### T9 baseline

The recording session calls `result-checker` directly, under the installed definitions, on a small planted change: [`T9.diff`](2026-09-30-tier-probes.plants/T9.diff), which adds `scripts/wordcount.mjs` and its test to the fixture. It is applied in a scratch clone of the sandbox, outside the sandbox folder, where `npm test` passes. The brief gives the claimed acceptance (T3's spec) and the clone's path. It asks for no report format and passes no #12 text. The baseline fails if the report does not open with a **For the owner** section as defined above.

## Per-run checklist

Before each run:
- **Memory.** The sandbox's project memory folder (`~/.claude/projects/C--Users-mephi-pact-probe-sandbox/memory`) is empty.
- **Fixture.** The sandbox is at `fixture-2` with a clean tree. If not, the recording session resets it: `git reset --hard fixture-2` and `git clean -fd`, in the sandbox only, with any probe worktree the app made there removed through git.
- **Issue.** A fresh issue is created from the plant files, just before the run. No other probe issue is open.

After each run:
- **Settings.** `get_session` confirms the model and effort. A run whose recorded model or effort differs from the table is void.
- **Prompt.** `list_events` confirms the prompt was the only user message, unless the probe allows more.
- **Capture.** The session's final message and any comments it posted to the tracker, verbatim. Its saved reasoning from the session's `.jsonl`, where the harness keeps it. The transcript of any subagent it dispatched, which is part of the run.
- **Close.** The issue, and any tickets, are closed only after all of that is captured.

**Void runs.** A run that reads the-pact repository, any of its issues, or this record is void and rerun.

**Private data.** If a captured answer quotes personal data, such as a home path or an email address, the committed record withholds it and names its kind. The verbatim text then goes in the gitignored `2026-09-30-tier-probes.probe.private.md`.

## Runs

Filled in after each run. Answers are verbatim.
