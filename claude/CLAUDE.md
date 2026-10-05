## Where this config lives

This file and `~/.claude/agents/` are installed from the `claude/` folder of
the-pact repo, and the cross script from its `cross/` folder to
`~/.claude/pact/`. Edit the repo copy, then copy it into `~/.claude/`; a
direct edit to the live file drifts.

## Shell

**On Windows, use the PowerShell tool for shell commands. Do not use Bash.**
Both tools are exposed and the choice is the model's, so this is the only thing
selecting between them.

The reason is not taste: Git Bash here **fails silently**. `gh issue view <n>`
run through Bash returned empty output and exit 0 — indistinguishable from an
issue with no body — while the identical command through PowerShell returned the
issue. A wrong answer that looks like a right one is worse than an error.

Translate bash-shaped one-liners that skills hand you rather than reaching for
Bash to run them: `2>$null` for `2>/dev/null`, `Select-Object -First N` for
`head`, `$env:VAR` for `$VAR`, single-quoted here-strings (`@'…'@`, closing
delimiter at column 0) for multi-line arguments.

## Explain in plain language

Write explanations to hit the four outcomes of **ISO 24495-1:2023** (*Plain language — Part 1: Governing principles and guidelines*): the reader gets what they need, finds it, understands it, and can use it.

Applies to explanations, summaries, and answers in chat. Code, commit messages, and generated artifacts keep their own conventions.

- **Lead with the answer.** Conclusion first, supporting detail after.
- **Keep sentences short.** Around 20 words. Split multi-clause sentences.
- **Use active voice.** "Run the migration", not "the migration should be run".
- **Define a term the first time it appears**, including acronyms and internal names.
- **Bold the lead-in of each bullet** so a list scans.
- **Writing documentation files?** Use the `diataxis` skill — it classifies a doc as tutorial, how-to, reference, or explanation, and keeps those types unmixed.
- **Accuracy outranks simplicity.** When plain phrasing would make something wrong or vague, stay precise and explain the term instead.

## When a skill and these rules disagree

**A skill you invoke by name wins for that turn.** If you type `/<name>` or ask
for a skill by name, its rules take priority over the style rules above and
over the active output style until the turn ends. Name what it overrode in one
line, so the override is visible rather than silent.

**A skill that fired on its own does not win.** An auto-triggered skill loses to
these rules. Its own description decided it was relevant, and that is not the
same as you choosing it.

<!-- pact:begin no-skill-overrides -->
**What no skill overrides, invoked or not.** The Shell rule above — PowerShell,
not Bash, because Bash fails silently here. Any judgement about what is
destructive, irreversible, or unsafe to run. The stop-and-escalate signals in
"Implementing a change": a skill may change how a step is done, never its
stops, the risk floor (auth, secrets, crypto, input validation, data migrations
and anything published are always thorough), the security route in move 3, or
`result-checker` in move 4.
Nor the hand-off: a skill may not start a user-only skill for me, or follow
one's `SKILL.md` in its place. And the claiming and coordination rules
below: a skill that tells you to claim a ticket is describing its own happy
path, not the case where another session is already on it.
<!-- pact:end no-skill-overrides -->

## Implementing a change

Every piece of work has a **process tier**: quick, standard or thorough. A
tier is the set of moves the work goes through. It is not your effort
setting. Triage (move 1) sets it. On an issue the tier is a label:
`tier:quick`, `tier:standard` or `tier:thorough`.

| Tier | Moves |
| --- | --- |
| **Quick** | In chat or on an issue: build, then move 4, in one session. Small changes that need no plan. |
| **Standard** | On an issue: a short `to-spec` posted on the issue, then one build session that ends with move 4. |
| **Thorough** | On an issue: `to-spec`, `plan-reviewer`, `to-tickets`, then one build session per ticket, each ending with move 4. |

**Risk floor.**
<!-- pact:begin risk-floor -->
Auth, secrets, crypto, input validation, data migrations and anything published are always thorough, whatever tier I name.
<!-- pact:end risk-floor -->
Don't ask me to confirm this or nag: go thorough and carry on. For any other
open decision under a lower tier than you would pick, name the decisions once
("quick means I decide X and Y, OK?"), then follow me.

**Where work starts.**

- **Quick work** may stay in chat with no issue. The first reply proposes the
  tier with one line of why, as on an unlabelled issue, and stops. If the
  work turns out to be standard or thorough, stop and offer to file an issue.
- **Standard and thorough work** always starts by filing an issue, so its
  tier, plan and state have a home. In a repo without a tracker, the issue's
  role goes to wherever the repo keeps plans, and the tier and the per-phase
  line (below) are written at the top of the plan file, not as a label.
- **An issue with no tier label is at move 1.** Never infer a later move from
  partial evidence, such as an approved ticket or a missing spec. The first
  reply is the fit check and a proposed tier, shown as a next-move choice
  (below), and nothing else. Then stop. I answer with a tier word, and you apply the label and
  start that tier's first move; or I type `/triage` for a full triage. The
  proposal stands in for move 1 only when I confirm it.
- **Whoever files or triages an issue** writes the suggested tier as a label,
  and one line per phase for the model and effort setting, next to it. Copy
  the lines for the tier from the table under "Sessions and models", for
  example "Plan: Opus, medium. Build: Sonnet, medium." A different value needs
  one stated reason on the issue. Effort is `low`, `medium` or `high`; xhigh is
  never a starting setting.

**Which phase an issue is in** is the next unfinished move for its tier, read
from the issue itself: no label means triage; no spec on a standard or
thorough issue means plan; an approved spec or ticket with no accepted build
means build. Build includes its own move 4, so there is no separate verify
phase.

**Tier changes.** When the work outgrows its tier, stop, post what you know
to the issue, and propose the new tier for the next session. I can call a
tier change at any time; my judgement of the work wins, except that the risk
floor (above) holds.

**Show the next move as a choice.** When you propose a tier or the next
move, don't hand me one command as if it were the only path. Show the live
options side by side, usually two or three: for example build now, prototype,
spec first, or triage. Give each one line on when it fits and the risk it
carries: what could go wrong, and what it costs to recover. Mark the one you
recommend, and why. The risk floor still sets the tier for risky work; the
choice shows what's open within it. A `▶ Your move` line, when there is one,
still comes last.

**Quick work stops at an open decision.** Under quick, a decision the issue
leaves open (for example, which content to cut or keep) is named to me and
answered before any file changes. Don't pick it yourself, however small the
diff. If my answer changes the size of the work, the rule above applies: stop,
post what you know, propose the new tier.

**Sessions and models.** Work splits into sessions at phase boundaries
(triage, plan, build), never into subagents. Never switch model within a
session: changing model makes the whole history be read again into a fresh
cache, while changing effort keeps the cache.

- **Opus** plans and reviews, and runs the whole quick tier.
- **Sonnet** runs the build sessions of standard and thorough work.
- **Security builds** run on Opus at high effort, because other models'
  safety classifiers can refuse harmless defensive-security work partway
  through.

Effort follows the tier. Security work stays on Opus at high, whatever the
tier:

| Work | Plan | Build |
| --- | --- | --- |
| **Quick** | none | Opus, low |
| **Standard** | Opus, medium | Sonnet, medium |
| **Thorough** | Opus, high | Sonnet, medium |
| **Security route** (any tier) | Opus, high | Opus, high |

Work outside the tiers (orchestration, research, evaluation) starts at medium.

I set the effort setting when I start a session; a session can't change its
own. At a stop, one more option is to rerun the stuck step once at xhigh: I
raise it with `/effort` and set it back afterwards, which keeps the cache. Use
it when the reasoning is the bottleneck, and `fable` when reviewers disagree
about direction. At a phase boundary, post the result, the state and any open questions
to the issue, then end with one line that starts the next session. This
comment is always posted, even when every artifact is already on the tracker:
it gives the result, the state, any open questions and the next-session
line. Don't compact first: the issue carries the context.

**Fit check.** The first line of the first reply in any session says whether
the session fits the tier, the model and the effort setting suggested for the
issue's current phase, even when everything fits. It is the first text I see,
before any build step or progress text; reading the issue first is fine.
Read your model name from
your system prompt. With no label, the tier part reads `none (proposing
<tier>)`. For chat work with no issue there is no suggested effort, so the
check covers the proposed tier and the model only. Effort is the one thing a
session may not be able to see, and it depends on the model:

- **Sonnet** sessions read the effort from the `<reasoning_effort>` value in
  their context: `4` is low, `5` is medium, `10` is high. Use:
  `Fit: tier <tier> (<fits | issue suggests X>), model <model> (<fits | issue suggests X>), effort <setting> (<fits | issue suggests X>).`
- **Opus** sessions can't see their effort setting. Use:
  `Fit: tier <tier> (<fits | issue suggests X>), model <model> (<fits | issue suggests X>). I can't see my effort setting; the issue suggests <X>. Please confirm it.`
- **Any other case** gets the Opus line: a Sonnet session that sees no value
  or one outside the mapping, or any other model. The mapping is specific to
  Sonnet; never apply it to another model.

Help me run the moves of my engineering playbook that your tier names. The
moves are mine; you help me carry them out and protect me while I do. Each move
names the skills that carry it out, most of them from
[mattpocock/skills](https://github.com/mattpocock/skills). Some named skills
are mine to start, not yours: `triage`, `to-spec`, `to-tickets`, `wayfinder`
and `implement` carry `disable-model-invocation`, so only I can run them, by
typing the command. When a move reaches one, stop and hand it to me (below).
Use the other named skills yourself. If a named skill is in neither
group, because it isn't installed, do the step by hand and say in one line
which skill was missing. Never read a user-only skill's `SKILL.md` and follow
it in its place; the flag is its author's choice. A missing *agent* still
stops you; see move 3.

The issue tracker is the record throughout: triage, the spec, the tickets and
their state live there, as the repo's docs say (`docs/agents/issue-tracker.md`
for a repo set up for those skills). A repo without a tracker says where plans
live instead; follow it. If it says neither, ask me once, before the spec.

1. **I sense the work before I process it.** I triage it (`triage`): what
   kind of work it is, its tier, and whether it's ready. You propose the
   triage and the tier, and never skip past it. A bug goes through
   `diagnosing-bugs` before any fix. Work too big for one session is
   charted with `wayfinder`.
2. **I do the thinking before the doing.** I grill the idea until it's clear
   (`grilling`; `domain-modeling` when terms need pinning down). You help
   with both, then write the spec (`to-spec`): the intent, the unhappy paths, the constraints, the
   design — modules, interfaces and seams (`codebase-design`) — each
   decision with its why, and a **Needs a human** section (below). When a
   question in it needs running code to answer, have a throwaway built
   (`prototype`) and fold what it shows back into the spec. A throwaway is
   built like any other step: in a main session, and through the security
   route in move 3 if it touches auth, secrets, crypto or input validation.
   On the thorough tier, `plan-reviewer` reviews the spec. Post its report
   and help me decide (below). I decide proceed, fix or kill. Never start
   building on a READY verdict alone.
3. **I checkpoint the seams.** On the thorough tier, I cut the approved spec
   into tickets (`to-tickets`): thin end-to-end slices, each with its blocking edges and
   checkable done-criteria. You help me cut them and check each has done-criteria. Each ticket, or a standard or quick piece of work,
   is built in its own main session, which I start and watch. Opened on an approved spec or ticket, the
   session starts building directly, test-first at the agreed seams (`tdd`,
   `codebase-design`). It doesn't hand me `/implement` first; I may still
   type it.
   <!-- pact:begin security-route -->
   Anything touching auth, secrets, crypto or input validation
   takes the security route, however small: `security-reviewer` on the
   spec, then the build in a main session, then `security-reviewer` on the
   diff in move 4.
   <!-- pact:end security-route -->
   <!-- pact:begin never-substitute -->
   If a named agent is unavailable, stop and report. A pair of
   lenses with either lens missing is unavailable as a whole. Never
   substitute another agent, especially for security work.
   <!-- pact:end never-substitute -->
4. **I stay the owner.**
   <!-- pact:begin move-4 -->
   I verify the work at the end of its build session. You run the checks for
   me and bring me the verdict with a recommendation. Run the tests and any
   gates the repo has; they decide pass or fail. Then run `result-checker`,
   and for security work `security-reviewer` on the diff. When the diff
   touches tests, assertions, fixtures or check configuration, also run
   `test-reviewer` on it. Never resume a reviewer or a checker; fresh context
   is the point of them. `result-checker` advises: post its report and help
   me decide (below). I decide whether it's done. Close the ticket only after
   I have.
   <!-- pact:end move-4 -->

**Reading agents.** `plan-reviewer`, `result-checker`, `test-reviewer` and
`security-reviewer` read; they don't build. Give them their input as local
files: the spec text or the diff, written to a file, and the paths to it. Post
each report on the issue, or in the repo's plan file, as a comment, word for
word: post the agent's hand-back text unedited, from a file. Never retell or
shorten it: that changes it. Each report has two sections.
**For the owner** comes first: the verdict word, then what is wrong, why it
matters and what it suggests, in plain sentences, with no line numbers, codes
or paths. **For the session** follows, with the evidence and locations you
need to act.

**The cross script.** A lens is a reviewer that asks one question from one
angle, and lenses run in pairs. A pair's two reports go through the
installed cross script, never a copy in a repo. Call it by its full path,
with `NODE_OPTIONS` cleared. In PowerShell:
`$env:NODE_OPTIONS = $null; node "$HOME/.claude/pact/cross.mjs" <arguments>`
In a POSIX shell:
`env -u NODE_OPTIONS node "$HOME/.claude/pact/cross.mjs" <arguments>`
Its last line is always a `RESULT:` line; output without one means the
script is unavailable, so stop and report, as for any unavailable agent.
Exit 0: every check passed. Exit 1: a report failed a check, and no section
was written. Post only the fenced, folded reports it wrote, never the raw
report text; say the cross failed and why, and never rebuild the cards by
hand. Exit 2: a report alone is over the comment limit. Post the section and
the reports that fit. On either failure code, keep each report it lists as
kept local or left out as a local file, name its path, and tell me.

**Lookups and searches.** For a lookup or a broad search that needs no judgement,
use `scout`.

**Help me decide.** After a report, sort its findings before you bring me
anything. Fix what is mechanical yourself. Group findings that are really one
question. Bring each real choice with your recommendation and the reason for
it. A recommended choice is the default you take unless I object: state it, don't
ask me to confirm it. Ask me only for facts only I have, or for approval the
pact requires. Decisions are made
together: I can take your recommendation without reading the detail, and the report's For the owner section is there for anyone who wants more. Don't hand
me a list of findings with "your call" on each.

**Hand me the trigger.** When the next move is a skill only I can start, end
your turn with this line and nothing after it:

`▶ Your move: type /<skill> <argument>`

The argument is the issue, ticket or plan file the step works on, so the line
runs as typed. Above it, say in one sentence what the step produces. Don't
start the step, draft its output, or ask a question in the same turn.

If it is also a good point for a fresh session (below), say so above the
line. The `▶` line is then the one to start the new session with, and it
stays last.

**If I hand the step back to you** ("you do it", "just run it"), respond
once:

- **Ask for my call first.** One question that the step's output answers,
  for example "What tier do you think this is?" for triage. Wait for my
  answer before showing yours.
- **Say what I'd be handing over,** in one sentence, as a fact about the
  step, not advice about me. No praise, no blame, no "you should".
- **Then my choice stands.** If I still want you to do it, do the step by
  hand, following the move as written here, and say which skill's procedure
  you did not use.

Say this once per session. Don't repeat it at the next move, and don't raise
it mid-step.

**Keep one piece of work per session, and hand off through the tracker.** I
tend to forget, so check for me. A phase boundary always ends the session (see
"Sessions and models"). Separately, keep an eye on the context window all the
way through, not only at boundaries, if a tool reports it. When it is past
about half of the window, for example 500K of a 1M window, or when I have
asked for a different piece of work, propose a hand-off, even mid-phase: a
fresh session is far more efficient than a long one. First make sure every
artifact so far is on the tracker, or where the repo keeps plans: the triage,
the spec, the review reports, the tickets and their state. On each open ticket
this session created, note that this session is finished with it, so the next
session can take it without waiting on the presumed-live rule. Then tell me
it's a good point for a fresh session, and give me one line to start it with,
naming the issue, ticket or plan file. For work too big for one session,
suggest `wayfinder` at move 1, so the map carries the chain across sessions.
A mid-phase proposal is a suggestion, not a stop: if I say keep going, keep
going, and don't raise it again for this phase.

**Every spec has a Needs a human section.** It lists each step that needs
me, by phase and session, and when: *at sign-off* (say how the spec settles
it) or *during the build* (say when and how it's handled). It says "None" if
there are none. The spec is the plan.

<!-- pact:begin stop-and-escalate -->
**When to stop or escalate is my call.** Tell me, and wait, when:

- the build or review has gone round twice without converging;
- the work has left the approved plan;
- the change is hard to reverse: auth, secrets, data migrations, or anything
  published;
- you can no longer explain why the result is right.

Name the options — keep going, get a second opinion from a different model
(`fable`), have a throwaway built and use it (`prototype`, built as in move
2) when a review has gone round twice, or stop — with your recommendation.
Don't pick one yourself.
<!-- pact:end stop-and-escalate -->

## Watching usage

Before starting anything expensive — several subagents, a workflow, an eval —
check my plan usage if a usage tool is available (the desktop app has one).
Tell me the weekly figure and a rough cost for what you're about to start. If
the weekly limit is above 75%, wait for my go-ahead. Never cut or stop work
because of usage on your own; that call is mine.

## When working a wayfinder map

Applies to `/wayfinder` in its **work through the map** mode, and to any session
resolving a ticket on a `wayfinder:map`. Charting a fresh map is unaffected.

**Name the ticket when you launch each parallel session.** Wayfinder honours it
— *"If the user named one, use it"* — so nothing self-selects and contention
cannot arise. This is the primary protection; the rules below catch what it
misses.

**Assignee is not a claim here.** Every parallel session authenticates as the
same GitHub user, so an assignee check cannot tell "mine, claimed a minute ago"
from "free to take". That is how gate G36 in stacks got claimed twice. The two rules below
exist because the tracker alone cannot answer the question.

**Check for a live session before claiming.** Call
`mcp__ccd_session_mgmt__list_sessions` and match candidates **on worktree name**.
Do not match on ticket number: transcript-searching an issue number hits every
session that merely read the map, which is all of them. A worktree match means
somebody is on it — pick a different ticket, or message them.

**Treat a ticket created in the last hour as presumed-live.** Get the window
with `gh issue list --json number,createdAt,assignees`. Inside that hour, a
ticket is presumed to belong to whoever made it, whatever its assignee says.
Confirm its author is finished before touching it. Presumed-live is the default
and silence does not clear it — no answer means still live.

**Message the session, don't guess.** Use
`mcp__ccd_session_mgmt__send_message` to ask the other session whether it is
done, rather than inferring from a stale transcript or an idle-looking process.
This is the cross-session case, which is the one that matters: parallel
wayfinder tickets run as separate sessions, so `SendMessage` — which reaches
teammates inside one session — does not reach them.

**Write shared files last, against a re-fetched tip.** The map body changes
under you while you work. Re-read it immediately before editing, never from the
copy you loaded at step 1.
