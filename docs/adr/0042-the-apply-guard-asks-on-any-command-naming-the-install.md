# The apply guard asks on any command that names the install

Superseded in part by [ADR 0049](0049-the-apply-guard-asks-on-an-apply-not-a-mention.md) (2026-10-10): the installer's rules ask on an apply, not a mention. The install-record and ruleset rules stand.

The "ask" rules no longer try to match each spelling of an apply. They ask on any shell command that names the install script, its runner, the old PowerShell installer or the install record. They also ask on a `gh` command that names rulesets or branch protection.

## What it covers

- **The rules,** one per name and tool:
  - `PowerShell(*install.mjs*)`, `PowerShell(*install-run.mjs*)`, `Bash(*nstall.mjs*)` and `Bash(*nstall-run.mjs*)`;
  - `PowerShell(*install.ps1*)` and `Bash(*nstall.ps1*)`, which keep the old installer behind a prompt for good, since a rollback runs an older commit's `install.ps1`;
  - `PowerShell(*.pact-install.json*)` and `Bash(*.pact-install.json*)`;
  - `PowerShell(*gh*ruleset*)`, `PowerShell(*gh*protection*)`, `Bash(*gh*uleset*)` and `Bash(*gh*rotection*)`, which guard the CI ruleset (ADR 0041).
  - Under the Bash tool, which matches case exactly, each rule drops its first letter, so a capitalised name still matches.
- **Seam A requires all twelve in the overlay,** whatever the settings allow-list says. The twelve spelling-by-spelling rules of ADR 0020 are retired from the overlay. They stay in each live `settings.json`, because the merge only adds rules, and are harmless there.
- **The gated clause keeps its shape** (option B). A session passes `--apply` only after the owner's go-ahead in chat. Only the flag's spelling changed, from `-Apply` to `--apply`, and seam A refuses the old text.
- **The habit risk is accepted.** A dry run names the script, so it prompts too, and an apply's prompt can look routine. The owner's words on #153's revision 4: "I'll accept the habit risk".
- **Person-typed applies** stay where no guard exists yet: a first install by prompt (`docs/install.md`). The cutover's first apply was handed back to a session by the owner in chat.

## The misses, accepted

- (a) a string built at run time that also hides the file name;
- (b) the script named without its file name: through a copy, a link, or a working folder of `gate` with the file named by a wildcard;
- (c) a session that imports the cores, or builds a fake stage folder, and copies by hand;
- (d) the file name in another letter case through the Bash tool, whose match is exact. On a case-insensitive file system, the same script runs.
- From #165's review:
  - the `gh` rules miss another HTTP client, or the CLI's token used outside a `gh` subcommand;
  - they miss the CLI's name in other capitals under Bash;
  - they miss the endpoint word in a separate statement from the CLI call;
  - the install-record rules miss a command that reaches the record through a wildcard.
- **The `gh` rules prompt falsely** on an ordinary command that holds the letters `gh` before the word, such as a commit message with "through" and then "protection".
- **An installed mod that answers permission checks** can approve a call an ask rule would prompt for, as Claude Code's permissions documentation says.

ADR 0020's miss (d), a splat after another separator, is closed: no rule looks at what follows the name. Exec options can't widen any miss, because the bootstrap and the runner refuse every one.

## Why

- **The Node command line has paths the old rules never saw.** PowerShell hands a variable, a splat or a subexpression to a native command as the exact word. Quotes inside the word, a bare parenthesised expression, or an environment variable after the stop-parsing token do the same. A rule per character class would keep chasing the shell (#153, S10).
- **Naming the file is the one thing every spelling shares,** short of a name built at run time.

## Supersedes

[ADR 0020](0020-the-apply-guard-catches-what-text-can.md). Its reasoning on what text matching can and can't do still holds.

## How this was decided

- **2026-10-08:** #153's spec, S10, D1 and D9, signed off in revision 6.
- **2026-10-09:** the new rules landed beside the old ones in #165, then replaced them at the cutover in #166, which folded in #167.
