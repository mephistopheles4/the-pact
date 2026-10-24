# Every lens runs in a pair, and a cost can limit the review

**2026-10-24.** A field test ran seven lenses at Test twice on a Standard change, and the owner wants every lens offered in a pair and a review capped at two pairs a round. The owner chose a cost row for the cap rather than an edit to the Workflow cells. Tier: standard, planned on Opus at medium, built on Opus. The owner waived in chat ADR 0094's sensitive route for this change and the security-pair read a roster change needs.

## What was built (#377)

- **The gatekeeper goes:** from the Lenses table, the default Test cell, `builder/parts.mjs`, four presets and three example blocks. The builder's half-of-a-pair warning loses its exception.
- **A cost no Enough names limits the review itself:** one sentence in the Cost limits prose (`claude/CLAUDE.md`, and `gate/render-core.mjs`'s fixed copy). The builder's warning for such a row is gone, Scriptorium shows its reach, and the dry run's notes follow.
- **The Lens pairs row** ships in the pact's text; Ultra Code carries the other three rows and stays uncapped.
- **`claude/review.md`:** a lens of a pair never runs or crosses alone, and a round is counted against review-wide costs.
- **Docs:** the README, `docs/reference.md`, `docs/install.md`, `docs/agents/install.md`, `CONTEXT.md` and FIG. 03.
- **The threat model's R30 and R31** say a cost row no quality names limits the review, and the dry run notes it; the owner accepted the class of path a project's configuration opens here, relayed by the lead session.
- **Regenerated:** `builder/scriptorium.html`, `builder/default-config/`, `cloud-sessions/` and the figures.

## Decisions

- [ADR 0101](../adr/0101-every-lens-runs-in-a-pair-and-a-cost-can-limit-the-review.md): every lens runs in a pair, and a cost can limit the review. Supersedes in part ADR 0080 and ADR 0079.

## Record

- [The issue](https://github.com/mephistopheles4/the-pact/issues/377).
- [The spec, revision 3](https://github.com/mephistopheles4/the-pact/issues/377#issuecomment-6385941228), and [the spec pair's review](https://github.com/mephistopheles4/the-pact/issues/377#issuecomment-6385902546) of revision 2.
- [The QA pair's review](https://github.com/mephistopheles4/the-pact/issues/377#issuecomment-6386232025) and [the standards pair's](https://github.com/mephistopheles4/the-pact/issues/377#issuecomment-6386247557) at Test.
- The follow-up round at Test: [the QA pair](https://github.com/mephistopheles4/the-pact/issues/377#issuecomment-6386395569) and [the standards pair](https://github.com/mephistopheles4/the-pact/issues/377#issuecomment-6386410371).
