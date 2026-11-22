# The agent-identity switch installs gh-app

#603 (T2 of #599). Thorough tier, the sensitive route (auth). Amends [0074](0074-pact-tools-are-opt-in.md), whose "a `tools` list turns each one on" holds for every tool but `gh-app`.

## Decision

`gh-app`, the Windows GitHub App helper, is on the gate's tool list but never on the home configuration's `tools` list: that list refuses it (`config-tools`). The user setting `agent-identity`, off by default, installs it. On, the renderer adds `gh-app` to the `TOOLS` line, and the install owns two keys in `settings.json`'s `env`, `GIT_CONFIG_GLOBAL` and `GIT_TERMINAL_PROMPT`, and records them under `identityEnv`.

## Why

The helper makes every session's git push as a GitHub App the owner created, instead of as the owner. That is a change to who a session counts as, so it needs one switch the owner reads, not a name in a list that a shared builder file or a preset could carry. A project configuration may not set the switch either.

## Consequences

- **The install takes ownership of two `env` keys.** It refuses an owner-set one, never overwrites it, and removes only the recorded keys whose live value is unchanged.
- **The install checks the agent gitconfig whole,** with the Node it runs under, which must be an absolute path to a program called `node`, before any write. A dry run that turns the switch off skips the check.
- **A rollback takes the switch off first,** then the key out of the configuration, since an older installer refuses the key and ignores `identityEnv`. [Steps](../agent-identity.md#rolling-back).
- **The switch does not make git push as the app everywhere.** An askpass program, an SSH remote, a global git write, plain `gh` and the owner's own `author.*` settings still go around it. [The list](../agent-identity.md#what-it-doesnt-stop).
- The threat-model edit that spec section S10 names is T4's; the log of #602 says it lands no later than this switch.
