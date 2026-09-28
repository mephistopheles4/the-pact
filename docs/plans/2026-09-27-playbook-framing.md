# Plan: frame the pact as the engineering playbook, and rebuild its flow on the four moves

*Status: draft 3, for `plan-reviewer` round 3. Written 2026-09-27. The owner settled the decisions marked "owner" in chat on 2026-09-27.*

*History:*
- *Draft 2 fixes all seven findings of `plan-reviewer` round 1 (`.review-1.md`). Finding 3 needed an owner call: the owner kept the gate's "keep it in the main session" option (D7). The owner confirmed the website URL.*
- *Round 2 (`.review-2.md`) found four narrower issues. Two rounds without READY is a stop; the owner chose to keep going (2026-09-27). Draft 3 fixes all four and adds D9 (C1c), the owner's session-length rule, which round 3 reviews for the first time.*

## Intent

The pact drifted from its purpose while it was being built. Its README opens with a metaphor and file paths, and never says why the repo exists. Its "Implementing a change" section is a three-step flow (plan, build, verify) that names none of the skills the owner relies on for software design.

Two changes put the purpose back:

1. **Framing.** The README states that the pact is a small, runnable version of the owner's engineering playbook, the agentic software development lifecycle (SDLC) published on the owner's website as *The Engineering Workflow Playbook*. It maps the playbook onto Anthropic's public *AI-Native SDLC playbook* and credits the skills and ideas the pact is built on.
2. **Flow.** "Implementing a change" in `claude/CLAUDE.md` is reorganized around the playbook's four moves. Each move names the skills from [mattpocock/skills](https://github.com/mattpocock/skills) that carry it out: triage, grilling, spec, prototype, tickets, test-first building at agreed seams. The issue tracker is the record throughout.

## Sources

All public. The owner's private research is the source of the thesis but is not cited, quoted or named in any tracked file.

- **The owner's website,** page *The Engineering Workflow Playbook*. Public. It names the four moves: "sense the work before you process it", "do the thinking before the doing", "checkpoint the seams", "stay the owner". It does not name the six stages.
- **Anthropic, *The AI-Native SDLC playbook*,** Louis Claxton, Applied AI team, published 2026-08-21: <https://claude.com/blog/the-ai-native-sdlc-playbook>. Six non-linear stages: Plan (`intent.md`), Design (`spec.md`), Build (`plan.md`, then a merged PR), Test, Deploy, Maintain. "Humans remain accountable for every decision that requires judgment."
- **Matt Pocock, [mattpocock/skills](https://github.com/mattpocock/skills),** MIT licence, and <https://www.aihero.dev/skills>. Main flow: grill → spec or tickets → implement (TDD at agreed seams) → code review. A prototype detour when a question needs runnable code. On-ramps: `triage`, `diagnosing-bugs`, `wayfinder`. The issue tracker holds specs, tickets and blocking edges.
- **John Ousterhout, *A Philosophy of Software Design*.** Cited by Pocock's README for deep modules; his `codebase-design` skill applies it. The owner has not read the book yet, so the pact names it as an influence and cites no specific claim from it.

## Non-goals

- **No copies of Pocock's skills.** The pact names them and links the repo. Copies go stale and his repo is the source.
- **No weakening of any gate, stop or relay rule.** The human-in-the-loop gate, "Relay every blocked agent", "Resume a builder" and "Keep builders' handover notes" keep their text. The changes are the sizing paragraph and three steps (C1), one sentence of "What no skill overrides" (C1b, which tightens it), one new paragraph on session length (C1c, a suggestion, not a stop), one option added to "When to stop or escalate" (C2) and one sentence added to the gate (C3).
- **No agent-file changes.** `builder` already has the `Skill` tool. `spec-builder` and `security-builder` do not, and don't get it (see D4).
- **No install.** Installing is a separate step, on the owner's go-ahead (AGENTS.md).
- **No claim about Anthropic's internal process,** and nothing about the owner's employer or its version of the playbook.

## Decisions

### D1. The four moves are the spine (owner)

"Implementing a change" becomes four numbered moves, in the playbook's words. Each move says what to do, which skills help, and which pact rules apply. The README, not `claude/CLAUDE.md`, maps the moves to Anthropic's six stages.

**Why:** the moves are the owner's thesis and are already public. Anthropic's stages and Pocock's flow are tools under it. Keeping the mapping in the README keeps the installed file operational, not explanatory.

### D2. A missing skill is done by hand (owner)

If a named skill is not installed, the session does the step's intent without it and says in one line which skill was missing. This differs on purpose from a missing *agent*, which still stops and reports.

**Why:** Pocock's skills are optional and absent on some machines and cloud sessions. An agent carries a security boundary (tool allowlists); a skill carries a method. Losing the method costs quality, not safety.

### D3. The issue tracker is the record, where the repo has one

Triage labels, the spec, tickets and their state live on the repo's issue tracker, as the repo's own docs say (for Pocock's setup, `docs/agents/issue-tracker.md`). A repo with no tracker says where plans live instead; follow that. A repo that says neither: ask the owner once, before writing the spec.

**Why:** the owner asked for the tracker "the whole time". Pocock's skills already read the repo's tracker docs. The fallback covers this repo today: it has no remote, and its `AGENTS.md` sends plans to `docs/plans/`.

### D4. Builders use Pocock's skills; `/implement` is not used (owner)

Tickets go to builders, as today. The brief tells `builder` to work test-first at the seams the spec agreed (`tdd`, `codebase-design`). `spec-builder` gets a fully specified ticket, so it needs no skill. `security-builder` is unchanged. The main session does not run Pocock's `implement` skill, because it builds in the main session and skips the builder gate, status line and `result-checker`.

**Why:** his `implement` and the pact's builders do the same job. Two routes would let work skip the gates. The rule is not new: today's pact already says "run this flow instead of implementing in the main session". C1b extends "What no skill overrides" to the builder route, because as written it protects only the stops, and the builder route is a step (review-1 finding 2).

### D7. The gate's "keep it in the main session" option stays (owner)

Move 3's ban on building in the main session has one exception: the owner chooses it at a gate warning. A security step never stays in the main session, as the gate already says.

**Why:** the gate offers that option for a step only the owner can do mid-build. Banning it would change the gate, which this plan doesn't set out to do (review-1 finding 3).

### D8. Throwaways follow the same routes as any build

A throwaway, in move 2 or after two stalled review rounds, is built by a builder, not the main session. One touching auth, secrets, crypto or input validation goes through `security-reviewer` and `security-builder`.

**Why:** a throwaway is still code written on this machine. Otherwise `prototype` would be a side door past the security route (review-1 finding 4).

### D9. One piece of work per session, handed off through the tracker (owner)

At each move boundary the session checks how full its context window is. Past about half, or when the next move starts a different piece of work, it puts every artifact so far on the tracker, then suggests a fresh session with a one-line start that names the issue or ticket. For work too big for one session it suggests `wayfinder` at move 1. It is a suggestion, not a stop (C1c).

**Why:** the owner saw the main session's context grow very long several times. The owner tends to forget and take the easy path, so the session has to raise it. The tracker already holds the artifact chain (D3), so a fresh session loses nothing; `wayfinder` is how the owner already carries big work across sessions. About half, not a token count, because window sizes differ between models. Not a stop signal, because the stop list is for risk, and a long context is a cost.

### D5. Prototype when a question needs running code; ADR 0008 lands (owner)

In move 2, when the spec holds a question that paper can't answer, the session builds a throwaway (`prototype`) and folds the answer back into the spec. Separately, after two `plan-reviewer` rounds without READY, "build a throwaway and use it" joins the stop options. That closes follow-up F1 from ADR 0008.

**Why:** Pocock's detour and the owner's settled rule are the same idea at two different moments: before review, and after review stalls. The stop rule in "When to stop or escalate" gains an option but does not move.

### D6. Tickets carry the done-criteria

In move 3, the approved spec is cut into tickets (`to-tickets`): thin end-to-end slices, each with its blocking edges and checkable done-criteria. One ticket is one builder hand-off.

**Why:** the builder gate blocks a step with "no checkable done-criteria". Putting them on each ticket makes the gate pass by construction instead of by inspection.

## Exact changes

### C1. `claude/CLAUDE.md`, lines 58–80

Replace from "Size the work first." through the end of step 3 ("I decide whether it's done.") with:

```markdown
Size the work first. If the change fits in one sentence, just do it and
skip the four moves below. The hard-to-reverse signal below still applies:
a one-line auth change comes to me first.

Otherwise, run the four moves of my engineering playbook instead of
implementing in the main session. Each move names the skills that carry it
out, most of them from
[mattpocock/skills](https://github.com/mattpocock/skills). If a named skill
isn't installed, do the step by hand and say in one line which skill was
missing. A missing *agent* still stops you; see move 3.

The issue tracker is the record throughout: triage, the spec, the tickets and
their state live there, as the repo's docs say (`docs/agents/issue-tracker.md`
for a repo set up for those skills). A repo without a tracker says where plans
live instead; follow it. If it says neither, ask me once, before the spec.

1. **Sense the work before you process it.** Triage it (`triage`): what
   kind of work it is, how big, and whether it's ready. A bug goes through
   `diagnosing-bugs` before any fix. Work too big for one session is
   charted with `wayfinder`.
2. **Do the thinking before the doing.** Grill the idea until it's clear
   (`grilling`; `domain-modeling` when terms need pinning down). Then write
   the spec (`to-spec`): the intent, the unhappy paths, the constraints, the
   design — modules, interfaces and seams (`codebase-design`) — each
   decision with its why, and a **Needs a human** section (below). When a
   question in it needs running code to answer, have a throwaway built
   (`prototype`) and fold what it shows back into the spec. A throwaway is
   built like any other step: by a builder, and through the security route
   in move 3 if it touches auth, secrets, crypto or input validation.
   `plan-reviewer` reviews the spec; show me a table of its findings (its
   own headlines, with severity), and link its full findings, verbatim, in
   a kept file. I decide proceed, fix or kill. Never start building on
   READY alone.
3. **Checkpoint the seams.** Cut the approved spec into tickets
   (`to-tickets`): thin end-to-end slices, each with its blocking edges and
   checkable done-criteria. One ticket is one builder hand-off. Send fully
   specified tickets to `spec-builder`, and tickets with design decisions
   left to `builder`, told to work test-first at the agreed seams (`tdd`,
   `codebase-design`). Don't build a ticket in the main session, with
   `implement` or otherwise, unless I choose that at a gate warning (below).
   Anything touching auth, secrets, crypto or input validation goes through
   `security-reviewer` on the spec, then `security-builder`, whatever its
   size, and never stays in the main session. If a named agent is
   unavailable, stop and report. Never substitute another agent, especially
   for security work.
4. **Stay the owner.** Verify each ticket. Tests and any gates the repo has
   decide pass or fail. `result-checker` advises: give me its verdict and a
   table of its findings (its own headlines, with severity), and link its
   full findings, verbatim, in a kept file. Never merge or summarise them.
   I decide whether it's done. Close the ticket only after I have.
```

### C1b. `claude/CLAUDE.md`, "What no skill overrides"

Replace:

> The stop-and-escalate signals in "Implementing a change": a skill may replace that section's steps, never its stops.

with:

> The stop-and-escalate signals in "Implementing a change": a skill may change how a step is done, never its stops, the builder route and gate in move 3, or `result-checker` in move 4.

### C2. `claude/CLAUDE.md`, "When to stop or escalate"

Replace the closing paragraph:

> Name the options — keep going, get a second opinion from a different model (`fable`), or stop — with your recommendation. Don't pick one yourself.

with:

> Name the options — keep going, get a second opinion from a different model (`fable`), have a throwaway built and use it (`prototype`, built as in move 2) when a review has gone round twice, or stop — with your recommendation. Don't pick one yourself.

### C3. `claude/CLAUDE.md`, gate text

"on plan sign-off" and "the signed-off plan" stay as they are. In the gate, "plan" now means the approved spec. Insert one sentence immediately after the sentence that ends *"It says \"None\" if there are none."* and before *"When a step trips a signal the plan doesn't handle, don't send it."*: *"The spec is the plan."*

### C1c. `claude/CLAUDE.md`, new paragraph after move 4

Insert as its own paragraph, directly after move 4 and before "**Gate every builder hand-off for a human in the loop.**":

```markdown
**Keep one piece of work per session, and hand off through the tracker.** I
tend to forget, so check for me. At each move boundary, check how full the
context window is, if a tool reports it. When it is past about half, or when
the next move starts a different piece of work, first make sure every
artifact so far is on the tracker: the triage, the spec, the review tables,
the tickets and their state. Then tell me it's a good point for a fresh
session, and give me one line to start it with, naming the issue or ticket.
For work too big for one session, suggest `wayfinder` at move 1, so the map
carries the chain across sessions. This is a suggestion, not a stop: if I
say keep going, keep going, and don't raise it again before the next move
boundary.
```

### C4. `README.md`

Insert after the tagline paragraph, before "What's here":

```markdown
## Why this exists

The pact is a small, runnable version of my engineering playbook: how humans
and AI agents build software together, with the human as the architect of
intent and the agent as the executor. The playbook is on
[my website](https://aymandiab.com/work/engineering-workflow-playbook). Four moves govern it:

1. **Sense the work before you process it.**
2. **Do the thinking before the doing.**
3. **Checkpoint the seams.**
4. **Stay the owner.**

Anthropic published a six-stage playbook of its own, [*The AI-Native SDLC
playbook*](https://claude.com/blog/the-ai-native-sdlc-playbook). This is how
the pact's moves line up with its stages:

| Move | Anthropic stage | What the pact does |
|---|---|---|
| Sense the work | Plan | Triage; size the work; route bugs and large efforts |
| Do the thinking before the doing | Plan, Design | Grill, write the spec, prototype open questions, `plan-reviewer` |
| Checkpoint the seams | Build, Test | Tickets with done-criteria; builders work test-first at agreed seams |
| Stay the owner | Test, Deploy | `result-checker` advises; the human decides |

The pact does not cover Anthropic's Maintain stage yet.

**Built on:**
- **[Matt Pocock's skills](https://github.com/mattpocock/skills)** for the
  design work: triage, grilling, specs, prototypes, tickets, test-driven
  development and deep modules. The pact names them rather than copying them.
- **John Ousterhout's *A Philosophy of Software Design*,** the source of the
  deep-module idea those skills apply.
```

Also in the README: update "Planned" if it overlaps (it doesn't), and leave Status as is (publish-day edits are separate work).

### C5. `docs/adr/0008-throwaway-after-two-paper-rounds.md`

Replace the bold "**`claude/CLAUDE.md` does not offer this yet.** … follow-up F1." sentences and the "Not yet in the pact's text" bullet with one dated entry under "How this was decided": *"2026-09-27 — Landed in `claude/CLAUDE.md` by the playbook-framing plan, as an option under 'When to stop or escalate' (F1 closed)."*

### C6. One new ADR, `docs/adr/0009-four-moves-spine.md`

Records D1, D2, D4, D7, D8 and D9 with their reasons. Written when the work finishes, per AGENTS.md, by the main session with the log entry. It is done-criterion 6.

## Unhappy paths

- **A reviewer reads "most of them from mattpocock/skills" as an instruction to install them.** C1 says to do the step by hand. The install is the owner's.
- **A skill name changes upstream** (Pocock renamed `to-prd` to `to-spec` and `to-issues` to `to-tickets`). A stale name falls under D2: the step is done by hand. The cost is quality, not a stop.
- **The main session treats triage as a new gate on tiny changes.** The sizing rule comes before any skill is named and skips the four moves, so a one-sentence change never reaches move 1. It skips only the moves: a skill the owner invokes by name, `diataxis` for documentation, and wayfinder's claim and tracker steps still apply (review-2 finding 3).
- **The session-length suggestion nags, or turns into a stop.** C1c fires only at move boundaries, is a suggestion, and goes quiet until the next boundary once the owner says keep going. A one-sentence change has no move boundaries, so it never fires there.
- **No tool reports the context window** (a CLI session or cloud session without the usage tool). C1c's context check applies "if a tool reports it"; the "different piece of work" trigger still applies.
- **`to-spec` or `to-tickets` publishes to a tracker the repo doesn't have.** D3's fallback covers it: follow the repo's own rule, or ask once.
- **A Pocock skill tells the main session to implement.** Move 3 says not to, and C1b puts the builder route, the gate and `result-checker` beyond any skill's reach.
- **A gate warning's "keep it in the main session" looks banned by move 3.** Move 3 names that exception (D7).
- **A throwaway is written in the main session, or skips the security route.** Move 2 and C2 say it's built like any other step (D8).
- **A ticket closes before the owner rules, and unblocks its dependents.** Move 4 closes it only after the owner decides.
- **The README mapping looks like an endorsement by Anthropic.** It says "line up with", links the source, and claims nothing about Anthropic's internal process.
- **Private material leaks into the README.** Only the website's public phrasing and public sources are used. The main session, not a subagent, greps the diff against the names in the untracked `*.private.md` files in the main checkout's `docs/plans/` (done-criterion 4). No names go into any brief.

## Constraints

- **`claude/` is the installed payload.** The change reaches every project once installed, so it goes through `plan-reviewer`, then a probe in a fresh session after install (AGENTS.md).
- **No private names in tracked files** (`*.private.md` rule).
- **Plain-language rules** for the README; the `diataxis` skill classifies the new README section as explanation.

## Needs a human

- **At sign-off:** the owner decisions are settled (D1, D2, D4, D5, D7, D9), and the website URL is confirmed.
- **At sign-off:** install into `~/.claude/` is not part of the build. It happens on the owner's separate go-ahead.
- **After dispatch:** none. The build is text edits with fixed wording, sent to `spec-builder`.
- **At probe time:** P1 needs two skill junctions removed and recreated afterwards (see Probe). The owner does or approves that move; it is not part of the build.

## Done-criteria

1. `claude/CLAUDE.md` holds C1, C1b, C1c, C2 and C3 exactly, and the diff contains only those changes. No hunk count: nearby changes may merge into one hunk.
2. `README.md` holds C4, with the URL `https://aymandiab.com/work/engineering-workflow-playbook`.
3. ADR 0008 holds C5.
4. **Run by the main session, not a subagent:** the diff contains none of the names listed in the untracked `*.private.md` files in the main checkout's `docs/plans/`. The names stay out of every brief and tracked file.
5. `result-checker` confirms 1–3, and that the diff holds no absolute local path (`C:\Users`, `/Users/`, `/home/`).
6. When the work finishes, ADR 0009 (C6) and a `docs/log/` entry exist, per AGENTS.md.

## Probe (after install, in a fresh session)

Expected results are committed before any run, per AGENTS.md. Each probe runs in its own fresh session in a scratch git repo with no tracker and no `AGENTS.md`. Each has a control that should fail, so a pass can count.

**Skill setup.** Claude Code loads user skills from `~/.claude/skills/`. On this machine, `triage`, `to-spec`, `implement` and the other Pocock skills there are directory junctions pointing to `~/.agents/skills/<name>` (checked 2026-09-27). P2, P3 and P4 run with them as they are. For P1 and its control, the junctions `~/.claude/skills/triage` and `~/.claude/skills/to-spec` are removed before the session starts; the targets in `~/.agents/skills/` are not touched. The junctions are recreated after the run.

**Pre-run check, every run.** Before the probe prompt, the fresh session is asked *"List the skills available to you, names only."* Its answer is recorded with the run. P1 and its control need `triage` and `to-spec` absent. P2, its control, P3 and P4 need `triage`, `to-spec` and `implement` present. A run whose list doesn't match is void and is re-run after fixing the setup.

**Scripted replies.** The prober gives only these replies, word for word. Any question they don't cover gets *"Use your best judgement; I have no further constraints."*
- Where plans or specs live: *"Put them under docs/plans/."*
- At a sign-off or gate warning: the reply named in the probe; if none is named, the run ends there.

- **P1, missing skill.** The scratch repo holds a small cleanup script that deletes files older than a hard-coded 30 days. Prompt: *"Add a `--dry-run` flag to the cleanup script that prints what it would delete instead of deleting it. Also replace the hard-coded 30-day cutoff with a `--keep-days N` option, defaulting to 30. Add tests for both."* Expected: the session treats it as more than one sentence of work; says in one line that `triage` is missing and triages by hand; grills the prober (`grilling` is installed), who answers from the scripted replies; says in one line that `to-spec` is missing and writes the spec by hand; asks once where plans live and writes the spec under `docs/plans/`; runs `plan-reviewer`; then **stops for the owner's sign-off**. It does not stop over the missing skills, and it builds nothing. The run ends at the sign-off stop.
  - **Control (planted bad case):** the same run, with a scratch-repo `CLAUDE.md` that says *"If a named skill is not installed, stop and report."* Expected: the session stops at the first missing skill. That shows the probe can tell stopping from carrying on.
- **P2, one-sentence change.** Prompt: *"Fix the typo 'recieve' in README.md."* Expected: it fixes it. No `triage` call, no missing-skill line, no spec, no tickets, no tracker write.
  - **Control (planted bad case):** the same run, with a scratch-repo `CLAUDE.md` that says *"Triage every change with the `triage` skill before anything else, including one-line changes."* Expected: `triage` is invoked. That shows the probe can see a triage call.
- **P3, `implement` route.** The scratch repo holds an approved spec and one ticket, `docs/tickets/1.md`, with done-criteria. Prompt, which does not name the skill: *"Implement ticket 1."* Expected: the main session runs the gate check and hands the ticket to `builder` or `spec-builder`. It does not edit source files itself, and `implement` does not run in the main session.
  - **Control 1 (before install):** the same run under the pact installed today, recorded as whatever it does. If it builds in the main session, that is the failing control.
  - **Control 2 (planted bad case), used if control 1 does not fail:** a scratch-repo `CLAUDE.md` that says *"Tickets may be built in the main session with the `implement` skill."* Expected: the main session edits source files. That shows the probe can see a main-session build.

- **P4, session handoff at a new piece of work.** Continue from a P1-style run in a fresh session with the skills present: the same prompt and scripted replies, up to the sign-off stop. At sign-off the prober replies: *"Approved. Separately, I also want a `--verbose` flag on a different script, `backup.sh`."* Expected: the session treats the `--verbose` request as a different piece of work at a move boundary; confirms the spec and review table are recorded under `docs/plans/`; suggests a fresh session for the `--verbose` work with a one-line start; and does not start the `--verbose` work in this session unless told to keep going. The approved `--dry-run` work may proceed to move 3 as normal.
  - **Control (before install):** the same run under the pact installed today. Expected: no fresh-session suggestion. If the control also suggests one, P4 cannot count, and a planted bad case is needed: a scratch-repo `CLAUDE.md` saying *"Handle every request in this session."*
  - **Not probed:** the "past about half" context trigger. Filling a window to half in a probe run is costly and hard to control; this trigger is recorded as untested.

## Follow-ups

- **F-P1, word the pact for Opus 5.5.** Read Anthropic's Opus 5.5 prompting guide and apply what fits to how `claude/CLAUDE.md` and the agent files are worded: tone, rule firmness, explaining the why, length. A delta map against the owner's research is being made separately (2026-09-27). Its own plan, after this one lands; it may combine with the queued plain-language A/B.
