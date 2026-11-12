# The threat model is boundaries first and capped at 3,000 words

#544, ticket 2 of #542, thorough tier. `docs/threat-model.md` is rewritten to the template in spec revision 3: the guide's title paragraph, then four boundaries (Text into a session, Code that runs, Merges and installs, What leaves the machine), each with what crosses it, its controls by source and when each doesn't hold, and its residual. Scope, nine accepted threat classes of one sentence each, a quadrant chart and the open issues follow. The file drops its provenance.

Local copies on disk, Removals lose local work, A raw stop gets past a speed bump and A compromised machine or sandbox leave as classes. The machine line in Scope covers the first and last, which includes the private notes folder the guide names. The cleaner's checks and the stop and removal deny rules stay, named as controls on Text into a session with their caveats, and `AGENTS.md` says that loosening them is a spec change. Safety stays covered by the pact's Safety quality.

`gate/tests/threat-model-cap.test.mjs` fails the file above 3,000 words, counted as the rule budget counts, and is seen to fail on a copy padded one word past the cap. `docs/rule-reasons.md`, `docs/install.md`, `docs/agents/issue-tracker.md` and `evals/cases/threat-new/prompt.md` follow the new class names; the tracker doc gains a pointer to the threat model.

Test round 1 and 2's findings, and the security pair's further read, are folded in: pact rules sit under each boundary's Residual, each "Also accepted" line names its class, the machine line keeps its conditions, the poster is described by what it refuses, a failed control comes to the owner on every boundary, and what a session sends by fetch, search or connector call is covered by the harness. The six 2026-10-11 logs are folded into `docs/log/older.md`, as the rule for a session that writes a log says.

**Rolling back:** revert the PR. No install is needed: no `claude/` file changed.

## Record

- The ask: https://github.com/mephistopheles4/the-pact/issues/544
- The approved plan, spec revision 3: https://github.com/mephistopheles4/the-pact/issues/542#issuecomment-6823747749
- Its approval: https://github.com/mephistopheles4/the-pact/issues/542#issuecomment-6823760046
- The mapping of the old model onto the new: https://github.com/mephistopheles4/the-pact/issues/544#issuecomment-6826622324
- Test round 1: https://github.com/mephistopheles4/the-pact/issues/544#issuecomment-6827239035, reports https://github.com/mephistopheles4/the-pact/issues/544#issuecomment-6827280459
- Test round 2, final: https://github.com/mephistopheles4/the-pact/issues/544#issuecomment-6827313666, reports https://github.com/mephistopheles4/the-pact/issues/544#issuecomment-6827314570
- The security pair's further read: https://github.com/mephistopheles4/the-pact/issues/544#issuecomment-6827331771, reports https://github.com/mephistopheles4/the-pact/issues/544#issuecomment-6827332782
