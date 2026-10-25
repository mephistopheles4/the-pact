# Rules learned in use ship in the pact

Working rules a lead session had kept in its machine-local memory now live in the pact's two files, so every machine and every project gets them (#399, #400, spec revision 2, built on the lead's decisions under the owner's auto-mode instruction and on two answers of the owner's, relayed by the lead). Tool traps get a short section of their own at the end of the rules file. The installer warning that #399 also asked for moved to its own issue, #407.

## What changed

- **`claude/review.md`.** Posting gains two bullets: published text never names another project's issue or pull request, and a note that cites a forum thread leaves its people unnamed. Running a lens asks each lens for repo-relative cites and no list of the files it read, and the lenses of one round run in parallel on the same head, with edits held until every report is in. Trade-offs and accepted risks gains a rule for stopping a security-fix loop.
- **`claude/CLAUDE.md`, How Claude helps.** "Bring me decisions" says how to bring a change to a file: the current text quoted, the proposed wording, one recommendation, one item per turn, clickable choices. Under a lead session those parts go to the lead, and the session acts on the owner's answer as the lead relays it. A new bullet cleans up dictated words. "Finish the build" never promises a green-check relay through Desktop's Auto-fix.
- **`claude/CLAUDE.md`, beside the Workflow table and in Guards.** CodeRabbit's pass signal; checking for a skill's `SKILL.md` before calling it not installed; Fable never suggested to save weekly usage. Each sits in plain prose outside the configurable blocks, so no block's text and no default configuration changes.
- **`claude/CLAUDE.md`, Tool traps.** Nine traps that have cost turns, most by looking like success: PowerShell's empty output on a failure, `node -e`, commit messages and literal text from PowerShell, escapes the Write and Edit tools decode, collapsing commits, the shared object store, finding a session, and a subagent running a versioned script.
- **`docs/install.md`.** "Updating later" says to fast-forward the checkout.

## Why

- **Memory doesn't travel.** A rule kept in one machine's memory for one project folder reaches no other machine or project, so the same failure cost turns again elsewhere.
- **The lead's decisions, under the owner's auto-mode instruction, on 2026-10-25:** the traps go in the rules file rather than a new installed file, and a session under a lead sends its choices to the lead.
- **The owner's answers, relayed by the lead the same day:** the installer warning goes to its own issue, where it takes the security pair; and a session under a lead acts on the owner's answer as the lead relays it. Under the owner's standing instruction for the day, the lead's picks scoped that: a relayed answer covers these choices only, and the decisions that are always the owner's, and a decline of the sensitive route or its offer, still wait for the owner's word in chat. They also kept the security bar as the stop for a security-fix loop, where the request had a lower bar, since the pact's security bar wins.
- **ADR 0009** solved the same failure, an installed user-only skill reported as not installed, with a fixed last line handing the owner the command. That line is no longer in the rules file; the skill check here keeps its first half, and offers that the owner type the skill.

## What was weighed

- **A separate traps file, read on demand.** Not taken: it would change the installer, the cloud copy and their tests, and these traps hit every project on a machine. The cost is about thirty more lines in every session.
- **The installer warning in this change.** Not taken: it needs a git command the bootstrap's gate test forbids, so it loosens an install control, and the spec pair marked three of its findings security?. #407 holds it.
- **Owner-specific wording.** The pact ships to anyone who installs it, so the dictation rule applies when words come by speech-to-text, rather than stating that the owner uses it.
