# scout becomes the one search helper

**2026-10-05** — `scout` is the pact's first familiar. It is generated from a Standard grimoire contract and sealed in `familiars/`, and it installs to the same live path as before. The pact's `Explore` override is retired, so skills that call `Explore` get Claude Code's built-in. The "Lookups and searches" line names only `scout` (mephistopheles4/the-pact#70, PR #76, merged as 32804ba). It was proved by use under [ADR 0014](../adr/0014-evidence-in-proportion-to-the-cost-of-being-wrong.md), a two-way door the owner agreed on #59.

## What it set out to do

#59's recut left two search helpers: `scout` for lookups and an `Explore` override for broad searches. They did the same job with different names. #70 kept one, put it under a contract, and removed the other. Its old blocker, the probe of the amended probe rule (#54), was closed as superseded once #67 right-sized that rule.

## How it was built

- **Sessions.** A Sonnet build session drafted answers to the contract questions and was stopped before writing files. The owner moved the build to Opus at medium effort, because drafting the contract is thinking work. The issue had suggested Sonnet. The Opus session reviewed and tightened the draft rather than interviewing again.
- **What the review changed.**
  - The no-write rule was credited to seam A's tool allow-list, which has no `scout` entry. What enforces it is seam A's built-in default of exactly Read, Glob and Grep.
  - A subagent can't wait mid-run, so each "stop and ask" now ends the run with the reason.
  - The retire rule became something you can count.
  - Two sample outputs replaced "today's style" as the target.
- **The owner's answers.** Question 2, in the owner's words: scout exists to be cost efficient, "more cost efficient than every other model". Haiku was offered as the cheaper model. The owner kept Sonnet, and the contract's retire rule watches whether built-in `Explore` does the job more cheaply. The target is Sample A: answer first, one line per `file:line`. The owner's go was "I think it's a great start."
- **A trial before install.** At the owner's request, the new instructions ran through the then-live `scout` on one real question: other ways the grimoire head-chef skill could start sessions. It answered in the target shape at about 25 lines, a little over the 20-line target.
- **Gate tests.** Tests that read the real `Explore` file now read `gate/tests/fixtures/Explore.md`. Tests that used `scout` as a sample plain agent now use `plan-reviewer`. No test was deleted, and every bad case still fails.

## What the checks showed

- **Tests:** 519 gate tests pass, and seam A passes.
- **`test-reviewer`: a small weakening.** The case-sensitive routing test could pass if its text edit missed. It now asserts that the edit landed, and a reworded anchor in a throwaway copy made it fail. Practice case 2's expected answer missed the routing check, `gate/pact-text.mjs`; the answer is fixed. The test is still not run.
- **`result-checker`: INCONCLUSIVE.** Its one gap was YAML parity with Claude Code's own reader. Before install, only two stand-in libraries could be run; they agreed with seam A. It advised the same test guard as `test-reviewer`.
- **Install.** The owner said "merge and install". `-Apply` exited 0 with every file verified. It overwrote `CLAUDE.md` and `agents/scout.md`, deleted only `agents/Explore.md`, and found no drift.
- **The YAML gap is settled.** After install, the orchestrator session ran a fresh headless session that called `scout`. It ran on `claude-sonnet-5-5`, used only Grep and Read, and answered a lookup correctly, citing AGENTS.md line 141.

## What is still open

- **The practice test** in `familiars/scout.practice-test.md` is written but not run, by the owner's decision.
- **The retire conditions** in the contract's question 13 are waiting on the first 10 noted uses.
- **`cloud-sessions/`** still names `Explore`; it is out of scope (#41).

## Record

Issue comments on mephistopheles4/the-pact#70:

- `5986831650` — unblocked under #67's rule.
- `5997895760` — the build record: YAML stand-in check, contract decisions, trial, dry run.
- `5997925313` — verbatim: the `test-reviewer` report.
- `5998026482` — verbatim: the `result-checker` report.
- `5998104986` — the move-4 fixes, and the owner's words verbatim (question 2, model and target, the go).
- `5998421536` — the install.
