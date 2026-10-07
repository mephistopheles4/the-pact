# A sign case scores the sign in its own finding

A practice case for one of `executability-lens`'s human-in-the-loop signs passes only when a `high` finding on a section where the sign is planted names the sign in its own bullet. Text anywhere else in the report never counts.

- **The bullet form is pinned.** The bullet sits at the start of its line, opens with `- S3 (F1):`, and its text then opens with `sign 3:` (or `no Needs a human section:`). The colon is part of it. Only indented lines continue a bullet. A finding id with two bullets fails.
- **The scorer rule is `bulletOn`,** in `gate/tests/practice-score.mjs`.
- **The rest of the plant is not policed.** A sign case does not require its other sections to draw no findings.

## Why

- **The words alone proved nothing.** As first written, a case passed any report with some `high` finding and the sign's number anywhere in the text. A report that missed the planted sign could still pass. `integrity-lens` and `security-reviewer` both found this at move 4 on #99.
- **"Every other section stays quiet" was an arms race.** That rule was added to close the gap. But a lens told to report every readiness gap kept finding new ones in the planted specs, such as an unchecked deadline, an install with no done-check, or PowerShell on Linux. Each review round found more. A planted spec is never perfect, so a faithful lens could fail its own security set.
- **Tying the sign to its own finding discriminates without that.** The owner chose (2026-10-07): drop the quiet-sections rule, and tighten the bullet rule instead. Each loophole the review rounds found has a ready-made bad report. Each such report passes the earlier scorer and fails this one, for its own reason.
- **It stays above the spec's bar.** #35 revision 7 asks only that each sign case is "scored `blocking`".

## How this was decided

- **2026-10-07** — Decided in mephistopheles4/the-pact#99, before any security-set run. The rounds are in comments 6035861023, 6036068766, 6036403325 and 6036659730 (verbatim reads), and the stops in 6036070433 and 6036403609. The owner's choice, made in chat after round 3, is recorded in commit `7b32b1d` and in comment 6036724781, which also records the convergence at round 4.
