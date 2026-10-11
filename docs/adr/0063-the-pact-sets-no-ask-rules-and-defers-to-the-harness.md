# The pact sets no ask rules and defers to the harness

The settings overlay no longer sets `permissions.ask`. The pact's 52 ask rules, on the install's apply, its review folder, its record, rulesets and branch protection, and edits under `~/.claude/`, are retired. The install takes them out of a live `settings.json`, so the prompts stop after the next install. This supersedes [ADR 0041](0041-a-required-ci-check-guards-main.md), [ADR 0042](0042-the-apply-guard-asks-on-any-command-naming-the-install.md), [ADR 0049](0049-the-apply-guard-asks-on-an-apply-not-a-mention.md) and [ADR 0052](0052-the-ask-rules-no-longer-guard-a-rollback-to-install-ps1.md) in part (#265).

## What it covers

- **The overlay** keeps only what Claude Code doesn't set on its own: auto mode, the agent-teams flag, the model, output-style and usage settings. It holds no `permissions.ask`.
- **Seam A** no longer requires any ask rule. The settings allow-list holds no ask list, so an overlay that sets one fails as `settings-unlisted`. The banned keys, the mode pinned to `auto` and default-deny stand.
- **The install** holds the 56 retired rules as `RETIRED_ASK`: the 52, and the four broad installer rules ADR 0049 retired. Its merge drops each from the live ask list, matched exactly and case-sensitively, after the union it already did. A rule of the owner's own that only looks like one stays. The dry run prints one `- permissions.ask:` line per removal, from the pact's own constant, and a `NOTE:` with the count. The post-apply guard checks auto mode and that no retired rule is left.
- **The cloud copy** carries the new overlay. Its jq merge is unchanged: a cloud container starts from the image's settings, which hold no retired rule.

## What now stands in the rules' place

- **Edits under `~/.claude/` and to `~/.claude.json`:** Claude Code's protected paths. In auto mode an edit there goes to its classifier.
- **The install's apply:** auto mode's classifier, which reads the rules that make an install the owner's call, and the pinned `install-go-ahead` block in `AGENTS.md`. Nothing prompts. A lead's start prompt can clear a soft block. The threat model's R22 records it.
- **`gh` commands on rulesets or branch protection:** only the classifier's default soft blocks. The threat model's R24 and R27 record it.
- **A dry run with `--review-folder`:** its own folder checks, which refuse the Claude home and any `.claude` folder. It writes the owner's block text unprompted. R22 records it.

## Why

- **The owner asked for it.** "I don't even need the prompts anymore", and, on keeping a few edit asks, "We are trying to do what the harness already does again" (#265, from chat on 2026-10-11).
- **The rules misfired on mentions.** A `gh` command whose body said "ruleset" prompted the owner (#239's T1). The pact's own tests carried a model of Claude Code's matcher, the cost of a guard that matches text.
- **The pact states only what the harness can't.** Claude Code guards its own configuration, and auto mode's classifier weighs edits that loosen permissions or rewrite instructions.

## Not chosen

- **An auto-mode block rule (`autoMode.soft_deny`)** for the apply and for protection changes. It matches by meaning, but brings back a pact-made guard, needs seam A to admit a new key and the merge to union a new list, and a start prompt can still clear it. The owner chose not now.
- **A refusal of a review folder inside a git working tree.** It stops one careless path only, since the source blocks are readable anyway. The owner chose not now.
- **Removing the install.ps1 rules ADR 0052 lists.** That ADR finds them by search text, not exact strings, so the owner still removes them by hand.

## How this was decided

- **2026-10-11** in mephistopheles4/the-pact#265: the owner decided to drop the ask rules. On spec revision 2 the owner chose proceed, no block rule and no review-folder refusal. The security pair read the spec and the diff.
