# Plan: resume builders before respawning, and keep handover notes

*Status: draft 2, for `security-reviewer`, then `plan-reviewer` round 2. Written 2026-09-27. Round 1 (`.review-1.md`) fixes: a no-secrets rule for the notes (F1); rollback follows the install rules (F2); both probe dead ends are stop conditions (F3); the concept is renamed "handover notes", because "builder hand-off" already names what the human-in-the-loop gate checks (F4). **The owner routed this plan through security** (2026-09-27), because F1 adds a rule about secrets: `security-reviewer` reviews the plan, and `security-builder` builds it.*

## Intent

When a builder's work needs a fix, a fresh builder re-discovers everything the last one learned. In the ADR/log work on 2026-09-27, builder pass 1 cost about 169k tokens. Re-tasking the *same* builder for pass 2 cost about 30k. Two changes cut that re-discovery:

1. **Resume first.** When a builder's own work needs a fix or an addition, the main session re-tasks the same agent, which keeps its context, instead of spawning a new one.
2. **Handover notes in every builder report.** Builders end their final message with four fixed sections, so that a fresh builder, or a later session, can catch up by reading, not re-exploring.

## Non-goals

- **No hooks.** A capture-only `SubagentStop` hook is follow-up F3 in the backlog, to consider once these two changes show where catch-up still hurts.
- **No tracker work.** The repo doesn't exist yet. Notes move to issue comments when it does. This plan only says so.
- **Reviewers and checkers are unchanged.** They are never resumed and write no handover notes, because fresh context is the point of them.
- **The term "builder hand-off" keeps its current meaning:** sending a step to a builder, which the human-in-the-loop gate checks. This plan doesn't use "hand-off" for anything else.

## Decisions

### D1. When to resume, and when not to

Resume when the fix or addition is to the same builder's own work, in the same session. Start fresh when:
- **the approach was wrong** — a resumed agent keeps its wrong beliefs;
- **the session has ended** — the context is gone;
- **the fix belongs to a different builder** — for example, security work routed to `security-builder`.

**Why:** a resumed agent is cheap but not neutral, so it fits corrections within a sound approach, not a change of approach.

### D2. The handover-notes format

Four headings, at the end of every builder's final message, after the existing report:
- **Learned** — conventions and surprises a newcomer would trip on.
- **Dead ends** — what was tried, why it failed.
- **Touched** — files changed.
- **Next** — what's left, or "nothing".

They are written for a fresh builder with none of the context: facts and paths, not narrative. **Why these four:** they are exactly what a fresh builder has to rediscover (conventions, failed routes, where the change lives, what's open), and nothing else.

### D3. No secrets in the notes, enforced at both ends

Notes are kept verbatim and may later be posted to a public issue, so nothing sensitive may be written in them. **The writer's rule:** no secret values, credentials, tokens or keys, and no details of an unpatched weakness. Name where they are handled instead — a file path, a ticket, or "the owner has it". **The keeper's rule:** the main session reads the notes before keeping them. If they contain any of that, it doesn't keep or post them; it tells the owner. That is a refusal, not a redaction, so "verbatim" still holds for everything that is kept. **Why both ends:** the writer knows what is sensitive, and the keeper is the last point before the text becomes durable or public.

### D4. Where the notes are kept

Until the tracker exists, the main session keeps each builder's notes verbatim beside the live plan, as `<plan>.notes-N.md`, the same way it keeps review files. When the work finishes, they follow the plan: out of the tree, cited in the log's Record list. Once the repo exists, they are posted as comments on the issue. A fresh builder's brief points at the latest notes.

## Exact edits

### E1. `claude/CLAUDE.md` — insert after the "Relay every blocked agent" paragraph, before "When to stop or escalate is my call"

```markdown
**Resume a builder before starting a new one.** When a builder's own work
needs a fix or an addition, re-task the same agent: it keeps its context,
and re-discovery is most of a fresh builder's cost. Start a fresh one when
its approach was wrong, when the session has ended, or when the fix belongs
to a different builder. Never resume a reviewer or a checker; fresh context
is the point of them.

**Keep every builder's handover notes.** Builders end their final message
with handover notes: **Learned**, **Dead ends**, **Touched**, **Next**. Read
them first: if they hold a secret value, a credential or details of an
unpatched weakness, don't keep or post them, and tell me. Otherwise keep
them verbatim beside the live plan as `<plan>.notes-N.md`, or as a comment
on the issue once the tracker exists. When a fresh builder picks up the
work, point its brief at the latest notes rather than letting it re-explore.
```

### E2. `claude/agents/builder.md`, `spec-builder.md`, `security-builder.md`

Insert this paragraph immediately after each file's `Final message line 1, exact: STATUS…` paragraph, and before its `Final message:` line, in the files' terse style:

```markdown
Final message ends with handover notes, four headings: **Learned** (conventions, surprises), **Dead ends** (tried, failed, why), **Touched** (files changed), **Next** (what's left, or "nothing"). Write for a fresh builder with none of your context — facts and paths, not narrative. Notes are kept verbatim and may be published: never put secret values, credentials, tokens, keys, or details of an unpatched weakness in them — name where those are handled instead.
```

### E3. Install

After merge, and only on the owner's go-ahead: first check the live files for drift, then copy `claude/CLAUDE.md` and the three builder files into `~/.claude/`, and confirm the hashes match (AGENTS.md install rules).

## Build route

`security-builder` applies E1 and E2 verbatim (the owner's routing). `security-reviewer` reviews this plan first, and its findings and dispositions are recorded below before `plan-reviewer` round 2.

## Security review

*To be filled in: `security-reviewer`'s findings, each with a disposition.*

## Needs a human

- **E3 install** — *after dispatch; kept in the main session.* It overwrites live config, so it runs only on the owner's go-ahead.
- **The probe (A4)** — *after dispatch; kept in the main session.* It needs the install, and part of it runs in a fresh session that the owner starts.
- **E1, E2** — *at sign-off.* The plan gives the exact text; they go to `security-builder`.
- **Usage** — *at sign-off.* Weekly usage is 96%. The owner asked for this now, knowing that.

## Acceptance

- **A1.** `claude/CLAUDE.md` contains E1's two paragraphs, between the "Relay" paragraph and "When to stop or escalate". After the edit, "hand-off" appears in `claude/CLAUDE.md` only in the gate's meaning.
- **A2.** Each builder file contains E2's paragraph, including the no-secrets sentence, exactly once, after its `STATUS` paragraph and before `Final message:`.
- **A3.** `git diff --stat` touches only those four files.
- **A4 (probe, after install).** The expected result is committed before the run.
  - **Control, in this session.** This session loaded agent definitions before the install, so its `spec-builder` still has the old definition. Dispatch it with a tiny, safe task and a brief that doesn't mention notes. Expected: no handover notes. This is the run in which the probe is seen to fail (AGENTS.md).
  - **Test, in a fresh session.** The same brief. Expected: the final message ends with all four headings.
  - **Lever 1 is not probed.** It is a main-session rule, not an agent definition. It is checked by use.

## Unhappy paths

- **Notes leak a secret or an unpatched weakness.** The writer's rule forbids it (E2), and the keeper reads the notes and refuses to keep or post them (E1, D3).
- **Notes become a long narrative that costs more than it saves.** D2 says facts and paths only. If notes run long in practice, cap them.
- **A resumed builder carries a wrong belief into the fix.** D1 says start fresh when the approach was wrong. The owner's review and `result-checker` still check every result.
- **Note files clutter `docs/plans/`.** They leave with the plan when the work finishes (D4).

## Rollback

`git revert` the build commit. Re-copying the reverted files into `~/.claude/` is an install, so it follows E3's rules: the owner's go-ahead, a drift check first, and a hash check after.

## Stop conditions

Stop and tell the owner if:
- `security-builder` returns anything but `STATUS: DONE`;
- review goes round twice without converging (and offer a throwaway try, per ADR 0008);
- the diff touches anything but the four files;
- **the A4 control shows handover notes** — the probe can't then tell the new definition from the old one, and there's no fallback control;
- **the A4 test run lacks any of the four headings**, even with `STATUS: DONE`.
