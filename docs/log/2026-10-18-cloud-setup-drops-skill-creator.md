# The cloud setup drops the skill-creator plugin

**2026-10-18.** #183, from T3's live run. In the live environment claude.ai syncs a `skill-creator` skill into every session, beside the `skill-creator` plugin the cloud setup installed from the pinned marketplace. The two loaded side by side under separate prefixes. The owner chose to keep the synced one and remove the pinned one. Tier: quick.

## What was built

- **The plugin list.** `cloud-sessions/tpl-setup-head.sh` installs six plugins from `pact-pinned-plugins`, not seven: `skill-creator` is gone from the install list and from the list the Result names when the CLI is missing. The generated setup and wrapper are rebuilt, and the hand-check driver's unparsable-catalog case lists the same six.
- **Not changed.** R46 in the threat model still says "all seven plugins". That entry is an accepted risk, so its wording is the owner's to change.
- **Live.** A session started from an earlier snapshot may still hold the old `skill-creator` install, since the setup doesn't uninstall plugins it no longer lists. A fresh image doesn't install it.

## Record

- [T3 live run](https://github.com/mephistopheles4/the-pact/issues/183#issuecomment-6255647146)
- [C9 decision](https://github.com/mephistopheles4/the-pact/issues/183#issuecomment-6255698165)
