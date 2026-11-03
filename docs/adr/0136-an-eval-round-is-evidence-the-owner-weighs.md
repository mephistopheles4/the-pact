# An eval round is evidence the owner weighs

An eval round now counts as evidence about a rule, for the owner to weigh by reading its replies (#464 T7). This amends ADR 0119, which said a run is no evidence for a rule change. It stays a tool the owner runs, and nothing else about ADR 0119 changes: no CI job, hook or gate check runs an eval, and the limits stay in `evals/README.md` and the printed commands.

## Why

The owner's words: "testing wording is a lost cause, and we should rely on evals instead". #464 T1 cut the gate tests that pinned rule wording, and T2 to T5 cut the rules hard. Keeping "no evidence" would leave nothing that measures how a rule behaves.

## What a round is not

- **Not a gate.** No change waits on a round.
- **Not Test evidence.** A pass never stands in for the review at Test, and CI's two jobs stay the Test evidence.
- **Not a probe.** ADR 0045's probe rule is unchanged.
- **Not a verdict.** A Haiku run on one reply per arm raises a question for the owner, and every reply is still read by hand.

## Considered options

- **Keep the line, with evals only finding cut candidates.** Rejected: it contradicts relying on evals in place of the wording tests.
- **Make a round required for a rule change.** Not proposed: a cost paid on every change is what ended the practice tests (ADR 0045).

## Consequences

- A case's `with.txt` adds repo files to its with arm, since many of the rules now live in `claude/review.md`, the lens files and a repo's own rules. A case's with text can differ from what a session would have loaded at that moment, because a session reads those files when it needs them.
- A grader can go stale when its rule changes, and no check fails on it: T3 and T4 left two that did, and T7 rewrote one and retired the other. It misleads only the owner reading a round.
- Ten cases were added on the owner's word, to see whether the grading works before any more are written. The rest of the families sorted on #464 stay unbuilt, so most rules the wording tests covered have no case yet.
- No case added here has run.
