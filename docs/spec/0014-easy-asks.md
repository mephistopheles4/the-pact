# Spec: easy asks go ahead on the session's own pick

Status: draft 3, after one spec round (spec pair and security pair) and one
Test round (QA pair and security pair, declared final), with their fixes
folded in. The spec counts once it is on `main`.

- **Business driver:** the owner's ask: easy, low-risk asks go ahead without a
  separate yes, and the owner reviews them after.
- **Trade-off:** interaction capability (fewer asks that wait) against safety
  and security (fewer steps the owner sees before they run). The side taken:
  a closed list of two easy asks goes ahead; everything that loosens a
  control, sends off the machine or changes who a session is stays out, and
  so does the install's apply (S4). Where nothing else decides, take the
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

What this covers today is narrow. Of the issue's three examples, rebuilding
the Scriptorium page becomes easy. Turning on a tool is easy only for a tool
that sends, fetches and posts nothing and holds no identity: at the base that
is the cleaner alone. Running the install is not easy (S4, owner decision D1).

## S2 The easy asks

The list is closed. An ask is easy only when it is one of these two:

1. **An edit that only adds an opt-in pact tool to the owner's pact
   configuration's tools list,** for a tool that sends, fetches and posts
   nothing off the machine and holds no identity. The edit alone is easy; the
   install that applies it is not. Of the tools at the base, `poster` posts,
   `gh-app` holds an identity, and `clef` and `coverage` fetch or can send,
   so only `cleaner` qualifies; a session judges each tool by what its doc
   says it does. An edit that changes any other key, `decision-model`
   included, is not this ask.
2. **Rebuilding the owner's Scriptorium page** from their own saved builder
   file as it stands, with the installed kit in `~/.pact/builder/`, never from
   a checkout's or a clone's code or file. A change to the builder file is
   not this ask.

The session runs the dry run or check itself, never through `npx`, and puts
its verdict and counts in the record, never its raw output, as the install
docs share a dry run. Where it can't run it, the ask isn't easy. One known
step undoes each: the tool taken off the list again, the page rebuilt.

Never easy, whatever the wording: an install's apply; `mise trust`; a step
that changes a security default, turns a control off or loosens it (a
permission or sandbox setting, a deny or ask rule, a guard or its pin);
writes a secret; changes who a session acts as; or starts anything that
sends, fetches or posts off the machine, now or later. These stay ordinary
checkpoints, so PACT-50's single kind of checkpoint holds.

## S3 The rule text

A new bullet in `claude/CLAUDE.md`'s "How the agent helps", straight after
"Checkpoints", outside every part, so no configuration edit reaches it:

> - **Easy asks.** Two asks are easy: an edit that only adds an opt-in pact
>   tool to my pact configuration's tools list, for a tool that sends, fetches
>   and posts nothing off the machine and holds no identity; and rebuilding my
>   Scriptorium page from my own saved file as it stands, with the installed
>   Scriptorium kit. Run its dry run or check yourself, never through `npx`,
>   and put its verdict and counts in the record, never its raw output; where
>   you can't run it, the ask isn't easy. Each is a checkpoint as above that
>   no one holds, a lead in Auto mode included. Never easy: an install's apply,
>   `mise trust`, or a step that changes a security default, turns a control
>   off or loosens it, writes a secret, changes who a session acts as, or
>   starts anything that sends, fetches or posts off the machine, now or later.

It names no second list of acts that wait and no hard stop. The rules file's
other copies (the cloud copy, the builder page) are regenerated from it, and
the frozen rules fixture's mapping in `gate/tests/neutral-home.test.mjs`
gains it.

## S4 What stays as it is

- **`AGENTS.md`'s Installing section,** the install-apply rule included, which
  keeps an apply for the owner's go-ahead in this repo. **Owner decision D1:**
  the session's pick is to keep it, as the issue's third done-when says. The
  owner may decide otherwise, as a spec change read by the spec pair and the
  security pair.
- **What "never easy" does not do.** It keeps a step off the easy list; it
  adds no wait. Outside this repo, no installed rule holds an install's apply
  or `mise trust` for the owner's word, though the threat model's text says
  one does. That gap was there at the base and this change does not close it;
  it is an open item for the owner (S7).
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
- `builder/default-config/` checked with `node builder/default-config.mjs`;
  `cloud-sessions/` and `builder/scriptorium.html` regenerated.
- A dated log in `docs/log/`.

## S6 Acceptance claims

- **C1** A render of the rules file holds one "Easy asks" bullet with both
  asks, the run-it-yourself check and how its result is recorded, "no one
  holds, a lead in Auto mode included", and every exclusion in S3, ending on
  the last one. Backed by the new test in `gate/tests/render-config.test.mjs`.
- **C2** The installed default rules still hold one Checkpoints bullet and
  none of PACT-50's cut strings (the existing S13 test in
  `gate/tests/builder-install.test.mjs`, unchanged).
- **C3** `AGENTS.md`, the `stop-and-escalate` block, the threat model's class
  texts and `docs/threat-entries.json` are byte for byte as at the base (the
  diff).
- **C4** `docs/rule-reasons.md` has the S5 row (the diff), and
  `builder/default-config/`, `cloud-sessions/` and `builder/scriptorium.html`
  match their generators (existing tests).
- **C5** The full suite passes in CI's three jobs on the reviewed head.
- **C6** Accepted unverified until the owner's field check (S7): a lead in
  Auto mode, with the rules installed, takes an easy ask without a waiting
  entry. Nothing here can run the grimoire skill.

## S7 Needs a human

- **D1:** before the PR merges. The session's pick: keep the install apply
  the owner's in this repo.
- **The missing wait rule** (S4): whether an install's apply and `mise trust`
  should wait for the owner's word outside this repo, as the threat model
  says, or the threat model's text should change. Open for the owner; not
  this change.
- **The security findings from both rounds** are checkpoints for the owner
  (review.md's Threat model step 5), listed in the record.
- **Merge:** on CI's three jobs green at the reviewed head.
- **Install:** after merge, the dry run then the apply, on the owner's
  go-ahead; and the regenerated `cloud-sessions/cloud-setup-wrapper.sh`
  pasted into the cloud environment's setup field again.
- **Field check (C6):** in the first lead session at Auto after the install.

## S8 Rollback

Revert the PR, then dry run and apply. If the dry run shows drift or the
behind warning, stop and ask, as `AGENTS.md` Installing says. No
configuration key is added, so no person's configuration needs a change.
