# Deny rules on raw `claude stop` and `claude rm`

#439, standard tier with the security pair on the spec (round 2) and again at Test, built by pact-439-build. The proceed, the placement and the rule shape were the lead's picks under the owner's level-3 goal (decisions 407, 415, 429), not the owner's words.

The change to the gate:

- `claude rm *` joined the cleaner's deny rules: `CLEANER_DENY` holds eighteen rules, in `gate/install-core.mjs` and `gate/shared.mjs`. A record from before this change, holding the sixteen, gets the two added on the next install with the cleaner on.
- A new user setting, `session-stop-deny` (`true` or `false`, off by default), owns two rules, `Bash(claude stop *)` and `PowerShell(claude stop *)`, in `STOP_DENY` (both files, held equal by a test). `stopDenyPlan` mirrors `cleanerDenyPlan` over its own list; the install joins the two plans into one deny plan and keeps each record apart (`cleanerDeny`, `stopDeny`). `parseRecord` refuses a `stopDeny` that is not a list of strings with `record-not-pact`.
- The renderer takes the setting as a switch kind (`true` or `false` only), prints `VALUE session-stop-deny on` or `off`, and refuses it in a project configuration. The install's `HOME_VALUE_RE` takes only `on` or `off` for it. The overlay and the settings allow-list are unchanged, and so are the cloud copy and the default configuration.
- The builder shows the setting as a checkbox under Session stop, and a fold lists its two rules beside the cleaner's.
- New tests: the matcher-model test (a stated model of Claude Code's matcher, where each new rule matches its bad cases and none of the neighbours, and none holds a mid `*`), the renderer's switch kind and its project refusal, the install's `VALUE` line and record bad cases, and the install end to end for on, off, the owner's identical rule, and planted entries in either record.

Accepted gaps, as for the cleaner: a flag before the subcommand, a path-qualified or wrapped call and other spellings get past the rules. The classifier stands behind them unless an installed mod approves the call. Brigade's stop running outside permission rules, and whether Claude Code's `!` shell mode honours deny rules, are assumed and unmeasured; a field check after the owner's apply is written in `docs/agents/install.md`.

The threat model's "Removals lose local work" bullet names the `claude rm` rules, and a new bullet covers a raw stop getting past a speed bump. Both widen accepted classes, so the merge waits for the owner's confirm in chat.

The apply, and turning the switch on, are the owner's word in chat. This work stops at the dry run.

**Rolling back:** set `session-stop-deny` to `false` and turn the cleaner off, apply, then revert the PR and reinstall the reverted text through the dry run and the owner's apply.

## Record

- The ask: https://github.com/mephistopheles4/the-pact/issues/439
- Spec revision 3 and its build brief: https://github.com/mephistopheles4/the-pact/issues/439#issuecomment-6728098978 and https://github.com/mephistopheles4/the-pact/issues/439#issuecomment-6728103308
- The ADR: [0147](../adr/0147-deny-rules-come-only-behind-a-switch-that-owns-them.md)
