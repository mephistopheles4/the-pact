# Plan: resume builders before respawning, and keep local handover notes

*Status: draft 3, for `security-reviewer` (changed parts only), then `plan-reviewer` round 2. Written 2026-09-27.*

*History: round 1 (`.review-1.md`) fixes are in draft 2. `security-reviewer` round 1 (kept locally, gitignored, because it lists home paths) found five high findings, S1–S5, all of which came mostly from committing and publishing the notes. **The owner chose (2026-09-27): notes stay local only, never committed or posted, plus the S4 fix.** Draft 3 also folds in S6, S8 and S10. S9, the canary probe, is dropped, because local-only notes lower the stakes.*

## Intent

When a builder's work needs a fix, a fresh builder re-discovers everything the last one learned. In the ADR/log work on 2026-09-27, builder pass 1 cost about 169k tokens. Re-tasking the *same* builder for pass 2 cost about 30k. Two changes cut that re-discovery:

1. **Resume first.** When a builder's own work needs a fix inside the approved plan, the main session re-tasks the same agent, which keeps its context, instead of spawning a new one.
2. **Local handover notes.** Builders end their final message with four fixed sections. The main session keeps them on this machine, outside any repo, so that a fresh builder or a later session can catch up by reading, not re-exploring.

## Non-goals

- **No hooks.** A capture-only `SubagentStop` hook is follow-up F3 in the backlog.
- **Notes are never committed and never posted,** in any project. They are catch-up aids, not records. Records are ADRs and logs (ADR 0007).
- **Reviewers and checkers are unchanged.** They are never resumed and write no notes, because fresh context is the point of them.
- **"Builder hand-off" keeps its meaning:** sending a step to a builder, which the human-in-the-loop gate checks.

## Decisions

### D1. When to resume, and when not to

**A resume is a builder hand-off, so the human-in-the-loop gate applies to it** (S4). Resume only when the new work is a fix inside the approved plan, to the same builder's own work, in the same session. Start fresh when:
- **the approach was wrong** — a resumed agent keeps its wrong beliefs;
- **the session has ended** — the context is gone;
- **the work belongs to a different builder** — for example, security work;
- **the work is new scope** — it goes back through the plan. For security work, that means back through `security-reviewer` first, whether the builder is resumed or fresh (S4);
- **the builder has read secret values or untrusted content, and the next output is public-facing** (S10).

**A resumed agent keeps the definition it was spawned with** (S10). After an install mid-session, only a fresh agent follows the new rules.

**Why:** a resumed agent is cheap but not neutral. It fits corrections within a sound, approved approach, and nothing else.

### D2. The handover-notes format

Four headings, at the end of every builder's final message, after the existing report:
- **Learned** — conventions and surprises a newcomer would trip on.
- **Dead ends** — what was tried, and why it failed.
- **Touched** — the files that changed.
- **Next** — what's left, or "nothing".

They are written for a fresh builder with none of the context: facts and paths, not narrative.

### D3. Where the notes live: local only

The main session keeps **only the four headings and what is under them** (S6) in `~/.claude/handover/<repo>/<work>-notes-N.md`. That location is outside every repository, so no project's git can pick the notes up, and no tracker ever sees them. When a fresh builder picks up the work, the main session **quotes** the latest notes into its brief (S5's local form). It never tells a builder to go and fetch them.

**Why local:** committing or posting the notes is what created S1, S2, S5 and S7. The notes lose nothing important by staying local. What lasts goes into ADRs and logs, which have their own privacy checks. The cost: cloud sessions and other machines don't get the notes.

### D4. One test for what may go in the notes, applied by both writer and keeper

**The test, word for word in both places** (S8): *nothing secret or personal* — no secret values, credentials, tokens or keys, no personal data, and no text copied from gitignored or private files. **The writer** (a builder) names where such things are held instead. **The keeper** (the main session) reads the notes before saving them. If they fail the test, the keeper doesn't save them. It tells the owner which heading and which kind of data is involved, **never the value**, and waits (S3).

**Why still a rule when the notes are local:** a local file is still plaintext on disk, and the notes are quoted into later briefs.

## Exact edits

### E1. `claude/CLAUDE.md` — insert after the "Relay every blocked agent" paragraph, before "When to stop or escalate is my call"

```markdown
**Resume a builder before starting a new one.** When a builder's own work
needs a fix inside the approved plan, re-task the same agent: it keeps its
context, and re-discovery is most of a fresh builder's cost. A resume is a
builder hand-off, so the gate above applies. Start a fresh one when its
approach was wrong, when the session has ended, when the work belongs to a
different builder, or when it is new scope — new security scope goes back
through `security-reviewer` first. Start fresh too when the builder has read
secrets or untrusted content and the next output is public-facing. A resumed
agent keeps the definition it was spawned with. Never resume a reviewer or
a checker; fresh context is the point of them.

**Keep builders' handover notes, locally.** Builders end their final message
with handover notes: **Learned**, **Dead ends**, **Touched**, **Next**. Read
them first: they must hold nothing secret or personal — no secret values,
credentials, tokens or keys, no personal data, no text copied from gitignored
or private files. If they fail that, don't save them; tell me which heading
and what kind of data, never the value, and wait. Otherwise save only those
four headings to `~/.claude/handover/<repo>/<work>-notes-N.md`: never in a
repository, never posted anywhere. When a fresh builder picks up the work,
quote the latest notes into its brief.
```

### E2. `claude/agents/builder.md`, `spec-builder.md`, `security-builder.md`

Insert this paragraph immediately after each file's `Final message line 1, exact: STATUS…` paragraph, and before its `Final message:` line, in the files' terse style:

```markdown
Final message ends with handover notes, four headings: **Learned** (conventions, surprises), **Dead ends** (tried, failed, why), **Touched** (files changed), **Next** (what's left, or "nothing"). Write for a fresh builder with none of your context — facts and paths, not narrative. Nothing secret or personal — no secret values, credentials, tokens or keys, no personal data, no text copied from gitignored or private files; name where such things are held instead.
```

### E3. Install

After merge, and only on the owner's go-ahead: first check the live files for drift, then copy `claude/CLAUDE.md` and the three builder files into `~/.claude/`, and confirm the hashes match (AGENTS.md install rules).

## Build route

`security-builder` applies E1 and E2 verbatim (the owner's routing). `security-reviewer` re-reviews only what changed since its round 1 — D1, D3, D4, E1 and E2 — and its findings and dispositions go under "Security review" before `plan-reviewer` round 2.

## Security review

**Round 1 (draft 2), dispositions:**

| Finding | Disposition |
|---|---|
| S1 Denylist misses classes | Mostly removed: notes are never committed or posted (D3). The remaining test is widened to personal data and gitignored or private text (D4). |
| S2 Safe alternative signposts a weakness | Removed: notes are never public (D3). |
| S3 Refusal fails availability; no wait | Fixed: the keeper names the heading and the kind of data, never the value, and waits (D4, E1). |
| S4 Resume on "an addition" bypasses pre-approval | Fixed: a resume is a builder hand-off and the gate applies; resume only inside the approved plan; new security scope goes back through `security-reviewer` (D1, E1). |
| S5 Public comments as injection | Removed for the tracker, since notes are never posted. Local form fixed: the main session quotes notes into briefs, and builders never fetch them (D3, E1). |
| S6 Keeper scope unstated | Fixed: only the four headings are saved (D3, E1). |
| S7 Standing permission to publish | Removed: notes are never posted, in any project (D3, E1). |
| S8 Lists don't match | Fixed: one test, the same words in E1 and E2 (D4). |
| S9 No test of the rule | Dropped by the owner: local-only notes lower the stakes. |
| S10 Resumed context and stale definitions | Fixed: added to D1's start-fresh list, and the stale-definition effect is noted (D1, E1). |

**Round 2 (draft 3):** *to be filled in.*

**Out of scope, raised by round 1:** home-directory paths in committed review files. That is the owner's call, separate from this plan.

## Needs a human

- **E3 install** — *after dispatch; kept in the main session.* It overwrites live config, so it runs only on the owner's go-ahead.
- **The probe (A4)** — *after dispatch; kept in the main session.* It needs the install, and part of it runs in a fresh session that the owner starts.
- **E1, E2** — *at sign-off.* The plan gives the exact text; they go to `security-builder`.
- **Usage** — *at sign-off.* Weekly usage is 96%. The owner asked for this now, knowing that.

## Acceptance

- **A1.** `claude/CLAUDE.md` contains E1's two paragraphs, between the "Relay" paragraph and "When to stop or escalate". After the edit, "hand-off" appears in `claude/CLAUDE.md` only in the gate's meaning.
- **A2.** Each builder file contains E2's paragraph exactly once, after its `STATUS` paragraph and before `Final message:`. The "nothing secret or personal" wording is identical in E1 and E2.
- **A3.** `git diff --stat` touches only those four files.
- **A4 (probe, after install).** The expected result is committed before the run.
  - **Control, in this session.** Its `spec-builder` has the old definition. Dispatch it with a tiny, safe task and a brief that doesn't mention notes. Expected: no handover notes. This is the run in which the probe is seen to fail.
  - **Test, in a fresh session.** The same brief. Expected: the final message ends with all four headings.
  - **Lever 1 is not probed.** It is a main-session rule, checked by use.

## Unhappy paths

- **Notes hold something secret or personal.** The writer's test forbids it (E2). The keeper refuses to save them, names the heading and the kind of data but not the value, and waits (E1).
- **Notes are lost with the machine,** or are missing in a cloud session. That's accepted (D3). Anything that must last goes into an ADR or a log.
- **Notes grow into narrative.** D2 says facts and paths only. Cap them if they run long in practice.
- **A resumed builder carries a wrong belief, or stale rules.** D1 says start fresh; the owner's review and `result-checker` still check every result.

## Rollback

`git revert` the build commit. Re-copying the reverted files into `~/.claude/` is an install, so it follows E3's rules: the owner's go-ahead, a drift check first, and a hash check after. Saved notes under `~/.claude/handover/` can be left or deleted on the owner's say.

## Stop conditions

Stop and tell the owner if:
- `security-builder` returns anything but `STATUS: DONE`;
- review goes round twice without converging (and offer a throwaway try, per ADR 0008);
- the diff touches anything but the four files;
- **the A4 control shows handover notes** — the probe can't then tell the new definition from the old one;
- **the A4 test run lacks any of the four headings**, even with `STATUS: DONE`.
