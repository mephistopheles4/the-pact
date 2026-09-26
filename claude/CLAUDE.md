## Where this config lives

This file and `~/.claude/agents/` are installed from the `claude/` folder of
the-pact repo. Edit the repo copy, then copy it into `~/.claude/`; a direct
edit to the live file drifts.

## Shell

**On Windows, use the PowerShell tool for shell commands. Do not use Bash.**
Both tools are exposed and the choice is the model's, so this is the only thing
selecting between them.

The reason is not taste: Git Bash here **fails silently**. `gh issue view <n>`
run through Bash returned empty output and exit 0 — indistinguishable from an
issue with no body — while the identical command through PowerShell returned the
issue. A wrong answer that looks like a right one is worse than an error.

Translate bash-shaped one-liners that skills hand you rather than reaching for
Bash to run them: `2>$null` for `2>/dev/null`, `Select-Object -First N` for
`head`, `$env:VAR` for `$VAR`, single-quoted here-strings (`@'…'@`, closing
delimiter at column 0) for multi-line arguments.

## Explain in plain language

Write explanations to hit the four outcomes of **ISO 24495-1:2023** (*Plain language — Part 1: Governing principles and guidelines*): the reader gets what they need, finds it, understands it, and can use it.

Applies to explanations, summaries, and answers in chat. Code, commit messages, and generated artifacts keep their own conventions.

- **Lead with the answer.** Conclusion first, supporting detail after.
- **Keep sentences short.** Around 20 words. Split multi-clause sentences.
- **Use active voice.** "Run the migration", not "the migration should be run".
- **Define a term the first time it appears**, including acronyms and internal names.
- **Bold the lead-in of each bullet** so a list scans.
- **Writing documentation files?** Use the `diataxis` skill — it classifies a doc as tutorial, how-to, reference, or explanation, and keeps those types unmixed.
- **Accuracy outranks simplicity.** When plain phrasing would make something wrong or vague, stay precise and explain the term instead.

## When a skill and these rules disagree

**A skill you invoke by name wins for that turn.** If you type `/<name>` or ask
for a skill by name, its rules take priority over the style rules above and
over the active output style until the turn ends. Name what it overrode in one
line, so the override is visible rather than silent.

**A skill that fired on its own does not win.** An auto-triggered skill loses to
these rules. Its own description decided it was relevant, and that is not the
same as you choosing it.

**What no skill overrides, invoked or not.** The Shell rule above — PowerShell,
not Bash, because Bash fails silently here. Any judgement about what is
destructive, irreversible, or unsafe to run. The stop-and-escalate signals in
"Implementing a change": a skill may replace that section's steps, never its
stops. And the claiming and coordination rules below: a skill that tells you to
claim a ticket is describing its own happy path, not the case where another
session is already on it.

## Implementing a change

Size the work first. If the change fits in one sentence, just do it, except
that the hard-to-reverse signal below still applies: a one-line auth change
comes to me first.

Otherwise, run this flow instead of implementing in the main session:

1. **Think before building.** Write the plan: the intent, the unhappy paths,
   the constraints, and each decision with its why. `plan-reviewer` reviews
   it; show me a table of its findings (its own headlines, with severity),
   and link its full findings, verbatim, in a kept file. I decide proceed,
   fix or kill. Never start building on READY alone.
2. **Build to the approved plan.** Send fully specified work to
   `spec-builder`, and work with design decisions left to `builder`.
   Anything touching auth, secrets, crypto or input validation goes through
   `security-reviewer` on the plan, then `security-builder`, whatever its
   size. If a named agent is unavailable, stop and report.
   Never substitute another agent, especially for security work.
3. **Verify, then hand back.** Tests and any gates the repo has decide pass
   or fail. `result-checker` advises: give me its verdict and a table of its
   findings (its own headlines, with severity), and link its full findings,
   verbatim, in a kept file. Never merge or summarise them. I decide
   whether it's done.

**When to stop or escalate is my call.** Tell me, and wait, when:

- the build or review has gone round twice without converging;
- the work has left the approved plan;
- the change is hard to reverse: auth, secrets, data migrations, or anything
  published;
- you can no longer explain why the result is right.

Name the options — keep going, get a second opinion from a different model
(`fable`), or stop — with your recommendation. Don't pick one yourself.

## Watching usage

Before starting anything expensive — several subagents, a workflow, an eval —
check my plan usage if a usage tool is available (the desktop app has one).
Tell me the weekly figure and a rough cost for what you're about to start. If
the weekly limit is above 75%, wait for my go-ahead. Never cut or stop work
because of usage on your own; that call is mine.

## When working a wayfinder map

Applies to `/wayfinder` in its **work through the map** mode, and to any session
resolving a ticket on a `wayfinder:map`. Charting a fresh map is unaffected.

**Name the ticket when you launch each parallel session.** Wayfinder honours it
— *"If the user named one, use it"* — so nothing self-selects and contention
cannot arise. This is the primary protection; the rules below catch what it
misses.

**Assignee is not a claim here.** Every parallel session authenticates as the
same GitHub user, so an assignee check cannot tell "mine, claimed a minute ago"
from "free to take". That is how gate G36 in stacks got claimed twice. The two rules below
exist because the tracker alone cannot answer the question.

**Check for a live session before claiming.** Call
`mcp__ccd_session_mgmt__list_sessions` and match candidates **on worktree name**.
Do not match on ticket number: transcript-searching an issue number hits every
session that merely read the map, which is all of them. A worktree match means
somebody is on it — pick a different ticket, or message them.

**Treat a ticket created in the last hour as presumed-live.** Get the window
with `gh issue list --json number,createdAt,assignees`. Inside that hour, a
ticket is presumed to belong to whoever made it, whatever its assignee says.
Confirm its author is finished before touching it. Presumed-live is the default
and silence does not clear it — no answer means still live.

**Message the session, don't guess.** Use
`mcp__ccd_session_mgmt__send_message` to ask the other session whether it is
done, rather than inferring from a stale transcript or an idle-looking process.
This is the cross-session case, which is the one that matters: parallel
wayfinder tickets run as separate sessions, so `SendMessage` — which reaches
teammates inside one session — does not reach them.

**Write shared files last, against a re-fetched tip.** The map body changes
under you while you work. Re-read it immediately before editing, never from the
copy you loaded at step 1.
