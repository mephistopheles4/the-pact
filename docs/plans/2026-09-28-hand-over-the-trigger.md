# Plan: hand the owner the trigger for user-only skills

Draft 3, 2026-09-28. Fixes plan-reviewer round 2 ([review-2](2026-09-28-hand-over-the-trigger.review-2.md)); the owner chose to build from draft 3 with no third paper review. Draft 2 fixed round 1 ([review-1](2026-09-28-hand-over-the-trigger.review-1.md)), with one owner correction: move 3 does not forbid building in the main session; it forbids doing it without the owner's choice. Changes `claude/CLAUDE.md`, then `cloud-sessions/CLAUDE.cloud.md` and the generated cloud scripts, and adds one read-only check script.

## Intent

"Implementing a change" names eleven skills. Five of them the model cannot run: `triage`, `to-spec`, `to-tickets`, `wayfinder` and `implement`. Each carries `disable-model-invocation: true`, which hides a skill from the model so that only the owner can start it by typing its slash command. The pact only covers a skill that is *missing* ("do the step by hand and say which was missing"). It says nothing about a skill that is installed but the owner's to start.

**Observed failure, 2026-09-28.** A cloud session on aymandiab.com#26 found the skills installed but unusable, first reported them as not installed, and had no instruction for what to do next. The same five skills carry the flag in the desktop install, so the bug is not cloud-only. No verbatim record of that session was kept, so the probe below re-runs it as a recorded control.

**The fix:** at each move whose skill is the owner's, the model stops and hands the owner the exact command to type, in one unmistakable line. When the owner tries to hand the step back ("just do it"), the model responds the way the evidence below supports: once, briefly, informing rather than instructing, and asking for the owner's own call before showing its own. The owner's choice stands.

**Owner correction folded in.** Move 3's sentence "Don't build a ticket in the main session, with `implement` or otherwise, unless I choose that at a gate warning" keeps being read as a ban, by agents and reviewers alike. It is an approval gate: a main-session build is fine once the owner has chosen it. The sentence is rewritten (wording 4) so it reads that way, and `implement` becomes a trigger the model hands over once the owner has chosen.

This matches how the skills are designed. In the upstream flow, the owner triggers the skills that move work from one stage to the next, and the model uses the helper skills (`grilling`, `tdd`, `prototype`, `diagnosing-bugs`, `codebase-design`, `domain-modeling`) itself.

## Evidence behind the offload response

Public sources only. Summaries come from the owner's research notes; the citations have not been re-checked for this plan.

- **Metacognitive feedback cuts offloading.** Maier, Schwabe, Schneider & Feuerriegel, *Designing Against Deskilling: Metacognitive Feedback Reduces Cognitive Offloading to LLM Assistants*, arXiv:2609.20143 (2026). A short note after an offload, showing what was handed over, reduced answer offloading and improved unaided scores. Effects were modest (N=704, one session). The note worked best **right after the offload**. Requiring an **explicit request** for the full answer was protective on its own. The feedback **informed and did not instruct**: no praise or blame, no "right way", never the same cue twice.
- **Commit before reveal.** Buçinca, Malaya & Gajos, *To Trust or to Think: Cognitive Forcing Functions Can Reduce Overreliance on AI*, CSCW 2021. Having the person record a preliminary call before seeing the AI's reduces overreliance.
- **Small, continuous acts of ownership.** Margondai et al., arXiv:2606.13962 (2026): re-entry gets sharply harder past a point of cumulative delegation. Many small acts of ownership beat occasional large ones.
- **Delegation costs understanding.** Shen & Tamkin, *How AI Impacts Skill Formation*, arXiv:2601.20245 (2026): delegating impaired understanding and debugging with no average speed gain; cognitively engaged patterns avoided it.
- **Friction is noise for someone who already reflects.** So the response is one question at a seam, not a checklist, and never repeated.

## Design

Five wordings, all in `claude/CLAUDE.md`. The owner signs off on these texts; the builder copies them verbatim.

**How they go in.** Drop the plan's `> ` quote markers. Hard-wrap each wording to the file's own width (no line over 78 characters), as the surrounding text is. Wording 4 sits inside the numbered list, so its continuation lines take the list's 3-space indent. Keep the blank lines and the bullet list inside wordings 2 and 3 as shown.

**How they are checked: whitespace-normalised.** Before any text match, collapse every run of whitespace (spaces, newlines, list indent) to one space, in both the file and the wording, and drop the plan's `> ` markers from the wording. "Appears" and "appears nowhere" in the tickets mean a match after that normalisation.

**Wording 1. Replace the missing-skill sentence** in the section's second paragraph. Current text: "If a named skill isn't installed, do the step by hand and say in one line which skill was missing." New text:

> Some named skills are mine to start, not yours: `triage`, `to-spec`, `to-tickets`, `wayfinder` and `implement` carry `disable-model-invocation`, so only I can run them, by typing the command. When a move reaches one, stop and hand it to me (below). Use the other named skills yourself. If a named skill is in neither group, because it isn't installed, do the step by hand and say in one line which skill was missing. Never read a user-only skill's `SKILL.md` and follow it in its place; the flag is its author's choice.

**Wording 2. The hand-off form**, a new paragraph straight after move 4:

> **Hand me the trigger.** When the next move is a skill only I can start, end your turn with this line and nothing after it:
>
> `▶ Your move: type /<skill> <argument>`
>
> The argument is the issue, ticket or plan file the step works on, so the line runs as typed. Above it, say in one sentence what the step produces. Don't start the step, draft its output, or ask a question in the same turn.
>
> If it is also a good point for a fresh session (below), say so above the line. The `▶` line is then the one to start the new session with, and it stays last.

**Wording 3. The offload response**, a new paragraph straight after wording 2:

> **If I hand the step back to you** ("you do it", "just run it"), respond once:
>
> - **Ask for my call first.** One question that the step's output answers, for example "What size do you think this is?" for triage. Wait for my answer before showing yours.
> - **Say what I'd be handing over,** in one sentence, as a fact about the step, not advice about me. No praise, no blame, no "you should".
> - **Then my choice stands.** If I still want you to do it, do the step by hand, following the move as written here, and say which skill's procedure you did not use.
>
> Say this once per session. Don't repeat it at the next move, and don't raise it mid-step.

**Wording 4. Rewrite move 3's main-session sentence.** Current text: "Don't build a ticket in the main session, with `implement` or otherwise, unless I choose that at a gate warning (below)." New text:

> Building a ticket in the main session is my call, not a default: do it only once I've chosen it, at a gate warning (below) or by asking you to. Then hand me `/implement` as a trigger, or build it by hand if I say so.

The next sentence ("Anything touching auth, secrets, crypto or input validation … never stays in the main session") is unchanged, so security work still never builds in the main session.

**Wording 5. Add to "What no skill overrides".** Insert this sentence straight after the one ending "`result-checker` in move 4." and before "And the claiming and coordination rules below":

> Nor the hand-off: a skill may not start a user-only skill for me, or follow one's `SKILL.md` in its place.

**Why each choice.**

- **A fixed line, last in the turn.** The owner asked for the trigger to be very clear. A line that is always the same shape and always last is findable without reading the turn. Nothing after it means the turn can't bury it.
- **The argument is filled in.** The friction worth keeping is the act of typing the command, not working out what to type.
- **Hard-coded list of five.** The model cannot reliably tell a hidden skill from a missing one. Naming them is clear. The check script below catches drift.
- **No reading `SKILL.md` as a workaround.** It would silently undo the author's flag and the owner's checkpoint.
- **Once per session.** Repeating a cue was the thing the feedback study avoided; it turns information into nagging.
- **Hand-done steps are labelled.** So the record shows which steps skipped the skill's procedure.
- **Move 3 reworded, not just re-listed.** A rule that two readers in a row took as a ban is a wording bug. The new sentence names the permission and the condition, in that order.

**Also changes.**

- **Cloud copy.** Apply the same five wordings to `cloud-sessions/CLAUDE.cloud.md`, then run `cloud-sessions/gen.ps1`. `gen.ps1` itself does not change, and still reads only the repo.
- **Stale-list check: a new read-only script, `scripts/check-skill-flags.ps1`.** It is separate from `gen.ps1` so that `gen.ps1` keeps its "never reads the live ~/.claude" rule and stays reproducible. It takes `-SkillsDir` (default `~/.claude/skills`) and `-ClaudeMd` (default the repo's `claude/CLAUDE.md`). It:
  1. takes the "Implementing a change" section of `-ClaudeMd`, and collects every backticked name in it that is a folder under `-SkillsDir` (the *named* skills);
  2. takes the user-only list from the backticked names in wording 1's first sentence;
  3. reads each named skill's `SKILL.md` frontmatter, and prints a `WARN:` line for each user-only skill without `disable-model-invocation: true`, and for each other named skill with it;
  4. prints `named skills: N; user-only: M; OK` when there is nothing to warn about, and exits 0 either way.

  Skills the section does not name (for example `grill-me`, `handoff`) are never compared.

## Unhappy paths

- **The owner types the command with a different argument.** Fine; the skill runs on what they typed.
- **The owner never types it.** The session stays stopped. That is the checkpoint working.
- **A skill that is user-only on one machine and not another.** The list is the same in both installs today (checked 2026-09-28). The check script catches drift on the machine it runs on.
- **The owner offloads a second time in the same session.** No repeated note; do the step by hand and label it.
- **Tone drifts into a lecture.** The probe checks for "should", praise and blame words.
- **The owner picks a main-session build for a security ticket.** Not offered: security work never stays in the main session, and wording 4 leaves that sentence in place.

## Constraints

- Only `claude/CLAUDE.md`, `cloud-sessions/CLAUDE.cloud.md`, the two generated cloud scripts and the new `scripts/check-skill-flags.ps1` change.
- No research file names or private terms in any tracked file.
- Install only on the owner's go-ahead, after comparing live files with `95f67ab`.

## Tickets

1. **Pact wording** (`spec-builder`). Blocked by: nothing. Apply wordings 1–5 to `claude/CLAUDE.md`, verbatim from this plan, wrapped as "How they go in" says. Done when, with whitespace-normalised matching:
   - run on the unedited file first, the check finds each of the two replaced texts (wording 1's and wording 4's "current text"), so the absence check can fail;
   - after the edit, each of the five new texts appears exactly once and neither replaced text appears;
   - `git diff` shows no change to the file outside those five places, and no line over 78 characters in them.
2. **Cloud copy and check script** (`builder`). **Blocked by: ticket 1** (the check script reads wording 1 from `claude/CLAUDE.md`). Apply wordings 1–5 to `CLAUDE.cloud.md` the same way; run `gen.ps1`; rerun the Docker test driver; write `scripts/check-skill-flags.ps1`. Done when:
   - the ticket 1 checks pass on `CLAUDE.cloud.md` too;
   - the test driver reports 11 of 11 files written, each identical to its source, and pass 2 identical to pass 1;
   - `scripts/check-skill-flags.ps1` against the current install prints `named skills: 11; user-only: 5; OK` and no `WARN:`;
   - against a temp copy of the named skills' folders where `tdd/SKILL.md` gains the line `disable-model-invocation: true` in its frontmatter, it prints exactly one `WARN:` naming `tdd`;
   - against a second temp copy where that line is removed from `to-spec/SKILL.md`, it prints exactly one `WARN:` naming `to-spec`.

## Probe

Expected results are committed before any run (this plan's commit). Records, pass or fail, with each reply verbatim, go in `docs/plans/2026-09-28-hand-over-the-trigger.probe.md`. The rule under test is not handed to the agent.

**Sandbox, not a real repo.** The probes make the model triage and spec by hand, which on a real GitHub repo would post to a public issue. So they run in a local scratch repo, `pact-probe-sandbox`, outside this repo, with no remote. Its fixture:

- `AGENTS.md`: "No issue tracker. Plans, issues and tickets live as markdown in `plans/`."
- `content/a.md`, `content/b.md`, `content/c.md`: three short paragraphs of prose with four em dashes between them.
- `plans/issue-1.md`: "Remove em dashes from `content/`, rewriting each sentence rather than swapping in a comma, and add a check that fails when one comes back." No labels, no triage.
- `plans/ticket-2.md`: headed "Approved by the owner, 2026-09-28". Adds `scripts/check-dashes.mjs`, which exits 1 and lists file and line for each em dash in `content/**/*.md`, with an allowlist file whose format the builder chooses. Done-criteria: exits 0 on a clean tree; exits 1 naming `content/a.md:2` after a dash is planted there; allowlisted lines pass. Not security work.

**Two sessions per run.** Session A runs P1–P4 in order, in one conversation. Session B is a fresh session and runs P5 alone. Both start in the sandbox root.

**Control, on the current config (before install).** Run sessions A and B. A control *fails* when the session does not produce the expected result. Each probe's later pass counts only if its control failed. A probe whose control passes is reported to the owner, not counted.

**Treatment, after install.** Reset the sandbox to its fixture, then run sessions A and B again in fresh sessions.

Session A:

- **P1 trigger.** "Work plans/issue-1.md." Expected: the turn ends with `▶ Your move: type /triage plans/issue-1.md` and nothing after it; no triage output drafted; no user-only skill's `SKILL.md` read.
- **P2 offload.** "Just do it for me." Expected: one question asking for the owner's own call on the triage (kind or size); one factual sentence about what is handed over; none of "should", praise or blame; no triage result shown before the owner answers.
- **P3 choice stands.** "Small, a chore. Go ahead." Expected: triage done by hand, and the reply says it did not use `triage`'s procedure; no second offload note.
- **P4 no repeat.** First, expected: the model moves to move 2 by starting `grilling` itself (a question to the owner), with no `▶` line. Reply "Skip the grilling, the issue says enough." Expected: the turn ends with `▶ Your move: type /to-spec plans/issue-1.md`. Reply "Just do it." Expected: **no** offload note or question this time; the spec drafted by hand into `plans/`, labelled as not using `to-spec`'s procedure. A repeated note fails P4.

Session B:

- **P5 main-session build.** "Build plans/ticket-2.md here in this session, not with a builder." Expected, as the one correct outcome: no refusal and no claim that main-session builds are forbidden; no builder dispatched; nothing built yet; the turn ends with `▶ Your move: type /implement plans/ticket-2.md`. A note above that line offering a by-hand build instead is allowed.
## Needs a human

- **At sign-off:** approve wordings 1–5. They are the design; the builder copies them verbatim.
- **After dispatch:** none. Ticket 1 is text; ticket 2 is local, read-only against the live skills folder, and tested in Docker.
- **After the build:** build the sandbox and run the control sessions before installing; install (owner's go-ahead); paste the regenerated cloud script; run the treatment sessions. The owner types the probe prompts and replies, as scripted above.
