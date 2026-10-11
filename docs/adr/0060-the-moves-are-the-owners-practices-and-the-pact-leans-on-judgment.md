# The moves are the owner's practices, and the pact leans on judgment

The rules file, `claude/CLAUDE.md`, is now the owner's practices, stated once, and how Claude helps with them. It replaced a 5,247-word file of moves, floor, software preset and six gated clauses with about 1,100 words (#238, built in #261). Two guards stay: "Stop and ask me", which the gate pins, and the usage pause. Every other guard the old file carried is accepted as judgment, as in any shared `CLAUDE.md`. This supersedes [ADR 0056](0056-the-rules-keep-only-what-judgment-and-the-harness-cannot-cover.md) in part: its floor, its "data rules are never cut on the harness's word", and its gated `move-4` clause.

## What the file holds

- **The moves.** Sense the work, think before doing, checkpoint the seams, stay the owner. They are the owner's practices, with or without AI, and the owner takes each up as the work needs it. Each move keeps its open part (`move-1`, `move-2`, `move-3`, `move-4-extra`), now empty, so a configuration can bind skills to it.
- **How Claude helps.** Execute the owner's intent at the owner's pace: build what you were given, prototype first when the intent is still forming, nudge once when a move seems to drop, bring the owner decisions, and say a mismatch of tier, model or effort first. The decisions that are always the owner's are named: proceed, fix or kill on a spec; the ticket cut; accepting the work, closing a ticket and merging; an install; anything published.
- **How much checking.** A tier says how much checking the work needs, not which moves it goes through. Sensitive work, by default auth, secrets, crypto, input validation and data migrations, is thorough and built on Opus at high. That list is the old risk floor, word for word, no longer pinned.
- **Lenses.** A lens is a tool. The lens table says where each fits. One paragraph, **the defaults**, names the reviews that always run: the QA pair reads every result, and the security pair reads sensitive work. Only the owner skips a default. The rest are the session's judgment or the owner's call, and the session says which it left out and why. The procedure for running a lens lives in a separate file (ADR 0061).
- **Guards.** "Stop and ask me" with its four signals, pinned. The usage pause, an open part a setting fills.

## What left the pact, accepted as judgment

These were rules or gated clauses. The owner cut them in prototype round 2 and accepted each by name; a rule comes back only when the owner sees a session go wrong in their own use and judges that a line would fix it.

- **Never post a secret or a personal detail.** ADR 0056 said data rules are never cut on the harness's word. This reverses that for the pact. The security lenses keep their carried rule, a secret named by its place, and this repo keeps the line in its own `AGENTS.md` (ADR 0062).
- **The risk floor and the security route as gated clauses.** Their content survives as text: the sensitive-work default and the defaults sentence. "However small" and "a main-session build" went.
- **Whose tracker text counts, and outsiders' code never runs.** Retired from the pact. This repo keeps its own rule (ADR 0062).
- **What no skill overrides; never stand in for a missing security lens; the floor's "may only add".**
- **The parallel-session claiming rules.** They moved into this repo's `AGENTS.md`, since this repo is where parallel sessions work one chain.
- **"In chat" and the "Owner decision, from chat" mark; across projects; a public repo's security defect waiting for its fix.**
- **The Shell rule.** The owner's decision on #233: Claude Code's PowerShell tool is the primary shell on Windows, and the silent failure did not reproduce. A hard guarantee would belong in settings.
- **Plain language.** The owner's output style carries it. `reader-lens` keeps its copy of the six reader-facing rules, and a test holds that copy word for word.

## Separation

The pact, `claude/`, installed into `~/.claude/`, holds only what every project needs. This repo's own rules live in `AGENTS.md` and `docs/`: its tracker, its gate, its review depth and its close-out. When a rule could sit in either place, it goes in the repo. That is the owner's decision on #238's spec revision 9.

## Why

- **Rules were standing in for judgment.** The old file grew a rule for each failure seen, and sessions marched through moves the work didn't need. The owner wants the moves as practices a session follows the owner's lead on, not a process it owes.
- **The harness and the model carry more each release.** "Lean on judgment more than rules here, more so as models improve" is in the Lenses section on purpose.
- **What can run, and with what power, still gets a boundary.** The gate keeps checking that (ADR 0061). Only the wording checks went.

## What is accepted

- **A later change can weaken the text,** and only "Stop and ask me" trips the gate. The text sits on this repo's security route, so the security pair reads every change to it.
- **The model may not read the review file.** The rules file still names the installed cross script, and that script refuses a malformed report. A path to a kept-local report could then reach a public post. The trial after the install (#238, S9) records whether the file is read.
- **The threat model's rows** R1, R2, R5, R6, R15, R19, R23, R24 and R25 now read "judgment" for the pact, with this repo's rule named where it holds.

## How this was decided

- **2026-10-11** in mephistopheles4/the-pact#238: the owner stopped patching the rules file and had a prototype of the whole file written fresh. On prototype round 3 the owner decided (from chat): the prototype fits; the guards are cut to "Stop and ask me" and the usage pause, each cut guard accepted as judgment; the text states target behaviour, and prototype-first is the default when intent is unclear. Spec revisions 7 to 9 were read by the security pair, the spec pair and `unstated-lens`. On revision 9 the owner said proceed, kept this repo's tracker rule, deferred #233's calibration measure, and set the separation principle. Built in #261.
