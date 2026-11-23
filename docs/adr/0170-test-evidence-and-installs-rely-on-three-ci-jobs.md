# Test evidence and installs rely on three CI jobs

Supersedes the two-job rule of [ADR 0141](0141-an-install-relies-on-ci-not-a-host-full-run.md) (PACT-82, [spec 0003](../spec/0003-clef-macos.md) M7). The gate workflow gains `gate-macos` (macOS 15 arm64, Node 24, the full tier with `gate/tests/macos-skips.txt`). Test evidence and an install both rely on `gate`, `gate-macos` and `gate-windows` passing on the commit. Everything else in 0141 holds: no host `full` run before an install.

## Why

The pact installs on macOS too, and `clef` now runs there. Until now nothing ran the gate's tests on macOS, so its install tests, its cleaner and the keeper were untested on the system they would run on. The first `gate-macos` run found real platform differences: macOS sets `__CF_USER_TEXT_ENCODING` in every process it starts, ships bash 3.2, and Homebrew puts node beside git. These were fixed or listed by M7's fix-or-list rule.

## What it costs

A third job on every pull request, about as long as `gate-windows`. GitHub's macOS runners have no usable Metal, so `gate-macos` tests the CPU key and the stub server only. Until the owner makes `gate-macos` a required check, the threat model's ruleset line still names two jobs. A one-line PR changes it then.
