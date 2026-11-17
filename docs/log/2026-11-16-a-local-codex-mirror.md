# A local Codex mirror

The separate `codex/` target mirrors installed personal Pact inputs without
changing the Claude installer. It discovers the configured workflow's skills,
ports the rules and review procedure, produces native agents and explicit-only
command skills, and preserves existing Codex settings and unrelated hooks.
The cleaner keeps its upstream recovery and fresh-tag logic, with Codex worktree
and conservative active-thread discovery. The native hook adapter uses supported
event output and never grants permission or records hook trust.

Private plans bind code, sources, payload and destination bytes. Apply checks
the required CI workflow on the reviewed head, backs up changed files, verifies
writes and recovers a failed transaction. Rollback refuses later owner edits.
Fixtures exercise source drift, zero-write dry run, stale-plan refusal, native
hook output, retained worktrees, apply and recovery. Personal source files and
generated payloads are not part of this change. ADR 0158 records the target's
boundaries and retained native-runtime differences.

## Record

- The ask and plan: https://github.com/mephistopheles4/the-pact/issues/570
