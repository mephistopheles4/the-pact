# AGENTS.md holds only what every session needs

`AGENTS.md` shrinks to a file read in a minute (100 lines), and the rest of this repo's rules live in `docs/agents/`. The tracker rule's short form and its five always-on parts leave the loaded file for `docs/agents/issue-tracker.md`, behind one pointer line. Live text names the Workflow stage, Test, never "move 4".

## What changed

- **A 100-line `AGENTS.md`,** down from 578. It keeps what the repo is, the install and test-runner commands a session can't guess, the same-change regeneration commands, the review rules that stop work, a tracker pointer, the close-out lines and the `## Agent skills` block the engineering skills read.
- **Five new docs under `docs/agents/`** hold the rest, moved with their meaning unchanged: `install.md`, `gate-tests.md`, `changing-rules.md` (the probe rule and the protected set, word for word), `parallel-sessions.md` and `work-records.md`. Code-enforced rules are cut from `AGENTS.md` only; the docs keep their sections whole, and the PR's mapping table names each enforcing check.
- **The tracker rule moves whole** to the top of "Whose text counts" in `docs/agents/issue-tracker.md`: the short form and the five parts (a failed or empty read, a token in the environment, a checkout counting as a run, the one exception's five conditions, never posting a secret). `AGENTS.md` keeps one line that sends a session there before it acts on tracker text or checks out or runs a PR. This amends [ADR 0062](0062-this-repo-keeps-its-own-tracker-rule.md), which kept the five parts in the loaded file. The owner decided it in chat on 2026-10-16 (the "Owner decision, from chat" comment on #270).
- **"Move 4" becomes "Test"** in live text: `AGENTS.md` and its docs, the lens contracts' "Held by" lines, the threat model, the README figure's kickers, and comments and one test name in the gate. ADRs, logs, `gate/tests/fixtures/CLAUDE.pre-33.md`, the contracts' dated history, the old pact's planted mark names and Scriptorium's list positions keep their history.

## Why

- **A bloated rules file is half-ignored.** Anthropic's best-practices guidance says to include only what Claude can't infer, and to keep it short. At 578 lines most of the file described what the install script, the test runner and the gate's tests already enforce.
- **The stage is the pipeline, not the move.** [ADR 0060](0060-the-moves-are-the-owners-practices-and-the-pact-leans-on-judgment.md) made the moves the owner's unnumbered practices; a build's lenses run at Test. "Run the move-4 lenses" made the stages look like a pipeline of moves.

## What was weighed

- **Keeping the five tracker parts in the loaded file.** Not taken: the owner chose one pointer line and one home for the whole rule. The pointer fires before a session reads or posts to the tracker, acts on its text, or checks out or runs a PR. The cost is a weaker control, because a session that skips the pointer has only Claude Code's own defaults; `docs/threat-model.md` says so where it names the rule (R1, R6, R13 and R24).
- **Trimming the moved docs sentence by sentence.** Not taken: they aren't loaded, so trimming saves nothing per session and asks the reviewer to check twice.
- **Renaming the planted old mark names and Scriptorium's list positions.** Not taken: the first are the old pact's real marks, planted on purpose; the second count positions in a list the person edits.

Amends [ADR 0062](0062-this-repo-keeps-its-own-tracker-rule.md) and [ADR 0006](0006-root-agents-md.md), which said every rule for this repo lives in the root `AGENTS.md`: the rules now live there and in the docs it links.

- **Since #183:** with a token set, the login is announced, not confirmed, and where GraphQL is refused author reads go through a checker in code. See [ADR 0089](0089-tracker-authors-are-read-through-rest-where-graphql-is-refused.md). This decision still holds.
