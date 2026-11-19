# Installing, and changing what installs

Read this before you install, roll back, change configuration, tools or a project install, or touch the builder page or the cloud copy. `AGENTS.md`'s "Installing" holds the rules; [install](../install.md) is the owner's how-to; this adds what a session needs.

- **Keep out of the backups.** A copy in `~/.claude/pact/backups/` can hold
  `settings.json` and its API keys, so a session never opens or searches one.
  It may read a backup's `manifest.json`, which holds no keys. An undo is the
  owner's, by hand ([Undo an apply](../install.md#undo-an-apply)).
- **Configuration:** the dry run's `Configuration:` entry in
  [install](../install.md#4-run-the-dry-run-and-read-it).
- **The auto-compact window:**
  [install](../install.md#the-auto-compact-window-and-its-hooks).
- **Probing a deny rule,** after the owner applies: only with a harmless
  call, such as `claude rm not-a-real-id` while the cleaner is on. Never probe
  `claude daemon stop` or `claude respawn --all`: if the rule misses, the probe
  ends every hosted session's turn. Report the result; the apply stays the
  owner's.
- **Project install.** `--project-folder <full path>` reads the project's
  `.claude/pact-config.json`, which may only make the pact stricter there, bar
  its own `qualities` and `costLimits` lists, and writes
  `.claude/rules/pact-project.md`. It is a dry run first, and `--apply` takes
  the project rules file's rendered hash, as at home.
- **A change to the installer:** dry-run it with `--claude-home` pointing at a
  throwaway folder, so a bug in the code under edit stays away from the real
  Claude home.
