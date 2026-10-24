# Confirmed decisions run their own command

**2026-10-24.** The rules file made a session hand back a command only the owner may start, even one the owner had just confirmed in chat, such as an install's apply. On mobile that hand-back blocks the work. The owner chose the new wording in the lead's chat. Tier: quick.

## What was built (#379)

- **The rules file** (`claude/CLAUDE.md`, How Claude helps): once the owner confirms a decision in chat, the session carries it out, its command included; a command it can't run, such as one that needs the owner's sign-in or a password, it hands over in one line and stops. The decisions list is unchanged.
- **Regenerated:** `cloud-sessions/`; `builder/scriptorium.html` and `builder/default-config/` were already in step.
- **Unchanged:** the first-install prompt in `docs/install.md`, which runs before any pact is loaded.

## Decisions

- No ADR. Each decision still needs the owner's word in chat; only who types the command after it changes.
