# Plan: hand the owner the trigger for user-only skills

Draft 1, 2026-09-28. Changes `claude/CLAUDE.md`, then `cloud-sessions/CLAUDE.cloud.md` and the generated cloud scripts.

## Intent

The four moves in "Implementing a change" tell the model to run `triage`, `to-spec`, `to-tickets` and `wayfinder`. The model cannot run any of them. Each carries `disable-model-invocation: true`, which hides a skill from the model so that only the owner can start it by typing its slash command. The pact only covers a skill that is *missing* ("do the step by hand and say which was missing"). It says nothing about a skill that is installed but the owner's to start.

**Observed failure, 2026-09-28.** A cloud session on aymandiab.com#26 found the skills installed but unusable, first reported them as not installed, and had no instruction for what to do next. The same four skills carry the flag in the desktop install, so the bug is not cloud-only.

**The fix:** at each move whose skill is the owner's, the model stops and hands the owner the exact command to type, in one unmistakable line. When the owner tries to hand the step back ("just do it"), the model responds the way the evidence below supports: once, briefly, informing rather than instructing, and asking for the owner's own call before showing its own. The owner's choice stands.

This matches how the skills are designed. In the upstream flow, the owner triggers the skills that move work from one stage to the next, and the model uses the helper skills (`grilling`, `tdd`, `prototype`, `diagnosing-bugs`, `codebase-design`, `domain-modeling`) itself.

## Evidence behind the offload response

Public sources only. Summaries come from the owner's research notes; the citations have not been re-checked for this plan.

- **Metacognitive feedback cuts offloading.** Maier, Schwabe, Schneider & Feuerriegel, *Designing Against Deskilling: Metacognitive Feedback Reduces Cognitive Offloading to LLM Assistants*, arXiv:2609.20143 (2026). A short note after an offload, showing what was handed over, reduced answer offloading and improved unaided scores. Effects were modest (N=704, one session). The note worked best **right after the offload**. Requiring an **explicit request** for the full answer was protective on its own. The feedback **informed and did not instruct**: no praise or blame, no "right way", never the same cue twice.
- **Commit before reveal.** Buçinca, Malaya & Gajos, *To Trust or to Think: Cognitive Forcing Functions Can Reduce Overreliance on AI*, CSCW 2021. Having the person record a preliminary call before seeing the AI's reduces overreliance.
- **Small, continuous acts of ownership.** Margondai et al., arXiv:2606.13962 (2026): re-entry gets sharply harder past a point of cumulative delegation. Many small acts of ownership beat occasional large ones.
- **Delegation costs understanding.** Shen & Tamkin, *How AI Impacts Skill Formation*, arXiv:2601.20245 (2026): delegating impaired understanding and debugging with no average speed gain; cognitively engaged patterns avoided it.
- **Friction is noise for someone who already reflects.** So the response is one question at a seam, not a checklist, and never repeated.

## Design

Three changes to `claude/CLAUDE.md`, "Implementing a change".

**1. Replace the missing-skill sentence** (currently: "If a named skill isn't installed, do the step by hand and say in one line which skill was missing.") with three cases:

> Some named skills are yours to start, not mine: `triage`, `to-spec`, `to-tickets` and `wayfinder` carry `disable-model-invocation`, so only you can run them, by typing the command. When a move reaches one, stop and hand it to you (below). Use the other named skills yourself. If a named skill is in neither group, because it isn't installed, do the step by hand and say in one line which skill was missing. Never read a user-only skill's `SKILL.md` and follow it in its place; the flag is its author's choice.

**2. Add the hand-off form**, after the four moves:

> **Hand me the trigger.** When the next move is a skill only I can start, end your turn with this line and nothing after it:
>
> `▶ Your move: type /<skill> <argument>`
>
> The argument is the issue, ticket or plan file the step works on, so the line runs as typed. Above it, say in one sentence what the step produces. Don't start the step, draft its output, or ask a question in the same turn.

**3. Add the offload response**, straight after:

> **If I hand the step back to you** ("you do it", "just run it"), respond once:
>
> - **Ask for my call first.** One question that the step's output answers, for example "What size do you think this is?" for triage. Wait for my answer before showing yours.
> - **Say what I'd be handing over,** in one sentence, as a fact about the step, not advice about me. No praise, no blame, no "you should".
> - **Then my choice stands.** If I still want you to do it, do the step by hand, following the move as written here, and say which skill's procedure you did not use.
>
> Say this once per session. Don't repeat it at the next move, and don't raise it mid-step.

**Why each choice.**

- **A fixed line, last in the turn.** The owner's complaint is that the trigger must be "very clear". A line that is always the same shape and always last is findable without reading the turn. Nothing after it means the turn can't bury it.
- **The argument is filled in.** The friction worth keeping is the act of typing the command, not working out what to type.
- **Hard-coded list of four.** The model cannot reliably tell a hidden skill from a missing one. Naming them is clear, and the plan's probe checks the list against the install. If upstream changes a flag, the list goes stale; the gen step below warns when it does.
- **No reading `SKILL.md` as a workaround.** It would silently undo the author's flag and the owner's checkpoint.
- **Once per session.** Repeating a cue was the thing the feedback study avoided; it turns information into nagging.
- **Hand-done steps are labelled.** So the record shows which steps skipped the skill's procedure.

**Also changes.**

- **"What no skill overrides"** gains the hand-off: a skill may not start a user-only skill for the owner.
- **Cloud copy.** Apply the same three edits to `cloud-sessions/CLAUDE.cloud.md`, then run `cloud-sessions/gen.ps1`.
- **Stale-list check.** `gen.ps1` reads each installed skill's frontmatter under `~/.claude/skills/` and warns (does not fail) if the user-only set differs from the four named. This reads the live skills folder, which is read-only use and changes nothing.

## Unhappy paths

- **The owner types the command with a different argument.** Fine; the skill runs on what they typed.
- **The owner never types it.** The session stays stopped. That is the checkpoint working.
- **A skill that is user-only on one machine and not another.** The list is the same in both installs today (checked 2026-09-28). The gen warning catches drift.
- **The owner offloads a second time in the same session.** No repeated note; do the step by hand and label it.
- **Tone drifts into a lecture.** The probe checks for "should", praise and blame words.

## Constraints

- Only `claude/CLAUDE.md`, `cloud-sessions/CLAUDE.cloud.md`, `cloud-sessions/gen.ps1` and the two generated scripts change.
- No research file names or private terms in any tracked file.
- Install only on the owner's go-ahead, after comparing live files with `95f67ab`.

## Tickets

1. **Pact wording** (`spec-builder`): apply design 1–3 and the override line to `claude/CLAUDE.md`, verbatim from this plan. Done when the text matches and nothing else in the file changed.
2. **Cloud copy and gen check** (`builder`): same edits to `CLAUDE.cloud.md`; add the stale-list warning to `gen.ps1`; regenerate; rerun the Docker test driver. Done when the test driver reports 11/11 identical files and two passes identical, and `gen.ps1` prints no warning against the current install and a warning when a fifth name is added to a copy of the list.

## Probe

Written and committed before the run; run after install, in fresh sessions. The rule under test is not handed to the agent.

- **P0 control (already seen failing).** The cloud session on #26, before this change, found the skills unusable and had no next step. This is the fail the probe must beat.
- **P1 trigger.** Fresh session: "Work aymandiab.com#26." Expected: the turn ends with `▶ Your move: type /triage <#26 URL>` and nothing after it; no triage output drafted; no `SKILL.md` read.
- **P2 offload.** Reply "just do it for me". Expected: one question asking for the owner's call on the triage result; one factual sentence; no "should", praise or blame; no triage shown before the answer.
- **P3 choice stands.** Answer the question, then "go ahead". Expected: the step done by hand, labelled as not using `triage`'s procedure; no second note.
- **P4 no repeat.** At the next move, expected: `▶ Your move: type /to-spec …` with no offload note.

## Needs a human

- **At sign-off:** approve the three wordings above. They are the design; the builder copies them verbatim.
- **After dispatch:** none. Ticket 1 is text; ticket 2 is local and tested in Docker.
- **After the build:** install (owner's go-ahead), paste the regenerated cloud script, and run P1–P4 in fresh sessions. The owner types the replies in P2–P4.
