# Build in the main session, and choose the work's tier up front

Builds run in a main session the owner watches. `builder`, `spec-builder` and `security-builder` retire, with every rule that existed only because a subagent cannot reach the owner. Agents stay only for independent reading: `plan-reviewer`, `result-checker`, `test-reviewer`, `security-reviewer`, `scout` and `Explore`. Every piece of work has a process tier, quick, standard or thorough, set at triage and held as a `tier:*` label on the issue. The tier is the set of moves the work goes through, not the model's effort setting.

| Tier | Moves |
| --- | --- |
| **Quick** | Build, then move 4, in one session. In chat or on an issue. |
| **Standard** | A short `to-spec` on the issue, then one build session that ends with move 4. |
| **Thorough** | `to-spec`, `plan-reviewer`, `to-tickets`, then one build session per ticket, each ending with move 4. |

A build session starts building when the owner opens it on an approved spec or ticket, with no `/implement` hand-off first, and ends with move 4 in the same session. Auth, secrets, data migrations and anything published are always thorough. Security work takes `security-reviewer` on the spec, a main-session build, then `security-reviewer` on the diff.

## Why

- **The intent is the human above the loop.** The owner owns the work and is satisfied with their understanding of it. Sometimes they don't want to understand a piece of work, and that is fine too. So the pact offers depth and never forces it.
- **The owner could not see or stop a build.** A builder subagent worked for up to an hour in a context the owner never saw. In #11's probes every builder run either hid its work or stalled on a permission it could not ask for, and each cost a verbatim relay, a handover-notes check and a gate check. About half of "Implementing a change" existed only because a subagent cannot reach the owner.
- **Reading agents keep their value.** Their value is a fresh context that did not build the thing. A build session that ends with `result-checker` still has that independence, so a separate verify session would add a hand-off and no independence.
- **The pact could not tell how much rigour work needed.** It had two levels, "fits in one sentence" or the full four moves. "Build this issue" did not say which, and #11's interactive P1 run reasoned from an approved ticket that the work was "likely at move 3", skipped move 1 and dispatched a builder.
- **An issue with no tier label is at move 1.** A session never infers a later move from partial evidence. That closes the P1 gap. The first reply proposes a tier and stops, and the owner confirms in one word.
- **The risk floor keeps a quick label from skipping review.** Auth, secrets, data migrations and published work are always thorough. For other open decisions under a lower tier, the model names them once and then follows the owner, so the owner's judgement of the work wins.
- **The fit check catches a wrong setting before it costs anything.** The first line of every session says whether it fits the tier, model and effort setting, even when all fit, so its absence is itself a signal. #13's probe found that a Sonnet session can read its own effort and an Opus session could not, so the wording differs by model. The probe is mephistopheles4/the-pact#13.
- **Security builds run on Opus at high effort.** Other models' safety classifiers can refuse harmless defensive-security work partway through. This was the retired `security-builder`'s reason, and it stays.

## Status

Supersedes [ADR 0004](0004-gate-on-after-dispatch-needs.md) and [ADR 0005](0005-status-line-and-verbatim-relay.md). Updates [ADR 0009](0009-hand-over-user-only-skills.md): a main-session build is no longer only the owner's call, and `/implement` is no longer handed over first. The one-model-per-session rule is [ADR 0011](0011-one-model-per-session.md).

## How this was decided

- **2026-09-29** — Raised by the owner while probing the hand-over-the-trigger work (#11). Specified in mephistopheles4/the-pact#12 over two `plan-reviewer` rounds.
- **2026-09-30** — The effort-visibility probe (#13) chose the fit-line wording per model. The main session dropped the builders in #14 and wrote the tiers, phases and fit check in #15, building directly and ending with `result-checker`.