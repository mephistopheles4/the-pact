# Local gate runs go through athanor by default

Local runs of the gate's tests go through athanor by default (#369): `athanor run fast` while building, and `athanor run`, the full suite, after a rebase or merge that brought in other work and after a final change set. This amends [ADR 0096](0096-the-gates-tests-run-locally-through-athanor.md), which kept the host as the default and athanor as an option.

## Why

- **Sessions skipped it.** With the host named as the default, sessions ran `changed` on the host and reached for athanor only when asked.
- **The owner wants it used by default** (in chat, 2026-10-23).

## What stays on the host

- **`full` before an install:** the install runs on the host's system, and athanor's run skips the Windows-only cases.
- **`changed`, for a quick pick:** athanor tests one synthetic commit with no base to diff against.
- **Any run when athanor can't run:** no Docker, or a copy older than `4121c28`, which the owner updates.

Test evidence is still CI's two jobs, and nothing from athanor is posted.
