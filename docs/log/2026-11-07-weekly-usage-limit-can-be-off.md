# The weekly usage limit can be turned off

#501, standard tier, built by pact-501. The owner's words came relayed by the lead session ("Yes, all three" for the tier, "Yes, proceed" for spec r3); the proceed was recorded on the issue as relayed, not as an owner decision from chat.

`"usage-pause": false` in a user configuration turns the weekly limit off: the `usage-pause` part renders empty, the notice reads `Values set: usage-pause off.`, and the renderer's `VALUE` line reads `VALUE usage-pause off`. An absent key still means the default, 75%, and every configuration that sets a number, or nothing, renders byte for byte as before. The auto-compact window keeps printing `0`.

Two spec changes, both read by the spec pair and the security pair and approved on the issue:
- The install's home-render parser (`HOME_VALUE_RE`) accepts `off` for `usage-pause` only. The project-render parser stays strict, and a project can never turn the weekly limit off: the renderer refuses `false` with `project-looser`, and takes any number when the user's limit is off.
- The "Usage still holds" Guard, the session line's "also" and "the call ... is mine" keep their text and change their meaning while the weekly limit is off; `docs/rule-reasons.md` records it. The threat model's standing-goal line now reads "usage holds only as a rule, and only while a usage limit is set".

The dry run prints `WARN: the user configuration turns usage-pause off.` in place of the generic "sets usage-pause to" line. Scriptorium's Weekly limit row has the same On/Off chip as the session row and saves `false`; the page still reads no settings back from a saved file.

**Rolling back past this change:** a pact before it refuses `false` with `config-value`, so set `usage-pause` to a number, or remove it, in `~/.claude/pact/config.json` first.

The owner's own configuration is unchanged until they set `false`; the pact's default stays on at 75%, so `builder/default-config/` and `cloud-sessions/` did not change.

## Record

- The ask, the spec (r3) and the review rounds: https://github.com/mephistopheles4/the-pact/issues/501
