# Next lines for usage refusals, and a nudge worded as a fact

PACT-52. The owner asked whether the pact's refusal exit codes and wording follow Claude Code's hook guidance and common command-line practice. The comparison found the hooks in line with the hooks reference and five small gaps. Two are fixed here; the other three stay as notes on the issue.

The poster now prints a `NEXT:` line, straight above `RESULT:` (after any `NOTE:` line on refusals left unlisted), for each usage, field, file, text, fence, link and table rule it refuses, as it did for the edit, scan and intent rules before (PACT-48). The `owner/` and `as/` rules have none: their `where` names the login or the repo to fix. A missing `--post` beside an unknown option gets the one old-command line, not two. The cleaner prints one for each usage rule it refuses. Each line is fixed words and names no argument, path or value. Each rule has a test that trips it through the poster or the cleaner and sees its line, and a test reads the rule table in `docs/poster.md` so a new rule with no line and no case fails.

The auto-compact nudge was an order ("Update your hand-off file now"). The hooks reference asks for factual statements in `additionalContext`, since text framed as an out-of-band command can trigger Claude's prompt-injection defences. It now says the hand-off file is how the session's place survives compaction, and is due an update, with what the file holds. The cloud copy carries the same hook, so `cloud-sessions/gen.mjs` was run. Once this merges, the owner pastes `cloud-sessions/cloud-setup-wrapper.sh` into the cloud environment's setup field again.

ADR 0082 said exits 0, 2 and 4 print no `NEXT:` line; [0166](../adr/0166-exit-2-prints-a-next-line-for-each-rule-it-refused.md) amends it.

Left as notes on the issue: `RESULT: refused` is exit 2 in the poster and cleaner but exit 1 in the installer, the tracker checker and the builder (callers read the codes); the tools print to different streams; both hooks fail open and silent on an error (their comments say they never block).

**Rolling back:** revert the merge, rerun `node cloud-sessions/gen.mjs` and reinstall from the dry run; the refusals then lose their `NEXT:` lines and the nudge goes back to its old wording. Paste the regenerated `cloud-sessions/cloud-setup-wrapper.sh` into the cloud environment's setup field again.

## Record

- The ticket: PACT-52 on Linear.
