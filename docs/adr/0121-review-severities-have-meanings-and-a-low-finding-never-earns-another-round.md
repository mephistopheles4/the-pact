# Review severities have meanings, and a low finding never earns another round

`claude/review.md` now says what `high`, `medium` and `low` mean, by what happens to the finding (#421):

- **`high`** means the work can't be accepted as it stands. A high finding names where it sits and gives evidence. A high that isn't a security or `security?` finding blocks only with both. One without them comes to the owner as `open`, and the sorting session lowers a verdict that rests only on such highs, marked and never `auto`.
- **`medium`** should be fixed in the change, or brought to the owner, and never blocks.
- **`low`** can wait, as a note or a follow-up issue. A low `new` or `updated` finding that isn't security is `noted (auto)` unless its fix is mechanical and lands before the closing read, and a low finding never calls for a round on its own. Until now only an `unchanged` finding could be noted.

This amends two rules of [ADR 0090](0090-lens-findings-carry-their-state-against-the-base.md): the verdict's condition, where a high `new` or `updated` finding now blocks only with its place and evidence, and `noted`, which now also covers a low `new` or `updated` finding.

Each lens's own scale applies these meanings to its question; a lens brought from elsewhere uses them as given. `behaviour-lens`'s scale now reads `high`, `medium` and `low` like the others.

The file also gains a skip list and a home for a repo's own review rules:

- **The skip list.** A lens reports nothing on content that only regenerates (a file marked generated with its generator, whose source changes in the same diff) or only re-locks (a lockfile change following a manifest change). It still reads it, and still reports output that doesn't follow its source. Nothing is skipped by the security pair, and nothing the project's agent instructions say to read closely is skipped by any lens.
- **Review rules.** A "Review rules" section of the project's `AGENTS.md`, else `CLAUDE.md`, read at the base, goes to every lens with the Qualities rows. It can take items off the skip list, add generated paths with their generator, and add checks. It never lifts the security pair's rules, the security bar, the close-read exception or the read before posting.

## Why

Several changes on 2026-10-25 went two or three Test rounds without settling, each round finding a new layer of low findings. A comparison with Anthropic's guidance for its managed Code Review service, which reads a repo-root `REVIEW.md`, turned up the four gaps. The pact doesn't use that file; its ideas fit the lens procedure.

Every lens file already calibrated its own levels, so the new text gives the shared meaning and leaves each lens's calibration as the refinement. Restating the per-lens text in the procedure would make two copies of one rule.

## What stays

- The security pair's blocking rule, the security bar and the protected set.
- Rounds, scoped follow-ups, the closing read, threat-model sorting, accepted risks and cost limits.
- The close read that `docs/threat-model.md` names for `cloud-sessions/` and `.claude/`. The spec pair found the first draft's skip list would have reached `cloud-sessions/` before this repo's own rules move under a "Review rules" heading. The close-read exception keeps that defence whole.

## What was weighed

- **Skipping what CI already checks.** Left out. It would cut across `integrity-lens`'s question, whether the checks behind a pass can fail (the lead's pick).
- **No pact skip defaults, each repo naming its own.** Not taken (q2). The two defaults are safe with the close-read exception, and a repo can change them.
- **The evidence rule on security findings too.** Not taken (q3). It would loosen the security bar and bring in the security pair.
- **Moving this repo's "Reviewing a change here" under "Review rules" now.** Deferred to a follow-up (q4).

## How this was decided

- **2026-10-25.** Decided on #421, spec revision 2, standard tier. q1 to q5 were answered by the owner ("all a") in the lead's chat and relayed by the lead, head-chef-field-test. q5, noting a new low finding, was the lead's addition, which the owner saw in that list. The CI-checks skip was left out on the lead's pick under the owner's standing instruction. The owner signed off revision 2 and answered q6 to q8 with /make-it-so on the lead's recommendation, relayed: no security pair (q6), the close-read exception and the marked-generator test (q7), and repo rules adding only generated paths with their generator (q8).
