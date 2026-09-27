# Plan: resume builders before respawning, and carry a hand-off

*Status: draft 1, for `plan-reviewer` round 1. Written 2026-09-27.*

## Intent

When a builder's work needs a fix, a fresh builder re-discovers everything the last one learned. In the ADR/log work on 2026-09-27, builder pass 1 cost about 169k tokens. Re-tasking the *same* builder for pass 2 cost about 30k. Two changes cut that re-discovery:

1. **Resume first.** When a builder's own work needs a fix or an addition, the main session re-tasks the same agent, which keeps its context, instead of spawning a new one.
2. **A hand-off in every builder report.** Builders end their final message with four fixed sections, so that a fresh builder, or a later session, can catch up by reading, not re-exploring.

## Non-goals

- **No hooks.** A capture-only `SubagentStop` hook is follow-up F3, to consider once these two changes show where catch-up still hurts.
- **No tracker work.** The repo doesn't exist yet. Hand-offs move to issue comments when it does. This plan only says so.
- **Reviewers and checkers are unchanged.** They are never resumed and get no hand-off section, because fresh context is the point of them.

## Decisions

### D1. When to resume, and when not to

Resume when the fix or addition is to the same builder's own work, in the same session. Start fresh when:
- **the approach was wrong** — a resumed agent keeps its wrong beliefs;
- **the session has ended** — the context is gone;
- **the fix belongs to a different builder** — for example, security work routed to `security-builder`.

**Why:** a resumed agent is cheap but not neutral, so it fits corrections within a sound approach, not a change of approach.

### D2. The hand-off format

Four headings, at the end of every builder's final message, after the existing report:
- **Learned** — conventions and surprises a newcomer would trip on.
- **Dead ends** — what was tried, why it failed.
- **Touched** — files changed.
- **Next** — what's left, or "nothing".

It is written for a fresh builder with none of the context: facts and paths, not narrative. **Why these four:** they are exactly what a fresh builder has to rediscover (conventions, failed routes, where the change lives, what's open), and nothing else.

### D3. Where hand-offs are kept

Until the tracker exists, the main session keeps each builder hand-off verbatim beside the live plan, as `<plan>.handoff-N.md`, the same way it keeps review files. When the work finishes, hand-offs follow the plan: out of the tree, cited in the log's Record list. Once the repo exists, they are posted as comments on the issue. A fresh builder's brief points at the latest hand-off.

## Exact edits

### E1. `claude/CLAUDE.md` — insert after the "Relay every blocked agent" paragraph, before "When to stop or escalate is my call"

```markdown
**Resume a builder before starting a new one.** When a builder's own work
needs a fix or an addition, re-task the same agent: it keeps its context,
and re-discovery is most of a fresh builder's cost. Start a fresh one when
its approach was wrong, when the session has ended, or when the fix belongs
to a different builder. Never resume a reviewer or a checker; fresh context
is the point of them.

**Keep every builder's hand-off.** Builders end their final message with a
hand-off: **Learned**, **Dead ends**, **Touched**, **Next**. Keep it
verbatim beside the live plan as `<plan>.handoff-N.md`, or as a comment on
the issue once the tracker exists. When a fresh builder picks up the work,
point its brief at the latest hand-off rather than letting it re-explore.
```

### E2. `claude/agents/builder.md`, `spec-builder.md`, `security-builder.md`

Insert this paragraph immediately after each file's `Final message line 1, exact: STATUS…` paragraph, and before its `Final message:` line, in the files' terse style:

```markdown
Final message ends with a hand-off, four headings: **Learned** (conventions, surprises), **Dead ends** (tried, failed, why), **Touched** (files changed), **Next** (what's left, or "nothing"). Write it for a fresh builder with none of your context — facts and paths, not narrative.
```

### E3. Install

After merge, and only on the owner's go-ahead: first check the live files for drift, then copy `claude/CLAUDE.md` and the three builder files into `~/.claude/`, and confirm the hashes match (AGENTS.md install rules).

## Needs a human

- **E3 install** — *after dispatch; kept in the main session.* It overwrites live config, so it runs only on the owner's go-ahead.
- **The probe (A4)** — *after dispatch; kept in the main session.* It needs the install, and part of it runs in a fresh session that the owner starts.
- **E1, E2** — *at sign-off.* The plan gives the exact text; they go to `spec-builder`.
- **Usage** — *at sign-off.* Weekly usage is 95%. The owner asked for this now, knowing that.

## Acceptance

- **A1.** `claude/CLAUDE.md` contains E1's two paragraphs, between the "Relay" paragraph and "When to stop or escalate".
- **A2.** Each builder file contains E2's paragraph exactly once, after its `STATUS` paragraph and before `Final message:`.
- **A3.** `git diff --stat` touches only those four files.
- **A4 (probe, after install).** The expected result is committed before the run.
  - **Control, in this session.** This session loaded agent definitions before the install, so its `spec-builder` still has the old definition. Dispatch it with a tiny, safe task and a brief that doesn't mention hand-offs. Expected: no hand-off section. This is the run in which the probe is seen to fail (AGENTS.md).
  - **Test, in a fresh session.** The same brief. Expected: the final message ends with all four headings.
  - **If the control *does* show a hand-off,** the probe can't tell the new definition from the old one, so it doesn't count.
  - **Lever 1 is not probed.** It is a main-session rule, not an agent definition. It is checked by use.

## Unhappy paths

- **A hand-off becomes a long narrative that costs more than it saves.** D2 says facts and paths only. If hand-offs run long in practice, cap them.
- **A resumed builder carries a wrong belief into the fix.** D1 says start fresh when the approach was wrong. The owner's review and `result-checker` still check every result.
- **Hand-off files clutter `docs/plans/`.** They leave with the plan when the work finishes (D3).

## Rollback

`git revert` the build commit, then re-copy the four files to `~/.claude/`.

## Stop conditions

Stop and tell the owner if: `spec-builder` returns anything but `STATUS: DONE`; review goes round twice without converging (and offer a throwaway try, per ADR 0008); the diff touches anything but the four files.
