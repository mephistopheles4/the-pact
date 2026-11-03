# Records are written only when due, and the push hold goes

A log entry is written only for a change to the pact text or the gate, and an ADR only when a decision reverses or constrains something (#464 T6). Logs older than a month fold into `docs/log/older.md`, and the log index is gone. `AGENTS.md`'s keep-in-step list keeps only what a test checks: the cloud copy, the builder page, the default configuration and the README's figures. The push hold under Test evidence is deleted (decision 576), which amends ADR 0095. The read of every commit before a push stays.

## Why

The owner's words: "i feel like deleting most of it to be honest, way too many rules", and "yes i want the minimal please". A rule no test checks and no session acts on only adds upkeep.

## Considered options

- **Generate the log index.** Rejected: log file names already carry the date and the topic.
- **Fold once and write no rule.** Rejected: the plan's "about 6 today" reads as recurring, and without the line the folder only grows.

## Consequences

- A push no longer waits for the security pair or the owner's word, including a diff that touches `.github/`, the lockdown test, `.claude/settings.json` or `.claude/hooks/`. A pull request runs the branch's own workflows as soon as it opens, and the hook runs in every session opened on the branch, both before anyone has read the change.
- Nothing now says a security escape's row carries only a placeholder until the fix ships. Escape rows and roster gaps go from the repo's rules and vocabulary, since review.md no longer defines them.
- `docs/install.md`, the README's prose, `docs/reference.md` and the threat model can drift from what they describe, with nothing asking a session to update them.
- A fold repoints links by hand, and no test checks them since T1 deleted the index checks. The first fold after this one takes in about 100 October logs.
- The PR template's checkbox still says "the docs/log entry and its ADRs are included", which reads loosely when no log is due.
