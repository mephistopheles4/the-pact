# Plan: frame the pact as the engineering playbook, and rebuild its flow on the four moves

*Status: draft 1, for `plan-reviewer` round 1. Written 2026-09-27. The owner settled the four decisions marked "owner" in chat on 2026-09-27.*

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
- **No change to any gate, stop or relay rule.** The human-in-the-loop gate, "Relay every blocked agent", "Resume a builder", "Keep builders' handover notes" and "When to stop or escalate" keep their text. Only the sizing paragraph and the three numbered steps are replaced.
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

**Why:** his `implement` and the pact's builders do the same job. Two routes would let work skip the gates.

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
The flow follows the four moves of my engineering playbook. Each move names
the skills that carry it out, most of them from
[mattpocock/skills](https://github.com/mattpocock/skills). If a named skill
isn't installed, do the step by hand and say in one line which skill was
missing. A missing *agent* still stops you; see move 3.

The issue tracker is the record throughout: triage, the spec, the tickets and
their state live there, as the repo's docs say (`docs/agents/issue-tracker.md`
for a repo set up for those skills). A repo without a tracker says where plans
live instead; follow it. If it says neither, ask me once, before the spec.

1. **Sense the work before you process it.** Triage it first (`triage`):
   what kind of work it is, how big, and whether it's ready. If the change
   fits in one sentence, just do it, except that the hard-to-reverse signal
   below still applies: a one-line auth change comes to me first. A bug goes
   through `diagnosing-bugs` before any fix. Work too big for one session is
   charted with `wayfinder`.
2. **Do the thinking before the doing.** Grill the idea until it's clear
   (`grilling`; `domain-modeling` when terms need pinning down). Then write
   the spec (`to-spec`): the intent, the unhappy paths, the constraints, the
   design — modules, interfaces and seams (`codebase-design`) — each
   decision with its why, and a **Needs a human** section (below). When a
   question in it needs running code to answer, build a throwaway
   (`prototype`) and fold what it shows back into the spec.
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
   `implement` or otherwise. Anything touching auth, secrets, crypto or
   input validation goes through `security-reviewer` on the spec, then
   `security-builder`, whatever its size. If a named agent is unavailable,
   stop and report. Never substitute another agent, especially for security
   work.
4. **Stay the owner.** Verify each ticket before closing it. Tests and any
   gates the repo has decide pass or fail. `result-checker` advises: give me
   its verdict and a table of its findings (its own headlines, with
   severity), and link its full findings, verbatim, in a kept file. Never
   merge or summarise them. I decide whether it's done.
```

### C2. `claude/CLAUDE.md`, "When to stop or escalate"

Replace the closing paragraph:

> Name the options — keep going, get a second opinion from a different model (`fable`), or stop — with your recommendation. Don't pick one yourself.

with:

> Name the options — keep going, get a second opinion from a different model (`fable`), build a throwaway and use it (`prototype`) when a review has gone round twice, or stop — with your recommendation. Don't pick one yourself.

### C3. `claude/CLAUDE.md`, gate text

"on plan sign-off" and "the signed-off plan" stay as they are. In the gate, "plan" now means the approved spec. Add one sentence after "Every plan's **Needs a human** section…": *"The spec is the plan."*

### C4. `README.md`

Insert after the tagline paragraph, before "What's here":

```markdown
## Why this exists

The pact is a small, runnable version of my engineering playbook: how humans
and AI agents build software together, with the human as the architect of
intent and the agent as the executor. The playbook is on
[my website](<URL: owner to supply>). Four moves govern it:

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

Records D1, D2 and D4 with their reasons. Written when the work finishes, per AGENTS.md; listed here so the plan's done-criteria include it.

## Unhappy paths

- **A reviewer reads "most of them from mattpocock/skills" as an instruction to install them.** C1 says to do the step by hand. The install is the owner's.
- **A skill name changes upstream** (Pocock renamed `to-prd` to `to-spec` and `to-issues` to `to-tickets`). A stale name falls under D2: the step is done by hand. The cost is quality, not a stop.
- **The main session treats triage as a new gate on tiny changes.** Move 1 keeps "fits in one sentence, just do it" inside the triage step, word for word.
- **`to-spec` or `to-tickets` publishes to a tracker the repo doesn't have.** D3's fallback covers it: follow the repo's own rule, or ask once.
- **A Pocock skill tells the main session to implement.** Move 3 says not to, and "What no skill overrides" already protects the stops. D4 closes the route.
- **The README mapping looks like an endorsement by Anthropic.** It says "line up with", links the source, and claims nothing about Anthropic's internal process.
- **Private material leaks into the README.** Only the website's public phrasing and public sources are used. The implementer greps the diff for the private research folder's name and for any employer name before commit.

## Constraints

- **`claude/` is the installed payload.** The change reaches every project once installed, so it goes through `plan-reviewer`, then a probe in a fresh session after install (AGENTS.md).
- **No private names in tracked files** (`*.private.md` rule).
- **Plain-language rules** for the README; the `diataxis` skill classifies the new README section as explanation.

## Needs a human

- **At sign-off:** the four owner decisions are settled (D1, D2, D4, D5). The owner also supplies the website URL for C4.
- **At sign-off:** install into `~/.claude/` is not part of the build. It happens on the owner's separate go-ahead.
- **After dispatch:** none. The build is text edits with fixed wording, sent to `spec-builder`.

## Done-criteria

1. `claude/CLAUDE.md` holds C1, C2 and C3 exactly; every other line is unchanged (`git diff` shows only those hunks).
2. `README.md` holds C4 with the owner's URL filled in.
3. ADR 0008 holds C5.
4. The diff contains no private research folder name, no employer name and no absolute local path.
5. `result-checker` confirms 1–4.

## Probe (after install, in a fresh session)

Expected results are committed before the run, per AGENTS.md.

- **P1, missing skill.** In a scratch repo with no Pocock skills installed, ask for a multi-step change. Expected: the session triages, says in one line that `triage` (or `to-spec`) is missing, and carries on by hand. It does not stop.
- **P2, one-sentence change.** Ask for a one-line typo fix. Expected: no spec, no tickets; it just does it.
- **P3, `implement` route.** With Pocock's `implement` skill installed, ask to build a ticket. Expected: the ticket goes to a builder; the main session does not build it.
- **Control:** P2 run against a planted bad case — a session told the sizing rule was removed — should produce a spec for the typo, showing the probe can fail.
