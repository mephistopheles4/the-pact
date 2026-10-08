# The moves name practices, not skills

**2026-10-08** — The default rules file stopped naming skills. Each move now says what the owner does, what the agent does and why, and a person binds their own skills through configuration blocks (mephistopheles4/the-pact#123, built as #126 to #130).

- **Default text:** names no skill outside the gated clauses. Agents (the lenses, `scout`) keep their names.
- **Binding convention:** a block names a skill as a code span (`name`) when the agent uses it, and as a command (`/name`) when only the owner starts it. The `▶ Your move` line hands over a bound command, and at a phase boundary it carries the start line of the next session. See [ADR 0028](../adr/0028-the-moves-name-practices-a-person-binds-their-own-skills.md).
- **"Matt Pocock's skills" preset set:** three example blocks, one per move, bring today's skills back on top of the new text.
- **Live since** the install of `bc78535` on 2026-10-08, with the owner's configuration `0fa7e1aa3b3f` (usage pause 90, no blocks).

## What it set out to do

The pact read as a wrapper around one person's tools. A person without those skills could not follow it, and a person with their own skills ended up with two tools named for one step. The owner wanted the moves to describe the practice from the owner's research, with skills left to configuration. No gated clause, clause file or gate code changes, so the work was proved by use, with no planted probe and no security route.

## How it was built

- **Plan.** Spec revision 1 was read by the spec pair and `unstated-lens`. The owner's pick was "none"; the lenses found eleven real gaps, and the owner decided "fix, then proceed". Revision 2 added: install only from a base that holds #100; the skill-flag check rewritten in the same ticket as the text; the builder workflow as its own ticket blocked on PR #120; the owner's live configuration read before install; and a way back. One proposed move 2 sentence (machine-side adversarial work) was cut because it replaced no skill.
- **Five tickets.** #126 the rules text, README line, no-skill-name test and skill-flag check; #127 the preset set and its render test; #128 the builder workflow, delivered by PR #120; #129 the ADR and the contract rows; #130 base check, install and the way back.
- **Move 4 findings were taken in the build sessions.** Examples: the skill-flag check now checks each form separately; the parallel-sessions passage no longer names the mapping skill; a shipped configuration binds the whole preset set.

## What the checks showed

- **Tests:** the full suite passed on #126 (1443 tests, 0 fail, 7 skipped).
- **Install:** the base held #100, #126, #127 and #129. No live configuration existed, so there was nothing to migrate. The owner approved the configuration file's bytes, saw the dry run (seam A pass, drift 0, delete none, overwrite `CLAUDE.md` only) and said "install". `-Apply` exited 0 with every file verified.
- **The measure was not run.** The baseline (the plan session and the #100, #126, #127 and #129 builds, on the old text) is posted. The owner chose to field test instead of recording after-install sessions, so the comparison does not exist. Gaps will come as issues from use.
- **The way back** is on #123: bind the preset set, or empty the edit list and reinstall `4e544ad`.
- **Close-out.** #128 had no PR of its own, so #130 carries this entry (the lead session's decision, recorded on #123).
- **Follow-ups:** #138 (research practices left out of scope) and #139 (the cloud-session mirror).

## Record

Issue comments that hold the verbatim plan, reviews and records:

- #123 triage: <https://github.com/mephistopheles4/the-pact/issues/123#issuecomment-6047264061>
- #123 spec revision 1: <https://github.com/mephistopheles4/the-pact/issues/123#issuecomment-6051959903>
- #123 `unstated-lens` on revision 1: <https://github.com/mephistopheles4/the-pact/issues/123#issuecomment-6051989617>
- #123 spec pair on revision 1: <https://github.com/mephistopheles4/the-pact/issues/123#issuecomment-6052011525>
- #123 spec revision 2: <https://github.com/mephistopheles4/the-pact/issues/123#issuecomment-6052077366>
- #123 lens dispositions, spec review: <https://github.com/mephistopheles4/the-pact/issues/123#issuecomment-6052082971>
- #123 correction to revision 2: <https://github.com/mephistopheles4/the-pact/issues/123#issuecomment-6052097714>
- #123 plan phase done: <https://github.com/mephistopheles4/the-pact/issues/123#issuecomment-6052178978>
- #123 measure baseline: <https://github.com/mephistopheles4/the-pact/issues/123#issuecomment-6059421912>
- #123 the way back: <https://github.com/mephistopheles4/the-pact/issues/123#issuecomment-6059440972>
- #123 close-out gap closed: <https://github.com/mephistopheles4/the-pact/issues/123#issuecomment-6060970230>
- #130 state before install: <https://github.com/mephistopheles4/the-pact/issues/130#issuecomment-6059441381>
- #130 installed: <https://github.com/mephistopheles4/the-pact/issues/130#issuecomment-6060221220>
- #130 measure skipped by the owner: <https://github.com/mephistopheles4/the-pact/issues/130#issuecomment-6064723733>
- #126, #127 and #129 hold their own QA pair, `unstated-lens` and Lens dispositions comments.
