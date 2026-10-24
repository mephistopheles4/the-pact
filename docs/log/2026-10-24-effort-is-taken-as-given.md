# Effort is taken as given

**2026-10-24.** In a field test, a session started at high effort reported itself below high and asked whether to restart, while its own status line read high throughout. A session sees no effort setting by name, so it guesses, and a wrong guess stops the work for the owner. #306 had already taken effort out of "Say a mismatch first", but sessions still checked their effort against the effort named by the tiers and the sensitive route. Tier: standard.

## What was built (#376)

- **The rules file** (`claude/CLAUDE.md`, How much checking): after "Keep one model for a whole session.", one sentence says the effort the owner or a lead set at the start, which the start prompt may state, is taken as given, and never judged, flagged or used to stop the work from the session's own sense of it.
- **The test:** the #306 test in `gate/tests/paths.test.mjs` also checks that this sentence follows the one-model line. The mismatch bullet still names no effort.
- **Regenerated:** `cloud-sessions/`. **Unaffected:** `builder/scriptorium.html` and `builder/default-config/`, which don't carry this line.

## Decisions

- The sentence sits on a line outside every builder block, so a configuration that replaces the tiers, the workflow or the sensitive route keeps it.
- The issue's ask that a session name its doubt about effort in one line was dropped: a session can never read its effort, so the line would show in every session (the owner, relayed by the lead).
- No ADR. ADR 0013 still sets which effort a tier starts at; this says who knows it.
- Once this merges, the owner pastes `cloud-sessions/cloud-setup-wrapper.sh` into the cloud environment's setup field again.

## Record

- [The issue and the spec](https://github.com/mephistopheles4/the-pact/issues/376#issuecomment-6387275198).
