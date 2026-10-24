# Confirmed decisions run their own command

**2026-10-24.** The rules file made a session hand back a command only the owner may start, even one the owner had just confirmed in chat, such as an install's apply. On mobile, where the owner can't run a command, that hand-back blocks the work. The owner chose the new wording in the lead's chat. Tier: quick.

## What was built (#379)

- **The rules file** (`claude/CLAUDE.md`, How Claude helps): once the owner confirms a decision in chat, the session carries it out, its command included; a command it can't run, such as one that needs the owner's sign-in or a password, it hands over in one line and stops. The decisions list is unchanged.
- **Regenerated:** `cloud-sessions/`. **Unaffected:** `builder/scriptorium.html` and `builder/default-config/`, which don't carry this sentence.
- **Unchanged:** the first-install prompt in `docs/install.md`, which runs before any pact is loaded.

## Decisions

- No ADR. Each decision still needs the owner's word in chat; only who types the command after it changes.
- "In chat" means the owner's own chat. A session under a lead hands a confirmed command to the lead, which runs it on the owner's word in its own chat (the owner, relayed by the lead).
- No change to the threat model: R22's safeguards hold, since an install still needs the owner's word in chat (the owner, relayed by the lead).
- Once this merges, the owner pastes `cloud-sessions/cloud-setup-wrapper.sh` into the cloud environment's setup field again.

## Record

- [The request](https://github.com/mephistopheles4/the-pact/issues/379), with the owner's wording.
- [Test review: conventions-lens and reader-lens](https://github.com/mephistopheles4/the-pact/issues/379#issuecomment-6386915584).
