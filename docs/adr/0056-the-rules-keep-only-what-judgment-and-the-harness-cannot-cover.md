# The rules keep only what judgment and the harness can't cover

The rules file, `claude/CLAUDE.md`, is now three things: the four moves, stated once as intents with their why; a short floor of what holds in every workflow and every repo; and the software preset, "Implementing a change", cut to what earns its place. A sentence stays as a rule only when it passes the keep test below. Everything else became one line of guidance or was deleted. The gated `move-4` clause is the only clause that changed. The ADR number is 0056 because 0055 was the last one taken when the build started; a parallel build that merges first may take it, and the later merge renumbers.

## The keep test

A sentence stays as a **rule** only when it names a failure that all three of these hold for:

- **The harness doesn't prevent it.** Claude Code's system prompt, permission modes and auto mode don't already block or instruct it.
- **The model doesn't reliably avoid it** without being told, or did not in a recorded case: an escape row, a log entry, or an owner correction.
- **The miss is expensive or silent:** it reaches another project, publishes something, runs outsiders' code, or passes work the owner can't verify.

**Data rules are never cut on the harness's word.** A sentence that keeps a secret, a personal detail or a private name out of anything published, out of another project, or off the machine stays, whatever the harness does. Auto mode can't know which names are private or which hole is unfixed. Elsewhere, where a rule and the harness overlap, the harness wins and the rule goes.

**What the harness was taken to cover**, as read on 2026-10-11 from Claude Code's public docs and the system prompt the build session ran under:

- **Auto mode** blocks force-pushes, merges with no human approval (a soft block that a user message or start prompt naming the merge lifts; on this repo the merge is not a human checkpoint, per R24 in `docs/threat-model.md`), destroying files that existed before the session, printing a live token, sending sensitive data out of the repo, sensitive details in public comments, and piping a download into a shell. It allows pushes to the default branch and opening pull requests. Those blocks hold only in auto mode, which the owner runs by default.
- **The system prompt**, as of 2026-10-11, has the model confirm hard-to-reverse or outward-facing actions, report failures faithfully, and know its own model name; its tool list holds a message tool that reaches other local sessions. Its default text isn't published and can change. **Recheck it** for each deletion below that rests on it.
- **The docs' own caveat:** `CLAUDE.md` is context, not enforced configuration, and auto mode's classifier reads it. A kept rule still steers the classifier; a hard rule belongs in a deny rule, an ask rule or a hook where one fits.

## What changed

- **`## The moves`** is new, directly above "Implementing a change". It holds the four moves as intents: sense the work, think before doing, checkpoint the seam, stay the owner. They repeat at every seam, any move can send the work back, and a session starts at the move the owner's record on the issue shows. A checkpoint is the owner's decision, or a check the owner wrote earlier that has been seen to fail; a lens advises and is never one on its own. Weight follows how hard a step is to undo, and every decision the workflow names as the owner's is heavy.
- **The floor** is a paragraph in that section that points at the gated clauses and restates only one, the tracker rule's never-post line, widened to anything published: stop and escalate; never post or publish a secret or a personal detail; risky work takes the careful path; risky work gets an independent review before it ships, and every result gets a review that could have failed (the two **required slots**, filled in software by the security route and the QA pair); whose text counts, and outsiders' code never runs. Only a change to the rules file, installed through the gate, narrows the risky list or swaps a reviewer; anything else may only add. A new test, `gate/tests/floor.test.mjs`, holds its sentences word for word.
- **The section is not gated,** so the gate's code is unchanged. Instead, `AGENTS.md` puts "the moves section of `claude/CLAUDE.md`" on the security route.
- **`move-4`** opens with the owner's three tests of ownership: "I own the result when I can verify it, reconstruct why it is right, and know when to stop it." It adds "Your confidence is never evidence." "Never resume a reviewer, a lens or a checker" keeps its scope and loses its restated reason. The reviewers, the tiers, "Then run the QA pair," the "(below)" pointer and the "I decide" ending are unchanged. The span from `` `unstated-lens`, `` to "thorough tiers;" keeps today's line breaks, because an existing test plants a weakening on those exact bytes (q1 on #232: the lead session, whose messages the build's brief counts as the owner's decisions, chose option A).
- **The other seven gated clauses are byte for byte unchanged,** and so are the open parts of moves 1 to 4 and `usage-pause`.

## What was deleted, and what covers it

| Deleted | What covers it |
| --- | --- |
| "Which phase an issue is in", except its load-bearing clause | The moves section: a session starts at the move the owner's record shows, and never infers a later move from partial evidence. The model reads the rest from the issue. |
| The unlabelled-issue reply's mechanics ("I answer with a tier word…") | Judgment. Kept: the fit check, a proposed tier as a choice, stop, and "stands in for move 1 only when I confirm it". |
| "Show the next move as a choice": its examples and restatements | One line of guidance keeps the options, their risk, the marked pick and the `▶` line last. |
| The Opus and Sonnet bullets, and the cache restatements | The effort table, and one sentence on the cache. |
| Fit check: "It is the first text I see…", "Read your model name from your system prompt", "Effort is the one thing a session may not be able to see" | "The first line of the first reply". The system prompt names the model (2026-10-11; recheck). |
| Bound skills: "protect me while I do", "Each move describes a practice…", "the flag is its author's choice" | Reasons only; the four bound-skill rules are kept. |
| The lens report's format: two sections, For the owner first, no verdict word, the `lens-findings` block | Each lens's own file and the cross script, which refuses a malformed report. Kept: an owner section holds no line numbers, codes or paths. |
| "Exit 0: every check passed." | The script's `RESULT:` line. |
| Why `--tier thorough` for the security pair; "that crossing shows first", for the security and standards pairs | The cross script refuses a security-pair report at any other tier, and places crossings itself. |
| "Decisions are made together…" in "Help me decide" | Guidance; the rule "don't hand me a list with 'your call' on each" is kept. |
| The hand-back's wording ("No praise, no blame, no 'you should'") and the fresh-session note above a bound command | The model's own tone; the `▶` line stays last. Kept: once per session, never mid-step, ask for the owner's call first, the choice stands. |
| "I tend to forget, so check for me"; watching the window "all the way through"; "suggest charting the work at move 1" | Claude Code's compaction handles length, so the reason left is cost: propose a fresh session past about half the window. Move 1's open part keeps charting. |
| Parallel sessions: "Charting a fresh chain is unaffected", the primary-protection note, the `gh issue list` command, and the cross-session `SendMessage` explanation | Reasons and commands the model finds. The system prompt (2026-10-11; recheck) says which tool reaches another local session. Kept: the six rules. |
| The project named in the double-claim example | Across projects: the example no longer names another project. |
| `move-4`: "I verify the work at the end of its build session", and "fresh context is the point of them" | The three tests of ownership; the freshness rule keeps its scope. |

**Kept although the spec's table of rows (S6) cut them:** the two tool names in the parallel-session rules, `mcp__ccd_session_mgmt__list_sessions` and `mcp__ccd_session_mgmt__send_message`. The cloud copy's edits anchor on those two paragraph openings, and a test pins the edits by digest, so the spec's rule that pinned text stays word for word wins. The threat model's R24 still describes them.

## What was kept, and the failure each prevents

- **Where this config lives:** a direct edit to the live file drifts from the repo, and the next install overwrites it or refuses on drift.
- **Shell:** Git Bash on this machine returned empty output and exit 0 for a read that had output (recorded); a silent wrong answer is worse than an error.
- **Plain language:** the owner's standing preference, which the harness can't know. Its six bullets are also pinned in `reader-lens`.
- **Skill precedence:** the harness sets no order between an invoked skill and the rules file. The scope "over the style rules above and over the active output style" stays, so an invoked skill outranks no more than before.
- **The tiers, the risk floor's "don't nag" line, and the effort table:** the owner's sizing and model split, which the harness can't know.
- **Where work starts, tier changes, quick work's open decision, the next move as a choice:** the owner's preferences, recorded as corrections. Without them a session picks a tier, widens quick work, or decides a scope question the issue left open.
- **The fit check's two formats and the digest:** the owner wants a mismatch first, and only a Sonnet session can read its effort setting, so the formats differ by model.
- **Bound skills:** a session that follows a user-only skill's file in its place takes a step the owner keeps for themselves.
- **The lens operation sentences:** fresh and alone; word for word, from a file; the cross script by full path with `NODE_OPTIONS` cleared; no `RESULT:` line means stop; on exit 1, only the fenced, folded reports; a kept report's path to the owner in chat, never the tracker; `git status` after `behaviour-lens`; the mutation step's lock-pinned binary, no fetching runner, and before-and-after snapshot. On a cross failure the script writes nothing, so these are the only guard; the fence keeps a report's links and images from rendering, and a path on a public tracker leaks the machine's layout.
- **Lookups:** seam A's routing check (C3) routes `scout` through this line.
- **Auto-take and its exceptions:** each exception is a decision only the owner makes.
- **Lens dispositions and escapes:** they feed the only measure of the lenses. "On a public repo, a security escape carries only the lens, the link to the review and a placeholder until its fix ships" keeps an unfixed hole off a public tracker.
- **Across projects:** the harness can't know which names are private.
- **Hand me the trigger:** the owner's checkpoint for commands only they start.
- **The hand-off:** a decision in a hand-off counts only where it points to a comment that counts and carries the "Owner decision, from chat" mark, so an unmarked approval can't ride into the next session.
- **Needs a human:** without it a spec hides the owner's steps until the build stalls on them.
- **Parallel sessions:** one ticket was claimed by two sessions (recorded), because every session signs in as the same user.

## The owner's acceptance (the spec's S4)

The risky list stays the gated `risk-floor` clause, unchanged (the owner's answer to question q2 on #186, option A). The owner accepts, by name, that personal data written into code or logs can be built below the thorough tier. It is guarded only by the never-post rule and the publish stop. Neither guard reaches personal data the built code writes to its own logs at run time, and the owner accepts that too. The threat model's R23 records it.

## Considered and rejected

- **Gating the moves section.** It would change the gate's `CLAUSES` map, which is gate code. The security-route line in `AGENTS.md` guards it instead, with the floor test.
- **Moving the software preset into a skill loaded on demand, and a second, marketing workflow.** Both change what the gate installs; they wait for #143.
- **Trimming `tracker-authors` here.** About 890 words, the largest block; it gets its own security-route issue.
- **The four-question hand-off test, and a planted probe.** The owner cut both at sign-off on #186.

## How this was decided

- **2026-10-11** in mephistopheles4/the-pact#186: the direction, a judgment-first rewrite; q1, the slots declared only; risky-list option A; the hand-off test cut; the marketing example deferred to #143; the planted probe dropped; a floor test added; proceed on spec rev 5. Each is an owner decision from chat. The security pair read revisions 2 and 4; the spec pair and `unstated-lens` read revision 3.
- **2026-10-11** in mephistopheles4/the-pact#232, the build: question q1, move 4's line breaks (option A, the lead session's decision); question q2, the word budget (option A, the owner's, relayed by the lead): the 3,500-word budget left the ticket and the size target moved to #233.
