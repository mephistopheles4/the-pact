# The risk floor drops "anything published"

The gated `risk-floor` clause now reads: "Auth, secrets, crypto, input validation and data migrations are always thorough, whatever tier I name." "Anything published" is off the floor.

The places that carry the floor changed with it, in one change so seam A passes:

- **The gated clauses.** `gate/clauses/risk-floor.md`, the floor list quoted in `gate/clauses/no-skill-overrides.md`, and their blocks in `claude/CLAUDE.md`.
- **Two lenses.** `executability-lens`'s shared risk-floor block, and `good-enough-lens`'s restated list, with its contract.
- **The docs.** `docs/agents/triage-labels.md`, the README's tier section and FIG. 02, and the threat model's description of the floor.

**What does not change.** The gated `stop-and-escalate` clause keeps "the change is hard to reverse: auth, secrets, data migrations, or anything published". A stop is not a tier. Publishing stays hard to reverse, so a session still stops and asks before it publishes.

## Why

- **Nothing defined "published".** On a public repo, where every push and every comment is published, the phrase read as every change, so the floor sent all work to the thorough tier or was quietly ignored.
- **No recorded value.** No review or escape on record turned on publishing being on the floor (#189, S2).
- **A leak through a publish keeps three guards:** "secrets" on the floor, for keys and tokens; the gated `tracker-authors` line "Never post a secret or a personal detail"; and the publish stop. Personal data rests on the last two. The owner chose deletion over narrowing the phrase, so personal data is not added to the floor.

## Supersedes

- [ADR 0010](0010-build-in-the-main-session-with-process-tiers.md), in part: its risk floor named published work. The rest of 0010 holds.

## How this was decided

- **2026-10-10** — Decided in mephistopheles4/the-pact#189, S5 of the spec at revision 3, signed off by the owner in chat (option B, deletion). Built in #211. Proved by the security route and the full suite, under the owner's one-time waiver of probes for #189 ([ADR 0045](0045-agent-and-rule-changes-are-proved-by-review-not-by-probe.md)).
