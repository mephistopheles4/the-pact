# A hook holds local gate runs to athanor

A PreToolUse hook in this repo's `.claude/settings.json` refuses a host run of the gate's tests at the `fast` or `full` tier while `athanor --version` works (#383). The host cases ADR 0099 keeps, `full` before an install and any run athanor can't do, go through `--host-fallback=<reason>`, which the runner prints. `changed` and `--list` pass as they are. This enforces [ADR 0099](0099-local-gate-runs-go-through-athanor-by-default.md).

## Why

- **The written rule was skipped.** On 2026-10-24 two sessions ran on the host without a reason, and nothing showed it.
- **The owner wants it enforced** (relayed, 2026-10-24), as grimoire's issue 377 did for its own check.

## How

- **A nudge, not a control.** It fails open on any error, gives no explicit allow, and is silent wherever athanor is missing, cloud sessions and CI included. Its refusal is fixed text that says the way out.
- **The fallback is named, not detected.** Every athanor build reports `0.1.0`, so the probe can't tell an old copy or a stopped Docker from a working one; the session names its reason instead, quoted so PowerShell keeps it one argument, and says in its report that it used the fallback.
- **The reason is plain words.** It can reach a posted record, so the runner takes at most 80 letters, digits, spaces and basic punctuation, no word over 24, and refuses anything else without echoing it (Test, data-lens D1).
- **The hook is code that runs on load.** A checkout or pull that changes its script runs it on the next shell call, before the permission check, so the checkout rule names it and a push that touches `.claude/settings.json` or `.claude/hooks/` waits for the security pair's read, as one touching `.github/` does (Test, adversarial-lens F1).
- **It lives outside `gate/`,** which the install stages, so the hook never installs.
- **One tracked settings file.** `.gitignore` ignores every `settings.json` to keep keys out of the repo; it lets out `/.claude/settings.json` alone, and a gate test holds that file to the `hooks` key.

## Limits

- A bare `node --test` passes, as it skips the runner and its cap (ADR 0029).
- It adds a Node start, about a tenth of a second on the Windows host, to every shell call in this repo.
