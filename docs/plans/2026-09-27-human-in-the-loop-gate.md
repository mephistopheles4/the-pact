# Plan: human-in-the-loop gate and blocked-status relay

*Status: draft 6, approved by the owner to build after round 5 (`.review-5.md`) with its fix applied, no round 6. Round 5: an explicit owner answer given later in chat counts as handled, like sign-off (D2, E2, E5). Owner chose "keep going" after round 4. Round 4 (`.review-4.md`): the gate is scoped to the three builders in D2, D5, D5a, E2, E5; read-only dispatches are never gated. Round 1 (`.review-1.md`): missing-status-line rule in D7, E2, E3 now names the three builders only. Round 2 (`.review-2.md`): signal 1 excludes local design decisions left to `builder`. Round 3 (`.review-3.md`): the gate is reframed around needs that arise after dispatch; anything settled at plan sign-off is handled (D2–D5a, E2, E5 rewritten). Written 2026-09-27.*

## Intent

Subagents cannot reach the owner. When a task needs a human partway through, the agent can only stop and report to the main session, and nothing makes the main session pass that on. This plan closes the gap at both ends:

1. **Before dispatch — the gate.** The main session checks whether a task will need the owner after it is dispatched, which plan sign-off can't settle. If it does, it warns clearly and refuses to hand the task to a builder until the owner picks a way forward.
2. **After dispatch — the relay.** Builders open their final message with a fixed status line. The main session relays any `BLOCKED` or `PARTIAL` status to the owner verbatim and waits.

The gate catches what can be foreseen; the relay catches surprises. Neither alone is enough.

## Non-goals

- **No hook enforcement.** A `SubagentStop` hook that parses the status line is deferred until the owner sees the main session swallow a report despite these rules.
- **No mid-task questions from agents.** An agent still cannot ask and continue. Stopping is how it asks; the main session re-tasks it with the answer.
- **Read-only agents are unchanged.** `scout`, `Explore`, `plan-reviewer`, `security-reviewer`, `test-reviewer` and `result-checker` already return a verdict or an answer; they get no status line.
- **`settings.overlay.json` is untouched.**

## Decisions

### D1. The gate lives in CLAUDE.md, step 1 of "Implementing a change"

**Why:** the plan is already written and reviewed before any dispatch, so the check costs nothing extra and sits in a review the owner already reads. A separate pre-dispatch ritual would be skipped.

### D2. The gate's one question: will the builder need the owner after dispatch?

**Scope:** the gate applies only to hand-offs to the three builders — `builder`, `spec-builder`, `security-builder` — the same scope as the relay (D6, D7). Read-only dispatches (`plan-reviewer`, `result-checker`, `security-reviewer`, `test-reviewer`, `scout`, `Explore`, a `fable` second opinion) are never gated: they change nothing, `plan-reviewer` runs before any sign-off exists, and their output already comes back to the owner through the review tables. **Why (round 4):** an unscoped gate tripped signal 4 on every review dispatch.

Not "does this step involve the owner?" Anything the owner settles at plan sign-off is **handled**: a decision the plan makes, an approval the plan records, done-criteria the plan writes. Sign-off happens before any dispatch, so the agent carries the answer with it. Only a need that can't be met until the agent is already running blocks the hand-off.

**An explicit owner answer given later counts the same (round 5).** When the owner answers a relayed `BLOCKED` or a gate warning in chat, that answer settles the need, and the re-task that carries it is not gated again for it. **Why:** otherwise the owner answers a question and is then warned about the question they just answered.

**Why this framing (round 3):** drafts 1–3 asked the broad question, and each review round found another routine hand-off it blocked — first `builder`'s local design calls, then every auth change routed to `security-builder`, which CLAUDE.md requires. Patching one signal per round didn't converge. The dispatch-time question covers all of them at once.

### D3. Four signals, each a need that arises after dispatch

1. **An owner decision the plan leaves open** for build time: a product or scope choice, or an architecture fork with codebase-wide consequences ("pick whichever fits"). Local design decisions left to `builder` don't count — that is its job, and a fork it hits mid-build is already a stop/report (`builder.md`).
2. **An owner-only action during the build:** the agent would need to sign in, enter credentials, pay, or get an approval at run time.
3. **An irreversible action the agent would carry out itself** — publish, push, send, run a migration on real data — that the plan doesn't name and the owner hasn't approved at sign-off. Writing code, including auth code, is not such an action: it is reviewed and revertible after the build.
4. **No checkable done-criteria** in the plan for that step.

**Why only four:** a broad gate rejects everything, nothing gets delegated, and the owner learns to wave the warning through. Narrow signals keep the warning meaningful.

### D4. Every plan carries a "Needs a human" section

For each step that needs the owner, it says **when**: *at sign-off* (settled by the plan — say how) or *after dispatch* (then say how it is handled: split off, or kept in the main session). "None" is a valid entry but must be written. **Why:** an explicit section turns a judgement the main session might skip into a field `plan-reviewer` can check.

### D5. On a trip, the main session warns and waits — it does not pick a route

At each builder dispatch, the main session checks the step against the signed-off plan. If a signal trips and the plan doesn't handle it, the warning format is: `⚠ Needs a human: <step> — <signal>. Not sending to <agent>.` Then it names the options with a recommendation — **settle it in the plan** (decide, approve, or write criteria, then delegate), **split off** the owner's part, or **keep it in the main session** — and waits. Security steps can't be kept in the main session (CLAUDE.md: never substitute for security work), so for them only the first two options apply. **Why:** matches the existing rule that when to stop is the owner's call.

### D5a. `plan-reviewer` treats an unhandled after-dispatch need as a blocker

A plan with no "Needs a human" section, or with a step routed to a builder that trips a D3 signal the plan doesn't settle, split off, or keep in the main session, gets `REVISE` at P2. A need the plan settles for sign-off is not a finding. **Why P2:** "material bounded or recoverable" fits — the build would stall, not break anything.

### D6. Builders open their final message with a status line

Format, exact: `STATUS: DONE | BLOCKED | PARTIAL — <one-line reason>`.

- **DONE** — every done-criterion met and verified.
- **BLOCKED** — stopped before finishing; needs a decision, a tool, a re-spec or a human action.
- **PARTIAL** — some done-criteria met, others not; the report says which.

Applies to `builder`, `spec-builder`, `security-builder`. Every existing "stop/report" instruction in those files now means `STATUS: BLOCKED`. **Why a fixed first line:** a blocked result can't hide in prose, and a later hook can check it with one regex.

### D7. The relay rule

A builder's `BLOCKED` or `PARTIAL` status, or a builder's missing status line, goes to the owner **verbatim** before other work continues. No silent retry, no summary in place of the report. A missing line is reported as a protocol miss, not assumed DONE. If the session looks unattended, the main session also sends a `PushNotification`, when that tool is available. **Why:** a warning nobody sees is the original problem.

`BLOCKED` joins the "When to stop or escalate" list, so no skill can override it (CLAUDE.md already says skills never override those stops).

## Exact edits

### E1. `claude/CLAUDE.md` — step 1 of "Implementing a change"

Replace step 1 with:

```markdown
1. **Think before building.** Write the plan: the intent, the unhappy paths,
   the constraints, each decision with its why, and a **Needs a human**
   section (below). `plan-reviewer` reviews it; show me a table of its
   findings (its own headlines, with severity), and link its full findings,
   verbatim, in a kept file. I decide proceed, fix or kill. Never start
   building on READY alone.
```

### E2. `claude/CLAUDE.md` — new subsection after the three steps, before "When to stop or escalate"

```markdown
**Gate every builder hand-off for a human in the loop.** An agent cannot
reach me. This gate covers hand-offs to the builders (`builder`,
`spec-builder`, `security-builder`) only. Read-only agents — reviewers,
checkers, `scout`, `Explore`, a `fable` second opinion — are never gated.
Before sending a step to a builder, ask one question: will it need me
*after* it is dispatched? Anything I settle at plan sign-off — a decision,
an approval, done-criteria — is handled, and the agent carries it with it.
So is an explicit answer I give later in chat, for example to a relayed
`BLOCKED` or to a gate warning: the re-task carrying it isn't gated again
for that need. Only these signals block, and only when neither the
signed-off plan nor my later answer settles them:

- **A decision that needs me,** left for build time: a product or scope
  choice, or an architecture fork with codebase-wide consequences. Local
  design decisions left to `builder` (naming, structure, error handling)
  don't count.
- **Something only I can do during the build:** sign in, enter
  credentials, pay, or approve at run time.
- **An irreversible action the agent would carry out itself** — publish,
  push, send, migrate real data — that the plan doesn't name for my
  sign-off. Writing code, auth code included, is reviewed and revertible;
  it doesn't count.
- **No checkable done-criteria** for the step.

Every plan's **Needs a human** section lists each step that needs me and
when: *at sign-off* (say how the plan settles it) or *after dispatch* (say
how it's handled). It says "None" if there are none. When a step trips a
signal the plan doesn't handle, don't send it. Warn me in this form, then
wait:

`⚠ Needs a human: <step> — <signal>. Not sending to <agent>.`

Name the options — settle it in the plan then delegate, split off my part,
or keep it in the main session — with your recommendation. A security step
can't stay in the main session, so offer only the first two for it.

**Relay every blocked agent.** Builders open their final message with
`STATUS: DONE | BLOCKED | PARTIAL — <reason>`. When a builder (`builder`,
`spec-builder`, `security-builder`) returns `BLOCKED`, `PARTIAL`, or no
status line, show me its report verbatim before doing anything else.
Read-only agents carry no status line; this rule doesn't apply to them.
Don't retry silently and don't summarise it. A missing status line is a
protocol miss, not a DONE. If I seem to be away, also send a push
notification when that tool is available.
```

### E3. `claude/CLAUDE.md` — "When to stop or escalate" list

Add as the first bullet:

```markdown
- a builder (`builder`, `spec-builder`, `security-builder`) reports
  `BLOCKED` or `PARTIAL`, or omits its status line;
```

### E4. `claude/agents/builder.md`, `spec-builder.md`, `security-builder.md`

Insert this paragraph immediately before each file's `Final message:` line, in the files' existing terse style:

```markdown
Final message line 1, exact: `STATUS: DONE | BLOCKED | PARTIAL — <one-line reason>`. DONE = every done-criterion met + verified. BLOCKED = stopped before finishing (every "stop/report" above = BLOCKED). PARTIAL = some criteria met, others not; say which. You can't reach the human — orchestrator relays BLOCKED/PARTIAL verbatim; make reason stand alone.
```

The existing `Final message:` lines stay; they now describe what follows line 1.

### E5. `claude/agents/plan-reviewer.md`

Insert after the "Security-sensitive units" paragraph:

```markdown
Human-in-loop check — scope: steps routed to a builder (`builder`, `spec-builder`, `security-builder`) only; read-only dispatches (reviewers, checkers, scout, Explore, fable) are never gated. Question: will a builder step need the owner *after dispatch*? Need the plan settles for owner sign-off (decision made, approval recorded, done-criteria written) = handled, not a finding; so is an explicit owner answer given later (e.g. to a relayed BLOCKED) that a re-task carries. Blocking signals, only when plan leaves them open: owner decision deferred to build time (product/scope choice, codebase-wide architecture fork; local design decisions left to `builder` don't count); owner-only action during build (sign-in, credentials, payment, run-time approval); irreversible action agent itself carries out (publish, push, send, migrate real data) not named for sign-off — writing code, auth code included, doesn't count; no checkable done-criteria. Plan lacks "Needs a human" section, or a signal trips and the plan neither settles it, splits it off, nor keeps it in main session (security steps: never main session) → P2 blocker.
```

### E6. Install

After merge, copy `claude/CLAUDE.md` to `~/.claude/CLAUDE.md` and the four edited agent files to `~/.claude/agents/`, per "Where this config lives". This overwrites live config, so it waits for the owner's go-ahead.

## Needs a human

- **E6 install** — after dispatch: overwrites live `~/.claude` files, and the owner approves it at run time. Kept in the main session.
- **Probes P1 and P2 below** — need E6 done first, since agents load from `~/.claude/agents/`. Kept in the main session.
- **E1–E5** — at sign-off: the plan gives the exact text and acceptance checks; no signal trips. Delegated to `spec-builder`.

## Build route

`spec-builder` applies E1–E5 verbatim. No auth, secrets, crypto or input validation, so no security route.

## Acceptance

- **A1.** `Select-String` finds the E2 warning format, the E3 bullet, and "Needs a human" in `claude/CLAUDE.md`.
- **A2.** Each of the three builder files contains `STATUS: DONE | BLOCKED | PARTIAL` exactly once, placed before its `Final message:` line.
- **A3.** `plan-reviewer.md` contains the E5 paragraph; its `READY`/`REVISE` output contract is unchanged.
- **A4.** `git diff --stat` touches only the five files named in E1–E5 plus this plan.
Both probes run after E6, because agents load from `~/.claude/agents/`, not the repo. Each records to `docs/tests/2026-09-27-human-gate-probe.md`, with the expected result written before running, like the missing-tool probe.

- **P1 (gate probe).** Hand `plan-reviewer` a copy of this plan with the "Needs a human" section deleted. Expected: `REVISE` naming the missing section.
- **P2 (status probe).** Dispatch `spec-builder` with a spec naming a file that doesn't exist. Expected: first line `STATUS: BLOCKED — …`.

## Unhappy paths

- **Gate over-fires** and nothing gets delegated → the four signals are the whole list; the owner can tell the main session to proceed. If it over-fires in practice, narrow a signal.
- **Gate under-fires** and a stalled agent comes back → the relay (E2, E3) catches it.
- **A builder omits the status line** → treated as a protocol miss and relayed (D7), never assumed DONE.
- **The main session ignores the relay rule** → no enforcement in this plan; that is the deferred hook's job.
- **The install drifts from the repo** → same risk as today; E6 copies from the repo only.

## Rollback

`git revert` the build commit, then re-copy the reverted files to `~/.claude/`. No data or external state changes.

## Stop conditions

Stop and report to the owner if: `spec-builder` returns anything but DONE; any acceptance check fails twice; the diff touches a file outside E1–E5.
