# The poster refuses no session id

**2026-10-23.** With the path rules gone, `id/session` was the poster's last refusal on ordinary text: every scratchpad path (#366) and every GitHub image-attachment link (#360) holds a UUID. The owner chose to remove the rule entirely. Tier: quick; not on the sensitive-work list.

## What was built (#366)

- **The poster** (`claude/tools/poster.mjs`) loses `id/session`, its patterns, and the pull-request trailer exception.
- **Its tests** (`gate/tests/poster.test.mjs`) lose the rule's four scan rows and the trailer's eight; one test shows a UUID, a `session_` id, a session link, a scratchpad path, an attachment link and the harness trailer post, in a body or a title, on an issue or a pull request, and it goes red against the old poster.
- **The rules file's poster bullet** (`gate/render-core.mjs`, held by `gate/tests/tools.test.mjs`) no longer names a session id among the refusals that keep a lens report local.
- **`docs/poster.md`**, **`docs/reference.md`** and **the threat model's R3** say the scan covers no session id.
- **Regenerated:** `cloud-sessions/`, already in step.

## Decisions

- [ADR 0100](../adr/0100-the-poster-refuses-no-session-id.md): the poster refuses no session id.

## Record

- [The issue](https://github.com/mephistopheles4/the-pact/issues/366), and [#360](https://github.com/mephistopheles4/the-pact/issues/360), which this closes too.
