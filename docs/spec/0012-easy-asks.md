# Spec: easy asks go ahead on the session's own pick

Status: draft 2, after one spec round (spec pair and security pair), with its
fixes folded in. The spec counts once it is on `main`.

- **Business driver:** the owner's ask: easy, low-risk asks go ahead without a
  separate yes, and the owner reviews them after.
- **Trade-off:** interaction capability (fewer asks that wait) against safety
  and security (fewer steps the owner sees before they run). The side taken:
  a closed list of two easy asks goes ahead; everything that loosens a
  control, sends off the machine or changes who a session is stays as it is,
  and so does the install's apply (S4). Where nothing else decides, take the
  option that is cheaper to reverse.

<!-- toc -->

- [S1 Objective](#s1-objective)
- [S2 The easy asks](#s2-the-easy-asks)
- [S3 The rule text](#s3-the-rule-text)
- [S4 What stays as it is](#s4-what-stays-as-it-is)
- [S5 Records](#s5-records)
- [S6 Acceptance claims](#s6-acceptance-claims)
- [S7 Needs a human](#s7-needs-a-human)
- [S8 Rollback](#s8-rollback)

<!-- /toc -->

## S1 Objective

The rules file already makes every step it keeps for the owner a checkpoint,
with no stop of its own. A lead in the head chef's Auto mode still holds each
checkpoint for the owner's word, so an easy ask waits. The rules file gains
one bullet that names the easy asks, a closed list, and says no one holds
them, a lead in Auto mode included: they are checkpoints as the Checkpoints
bullet says, logged, flagged and listed in the result.

The issue's third example, running the install, is not on the list: the
install's apply stays the owner's word in chat (S4, owner decision D1).

## S2 The easy asks

The list is closed. An ask is easy only when it is one of these two:

1. **An edit to the owner's pact configuration that turns on an opt-in pact
   tool** that sends, fetches and posts nothing off the machine and holds no
   identity. The edit alone is easy; the install that applies it is not. Of
   the tools at the base, `poster` posts, `gh-app` holds an identity, and
   `clef` and `coverage` fetch or can send, so none of them is easy to turn
   on; a session judges each tool by what its doc says it does.
2. **Rebuilding the owner's Scriptorium page** from their own builder file
   with the installed builder kit in `~/.pact/builder/`, never from a
   checkout's or a clone's code.

Each easy ask is shown first: the session runs the config's dry run or the
kit's `--check` itself just before the step, and its output goes in the
record. One known step undoes it: the earlier configuration or builder file
restored, the page rebuilt.

Never easy, whatever the wording: an install's apply; `mise trust`; a step
that changes a security default, turns a control off or loosens it (a
permission or sandbox setting, a deny or ask rule, a guard or its pin);
writes a secret; changes who a session acts as; or starts anything that
sends, fetches or posts off the machine, now or later. These stay ordinary
checkpoints, so PACT-50's single kind of checkpoint holds.

## S3 The rule text

A new bullet in `claude/CLAUDE.md`'s "How the agent helps", straight after
"Checkpoints", outside every part, so no configuration edit reaches it:

> - **Easy asks.** Two asks are easy: an edit to my pact configuration that
>   turns on an opt-in pact tool that sends, fetches and posts nothing off
>   the machine and holds no identity, and rebuilding my Scriptorium page
>   with the installed Scriptorium kit. Run its dry run or
>   check yourself first and put the output in the record. Each is a
>   checkpoint as above that no one holds, a lead in Auto mode included.
>   Never easy: an install's apply, `mise trust`, or a step that changes a
>   security default, turns a control off or loosens it, writes a secret,
>   changes who a session acts as, or starts anything that sends, fetches or
>   posts off the machine.

It names no second list of acts that wait and no hard stop.

## S4 What stays as it is

- **`AGENTS.md`'s Installing section,** the install-apply rule included.
  **Owner decision D1:** the session's pick is to keep it, as the issue's
  third done-when says, and the bullet names an install's apply as never
  easy, so the wait holds outside this repo too. The owner may decide
  otherwise, as a spec change read by the spec pair and the security pair.
- **The Guards** (`stop-and-escalate`), and the spec-change rules in
  `AGENTS.md`'s "Reviewing a change here".
- **The threat model's class texts**, "A session takes checkpoints alone"
  included, and `docs/threat-entries.json`.
- **The head chef skill** lives in grimoire. The new bullet comes from the
  owner's user-level rules. Aligning the skill's own Auto-mode text is a note
  for grimoire, not this change.

## S5 Records

- `docs/rule-reasons.md`, a row after Checkpoints: "Easy asks | A lead in the
  head chef's Auto mode holds each checkpoint for the owner's word, and no
  other guardrail names the few local steps no one holds, or keeps an install
  apply, mise trust, a loosened control, a secret, an identity or a send off
  the machine out of them."
- `CONTEXT.md`: the term **Easy ask**, from S2.
- `docs/threat-model.md`: in the "Rules it rests on" paragraph of the Text
  into a session boundary, after the checkpoint rule, the easy-asks rule with
  S2's exclusions. No class text changes.
- `builder/default-config/` refreshed with `node builder/default-config.mjs`.
- A dated log in `docs/log/`.

## S6 Acceptance claims

- **C1** A render of the rules file holds one "Easy asks" bullet with both
  asks, the run-it-yourself check, "no one holds, a lead in Auto mode
  included", and every exclusion in S3. Backed by the new test in
  `gate/tests/render-config.test.mjs`.
- **C2** The installed default rules still hold one Checkpoints bullet and
  none of PACT-50's cut strings (the existing S13 test in
  `gate/tests/builder-install.test.mjs`, unchanged).
- **C3** `AGENTS.md`, the `stop-and-escalate` block, the threat model's class
  texts and `docs/threat-entries.json` are byte for byte as at the base (the
  diff).
- **C4** `docs/rule-reasons.md` has the S5 row, and `builder/default-config/`
  matches `node builder/default-config.mjs` (existing tests).
- **C5** The full suite passes in CI's three jobs on the reviewed head.
- **C6** Accepted unverified until the owner's field check (S7): a lead in
  Auto mode, with the rules installed, takes an easy ask without a waiting
  entry. Nothing here can run the grimoire skill.

## S7 Needs a human

- **D1:** before the PR merges. The session's pick: keep the install apply
  the owner's.
- **The security findings from the spec round** are checkpoints for the
  owner (review.md's Threat model step 5), listed in the record.
- **Merge:** on CI's three jobs green at the reviewed head.
- **Install:** after merge, the dry run then the apply, on the owner's
  go-ahead; and the regenerated `cloud-sessions/cloud-setup-wrapper.sh`
  pasted into the cloud environment's setup field again.
- **Field check (C6):** in the first lead session at Auto after the install.

## S8 Rollback

Revert the PR, then dry run and apply. If the dry run shows drift or the
behind warning, stop and ask, as `AGENTS.md` Installing says. No
configuration key is added, so no person's configuration needs a change.
