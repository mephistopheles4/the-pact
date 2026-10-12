# Every agent can be set, on any Claude Code model

A configuration's `agents` key may set the model and effort of every agent the pact ships, `scout` included. The model is any model Claude Code takes, and the effort is any of its five. The pact's defaults are suggestions from its research; people bring their own expertise to them, so nothing in the agents is locked (#262, spec addendum S15 to S20, the owner's decision in chat).

## What changed

- **The model is a shape, not a list.** A model is one plain word: a letter, then letters, digits, `.`, `_`, `:`, `/` or `-`, up to 128 characters. It is ASCII only, has no `---` and no `//`, doesn't end in `:`, and is not a YAML word such as `true` or `null`. The aliases `opus`, `sonnet`, `haiku`, `fable` and `inherit` fit it, as do full model IDs and provider IDs. A word of that shape can't add a key, a comment or a line to the frontmatter it is written into, so no setting adds a tool. The renderer, the install's `AGENT` line parser and the builder each check the shape, and tests hold their copies equal.
- **Five efforts:** `low`, `medium`, `high`, `xhigh` and `max`, the set Claude Code's subagent docs list.
- **`scout` ships unsealed from `claude/agents/`.** Its file leaves `familiars/` and loses its seal; its contract stays in `familiars/` as its record, as each lens's does (ADR 0017). It installs to the same live path. The renderer still refuses to set an agent that carries a seal, and none does now. The cost is the one the lenses already carry: no seal checks that the file still matches its contract.
- **The model is the person's own text.** The dry run's warnings and the review files carry it, and the dry run shows it in backticks. The installed rules file, which every session reads and may quote, names a model other than the five aliases only as "a custom model" (data-lens F1). A refusal names the agent and the rule broken, never the value (data-lens F3, adversarial-lens F4).
- **No setting is marked.** The "override, not security-tested" mark is gone: from the dry run's warnings, the rules file's notice and its sentence carrying the mark to reports, the review procedure and the builder page. The dry run lists each setting plainly, and the security-defaults line stays for the four parts only. The owner's decision in chat: the pact does not security-test settings it doesn't ship, and people may run what they want. This reverses the security pair's adversarial-lens F1 fix from the spec read, which had the security-defaults line name a lens off its default.
- **The builder's Models list.** Settings holds a list, starting as Opus, Sonnet, Haiku and Fable, that every model dropdown offers: the tiers, the sensitive route, the stages and the agents. A built-in name reaches an agent's file in lower case; anything else reaches it as typed. The builder file keeps the list under a `models` key. The Setups accordion left the page.

## Why

- **The owner's position.** The pact suggests and the person decides. A model list the gate fixed, and a locked `scout`, told people how to do their jobs.
- **A shape bounds what a list bounded.** The list's work was to keep a configuration from writing anything but a model into an agent's frontmatter. A plain word of the shape does the same, and the install's own checks still compare the rendered file line by line with the committed one.

## What was weighed

- **Free text for any ecosystem.** Rejected: the install writes Claude Code agent files, so another ecosystem needs its own installer. The shape takes every value Claude Code accepts.
- **A floor for the shell and web lenses, or a mark on their reports.** Rejected: the dry run lists the setting, and nothing more.
- **A seal that leaves out the model and effort lines.** Rejected for now: it is a grimoire change and changes what every familiar's seal promises. Moving `scout` beside the lenses needs neither.
- **A token-shape scan on the model value** (data-lens F2). Dismissed: the scan lives in `cross/`, which the install never stages. With the notice fix, a key-shaped model reaches only the person's own files and the dry run, which is shared by verdict and counts only.

Supersedes [ADR 0027](0027-every-pact-lens-is-configurable-with-opinionated-defaults.md) in part: `scout` is no longer locked, models and efforts are no longer the two-by-three list, and a security-set lens's setting is no longer marked.
