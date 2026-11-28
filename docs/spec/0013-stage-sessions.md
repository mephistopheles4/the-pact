# Spec: a stage's own work runs in a session; a new model means a new session

Status: draft 3, after the spec pair's two rounds (the second final), with
their fixes folded in; three final-round mediums are drafted fixes for the
owner (S9).
The spec counts once it is on `main`.

- **Business driver:** the owner's ask: the rule is control, and the model
  split is a reference for how sessions follow the tier table, not a rule of
  its own. Where nothing else decides, take the option that is cheaper to
  reverse.
- **Trade-off:** a short rules file (PACT-34, stop rules growing) against a
  rule a session can act on. The side taken: one sentence in an existing move
  and one pointer in an existing paragraph; the detail goes in `review.md`,
  which sessions already read before a lens or a post.

<!-- toc -->

- [S1 Objective](#s1-objective)
- [S2 The move](#s2-the-move)
- [S3 The pointer](#s3-the-pointer)
- [S4 The reference](#s4-the-reference)
- [S5 Rule reasons and the ADR](#s5-rule-reasons-and-the-adr)
- [S6 Generated copies and records](#s6-generated-copies-and-records)
- [S7 Acceptance claims](#s7-acceptance-claims)
- [S8 Boundaries](#s8-boundaries)
- [S9 Needs the owner](#s9-needs-the-owner)

<!-- /toc -->

## S1 Objective

The tier table gives each stage a model, but nothing says how sessions move
between them. A session can run the build in a subagent, or switch a running
session's model; neither is what the owner meant. After this change:

- the move "Stay the owner" says a stage's own work runs where the owner can
  open it, steer it and stop it;
- `review.md` says how sessions follow the stages: the stage's own work in a
  session, never a subagent; a session carries the next stage while its model
  stays the same; a new model means a new session, started from the record;
- the rules file adds no rule of its own: no new bold-led item and no new
  `##` section, as `docs/rule-reasons.md`'s opening defines a rule.

## S2 The move

Edit `DEFAULT_PARTS.moves` in `builder/parts.mjs`: "Stay the owner" gains one
sentence at the end of its `text`, so the move reads:

> I own a result when I can verify it, reconstruct why it is right, and know
> when to stop it. Checks that could have failed are the evidence. A stage's
> own work runs where I can open it, steer it and stop it.

Then set the `moves` block of `claude/CLAUDE.md` to
`compileParts(DEFAULT_PARTS).moves`, byte for byte (the builder-page parts
test compares them); don't wrap it by hand.

The sentence names no harness, model or subagent: the moves hold with or
without AI. An owner who replaces the `moves` part keeps their own text; S3's
pointer still reaches the reference.

## S3 The pointer

The Workflow section's opening paragraph in `claude/CLAUDE.md` (outside any
block, so it survives an edited `workflow` part) becomes:

> Each stage: what each tier sets, the lenses to offer, where the work goes
> next. Which session runs each stage: `~/.pact/review.md`'s Sessions.

Wrap it at 78 columns, like the prose around it. It is a plain paragraph, so
it is no rule of its own; the Workflow row carries its reason (S5).

## S4 The reference

`claude/review.md` gains a section `## Sessions`, placed first, before
"Running a lens". Its opening paragraph becomes, whole:

> How sessions follow the stages, how to run a lens and how to handle its
> report. The rules file's Workflow says which lenses to offer, and when.

The section's text:

> How sessions follow the rules file's Workflow, under the move "Stay the
> owner": a stage's own work runs where I can open it, steer it and stop it.
>
> - **A stage's own work runs in a session,** never a subagent: the plan, the
>   spec, the build and its fixes. A subagent is one I can't open or steer.
>   Lenses, `scout` and other helpers may be subagents.
> - **The model is the stage's model role,** planning or executor, as the
>   tier and workflow tables give it. Where a harness names the effort in the
>   model id, a change of effort is still no change of model.
> - **A session carries the next stage while its model stays the same.** A
>   change of effort alone doesn't split it. Where a tier's Fits says "one
>   session" but its stages' models differ, the models decide.
> - **A new model means a new session,** started from the record on the
>   issue, or, with no record, from a hand-off note in its start prompt, so
>   the hand-off needs no transcript. Never switch a running session's model:
>   the switch drops the prompt cache, and the new model would carry the
>   whole old context.
> - **At the seam,** put the state and the open questions in the record. A
>   lead, or I, start the new session. Without a lead, end the stage there
>   and hand me its start prompt: the record, the next stage, its model and
>   effort, the standing goal with each narrowing I gave, and each open flag
>   or offer. Keeping going under a goal never means doing the stage's work
>   in a subagent.

In Posting, the sentence "At a phase boundary, put the state and the open
questions in the record, and propose a fresh session." becomes "Where the
model changes (Sessions), put the state and the open questions in the record,
and propose a fresh session."

Run `node docs/toc.mjs`: it covers `claude/review.md` and adds the line.

## S5 Rule reasons and the ADR

In `docs/rule-reasons.md`, with no row added:

- **Stay the owner** row: append "It also keeps a stage's own work where the
  owner can open, steer and stop it: a subagent is out of the owner's reach,
  and no harness keeps the work in a session."
- **Workflow** row: append "Its opening points to `review.md`'s Sessions, how
  sessions follow the stages: no harness splits a session where the model
  changes, and a model switch drops the prompt cache and makes the new model
  carry the old context."

A new ADR, `docs/adr/0180-a-session-splits-where-the-model-changes.md`
(re-check against `origin/main` before writing; take the next free number if
0180 is taken; 0179 was, by an open change),
amends [ADR 0011](../adr/0011-one-model-per-session.md): a session splits
where the model changes, not at every phase boundary, and a stage's own work
never runs in a subagent. ADR 0011 gains an "Amended by 0180" line, and the
ADR index its line.

## S6 Generated copies and records

- `node builder/build.mjs` refreshes `builder/scriptorium.html`, which embeds
  the parts and `review.md`.
- `node builder/default-config.mjs` is expected to write nothing (no `moves`
  block lives in `builder/default-config/`); the default-config test passing
  is the check.
- `$env:NODE_OPTIONS = $null; node cloud-sessions/gen.mjs` (POSIX:
  `env -u NODE_OPTIONS node cloud-sessions/gen.mjs`) regenerates
  `CLAUDE.cloud.md`, `cloud-setup.sh` and `cloud-setup-wrapper.sh`.
- `gate/tests/neutral-home.test.mjs`'s `NEUTRAL_RULES` gains two entries:
  the move's wrapped lines plus the new sentence, and the Workflow opening;
  each `from` occurs once in the fixture. Its C3 test is in the install tier,
  so run the `full` tier to see it. The QA pair reads that change.
- `docs/reference.md`'s "Stay the owner" row adds "; each stage's own work in
  a session the owner can open (`review.md`'s Sessions)".
- `docs/img/src/fig-01-moves.mjs` is unchanged: its body is a summary.
- A dated log, `docs/log/<date>-stage-sessions.md`, ending in a Record list
  of the PACT-97 comments; fold logs older than a month into
  `docs/log/older.md`, as work-records says.
- This spec's line goes at the top of `docs/spec/README.md`'s "All specs".

## S7 Acceptance claims

1. **The move and the pointer.** One test in `gate/tests/review.test.mjs`
   (the procedure's-text block), seen to fail at base `b2b2725e`:
   in `compileParts(DEFAULT_PARTS).moves`, whitespace collapsed, the item
   from `**Stay the owner.**` up to `**Nudge once.**` ends with S2's
   sentence; `claude/CLAUDE.md`'s `## Workflow` first
   paragraph includes "`~/.pact/review.md`'s Sessions"; and `claude/review.md`
   has a `## Sessions` heading. The file's header comment, which says only
   the last test reads the procedure's text, is updated.
2. **No new rule.** The rules file has no new bold-led item or `##` section.
   (Read at Test against the base, not a test: a count would pin the work.)
3. **The reference** holds S4's five items and the Posting sentence, each as
   written. (Read at Test.)
4. **The reasons and the ADR.** Both S5 rows carry their added text; ADR 0180
   exists and ADR 0011 points to it. (Read at Test.)
5. **Generated copies** are current: the full suite passes on CI's three jobs
   on the reviewed head, including the builder-page, default-config and
   cloud-session tests.
6. **The probe,** on Claude Code (S9). The expected result is posted on
   PACT-97 before any run: a fresh interactive session given a throwaway
   Standard ticket in a scratch repo runs Plan and Design in one session on
   the planning model, then starts or hands over a new session on the
   executor model for Build, with no build subagent and no model switch. Each
   run stops at the Build hand-over, or when Build starts elsewhere. The
   control runs before the install, on the render then installed, with its
   commit recorded; the treatment runs in the owner's first interactive
   session after the install. The pass counts only if the treatment differs.
   Every run is recorded verbatim on PACT-97; the merged log says the results
   are pending there, and a follow-up log entry records them. Not Test
   evidence for the merge.

## S8 Boundaries

- **Tier:** Standard. Not on the sensitive list (no auth, crypto, input
  validation or data migration).
- **Out of scope:** grimoire's head-chef copy ("A model change starts a fresh
  session") pointing to this reference (S9).
- **Never:** the build doesn't install, edit `~/.claude` or `~/.pact`, change
  the tier or workflow tables, or edit anything under `gate/tests/fixtures/`.
- **Stop:** if claim 1's test passes at base, stop and fix the test before any
  text edit.
- **Review:** the spec pair on this spec; at Test, the QA pair and the
  standards pair.
- **Rollback:** before an install, revert the PR. After one, revert, then
  install the reverted `main` through the dry run at the owner's go-ahead.

## S9 Needs the owner

- **The issue stays open after merge.** The PR doesn't close PACT-97; it
  closes when claim 6's probe is recorded on it.
- **The install** is the next install after merge, at the owner's go-ahead on
  the dry run.
- **The grimoire follow-up** is proposed in the result and filed when this PR
  merges, its trigger: before head-chef's next change to its starting
  reference.
- **Security, open, decided at spec approval, before Build:** every model
  seam starts a session from the record on the issue, a route the threat
  model already accepts ("Text into a session"). The change makes it the
  usual path but adds no input, permission or tool. Recommended: no security
  pair; at Test it would be a third pair, past the two-pair limit. Cheap to
  reverse: the pair can still be offered at Test.
- **Trade-offs from the final spec round,** each a drafted fix already in
  this draft, which the owner may reverse: the neutral-home entries made
  required (S6); the probe's ticket, stop point, control timing and record
  (S7 claim 6); and the security call's timing and recommendation (above).
