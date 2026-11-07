# A change to the default takes no special route

AGENTS.md no longer has the bullet that sent a change to the pact's default through the sensitive route with the security pair (#484). A change to `builder/presets/level-3-full.json`, `builder/default-config/`, `builder/default-config.mjs`, the installer's choice of the default or `cloud-sessions/pin-floor` now takes the pact's tiers and sensitive route like any other change here, as [ADR 0072](0072-this-repo-has-no-security-route-of-its-own.md) says, with no exception.

This reverses the part of [ADR 0094](0094-the-pact-has-a-default-configuration-and-skill-sources.md) headed "A change to the default is sensitive work". The rest of 0094 stands: the default configuration, the installer's choice, the `skills` list. The three places that repeated the rule lose it too: the comment in `builder/default-config.mjs`, `docs/agents/changing-rules.md` and `CONTEXT.md`'s "Security-set lens" entry.

## Why

The owner: "I keep fighting it when I ask for edits and when I accept it, it creates lots of drift cuz Claude thinks we need to protect against everything and we end up over engineering." The rule forced the heaviest route on every touch of the default, whatever the change.

## What stays

- The sensitive route still applies where a change matches the sensitive-work list, and the owner can still ask for the security pair on any change.
- The gate's checks on the default stay: `--check` on a stale copy, the equality test between the page and the generator.
- The rule was not in the protected set, so this is not a spec change under [changing rules](../agents/changing-rules.md).

## What it costs

A change that loosens a security default of every install with no configuration is no longer sent to the security pair by this repo's own list. It reaches the pair only when the session or the owner picks it, and the dry run's security-defaults line still shows the owner what the default changed.

## How this was decided

- **2026-11-07** on #484, quick tier. Owner decision, from chat, relayed by backlog-head-chef.
