# One model per session, split at phase boundaries

A session never switches model. Work is split into sessions at phase boundaries: triage, plan and build. Opus plans and reviews, and runs the whole quick tier. Sonnet runs the build sessions of standard and thorough work. Security builds run on Opus at high effort. At each boundary the session posts its result, state and open questions to the issue and ends with a line that starts the next session, with no compaction first. The issue suggests a model and effort for each phase, and the owner sets the effort when starting the session.

## Why

- **Changing model loses the prompt cache; changing effort keeps it.** Claude Code's docs say so for Opus 5.5 and Sonnet 5.5. A model switch mid-session makes the whole history be read again into a fresh cache.
- **A phase boundary is where the model should change.** Planning and review want the stronger model. A build from an approved plan is the bulk of the tokens and does not need it, so a session per phase lets each run on the model suited to it.
- **The issue carries the context, so compaction is not needed.** Compacting first would lose detail the next session can read from the issue.
- **A session cannot change its own effort.** So the issue suggests the setting and the owner applies it when the session starts.
- **Not `opusplan`.** Claude Code's mode that switches model inside a session is out of scope: it switches model inside a session and so has the cache cost above.

## How this was decided

- **2026-09-30** — Written in mephistopheles4/the-pact#12's spec and built in #15, alongside [ADR 0010](0010-build-in-the-main-session-with-process-tiers.md). It is a separate decision because it rests on different evidence, the per-model cache.