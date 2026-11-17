# Local Codex mirror

This target mirrors an installed, customized Claude Pact into the same user's
Codex home. Personal inputs and generated payloads stay outside this repository.
It leaves the Claude installer and live Claude files unchanged.

Run Node 24 with `NODE_OPTIONS` cleared, from the repository root:

```powershell
$env:NODE_OPTIONS = $null
node codex/install.mjs dry-run --review-dir "$HOME/.codex/pact/reviews/my-review"
```

The adapter must be committed and unchanged. Both `gate` and `gate-windows`
must pass on that commit. Use a private review folder under
`~/.codex/pact/reviews/` or `~/.codex/visualizations/`, outside the checkout.
Show the owner the passing `dry-run.txt`. Only their separate approval permits
the printed apply arguments. Preparing this mirror never permits live apply.

Apply reconstructs the source and destination plan and refuses any difference
from its reviewed digest. It privately backs up changed files, verifies each
write and restores completed writes after a failed transaction. Keep the review
folder. Review the backup digest printed after apply before running
`rollback --review-dir <folder> --digest <backup-digest>`. Rollback refuses files
edited since installation.

The target maps stage models to Sol and retains source effort levels. Native
subagents inherit parent permissions; source tool lists remain instructions,
not Claude isolation. Commands become explicit-only skills. The builder kit
and source export format are retained; the builder does not apply a Codex
installation automatically. Missing source references remain reported.

Existing settings and unrelated hooks are preserved. New hooks require the
owner's review in **Settings > Hooks** before they run. The adapter never writes
trust state or bypasses review. Raw removal rules are a speed bump, not a
security boundary. Because the native pre-tool hook cannot ask for approval,
cleaner overrides are refused there and must be run directly by the owner.

The cleaner reuses the upstream Git, recovery and fresh-tag checks, selects
Codex-managed worktrees, and treats every unarchived chat as active. An unknown
or unavailable local thread-inventory schema refuses cleanup. No credentials,
authentication, or unrelated Claude plugins are migrated.
