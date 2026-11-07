# An install relies on CI, not a host full run

Before an install, the owner's session no longer runs the gate's `full` suite on the host (#494). The install relies on `gate` and `gate-windows` passing on the commit it installs, which is a commit on `main`.

This amends [ADR 0104](0104-a-hook-holds-local-gate-runs-to-athanor.md) and the "What stays on the host" list of [ADR 0099](0099-local-gate-runs-go-through-athanor-by-default.md): `full` before an install leaves that list. The host still runs `changed` for a quick pick, and any run athanor can't do goes through `--host-fallback=<reason>`.

## Why

The host run was there because the install runs on the host's system and athanor's run skips the Windows-only cases. CI's `gate-windows` job runs those cases on every commit of `main`. On 2026-11-07 the host run repeated a green CI run on the same commit and took about 3 minutes.

## What it costs

Nothing in the rules or the installer checks that CI passed on the commit being installed, or that the checkout is `main`. The dry run warns only when the checkout is behind the last install. The owner decided not to build a check: it stays an accepted-risk candidate on #494.
