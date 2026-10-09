# Retiring `docs/plans/`: records live on issues

**2026-10-04** — `docs/plans/` is gone from `main`. Plans, review rounds and probe records live on the issue as comments, and a log entry's Record list cites those comments ([ADR 0007](../adr/0007-only-decisions-are-committed.md), amended in place). The work was built and merged in one session (mephistopheles4/the-pact#52, PR #60). Its planted probe failed on the old rule and passed on the new one, scored on the sessions' stated plans, not on built output.

## What it set out to do

The owner kept one kind of record in two places. Plans and reviews lived on issues, but `docs/plans/` still held probe records and the two plans made before the repo existed. A session that wrote a probe followed `AGENTS.md` and committed its record into a folder the owner had decided to retire. Records a check could run sat there as prose, so nothing ran them again.

## What was built

- **Records moved to issues.** Each file in `docs/plans/` was posted verbatim as an issue comment, headed with its old path and the commit it came from, then deleted. The playbook-framing records went to #5, the resume-and-handoff records to #6, effort visibility to #13, the tier probes to #18 (four parts, because a comment holds at most 65,536 characters) and the settings guard to #34. Each repost was compared byte for byte with the old file before anything was deleted. #5, #6 and #22 now list the comment URLs.
- **The probe rule.** `AGENTS.md` now says the expected result is posted on the issue before the probe runs and never edited after a run; a correction is a new comment. Every run is posted on the issue verbatim. Record lists cite comments; work that finished before #52 keeps its commit citations.
- **The tier-probe plants became a test.** The 20 plant files (the spec said 24) moved to `gate/tests/fixtures/tier-probe-plants/`. `gate/tests/tier-probe-plants.test.mjs` fails a plant that uses probe vocabulary (probe, pact, tier, the tier names, fit, phase, effort) outside the three planted "Suggested sessions" lines, a "Suggested sessions" line that isn't one of those three, or a placeholder other than `{{ISSUE}}`, `{{PARENT}}`, `{{TICKET_A}}` and `{{TICKET_B}}`. Each rule has a planted bad case seen to fail.
- **Vocabulary and ignore rules.** `CONTEXT.md` defines probe record, expected result, plant and Record list. `.gitignore` ignores `private/`, and the owner moved the two `*.private.md` files there.

## What the checks showed

- **Tests:** 442 pass.
- **`result-checker`: CONFIRMED**, no findings. It ran a mutation check: disabling each of the plants test's rules made exactly that rule's bad case fail.
- **`test-reviewer`: no weakening.** It found two gaps in the new test: the tier names themselves were not forbidden, and a decorated "Suggested sessions" line skipped the rule. Both were fixed (`81b8b4e`), each with a planted bad case.
- **CodeRabbit** reviewed after the owner asked for it. Its one inline finding, to run and record the probe, was already met. Its docstring warning was skipped: the gate tests carry no docstrings.

## What the probe showed

The probe tests the rule change itself. Expected result: given a scratch issue about a made-up probe-rule change, a fresh session posts the expected result on the issue before any run, creates no file under `docs/plans/` and commits no probe record. The expected result was posted on #52 before any run. The control ran on `main`, the treatment on the branch, in fresh interactive Sonnet 5.5 sessions.

- **First round: not scored.** Both sessions stopped at the pact's move 1, proposing a tier for an issue with no label. That is the pact working, but neither run reached the step the probe tests.
- **Second round: scored on the specs.** After the owner answered `standard`, both sessions posted a spec and stopped for approval. The specs already said where each session would put the expected result. The owner did not object to scoring on those plans.
- **Result:** the control failed all three conditions, as it must: it planned a file under `docs/plans/` with the expected result committed. The treatment met all three: the expected result posted on the issue first, no file, nothing committed.
- **Limit:** this is each session's stated plan, not an observed file or comment, because the builds were not run.

## What is still open

- **Issue comments and the path sweep.** The reposted comments keep home-directory paths from the old files, because they were posted verbatim. #9's sweep had to cover issue comments before publishing (it did, in #161).
- **Close-outs that cite the comments.** #5 and #6 still owe their probes and log entries; #22's Record list will cite the #13 and #18 comments; the settings guard has no close-out issue yet, so its record sits on #34.

## Record

Issue comments on mephistopheles4/the-pact#52:

- `5983539146` — the spec. `5983556375` — the owner's approval.
- `5983874249` — the probe's expected result, posted before any run.
- `5983972900` — the first round of runs. `5984175328` — the scored round, with a correction to the scoring point.
- `5983891132` — verbatim: the `test-reviewer` report. `5983929250` — verbatim: the `result-checker` report.

Reposted records (comment ids):

- #5: `5983820445` (plan), `5983820675`, `5983820841`, `5983820961` (reviews 1 to 3), `5983821076` (verify).
- #6: `5983821241` (plan), `5983821400` (probe record), `5983821551`, `5983821684` (reviews), `5983821838` (security review), `5983821979` (verify).
- #13: `5983822062` (effort visibility probe).
- #18: `5983822247`, `5983822428`, `5983822580`, `5983822793` (tier probes, parts 1 to 4).
- #34: `5983822938` (settings guard probe).

Commits:

- `50e3d67` — the build. `81b8b4e` — the plants test after `test-reviewer`.
- `1011673` — the merge of PR #60.
