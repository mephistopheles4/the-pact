# The weekly usage limit can be turned off

#501, standard tier, built by pact-501.

`"usage-pause": false` in a user configuration turns the weekly limit off: the `usage-pause` part renders empty, the notice reads `Values set: usage-pause off.`, and the renderer's `VALUE` line reads `VALUE usage-pause off`. An absent key still means the default, 75%, and every configuration that sets a number, or nothing, renders byte for byte as before. The auto-compact window's off value, 0, still prints as `0`, not `off`.

Four checks are loosened, so this is a spec change, read by the spec pair and the security pair and approved on the issue:
- The config check takes `false` for `usage-pause` (`settingOk`).
- The project comparison skips a user whose limit is off, so any project number is taken.
- The install's home-render parser (`HOME_VALUE_RE`) accepts `off` for `usage-pause` only. The project parser stays strict, and a project can never turn the weekly limit off: the renderer refuses `false` with `project-looser`.
- The "Usage still holds" Guard, the session line's "also" and a project's "the line in my user rules" keep their text and change their meaning while the weekly limit is off, and "the call to cut or stop work over usage is mine" goes with the weekly line. [ADR 0142](../adr/0142-the-weekly-usage-limit-can-be-off.md) records it and amends 0137. The threat model's standing-goal line now reads "usage holds only as a rule, and only while a usage limit is set".

The dry run prints `WARN: the user configuration turns usage-pause off.` in place of the generic "sets usage-pause to" line. Scriptorium's Weekly limit row has the same On/Off chip as the session row and saves `false`; the page still reads no settings back from a saved file.

**Rolling back past this change:** a pact before it refuses `false` with `config-value`, so set `usage-pause` to a number, or remove it, in `~/.claude/pact/config.json` first.

The pact's default stays on at 75%, so `builder/default-config/` and `cloud-sessions/` did not change.

Left to the owner: the rendered session line and project line still say "the weekly rule" and "the line in my user rules" when the weekly limit is off, because the rules text was kept byte for byte; and the threat-model widening and the removable usage control wait on the owner's confirm in chat at merge. The owner's words came relayed by the lead session, and the proceed was recorded on the issue as relayed, not as an owner decision from chat.

## Record

- The ask: https://github.com/mephistopheles4/the-pact/issues/501
- Spec r2: https://github.com/mephistopheles4/the-pact/issues/501#issuecomment-6714575329
- Spec round 1: https://github.com/mephistopheles4/the-pact/issues/501#issuecomment-6714576947
- Spec round 2 (final): https://github.com/mephistopheles4/the-pact/issues/501#issuecomment-6714653043
- Spec r3: https://github.com/mephistopheles4/the-pact/issues/501#issuecomment-6714653384
- The relayed proceed: https://github.com/mephistopheles4/the-pact/issues/501#issuecomment-6714688394
